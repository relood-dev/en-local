//! Micro des consoles : la liste des micros de Windows (identifiant et nom), et pour la DS le son
//! du micro choisi donné au cœur libretro (interface micro de libretro).
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::collections::VecDeque;
use std::ffi::c_void;
use std::sync::{Arc, Mutex};

#[derive(serde::Serialize, Clone)]
pub struct Micro {
    /// Identifiant Windows du micro (celui de Cemu et Dolphin).
    pub id: String,
    /// Nom affiché par Windows (celui d'Azahar et du cœur DS).
    pub nom: String,
}

/// Micros branchés et actifs.
#[cfg(windows)]
#[tauri::command]
pub fn micros() -> Vec<Micro> {
    use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
    use windows::Win32::Media::Audio::*;
    use windows::Win32::System::Com::*;
    let mut out = Vec::new();
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let Ok(e) = CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL) else { return out };
        let Ok(liste) = e.EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE) else { return out };
        for i in 0..liste.GetCount().unwrap_or(0) {
            let Ok(d) = liste.Item(i) else { continue };
            let Ok(id) = d.GetId() else { continue };
            let id_texte = id.to_string().unwrap_or_default();
            CoTaskMemFree(Some(id.0 as _));
            let nom = d.OpenPropertyStore(STGM_READ).ok().and_then(|p| p.GetValue(&PKEY_Device_FriendlyName).ok()).map(|v| v.to_string()).unwrap_or_default();
            if !id_texte.is_empty() && !nom.is_empty() {
                out.push(Micro { id: id_texte, nom });
            }
        }
    }
    out
}

/// macOS : les micros vus par cpal (CoreAudio), le nom sert aussi d'identifiant.
#[cfg(not(windows))]
#[tauri::command]
pub fn micros() -> Vec<Micro> {
    cpal::default_host().input_devices().map(|l| l.filter_map(|d| d.name().ok()).map(|n| Micro { id: n.clone(), nom: n }).collect()).unwrap_or_default()
}

/// Nom Windows du micro d'identifiant `id` (None : le micro par défaut).
pub fn nom_de(id: &str) -> Option<String> {
    micros().into_iter().find(|m| m.id == id).map(|m| m.nom)
}

/* ---------- DS : interface micro de libretro ---------- */

#[repr(C)]
pub struct Interface {
    version: u32,
    open: unsafe extern "C" fn(*const u32) -> *mut c_void,
    close: unsafe extern "C" fn(*mut c_void),
    params: unsafe extern "C" fn(*const c_void, *mut u32) -> bool,
    set_state: unsafe extern "C" fn(*mut c_void, bool) -> bool,
    get_state: unsafe extern "C" fn(*const c_void) -> bool,
    read: unsafe extern "C" fn(*mut c_void, *mut i16, usize) -> i32,
}

/// Micro choisi pour la DS (nom Windows, None : par défaut).
pub static NOM_DS: Mutex<Option<String>> = Mutex::new(None);

struct Ouvert {
    taux: u32,
    actif: bool,
    file: Arc<Mutex<VecDeque<i16>>>,
    // Le flux cpal vit dans son propre thread ; le fermer arrête ce thread.
    stop: std::sync::mpsc::Sender<()>,
}
static OUVERT: Mutex<Option<Ouvert>> = Mutex::new(None);

