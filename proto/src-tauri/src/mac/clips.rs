//! macOS : clips vidéo. ScreenCaptureKit filme le cadre du jeu (data/cadre-jeu.txt, le même que celui de
//! l'émulateur) avec le son du Mac ; ffmpeg l'encode avec la puce du Mac (VideoToolbox) en continu dans un
//! tampon de morceaux de 2 s, comme sous Windows. Un clip garde les dernières secondes.
//! Il faut l'autorisation « Enregistrement de l'écran » (déjà demandée pour filmer les émulateurs).
use crate::plateforme::SansFenetre;
use screencapturekit::cv::CVPixelBufferLockFlags;
use screencapturekit::prelude::*;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
const MORCEAU: u64 = 2;

/// Écran principal seulement (DS, 3DS) : sa place dans la zone du jeu, en fractions (x, y, largeur, hauteur).
pub static ZONE: Mutex<Option<[f64; 4]>> = Mutex::new(None);

/// Micro à mêler au son des clips : None = pas de micro, Some(None) = celui du Mac, Some(Some(nom)) = celui-là.
pub static MICRO: Mutex<Option<Option<String>>> = Mutex::new(None);

/// Le micro, en mono ramené à 48 kHz, dans `vers` (une demi-seconde au plus en attente).
fn micro(vers: std::sync::mpsc::SyncSender<Vec<f32>>) -> Option<cpal::Stream> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    let choix = MICRO.lock().unwrap().clone()?;
    let host = cpal::default_host();
    let dev = choix.and_then(|n| host.input_devices().ok()?.find(|d| d.name().is_ok_and(|x| x == n))).or_else(|| host.default_input_device())?;
    let cfg = dev.default_input_config().ok()?;
    let canaux = cfg.channels() as usize;
    let pas = cfg.sample_rate().0 as f64 / 48000.0;
    let mut pos = 0.0f64;
    let flux = dev.build_input_stream(
        &cfg.config(),
        move |d: &[f32], _: &_| {
            let mut sortie = Vec::with_capacity(d.len() / canaux.max(1) + 1);
            for trame in d.chunks(canaux.max(1)) {
                pos += 1.0;
                while pos >= pas {
                    pos -= pas;
                    sortie.push(trame.iter().sum::<f32>() / canaux as f32);
                }
            }
            let _ = vers.try_send(sortie);
        },
        |_| {},
        None,
    ).ok()?;
    flux.play().ok()?;
    Some(flux)
}

struct Enregistrement {
    flux: SCStream,
    son: Option<SCStream>,
    ffmpeg: Child,
    stop: Arc<AtomicBool>,
    secs: u64,
}
static EN_COURS: Mutex<Option<Enregistrement>> = Mutex::new(None);

/// Celui d'En Local (emu/ffmpeg), sinon celui de Homebrew.
fn ffmpeg() -> Option<String> {
    [format!("{}/emu/ffmpeg/ffmpeg", crate::root()), "/opt/homebrew/bin/ffmpeg".into(), "/usr/local/bin/ffmpeg".into()]
        .into_iter()
        .find(|p| std::path::Path::new(p).exists())
}
fn tampon() -> PathBuf {
    PathBuf::from(format!("{}/data/clips-tampon", crate::root()))
}

/// Zone du jeu, en points depuis le haut de l'écran principal (sans le décor autour, la même pour tous les
/// émulateurs).
fn cadre() -> Option<(f64, f64, f64, f64)> {
    let (x, y, w, h) = crate::embed::rect_jeu(0);
    (w >= 80 && h >= 60).then_some((x as f64, y as f64, w as f64, h as f64))
}

/// Dans la zone du jeu, l'écran principal si demandé (DS, 3DS), rogné de 2 points de chaque côté : le
/// placement de l'émulateur arrondit au point près, et sans ça un liseré de l'autre écran ou du fond entre.
fn ecran_principal((x, y, w, h): (f64, f64, f64, f64)) -> (f64, f64, f64, f64) {
    match *ZONE.lock().unwrap() {
        Some([fx, fy, fw, fh]) => (x + fx * w + 2.0, y + fy * h + 2.0, fw * w - 4.0, fh * h - 4.0),
        None => (x, y, w, h),
    }
}

