// Cœur libretro (melonDS) chargé dans l'app, dans son propre thread.
// Images vers l'interface, son par cpal, manette par pad.rs.
// Les rappels libretro n'ont pas de contexte : l'état est global, un seul jeu à la fois.
use std::collections::{HashMap, VecDeque};
use std::ffi::{c_char, c_int, c_uint, c_void, CStr, CString};
use std::sync::atomic::{AtomicBool, AtomicI16, AtomicU32, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use tauri::ipc::{Channel, InvokeResponseBody};

use crate::pad;

#[repr(C)]
struct GameInfo {
    path: *const c_char,
    data: *const c_void,
    size: usize,
    meta: *const c_char,
}
#[repr(C)]
#[derive(Default)]
struct Geometry {
    base_width: c_uint,
    base_height: c_uint,
    max_width: c_uint,
    max_height: c_uint,
    aspect_ratio: f32,
}
#[repr(C)]
#[derive(Default)]
struct Timing {
    fps: f64,
    sample_rate: f64,
}
#[repr(C)]
#[derive(Default)]
struct AvInfo {
    geometry: Geometry,
    timing: Timing,
}
#[repr(C)]
struct Variable {
    key: *const c_char,
    value: *const c_char,
}

const EXP: c_uint = 0x10000;

static RUNNING: AtomicBool = AtomicBool::new(false);
pub static PAUSED: AtomicBool = AtomicBool::new(false);
/// Reset demandé : le cœur redémarre le jeu, comme le bouton Reset.
pub static RESET: AtomicBool = AtomicBool::new(false);
static PIXEL_FORMAT: AtomicU32 = AtomicU32::new(0);
static POINTER: [AtomicI16; 3] = [AtomicI16::new(0), AtomicI16::new(0), AtomicI16::new(0)];
static FRAMES: OnceLock<Mutex<Option<Channel<InvokeResponseBody>>>> = OnceLock::new();
static AUDIO: OnceLock<Mutex<VecDeque<i16>>> = OnceLock::new();
static DIRS: OnceLock<(CString, CString)> = OnceLock::new();
// Options du cœur, gardées vivantes pour GET_VARIABLE.
static OPTIONS: OnceLock<Mutex<HashMap<String, CString>>> = OnceLock::new();
/// Pseudo du joueur (GET_USERNAME), utilisé comme nom du firmware DS.
static PSEUDO: Mutex<Option<CString>> = Mutex::new(None);
pub fn pseudo(nom: Option<String>) {
    *PSEUDO.lock().unwrap() = nom.and_then(|n| CString::new(n).ok());
}

fn audio() -> &'static Mutex<VecDeque<i16>> {
    AUDIO.get_or_init(|| Mutex::new(VecDeque::new()))
}
/// Bouton de la manette pour chaque bouton de la DS.
static TOUCHES: [std::sync::atomic::AtomicU8; 16] = [const { std::sync::atomic::AtomicU8::new(0) }; 16];
/// Volume de la console DS, en millièmes.
static VOLUME: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1000);
/// Volume des jeux, en millièmes. S'ajoute à celui de la console.
static GAIN: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1000);
pub fn gain(v: f32) {
    GAIN.store((v.clamp(0.0, 1.0) * 1000.0) as u32, Ordering::Relaxed);
}
fn options() -> &'static Mutex<HashMap<String, CString>> {
    OPTIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

unsafe extern "C" fn environment(cmd: c_uint, data: *mut c_void) -> bool {
    match cmd & !EXP {
        3 => {
            *(data as *mut bool) = true;
            true
        }
        6 | 8 | 11 | 18 | 35 | 36 | 44 => true,
        9 => {
            *(data as *mut *const c_char) = DIRS.get().unwrap().0.as_ptr();
            true
        }
        31 => {
            *(data as *mut *const c_char) = DIRS.get().unwrap().1.as_ptr();
            true
        }
        10 => {
            let fmt = *(data as *const c_int) as u32;
            PIXEL_FORMAT.store(fmt, Ordering::Relaxed);
            fmt <= 2
        }
        15 => {
            let var = &mut *(data as *mut Variable);
            let key = CStr::from_ptr(var.key).to_string_lossy().into_owned();
            match options().lock().unwrap().get(&key) {
                Some(v) => {
                    var.value = v.as_ptr();
                    true
                }
                None => false,
            }
        }
        16 => {
            // SET_VARIABLES : « Description; défaut|autre » -> on garde le défaut.
            let mut p = data as *const Variable;
            let mut opts = options().lock().unwrap();
            while !(*p).key.is_null() {
                let key = CStr::from_ptr((*p).key).to_string_lossy().into_owned();
                let desc = CStr::from_ptr((*p).value).to_string_lossy();
                if let Some(first) = desc.split_once("; ").and_then(|(_, v)| v.split('|').next()) {
                    opts.entry(key).or_insert_with(|| CString::new(first).unwrap());
                }
                p = p.add(1);
            }
            true
        }
        17 => {
            *(data as *mut bool) = false;
            true
        }
        24 => {
            *(data as *mut u64) = (1 << 1) | (1 << 5) | (1 << 6);
            true
        }
        38 => match PSEUDO.lock().unwrap().as_ref() {
            Some(n) => {
                *(data as *mut *const c_char) = n.as_ptr();
                true
            }
            None => false,
        },
        39 => {
            *(data as *mut c_uint) = 2;
            true
        }
        47 => {
            *(data as *mut c_int) = 3;
            true
        }
        52 => {
            *(data as *mut c_uint) = 0;
            true
        }
        _ => false,
    }
}

