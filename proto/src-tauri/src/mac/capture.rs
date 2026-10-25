//! macOS : la fenêtre d'un émulateur, filmée (ScreenCaptureKit) et envoyée à l'interface comme les images
//! de la DS : En Local la dessine dans son cadre, avec les contours et le menu, comme sur Windows.
//! Il faut l'autorisation « Enregistrement de l'écran » (demandée une fois par macOS).
use screencapturekit::cv::CVPixelBufferLockFlags;
use screencapturekit::prelude::*;
use screencapturekit::screenshot_manager::SCScreenshotManager;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::ipc::{Channel, InvokeResponseBody};

static FLUX: Mutex<Option<SCStream>> = Mutex::new(None);
/// Numéro de la capture en cours : un fil de surveillance d'une ancienne capture s'arrête tout seul.
static NUMERO: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
/// Une image est partie vers l'interface et n'est pas encore dessinée.
static EN_ROUTE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
/// L'interface a dessiné la dernière image.
pub fn image_dessinee() {
    EN_ROUTE.store(false, std::sync::atomic::Ordering::Release);
}

struct Images(Channel<InvokeResponseBody>);

/// Images reçues de macOS et envoyées à l'interface : écrit dans le journal toutes les 10 s (fluidité réelle).
static RECUES: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
static ENVOYEES: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
static DEPUIS: Mutex<Option<Instant>> = Mutex::new(None);
fn compter(envoyee: bool) {
    use std::sync::atomic::Ordering::Relaxed;
    RECUES.fetch_add(1, Relaxed);
    if envoyee {
        ENVOYEES.fetch_add(1, Relaxed);
    }
    let mut d = DEPUIS.lock().unwrap();
    let t = d.get_or_insert_with(Instant::now);
    let s = t.elapsed().as_secs_f32();
    if s >= 10.0 {
        crate::journal_rust(&format!("capture : {:.0} images/s du jeu, {:.0} affichées/s", RECUES.swap(0, Relaxed) as f32 / s, ENVOYEES.swap(0, Relaxed) as f32 / s));
        *t = Instant::now();
    }
}

/// Une image macOS (BGRA) au format de libretro.rs : largeur, hauteur (u16), puis RGBA.
fn convertir(sample: &CMSampleBuffer) -> Option<Vec<u8>> {
    let pb = sample.pixel_buffer()?;
    let g = pb.lock(CVPixelBufferLockFlags::READ_ONLY).ok()?;
    let (w, h, ligne) = (g.width(), g.height(), g.bytes_per_row());
    let src = unsafe { g.as_slice() }?;
    if w == 0 || h == 0 || src.len() < ligne * h {
        return None;
    }
    let mut out = vec![0u8; 4 + w * h * 4];
    out[..2].copy_from_slice(&(w as u16).to_le_bytes());
    out[2..4].copy_from_slice(&(h as u16).to_le_bytes());
    for (y, dst) in out[4..].chunks_exact_mut(w * 4).enumerate() {
        dst.copy_from_slice(&src[y * ligne..y * ligne + w * 4]);
        for px in dst.chunks_exact_mut(4) {
            px.swap(0, 2);
            px[3] = 255;
        }
    }
    Some(out)
}

impl SCStreamOutputTrait for Images {
    fn did_output_sample_buffer(&self, sample: CMSampleBuffer, _type: SCStreamOutputType) {
        // L'interface n'a pas fini la précédente : celle-ci est sautée (sinon les images s'empilent
        // et le jeu prend du retard sur la manette).
        if EN_ROUTE.swap(true, std::sync::atomic::Ordering::AcqRel) {
            compter(false);
            return;
        }
        compter(true);
        match convertir(&sample) {
            Some(out) => drop(self.0.send(InvokeResponseBody::Raw(out))),
            None => EN_ROUTE.store(false, std::sync::atomic::Ordering::Release),
        }
    }
}

/// Une seule image de la fenêtre du jeu (fond du menu, quand le jeu s'affiche directement).
pub fn image(pid: u32) -> Option<Vec<u8>> {
    let f = fenetre(pid)?;
    let (filtre, config) = reglage(&f, false).ok()?;
    convertir(&SCScreenshotManager::capture_sample_buffer(&filtre, &config).ok()?)
}

/// Hauteur de la barre de titre de macOS, en points.
const BARRE: f64 = 28.0;

