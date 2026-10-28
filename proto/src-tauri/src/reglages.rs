//! Réglages des émulateurs, réécrits dans leur configuration à chaque lancement.
//! L'interface envoie des réglages simples, ce module les traduit pour chaque émulateur.

use std::collections::HashMap;

pub type Opts = HashMap<String, String>;

fn get<'a>(o: &'a Opts, k: &str) -> Option<&'a str> {
    o.get(k).map(String::as_str).filter(|v| !v.is_empty())
}
fn oui(o: &Opts, k: &str) -> Option<bool> {
    get(o, k).map(|v| v == "oui")
}
/// Nombre dans [min, max], sinon le réglage est ignoré.
fn nombre(o: &Opts, k: &str, min: i64, max: i64) -> Option<i64> {
    get(o, k)?.parse::<i64>().ok().filter(|n| (min..=max).contains(n))
}

/// Écrit des clés dans un .ini Qt (Azahar, Eden). « clé\default=false » est nécessaire, sinon Eden garde sa valeur.
pub fn ini_set(text: &str, section: &str, pairs: &[(String, String)]) -> String {
    let tete = format!("[{section}]");
    let mut lignes: Vec<String> = Vec::new();
    let mut dans = false;
    let mut trouvee = false;
    for l in text.lines() {
        if l.starts_with('[') {
            dans = l == tete;
            lignes.push(l.to_string());
            if dans {
                trouvee = true;
                for (k, v) in pairs {
                    lignes.push(format!("{k}\\default=false"));
                    lignes.push(format!("{k}={v}"));
                }
            }
            continue;
        }
        if dans && pairs.iter().any(|(k, _)| l.starts_with(&format!("{k}=")) || l.starts_with(&format!("{k}\\default="))) {
            continue;
        }
        lignes.push(l.to_string());
    }
    if !trouvee && !pairs.is_empty() {
        lignes.push(tete);
        for (k, v) in pairs {
            lignes.push(format!("{k}\\default=false"));
            lignes.push(format!("{k}={v}"));
        }
    }
    lignes.join("\n") + "\n"
}

fn paire(k: &str, v: impl ToString) -> (String, String) {
    (k.to_string(), v.to_string())
}

/*
 * ---------- Manette ----------
 * touche_a = south : le bouton A de la console est le bouton du bas de la manette.
 */
/// Boutons de la manette, dans l'ordre des boutons du RetroPad (B, Y, Select, Start, croix, A, X, L, R, L2, R2, L3, R3).
pub const PHYS: [&str; 16] = ["south", "west", "back", "start", "up", "down", "left", "right", "east", "north", "lb", "rb", "lt", "rt", "l3", "r3"];
pub fn touche<'a>(o: &'a Opts, bouton: &str) -> Option<&'a str> {
    get(o, &format!("touche_{bouton}")).filter(|p| PHYS.contains(p))
}

/* ---------- DS : melonDS ---------- */

/* ---------- Micro (toutes les consoles) ---------- */

/// Micro choisi : None = celui de Windows par défaut, Some("") = aucun, sinon l'identifiant Windows.
pub fn micro(o: &Opts) -> Option<&str> {
    get(o, "micro").map(|m| if m == "aucun" { "" } else { m }).filter(|m| m.is_empty() || m.starts_with('{'))
}

/// Wi-Fi DS sur le serveur du Local (par défaut ; Kaeru au choix).
pub fn wfc_local(o: &Opts) -> bool {
    get(o, "wfc") != Some("kaeru")
}

pub fn melonds(o: &Opts) -> Vec<(&'static str, String)> {
    let mut out = Vec::new();
    // Micro réel (donné au cœur par En Local), toujours ouvert ; « aucun » : silence.
    out.push(("melonds_mic_input", if micro(o) == Some("") { "silence" } else { "microphone" }.into()));
    out.push(("melonds_mic_input_active", "always".into()));
    if let Some(l) = get(o, "langue").filter(|l| ["en", "ja", "fr", "de", "it", "es"].contains(l)) {
        out.push(("melonds_firmware_language", l.to_string()));
    }
    if get(o, "pseudo").is_some() {
        out.push(("melonds_firmware_username", "guess_username".into())); // le pseudo donné par En Local
    }
    // Wi-Fi des jeux : Kaeru (public) ou le serveur du Local (privé, réservé aux membres).
    out.push(("melonds_firmware_wfc_dns", if wfc_local(o) { "152.228.234.204" } else { "178.62.43.212" }.into()));
    const DISPOSITIONS: [&str; 8] = ["top-bottom", "bottom-top", "left-right", "right-left", "hybrid-top", "hybrid-bottom", "top", "bottom"];
    if let Some(d) = get(o, "disposition").filter(|d| DISPOSITIONS.contains(d)) {
        out.push(("melonds_screen_layout1", d.to_string()));
        out.push(("melonds_number_of_screen_layouts", "1".into()));
    }
    if let Some(e) = nombre(o, "ecart", 0, 126) {
        out.push(("melonds_screen_gap", format!("{e}px")));
    }
    out
}
/// Pour chaque bouton libretro, le bit de pad::BUTTONS à lire.
pub fn touches_ds(o: &Opts) -> [u8; 16] {
    let mut t: [u8; 16] = std::array::from_fn(|i| i as u8);
    // Boutons libretro de la DS : B 0, Y 1, Select 2, Start 3, A 8, X 9, L 10, R 11.
    for (bouton, id) in [("a", 8), ("b", 0), ("x", 9), ("y", 1), ("l", 10), ("r", 11), ("start", 3), ("select", 2)] {
        if let Some(p) = touche(o, bouton) {
            t[id] = PHYS.iter().position(|x| *x == p).unwrap() as u8;
        }
    }
    t
}
pub fn volume(o: &Opts) -> f32 {
    nombre(o, "volume", 0, 100).map_or(1.0, |v| v as f32 / 100.0)
}

/* ---------- 3DS : Azahar ---------- */

/// Boutons d'Azahar : touches choisies, sinon disposition Nintendo.
pub fn azahar_controles(o: &Opts) -> String {
    let sdl = |p: &str| -> String {
        let n = match p {
            "south" => 0, "east" => 1, "west" => 2, "north" => 3, "back" => 4, "start" => 6, "l3" => 7, "r3" => 8,
            "lb" => 9, "rb" => 10, "up" => 11, "down" => 12, "left" => 13, "right" => 14,
            "lt" => return "\"engine:sdl,api:controller,maptype:all,axis:4,direction:+,threshold:0.5\"".into(),
            _ => return "\"engine:sdl,api:controller,maptype:all,axis:5,direction:+,threshold:0.5\"".into(),
        };
        format!("\"engine:sdl,api:controller,maptype:all,button:{n}\"")
    };
    let s = |x: u32, y: u32| format!("\"engine:sdl,api:controller,maptype:all,axis_x:{x},axis_y:{y},deadzone:0.1\"");
    let mut out = String::from("[Controls]\nprofile=0\nprofiles\\1\\name=En Local\nprofiles\\1\\input_maptype=0\n");
    for (cle, bouton, defaut) in [
        ("button_a", "a", "east"), ("button_b", "b", "south"), ("button_x", "x", "north"), ("button_y", "y", "west"),
        ("button_l", "l", "lb"), ("button_r", "r", "rb"), ("button_zl", "zl", "lt"), ("button_zr", "zr", "rt"),
        ("button_start", "start", "start"), ("button_select", "select", "back"),
        ("button_up", "", "up"), ("button_down", "", "down"), ("button_left", "", "left"), ("button_right", "", "right"),
    ] {
        out += &format!("profiles\\1\\{cle}={}\n", sdl(touche(o, bouton).unwrap_or(defaut)));
    }
    out += &format!("profiles\\1\\circle_pad={}\nprofiles\\1\\c_stick={}\nprofiles\\size=1\n", s(0, 1), s(2, 3));
    out
}

