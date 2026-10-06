// Émulateurs lancés dans la fenêtre d'En Local (--parent), en mode portable.
// En Local écrit leur configuration avant chaque lancement.
use std::os::windows::process::CommandExt;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::*;
use windows::Win32::UI::WindowsAndMessaging::*;

struct Game {
    child: Child,
    render: isize,
    webview: isize,
}

static GAME: Mutex<Option<Game>> = Mutex::new(None);
/// Eden se ferme par sa fenêtre principale et on attend la fin : arrêté net, il corrompt son cache de shaders.
static ARRET_PROPRE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
/// Jeu caché et gelé (menu ouvert).
static HIDDEN: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/* Habillage : le jeu garde son format, centré, avec le décor autour. Format 0 : plein écran. */
static FORMAT: Mutex<f64> = Mutex::new(0.0);
/// Agrandit un peu la fenêtre du jeu : les bords noirs de certains jeux passent sous le décor.
static ZOOM: Mutex<(f64, f64)> = Mutex::new((1.0, 1.0));
static HABILLAGE: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);
pub fn habillage(hwnd: isize) {
    HABILLAGE.store(hwnd, std::sync::atomic::Ordering::Relaxed);
}
/// Format du prochain jeu (largeur / hauteur).
pub fn format(o: &crate::reglages::Opts) {
    *FORMAT.lock().unwrap() = o.get("format_jeu").and_then(|v| v.parse::<f64>().ok()).filter(|f| (0.2..=5.0).contains(f)).unwrap_or(0.0);
    // Exemple : « 1.09x1.05 » (largeur x hauteur).
    let z = |s: &str| s.parse::<f64>().ok().filter(|z| (1.0..=1.2).contains(z)).unwrap_or(1.0);
    *ZOOM.lock().unwrap() = o.get("zoom_jeu").map(|v| v.split_once('x').map_or((z(v), z(v)), |(a, b)| (z(a), z(b)))).unwrap_or((1.0, 1.0));
}
/// DS : habillage autour de l'image dessinée par l'interface (0 : caché).
static DS: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
pub fn habillage_ds(parent: isize, f: f64, visible: bool) {
    let f = if (0.2..=5.0).contains(&f) { f } else { 0.0 };
    *FORMAT.lock().unwrap() = f;
    DS.store(visible, std::sync::atomic::Ordering::Relaxed);
    placer_habillage(parent, visible);
}
/// Zone du jeu dans la fenêtre (x, y, largeur, hauteur).
fn rect_jeu(parent: isize) -> (i32, i32, i32, i32) {
    let mut r = RECT::default();
    unsafe {
        let _ = GetClientRect(HWND(parent as _), &mut r);
    }
    let f = *FORMAT.lock().unwrap();
    if !habille(r.right, r.bottom) {
        return (0, 0, r.right, r.bottom);
    }
    // Marge tout autour. Même calcul dans js/habillage.js.
    let m = (r.bottom / 30).clamp(12, 40);
    let (w, h) = (r.right - 2 * m, r.bottom - 2 * m);
    if w as f64 / h as f64 > f {
        let gw = (h as f64 * f).round() as i32;
        (m + (w - gw) / 2, m, gw, h)
    } else {
        let gh = (w as f64 / f).round() as i32;
        (m, m + (h - gh) / 2, w, gh)
    }
}
/// Décor seulement si le format du jeu diffère de celui de la fenêtre.
fn habille(w: i32, h: i32) -> bool {
    let f = *FORMAT.lock().unwrap();
    f > 0.0 && w > 0 && h > 0 && ((w as f64 / h as f64) / f - 1.0).abs() > 0.04
}
fn rect_zoom(parent: isize) -> (i32, i32, i32, i32) {
    let (x, y, w, h) = rect_jeu(parent);
    let (zx, zy) = *ZOOM.lock().unwrap();
    if (zx <= 1.0 && zy <= 1.0) || x == 0 && y == 0 {
        return (x, y, w, h);
    }
    let (zw, zh) = ((w as f64 * zx).round() as i32, (h as f64 * zy).round() as i32);
    (x - (zw - w) / 2, y - (zh - h) / 2, zw, zh)
}
/// L'habillage suit la fenêtre, et reste là pour les notifications.
fn placer_habillage(parent: isize, visible: bool) {
    let h = HABILLAGE.load(std::sync::atomic::Ordering::Relaxed);
    if h == 0 {
        return;
    }
    unsafe {
        let mut r = RECT::default();
        let _ = GetClientRect(HWND(parent as _), &mut r);
        if !visible {
            let _ = ShowWindowAsync(HWND(h as _), SW_HIDE);
            return;
        }
        let mut o = windows::Win32::Foundation::POINT::default();
        let _ = windows::Win32::Graphics::Gdi::ClientToScreen(HWND(parent as _), &mut o);
        let _ = SetWindowPos(HWND(h as _), HWND::default(), o.x, o.y, r.right, r.bottom, SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_NOZORDER | SWP_ASYNCWINDOWPOS);
    }
}

/// Salon d'une session, donné par Loc.
#[derive(serde::Deserialize)]
pub struct Room {
    pub host: String,
    pub port: u16,
    pub password: String,
    pub nickname: String,
}

/// Code produit d'un jeu 3DS (ex. « EKJA »), pour connaître son nombre de joueurs.
pub fn product_code(path: &str) -> Option<String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = std::fs::File::open(path).ok()?;
    let mut hdr = [0u8; 0x200];
    f.read_exact(&mut hdr).ok()?;
    if &hdr[0x100..0x104] != b"NCSD" {
        return None;
    }
    let ncch = u32::from_le_bytes(hdr[0x120..0x124].try_into().unwrap()) as u64 * 0x200;
    let mut code = [0u8; 16];
    f.seek(SeekFrom::Start(ncch + 0x150)).ok()?;
    f.read_exact(&mut code).ok()?;
    let code = std::str::from_utf8(&code).ok()?.trim_end_matches('\0');
    let short = code.rsplit('-').next()?;
    (short.len() == 4 && short.bytes().all(|b| b.is_ascii_alphanumeric())).then(|| short.to_string())
}

/// Title ID d'un jeu 3DS (en-tête NCSD), pour retrouver le même jeu chez l'invité.
pub fn title_id(path: &str) -> Option<String> {
    use std::io::Read;
    let mut hdr = [0u8; 0x110];
    std::fs::File::open(path).ok()?.read_exact(&mut hdr).ok()?;
    if &hdr[0x100..0x104] != b"NCSD" {
        return None;
    }
    Some(format!("{:016X}", u64::from_le_bytes(hdr[0x108..0x110].try_into().unwrap())))
}

/// Pause : on gèle les threads de l'émulateur sauf celui de sa fenêtre.
/// Sinon Windows bloque En Local au changement de focus.
fn freeze(child: &Child, render: isize, frozen: bool) {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::*;
    use windows::Win32::System::Threading::*;
    let pid = child.id();
    let ui = unsafe { GetWindowThreadProcessId(HWND(render as _), None) };
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0) else { return };
        let mut e = THREADENTRY32 { dwSize: std::mem::size_of::<THREADENTRY32>() as u32, ..Default::default() };
        let mut more = Thread32First(snap, &mut e).is_ok();
        while more {
            if e.th32OwnerProcessID == pid && e.th32ThreadID != ui {
                if let Ok(h) = OpenThread(THREAD_SUSPEND_RESUME, false, e.th32ThreadID) {
                    if frozen {
                        SuspendThread(h);
                    } else {
                        // Dégel complet au cas où (u32::MAX : erreur).
                        while matches!(ResumeThread(h), 2..=0xFFFF_FFFE) {}
                    }
                    let _ = CloseHandle(h);
                }
            }
            more = Thread32Next(snap, &mut e).is_ok();
        }
        let _ = CloseHandle(snap);
    }
}

