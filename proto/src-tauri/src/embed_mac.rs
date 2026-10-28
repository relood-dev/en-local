// macOS : l'émulateur garde sa propre fenêtre pour l'instant (étape 1). Le jeu est mis en pause
// (SIGSTOP) quand le menu d'En Local s'ouvre, et relancé (SIGCONT) quand il se ferme.
// Inclus dans embed.rs : mêmes noms que les fonctions Windows.

/// Identifiant de fenêtre factice : sur macOS, c'est le pid de l'émulateur.
#[derive(Clone, Copy, PartialEq, Eq)]
struct HWND(pub isize);

/// Vrai processus de l'émulateur quand il est lancé par « open » (le Child suivi est alors « open -W »,
/// qui se termine avec lui) : pause et arrêt passent par celui-ci.
static PID_REEL: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
fn signal(pid: u32, sig: &str) {
    let reel = PID_REEL.load(std::sync::atomic::Ordering::Relaxed);
    let pid = if reel != 0 { reel } else { pid };
    if pid > 1 {
        let _ = Command::new("kill").args([sig, &pid.to_string()]).status();
    }
}

/// Azahar : lancé directement, comme Dolphin (pas par « open ») : macOS le compte alors comme une partie
/// d'En Local, qui a déjà accès au dossier des jeux (sinon il redemandait l'accès à chaque lancement).
/// Son dossier « user » passe par les variables XDG, avec des liens vers celui d'En Local.
pub fn lancer_azahar_mac(emu_dir: &str, args: &[String]) -> Result<Child, String> {
    let user = format!("{emu_dir}/user");
    let xdg = format!("{emu_dir}/xdg");
    let mut cmd = Command::new(format!("{emu_dir}/Azahar.app/Contents/MacOS/azahar"));
    for (var, sous, cible) in [("XDG_DATA_HOME", "data", user.clone()), ("XDG_CONFIG_HOME", "config", format!("{user}/config")), ("XDG_CACHE_HOME", "cache", format!("{user}/cache"))] {
        let d = format!("{xdg}/{sous}");
        let lien = format!("{d}/azahar-emu");
        let _ = std::fs::create_dir_all(&d);
        let _ = std::fs::create_dir_all(&cible);
        if std::fs::read_link(&lien).ok().as_deref() != Some(std::path::Path::new(&cible)) {
            let _ = std::fs::remove_file(&lien);
            std::os::unix::fs::symlink(&cible, &lien).map_err(|e| e.to_string())?;
        }
        cmd.env(var, d);
    }
    // Fenêtre cachée au départ : posée dans le cadre quand le jeu est adopté.
    suivre_cadre(&mut cmd);
    for (k, v) in [("ENLOCAL_CLAVIER", clavier_fichier()), ("ENLOCAL_SALON", salon_en_jeu_fichier()), ("ENLOCAL_AMIIBO", crate::figurines::fichier("amiibo"))] {
        cmd.env(k, v);
    }
    PID_REEL.store(0, std::sync::atomic::Ordering::Relaxed);
    cmd.current_dir(emu_dir).args(args).spawn().map_err(|e| e.to_string())
}