/// Taille de la vidéo en pixels : le cadre en Retina, 1920×1080 au plus, dimensions paires.
fn taille(w: f64, h: f64) -> (u32, u32) {
    let r = (1920.0 / (w * 2.0)).min(1080.0 / (h * 2.0)).min(1.0);
    (((w * 2.0 * r) as u32) & !1, ((h * 2.0 * r) as u32) & !1)
}

/// Débit de la puce du Mac : haute (≈ 350 Mo pour 2 min), moyenne (moitié), legere (quart, 30 images/s).
fn qualite(q: &str) -> (&'static str, u32) {
    match q {
        "legere" => ("6M", 30),
        "moyenne" => ("12M", 60),
        _ => ("25M", 60),
    }
}

/// Image NV12 (YCbCr 4:2:0, deux plans) recopiée sans les marges de fin de ligne.
fn nv12(sample: &CMSampleBuffer, w: usize, h: usize) -> Option<Vec<u8>> {
    let pb = sample.pixel_buffer()?;
    let g = pb.lock(CVPixelBufferLockFlags::READ_ONLY).ok()?;
    if g.plane_count() < 2 || g.width_of_plane(0) != w || g.height_of_plane(0) != h {
        return None;
    }
    let mut out = Vec::with_capacity(w * h * 3 / 2);
    for (plan, lignes) in [(0, h), (1, h / 2)] {
        for y in 0..lignes {
            out.extend_from_slice(unsafe { g.plane_row(plan, y) }?.get(..w)?);
        }
    }
    Some(out)
}

struct Sortie {
    image: Arc<Mutex<Option<Arc<Vec<u8>>>>>,
    son: std::sync::mpsc::SyncSender<Vec<f32>>,
    w: usize,
    h: usize,
}
impl SCStreamOutputTrait for Sortie {
    fn did_output_sample_buffer(&self, sample: CMSampleBuffer, genre: SCStreamOutputType) {
        match genre {
            SCStreamOutputType::Screen => {
                if let Some(i) = nv12(&sample, self.w, self.h) {
                    *self.image.lock().unwrap() = Some(Arc::new(i));
                }
            }
            SCStreamOutputType::Audio => {
                let Ok(liste) = sample.audio_buffer_list() else { return };
                let canaux: Vec<&[u8]> = liste.iter().map(|b| b.data()).collect();
                let _ = self.son.try_send(entrelace(&canaux));
            }
            _ => {}
        }
    }
}

/// Échantillons de macOS (un tampon par canal, ou déjà entrelacés) en stéréo entrelacée.
fn entrelace(canaux: &[&[u8]]) -> Vec<f32> {
    let f = |c: &[u8]| c.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect::<Vec<f32>>();
    match canaux {
        [g, d, ..] => f(g).into_iter().zip(f(d)).flat_map(|(a, b)| [a, b]).collect(),
        [m] => f(m),
        [] => Vec::new(),
    }
}

/// Images vers ffmpeg à cadence fixe : la dernière reçue est répétée quand l'écran ne bouge pas
/// (macOS n'envoie que les images qui changent), du noir avant la première.
fn video(mut vers: std::process::ChildStdin, image: Arc<Mutex<Option<Arc<Vec<u8>>>>>, stop: Arc<AtomicBool>, fps: u32, w: usize, h: usize) {
    let mut noir = vec![16u8; w * h];
    noir.resize(w * h * 3 / 2, 128);
    let debut = Instant::now();
    let mut ecrites: u64 = 0;
    while !stop.load(Ordering::Relaxed) {
        let dues = (debut.elapsed().as_secs_f64() * fps as f64) as u64;
        // Plus d'une seconde de retard (Mac en veille…) : on repart de maintenant.
        if dues > ecrites + fps as u64 {
            ecrites = dues - 1;
        }
        while ecrites < dues {
            // Partagée, pas recopiée : une image de 3 Mo, jusqu'à 60 fois par seconde.
            let i = image.lock().unwrap().clone();
            if vers.write_all(i.as_ref().map_or(&noir[..], |v| &v[..])).is_err() {
                return;
            }
            ecrites += 1;
        }
        std::thread::sleep(Duration::from_millis(4));
    }
}

