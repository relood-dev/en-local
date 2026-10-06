//! Clips vidéo : ffmpeg filme En Local en continu dans un tampon de morceaux de 2 s.
//! Un clip garde les dernières secondes. Image : ddagrab et la carte graphique. Son : boucle WASAPI.
use std::io::Write;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const MORCEAU: u64 = 2;

struct Enregistrement {
    ffmpeg: Child,
    stop: Arc<AtomicBool>,
    secs: u64,
}
static EN_COURS: Mutex<Option<Enregistrement>> = Mutex::new(None);

fn ffmpeg() -> String {
    format!("{}\\emu\\ffmpeg\\ffmpeg.exe", crate::root())
}
fn tampon() -> PathBuf {
    PathBuf::from(format!("{}\\data\\clips-tampon", crate::root()))
}

/// Zone de la fenêtre : (écran DXGI, x, y, largeur, hauteur).
fn zone(parent: isize) -> Option<(u32, i32, i32, i32, i32)> {
    use windows::Win32::Foundation::{HWND, POINT, RECT};
    use windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, IDXGIFactory1};
    use windows::Win32::Graphics::Gdi::ClientToScreen;
    use windows::Win32::UI::WindowsAndMessaging::GetClientRect;
    unsafe {
        let mut r = RECT::default();
        GetClientRect(HWND(parent as _), &mut r).ok()?;
        let mut o = POINT::default();
        let _ = ClientToScreen(HWND(parent as _), &mut o);
        let (cx, cy) = (o.x + r.right / 2, o.y + r.bottom / 2);
        // ddagrab filme l'écran qui contient la fenêtre.
        let f: IDXGIFactory1 = CreateDXGIFactory1().ok()?;
        let carte = f.EnumAdapters1(0).ok()?;
        for i in 0..16 {
            let Ok(sortie) = carte.EnumOutputs(i) else { break };
            let d = sortie.GetDesc().ok()?.DesktopCoordinates;
            if (d.left..d.right).contains(&cx) && (d.top..d.bottom).contains(&cy) {
                // Tailles paires, demandées par les encodeurs.
                let x = (o.x - d.left).max(0);
                let y = (o.y - d.top).max(0);
                let w = (r.right.min(d.right - d.left - x)) & !1;
                let h = (r.bottom.min(d.bottom - d.top - y)) & !1;
                return (w >= 160 && h >= 120).then_some((i, x, y, w, h));
            }
        }
        None
    }
}

fn format_son() -> Option<(u32, u16)> {
    use cpal::traits::{DeviceTrait, HostTrait};
    let cfg = cpal::default_host().default_output_device()?.default_output_config().ok()?;
    (cfg.sample_format() == cpal::SampleFormat::F32).then(|| (cfg.sample_rate().0, cfg.channels()))
}

/// Son du PC vers ffmpeg, avec du silence quand rien ne joue (sinon ffmpeg attend).
fn son(mut vers: std::process::ChildStdin, stop: Arc<AtomicBool>, rate: u32, canaux: u16) {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    let (tx, rx) = std::sync::mpsc::sync_channel::<Vec<f32>>(256);
    let flux = cpal::default_host().default_output_device().and_then(|dev| {
        let cfg = dev.default_output_config().ok()?;
        let flux = dev.build_input_stream(&cfg.config(), move |d: &[f32], _: &_| drop(tx.try_send(d.to_vec())), |_| {}, None).ok()?;
        flux.play().ok()?;
        Some(flux)
    });
    let debut = Instant::now();
    let mut ecrits: u64 = 0;
    let mut attente: Vec<f32> = Vec::new();
    let par_seconde = rate as u64 * canaux as u64;
    while !stop.load(Ordering::Relaxed) {
        std::thread::sleep(Duration::from_millis(10));
        while let Ok(b) = rx.try_recv() {
            attente.extend_from_slice(&b);
        }
        let du = (debut.elapsed().as_secs_f64() * rate as f64) as u64 * canaux as u64;
        let n = du.saturating_sub(ecrits) as usize;
        let mut bloc: Vec<f32> = attente.drain(..n.min(attente.len())).collect();
        bloc.resize(n, 0.0);
        // Plus d'une demi-seconde de retard : on l'oublie.
        if attente.len() as u64 > par_seconde / 2 {
            attente.clear();
        }
        let octets: Vec<u8> = bloc.iter().flat_map(|s| s.to_le_bytes()).collect();
        if vers.write_all(&octets).is_err() {
            break;
        }
        ecrits += n as u64;
    }
    drop(flux);
}