fn fenetre_vivante(_h: isize) -> bool {
    true
}
/// Nos émulateurs (AzaharPlus…) : fenêtre sans bordure posée par En Local dans son cadre (fichier
/// ENLOCAL_CADRE : « x y largeur hauteur visible », en points de l'écran). Les autres : pause par signal.
static FORK: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
pub fn cadre_fichier() -> String {
    format!("{}/data/cadre-jeu.txt", crate::root())
}
/// Nos émulateurs lancés directement (Dolphin) : leur fenêtre suit le cadre, le jeu se met en pause
/// par le fichier menu.
pub fn suivre_cadre(c: &mut Command) {
    FORK.store(true, std::sync::atomic::Ordering::Relaxed);
    INJECTE.store(false, std::sync::atomic::Ordering::Relaxed);
    let f = cadre_fichier();
    let _ = std::fs::write(&f, "0 0 0 0 0");
    attendre_image();
    c.env("ENLOCAL_CADRE", f).env("ENLOCAL_MENU", menu_fichier()).env("ENLOCAL_VOLUME_FICHIER", crate::son::fichier());
}
/// Émulateurs non modifiés (Cemu, RPCS3) : notre bibliothèque chargée au lancement pose leur fenêtre
/// dans le cadre et règle leur son (forks/enlocal-cadre.m). La pause reste par signal.
static INJECTE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
pub fn suivre_cadre_injecte(c: &mut Command) {
    let lib = format!("{}/emu/enlocal-cadre.dylib", crate::root());
    if !std::path::Path::new(&lib).exists() {
        return;
    }
    suivre_cadre(c);
    INJECTE.store(true, std::sync::atomic::Ordering::Relaxed);
    c.env("DYLD_INSERT_LIBRARIES", lib);
}
/// La fenêtre du jeu reste derrière En Local (son écran « Chargement de… ») jusqu'à la première image
/// du jeu : regardée toutes les 300 ms, au plus 2 minutes.
static PRET: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static ATTENTE: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
fn attendre_image() {
    use std::sync::atomic::Ordering::Relaxed;
    PRET.store(false, Relaxed);
    let n = ATTENTE.fetch_add(1, Relaxed) + 1;
    std::thread::spawn(move || {
        let fin = Instant::now() + Duration::from_secs(120);
        while Instant::now() < fin && ATTENTE.load(Relaxed) == n {
            std::thread::sleep(Duration::from_millis(300));
            let Some(img) = pid_jeu().and_then(crate::mac_capture::image) else { continue };
            // Une vraie image du jeu : ni toute noire, ni d'une seule couleur (fond gris de Ryujinx avant
            // son premier rendu). Un pixel sur 97 suffit à le voir.
            let Some(px) = img.get(4..) else { continue };
            let mut points = px.chunks_exact(4).step_by(97);
            let Some(premier) = points.next() else { continue };
            let ecart = |p: &[u8]| (0..3).any(|i| p[i].abs_diff(premier[i]) > 24);
            if points.any(|p| ecart(p) && (p[0] > 24 || p[1] > 24 || p[2] > 24)) {
                break;
            }
        }
        if ATTENTE.load(Relaxed) == n {
            PRET.store(true, Relaxed);
            poser_cadre(!HIDDEN.load(Relaxed));
            // L'émulateur a pu prendre la main en ouvrant sa fenêtre (Ryujinx) : En Local la reprend,
            // sinon l'habillage (contours arrondis) reste caché jusqu'à un clic.
            devant();
        }
    });
}
/// Plein écran : hauteur de la bande de l'encoche (points), laissée vide en haut par l'interface et le jeu.
static ENCOCHE: std::sync::atomic::AtomicI32 = std::sync::atomic::AtomicI32::new(0);
#[repr(C)]
struct Marges {
    haut: f64,
    gauche: f64,
    bas: f64,
    droite: f64,
}
unsafe impl objc2::Encode for Marges {
    const ENCODING: objc2::Encoding = objc2::Encoding::Struct("NSEdgeInsets", &[f64::ENCODING, f64::ENCODING, f64::ENCODING, f64::ENCODING]);
}
/// Lue sur l'écran de la fenêtre (safeAreaInsets, macOS 12+ ; 0 sans encoche). Fil principal.
pub fn encoche(w: &tauri::WebviewWindow) -> f64 {
    let haut: f64 = w.ns_window().ok().filter(|p| !p.is_null()).map_or(0.0, |p| {
        let f: &objc2::runtime::AnyObject = unsafe { &*(p as *const objc2::runtime::AnyObject) };
        let ecran: Option<&objc2::runtime::AnyObject> = unsafe { objc2::msg_send![f, screen] };
        let repond = |e: &objc2::runtime::AnyObject| -> bool { unsafe { objc2::msg_send![e, respondsToSelector: objc2::sel!(safeAreaInsets)] } };
        ecran.filter(|e| repond(e)).map_or(0.0, |e| {
            let m: Marges = unsafe { objc2::msg_send![e, safeAreaInsets] };
            m.haut
        })
    });
    ENCOCHE.store(haut.round() as i32, std::sync::atomic::Ordering::Relaxed);
    haut
}
/// Plein écran : Dock et barre des menus masqués tant qu'En Local est au premier plan (pas seulement
/// cachés jusqu'à ce que la souris touche le bord). Fil principal.
pub fn barres_masquees(oui: bool) {
    // NSApplicationPresentationHideDock | NSApplicationPresentationHideMenuBar.
    let options: usize = if oui { (1 << 1) | (1 << 3) } else { 0 };
    unsafe {
        let app: &objc2::runtime::AnyObject = objc2::msg_send![objc2::class!(NSApplication), sharedApplication];
        let _: () = objc2::msg_send![app, setPresentationOptions: options];
    }
}
pub fn encoche_libre() {
    ENCOCHE.store(0, std::sync::atomic::Ordering::Relaxed);
}
/// Zone du jeu dans la fenêtre principale, en points de l'écran (même calcul que sur Windows).
pub fn rect_jeu(_parent: isize) -> (i32, i32, i32, i32) {
    use tauri::Manager;
    let Some(main) = APP.get().and_then(|a| a.get_webview_window("main")) else { return (0, 0, 0, 0) };
    let (Ok(p), Ok(t), Ok(f)) = (main.inner_position(), main.inner_size(), main.scale_factor()) else { return (0, 0, 0, 0) };
    let enc = ENCOCHE.load(std::sync::atomic::Ordering::Relaxed);
    let (x, y, w, h) = ((p.x as f64 / f) as i32, (p.y as f64 / f) as i32 + enc, (t.width as f64 / f) as i32, (t.height as f64 / f) as i32 - enc);
    let format = *FORMAT.lock().unwrap();
    if !habille(w, h) {
        return (x, y, w, h);
    }
    let m = (h / 30).clamp(12, 40);
    let (iw, ih) = (w - 2 * m, h - 2 * m);
    if iw as f64 / ih as f64 > format {
        let gw = (ih as f64 * format).round() as i32;
        (x + m + (iw - gw) / 2, y + m, gw, ih)
    } else {
        let gh = (iw as f64 / format).round() as i32;
        (x + m, y + m + (ih - gh) / 2, iw, gh)
    }
}
/// Nos émulateurs : leur fenêtre s'affiche directement dans le cadre (pas de copie d'image).
pub fn direct() -> bool {
    FORK.load(std::sync::atomic::Ordering::Relaxed)
}
/// Numéros (macOS) de la fenêtre principale et de l'habillage : la fenêtre du jeu se range entre les deux,
/// comme la fenêtre fille sous Windows. Lus une fois, sur le fil principal, à la création des fenêtres.
static NUMERO_PRINCIPALE: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);
static NUMERO_HABILLAGE: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);
static HABILLAGE_VISIBLE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
pub fn numeros_fenetres(app: &tauri::AppHandle) {
    use tauri::Manager;
    let numero = |label: &str| -> isize {
        let Some(p) = app.get_webview_window(label).and_then(|w| w.ns_window().ok()).filter(|p| !p.is_null()) else { return 0 };
        let w: &objc2::runtime::AnyObject = unsafe { &*(p as *const objc2::runtime::AnyObject) };
        unsafe { objc2::msg_send![w, windowNumber] }
    };
    NUMERO_PRINCIPALE.store(numero("main"), std::sync::atomic::Ordering::Relaxed);
    NUMERO_HABILLAGE.store(numero("habillage"), std::sync::atomic::Ordering::Relaxed);
    // L'habillage est une fenêtre normale, rangée juste au-dessus du jeu (ou d'En Local) par
    // garder_habillage : il reste visible quand on passe à une autre app, sans jamais passer devant elle.
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(100));
        garder_habillage(&app);
    });
}