/// Image du jeu (largeur u16, hauteur u16, RGBA), affichée sous le menu.
pub fn capture() -> Option<Vec<u8>> {
    let render = GAME.lock().unwrap().as_ref()?.render;
    unsafe {
        let mut r = RECT::default();
        GetWindowRect(HWND(render as _), &mut r).ok()?;
        let (w, h) = (r.right - r.left, r.bottom - r.top);
        if w <= 0 || h <= 0 {
            return None;
        }
        let screen = GetDC(HWND::default());
        let mem = CreateCompatibleDC(screen);
        let bmp = CreateCompatibleBitmap(screen, w, h);
        let old = SelectObject(mem, bmp);
        let _ = BitBlt(mem, 0, 0, w, h, screen, r.left, r.top, SRCCOPY);
        let mut info = BITMAPINFO::default();
        info.bmiHeader = BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: w,
            biHeight: -h,
            biPlanes: 1,
            biBitCount: 32,
            ..Default::default()
        };
        let mut px = vec![0u8; (w * h * 4) as usize];
        GetDIBits(mem, bmp, 0, h as u32, Some(px.as_mut_ptr() as *mut _), &mut info, DIB_RGB_COLORS);
        SelectObject(mem, old);
        let _ = DeleteObject(bmp);
        let _ = DeleteDC(mem);
        ReleaseDC(HWND::default(), screen);
        // Fond gris uni : fenêtre pas encore dessinée.
        if px.chunks_exact(4).step_by(97).all(|c| c[..3] == [240, 240, 240]) {
            return None;
        }
        *SHOT.lock().unwrap() = (w, h, px.clone());
        let mut out = Vec::with_capacity(4 + px.len());
        out.extend_from_slice(&(w as u16).to_le_bytes());
        out.extend_from_slice(&(h as u16).to_le_bytes());
        for c in px.chunks_exact(4) {
            out.extend_from_slice(&[c[2], c[1], c[0], 255]);
        }
        Some(out)
    }
}

fn write_config(emu_dir: &str, o: &crate::reglages::Opts) -> std::io::Result<()> {
    let dir = format!("{emu_dir}\\user\\config");
    std::fs::create_dir_all(&dir)?;
    let ini = format!(
        "[UI]\nenable_discord_presence=false\nsingleWindowMode=false\nfullscreen=false\nconfirmClose=false\nfirstStart=false\nshowStatusBar=false\npauseWhenInBackground=false\nmuteWhenInBackground=false\nhideInactiveMouse=true\n\n\
         [Miscellaneous]\ncheck_for_update_on_start=false\n\n{}",
        crate::reglages::azahar_controles(o)
    );
    std::fs::write(format!("{dir}\\qt-config.ini"), ini + &crate::reglages::azahar_ini(o))?;
    crate::reglages::azahar_langue(emu_dir, o)
}


/// Les émulateurs sont dans un job Windows : si En Local se ferme ou plante, ils s'arrêtent aussi.
pub fn tie(child: Child) -> Child {
    use std::os::windows::io::AsRawHandle;
    use windows::Win32::System::JobObjects::*;
    static JOB: std::sync::OnceLock<isize> = std::sync::OnceLock::new();
    let job = *JOB.get_or_init(|| unsafe {
        let Ok(job) = CreateJobObjectW(None, None) else { return 0 };
        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let _ = SetInformationJobObject(job, JobObjectExtendedLimitInformation, &info as *const _ as *const _, std::mem::size_of_val(&info) as u32);
        job.0 as isize // fermé avec En Local
    });
    unsafe {
        let _ = AssignProcessToJobObject(windows::Win32::Foundation::HANDLE(job as _), windows::Win32::Foundation::HANDLE(child.as_raw_handle()));
    }
    child
}

/// Fenêtre WebView2 : elle se dessine par-dessus le jeu.
fn webview_of(parent: isize) -> isize {
    unsafe {
        FindWindowExW(HWND(parent as _), HWND::default(), windows::core::w!("WRY_WEBVIEW"), None).map_or(0, |h| h.0 as isize)
    }
}

/// Pendant le jeu, l'interface est poussée hors de la fenêtre (cachée, elle ne se dessinerait plus).
fn place_webview(webview: isize, visible: bool) {
    paint_shot(webview); // voir paint_shot
    // Sans redessin, sinon Cemu repeint sa fenêtre en gris.
    let (x, flags) = if visible { (0, SWP_SHOWWINDOW) } else { (-32000, SWP_NOREDRAW) };
    unsafe {
        let _ = SetWindowPos(HWND(webview as _), HWND::default(), x, 0, 0, 0, flags | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS);
    }
}

/// Dernière image du jeu (BGRA, largeur, hauteur), prise à l'ouverture du menu.
static SHOT: Mutex<(i32, i32, Vec<u8>)> = Mutex::new((0, 0, Vec::new()));
static WEBVIEW_PROC: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);

/// Peint la dernière image du jeu le temps que WebView2 arrive, pour éviter un flash gris.
fn paint_shot(webview: isize) {
    unsafe extern "system" fn proc(hwnd: HWND, msg: u32, w: WPARAM, l: LPARAM) -> windows::Win32::Foundation::LRESULT {
        match msg {
            WM_ERASEBKGND => return windows::Win32::Foundation::LRESULT(1),
            WM_PAINT => {
                let mut ps = PAINTSTRUCT::default();
                let dc = BeginPaint(hwnd, &mut ps);
                let mut r = RECT::default();
                let _ = GetClientRect(hwnd, &mut r);
                let shot = SHOT.lock().unwrap();
                if shot.2.is_empty() {
                    let black = CreateSolidBrush(windows::Win32::Foundation::COLORREF(0x000b0a0a));
                    FillRect(dc, &r, black);
                    let _ = DeleteObject(black);
                } else {
                    let mut info = BITMAPINFO::default();
                    info.bmiHeader = BITMAPINFOHEADER { biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32, biWidth: shot.0, biHeight: -shot.1, biPlanes: 1, biBitCount: 32, ..Default::default() };
                    let _ = SetStretchBltMode(dc, HALFTONE);
                    StretchDIBits(dc, 0, 0, r.right, r.bottom, 0, 0, shot.0, shot.1, Some(shot.2.as_ptr() as *const _), &info, DIB_RGB_COLORS, SRCCOPY);
                }
                let _ = EndPaint(hwnd, &ps);
                return windows::Win32::Foundation::LRESULT(0);
            }
            _ => {}
        }
        let old: WNDPROC = std::mem::transmute(WEBVIEW_PROC.load(std::sync::atomic::Ordering::Relaxed));
        CallWindowProcW(old, hwnd, msg, w, l)
    }
    unsafe {
        if WEBVIEW_PROC.load(std::sync::atomic::Ordering::Relaxed) == 0 {
            let old = SetWindowLongPtrW(HWND(webview as _), GWLP_WNDPROC, proc as *const () as isize);
            WEBVIEW_PROC.store(old, std::sync::atomic::Ordering::Relaxed);
        }
        let _ = InvalidateRect(HWND(webview as _), None, false);
    }
}

pub fn fit(parent: isize) {
    if let Some(g) = GAME.lock().unwrap().as_ref() {
        // Wry a replacé l'interface : en jeu, on la réécarte.
        if !HIDDEN.load(std::sync::atomic::Ordering::Relaxed) {
            place_webview(g.webview, false);
        }
        let (x, y, w, h) = rect_zoom(parent);
        unsafe {
            let _ = SetWindowPos(HWND(g.render as _), HWND::default(), x, y, w, h, SWP_NOZORDER | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS);
        }
        placer_habillage(parent, !HIDDEN.load(std::sync::atomic::Ordering::Relaxed));
    } else if DS.load(std::sync::atomic::Ordering::Relaxed) {
        placer_habillage(parent, true);
    }
}