/// Encodeur de la carte graphique, sinon Media Foundation.
/// qualite : haute (≈ 350 Mo pour 2 min), moyenne (moitié), legere (quart).
fn video(encodeur: &str, qualite: &str) -> Vec<&'static str> {
    let (cq, max, qp, debit) = match qualite {
        "legere" => ("31", "6M", ("30", "32"), "5M"),
        "moyenne" => ("27", "12M", ("26", "28"), "9M"),
        _ => ("23", "25M", ("22", "24"), "15M"),
    };
    match encodeur {
        "nvenc" => vec!["-c:v", "h264_nvenc", "-preset", "p4", "-rc", "vbr", "-cq", cq, "-b:v", "0", "-maxrate", max],
        "amf" => vec!["-c:v", "h264_amf", "-quality", "speed", "-rc", "cqp", "-qp_i", qp.0, "-qp_p", qp.1],
        _ => vec!["-vf", "hwdownload,format=bgra,format=nv12", "-c:v", "h264_mf", "-hw_encoding", "1", "-b:v", debit],
    }
}

/// Démarre le tampon au début de la partie.
pub fn demarrer(parent: isize, secs: u64, qualite: String) {
    arreter();
    let secs = secs.clamp(15, 120);
    let Some((sortie, x, y, w, h)) = zone(parent) else { return crate::journal_rust("clips : écran introuvable") };
    demarrer_zone(sortie, x, y, w, h, secs, &qualite);
}
fn demarrer_zone(sortie: u32, x: i32, y: i32, w: i32, h: i32, secs: u64, qualite: &str) {
    let dir = tampon();
    let _ = std::fs::remove_dir_all(&dir);
    if std::fs::create_dir_all(&dir).is_err() || !Path::new(&ffmpeg()).exists() {
        return;
    }
    let source = format!("ddagrab=output_idx={sortie}:framerate=60:offset_x={x}:offset_y={y}:video_size={w}x{h}:draw_mouse=0");
    // 30 s de marge : le temps de choisir dans le menu de capture.
    let morceaux = ((secs + 30) / MORCEAU + 3).to_string();
    let format = format_son();
    for encodeur in ["nvenc", "amf", "mf"] {
        let mut cmd = Command::new(ffmpeg());
        cmd.args(["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", &source]);
        if let Some((rate, canaux)) = format {
            cmd.args(["-f", "f32le", "-ar", &rate.to_string(), "-ac", &canaux.to_string(), "-thread_queue_size", "1024", "-i", "pipe:0", "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "160k"]);
        }
        cmd.args(video(encodeur, qualite));
        cmd.args(["-g", "60", "-f", "segment", "-segment_time", &MORCEAU.to_string(), "-segment_wrap", &morceaux, "-reset_timestamps", "1", "-segment_format", "mpegts"]);
        cmd.arg(dir.join("m%03d.ts"));
        let Ok(mut child) = cmd.stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null()).creation_flags(CREATE_NO_WINDOW).spawn() else { continue };
        let stop = Arc::new(AtomicBool::new(false));
        if let (Some((rate, canaux)), Some(stdin)) = (format, child.stdin.take()) {
            let s = stop.clone();
            std::thread::spawn(move || son(stdin, s, rate, canaux));
        }
        std::thread::sleep(Duration::from_millis(1500));
        if child.try_wait().ok().flatten().is_some() {
            stop.store(true, Ordering::Relaxed);
            continue; // encodeur indisponible : on essaie le suivant
        }
        *EN_COURS.lock().unwrap() = Some(Enregistrement { ffmpeg: crate::embed::tie(child), stop, secs });
        crate::journal_rust(&format!("clips : tampon de {secs} s ({encodeur}, {w}x{h}{})", if format.is_some() { ", avec le son" } else { "" }));
        return;
    }
    crate::journal_rust("clips : aucun encodeur vidéo n'a marché");
}

pub fn arreter() {
    let Some(mut e) = EN_COURS.lock().unwrap().take() else { return };
    e.stop.store(true, Ordering::Relaxed);
    let _ = e.ffmpeg.kill();
    let _ = e.ffmpeg.wait();
    let _ = std::fs::remove_dir_all(tampon());
}

/// Miniature d'une vidéo (image à 8 s, 480 px) dans data\\miniatures. Rend son chemin.
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
        let m = std::fs::metadata(&video).ok()?;
        // Le nom change si la vidéo change.
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        (path.as_str(), m.len(), m.modified().ok()).hash(&mut h);
        let dir = PathBuf::from(format!("{}\\data\\miniatures", crate::root()));
        let _ = std::fs::create_dir_all(&dir);
        let f = dir.join(format!("{:016x}.jpg", h.finish()));
        if !f.exists() {
            for debut in ["8", "0"] {
                let ok = Command::new(ffmpeg())
                    .args(["-y", "-v", "error", "-ss", debut, "-i"]).arg(&video)
                    .args(["-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4"]).arg(&f)
                    .creation_flags(CREATE_NO_WINDOW).stdout(Stdio::null()).stderr(Stdio::null())
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

fn nom_clip(jeu: &str) -> String {
    use windows::Win32::System::SystemInformation::GetLocalTime;
    let t = unsafe { GetLocalTime() };
    let jeu: String = jeu.chars().filter(|c| !r#"\/:*?"<>|"#.contains(*c) && !c.is_control()).take(60).collect();
    format!("{} {:04}-{:02}-{:02} {:02}h{:02}m{:02}", jeu.trim(), t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond)
}

/// Transforme la fin du tampon en clip. avant : secondes depuis l'appui.
#[tauri::command]
pub async fn clip(jeu: String, avant: Option<f64>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let secs = EN_COURS.lock().unwrap().as_ref().map(|e| e.secs).ok_or("Les clips sont désactivés (Réglages, En jeu).")?;
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
        let travail = std::path::PathBuf::from(format!("{}\\data\\clips-assemblage-{}", crate::root(), std::process::id() as u128 ^ std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis())));
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
        // En cas d'échec, l'erreur ffmpeg va dans data\\ui.log.
        let ok = |args: &[&std::ffi::OsStr]| match Command::new(ffmpeg()).args(args).creation_flags(CREATE_NO_WINDOW).stdout(Stdio::null()).stderr(Stdio::piped()).output() {
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

#[cfg(test)]
mod tests {
    /// Test manuel de toute la chaîne.
    #[test]
    #[ignore]
    fn tampon_et_clip() {
        let _ = std::fs::create_dir_all(format!("{}\\emu\\ffmpeg", crate::root()));
        let _ = std::fs::copy("C:\\EnLocal\\emu\\ffmpeg\\ffmpeg.exe", super::ffmpeg());
        super::demarrer_zone(0, 0, 0, 320, 240, 15, "haute");
        assert!(super::EN_COURS.lock().unwrap().is_some(), "le tampon n'a pas démarré");
        std::thread::sleep(std::time::Duration::from_secs(7));
        let chemin = tauri::async_runtime::block_on(super::clip("Test clips".into(), Some(1.0))).unwrap();
        let taille = std::fs::metadata(&chemin).unwrap().len();
        let info = std::process::Command::new(super::ffmpeg()).args(["-hide_banner", "-i", &chemin]).output().unwrap();
        let texte = String::from_utf8_lossy(&info.stderr).into_owned();
        let _ = std::fs::remove_file(&chemin);
        super::arreter();
        println!("taille {taille}");
        for l in texte.lines().filter(|l| l.contains("Duration") || l.contains("Stream")) {
            println!("{}", l.trim());
        }
        assert!(taille > 10_000);
    }
}