/// Fenêtre du jeu (numéro macOS), cherchée une fois par partie.
static NUMERO_JEU: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);

/// L'habillage, s'il est affiché, repasse juste au-dessus du jeu (affiché directement) ou d'En Local :
/// le jeu se range lui-même au-dessus d'En Local, l'habillage le suit. Caché si En Local est réduit.
fn garder_habillage(app: &tauri::AppHandle) {
    use std::sync::atomic::Ordering::Relaxed;
    use tauri::Manager;
    let (Some(main), Some(h)) = (app.get_webview_window("main"), app.get_webview_window("habillage")) else { return };
    if !HABILLAGE_VISIBLE.load(Relaxed) {
        return;
    }
    if main.is_minimized().unwrap_or(false) {
        let _ = h.hide();
        return;
    }
    if !h.is_visible().unwrap_or(true) {
        let _ = h.show();
    }
    let mut cible = NUMERO_PRINCIPALE.load(Relaxed);
    if direct() && PRET.load(Relaxed) {
        if NUMERO_JEU.load(Relaxed) == 0 {
            if let Some(n) = pid_jeu().and_then(crate::mac_capture::numero) {
                NUMERO_JEU.store(n as isize, Relaxed);
            }
        }
        let n = NUMERO_JEU.load(Relaxed);
        if n > 0 {
            cible = n;
        }
    }
    if cible <= 0 {
        return;
    }
    let h2 = h.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(p) = h2.ns_window().ok().filter(|p| !p.is_null()) {
            let w: &objc2::runtime::AnyObject = unsafe { &*(p as *const objc2::runtime::AnyObject) };
            unsafe {
                let _: () = objc2::msg_send![w, orderWindow: 1isize, relativeTo: cible];
            }
        }
    });
}
/// Écrit la place de la fenêtre du jeu : « x y largeur hauteur visible principale habillage » (nos émulateurs la suivent).
fn poser_cadre(visible: bool) {
    use std::sync::atomic::Ordering::Relaxed;
    if !FORK.load(Relaxed) {
        return;
    }
    let (x, y, w, h) = rect_jeu(0);
    let dessus = if HABILLAGE_VISIBLE.load(Relaxed) { NUMERO_HABILLAGE.load(Relaxed) } else { 0 };
    let f = cadre_fichier();
    let visible = visible && PRET.load(Relaxed);
    let _ = std::fs::write(format!("{f}.tmp"), format!("{x} {y} {w} {h} {} {} {dessus}", u8::from(visible), NUMERO_PRINCIPALE.load(Relaxed)));
    let _ = std::fs::rename(format!("{f}.tmp"), f);
}
/// L'app, pour placer la fenêtre d'habillage (pas de handle de fenêtre à passer sur macOS).
static APP: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();
pub fn app_mac(app: tauri::AppHandle) {
    let _ = APP.set(app);
}
/// L'habillage couvre l'intérieur de la fenêtre principale, sans prendre la main ; caché sinon.
fn placer_habillage(_parent: isize, visible: bool) {
    use tauri::Manager;
    let Some(app) = APP.get() else { return };
    let (Some(main), Some(h)) = (app.get_webview_window("main"), app.get_webview_window("habillage")) else { return };
    HABILLAGE_VISIBLE.store(visible, std::sync::atomic::Ordering::Relaxed);
    if !visible {
        let _ = h.hide();
        return;
    }
    // Toute la fenêtre, bande de l'encoche comprise : le décor y passe, le jeu reste dessous (trou()).
    if let (Ok(p), Ok(t)) = (main.inner_position(), main.inner_size()) {
        let _ = h.set_position(p);
        let _ = h.set_size(t);
    }
    let _ = h.show();
}
fn freeze(child: &Child, _render: isize, frozen: bool) {
    signal(child.id(), if frozen { "-STOP" } else { "-CONT" });
}
/// Image de la fenêtre du jeu (fond du menu), pour nos émulateurs affichés directement.
pub fn capture() -> Option<Vec<u8>> {
    if !direct() || !PRET.load(std::sync::atomic::Ordering::Relaxed) {
        return None;
    }
    crate::mac_capture::image(pid_jeu()?)
}
/// Décor autour du jeu : une toute petite image du jeu affiché directement (rien sinon).
pub fn apercu() -> Option<Vec<u8>> {
    if !direct() || !PRET.load(std::sync::atomic::Ordering::Relaxed) || HIDDEN.load(std::sync::atomic::Ordering::Relaxed) {
        return None;
    }
    crate::mac_capture::apercu(pid_jeu()?)
}