pub fn azahar_ini(o: &Opts) -> String {
    let mut r = Vec::new();
    if let Some(n) = nombre(o, "api", 0, 2) {
        r.push(paire("graphics_api", n));
    }
    if let Some(n) = nombre(o, "resolution", 1, 10) {
        r.push(paire("resolution_factor", n));
    }
    if let Some(n) = nombre(o, "filtre", 0, 5) {
        r.push(paire("texture_filter", n));
    }
    if let Some(b) = oui(o, "vsync") {
        r.push(paire("use_vsync", b));
    }
    if let Some(b) = oui(o, "shaders_async") {
        r.push(paire("async_shader_compilation", b));
    }
    if let Some(n) = nombre(o, "vitesse", 0, 400) {
        r.push(paire("frame_limit", n));
    }
    let mut l = Vec::new();
    if let Some(n) = nombre(o, "disposition", 0, 6).filter(|n| *n != 4) {
        l.push(paire("layout_option", n));
    }
    if let Some(b) = oui(o, "inverser") {
        l.push(paire("swap_screen", b));
    }
    if let Some(n) = nombre(o, "proportion", 1, 16) {
        l.push(paire("large_screen_proportion", n));
    }
    let mut a = Vec::new();
    if let Some(n) = nombre(o, "volume", 0, 100) {
        a.push(paire("volume", n as f32 / 100.0));
    }
    // Micro : 3 = Cubeb (le vrai micro, désigné par son nom Windows), 1 = aucun, 0 = automatique.
    match micro(o) {
        Some("") => a.push(paire("input_type", 1)),
        Some(id) => {
            a.push(paire("input_type", 3));
            a.push(paire("input_device", crate::micro::nom_de(id).unwrap_or_else(|| "Auto".into())));
        }
        None => {
            a.push(paire("input_type", 3));
            a.push(paire("input_device", "Auto"));
        }
    }
    let mut c = Vec::new();
    if let Some(n) = nombre(o, "cpu", 5, 400) {
        c.push(paire("cpu_clock_percentage", n));
    }
    // Applets simulés (clavier, Mii…) : avec des fichiers système 3DS posés dans l'émulateur, Azahar
    // lancerait les vrais, et un fichier système chiffré ou incomplet fait planter tous les jeux.
    let y = vec![paire("lle_applets", false)];
    let mut out = String::new();
    // Journal : le jeu à plusieurs en détail (salon, local sans fil), pour comprendre quand deux joueurs ne se voient pas.
    let j = vec![paire("log_filter", "*:Info Service.NWM:Debug Service.DLP:Debug Network:Debug")];
    for (s, p) in [("Renderer", r), ("Layout", l), ("Audio", a), ("Core", c), ("System", y), ("Miscellaneous", j)] {
        out = ini_set(&out, s, &p);
    }
    out
}

/// Langue de la 3DS : bloc 0x000A0002 de la config console.
pub fn azahar_langue(emu_dir: &str, o: &Opts) -> std::io::Result<()> {
    const LANGUES: [&str; 12] = ["ja", "en", "fr", "de", "it", "es", "zh", "ko", "nl", "pt", "ru", "tw"];
    let Some(n) = get(o, "langue").and_then(|l| LANGUES.iter().position(|x| *x == l)) else {
        return Ok(());
    };
    let f = chemin!("{emu_dir}\\user\\nand\\data\\00000000000000000000000000000000\\sysdata\\00010017\\00000000\\config");
    let Ok(mut b) = std::fs::read(&f) else {
        return Ok(()); // créé par Azahar au premier lancement
    };
    // Config abîmée : Azahar plantait dès son ouverture. Mise de côté, il en recrée une neuve.
    if !config_3ds_valide(&b) {
        return std::fs::rename(&f, format!("{f}.abime"));
    }
    if langue_3ds(&mut b, n as u8) {
        std::fs::write(&f, b)?;
    }
    Ok(())
}
/// Config console 3DS lisible : chaque bloc de données tient dans le fichier, après la table des blocs.
pub fn config_3ds_valide(b: &[u8]) -> bool {
    if b.len() < 4 {
        return false;
    }
    let n = u16::from_le_bytes([b[0], b[1]]) as usize;
    let table = 4 + 12 * n;
    table <= b.len()
        && (0..n).all(|i| {
            let p = 4 + 12 * i;
            let debut = u32::from_le_bytes(b[p + 4..p + 8].try_into().unwrap()) as usize;
            let taille = u16::from_le_bytes([b[p + 8], b[p + 9]]) as usize;
            taille <= 4 || (debut >= table && debut + taille <= b.len())
        })
}
fn langue_3ds(b: &mut [u8], langue: u8) -> bool {
    if b.len() < 4 {
        return false;
    }
    let n = u16::from_le_bytes([b[0], b[1]]) as usize;
    for i in 0..n {
        let p = 4 + 12 * i;
        if p + 12 > b.len() {
            return false;
        }
        if u32::from_le_bytes(b[p..p + 4].try_into().unwrap()) == 0x000A_0002 {
            if b[p + 4] == langue {
                return false;
            }
            b[p + 4] = langue;
            return true;
        }
    }
    false
}

/* ---------- GameCube / Wii : Dolphin ---------- */