/// Ouvre le micro : son mono, ramené à `taux` Hz, dans une file (une demi-seconde au plus).
fn ouvrir(taux: u32) -> Option<Ouvert> {
    let file = Arc::new(Mutex::new(VecDeque::new()));
    let (stop, attendre) = std::sync::mpsc::channel::<()>();
    let (pret, ok) = std::sync::mpsc::channel::<bool>();
    let f = file.clone();
    let nom = NOM_DS.lock().unwrap().clone();
    std::thread::spawn(move || {
        let host = cpal::default_host();
        let device = nom.and_then(|n| host.input_devices().ok()?.find(|d| d.name().is_ok_and(|x| x == n))).or_else(|| host.default_input_device());
        let Some(device) = device else { return pret.send(false).unwrap_or(()) };
        let Ok(config) = device.default_input_config() else { return pret.send(false).unwrap_or(()) };
        let canaux = config.channels() as usize;
        let pas = config.sample_rate().0 as f64 / taux as f64;
        let mut pos = 0.0f64;
        let flux = device.build_input_stream(
            &config.into(),
            move |entree: &[f32], _| {
                let mut q = f.lock().unwrap();
                for trame in entree.chunks(canaux) {
                    pos += 1.0;
                    if pos >= pas {
                        pos -= pas;
                        let v = trame.iter().sum::<f32>() / canaux as f32;
                        q.push_back((v.clamp(-1.0, 1.0) * 32767.0) as i16);
                    }
                }
                let trop = q.len().saturating_sub(taux as usize / 2);
                q.drain(..trop);
            },
            |e| eprintln!("micro : {e}"),
            None,
        );
        let Ok(flux) = flux else { return pret.send(false).unwrap_or(()) };
        let _ = flux.play();
        let _ = pret.send(true);
        let _ = attendre.recv();
        drop(flux);
    });
    ok.recv().ok().filter(|x| *x).map(|_| Ouvert { taux, actif: false, file, stop })
}

unsafe extern "C" fn open(params: *const u32) -> *mut c_void {
    let taux = if params.is_null() { 44100 } else { (*params).clamp(8000, 96000) };
    let mut o = OUVERT.lock().unwrap();
    if o.is_some() {
        return std::ptr::null_mut();
    }
    *o = ouvrir(taux);
    if o.is_some() { 1 as *mut c_void } else { std::ptr::null_mut() }
}
unsafe extern "C" fn close(_: *mut c_void) {
    if let Some(o) = OUVERT.lock().unwrap().take() {
        let _ = o.stop.send(());
    }
}
unsafe extern "C" fn params(_: *const c_void, out: *mut u32) -> bool {
    match (OUVERT.lock().unwrap().as_ref(), out.is_null()) {
        (Some(o), false) => {
            *out = o.taux;
            true
        }
        _ => false,
    }
}
unsafe extern "C" fn set_state(_: *mut c_void, actif: bool) -> bool {
    match OUVERT.lock().unwrap().as_mut() {
        Some(o) => {
            o.actif = actif;
            if !actif {
                o.file.lock().unwrap().clear();
            }
            true
        }
        None => false,
    }
}
unsafe extern "C" fn get_state(_: *const c_void) -> bool {
    OUVERT.lock().unwrap().as_ref().is_some_and(|o| o.actif)
}
/// Donne au cœur les échantillons reçus ; il en manque : du silence, pour garder le rythme.
unsafe extern "C" fn read(_: *mut c_void, out: *mut i16, n: usize) -> i32 {
    let g = OUVERT.lock().unwrap();
    let Some(o) = g.as_ref().filter(|o| o.actif) else { return -1 };
    let dest = std::slice::from_raw_parts_mut(out, n);
    let mut q = o.file.lock().unwrap();
    for s in dest.iter_mut() {
        *s = q.pop_front().unwrap_or(0);
    }
    n as i32
}

/// Remplit l'interface demandée par le cœur (GET_MICROPHONE_INTERFACE).
pub unsafe fn interface(data: *mut c_void) -> bool {
    let i = &mut *(data as *mut Interface);
    if i.version != 1 {
        return false;
    }
    i.open = open;
    i.close = close;
    i.params = params;
    i.set_state = set_state;
    i.get_state = get_state;
    i.read = read;
    true
}

#[cfg(test)]
mod tests {
    /// Les micros de ce PC : `cargo test --release -- --ignored micros_du_pc --nocapture`.
    #[test]
    #[ignore]
    fn micros_du_pc() {
        let l = super::micros();
        for m in &l {
            println!("{} | {}", m.nom, m.id);
        }
        assert!(l.iter().all(|m| m.id.starts_with('{')));
    }
}