/// Arrêté avec En Local : stop() à la fermeture de la fenêtre.
pub fn tie(child: Child) -> Child {
    child
}
fn webview_of(_parent: isize) -> isize {
    0
}
fn place_webview(_webview: isize, _visible: bool) {}
fn paint_shot(_webview: isize) {}
/// La fenêtre a bougé ou changé de taille : l'habillage la suit (DS et consoles dans l'app).
pub fn fit(parent: isize) {
    if DS.load(std::sync::atomic::Ordering::Relaxed) {
        placer_habillage(parent, true);
    }
    if GAME.lock().unwrap().is_some() && !HIDDEN.load(std::sync::atomic::Ordering::Relaxed) {
        placer_habillage(parent, true);
        poser_cadre(true);
    }
}
fn garder_la_taille(_render: isize, _parent: isize) {}
fn child_of(_parent: isize, pid: u32) -> Option<HWND> {
    Some(HWND(pid as isize))
}
fn title_of(_h: HWND) -> String {
    "FPS".into()
}
fn top_window(pid: u32, _prefix: &str) -> Option<HWND> {
    Some(HWND(pid as isize))
}
fn close_top_windows(pid: u32) {
    signal(pid, "-TERM");
}
fn carte_reseau() -> Option<String> {
    None
}

/// Menu : met le jeu en pause (sauf en session : le salon perdrait la connexion), ou le reprend.
pub fn show(visible: bool) {
    if HIDDEN.swap(!visible, std::sync::atomic::Ordering::Relaxed) == !visible {
        return;
    }
    if let Some(g) = GAME.lock().unwrap().as_ref() {
        // Nos émulateurs : la fenêtre quitte le cadre pendant le menu, le jeu se met en pause par le fichier menu.
        if FORK.load(std::sync::atomic::Ordering::Relaxed) {
            let injecte = INJECTE.load(std::sync::atomic::Ordering::Relaxed);
            if visible {
                let _ = std::fs::remove_file(menu_fichier());
                if injecte {
                    freeze(&g.child, g.render, false);
                }
            } else {
                let _ = std::fs::write(menu_fichier(), b"1");
            }
            poser_cadre(visible);
            // Comme sous Windows : les contours suivent le jeu, pas de contour sur le menu.
            placer_habillage(0, visible);
            // Mis en pause par signal une fois sa fenêtre passée derrière (elle se range toutes les 50 ms).
            if injecte && !visible {
                std::thread::sleep(Duration::from_millis(150));
                freeze(&g.child, g.render, true);
            }
            return;
        }
        if visible {
            freeze(&g.child, g.render, false);
            let _ = std::fs::remove_file(menu_fichier());
        } else if EN_SALON.load(std::sync::atomic::Ordering::Relaxed) {
            let _ = std::fs::write(menu_fichier(), b"1");
        } else {
            freeze(&g.child, g.render, true);
        }
    }
}