unsafe extern "C" fn video_refresh(data: *const c_void, width: c_uint, height: c_uint, pitch: usize) {
    if data.is_null() {
        return;
    }
    let (w, h) = (width as usize, height as usize);
    let mut out = Vec::with_capacity(4 + w * h * 4);
    out.extend_from_slice(&(w as u16).to_le_bytes());
    out.extend_from_slice(&(h as u16).to_le_bytes());
    let base = data as *const u8;
    for y in 0..h {
        let row = base.add(y * pitch);
        for x in 0..w {
            match PIXEL_FORMAT.load(Ordering::Relaxed) {
                1 => {
                    let p = row.add(x * 4);
                    out.extend_from_slice(&[*p.add(2), *p.add(1), *p, 255]);
                }
                _ => {
                    let v = *(row.add(x * 2) as *const u16);
                    let (r, g, b) = ((v >> 11) & 31, (v >> 5) & 63, v & 31);
                    out.extend_from_slice(&[(r << 3) as u8, (g << 2) as u8, (b << 3) as u8, 255]);
                }
            }
        }
    }
    if let Some(ch) = FRAMES.get().and_then(|m| m.lock().unwrap().clone()) {
        let _ = ch.send(InvokeResponseBody::Raw(out));
    }
}

unsafe extern "C" fn audio_sample(l: i16, r: i16) {
    let mut q = audio().lock().unwrap();
    q.push_back(l);
    q.push_back(r);
}

unsafe extern "C" fn audio_batch(data: *const i16, frames: usize) -> usize {
    let mut q = audio().lock().unwrap();
    q.extend(std::slice::from_raw_parts(data, frames * 2));
    // Plus de 0,2 s de retard : on jette le surplus.
    while q.len() > 16384 {
        q.pop_front();
    }
    frames
}

unsafe extern "C" fn input_poll() {}

unsafe extern "C" fn input_state(port: c_uint, device: c_uint, index: c_uint, id: c_uint) -> i16 {
    if port != 0 {
        return 0;
    }
    match device {
        1 if id < 16 => ((pad::BUTTONS.load(Ordering::Relaxed) >> TOUCHES[id as usize].load(Ordering::Relaxed)) & 1) as i16,
        5 if index < 2 && id < 2 => pad::AXES[(index * 2 + id) as usize].load(Ordering::Relaxed),
        6 if id < 3 => POINTER[id as usize].load(Ordering::Relaxed),
        _ => 0,
    }
}

/// Souris ou doigt sur l'image (0..1) -> écran tactile.
pub fn set_pointer(x: f64, y: f64, down: bool) {
    let to = |v: f64| ((v.clamp(0.0, 1.0) * 2.0 - 1.0) * 32767.0) as i16;
    POINTER[0].store(to(x), Ordering::Relaxed);
    POINTER[1].store(to(y), Ordering::Relaxed);
    POINTER[2].store(down as i16, Ordering::Relaxed);
}

pub fn is_running() -> bool {
    RUNNING.load(Ordering::Relaxed)
}

pub fn stop() {
    RUNNING.store(false, Ordering::Relaxed);
}

fn audio_stream(rate_in: f64) -> Option<cpal::Stream> {
    let device = cpal::default_host().default_output_device()?;
    let config = device.default_output_config().ok()?;
    let rate_out = config.sample_rate().0 as f64;
    let channels = config.channels() as usize;
    let step = rate_in / rate_out;
    let mut pos = 0.0f64;
    let mut last = (0i16, 0i16);
    let stream = device
        .build_output_stream(
            &config.into(),
            move |out: &mut [f32], _| {
                let mut q = audio().lock().unwrap();
                for frame in out.chunks_mut(channels) {
                    pos += step;
                    while pos >= 1.0 && q.len() >= 2 {
                        last = (q.pop_front().unwrap(), q.pop_front().unwrap());
                        pos -= 1.0;
                    }
                    if pos >= 1.0 {
                        pos = 0.0; // file vide : on garde le dernier échantillon
                    }
                    for (c, s) in frame.iter_mut().enumerate() {
                        let v = if c % 2 == 0 { last.0 } else { last.1 };
                        *s = v as f32 / 32768.0 * VOLUME.load(Ordering::Relaxed) as f32 / 1000.0 * GAIN.load(Ordering::Relaxed) as f32 / 1000.0;
                    }
                }
            },
            |e| eprintln!("son : {e}"),
            None,
        )
        .ok()?;
    stream.play().ok()?;
    Some(stream)
}