/// Garde la fenêtre du jeu à notre taille (Eden la remet parfois en 1280×720).
fn garder_la_taille(render: isize, parent: isize) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(500));
        if GAME.lock().unwrap().as_ref().map(|g| g.render) != Some(render) {
            return;
        }
        let mut r = RECT::default();
        unsafe {
            let _ = GetWindowRect(HWND(render as _), &mut r);
        }
        let (_, _, w, h) = rect_zoom(parent);
        if (r.right - r.left, r.bottom - r.top) != (w, h) && w > 0 {
            fit(parent);
        }
    });
}

fn child_of(parent: isize, pid: u32) -> Option<HWND> {
    unsafe extern "system" fn each(hwnd: HWND, l: LPARAM) -> BOOL {
        let acc = &mut *(l.0 as *mut (u32, Option<HWND>));
        let mut owner = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut owner as *mut u32));
        if owner == acc.0 && GetParent(hwnd).map_or(false, |p| p.0 != std::ptr::null_mut()) && acc.1.is_none() {
            acc.1 = Some(hwnd);
        }
        true.into()
    }
    let mut acc: (u32, Option<HWND>) = (pid, None);
    unsafe {
        let _ = EnumChildWindows(HWND(parent as _), Some(each), LPARAM(&mut acc as *mut _ as isize));
    }
    acc.1
}


/// Jeu 3DS lisible par Azahar ? Certaines copies dites « décryptées » ne le sont pas : on vérifie l'ExeFS.
fn check_3ds(path: &str) -> Result<(), String> {
    use std::io::{Read, Seek, SeekFrom};
    let lower = path.to_lowercase();
    if !(lower.ends_with(".3ds") || lower.ends_with(".cci")) {
        return Ok(());
    }
    let mut f = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hdr = [0u8; 0x200];
    f.read_exact(&mut hdr).map_err(|e| e.to_string())?;
    if &hdr[0x100..0x104] != b"NCSD" {
        return Ok(());
    }
    let ncch = u32::from_le_bytes(hdr[0x120..0x124].try_into().unwrap()) as u64 * 0x200;
    let mut n = [0u8; 0x200];
    f.seek(SeekFrom::Start(ncch)).and_then(|_| f.read_exact(&mut n)).map_err(|e| e.to_string())?;
    const GM9: &str = "Décrypte-le avec GodMode9 sur ta 3DS (NCSD image options → Decrypt file).";
    let exefs = u32::from_le_bytes(n[0x1A0..0x1A4].try_into().unwrap()) as u64 * 0x200;
    let mut name = [0u8; 8];
    f.seek(SeekFrom::Start(ncch + exefs)).and_then(|_| f.read_exact(&mut name)).map_err(|e| e.to_string())?;
    let readable = &name[..5] == b".code";
    let marked = n[0x18F] & 0x04 != 0;
    match (readable, marked) {
        (true, true) => Ok(()),
        (true, false) => Err(format!("Ce jeu a été décrypté en partie seulement : son contenu est lisible mais son en-tête n'a pas été mis à jour (décryptage interrompu). {GM9}")),
        (false, true) => Err(format!("Ce jeu est marqué décrypté mais son contenu est toujours chiffré (outil de décryptage sans la bonne clé). {GM9}")),
        (false, false) => Err(format!("Ce jeu est encore chiffré. {GM9}")),
    }
}

pub fn start(exe: &str, emu_dir: &str, game: &str, parent: isize, room: Option<&Room>, o: &crate::reglages::Opts) -> Result<String, String> {
    // Simple avertissement : Azahar a le dernier mot.
    let warning = check_3ds(game).err();
    if GAME.lock().unwrap().is_some() {
        return Err("Un jeu tourne déjà".into());
    }
    write_config(emu_dir, o).map_err(|e| e.to_string())?;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut args = vec!["--parent".to_string(), parent.to_string()];
    args.extend(room_args(room));
    args.push(game.into());
    let _ = std::fs::remove_file(salon_en_jeu_fichier());
    let child = Command::new(exe)
        .args(&args)
        // Le style Windows 11 de Qt 6.9 fait planter les menus d'AzaharPlus.
        .env("QT_STYLE_OVERRIDE", "fusion")
        .env("ENLOCAL_SALON", salon_en_jeu_fichier())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map(tie)
        .map_err(|e| e.to_string())?;

    attach(child, parent, || match &warning {
        Some(w) => format!("Azahar n'a pas pu charger le jeu. {w}"),
        None => "le jeu ne s'est pas affiché (Azahar n'a pas pu le charger)".into(),
    })
}

/// Fichier surveillé par Eden pendant la partie, pour entrer dans un salon.
fn salon_en_jeu_fichier() -> String {
    format!("{}\\data\\salon-en-jeu.txt", crate::root())
}
/// Session lancée en pleine partie : Eden ou Azahar entre dans le salon sans relancer le jeu.
pub fn salon_en_jeu(r: &Room) -> Result<(), String> {
    let places = crate::salon::places_heberges(r.port).filter(|_| r.host == "127.0.0.1").unwrap_or(0);
    let propre = |v: &str| v.replace(['\n', '\r'], "");
    std::fs::write(salon_en_jeu_fichier(), format!("{}:{}\n{}\n{}\n{places}\n", propre(&r.host), r.port, propre(&r.nickname), propre(&r.password))).map_err(|e| e.to_string())
}

/// Salon de la session : nos forks y entrent dès que leur fenêtre est prête.
fn room_args(room: Option<&Room>) -> Vec<String> {
    room.map_or(Vec::new(), |r| {
        vec![
            "--join".into(), format!("{}:{}", r.host, r.port),
            "--nickname".into(), r.nickname.clone(),
            "--room-password".into(), r.password.clone(),
        ]
        .into_iter()
        // « Sur mon PC » : le jeu héberge le salon (Eden seulement).
        .chain(crate::salon::places_heberges(r.port).filter(|_| r.host == "127.0.0.1").map(|n| ["--host-room".to_string(), n.to_string()]).into_iter().flatten())
        .collect()
    })
}