/// L'émulateur est fermé ? Lancé par « open », c'est le vrai processus qui compte : « open -W » peut
/// rendre la main avant (AzaharPlus passe en app d'arrière-plan).
fn termine(child: &mut Child) -> bool {
    let reel = PID_REEL.load(std::sync::atomic::Ordering::Relaxed);
    if reel == 0 {
        return matches!(child.try_wait(), Ok(Some(_)));
    }
    let _ = child.try_wait();
    !Command::new("kill").args(["-0", &reel.to_string()]).status().is_ok_and(|s| s.success())
}

/// Processus de l'émulateur en cours (celui qui a la fenêtre du jeu).
pub fn pid_jeu() -> Option<u32> {
    let reel = PID_REEL.load(std::sync::atomic::Ordering::Relaxed);
    GAME.lock().unwrap().as_ref().map(|g| if reel != 0 { reel } else { g.child.id() })
}

pub fn stop() {
    use std::sync::atomic::Ordering::Relaxed;
    crate::mac_capture::arreter();
    placer_habillage(0, false);
    let _ = std::fs::remove_file(menu_fichier());
    // La fenêtre du jeu repasse derrière tout de suite, avant que l'émulateur ait fini de se fermer.
    PRET.store(false, Relaxed);
    ATTENTE.fetch_add(1, Relaxed);
    NUMERO_JEU.store(0, Relaxed);
    poser_cadre(false);
    FORK.store(false, Relaxed);
    INJECTE.store(false, Relaxed);
    if let Some(mut g) = GAME.lock().unwrap().take() {
        HIDDEN.store(false, Relaxed);
        freeze(&g.child, g.render, false);
        // Fermeture demandée d'abord : l'émulateur enregistre ce qu'il doit. Comme sous Windows, elle finit
        // en arrière-plan : En Local revient tout de suite, le prochain lancement l'attend.
        signal(g.child.id(), "-TERM");
        let secs = if ARRET_PROPRE.swap(false, Relaxed) { 10 } else { 2 };
        let reel = PID_REEL.swap(0, Relaxed);
        *FERMETURE.lock().unwrap() = Some(std::thread::spawn(move || {
            let fin = Instant::now() + Duration::from_secs(secs);
            while Instant::now() < fin && matches!(g.child.try_wait(), Ok(None)) {
                std::thread::sleep(Duration::from_millis(100));
            }
            let _ = g.child.kill();
            let _ = g.child.wait();
            // Lancé par « open » : le vrai émulateur aussi (jamais « kill 0 », qui viserait En Local).
            if reel != 0 {
                let _ = Command::new("kill").args(["-KILL", &reel.to_string()]).status();
            }
        }));
    }
}