/// Réglages passés en -C Système.Section.Clé=Valeur. Les correctifs par jeu de Dolphin gardent le dernier mot.
pub fn dolphin_args(o: &Opts, wii: bool) -> Vec<String> {
    let b = |v: bool| if v { "True" } else { "False" };
    let mut c: Vec<String> = Vec::new();
    if let Some(l) = get(o, "langue") {
        if wii {
            if let Some(n) = ["ja", "en", "de", "fr", "es", "it", "nl"].iter().position(|x| *x == l) {
                c.push(format!("SYSCONF.IPL.LNG={n}"));
            }
        } else if let Some(n) = ["en", "de", "fr", "es", "it", "nl"].iter().position(|x| *x == l) {
            c.push(format!("Dolphin.Core.SelectedLanguage={n}"));
        }
    }
    // Mac : Metal, natif, plutôt que Vulkan traduit par MoltenVK (bien plus lent dans Dolphin).
    let api = get(o, "api").map(|a| if cfg!(target_os = "macos") && a == "Vulkan" { "Metal" } else { a });
    if let Some(api) = api.filter(|a| ["Vulkan", "OGL", "Metal"].contains(a) || (cfg!(windows) && ["D3D", "D3D12"].contains(a))) {
        c.push(format!("Dolphin.Core.GFXBackend={api}"));
    }
    if let Some(n) = nombre(o, "resolution", 1, 8) {
        c.push(format!("GFX.Settings.InternalResolution={n}"));
    }
    if let Some(n) = nombre(o, "aa", 1, 8) {
        c.push(format!("GFX.Settings.MSAA={n}"));
        c.push("GFX.Settings.SSAA=False".into());
    }
    if let Some(n) = nombre(o, "aniso", -1, 4) {
        c.push(format!("GFX.Enhancements.MaxAnisotropy={n}"));
    }
    if let Some(n) = nombre(o, "format", 0, 3) {
        c.push(format!("GFX.Settings.AspectRatio={n}"));
    }
    if let Some(v) = oui(o, "ecran_large") {
        c.push(format!("GFX.Settings.wideScreenHack={}", b(v)));
    }
    if let Some(v) = oui(o, "vsync") {
        c.push(format!("GFX.Hardware.VSync={}", b(v)));
    }
    if let Some(n) = nombre(o, "shaders", 0, 3) {
        c.push(format!("GFX.Settings.ShaderCompilationMode={n}"));
    }
    if let Some(v) = oui(o, "textures_hd") {
        c.push(format!("GFX.Settings.HiresTextures={}", b(v)));
    }
    if let Some(n) = nombre(o, "vitesse", 0, 400) {
        c.push(format!("Dolphin.Core.EmulationSpeed={}", n as f32 / 100.0));
    }
    if let Some(n) = nombre(o, "volume", 0, 100) {
        c.push(format!("Dolphin.DSP.Volume={n}"));
    }
    if wii {
        if let Some(v) = oui(o, "wii_16_9") {
            c.push(format!("SYSCONF.IPL.AR={}", b(v)));
        }
        // Portail Skylanders : les figurines viennent du menu HOME d'En Local.
        c.push("Dolphin.EmulatedUSBDevices.EmulateSkylanderPortal=True".into());
        // Wii Speak (micro des jeux Wii) : le micro choisi, sinon celui par défaut ; « aucun » le coupe.
        match micro(o) {
            Some("") => c.push("Dolphin.EmulatedUSBDevices.EmulateWiiSpeak=False".into()),
            m => {
                c.push("Dolphin.EmulatedUSBDevices.EmulateWiiSpeak=True".into());
                c.push("Dolphin.EmulatedUSBDevices.WiiSpeakMuted=False".into());
                c.push(format!("Dolphin.EmulatedUSBDevices.WiiSpeakMicrophone={}", m.unwrap_or("")));
            }
        }
    }
    if get(o, "mods").is_some() {
        c.push("GFX.Settings.EnableMods=True".into());
    }
    c.into_iter().flat_map(|x| ["-C".to_string(), x]).collect()
}

fn dolphin_entree(p: &str) -> &'static str {
    match p {
        "south" => "`Button S`", "east" => "`Button E`", "west" => "`Button W`", "north" => "`Button N`",
        "lb" => "`Shoulder L`", "rb" => "`Shoulder R`", "lt" => "`Trigger L`", "rt" => "`Trigger R`",
        "start" => "`Start`", "back" => "`Back`", "l3" => "`Thumb L`", "r3" => "`Thumb R`",
        "up" => "`Pad N`", "down" => "`Pad S`", "left" => "`Pad W`", _ => "`Pad E`",
    }
}
/// Boutons GameCube : touches choisies, sinon defauts.
pub fn dolphin_gc(o: &Opts, defauts: &[(&str, &str)]) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for (cles, bouton) in [(&["Buttons/A"][..], "a"), (&["Buttons/B"], "b"), (&["Buttons/X"], "x"), (&["Buttons/Y"], "y"), (&["Buttons/Z"], "z"), (&["Buttons/Start"], "start"), (&["Triggers/L", "Triggers/L-Analog"], "l"), (&["Triggers/R", "Triggers/R-Analog"], "r")] {
        let v = match touche(o, bouton) {
            Some(p) => dolphin_entree(p).to_string(),
            None => defauts.iter().find(|(b, _)| *b == bouton).map(|(_, v)| v.to_string()).unwrap_or_default(),
        };
        for k in cles {
            out.push((k.to_string(), v.clone()));
        }
    }
    out
}
/// Jeux qui se jouent Wiimote à l'horizontale (GameTDB ne le dit pas) : Mario Party 9, Kirby, NSMB Wii,
/// Super Paper Mario, Wario Land, Excite Truck.
const WII_HORIZONTALE: [&str; 6] = ["SSQ", "SUK", "SMN", "R8P", "RWL", "REX"];
/// Manette Wii donnée au jeu : « classique » s'il la reconnaît (mêmes boutons qu'une manette de salon),
/// « horizontale » pour les jeux ci-dessus, sinon « nunchuk ».
pub fn disposition_wii(id: &str, manettes: &[String]) -> &'static str {
    if manettes.iter().any(|m| m == "classiccontroller") {
        "classique"
    } else if WII_HORIZONTALE.iter().any(|p| id.starts_with(p)) {
        "horizontale"
    } else {
        "nunchuk"
    }
}
/// Boutons « valider », « retour », du haut et de gauche de la manette du joueur, comme dans l'app :
/// valider à droite sur une manette Nintendo, en bas sur Xbox et PlayStation.
fn positions_manette() -> (&'static str, &'static str, &'static str, &'static str) {
    if *crate::pad::KIND.lock().unwrap() == "nintendo" { ("east", "south", "north", "west") } else { ("south", "east", "north", "west") }
}
/// Manette classique : A valide et B revient, sur les boutons valider et retour de la manette du joueur.
pub fn dolphin_classique() -> Vec<(String, String)> {
    let (ok, retour, haut, gauche) = positions_manette();
    let mut out: Vec<(String, String)> = [
        ("Buttons/A", ok), ("Buttons/B", retour), ("Buttons/X", haut), ("Buttons/Y", gauche), ("Buttons/ZL", "lt"), ("Buttons/ZR", "rt"),
        ("Buttons/-", "back"), ("Buttons/+", "start"), ("Triggers/L", "lb"), ("Triggers/L-Analog", "lb"), ("Triggers/R", "rb"), ("Triggers/R-Analog", "rb"),
        ("D-Pad/Up", "up"), ("D-Pad/Down", "down"), ("D-Pad/Left", "left"), ("D-Pad/Right", "right"),
    ]
    .iter()
    .map(|(k, p)| (format!("Classic/{k}"), dolphin_entree(p).to_string()))
    .collect();
    for (stick, axe) in [("Left Stick", "Left"), ("Right Stick", "Right")] {
        for (k, v) in [("Up", "Y+"), ("Down", "Y-"), ("Left", "X-"), ("Right", "X+")] {
            out.push((format!("Classic/{stick}/{k}"), format!("`{axe} {v}`")));
        }
    }
    out
}
/// Wiimote (et Nunchuk) : touches choisies, sinon celles de l'app. A sur le bouton valider de la manette
/// du joueur, B sur retour (et sur la gâchette, comme sur une vraie Wiimote). À l'horizontale (cote),
/// le jeu valide avec 2 et revient avec 1 : ils sont aussi sur valider et retour, avec A et B.
pub fn dolphin_wii(o: &Opts, cote: bool) -> Vec<(String, String)> {
    let (ok, retour, haut, gauche) = positions_manette();
    let (un, deux) = if cote { (retour, ok) } else { (gauche, haut) };
    let mut out = Vec::new();
    for (cles, bouton, defaut) in [
        (&["Buttons/A"][..], "a", ok), (&["Buttons/1"], "un", un), (&["Buttons/2"], "deux", deux),
        (&["Buttons/-"], "moins", "back"), (&["Buttons/+"], "plus", "start"), (&["Nunchuk/Buttons/C"], "c", "lb"), (&["Nunchuk/Buttons/Z"], "nz", "lt"),
        (&["Shake/X", "Shake/Y", "Shake/Z"], "secouer", "r3"),
    ] {
        let v = dolphin_entree(touche(o, bouton).unwrap_or(defaut));
        for k in cles {
            out.push((k.to_string(), v.to_string()));
        }
    }
    let b = match touche(o, "b") {
        Some(p) => dolphin_entree(p).to_string(),
        None => format!("{}|{}", dolphin_entree(retour), dolphin_entree("rt")),
    };
    out.insert(1, ("Buttons/B".into(), b));
    out
}

