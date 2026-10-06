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
const PHYS: [&str; 16] = ["south", "west", "back", "start", "up", "down", "left", "right", "east", "north", "lb", "rb", "lt", "rt", "l3", "r3"];
fn touche<'a>(o: &'a Opts, bouton: &str) -> Option<&'a str> {
    get(o, &format!("touche_{bouton}")).filter(|p| PHYS.contains(p))
}

/* ---------- DS : melonDS ---------- */

pub fn melonds(o: &Opts) -> Vec<(&'static str, String)> {
    let mut out = Vec::new();
    if let Some(l) = get(o, "langue").filter(|l| ["en", "ja", "fr", "de", "it", "es"].contains(l)) {
        out.push(("melonds_firmware_language", l.to_string()));
    }
    if get(o, "pseudo").is_some() {
        out.push(("melonds_firmware_username", "guess_username".into())); // le pseudo donné par En Local
    }
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
    let mut c = Vec::new();
    if let Some(n) = nombre(o, "cpu", 5, 400) {
        c.push(paire("cpu_clock_percentage", n));
    }
    let mut out = String::new();
    for (s, p) in [("Renderer", r), ("Layout", l), ("Audio", a), ("Core", c)] {
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
    let f = format!("{emu_dir}\\user\\nand\\data\\00000000000000000000000000000000\\sysdata\\00010017\\00000000\\config");
    let Ok(mut b) = std::fs::read(&f) else {
        return Ok(()); // créé par Azahar au premier lancement
    };
    if langue_3ds(&mut b, n as u8) {
        std::fs::write(&f, b)?;
    }
    Ok(())
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
    if let Some(api) = get(o, "api").filter(|a| ["D3D", "D3D12", "Vulkan", "OGL"].contains(a)) {
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
/// Wiimote + Nunchuk : touches choisies, sinon disposition d'En Local.
pub fn dolphin_wii(o: &Opts) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for (cles, bouton, defaut) in [
        (&["Buttons/A"][..], "a", "south"), (&["Buttons/B"], "b", "rt"), (&["Buttons/1"], "un", "west"), (&["Buttons/2"], "deux", "north"),
        (&["Buttons/-"], "moins", "back"), (&["Buttons/+"], "plus", "start"), (&["Nunchuk/Buttons/C"], "c", "lb"), (&["Nunchuk/Buttons/Z"], "nz", "lt"),
        (&["Shake/X", "Shake/Y", "Shake/Z"], "secouer", "r3"),
    ] {
        let v = dolphin_entree(touche(o, bouton).unwrap_or(defaut));
        for k in cles {
            out.push((k.to_string(), v.to_string()));
        }
    }
    out
}

/// RetroAchievements dans Dolphin. Sans compte : désactivé.
pub fn dolphin_ra(dolphin: &str, o: &Opts) -> std::io::Result<()> {
    let (Some(u), Some(t)) = (get(o, "ra_user"), get(o, "ra_token")) else {
        return std::fs::write(format!("{dolphin}\\User\\Config\\RetroAchievements.ini"), "[Achievements]\nEnabled = False\n");
    };
    let propre = |s: &str| s.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-' || *c == '.').collect::<String>();
    let b = |v: bool| if v { "True" } else { "False" };
    std::fs::create_dir_all(format!("{dolphin}\\User\\Config"))?;
    std::fs::write(
        format!("{dolphin}\\User\\Config\\RetroAchievements.ini"),
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

/* ---------- Wii U : Cemu ---------- */

/// Parties de settings.xml : langue, Graphic, Audio et packs graphiques.
pub struct Cemu {
    pub api: i64,
    pub langue: Option<i64>,
    pub graphic: String,
    pub volume: i64,
    pub packs: String,
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
    Cemu { api: nombre(o, "api", 0, 1).unwrap_or(1), langue, graphic: g, volume: nombre(o, "volume", 0, 100).unwrap_or(100), packs }
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
    let mut s = Vec::new();
    if let Some(l) = get(o, "langue") {
        // La région suit la langue, sinon certains jeux la refusent.
        let (langue, region) = match l {
            "ja" => (0, 0),
            "en" => (1, 1),
            "fr" => (2, 2),
            "de" => (3, 2),
            "it" => (4, 2),
            "es" => (5, 2),
            "nl" => (8, 2),
            "pt" => (9, 2),
            "ru" => (10, 2),
            _ => (-1, -1),
        };
        if langue >= 0 {
            s.push(paire("language_index", langue));
            s.push(paire("region_index", region));
        }
    }
    let portable = title_id.is_some_and(en_main);
    if let Some(n) = if portable { Some(0) } else { nombre(o, "mode", 0, 1) } {
        s.push(paire("use_docked_mode", n));
    }
    let mut a = Vec::new();
    if let Some(n) = nombre(o, "volume", 0, 100) {
        a.push(paire("volume", n));
    }
    let mut out = ini.to_string();
    for (sec, p) in [("Renderer", r), ("System", s), ("Audio", a)] {
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
    fn eden_langue_et_mods() {
        let o = opts(&[("langue", "fr"), ("resolution", "6"), ("mode", "0"), ("mods_off", "[\"60 FPS\"]")]);
        let t = eden("[System]\nlanguage_index=1\n[DisabledAddOns]\nsize=0\n[Controls]\nx=1\n", &o, Some("010013C00E930000"));
        assert!(t.contains("language_index=2\n") && t.contains("region_index=2\n") && t.contains("use_docked_mode=0\n") && t.contains("resolution_setup=6\n"));
        let lg = eden("", &[("mode".to_string(), "1".to_string())].into_iter().collect(), Some("010003F003A34000"));
        assert!(lg.contains("use_docked_mode=0\n"));
        assert!(t.contains(&format!("[DisabledAddOns]\n1\\title_id={}\n1\\disabled\\1\\d=60 FPS\n1\\disabled\\size=1\nsize=1\n[Controls]", 0x010013C00E930000u64)));
        assert_eq!(t.matches("language_index=").count(), 1);
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
        assert_eq!(a, ["-C", "SYSCONF.IPL.LNG=3", "-C", "GFX.Settings.InternalResolution=3", "-C", "GFX.Hardware.VSync=True"]);
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