/// L'émulateur garde sa fenêtre : il est suivi comme le jeu en cours.
/// En Local au premier plan ou non (la fenêtre du jeu, filmée, reste derrière dans tous les cas).
static AU_PREMIER_PLAN: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(true);
pub fn premier_plan(actif: bool) {
    AU_PREMIER_PLAN.store(actif, std::sync::atomic::Ordering::Relaxed);
}

/// Ramène En Local devant (l'émulateur vient de démarrer).
pub fn devant() {
    use tauri::Manager;
    if let Some(w) = APP.get().and_then(|a| a.get_webview_window("main")) {
        let _ = w.set_focus();
    }
}

pub fn coller(child: Child, parent: isize, _titre: &str, _nom: &str, _pret: &str, _attente: Duration) -> Result<String, String> {
    let pid = child.id();
    adopt(child, HWND(pid as isize), parent);
    Ok(format!("émulateur lancé (pid {pid})"))
}

/// Ryujinx (macOS) : bien plus rapide qu'Eden sur Mac (Hypervisor d'Apple, le jeu tourne presque
/// directement). Pour jouer seul : les salons du Local et le jeu à distance passent encore par Eden.
/// Ses clés et son firmware sont ceux d'Eden ; ses sauvegardes aussi (reprises et rendues par Ryujinx).
pub fn ryujinx_disponible() -> bool {
    std::path::Path::new(&format!("{}/Ryujinx", crate::ryujinx())).exists()
}