/// RetroAchievements dans Dolphin. Sans compte : désactivé.
pub fn dolphin_ra(dolphin: &str, o: &Opts) -> std::io::Result<()> {
    let (Some(u), Some(t)) = (get(o, "ra_user"), get(o, "ra_token")) else {
        return std::fs::write(chemin!("{dolphin}\\User\\Config\\RetroAchievements.ini"), "[Achievements]\nEnabled = False\n");
    };
    let propre = |s: &str| s.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-' || *c == '.').collect::<String>();
    let b = |v: bool| if v { "True" } else { "False" };
    std::fs::create_dir_all(chemin!("{dolphin}\\User\\Config"))?;
    std::fs::write(
        chemin!("{dolphin}\\User\\Config\\RetroAchievements.ini"),
        format!(
            "[Achievements]\nEnabled = True\nUsername = {}\nApiToken = {}\nHardcoreEnabled = {}\nUnofficialEnabled = False\nEncoreEnabled = False\nSpectatorEnabled = False\nDiscordPresenceEnabled = False\nProgressEnabled = True\nBadgesEnabled = True\n",
            propre(u),
            propre(t),
            b(oui(o, "ra_hardcore") == Some(true))
        ),
    )
}

/// Mods graphiques fournis avec Dolphin pour un jeu.
#[derive(serde::Serialize)]
pub struct ModDolphin {
    pub path: String,
    pub nom: String,
}
pub fn dolphin_mods(dolphin: &str, game_id: &str) -> Vec<ModDolphin> {
    let base = std::path::Path::new(dolphin).join("Sys").join("Load").join("GraphicMods");
    let mut out = Vec::new();
    for e in std::fs::read_dir(&base).into_iter().flatten().flatten() {
        let dir = e.path();
        let pour = std::fs::read_dir(&dir).into_iter().flatten().flatten().any(|f| {
            let n = f.file_name().to_string_lossy().to_string();
            n.strip_suffix(".txt").is_some_and(|id| id == "all" || (!id.is_empty() && game_id.starts_with(id)))
        });
        if pour && dir.join("metadata.json").exists() {
            let nom = e.file_name().to_string_lossy().to_string();
            out.push(ModDolphin { path: format!("{nom}/metadata.json"), nom });
        }
    }
    out.sort_by(|a, b| a.nom.cmp(&b.nom));
    out
}
/// Mods choisis, écrits dans User\Config\GraphicMods\<id>.json.
pub fn dolphin_profil_mods(dolphin: &str, game_id: &str, o: &Opts) -> std::io::Result<()> {
    let Some(liste) = get(o, "mods") else {
        return Ok(());
    };
    if game_id.is_empty() {
        return Ok(());
    }
    let choisis: Vec<&str> = if liste == "aucun" { Vec::new() } else { liste.split('|').collect() };
    let mods: Vec<serde_json::Value> = dolphin_mods(dolphin, game_id)
        .into_iter()
        .map(|m| serde_json::json!({ "source": "system", "path": m.path, "enabled": choisis.contains(&m.path.as_str()), "weight": 0.0 }))
        .collect();
    let dir = std::path::Path::new(dolphin).join("User").join("Config").join("GraphicMods");
    std::fs::create_dir_all(&dir)?;
    std::fs::write(dir.join(format!("{game_id}.json")), serde_json::to_string_pretty(&serde_json::json!({ "mods": mods }))?)
}

/* ---------- PS3 : RPCS3 ---------- */

/// config.yml de RPCS3 : il complète lui-même les réglages absents.
pub fn rpcs3(o: &Opts) -> String {
    let langue = match get(o, "langue") {
        Some("en") => "English (US)", Some("ja") => "Japanese", Some("de") => "German", Some("it") => "Italian", Some("es") => "Spanish",
        Some("nl") => "Dutch", Some("pt") => "Portuguese (Portugal)", Some("ru") => "Russian", Some("ko") => "Korean",
        Some("zh") => "Chinese (Simplified)", Some("tw") => "Chinese (Traditional)", _ => "French",
    };
    let echelle = nombre(o, "resolution", 1, 4).map_or(100, |n| [100, 150, 200, 300][n as usize - 1]);
    let volume = nombre(o, "volume", 0, 100).unwrap_or(100);
    // Réglages choisis seulement : RPCS3 garde ses valeurs par défaut pour le reste.
    let choix = |cle: &str, valeurs: &[(&str, &str)]| get(o, cle).and_then(|v| valeurs.iter().find(|(x, _)| *x == v)).map(|(_, y)| y.to_string());
    let mut video = format!("  Resolution Scale: {echelle}\n");
    for (cle, nom, valeurs) in [
        ("api", "Renderer", &[("vulkan", "Vulkan"), ("opengl", "OpenGL")][..]),
        ("fps", "Frame limit", &[("auto", "Auto"), ("30", "30"), ("60", "60"), ("off", "Off")]),
        ("vsync", "VSync Mode", &[("non", "Disabled"), ("adaptive", "Adaptive"), ("oui", "Full")]),
        ("aa", "MSAA", &[("0", "Disabled"), ("1", "Auto")]),
        ("aniso", "Anisotropic Filter Override", &[("0", "0"), ("2", "2"), ("4", "4"), ("8", "8"), ("16", "16")]),
        ("shaders", "Shader Mode", &[("1", "Async Recompiler with Shader Interpreter"), ("2", "Async Recompiler (multi-threaded)")]),
        ("precision", "Shader Precision", &[("0", "Low"), ("1", "High"), ("2", "Ultra")]),
        ("rsx_mt", "Multithreaded RSX", &[("oui", "true"), ("non", "false")]),
    ] {
        if let Some(v) = choix(cle, valeurs) {
            video += &format!("  {nom}: {v}\n");
        }
    }
    let mut coeur = String::new();
    if let Some(v) = choix("spu_bloc", &[("safe", "Safe"), ("mega", "Mega"), ("giga", "Giga")]) {
        coeur += &format!("  SPU Block Size: {v}\n");
    }
    // Mac (Apple Silicon) : la vérification rapide du code SPU recompilé confond deux tâches presque
    // identiques, le code de l'une tourne à la place de l'autre (Skate 3, MGS V : « Unknown STOP code: 0x0 »,
    // RPCS3 #19790). La vérification précise évite ça.
    if cfg!(target_os = "macos") {
        coeur += "  Precise SPU Verification: true\n";
    }
    format!(
        "{}Video:\n{video}Audio:\n  Master Volume: {volume}\nSystem:\n  Language: {langue}\n\
         Miscellaneous:\n  Exit RPCS3 when process finishes: true\n  Start games in fullscreen mode: false\n  \
         Pause emulation on RPCS3 focus loss: false\n  Show shader compilation hint: false\n  Prevent display sleep while running games: true\n",
        if coeur.is_empty() { String::new() } else { format!("Core:\n{coeur}") }
    )
}