/// Attend la fenêtre de jeu de l'émulateur, puis la prend en main.
fn attach(child: Child, parent: isize, failure: impl Fn() -> String) -> Result<String, String> {
    let pid = child.id();
    let deadline = Instant::now() + Duration::from_secs(30);
    let render = loop {
        if let Some(h) = child_of(parent, pid) {
            break h;
        }
        if Instant::now() > deadline {
            let mut child = child;
            let _ = child.kill();
            return Err(failure());
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    adopt(child, render, parent);
    Ok(format!("fenêtre de jeu {:?}", render.0))
}

fn adopt(child: Child, render: HWND, parent: isize) {
    let webview = webview_of(parent);
    *GAME.lock().unwrap() = Some(Game { child, render: render.0 as isize, webview });
    fit(parent);
    garder_la_taille(render.0 as isize, parent);
    // L'écran de chargement reste devant un temps fixe : l'image de l'émulateur ne se lit pas de l'extérieur.
    std::thread::sleep(Duration::from_millis(1500));
    HIDDEN.store(true, std::sync::atomic::Ordering::Relaxed);
    show(true);
}

/// GameCube ou Wii, d'après l'en-tête du disque (aussi en RVZ/WIA). .wbfs et .wad : Wii.
pub fn dolphin_console(path: &str) -> Option<&'static str> {
    use std::io::Read;
    let lower = path.to_lowercase();
    if lower.ends_with(".wbfs") || lower.ends_with(".wad") {
        return Some("Wii");
    }
    let mut hdr = [0u8; 0x100];
    std::fs::File::open(path).ok()?.read_exact(&mut hdr).ok()?;
    let disc = if &hdr[..3] == b"RVZ" || &hdr[..3] == b"WIA" { 0x58 } else { 0 };
    let be = |o: usize| u32::from_be_bytes(hdr[disc + o..disc + o + 4].try_into().unwrap());
    match (be(0x18), be(0x1C)) {
        (0x5D1C_9EA3, _) => Some("Wii"),
        (_, 0xC233_9F3D) => Some("GC"),
        _ => None,
    }
}

/// Identifiant du jeu GameCube/Wii (ex. « GALE01 »), au début de l'en-tête du disque.
pub fn dolphin_game_id(path: &str) -> Option<String> {
    use std::io::Read;
    let mut hdr = [0u8; 0x60];
    std::fs::File::open(path).ok()?.read_exact(&mut hdr).ok()?;
    let disc = if &hdr[..3] == b"RVZ" || &hdr[..3] == b"WIA" { 0x58 } else { 0 };
    let id = std::str::from_utf8(hdr.get(disc..disc + 6)?).ok()?;
    id.bytes().all(|b| b.is_ascii_alphanumeric()).then(|| id.to_string())
}

/// Configuration de Dolphin : la manette devient la manette GameCube 1 et la Wiimote 1.
fn dolphin_config(dir: &str, game: &str, o: &crate::reglages::Opts) -> std::io::Result<()> {
    std::fs::write(format!("{dir}\\portable.txt"), "")?;
    let cfg = format!("{dir}\\User\\Config");
    std::fs::create_dir_all(&cfg)?;
    std::fs::write(
        format!("{cfg}\\Dolphin.ini"),
        format!(
            "[Interface]\nConfirmStop = False\nUsePanicHandlers = False\nOnScreenDisplayMessages = True\n\
         [Display]\nRenderToMain = False\nFullscreen = False\n\
         [Analytics]\nPermissionAsked = True\nEnabled = False\n\
         [AutoUpdate]\nUpdateTrack = \n\
         [Core]\nSIDevice0 = 6\nWiimoteContinuousScanning = False\n\
         [Input]\nBackgroundInput = True\n\
         [General]\nUseDiscordPresence = False\nISOPaths = 1\nISOPath0 = {}\n",
            crate::dossier::jeux().display()
        ),
    )?;
    let name = crate::pad::NAME.lock().unwrap().clone();
    if name.is_empty() {
        return Ok(());
    }
    // Dolphin inverse les axes verticaux : « Y+ » = haut.
    let b = |x: &str| format!("`{x}`");
    // Disposition GameCube par position. Melee et Brawl : celle de Smash Ultimate.
    // Brawl se joue à la manette GameCube, sinon chaque appui compte pour deux manettes.
    let id = dolphin_game_id(game).unwrap_or_default();
    let smash = id.starts_with("GAL") || id.starts_with("RSB");
    let (a, b_, x, y, z) = if smash {
        ("Button E", "Button S", "Button N", "Button W", "`Shoulder R`|`Shoulder L`")
    } else {
        ("Button S", "Button W", "Button E", "Button N", "`Shoulder R`")
    };
    // Boutons choisis, sinon la disposition ci-dessus.
    let defauts = [("a", b(a)), ("b", b(b_)), ("x", b(x)), ("y", b(y)), ("z", z.to_string()), ("start", b("Start")), ("l", b("Trigger L")), ("r", b("Trigger R"))];
    let defauts: Vec<(&str, &str)> = defauts.iter().map(|(k, v)| (*k, v.as_str())).collect();
    let gc = [
        ("Main Stick/Up", "Left Y+"), ("Main Stick/Down", "Left Y-"), ("Main Stick/Left", "Left X-"), ("Main Stick/Right", "Left X+"),
        ("C-Stick/Up", "Right Y+"), ("C-Stick/Down", "Right Y-"), ("C-Stick/Left", "Right X-"), ("C-Stick/Right", "Right X+"),
        ("D-Pad/Up", "Pad N"), ("D-Pad/Down", "Pad S"), ("D-Pad/Left", "Pad W"), ("D-Pad/Right", "Pad E"),
    ];
    let mut ini = format!("[GCPad1]\nDevice = SDL/0/{name}\n");
    for (k, v) in crate::reglages::dolphin_gc(o, &defauts) {
        ini += &format!("{k} = {v}\n");
    }
    for (k, v) in gc {
        ini += &format!("{k} = {}\n", b(v));
    }
    std::fs::write(format!("{cfg}\\GCPadNew.ini"), ini)?;
    let wii = [
        ("D-Pad/Up", "Pad N"), ("D-Pad/Down", "Pad S"), ("D-Pad/Left", "Pad W"), ("D-Pad/Right", "Pad E"),
        ("IR/Up", "Right Y+"), ("IR/Down", "Right Y-"), ("IR/Left", "Right X-"), ("IR/Right", "Right X+"),
        ("Nunchuk/Stick/Up", "Left Y+"), ("Nunchuk/Stick/Down", "Left Y-"), ("Nunchuk/Stick/Left", "Left X-"), ("Nunchuk/Stick/Right", "Left X+"),
    ];
    let source = if id.starts_with("RSB") { 0 } else { 1 };
    let mut ini = format!("[Wiimote1]\nDevice = SDL/0/{name}\nSource = {source}\nExtension = Nunchuk\n");
    for (k, v) in wii {
        ini += &format!("{k} = {}\n", b(v));
    }
    for (k, v) in crate::reglages::dolphin_wii(o) {
        ini += &format!("{k} = {v}\n");
    }
    std::fs::write(format!("{cfg}\\WiimoteNew.ini"), ini)
}

fn dolphin_reglages(dir: &str, game: &str, o: &crate::reglages::Opts) -> Vec<String> {
    let _ = crate::reglages::dolphin_profil_mods(dir, &dolphin_game_id(game).unwrap_or_default(), o);
    let _ = crate::reglages::dolphin_ra(dir, o);
    crate::reglages::dolphin_args(o, dolphin_console(game) == Some("Wii"))
}

/// Réglages graphiques aussi écrits dans GFX.ini : Dolphin n'applique pas tout en ligne de commande.
fn gfx_ini(dir: &str, args: &[String]) -> std::io::Result<()> {
    let mut sections: Vec<(String, Vec<String>)> = Vec::new();
    for a in args.iter().filter_map(|a| a.strip_prefix("GFX.")) {
        let Some((cle, valeur)) = a.split_once('=') else { continue };
        let Some((section, cle)) = cle.split_once('.') else { continue };
        let ligne = format!("{cle} = {valeur}");
        match sections.iter_mut().find(|(s, _)| s == section) {
            Some((_, l)) => l.push(ligne),
            None => sections.push((section.to_string(), vec![ligne])),
        }
    }
    let texte: String = sections.iter().map(|(s, l)| format!("[{s}]\n{}\n", l.join("\n"))).collect();
    std::fs::write(format!("{dir}\\User\\Config\\GFX.ini"), texte)
}

/// GameCube / Wii : Dolphin sans interface (-b).
pub fn start_dolphin(dir: &str, game: &str, parent: isize, o: &crate::reglages::Opts) -> Result<String, String> {
    if GAME.lock().unwrap().is_some() {
        return Err("Un jeu tourne déjà".into());
    }
    dolphin_config(dir, game, o).map_err(|e| e.to_string())?;
    let reglages = dolphin_reglages(dir, game, o);
    gfx_ini(dir, &reglages).map_err(|e| e.to_string())?;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let child = Command::new(format!("{dir}\\Dolphin.exe"))
        .args(["-b", "--parent", &parent.to_string()])
        .args(reglages)
        .args(["-e", game])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map(tie)
        .map_err(|e| e.to_string())?;
    attach(child, parent, || "le jeu ne s'est pas affiché (Dolphin n'a pas pu le charger)".into())
}

pub fn is_running() -> bool {
    let mut g = GAME.lock().unwrap();
    if let Some(game) = g.as_mut() {
        if matches!(game.child.try_wait(), Ok(Some(_))) {
            place_webview(game.webview, true);
            placer_habillage(0, false);
            *g = None;
        }
    }
    g.is_some()
}

/// Menu : gèle et cache le jeu, ou le remontre.
pub fn show(visible: bool) {
    // Windows compte les gels : un seul changement d'état à la fois.
    if HIDDEN.swap(!visible, std::sync::atomic::Ordering::Relaxed) == !visible {
        return;
    }
    if let Some(g) = GAME.lock().unwrap().as_ref() {
        // La fenêtre du jeu reste active (voir freeze) : on la cache derrière l'interface pendant le menu.
        unsafe {
            let parent = GetParent(HWND(g.render as _)).map_or(0, |p| p.0 as isize);
            if visible {
                freeze(&g.child, g.render, false);
                let _ = ShowWindowAsync(HWND(g.render as _), SW_SHOWNA);
                std::thread::sleep(Duration::from_millis(150));
                place_webview(g.webview, false);
                placer_habillage(parent, true);
            } else {
                placer_habillage(parent, false);
                place_webview(g.webview, true);
                std::thread::sleep(Duration::from_millis(50));
                let _ = ShowWindowAsync(HWND(g.render as _), SW_HIDE);
                freeze(&g.child, g.render, true);
            }
        }
    }
}

pub fn stop() {
    placer_habillage(0, false);
    if let Some(mut g) = GAME.lock().unwrap().take() {
        HIDDEN.store(false, std::sync::atomic::Ordering::Relaxed);
        freeze(&g.child, g.render, false);
        unsafe {
            place_webview(g.webview, true);
            // Fermer la fenêtre de jeu arrête l'émulation proprement.
            let _ = PostMessageW(HWND(g.render as _), WM_CLOSE, WPARAM(0), LPARAM(0));
        }
        if ARRET_PROPRE.swap(false, std::sync::atomic::Ordering::Relaxed) {
            // Eden ferme sa fenêtre principale et finit en arrière-plan. Le prochain lancement l'attend.
            close_top_windows(g.child.id());
            let mut child = g.child;
            *FERMETURE.lock().unwrap() = Some(std::thread::spawn(move || {
                let fin = Instant::now() + Duration::from_secs(10);
                while Instant::now() < fin && matches!(child.try_wait(), Ok(None)) {
                    std::thread::sleep(Duration::from_millis(100));
                }
                let _ = child.kill();
            }));
            return;
        }
        std::thread::sleep(Duration::from_millis(800));
        let _ = g.child.kill();
    }
}

static FERMETURE: Mutex<Option<std::thread::JoinHandle<()>>> = Mutex::new(None);
/// Attend la fin d'Eden avant de le relancer ou de quitter l'app.
pub fn attendre_fermeture() {
    let fermeture = FERMETURE.lock().unwrap().take();
    if let Some(t) = fermeture {
        let _ = t.join();
    }
}

/// WM_CLOSE à toutes les fenêtres du processus, cachées comprises.
fn close_top_windows(pid: u32) {
    unsafe extern "system" fn each(hwnd: HWND, l: LPARAM) -> BOOL {
        let mut owner = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut owner as *mut u32));
        if owner == l.0 as u32 {
            let _ = PostMessageW(hwnd, WM_CLOSE, WPARAM(0), LPARAM(0));
        }
        true.into()
    }
    unsafe {
        let _ = EnumWindows(Some(each), LPARAM(pid as isize));
    }
}