pub fn start_ryujinx(dir: &str, game: &str, eden: &str, contenu: &[std::path::PathBuf], o: &crate::reglages::Opts, title_id: Option<&str>, room: Option<&Room>) -> Result<String, String> {
    if GAME.lock().unwrap().is_some() {
        return Err("Un jeu tourne déjà".into());
    }
    attendre_fermeture();
    let user = format!("{eden}/user");
    let cles = format!("{user}/keys/prod.keys");
    if !std::path::Path::new(&cles).exists() {
        return Err(format!("Il manque les clés de ta Switch : copie le prod.keys sorti de ta console (Lockpick_RCM) dans {user}/keys."));
    }
    let portable = format!("{dir}/portable");
    let systeme = format!("{portable}/system");
    std::fs::create_dir_all(&systeme).map_err(|e| e.to_string())?;
    for f in ["prod.keys", "title.keys"] {
        let (src, dst) = (format!("{user}/keys/{f}"), format!("{systeme}/{f}"));
        if std::fs::read(&src).ok() != std::fs::read(&dst).ok() {
            let _ = std::fs::copy(&src, &dst);
        }
    }
    // Firmware : chaque .nca d'Eden devient <id>.nca/00, la forme installée de Ryujinx.
    let registered = format!("{portable}/bis/system/Contents/registered");
    let mut firmware = false;
    for f in std::fs::read_dir(format!("{user}/nand/system/Contents/registered")).into_iter().flatten().flatten() {
        let nom = f.file_name().to_string_lossy().into_owned();
        let Some(id) = nom.strip_suffix(".nca").map(|n| n.split('.').next().unwrap_or(n).to_string()) else { continue };
        firmware = true;
        let cible = format!("{registered}/{id}.nca");
        if !std::path::Path::new(&format!("{cible}/00")).exists() {
            std::fs::create_dir_all(&cible).map_err(|e| e.to_string())?;
            std::fs::copy(f.path(), format!("{cible}/00")).map_err(|e| e.to_string())?;
        }
    }
    if !firmware {
        return Err(format!("Il manque le firmware de ta Switch : copie les fichiers .nca sortis de ta console (TegraExplorer) dans {user}/nand/system/Contents/registered."));
    }
    let contenus = contenu.iter().map(|p| p.to_string_lossy().into_owned()).collect::<Vec<_>>().join("\n");
    let distance = o.get("distance").is_some_and(|d| d == "oui");
    let _ = std::fs::remove_file(menu_fichier());
    let mut cmd = Command::new(format!("{dir}/Ryujinx"));
    cmd.current_dir(dir);
    suivre_cadre(&mut cmd);
    cmd.arg(game)
        .env("ENLOCAL_CONTENUS", contenus)
        .env("ENLOCAL_EDEN_SAVES", format!("{user}/nand/user/save/0000000000000000"))
        .env("ENLOCAL_EDEN_PROFIL", crate::saves::profil_eden().map(|p| p.0).unwrap_or_default())
        .env("SDL_GAMECONTROLLERCONFIG", crate::pad::mappings());
    // Comme Eden : portable pour les jeux faits pour, sinon le mode choisi (dock par défaut).
    if (title_id.is_some_and(crate::reglages::en_main) && !distance) || o.get("mode").is_some_and(|m| m == "0") {
        cmd.env("ENLOCAL_EN_MAIN", "1");
    }
    if let Some((langue, region)) = crate::reglages::langue_switch(o) {
        cmd.env("ENLOCAL_LANGUE", langue.to_string()).env("ENLOCAL_REGION", region.to_string());
    }
    if let Some(p) = o.get("pseudo").and_then(|p| crate::pseudo::propre(p)) {
        cmd.env("ENLOCAL_PSEUDO", p);
    }
    if let Some(v) = o.get("volume").and_then(|v| v.parse::<u8>().ok()).filter(|v| *v <= 100) {
        cmd.env("ENLOCAL_VOLUME", v.to_string());
    }
    // Salon d'Eden : Ryujinx y entre comme Eden (mot de passe par l'environnement, pas en ligne de commande).
    // Même graine du hasard pour tous, sinon Smash se désynchronise.
    if let Some(r) = room {
        cmd.env("ENLOCAL_SALON_HOTE", &r.host).env("ENLOCAL_SALON_PORT", r.port.to_string())
            .env("ENLOCAL_SALON_PSEUDO", &r.nickname).env("ENLOCAL_SALON_MDP", &r.password).env("ENLOCAL_GRAINE", "0");
    }
    EN_SALON.store(room.is_some(), std::sync::atomic::Ordering::Relaxed);
    let child = cmd.spawn().map_err(|e| e.to_string())?;
    let r = attach(child, 0, || "le jeu ne s'est pas affiché (Ryujinx n'a pas pu le charger)".into());
    ARRET_PROPRE.store(r.is_ok(), std::sync::atomic::Ordering::Relaxed);
    r
}