/// Son vers ffmpeg (48 kHz stéréo) à cadence fixe, avec du silence quand rien ne joue, et ta voix
/// mêlée par-dessus si le micro est demandé.
fn son(fifo: PathBuf, recu: std::sync::mpsc::Receiver<Vec<f32>>, stop: Arc<AtomicBool>) {
    // S'ouvre quand ffmpeg ouvre sa deuxième entrée.
    let Ok(mut vers) = std::fs::OpenOptions::new().write(true).open(&fifo) else { return };
    let (tx_micro, rx_micro) = std::sync::mpsc::sync_channel::<Vec<f32>>(256);
    let flux_micro = micro(tx_micro);
    let mut voix: std::collections::VecDeque<f32> = std::collections::VecDeque::new();
    let debut = Instant::now();
    let mut ecrits: u64 = 0;
    let mut attente: Vec<f32> = Vec::new();
    while !stop.load(Ordering::Relaxed) {
        std::thread::sleep(Duration::from_millis(10));
        while let Ok(b) = recu.try_recv() {
            attente.extend_from_slice(&b);
        }
        let du = (debut.elapsed().as_secs_f64() * 48000.0) as u64 * 2;
        let n = du.saturating_sub(ecrits) as usize;
        let mut bloc: Vec<f32> = attente.drain(..n.min(attente.len())).collect();
        bloc.resize(n, 0.0);
        // Plus d'une demi-seconde de retard : on l'oublie.
        if attente.len() > 48000 {
            attente.clear();
        }
        // Ta voix, mêlée aux deux canaux (sans saturer).
        if flux_micro.is_some() {
            while let Ok(b) = rx_micro.try_recv() {
                voix.extend(b);
            }
            for trame in bloc.chunks_mut(2) {
                let v = voix.pop_front().unwrap_or(0.0);
                for s in trame {
                    *s = (*s + v).clamp(-1.0, 1.0);
                }
            }
            let trop = voix.len().saturating_sub(24000);
            voix.drain(..trop);
        }
        let octets: Vec<u8> = bloc.iter().flat_map(|s| s.to_le_bytes()).collect();
        if vers.write_all(&octets).is_err() {
            return;
        }
        ecrits += n as u64;
    }
}

/// Démarre le tampon au début de la partie (le cadre du jeu est attendu jusqu'à 10 s).
pub fn demarrer(_parent: isize, secs: u64, q: String) {
    arreter();
    let secs = secs.clamp(15, 120);
    let Some(ff) = ffmpeg() else { return crate::journal_rust("clips : ffmpeg introuvable") };
    let fin = Instant::now() + Duration::from_secs(10);
    // Le format du jeu arrive juste après le lancement : la zone est prise une fois stable.
    std::thread::sleep(Duration::from_millis(1500));
    let zone = loop {
        if let Some(z) = cadre() {
            break z;
        }
        if Instant::now() > fin {
            return crate::journal_rust("clips : cadre du jeu introuvable");
        }
        std::thread::sleep(Duration::from_millis(300));
    };
    if let Err(e) = lancer(&ff, zone, secs, &q) {
        crate::journal_rust(&format!("clips : {e}"));
    }
}