/// Filme la plus grande fenêtre du processus pid (attendue jusqu'à 20 s). Les images vont à `images`.
/// barre : la fenêtre garde sa barre de titre (Cemu, RPCS3), qui est rognée.
pub fn demarrer(pid: u32, images: Channel<InvokeResponseBody>, barre: bool) {
    arreter();
    let n = NUMERO.load(std::sync::atomic::Ordering::Acquire);
    let actuelle = move || NUMERO.load(std::sync::atomic::Ordering::Acquire) == n;
    std::thread::spawn(move || {
        let fin = Instant::now() + Duration::from_secs(20);
        while Instant::now() < fin && actuelle() {
            match essayer(pid, &images, barre) {
                // La fenêtre change de taille après coup (Eden s'ouvre en 1280×720 puis remplit le cadre) :
                // la capture repart à la nouvelle taille, sinon elle n'en filme qu'un coin.
                Ok(Some(mut taille)) => {
                    while actuelle() {
                        std::thread::sleep(Duration::from_millis(700));
                        match fenetre(pid).map(|f| f.frame().size) {
                            Some(t) if (t.width - taille.width).abs() > 1.0 || (t.height - taille.height).abs() > 1.0 => {
                                if !actuelle() {
                                    return;
                                }
                                match essayer(pid, &images, barre) {
                                    Ok(Some(t)) => taille = t,
                                    _ => return,
                                }
                            }
                            Some(_) => {}
                            None => return,
                        }
                    }
                    return;
                }
                Ok(None) => {}
                Err(e) => {
                    crate::journal_rust(&format!("capture du jeu : {e}"));
                    return;
                }
            }
            std::thread::sleep(Duration::from_millis(300));
        }
        crate::journal_rust("capture du jeu : fenêtre de l'émulateur introuvable");
    });
}

/// Filtre et réglages pour filmer la fenêtre (barre de titre rognée si barre).
fn reglage(fenetre: &SCWindow, barre: bool) -> Result<(SCContentFilter, SCStreamConfiguration), String> {
    let mut taille = fenetre.frame().size;
    let haut = if barre && taille.height > 2.0 * BARRE { BARRE } else { 0.0 };
    taille.height -= haut;
    // Taille plafonnée (720 de haut) : assez net dans le cadre, léger à envoyer à chaque image.
    let r = (720.0 / taille.height).min(1280.0 / taille.width).min(1.0);
    let filtre = SCContentFilter::create().with_window(fenetre).build().map_err(|e| format!("{e:?}"))?;
    let config = SCStreamConfiguration::new()
        .with_width((taille.width * r) as u32)
        .with_height((taille.height * r) as u32)
        .with_source_rect(screencapturekit::cg::CGRect::new(0.0, haut, taille.width, taille.height))
        .with_pixel_format(PixelFormat::BGRA)
        .with_shows_cursor(false)
        .with_minimum_frame_interval(&CMTime::new(1, 60))
        // Peu d'images en attente : la plus récente, sans retard.
        .with_queue_depth(3);
    Ok((filtre, config))
}

/// Toute petite image de la fenêtre du jeu (64 de large) : le décor flouté autour du jeu.
pub fn apercu(pid: u32) -> Option<Vec<u8>> {
    let f = fenetre(pid)?;
    let t = f.frame().size;
    let (filtre, config) = reglage(&f, false).ok()?;
    let config = config.with_width(64).with_height(((64.0 * t.height / t.width).round() as u32).max(1));
    convertir(&SCScreenshotManager::capture_sample_buffer(&filtre, &config).ok()?)
}

/// Numéro (macOS) de la fenêtre du jeu.
pub fn numero(pid: u32) -> Option<u32> {
    fenetre(pid).map(|f| f.window_id())
}

/// La plus grande fenêtre affichée du processus pid.
fn fenetre(pid: u32) -> Option<SCWindow> {
    SCShareableContent::get()
        .ok()?
        .windows()
        .into_iter()
        .filter(|w| w.owning_application().is_some_and(|a| a.process_id() as u32 == pid))
        // La fenêtre du jeu : affichée (la fenêtre principale d'Azahar existe mais reste cachée).
        .filter(|w| w.is_on_screen() && w.frame().size.width >= 100.0 && w.frame().size.height >= 100.0)
        .max_by(|a, b| (a.frame().size.width * a.frame().size.height).total_cmp(&(b.frame().size.width * b.frame().size.height)))
}