/* Wii U (Cemu) */

/// Configuration de Cemu. Avec settings.xml, l'assistant de premier lancement ne s'ouvre pas.
fn cemu_config(dir: &str, o: &crate::reglages::Opts) -> std::io::Result<()> {
    let cfg = format!("{dir}\\portable");
    std::fs::create_dir_all(format!("{cfg}\\controllerProfiles"))?;
    // Réécrit à chaque lancement : fenêtre hors écran, son sur la sortie par défaut, sans notifications.
    let r = crate::reglages::cemu(o);
    std::fs::write(
        format!("{cfg}\\settings.xml"),
        format!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<content>\n  <check_update>false</check_update>\n  <fullscreen>false</fullscreen>\n  <fullscreen_menubar>false</fullscreen_menubar>\n{}  <window_position>\n    <x>-20000</x>\n    <y>-20000</y>\n  </window_position>\n  <GraphicPack>\n{}  </GraphicPack>\n  <Graphic>\n    <api>{}</api>\n{}    <Notification>\n      <ControllerProfiles>false</ControllerProfiles>\n      <ControllerBattery>false</ControllerBattery>\n      <ShaderCompiling>false</ShaderCompiling>\n      <FriendService>false</FriendService>\n    </Notification>\n  </Graphic>\n  <Audio>\n    <api>3</api>\n    <TVDevice>default</TVDevice>\n    <TVVolume>{}</TVVolume>\n  </Audio>\n</content>\n",
            r.langue.map_or(String::new(), |l| format!("  <console_language>{l}</console_language>\n")),
            r.packs,
            r.api,
            r.graphic,
            r.volume
        ),
    )?;
    let name = crate::pad::NAME.lock().unwrap().clone();
    let Some(guid) = sdl2_guid(dir, &crate::pad::GUID.lock().unwrap()) else {
        return Ok(());
    };
    // Numéros Cemu : boutons SDL 0-31, ZL 32, ZR 33, croix 34-37, axes + 38-43, axes - 44-49.
    let mut map = crate::reglages::cemu_touches(o);
    map.extend([
        (11, 11), (12, 12), (13, 13), (14, 14),
        (17, 45), (18, 39), (19, 44), (20, 38),
        (21, 47), (22, 41), (23, 46), (24, 40),
    ]);
    let entries: String = map.iter().map(|(m, b)| format!("        <entry>\n          <mapping>{m}</mapping>\n          <button>{b}</button>\n        </entry>\n")).collect();
    let xml = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<emulated_controller>\n  <type>Wii U GamePad</type>\n  <controller>\n    <api>SDLController</api>\n    <uuid>0_{guid}</uuid>\n    <display_name>{name}</display_name>\n    <rumble>0.5</rumble>\n    <axis>\n      <deadzone>0.15</deadzone>\n      <range>1</range>\n    </axis>\n    <rotation>\n      <deadzone>0.15</deadzone>\n      <range>1</range>\n    </rotation>\n    <trigger>\n      <deadzone>0.25</deadzone>\n      <range>1</range>\n    </trigger>\n    <mappings>\n{entries}    </mappings>\n  </controller>\n</emulated_controller>\n"
    );
    std::fs::write(format!("{cfg}\\controllerProfiles\\controller0.xml"), xml)
}