fn lancer(ff: &str, jeu: (f64, f64, f64, f64), secs: u64, q: &str) -> Result<(), String> {
    let dir = tampon();
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let fifo = dir.join("son.fifo");
    if !Command::new("mkfifo").arg(&fifo).status().is_ok_and(|s| s.success()) {
        return Err("tube du son impossible".into());
    }
    let (debit, fps) = qualite(q);

    let contenu = SCShareableContent::get().map_err(|e| format!("{e:?} (autorise En Local dans Réglages Système, Enregistrement de l'écran)"))?;
    // Une seule fenêtre filmée, celle où le jeu s'affiche : l'émulateur posé dans le cadre, sinon En Local
    // (DS, consoles dessinées par l'interface). Bien plus léger pour macOS que de recomposer l'écran (le jeu
    // ramait), et rien d'autre posé par-dessus n'est filmé.
    let plus_grande = |pid: u32| {
        contenu.windows().into_iter()
            .filter(|f| f.owning_application().is_some_and(|a| a.process_id() as u32 == pid) && f.is_on_screen() && f.frame().size.width >= 100.0 && f.frame().size.height >= 100.0)
            .max_by(|a, b| (a.frame().size.width * a.frame().size.height).total_cmp(&(b.frame().size.width * b.frame().size.height)))
    };
    let emu = crate::embed::pid_jeu().filter(|_| crate::embed::direct()).and_then(plus_grande);
    let (fenetre, f) = match emu {
        // La fenêtre de l'émulateur est le jeu : ses vraies mesures, plus justes que le cadre arrondi.
        Some(e) => { let f = e.frame(); (e, (f.origin.x, f.origin.y, f.size.width, f.size.height)) }
        None => (plus_grande(std::process::id()).ok_or("fenêtre du jeu introuvable")?, jeu),
    };
    let (x, y, w, h) = ecran_principal(f);
    let f = fenetre.frame();
    let (pw, ph) = taille(w, h);
    // La zone du jeu, ramenée dans la fenêtre (même repère : points, depuis le haut de l'écran principal).
    let (sx, sy) = ((x - f.origin.x).max(0.0), (y - f.origin.y).max(0.0));
    let (sw, sh) = (w.min(f.size.width - sx), h.min(f.size.height - sy));
    let filtre = SCContentFilter::create().with_window(&fenetre).build().map_err(|e| format!("{e:?}"))?;
    let config = SCStreamConfiguration::new()
        .with_width(pw)
        .with_height(ph)
        .with_source_rect(screencapturekit::cg::CGRect::new(sx, sy, sw, sh))
        .with_pixel_format(PixelFormat::YCbCr_420v)
        .with_shows_cursor(false)
        .with_minimum_frame_interval(&CMTime::new(1, fps as i32))
        .with_queue_depth(5);

    // 30 s de marge : le temps de choisir dans le menu de capture.
    let morceaux = ((secs + 30) / MORCEAU + 3).to_string();
    let mut child = Command::new(ff)
        .args(["-hide_banner", "-loglevel", "error"])
        .args(["-f", "rawvideo", "-pix_fmt", "nv12", "-s", &format!("{pw}x{ph}"), "-r", &fps.to_string(), "-thread_queue_size", "64", "-i", "pipe:0"])
        .args(["-f", "f32le", "-ar", "48000", "-ac", "2", "-thread_queue_size", "1024", "-i"]).arg(&fifo)
        .args(["-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "160k"])
        .args(["-c:v", "h264_videotoolbox", "-realtime", "1", "-b:v", debit, "-g", &fps.to_string()])
        .args(["-f", "segment", "-segment_time", &MORCEAU.to_string(), "-segment_wrap", &morceaux, "-reset_timestamps", "1", "-segment_format", "mpegts"])
        .arg(dir.join("m%03d.ts"))
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .sans_fenetre()
        .spawn()
        .map_err(|e| format!("ffmpeg : {e}"))?;

    let stop = Arc::new(AtomicBool::new(false));
    let image = Arc::new(Mutex::new(None));
    let (tx, rx) = std::sync::mpsc::sync_channel::<Vec<f32>>(256);
    let stdin = child.stdin.take().ok_or("ffmpeg sans entrée")?;
    {
        let (image, stop) = (image.clone(), stop.clone());
        std::thread::spawn(move || video(stdin, image, stop, fps, pw as usize, ph as usize));
    }
    {
        let stop = stop.clone();
        std::thread::spawn(move || son(fifo, rx, stop));
    }
    let mut flux = SCStream::new(&filtre, &config).map_err(|e| format!("{e:?}"))?;
    let sortie = || Sortie { image: image.clone(), son: tx.clone(), w: pw as usize, h: ph as usize };
    flux.add_output_handler(sortie(), SCStreamOutputType::Screen).map_err(|e| format!("{e:?}"))?;
    // Le son à part : macOS ne le donne pas avec une seule fenêtre filmée. Celui de l'émulateur et d'En Local
    // seulement (ni Discord, ni ta musique), par un second flux dont l'image (16×16, une par seconde) ne coûte rien.
    let son = (|| {
        let ecran = contenu.displays().into_iter().next()?;
        let pids = [crate::embed::pid_jeu(), Some(std::process::id())];
        let apps: Vec<_> = contenu.applications().into_iter().filter(|a| pids.contains(&Some(a.process_id() as u32))).collect();
        let apps: Vec<&SCRunningApplication> = apps.iter().collect();
        let filtre = SCContentFilter::create().with_display(&ecran).with_including_applications(&apps, &[]).build().ok()?;
        let config = SCStreamConfiguration::new()
            .with_width(16)
            .with_height(16)
            .with_minimum_frame_interval(&CMTime::new(1, 1))
            .with_captures_audio(true)
            .with_sample_rate(48000)
            .with_channel_count(2);
        let mut s = SCStream::new(&filtre, &config).ok()?;
        s.add_output_handler(sortie(), SCStreamOutputType::Audio).ok()?;
        s.start_capture().ok()?;
        Some(s)
    })();
    let couper_son = || if let Some(s) = &son { let _ = s.stop_capture(); };
    if let Err(e) = flux.start_capture() {
        couper_son();
        stop.store(true, Ordering::Relaxed);
        let _ = child.kill();
        return Err(format!("{e:?}"));
    }
    std::thread::sleep(Duration::from_millis(1500));
    if child.try_wait().ok().flatten().is_some() {
        stop.store(true, Ordering::Relaxed);
        let _ = flux.stop_capture();
        couper_son();
        return Err("l'encodeur de la puce du Mac n'a pas démarré".into());
    }
    let avec_son = if son.is_some() { "avec le son" } else { "sans le son du jeu" };
    *EN_COURS.lock().unwrap() = Some(Enregistrement { flux, son, ffmpeg: child, stop, secs });
    crate::journal_rust(&format!("clips : tampon de {secs} s ({pw}x{ph}, {fps} i/s, {avec_son}{})", if MICRO.lock().unwrap().is_some() { " et ta voix" } else { "" }));
    Ok(())
}

pub fn arreter() {
    let Some(mut e) = EN_COURS.lock().unwrap().take() else { return };
    e.stop.store(true, Ordering::Relaxed);
    let _ = e.flux.stop_capture();
    if let Some(s) = &e.son {
        let _ = s.stop_capture();
    }
    let _ = e.ffmpeg.kill();
    let _ = e.ffmpeg.wait();
    let _ = std::fs::remove_dir_all(tampon());
}

/// « Nom du jeu 2026-10-30 18h42m07 ».
fn nom_clip(jeu: &str) -> String {
    let date = Command::new("date").arg("+%Y-%m-%d %Hh%Mm%S").output().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default();
    let jeu: String = jeu.chars().filter(|c| !r#"\/:*?"<>|"#.contains(*c) && !c.is_control()).take(60).collect();
    format!("{} {date}", jeu.trim())
}

/// Transforme la fin du tampon en clip. avant : secondes depuis l'appui.
#[tauri::command]
pub async fn clip(jeu: String, avant: Option<f64>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let secs = EN_COURS.lock().unwrap().as_ref().map(|e| e.secs).ok_or("Les clips sont désactivés (Réglages, En jeu).")?;
        let ff = ffmpeg().ok_or("ffmpeg introuvable.")?;
        let avant = avant.unwrap_or(0.0).clamp(0.0, 30.0);
        let dir = tampon();
        let mut morceaux: Vec<(std::time::SystemTime, PathBuf)> = std::fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten()
            .filter(|e| e.path().extension().is_some_and(|x| x == "ts"))
            .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
            .collect();
        morceaux.sort();
        let garder = ((secs + avant.ceil() as u64) / MORCEAU + 2) as usize;
        let choisis: Vec<&PathBuf> = morceaux.iter().rev().take(garder).rev().map(|(_, p)| p).collect();
        if choisis.is_empty() {
            return Err("Rien d'enregistré pour l'instant.".into());
        }
        // Les morceaux sont copiés par liens : quitter le jeu ne casse pas le clip en cours.
        let travail = PathBuf::from(format!("{}/data/clips-assemblage-{}", crate::root(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis())));
        std::fs::create_dir_all(&travail).map_err(|e| e.to_string())?;
        let mut gardes = Vec::new();
        for (k, p) in choisis.iter().enumerate() {
            let c = travail.join(format!("{k:03}.ts"));
            if std::fs::hard_link(p, &c).or_else(|_| std::fs::copy(p, &c).map(|_| ())).is_ok() {
                gardes.push(c);
            }
        }
        let liste = travail.join("liste.txt");
        let texte: String = gardes.iter().map(|p| format!("file '{}'\n", p.to_string_lossy().replace('\'', "'\\''"))).collect();
        std::fs::write(&liste, texte).map_err(|e| e.to_string())?;
        let sortie = crate::dossier_media("videos").join("Clips En Local");
        std::fs::create_dir_all(&sortie).map_err(|e| e.to_string())?;
        let brut = travail.join("assemble.mp4");
        let fin = sortie.join(format!("{}.mp4", nom_clip(&jeu)));
        // En cas d'échec, l'erreur ffmpeg va dans data/ui.log.
        let ok = |args: &[&std::ffi::OsStr]| match Command::new(&ff).args(args).stdout(Stdio::null()).stderr(Stdio::piped()).output() {
            Ok(o) if o.status.success() => true,
            Ok(o) => {
                let e = String::from_utf8_lossy(&o.stderr);
                crate::journal_rust(&format!("clips : ffmpeg a échoué : {}", e.lines().rev().take(3).collect::<Vec<_>>().join(" | ")));
                false
            }
            Err(e) => (crate::journal_rust(&format!("clips : ffmpeg introuvable : {e}")), false).1,
        };
        use std::ffi::OsStr;
        let a = ok(&[OsStr::new("-y"), OsStr::new("-f"), OsStr::new("concat"), OsStr::new("-safe"), OsStr::new("0"), OsStr::new("-i"), liste.as_os_str(), OsStr::new("-c"), OsStr::new("copy"), brut.as_os_str()]);
        let b = a && ok(&[OsStr::new("-y"), OsStr::new("-sseof"), OsStr::new(&format!("-{:.2}", secs as f64 + avant)), OsStr::new("-i"), brut.as_os_str(), OsStr::new("-t"), OsStr::new(&secs.to_string()), OsStr::new("-c"), OsStr::new("copy"), OsStr::new("-movflags"), OsStr::new("+faststart"), fin.as_os_str()]);
        let _ = std::fs::remove_dir_all(&travail);
        if b { Ok(fin.to_string_lossy().into_owned()) } else { Err("L'assemblage du clip a échoué.".into()) }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Miniature d'une vidéo (image à 8 s, 480 px) dans data/miniatures. Rend son chemin.
#[tauri::command]
pub async fn miniature(path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let video = PathBuf::from(&path);
        // Seulement les vidéos des dossiers de Médias.
        if !crate::medias::video_permise(&video) {
            return None;
        }
        let ext = video.extension()?.to_str()?.to_lowercase();
        if !["mp4", "mkv", "webm", "mov", "avi", "m4v"].contains(&ext.as_str()) {
            return None;
        }
        let ff = ffmpeg()?;
        let m = std::fs::metadata(&video).ok()?;
        // Le nom change si la vidéo change.
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        (path.as_str(), m.len(), m.modified().ok()).hash(&mut h);
        let dir = PathBuf::from(format!("{}/data/miniatures", crate::root()));
        let _ = std::fs::create_dir_all(&dir);
        let f = dir.join(format!("{:016x}.jpg", h.finish()));
        if !f.exists() {
            for debut in ["8", "0"] {
                let ok = Command::new(&ff)
                    .args(["-y", "-v", "error", "-ss", debut, "-i"]).arg(&video)
                    .args(["-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4"]).arg(&f)
                    .stdout(Stdio::null()).stderr(Stdio::null())
                    .status().is_ok_and(|s| s.success());
                if ok && f.exists() {
                    break;
                }
            }
        }
        f.exists().then(|| f.to_string_lossy().into_owned())
    })
    .await
    .ok()
    .flatten()
}

#[cfg(test)]
mod tests {
    #[test]
    fn taille_paire_et_plafonnee() {
        assert_eq!(super::taille(1840.0, 1035.0), (1920, 1080));
        assert_eq!(super::taille(640.0, 480.0), (1280, 960));
        let (w, h) = super::taille(801.0, 451.0);
        assert!(w % 2 == 0 && h % 2 == 0);
    }

    #[test]
    fn son_entrelace() {
        let g: Vec<u8> = [1.0f32, 3.0].iter().flat_map(|v| v.to_le_bytes()).collect();
        let d: Vec<u8> = [2.0f32, 4.0].iter().flat_map(|v| v.to_le_bytes()).collect();
        assert_eq!(super::entrelace(&[&g, &d]), [1.0, 2.0, 3.0, 4.0]);
    }
}