/// Lance game avec le cœur core. reglages : options du cœur, volume de 0 à 1.
pub fn start(core: String, game: String, base: String, frames: Channel<InvokeResponseBody>, reglages: Vec<(&'static str, String)>, volume: f32, touches: [u8; 16]) -> Result<(), String> {
    if RUNNING.swap(true, Ordering::Relaxed) {
        return Err("Un jeu tourne déjà".into());
    }
    let system = format!("{base}\\system");
    let saves = format!("{base}\\saves");
    let _ = std::fs::create_dir_all(&system);
    let _ = std::fs::create_dir_all(&saves);
    let _ = DIRS.set((CString::new(system).unwrap(), CString::new(saves).unwrap()));
    *FRAMES.get_or_init(|| Mutex::new(None)).lock().unwrap() = Some(frames);
    options().lock().unwrap().insert("melonds_show_cursor".into(), CString::new("disabled").unwrap());
    // Wi-Fi des jeux DS : réseau indirect (sans pilote ni droits admin) et Kaeru WFC.
    options().lock().unwrap().insert("melonds_network_mode".into(), CString::new("indirect").unwrap());
    options().lock().unwrap().insert("melonds_firmware_wfc_dns".into(), CString::new("178.62.43.212").unwrap());
    for (k, v) in reglages {
        if let Ok(v) = CString::new(v) {
            options().lock().unwrap().insert(k.into(), v);
        }
    }
    VOLUME.store((volume.clamp(0.0, 1.0) * 1000.0) as u32, Ordering::Relaxed);
    for (i, t) in touches.iter().enumerate() {
        TOUCHES[i].store(*t, Ordering::Relaxed);
    }
    PAUSED.store(false, Ordering::Relaxed);

    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    std::thread::spawn(move || unsafe {
        let fail = |tx: &std::sync::mpsc::Sender<Result<(), String>>, e: String| {
            RUNNING.store(false, Ordering::Relaxed);
            let _ = tx.send(Err(e));
        };
        let lib = match libloading::Library::new(&core) {
            Ok(l) => l,
            Err(e) => return fail(&tx, format!("cœur introuvable : {e}")),
        };
        macro_rules! sym {
            ($name:literal, $t:ty) => {
                *lib.get::<$t>($name.as_bytes()).expect($name)
            };
        }
        sym!("retro_set_environment", unsafe extern "C" fn(unsafe extern "C" fn(c_uint, *mut c_void) -> bool))(environment);
        sym!("retro_set_video_refresh", unsafe extern "C" fn(unsafe extern "C" fn(*const c_void, c_uint, c_uint, usize)))(video_refresh);
        sym!("retro_set_audio_sample", unsafe extern "C" fn(unsafe extern "C" fn(i16, i16)))(audio_sample);
        sym!("retro_set_audio_sample_batch", unsafe extern "C" fn(unsafe extern "C" fn(*const i16, usize) -> usize))(audio_batch);
        sym!("retro_set_input_poll", unsafe extern "C" fn(unsafe extern "C" fn()))(input_poll);
        sym!("retro_set_input_state", unsafe extern "C" fn(unsafe extern "C" fn(c_uint, c_uint, c_uint, c_uint) -> i16))(input_state);
        sym!("retro_init", unsafe extern "C" fn())();

        let data = std::fs::read(&game).unwrap_or_default();
        let path = CString::new(game.clone()).unwrap();
        let info = GameInfo { path: path.as_ptr(), data: data.as_ptr() as *const c_void, size: data.len(), meta: std::ptr::null() };
        if !sym!("retro_load_game", unsafe extern "C" fn(*const GameInfo) -> bool)(&info) {
            return fail(&tx, "le cœur refuse ce jeu".into());
        }
        let mut av = AvInfo::default();
        sym!("retro_get_system_av_info", unsafe extern "C" fn(*mut AvInfo))(&mut av);
        let _stream = audio_stream(av.timing.sample_rate);
        let _ = tx.send(Ok(()));

        let run = sym!("retro_run", unsafe extern "C" fn());
        let reset = sym!("retro_reset", unsafe extern "C" fn());
        let frame = Duration::from_secs_f64(1.0 / if av.timing.fps > 0.0 { av.timing.fps } else { 60.0 });
        let mut next = Instant::now();
        while RUNNING.load(Ordering::Relaxed) {
            if PAUSED.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(16));
                next = Instant::now();
                continue;
            }
            if RESET.swap(false, Ordering::Relaxed) {
                reset();
            }
            run();
            next += frame;
            let now = Instant::now();
            if next > now {
                std::thread::sleep(next - now);
            } else if now - next > frame * 5 {
                next = now; // trop en retard : on repart de maintenant
            }
        }
        sym!("retro_unload_game", unsafe extern "C" fn())();
        sym!("retro_deinit", unsafe extern "C" fn())();
        audio().lock().unwrap().clear();
        *FRAMES.get().unwrap().lock().unwrap() = None;
        drop(lib);
    });
    rx.recv().map_err(|e| e.to_string())?
}