/// GUID de la manette pour Cemu, demandé au SDL2.dll officiel : celui de SDL3 diffère parfois.
fn sdl2_guid(dir: &str, sdl3: &str) -> Option<String> {
    #[repr(C)]
    struct Guid([u8; 16]);
    unsafe {
        let lib = libloading::Library::new(format!("{dir}\\SDL2.dll")).ok()?;
        let hint: libloading::Symbol<unsafe extern "C" fn(*const u8, *const u8) -> i32> = lib.get(b"SDL_SetHint\0").ok()?;
        let init: libloading::Symbol<unsafe extern "C" fn(u32) -> i32> = lib.get(b"SDL_Init\0").ok()?;
        let count: libloading::Symbol<unsafe extern "C" fn() -> i32> = lib.get(b"SDL_NumJoysticks\0").ok()?;
        let is_pad: libloading::Symbol<unsafe extern "C" fn(i32) -> i32> = lib.get(b"SDL_IsGameController\0").ok()?;
        let guid_of: libloading::Symbol<unsafe extern "C" fn(i32) -> Guid> = lib.get(b"SDL_JoystickGetDeviceGUID\0").ok()?;
        let quit: libloading::Symbol<unsafe extern "C" fn()> = lib.get(b"SDL_Quit\0").ok()?;
        for h in ["PS4", "PS5", "GAMECUBE", "SWITCH", "JOY_CONS", "STADIA", "STEAM", "LUNA"] {
            hint(format!("SDL_JOYSTICK_HIDAPI_{h}\0").as_ptr(), b"1\0".as_ptr());
        }
        const SDL_INIT_GAMECONTROLLER: u32 = 0x2000;
        if init(SDL_INIT_GAMECONTROLLER) < 0 {
            return None;
        }
        let pads: Vec<String> = (0..count()).filter(|&i| is_pad(i) != 0).map(|i| guid_of(i).0.iter().map(|b| format!("{b:02x}")).collect()).collect();
        quit();
        // Octets 4 et suivants : le bus et le CRC du nom peuvent différer.
        pads.iter().find(|g| g.get(8..) == sdl3.get(8..)).or(pads.first()).cloned()
    }
}

fn title_of(hwnd: HWND) -> String {
    let mut buf = [0u16; 256];
    let n = unsafe { GetWindowTextW(hwnd, &mut buf) };
    String::from_utf16_lossy(&buf[..n.max(0) as usize])
}

fn top_window(pid: u32, prefix: &str) -> Option<HWND> {
    unsafe extern "system" fn each(hwnd: HWND, l: LPARAM) -> BOOL {
        let acc = &mut *(l.0 as *mut (u32, String, Option<HWND>));
        let mut owner = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut owner as *mut u32));
        if owner == acc.0 && IsWindowVisible(hwnd).as_bool() {
            let mut buf = [0u16; 256];
            let n = GetWindowTextW(hwnd, &mut buf);
            if String::from_utf16_lossy(&buf[..n as usize]).starts_with(acc.1.as_str()) {
                acc.2 = Some(hwnd);
                return false.into();
            }
        }
        true.into()
    }
    let mut acc: (u32, String, Option<HWND>) = (pid, prefix.to_string(), None);
    unsafe {
        let _ = EnumWindows(Some(each), LPARAM(&mut acc as *mut _ as isize));
    }
    acc.2
}

/// Wii U : MAJ et DLC décompressés du dossier des jeux, reliés dans Cemu par une jonction :
/// Cemu ne les lit que dans son mlc01. Rien n'est copié. Title ID : code\app.xml (celui de meta.xml est parfois celui du jeu).
pub fn lier_contenus_wiiu(dir: &str) {
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut a_voir = vec![(crate::dossier::jeux().join("Wii U"), 0)];
    while let Some((d, profondeur)) = a_voir.pop() {
        let meta = [d.join("code").join("app.xml"), d.join("meta").join("meta.xml")].iter().find_map(|f| std::fs::read_to_string(f).ok()).unwrap_or_default();
        if let Some(id) = meta.split("<title_id").nth(1).and_then(|r| r.split('>').nth(1)?.split('<').next()).map(|x| x.trim().to_lowercase()) {
            if id.len() == 16 && id.bytes().all(|b| b.is_ascii_hexdigit()) && (id.starts_with("0005000e") || id.starts_with("0005000c")) {
                let lien = std::path::PathBuf::from(format!("{dir}\\portable\\mlc01\\usr\\title\\{}\\{}", &id[..8], &id[8..]));
                if !lien.exists() {
                    let _ = std::fs::create_dir_all(lien.parent().unwrap());
                    // Chemins passés en variables d'environnement : jamais interprétés comme du code.
                    let _ = Command::new("powershell")
                        .args(["-NoProfile", "-NonInteractive", "-Command", "New-Item -ItemType Junction -Path $env:EL_LIEN -Target ([WildcardPattern]::Escape($env:EL_CIBLE)) | Out-Null"])
                        .env("EL_LIEN", &lien)
                        .env("EL_CIBLE", &d)
                        .creation_flags(CREATE_NO_WINDOW)
                        .output();
                }
            }
            continue;
        }
        if profondeur < 3 {
            for e in std::fs::read_dir(&d).into_iter().flatten().flatten() {
                if e.file_type().is_ok_and(|t| t.is_dir()) {
                    a_voir.push((e.path(), profondeur + 1));
                }
            }
        }
    }
}