/* ---------- Wii U : Cemu ---------- */

/// Parties de settings.xml : langue, Graphic, Audio et packs graphiques.
pub struct Cemu {
    pub api: i64,
    pub langue: Option<i64>,
    pub graphic: String,
    pub volume: i64,
    pub packs: String,
    /// Micro du GamePad : identifiant Windows, « default », ou vide (aucun).
    pub micro: String,
}
pub fn cemu(o: &Opts) -> Cemu {
    let langue = get(o, "langue").and_then(|l| ["ja", "en", "fr", "de", "it", "es", "zh", "ko", "nl", "pt", "ru", "tw"].iter().position(|x| *x == l)).map(|n| n as i64);
    let mut g = String::new();
    if let Some(n) = nombre(o, "vsync", 0, 3) {
        g += &format!("    <VSync>{n}</VSync>\n");
    }
    if let Some(n) = nombre(o, "filtre_haut", 0, 3) {
        g += &format!("    <UpscaleFilter>{n}</UpscaleFilter>\n");
    }
    if let Some(n) = nombre(o, "filtre_bas", 0, 3) {
        g += &format!("    <DownscaleFilter>{n}</DownscaleFilter>\n");
    }
    if let Some(b) = oui(o, "etirer") {
        g += &format!("    <FullscreenScaling>{}</FullscreenScaling>\n", u8::from(b));
    }
    if let Some(b) = oui(o, "shaders_async") {
        g += &format!("    <AsyncCompile>{b}</AsyncCompile>\n");
    }
    // Packs : [{ f, p: { catégorie: préréglage } }] ou { f, off: true }.
    let mut packs = String::new();
    if let Some(Ok(serde_json::Value::Array(l))) = get(o, "packs").map(serde_json::from_str::<serde_json::Value>) {
        for p in l {
            let Some(f) = p.get("f").and_then(|f| f.as_str()).filter(|f| f.starts_with("graphicPacks") && !f.contains("..")) else {
                continue;
            };
            if p.get("off").and_then(|x| x.as_bool()) == Some(true) {
                packs += &format!("    <Entry filename=\"{}\" disabled=\"true\">\n    </Entry>\n", xml(f));
                continue;
            }
            packs += &format!("    <Entry filename=\"{}\">\n", xml(f));
            for (cat, pre) in p.get("p").and_then(|x| x.as_object()).into_iter().flatten() {
                let Some(pre) = pre.as_str() else { continue };
                packs += "      <Preset>\n";
                if !cat.is_empty() {
                    packs += &format!("        <category>{}</category>\n", xml(cat));
                }
                packs += &format!("        <preset>{}</preset>\n      </Preset>\n", xml(pre));
            }
            packs += "    </Entry>\n";
        }
    }
    let micro = match micro(o) {
        Some(m) => xml(m),
        None => "default".into(),
    };
    Cemu { api: nombre(o, "api", 0, 1).unwrap_or(1), langue, graphic: g, volume: nombre(o, "volume", 0, 100).unwrap_or(100), packs, micro }
}
/// Boutons du GamePad : (bouton Cemu, entrée). Boutons SDL 0-14, gâchettes 42 et 43.
pub fn cemu_touches(o: &Opts) -> Vec<(u32, u32)> {
    let entree = |p: &str| match p {
        "south" => 0, "east" => 1, "west" => 2, "north" => 3, "back" => 4, "start" => 6, "l3" => 7, "r3" => 8,
        "lb" => 9, "rb" => 10, "up" => 11, "down" => 12, "left" => 13, "right" => 14, "lt" => 42, _ => 43,
    };
    [(1, "a", "east"), (2, "b", "south"), (3, "x", "north"), (4, "y", "west"), (5, "l", "lb"), (6, "r", "rb"), (7, "zl", "lt"), (8, "zr", "rt"), (9, "plus", "start"), (10, "moins", "back"), (15, "l3", "l3"), (16, "r3", "r3")]
        .into_iter()
        .map(|(n, b, d)| (n, entree(touche(o, b).unwrap_or(d))))
        .collect()
}
fn xml(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// Packs graphiques de la communauté qui concernent un jeu, d'après son title ID.
#[derive(serde::Serialize)]
pub struct Pack {
    pub f: String,
    pub nom: String,
    pub description: String,
    /// Catégories : (nom, préréglages, défaut).
    pub categories: Vec<(String, Vec<String>, String)>,
    pub actif: bool,
}
pub fn cemu_packs(cemu: &str, title_id: &str) -> Vec<Pack> {
    let base = std::path::Path::new(cemu).join("portable");
    let mut regles = Vec::new();
    trouver_regles(&base.join("graphicPacks"), &mut regles);
    let tid = title_id.to_ascii_lowercase();
    let mut out: Vec<Pack> = regles
        .into_iter()
        .filter_map(|r| {
            let texte = std::fs::read_to_string(&r).ok()?;
            let pack = lire_pack(&texte)?;
            if !pack.0.iter().any(|t| t.eq_ignore_ascii_case(&tid)) {
                return None;
            }
            let f = r.strip_prefix(&base).ok()?.to_string_lossy().to_string();
            Some(Pack { f, nom: pack.1, description: pack.2, categories: pack.3, actif: pack.4 })
        })
        .collect();
    out.sort_by(|a, b| a.nom.cmp(&b.nom));
    out
}
fn trouver_regles(dir: &std::path::Path, out: &mut Vec<std::path::PathBuf>) {
    if dir.join("rules.txt").exists() {
        out.push(dir.join("rules.txt"));
        return;
    }
    for e in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        if e.path().is_dir() {
            trouver_regles(&e.path(), out);
        }
    }
}
type PackLu = (Vec<String>, String, String, Vec<(String, Vec<String>, String)>, bool);
fn lire_pack(texte: &str) -> Option<PackLu> {
    let mut section = String::new();
    let (mut ids, mut nom, mut desc, mut actif) = (Vec::new(), String::new(), String::new(), false);
    let mut cats: Vec<(String, Vec<String>, String)> = Vec::new();
    let mut preset: Option<(String, String, bool)> = None;
    let fin_preset = |p: &mut Option<(String, String, bool)>, cats: &mut Vec<(String, Vec<String>, String)>| {
        if let Some((n, c, d)) = p.take() {
            if n.is_empty() {
                return;
            }
            if !cats.iter().any(|x| x.0 == c) {
                cats.push((c.clone(), Vec::new(), String::new()));
            }
            let cat = cats.iter_mut().find(|x| x.0 == c).unwrap();
            if !cat.1.contains(&n) {
                cat.1.push(n.clone());
            }
            if d || cat.2.is_empty() {
                cat.2 = n;
            }
        }
    };
    for l in texte.lines() {
        let l = l.trim();
        if l.starts_with('#') || l.is_empty() {
            continue;
        }
        if l.starts_with('[') {
            fin_preset(&mut preset, &mut cats);
            section = l.trim_matches(|c| c == '[' || c == ']').to_ascii_lowercase();
            if section == "preset" {
                preset = Some((String::new(), String::new(), false));
            }
            continue;
        }
        let Some((k, v)) = l.split_once('=') else { continue };
        let (k, v) = (k.trim().to_ascii_lowercase(), v.trim().trim_matches('"').to_string());
        match (section.as_str(), k.as_str()) {
            ("definition", "titleids") => ids = v.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect(),
            ("definition", "path") => nom = v,
            ("definition", "description") => desc = v.replace("\\n", " "),
            ("definition", "default") => actif = v == "1" || v.eq_ignore_ascii_case("true"),
            ("preset", "name") => preset.as_mut().unwrap().0 = v,
            ("preset", "category") => preset.as_mut().unwrap().1 = v,
            ("preset", "default") => preset.as_mut().unwrap().2 = v == "1",
            _ => {}
        }
    }
    fin_preset(&mut preset, &mut cats);
    (!ids.is_empty() && !nom.is_empty()).then_some((ids, nom, desc, cats, actif))
}