/// Démarre la capture de la fenêtre du jeu ; sa taille, ou None si elle n'est pas encore là.
fn essayer(pid: u32, images: &Channel<InvokeResponseBody>, barre: bool) -> Result<Option<CGSize>, String> {
    SCShareableContent::get().map_err(|e| format!("{e:?} (autorise En Local dans Réglages Système, Enregistrement de l'écran)"))?;
    let Some(fenetre) = fenetre(pid) else { return Ok(None) };
    let taille_fenetre = fenetre.frame().size;
    let (filtre, config) = reglage(&fenetre, barre)?;
    let mut flux = SCStream::new(&filtre, &config).map_err(|e| format!("{e:?}"))?;
    flux.add_output_handler(Images(images.clone()), SCStreamOutputType::Screen).map_err(|e| format!("{e:?}"))?;
    EN_ROUTE.store(false, std::sync::atomic::Ordering::Release);
    flux.start_capture().map_err(|e| format!("{e:?}"))?;
    crate::journal_rust(&format!("capture du jeu : {}×{}", taille_fenetre.width, taille_fenetre.height));
    crate::embed::devant();
    if let Some(f) = FLUX.lock().unwrap().replace(flux) {
        let _ = f.stop_capture();
    }
    Ok(Some(taille_fenetre))
}

pub fn arreter() {
    NUMERO.fetch_add(1, std::sync::atomic::Ordering::AcqRel);
    if let Some(f) = FLUX.lock().unwrap().take() {
        let _ = f.stop_capture();
    }
}

/* ---------- Son du jeu (jeu à distance) ---------- */

struct Son(Channel<InvokeResponseBody>);

/// Échantillons de macOS (32 bits flottants, un tampon par canal ou entrelacés) en PCM 16 bits stéréo
/// entrelacé, le format envoyé par Windows.
fn pcm16(canaux: &[&[u8]]) -> Vec<u8> {
    let lire = |c: &[u8], i: usize| c.get(i * 4..i * 4 + 4).map_or(0.0, |b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]));
    let ech = |v: f32| ((v.clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes();
    let mut out = Vec::new();
    match canaux {
        [g, d, ..] => {
            for i in 0..g.len() / 4 {
                out.extend_from_slice(&ech(lire(g, i)));
                out.extend_from_slice(&ech(lire(d, i)));
            }
        }
        [m] => {
            for i in 0..m.len() / 4 {
                out.extend_from_slice(&ech(lire(m, i)));
            }
        }
        [] => {}
    }
    out
}

impl SCStreamOutputTrait for Son {
    fn did_output_sample_buffer(&self, sample: CMSampleBuffer, genre: SCStreamOutputType) {
        if !matches!(genre, SCStreamOutputType::Audio) {
            return;
        }
        let Ok(liste) = sample.audio_buffer_list() else { return };
        let canaux: Vec<&[u8]> = liste.iter().map(|b| b.data()).collect();
        let out = pcm16(&canaux);
        if !out.is_empty() {
            let _ = self.0.send(InvokeResponseBody::Raw(out));
        }
    }
}

/// Son de l'émulateur seul (48 kHz, stéréo), envoyé à l'interface jusqu'à l'arrêt du flux rendu.
pub fn son(pid: u32, vers: Channel<InvokeResponseBody>) -> Result<SCStream, String> {
    let contenu = SCShareableContent::get().map_err(|e| format!("{e:?} (autorise En Local dans Réglages Système, Enregistrement de l'écran)"))?;
    let ecran = contenu.displays().into_iter().next().ok_or("aucun écran")?;
    let appli = contenu.applications().into_iter().find(|a| a.process_id() as u32 == pid).ok_or("émulateur introuvable")?;
    let filtre = SCContentFilter::create().with_display(&ecran).with_including_applications(&[&appli], &[]).build().map_err(|e| format!("{e:?}"))?;
    // L'image n'est pas utilisée : la plus petite possible, une par seconde.
    let config = SCStreamConfiguration::new()
        .with_width(2)
        .with_height(2)
        .with_minimum_frame_interval(&CMTime::new(1, 1))
        .with_captures_audio(true)
        .with_sample_rate(48000)
        .with_channel_count(2)
        .with_excludes_current_process_audio(true);
    let mut flux = SCStream::new(&filtre, &config).map_err(|e| format!("{e:?}"))?;
    flux.add_output_handler(Son(vers), SCStreamOutputType::Audio).map_err(|e| format!("{e:?}"))?;
    flux.start_capture().map_err(|e| format!("{e:?}"))?;
    Ok(flux)
}

#[cfg(test)]
mod tests {
    #[test]
    fn pcm16_entrelace() {
        let g: Vec<u8> = [1.0f32, -1.0].iter().flat_map(|v| v.to_le_bytes()).collect();
        let d: Vec<u8> = [0.5f32, 0.0].iter().flat_map(|v| v.to_le_bytes()).collect();
        let out = super::pcm16(&[&g, &d]);
        let v: Vec<i16> = out.chunks_exact(2).map(|b| i16::from_le_bytes([b[0], b[1]])).collect();
        assert_eq!(v, [32767, 16383, -32767, 0]);
    }
}