/// Wii U : Cemu collé dans notre fenêtre, sans menu ni cadre.
pub fn start_cemu(dir: &str, game: &str, parent: isize, o: &crate::reglages::Opts) -> Result<String, String> {
    if GAME.lock().unwrap().is_some() {
        return Err("Un jeu tourne déjà".into());
    }
    cemu_config(dir, o).map_err(|e| e.to_string())?;
    lier_contenus_wiiu(dir);
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut child = Command::new(format!("{dir}\\Cemu.exe")).args(["-g", game]).creation_flags(CREATE_NO_WINDOW).spawn().map(tie).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(30);
    let window = loop {
        if let Some(h) = top_window(child.id(), "Cemu") {
            break h;
        }
        if Instant::now() > deadline || matches!(child.try_wait(), Ok(Some(_))) {
            let _ = child.kill();
            return Err("le jeu ne s'est pas affiché (Cemu n'a pas pu le charger)".into());
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    // Fenêtre de Cemu montrée seulement une fois le jeu lancé (son titre affiche alors les FPS).
    let ready = Instant::now() + Duration::from_secs(120);
    while Instant::now() < ready && !title_of(window).contains("FPS") {
        if matches!(child.try_wait(), Ok(Some(_))) {
            return Err("le jeu ne s'est pas affiché (Cemu n'a pas pu le charger)".into());
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    unsafe {
        let _ = SetMenu(window, HMENU::default());
        let style = GetWindowLongPtrW(window, GWL_STYLE);
        let style = (style & !(WS_OVERLAPPEDWINDOW.0 as isize | WS_POPUP.0 as isize)) | WS_CHILD.0 as isize;
        SetWindowLongPtrW(window, GWL_STYLE, style);
        let _ = SetParent(window, HWND(parent as _));
        let _ = SetWindowPos(window, HWND_TOP, 0, 0, 0, 0, SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }
    adopt(child, window, parent);
    Ok(format!("fenêtre de jeu {:?}", window.0))
}

/* Switch (Eden) */

/// Dossiers des MAJ et DLC pour Eden, et jamais de confirmation pour arrêter un jeu (sa fenêtre est cachée).
fn eden_updates_dir(ini: &str, dirs: &[String]) -> std::io::Result<()> {
    let old = std::fs::read_to_string(ini).unwrap_or_default();
    let mut out: Vec<String> = old.lines().filter(|l| !l.starts_with("Paths\\external_content_dirs\\") && !l.starts_with("confirmStop")).map(String::from).collect();
    let mut entries = vec![format!("Paths\\external_content_dirs\\size={}", dirs.len())];
    entries.extend(dirs.iter().enumerate().map(|(i, d)| format!("Paths\\external_content_dirs\\{}\\path={d}", i + 1)));
    entries.extend(["confirmStop\\default=false".into(), "confirmStop=2".into()]);
    let at = match out.iter().position(|l| l == "[UI]") {
        Some(i) => i + 1,
        None => {
            out.push("[UI]".into());
            out.len()
        }
    };
    out.splice(at..at, entries);
    std::fs::write(ini, out.join("\n") + "\n")
}

/// Mise à jour choisie : dossier de liens physiques vers ces fichiers, refait à chaque lancement.
fn contenu_choisi(fichiers: &[std::path::PathBuf]) -> std::io::Result<Vec<String>> {
    // Un lien physique ne change pas de disque : un dossier de liens par disque.
    let lecteur = |p: &std::path::Path| p.components().next().map(|c| c.as_os_str().to_string_lossy().to_uppercase()).unwrap_or_default();
    let chez_nous = std::path::PathBuf::from(format!("{}\\data\\eden-contenu", crate::root()));
    let mut dossiers: Vec<std::path::PathBuf> = Vec::new();
    for (n, f) in fichiers.iter().enumerate() {
        let dir = if lecteur(f) == lecteur(&chez_nous) { chez_nous.clone() } else { std::path::PathBuf::from(format!("{}\\.en-local-contenu", lecteur(f))) };
        if !dossiers.contains(&dir) {
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir)?;
            if dir != chez_nous {
                let _ = std::process::Command::new("attrib").args(["+h", &dir.to_string_lossy()]).creation_flags(0x0800_0000).status();
            }
            dossiers.push(dir.clone());
        }
        // Numérotés, car deux sous-dossiers peuvent avoir un fichier du même nom.
        let nom = format!("{n:03} {}", f.file_name().map(|x| x.to_string_lossy()).unwrap_or_default());
        std::fs::hard_link(f, dir.join(nom))?;
    }
    Ok(dossiers.into_iter().map(|d| d.to_string_lossy().into_owned()).collect())
}

/// Carte réseau qui sort sur Internet, par son nom Windows.
fn carte_reseau() -> Option<String> {
    use windows::Win32::NetworkManagement::IpHelper::*;
    use windows::Win32::NetworkManagement::Ndis::IfOperStatusUp;
    let flags = GAA_FLAG_INCLUDE_GATEWAYS | GAA_FLAG_SKIP_MULTICAST;
    let mut taille = 0u32;
    unsafe {
        GetAdaptersAddresses(2, flags, None, None, &mut taille);
        if taille == 0 {
            return None;
        }
        // u64 pour l'alignement des structures.
        let mut tampon = vec![0u64; (taille as usize).div_ceil(8)];
        let premiere = tampon.as_mut_ptr() as *mut IP_ADAPTER_ADDRESSES_LH;
        if GetAdaptersAddresses(2, flags, None, Some(premiere), &mut taille) != 0 {
            return None;
        }
        let mut a = premiere;
        while !a.is_null() {
            let c = &*a;
            let prefixe = c.FirstUnicastAddress.as_ref().map_or(32, |u| u.OnLinkPrefixLength);
            if c.OperStatus == IfOperStatusUp && !c.FirstGatewayAddress.is_null() && prefixe < 31 {
                return c.FriendlyName.to_string().ok();
            }
            a = c.Next;
        }
    }
    None
}

#[allow(clippy::too_many_arguments)]
/// Switch : Eden en mode portable. Les clés et le firmware viennent de la Switch du joueur, jamais fournis.
/// contenu : fichiers de MAJ et DLC. choisie : une mise à jour choisie parmi plusieurs.
pub fn start_eden(dir: &str, game: &str, parent: isize, room: Option<&Room>, contenu: Vec<std::path::PathBuf>, choisie: bool, o: &crate::reglages::Opts, title_id: Option<&str>) -> Result<String, String> {
    if GAME.lock().unwrap().is_some() {
        return Err("Un jeu tourne déjà".into());
    }
    attendre_fermeture();
    let user = format!("{dir}\\user");
    if !std::path::Path::new(&format!("{user}\\keys\\prod.keys")).exists() {
        return Err(format!("Il manque les clés de ta Switch : copie le prod.keys sorti de ta console (Lockpick_RCM) dans {user}\\keys."));
    }
    let firmware = std::fs::read_dir(format!("{user}\\nand\\system\\Contents\\registered")).map_or(false, |mut d| d.next().is_some());
    if !firmware {
        return Err(format!("Il manque le firmware de ta Switch : copie les fichiers .nca sortis de ta console (TegraExplorer) dans {user}\\nand\\system\\Contents\\registered."));
    }
    std::fs::create_dir_all(format!("{user}\\config")).map_err(|e| e.to_string())?;
    let dossiers = if choisie {
        contenu_choisi(&contenu).map_err(|e| format!("Mise à jour choisie : {e}"))?
    } else {
        let mut d: Vec<String> = contenu.iter().filter_map(|f| Some(f.parent()?.to_string_lossy().into_owned())).collect();
        d.sort();
        d.dedup();
        d
    };
    eden_updates_dir(&format!("{user}\\config\\qt-config.ini"), &dossiers).map_err(|e| e.to_string())?;
    let ini = format!("{user}\\config\\qt-config.ini");
    let texte = std::fs::read_to_string(&ini).unwrap_or_default();
    let texte = crate::reglages::eden(&texte, o, title_id);
    // En session, même graine du hasard pour tous, sinon Smash se désynchronise.
    let graine = [("rng_seed_enabled".to_string(), room.is_some().to_string()), ("rng_seed".to_string(), "0".to_string())];
    let mut texte = crate::reglages::ini_set(&texte, "System", &graine);
    // Raccourcis manette d'Eden désactivés : Capture et Home sont gérés par En Local.
    const RACCOURCIS: [&str; 14] = [
        "Audio%20Mute\\Unmute", "Audio%20Volume%20Down", "Audio%20Volume%20Up", "Capture%20Screenshot", "Change%20Adapting%20Filter",
        "Change%20Docked%20Mode", "Change%20GPU%20Mode", "Continue\\Pause%20Emulation", "Exit%20Eden", "Fullscreen",
        "Load\\Remove%20Amiibo", "Restart%20Emulation", "Stop%20Emulation", "Toggle%20Framerate%20Limit",
    ];
    let mut ui: Vec<(String, String)> = RACCOURCIS.iter().map(|r| (format!("Shortcuts\\Main%20Window\\{r}\\Controller_KeySeq"), String::new())).collect();
    ui.push(("Screenshots\\enable_screenshot_save_as".to_string(), "false".to_string()));
    texte = crate::reglages::ini_set(&texte, "UI", &ui);
    // Sinon Eden prend la première carte réseau, parfois un VPN, et le local sans fil échoue.
    if let Some(carte) = carte_reseau() {
        texte = crate::reglages::ini_set(&texte, "Network", &[("network_interface".to_string(), carte)]);
    }
    std::fs::write(&ini, texte).map_err(|e| e.to_string())?;
    let mut args = vec!["--parent".to_string(), parent.to_string()];
    args.extend(room_args(room));
    args.extend(["-g".into(), game.into()]);
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let _ = std::fs::remove_file(salon_en_jeu_fichier());
    let child = Command::new(format!("{dir}\\eden.exe")).args(&args).env("ENLOCAL_SALON", salon_en_jeu_fichier()).env("ENLOCAL_TOUCHES", crate::reglages::eden_touches(o)).env("ENLOCAL_MANETTE", *crate::pad::KIND.lock().unwrap()).env(if title_id.is_some_and(crate::reglages::en_main) { "ENLOCAL_EN_MAIN" } else { "ENLOCAL_PAS_EN_MAIN" }, "1").creation_flags(CREATE_NO_WINDOW).spawn().map(tie).map_err(|e| e.to_string())?;
    let r = attach(child, parent, || "le jeu ne s'est pas affiché (Eden n'a pas pu le charger)".into());
    ARRET_PROPRE.store(r.is_ok(), std::sync::atomic::Ordering::Relaxed);
    r
}

/* Netplay GameCube / Wii (Dolphin) */

/// Salle d'attente : pas encore de fenêtre de jeu.
static LOBBY: Mutex<Option<Child>> = Mutex::new(None);
fn netplay_status() -> String {
    format!("{}\\data\\netplay.txt", crate::root())
}

/// État envoyé à l'interface toutes les 500 ms.
#[derive(Clone, serde::Serialize, Default)]
pub struct Lobby {
    pub players: u32,
    pub code: String,
    pub error: bool,
    pub playing: bool,
    pub closed: bool,
}

fn read_lobby() -> Lobby {
    let text = std::fs::read_to_string(netplay_status()).unwrap_or_default();
    let mut l = Lobby::default();
    for line in text.lines() {
        match line.split_once(' ') {
            Some(("players", n)) => l.players = n.trim().parse().unwrap_or(0),
            Some(("code", c)) => l.code = c.trim().to_string(),
            Some(("state", "error")) => l.error = true,
            _ => {}
        }
    }
    l
}

/// Netplay Dolphin : hôte (host_code vide) ou invité. La fenêtre de jeu peut apparaître plusieurs fois.
pub fn start_netplay(dir: &str, game: &str, host_code: &str, name: &str, parent: isize, o: &crate::reglages::Opts, on_change: impl Fn(Lobby) + Send + 'static) -> Result<(), String> {
    if GAME.lock().unwrap().is_some() || LOBBY.lock().unwrap().is_some() {
        return Err("Un jeu tourne déjà".into());
    }
    dolphin_config(dir, game, o).map_err(|e| e.to_string())?;
    let _ = std::fs::create_dir_all(format!("{}\\data", crate::root()));
    for ext in ["", ".start", ".stop", ".msg"] {
        let _ = std::fs::remove_file(format!("{}{ext}", netplay_status()));
    }
    let mut args = vec!["--parent".to_string(), parent.to_string(), "--netplay-name".into(), name.into(), "--netplay-status".into(), netplay_status()];
    let reglages = dolphin_reglages(dir, game, o);
    gfx_ini(dir, &reglages).map_err(|e| e.to_string())?;
    args.extend(reglages);
    if host_code.is_empty() {
        args.extend(["--netplay-host".into(), game.into()]);
    } else {
        args.extend(["--netplay-join".into(), host_code.into()]);
    }
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let child = Command::new(format!("{dir}\\Dolphin.exe")).args(&args).creation_flags(CREATE_NO_WINDOW).spawn().map(tie).map_err(|e| e.to_string())?;
    let pid = child.id();
    *LOBBY.lock().unwrap() = Some(child);
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(500));
        let mut lobby = LOBBY.lock().unwrap();
        if let Some(child) = lobby.as_mut() {
            if matches!(child.try_wait(), Ok(Some(_))) {
                *lobby = None;
                return on_change(Lobby { closed: true, ..read_lobby() });
            }
            if let Some(render) = child_of(parent, pid) {
                let child = lobby.take().unwrap();
                drop(lobby);
                adopt(child, render, parent);
                on_change(Lobby { playing: true, ..read_lobby() });
                continue;
            }
            drop(lobby);
            on_change(read_lobby());
            continue;
        }
        drop(lobby);
        let mut game = GAME.lock().unwrap();
        let Some(g) = game.as_mut() else { return on_change(Lobby { closed: true, ..read_lobby() }) };
        if matches!(g.child.try_wait(), Ok(Some(_))) {
            place_webview(g.webview, true);
            *game = None;
            return on_change(Lobby { closed: true, ..read_lobby() });
        }
        if !unsafe { IsWindow(HWND(g.render as _)) }.as_bool() {
            let g = game.take().unwrap();
            freeze(&g.child, g.render, false);
            place_webview(g.webview, true);
            *LOBBY.lock().unwrap() = Some(g.child);
            drop(game);
            on_change(read_lobby());
            continue;
        }
        drop(game);
        on_change(Lobby { playing: true, ..read_lobby() });
    });
    Ok(())
}

fn netplay_file(ext: &str, text: &str) -> Result<(), String> {
    std::fs::write(format!("{}{ext}", netplay_status()), text).map_err(|e| e.to_string())
}

pub fn netplay_launch() -> Result<(), String> {
    netplay_file(".start", "")
}

/// Arrête la partie pour tous, Dolphin reste en salle d'attente.
pub fn netplay_stop() -> Result<(), String> {
    if let Some(g) = GAME.lock().unwrap().as_ref() {
        freeze(&g.child, g.render, false);
    }
    netplay_file(".stop", "")
}

pub fn netplay_message(text: &str) -> Result<(), String> {
    netplay_file(".msg", text)
}

pub fn netplay_cancel() {
    if let Some(mut child) = LOBBY.lock().unwrap().take() {
        let _ = child.kill();
    }
}

#[cfg(test)]
mod tests {
    #[test]
    #[ignore]
    fn carte_reseau() {
        println!("carte : {:?}", super::carte_reseau());
    }
    use super::*;

    #[test]
    fn dossier_maj_dlc_donne_a_eden() {
        let ini = std::env::temp_dir().join("enlocal-qt-config.ini");
        std::fs::write(&ini, "[UI]\nPaths\\external_content_dirs\\size=0\nPaths\\gamedirs\\size=3\n[Core]\n").unwrap();
        let maj = [r"E:\Jeux\Switch\Zelda\MAJ".to_string(), r"E:\Jeux\Switch\Smash\DLC et MAJ".to_string()];
        eden_updates_dir(ini.to_str().unwrap(), &maj[..1]).unwrap();
        eden_updates_dir(ini.to_str().unwrap(), &maj).unwrap();
        let text = std::fs::read_to_string(&ini).unwrap();
        assert_eq!(text.matches("external_content_dirs").count(), 3);
        assert_eq!(text.matches("confirmStop").count(), 2);
        assert!(text.contains("confirmStop=2\n"));
        assert!(text.starts_with(&format!("[UI]\nPaths\\external_content_dirs\\size=2\nPaths\\external_content_dirs\\1\\path={}\nPaths\\external_content_dirs\\2\\path={}\n", maj[0], maj[1])));
        assert!(text.contains("gamedirs\\size=3\n[Core]"));
    }

    #[test]
    fn emulateur_lie_a_en_local() {
        use std::os::windows::io::AsRawHandle;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let mut child = tie(Command::new("ping").args(["-n", "5", "127.0.0.1"]).creation_flags(CREATE_NO_WINDOW).spawn().unwrap());
        let mut inside = BOOL(0);
        unsafe { windows::Win32::System::JobObjects::IsProcessInJob(windows::Win32::Foundation::HANDLE(child.as_raw_handle()), None, &mut inside).unwrap() };
        let _ = child.kill();
        assert!(inside.as_bool());
    }
}

#[cfg(test)]
mod tests_contenu {
    /// Test : mise à jour choisie sur un autre disque que l'app.
    #[test]
    #[ignore]
    fn autre_disque() {
        let f = std::env::temp_dir().join("enlocal-test-maj [0100000000000800][v65536].nsp"); // C:, l app de test est sur E:
        std::fs::write(&f, b"test").unwrap();
        let dirs = super::contenu_choisi(std::slice::from_ref(&f)).unwrap();
        println!("dossiers : {dirs:?}");
        let lien = std::path::Path::new(&dirs[0]).join("000 enlocal-test-maj [0100000000000800][v65536].nsp");
        assert_eq!(std::fs::read(&lien).unwrap(), b"test");
        let _ = std::fs::remove_dir_all(&dirs[0]);
        let _ = std::fs::remove_file(&f);
    }
}