/// Title ID d'un jeu Wii U décompressé (meta\meta.xml).
pub fn wiiu_title_id(rpx: &str) -> Option<String> {
    let meta = std::fs::read_to_string(std::path::Path::new(rpx).parent()?.parent()?.join("meta").join("meta.xml")).ok()?;
    let i = meta.find("<title_id")?;
    let from = i + meta[i..].find('>')? + 1;
    let to = from + meta[from..].find('<')?;
    Some(meta[from..to].trim().to_string()).filter(|s| s.len() == 16)
}

/* ---------- Switch : Eden ---------- */

/// Boutons choisis, passés à Eden par ENLOCAL_TOUCHES (« i=j »).
/// Numéros Eden : A 0, B 1, X 2, Y 3, L3 4, R3 5, L 6, R 7, ZL 8, ZR 9, + 10, - 11.
pub fn eden_touches(o: &Opts) -> String {
    const DEFAUT: [(&str, &str); 12] = [("a", "east"), ("b", "south"), ("x", "north"), ("y", "west"), ("l3", "l3"), ("r3", "r3"), ("l", "lb"), ("r", "rb"), ("zl", "lt"), ("zr", "rt"), ("plus", "start"), ("moins", "back")];
    let mut out = Vec::new();
    for (i, (bouton, _)) in DEFAUT.iter().enumerate() {
        if let Some(j) = touche(o, bouton).and_then(|p| DEFAUT.iter().position(|(_, d)| *d == p)) {
            if j != i {
                out.push(format!("{i}={j}"));
            }
        }
    }
    out.join(",")
}

/// Pokémon Let's Go refuse la manette Pro : lancé en mode portable avec ENLOCAL_EN_MAIN.
pub fn en_main(title_id: &str) -> bool {
    ["010003F003A34000", "0100187003A36000"].iter().any(|p| p.eq_ignore_ascii_case(title_id))
}

/// Vibrations des manettes (Réglages, Manette) : oui par défaut.
/// Wii U : manette Pro émulée au lieu du GamePad (jeux qui la gèrent, sans second écran).
pub fn cemu_pro(o: &Opts) -> bool {
    get(o, "manette") == Some("pro")
}

pub fn vibrations(o: &Opts) -> bool {
    get(o, "vibrations") != Some("non")
}

/// Langue et région de la Switch (mêmes numéros dans Eden et Ryujinx). La région suit la langue,
/// sinon certains jeux la refusent.
pub fn langue_switch(o: &Opts) -> Option<(u8, u8)> {
    Some(match get(o, "langue")? {
        "ja" => (0, 0),
        "en" => (1, 1),
        "fr" => (2, 2),
        "de" => (3, 2),
        "it" => (4, 2),
        "es" => (5, 2),
        "nl" => (8, 2),
        "pt" => (9, 2),
        "ru" => (10, 2),
        _ => return None,
    })
}

pub fn eden(ini: &str, o: &Opts, title_id: Option<&str>) -> String {
    let mut r = Vec::new();
    if let Some(n) = nombre(o, "api", 0, 4).filter(|n| *n != 2) {
        r.push(paire("backend", n));
    }
    for (cle, eden, max) in [
        ("resolution", "resolution_setup", 12),
        ("filtre", "scaling_filter", 12),
        ("aa", "anti_aliasing", 2),
        ("format", "aspect_ratio", 4),
        ("vsync", "use_vsync", 3),
        ("precision", "gpu_accuracy", 2),
        ("aniso", "max_anisotropy", 6),
    ] {
        if let Some(n) = nombre(o, cle, 0, max) {
            r.push(paire(eden, n));
        }
    }
    if let Some(b) = oui(o, "shaders_async") {
        r.push(paire("use_asynchronous_shaders", b));
    }
    // Super Mario Party : portraits des personnages noirs en précision Moyenne.
    if title_id.is_some_and(|t| t.eq_ignore_ascii_case("010036B0034E4000")) {
        r.retain(|(k, _)| k != "gpu_accuracy");
        r.push(paire("gpu_accuracy", 2));
    }
    let mut s = Vec::new();
    if let Some((langue, region)) = langue_switch(o) {
        s.push(paire("language_index", langue));
        s.push(paire("region_index", region));
    }
    // Jeu à distance : les manettes des invités arrivent par le serveur DSU d'En Local (distance.rs),
    // console sur la télé pour brancher les joueurs 2 à 8.
    let distance = get(o, "distance") == Some("oui");
    let portable = title_id.is_some_and(en_main) && !distance;
    if let Some(n) = if portable { Some(0) } else if distance { Some(1) } else { nombre(o, "mode", 0, 1) } {
        s.push(paire("use_docked_mode", n));
    }
    let mut a = Vec::new();
    if let Some(n) = nombre(o, "volume", 0, 100) {
        a.push(paire("volume", n));
    }
    // Session Switch (serveur du Local, sur un PC) : des invités à distance peuvent aussi se brancher.
    let invites = distance || get(o, "invites") == Some("oui");
    let mut c = vec![paire("vibration_enabled", vibrations(o)), paire("enable_udp_controller", invites)];
    // Console en main (joueur 8 d'Eden) écrite ici : au démarrage du jeu, Eden recharge ses réglages et la
    // remettait en manette Pro, que Let's Go débranchait (plus de manette).
    c.push(paire("player_8_type", if portable { 4 } else { 0 }));
    c.push(paire("player_8_connected", portable));
    if invites {
        let serveurs: Vec<String> = crate::distance::PORTS.iter().map(|p| format!("127.0.0.1:{p}")).collect();
        c.push(paire("udp_input_servers", format!("\"{}\"", serveurs.join(","))));
    }
    let mut out = ini.to_string();
    for (sec, p) in [("Renderer", r), ("System", s), ("Audio", a), ("Controls", c)] {
        out = ini_set(&out, sec, &p);
    }
    // Mods désactivés : la section entière est réécrite.
    if let Some(tid) = title_id.and_then(|t| u64::from_str_radix(t, 16).ok()) {
        let off: Vec<String> = get(o, "mods_off").and_then(|v| serde_json::from_str(v).ok()).unwrap_or_default();
        let mut sec = String::from("[DisabledAddOns]\n");
        if off.is_empty() {
            sec += "size=0\n";
        } else {
            sec += &format!("1\\title_id={tid}\n");
            for (j, d) in off.iter().enumerate() {
                sec += &format!("1\\disabled\\{}\\d={}\n", j + 1, d.replace(['\n', '\r'], ""));
            }
            sec += &format!("1\\disabled\\size={}\nsize=1\n", off.len());
        }
        out = remplacer_section(&out, "DisabledAddOns", &sec);
    }
    out
}
fn remplacer_section(text: &str, section: &str, nouvelle: &str) -> String {
    let tete = format!("[{section}]");
    let mut out = String::new();
    let mut saute = false;
    let mut mise = false;
    for l in text.lines() {
        if l.starts_with('[') {
            saute = l == tete;
            if saute {
                out += nouvelle;
                mise = true;
                continue;
            }
        }
        if !saute {
            out += l;
            out += "\n";
        }
    }
    if !mise {
        out += nouvelle;
    }
    out
}

/// Mods d'un jeu Switch : user\load\<title ID>.
pub fn eden_mods(eden: &str, title_id: &str) -> Vec<String> {
    let dir = std::path::Path::new(eden).join("user").join("load").join(title_id.to_uppercase());
    let _ = std::fs::create_dir_all(&dir);
    let mut out: Vec<String> = std::fs::read_dir(&dir).into_iter().flatten().flatten().filter(|e| e.path().is_dir()).map(|e| e.file_name().to_string_lossy().to_string()).collect();
    out.sort();
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    fn opts(l: &[(&str, &str)]) -> Opts {
        l.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn ini_qt() {
        let t = ini_set("[UI]\na=1\n[Renderer]\nresolution_setup\\default=true\nresolution_setup=3\nautre=1\n", "Renderer", &[paire("resolution_setup", 6)]);
        assert_eq!(t, "[UI]\na=1\n[Renderer]\nresolution_setup\\default=false\nresolution_setup=6\nautre=1\n");
        assert!(ini_set("[UI]\n", "System", &[paire("language_index", 2)]).ends_with("[System]\nlanguage_index\\default=false\nlanguage_index=2\n"));
    }

    #[test]
    fn rpcs3_config() {
        let c = rpcs3(&opts(&[("langue", "en"), ("resolution", "3"), ("volume", "40")]));
        assert!(c.contains("Resolution Scale: 200") && c.contains("Master Volume: 40") && c.contains("Language: English (US)"));
        assert!(rpcs3(&opts(&[])).contains("Language: French"));
        let g = rpcs3(&opts(&[("api", "opengl"), ("fps", "30"), ("aa", "0"), ("spu_bloc", "mega"), ("rsx_mt", "oui"), ("vsync", "pirate")]));
        assert!(g.starts_with("Core:\n  SPU Block Size: Mega\n"));
        assert_eq!(g.contains("  Precise SPU Verification: true\n"), cfg!(target_os = "macos"));
        assert!(g.contains("  Renderer: OpenGL\n") && g.contains("  Frame limit: 30\n") && g.contains("  MSAA: Disabled\n") && g.contains("  Multithreaded RSX: true\n"));
        assert!(!g.contains("VSync") && rpcs3(&opts(&[])).contains("Core:") == cfg!(target_os = "macos"));
    }
    #[test]
    fn wii_a_l_horizontale() {
        let v = |cote, k: &str| dolphin_wii(&opts(&[]), cote).into_iter().find(|(c, _)| c == k).unwrap().1;
        // PlayStation, Xbox : A et 2 sur valider (en bas), B et 1 sur retour (à droite).
        *crate::pad::KIND.lock().unwrap() = "playstation";
        assert_eq!(v(true, "Buttons/A"), "`Button S`");
        assert_eq!(v(true, "Buttons/2"), "`Button S`");
        assert_eq!(v(true, "Buttons/1"), "`Button E`");
        assert_eq!(v(true, "Buttons/B"), "`Button E`|`Trigger R`");
        assert_eq!(v(false, "Buttons/A"), "`Button S`");
        assert_eq!(v(false, "Buttons/2"), "`Button N`");
        // Nintendo : valider à droite, retour en bas.
        *crate::pad::KIND.lock().unwrap() = "nintendo";
        assert_eq!(v(false, "Buttons/A"), "`Button E`");
        assert_eq!(v(true, "Buttons/1"), "`Button S`");
        assert!(dolphin_classique().contains(&("Classic/Buttons/A".into(), "`Button E`".into())));
        *crate::pad::KIND.lock().unwrap() = "xbox";
        assert!(dolphin_classique().contains(&("Classic/Buttons/A".into(), "`Button S`".into())));
        let m = |l: &[&str]| l.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(disposition_wii("RMCP01", &m(&["wiimote", "nunchuk", "classiccontroller"])), "classique");
        assert_eq!(disposition_wii("SSQP01", &m(&["wiimote"])), "horizontale");
        assert_eq!(disposition_wii("SUPP01", &m(&["wiimote", "mii"])), "nunchuk");
        assert_eq!(disposition_wii("SUPP01", &[]), "nunchuk");
        assert!(dolphin_classique().contains(&("Classic/Right Stick/Up".into(), "`Right Y+`".into())));
    }
    #[test]
    fn eden_langue_et_mods() {
        let o = opts(&[("langue", "fr"), ("resolution", "6"), ("mode", "0"), ("mods_off", "[\"60 FPS\"]")]);
        let t = eden("[System]\nlanguage_index=1\n[DisabledAddOns]\nsize=0\n[Controls]\nx=1\n", &o, Some("010013C00E930000"));
        assert!(t.contains("language_index=2\n") && t.contains("region_index=2\n") && t.contains("use_docked_mode=0\n") && t.contains("resolution_setup=6\n"));
        let lg = eden("", &[("mode".to_string(), "1".to_string())].into_iter().collect(), Some("010003F003A34000"));
        assert!(lg.contains("use_docked_mode=0\n") && lg.contains("player_8_type=4\n") && lg.contains("player_8_connected=true\n"));
        assert!(t.contains("player_8_type=0\n") && t.contains("player_8_connected=false\n"));
        let mut d = o.clone();
        d.insert("distance".into(), "oui".into());
        let dt = eden("", &d, Some("010003F003A34000"));
        assert!(dt.contains("use_docked_mode=1\n") && dt.contains("enable_udp_controller=true\n") && dt.contains("udp_input_servers=\"127.0.0.1:26760,127.0.0.1:26761\"\n"));
        assert!(t.contains(&format!("[DisabledAddOns]\n1\\title_id={}\n1\\disabled\\1\\d=60 FPS\n1\\disabled\\size=1\nsize=1\n[Controls]", 0x010013C00E930000u64)));
        assert_eq!(t.matches("language_index=").count(), 1);
        let smp = eden("", &opts(&[("precision", "1")]), Some("010036b0034e4000"));
        assert!(smp.contains("gpu_accuracy=2\n") && !smp.contains("gpu_accuracy=1\n"));
    }

    #[test]
    fn ra_dans_dolphin() {
        let dir = std::env::temp_dir().join("enlocal-dolphin-ra");
        let d = dir.to_str().unwrap();
        dolphin_ra(d, &opts(&[("ra_user", "relood\nx=1"), ("ra_token", "AbC123"), ("ra_hardcore", "oui")])).unwrap();
        let t = std::fs::read_to_string(dir.join("User/Config/RetroAchievements.ini")).unwrap();
        assert!(t.contains("Enabled = True\nUsername = reloodx1\nApiToken = AbC123\nHardcoreEnabled = True"));
        dolphin_ra(d, &opts(&[])).unwrap();
        assert_eq!(std::fs::read_to_string(dir.join("User/Config/RetroAchievements.ini")).unwrap(), "[Achievements]\nEnabled = False\n");
    }

    #[test]
    fn touches() {
        let o = opts(&[("touche_a", "south"), ("touche_b", "east"), ("touche_zl", "lb"), ("touche_x", "nimporte")]);
        assert_eq!(eden_touches(&o), "0=1,1=0,8=6");
        let ds = touches_ds(&o);
        assert_eq!((ds[8], ds[0], ds[9]), (0, 8, 9));
        assert!(azahar_controles(&o).contains("button_a=\"engine:sdl,api:controller,maptype:all,button:0\""));
        assert!(azahar_controles(&o).contains("button_zl=\"engine:sdl,api:controller,maptype:all,button:9\""));
        assert_eq!(cemu_touches(&o)[0], (1, 0));
        assert_eq!(cemu_touches(&o)[6], (7, 9));
        let gc = dolphin_gc(&o, &[("a", "`Button E`"), ("l", "`Trigger L`")]);
        assert!(gc.contains(&("Buttons/A".into(), "`Button S`".into())) && gc.contains(&("Triggers/L-Analog".into(), "`Trigger L`".into())));
    }

    #[test]
    fn dolphin_options() {
        let a = dolphin_args(&opts(&[("langue", "fr"), ("resolution", "3"), ("vsync", "oui"), ("resolution2", "x")]), true);
        assert_eq!(a, [
            "-C", "SYSCONF.IPL.LNG=3", "-C", "GFX.Settings.InternalResolution=3", "-C", "GFX.Hardware.VSync=True",
            "-C", "Dolphin.EmulatedUSBDevices.EmulateSkylanderPortal=True",
            "-C", "Dolphin.EmulatedUSBDevices.EmulateWiiSpeak=True", "-C", "Dolphin.EmulatedUSBDevices.WiiSpeakMuted=False", "-C", "Dolphin.EmulatedUSBDevices.WiiSpeakMicrophone=",
        ]);
        // Micro choisi, ou aucun.
        let m = dolphin_args(&opts(&[("micro", "{0.0.1.00000000}.{abc}")]), true);
        assert!(m.contains(&"Dolphin.EmulatedUSBDevices.WiiSpeakMicrophone={0.0.1.00000000}.{abc}".to_string()));
        assert!(dolphin_args(&opts(&[("micro", "aucun")]), true).contains(&"Dolphin.EmulatedUSBDevices.EmulateWiiSpeak=False".to_string()));
        // Un identifiant qui n'a pas la forme Windows est ignoré (micro par défaut).
        assert_eq!(micro(&opts(&[("micro", "C:\\x")])), None);
        assert_eq!(cemu(&opts(&[("micro", "aucun")])).micro, "");
        assert_eq!(cemu(&opts(&[])).micro, "default");
        assert_eq!(dolphin_args(&opts(&[("langue", "fr"), ("resolution", "99")]), false), ["-C", "Dolphin.Core.SelectedLanguage=2"]);
    }

    #[test]
    fn langue_de_la_3ds() {
        let mut b = vec![0u8; 4 + 12 * 2];
        b[0] = 2;
        b[4..8].copy_from_slice(&0x000B_0000u32.to_le_bytes());
        b[16..20].copy_from_slice(&0x000A_0002u32.to_le_bytes());
        b[20] = 1;
        assert!(langue_3ds(&mut b, 2));
        assert_eq!(b[20], 2);
        assert!(!langue_3ds(&mut b, 2));
        // Bloc de 0x1C octets dans le fichier : valide ; qui en sort ou chevauche la table : abîmé.
        assert!(config_3ds_valide(&b));
        let mut c = vec![0u8; 0x100];
        c[0] = 1;
        c[8..12].copy_from_slice(&0x80u32.to_le_bytes());
        c[12] = 0x1C;
        assert!(config_3ds_valide(&c));
        c[8..12].copy_from_slice(&0xF0u32.to_le_bytes());
        assert!(!config_3ds_valide(&c));
        c[8..12].copy_from_slice(&0u32.to_le_bytes());
        assert!(!config_3ds_valide(&c));
    }

    #[test]
    #[ignore]
    fn vrais_packs() {
        let p = cemu_packs("C:\\EnLocal\\emu\\cemu", "00050000101C9500");
        for x in &p {
            println!("{} | actif {} | {:?}", x.nom, x.actif, x.categories.iter().map(|c| (&c.0, c.1.len(), &c.2)).collect::<Vec<_>>());
        }
        assert!(p.len() > 20);
    }

    #[test]
    fn pack_cemu() {
        let t = "[Definition]\ntitleIds = 00050000101C9300,00050000101C9400\nname = Resolution\npath = \"The Legend of Zelda: Breath of the Wild/Graphics/Resolution\"\ndescription = Change la résolution.\nversion = 7\n\n[Preset]\nname = 1280x720\n$w = 1280\n\n[Preset]\nname = 2560x1440\ndefault = 1\n\n[Preset]\ncategory = Ombres\nname = Hautes\n";
        let (ids, nom, _, cats, actif) = lire_pack(t).unwrap();
        assert!(!actif);
        assert!(lire_pack("[Definition]\ntitleIds = 1\npath = a/b\ndefault = 1\n").unwrap().4);
        assert_eq!(ids.len(), 2);
        assert_eq!(nom, "The Legend of Zelda: Breath of the Wild/Graphics/Resolution");
        assert_eq!(cats, vec![(String::new(), vec!["1280x720".to_string(), "2560x1440".to_string()], "2560x1440".to_string()), ("Ombres".to_string(), vec!["Hautes".to_string()], "Hautes".to_string())]);
        let c = cemu(&opts(&[("packs", r#"[{"f":"graphicPacks\\a\\rules.txt","p":{"":"2560x1440","Ombres":"Hautes"}},{"f":"..\\x","p":{}},{"f":"graphicPacks\\b\\rules.txt","off":true}]"#)]));
        assert!(c.packs.contains("<Entry filename=\"graphicPacks\\b\\rules.txt\" disabled=\"true\">"));
        assert!(c.packs.contains("<Entry filename=\"graphicPacks\\a\\rules.txt\">") && c.packs.contains("<category>Ombres</category>") && !c.packs.contains(".."));
    }
}
