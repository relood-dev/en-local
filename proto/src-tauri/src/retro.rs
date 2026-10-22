//! Anciennes Nintendo (NES, Super Nintendo, N64, Game Boy, Game Boy Color, GBA), PS1 et PS2 : RetroArch
//! et un cœur par console, collé dans notre fenêtre comme Cemu. En session, le netplay de RetroArch passe
//! par le relais de Loc (loc-lab.fr:55435) : personne n'ouvre de port.
//! PS1 : PCSX ReARMed, sans BIOS (le sien remplace celui de Sony). PS2 : LRPS2, avec le BIOS de sa PS2.
use std::io::{Read, Seek, SeekFrom};
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const RELAIS: &str = "loc-lab.fr";
const PORT_RELAIS: u16 = 55435;

/// Console d'après l'extension du fichier.
pub fn console(ext: &str) -> Option<&'static str> {
    Some(match ext {
        "nes" => "NES",
        "sfc" | "smc" => "SNES",
        "z64" | "n64" | "v64" => "N64",
        "gb" => "GB",
        "gbc" => "GBC",
        "gba" => "GBA",
        _ => return None,
    })
}

/// Console d'un fichier : cartouches à l'extension, disques PlayStation au SYSTEM.CNF (BOOT2 : PS2).
pub fn console_de(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_lowercase();
    match ext.as_str() {
        "pbp" => Some("PS1"),
        "cso" | "zso" => Some("PS2"),
        "chd" => chd_dvd(path).map(|dvd| if dvd { "PS2" } else { "PS1" }),
        "iso" | "cue" => {
            let cnf = String::from_utf8_lossy(&system_cnf(path)?).to_uppercase();
            if cnf.contains("BOOT2") { Some("PS2") } else if cnf.contains("BOOT") { Some("PS1") } else { None }
        }
        e => console(e),
    }
}

/// CHD : disque DVD (PS2) ou CD (PS1), d'après sa première métadonnée. None : pas un CHD lisible.
fn chd_dvd(path: &Path) -> Option<bool> {
    let mut f = std::fs::File::open(path).ok()?;
    let mut h = [0u8; 0x38];
    f.read_exact(&mut h).ok()?;
    if &h[..8] != b"MComprHD" || u32::from_be_bytes(h[12..16].try_into().ok()?) != 5 {
        return None;
    }
    let meta = u64::from_be_bytes(h[0x30..0x38].try_into().ok()?);
    let mut tag = [0u8; 4];
    f.seek(SeekFrom::Start(meta)).ok()?;
    f.read_exact(&mut tag).ok()?;
    match &tag {
        b"DVD " => Some(true),
        b"CHT2" | b"CHTR" | b"CHCD" | b"CHGT" | b"CHGD" => Some(false),
        _ => None,
    }
}

/// Fichiers d'un .cue (FILE "…"), dans son dossier.
pub fn pistes(cue: &Path) -> Vec<std::path::PathBuf> {
    let texte = std::fs::read_to_string(cue).unwrap_or_default();
    let dossier = cue.parent().unwrap_or(Path::new("."));
    texte.lines().filter_map(|l| {
        let l = l.trim();
        if !l.to_uppercase().starts_with("FILE ") {
            return None;
        }
        let nom = l[5..].trim();
        let nom = if let Some(r) = nom.strip_prefix('"') { r.split('"').next()? } else { nom.split_whitespace().next()? };
        // Seulement un nom de fichier du même dossier, jamais un chemin.
        (!nom.is_empty() && !nom.contains(['/', '\\', ':']) && nom != "." && nom != "..").then(|| dossier.join(nom))
    }).collect()
}

/// SYSTEM.CNF à la racine du disque : .iso (secteurs de 2048 octets) ou première piste d'un .cue
/// (secteurs bruts de 2352 octets, données après 16 ou 24 octets d'en-tête).
fn system_cnf(path: &Path) -> Option<Vec<u8>> {
    let cue = path.extension().is_some_and(|e| e.eq_ignore_ascii_case("cue"));
    let (fichier, secteur, decalage) = if cue {
        let texte = std::fs::read_to_string(path).ok()?.to_uppercase();
        let decalage = if texte.contains("MODE1/2352") { 16 } else { 24 };
        let brut = !texte.contains("/2048");
        (pistes(path).into_iter().next()?, if brut { 2352 } else { 2048 }, if brut { decalage } else { 0 })
    } else {
        (path.to_path_buf(), 2048, 0)
    };
    let mut f = std::fs::File::open(fichier).ok()?;
    let mut lire = |lba: u64, taille: usize| -> Option<Vec<u8>> {
        let mut out = Vec::with_capacity(taille);
        let mut b = vec![0u8; 2048];
        for n in 0..taille.div_ceil(2048) as u64 {
            f.seek(SeekFrom::Start((lba + n) * secteur + decalage)).ok()?;
            f.read_exact(&mut b).ok()?;
            out.extend_from_slice(&b);
        }
        out.truncate(taille);
        Some(out)
    };
    let pvd = lire(16, 2048)?;
    if &pvd[1..6] != b"CD001" {
        return None;
    }
    let entree = |d: &[u8]| (u32::from_le_bytes(d[2..6].try_into().unwrap()) as u64, u32::from_le_bytes(d[10..14].try_into().unwrap()) as usize);
    let (lba, taille) = entree(&pvd[156..]);
    let racine = lire(lba, taille.min(64 * 1024))?;
    let mut o = 0;
    while o + 33 < racine.len() {
        let l = racine[o] as usize;
        if l == 0 {
            o = (o / 2048 + 1) * 2048;
            continue;
        }
        let n = racine[o + 32] as usize;
        let nom = String::from_utf8_lossy(racine.get(o + 33..o + 33 + n)?).to_uppercase();
        if nom.split(';').next() == Some("SYSTEM.CNF") {
            let (lba, taille) = entree(&racine[o..]);
            return lire(lba, taille.min(4096));
        }
        o += l;
    }
    None
}

/// BIOS de la PS2 : là où LRPS2 le cherche (system\pcsx2\bios).
pub fn dossier_bios_ps2(dir: &str) -> std::path::PathBuf {
    Path::new(dir).join("system").join("pcsx2").join("bios")
}
/// Un vrai BIOS de PS2 : 1 à 8 Mo, avec sa table ROMDIR (« RESET » puis « ROMDIR »).
pub fn bios_ps2_valide(b: &[u8]) -> bool {
    let debut = &b[..b.len().min(1 << 20)];
    (1 << 20..=8 << 20).contains(&b.len()) && debut.windows(16).any(|w| w.starts_with(b"RESET\0") && debut.windows(7).any(|x| x == b"ROMDIR\0"))
}
pub fn bios_ps2(dir: &str) -> bool {
    std::fs::read_dir(dossier_bios_ps2(dir)).into_iter().flatten().flatten().any(|e| std::fs::read(e.path()).is_ok_and(|b| bios_ps2_valide(&b)))
}
/// Copie le BIOS choisi par le joueur (celui de sa PS2), après vérification.
pub fn poser_bios_ps2(dir: &str, f: &Path) -> Result<String, String> {
    let b = std::fs::read(f).map_err(|e| e.to_string())?;
    if !bios_ps2_valide(&b) {
        return Err("Ce fichier n'est pas un BIOS de PS2 (un fichier de 4 Mo, souvent nommé SCPH-xxxxx.bin, sorti de ta PS2).".into());
    }
    let d = dossier_bios_ps2(dir);
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    let nom = f.file_name().map(|n| n.to_string_lossy().into_owned()).filter(|n| !n.contains(['/', '\\'])).unwrap_or_else(|| "bios.bin".into());
    std::fs::write(d.join(nom), b).map_err(|e| e.to_string())?;
    Ok("BIOS PS2 installé".into())
}

pub fn console_connue(console: &str) -> bool {
    coeur(console).is_some()
}

/// Titre lisible d'un nom No-Intro : « Legend of Zelda, The - A Link to the Past (Europe) (En,Fr,De) »
/// devient « The Legend of Zelda - A Link to the Past ».
pub fn titre(nom: &str) -> String {
    let (mut out, mut dans) = (String::new(), 0u32);
    for c in nom.chars() {
        match c {
            '(' | '[' => dans += 1,
            ')' | ']' => dans = dans.saturating_sub(1),
            _ if dans == 0 => out.push(c),
            _ => {}
        }
    }
    let t = out.split_whitespace().collect::<Vec<_>>().join(" ");
    let (debut, suite) = t.split_once(" - ").map_or((t.as_str(), ""), |(a, b)| (a, b));
    let debut = match debut.rsplit_once(", ") {
        Some((a, art)) if ["The", "A", "An", "Le", "La", "Les"].contains(&art) => format!("{art} {a}"),
        _ => debut.to_string(),
    };
    let t = if suite.is_empty() { debut } else { format!("{debut} - {suite}") };
    if t.is_empty() { nom.to_string() } else { t }
}

fn coeur(console: &str) -> Option<&'static str> {
    Some(match console {
        "NES" => "mesen",
        "SNES" => "snes9x",
        "N64" => "mupen64plus_next",
        "GB" | "GBC" => "gambatte",
        "GBA" => "mgba",
        "PS1" => "pcsx_rearmed",
        "PS2" => "pcsx2",
        _ => return None,
    })
}

/// Boutons de chaque console : (id dans En Local, bouton RetroPad, touche par défaut).
/// Le RetroPad suit la manette Super Nintendo : B en bas, A à droite. N64 : A est le B du RetroPad.
fn boutons(console: &str) -> &'static [(&'static str, &'static str, &'static str)] {
    match console {
        "SNES" => &[("a", "a", "east"), ("b", "b", "south"), ("x", "x", "north"), ("y", "y", "west"), ("l", "l", "lb"), ("r", "r", "rb"), ("start", "start", "start"), ("select", "select", "back")],
        "GBA" => &[("a", "a", "east"), ("b", "b", "south"), ("l", "l", "lb"), ("r", "r", "rb"), ("start", "start", "start"), ("select", "select", "back")],
        "N64" => &[("a", "b", "south"), ("b", "y", "west"), ("z", "l2", "lt"), ("l", "l", "lb"), ("r", "r", "rb"), ("start", "start", "start")],
        // PlayStation : ✕ est le B du RetroPad, ○ le A, □ le Y, △ le X.
        "PS1" | "PS2" => &[
            ("croix", "b", "south"), ("rond", "a", "east"), ("carre", "y", "west"), ("triangle", "x", "north"), ("l1", "l", "lb"), ("r1", "r", "rb"),
            ("l2", "l2", "lt"), ("r2", "r2", "rt"), ("l3", "l3", "l3"), ("r3", "r3", "r3"), ("start", "start", "start"), ("select", "select", "back"),
        ],
        _ => &[("a", "a", "east"), ("b", "b", "south"), ("start", "start", "start"), ("select", "select", "back")],
    }
}

/// Entrée SDL2 « manette de jeu » pour RetroArch : boutons 0 à 14, gâchettes sur les axes 4 et 5.
fn entree(p: &str) -> (&'static str, &'static str) {
    match p {
        "south" => ("btn", "0"), "east" => ("btn", "1"), "west" => ("btn", "2"), "north" => ("btn", "3"),
        "back" => ("btn", "4"), "start" => ("btn", "6"), "l3" => ("btn", "7"), "r3" => ("btn", "8"),
        "lb" => ("btn", "9"), "rb" => ("btn", "10"), "up" => ("btn", "11"), "down" => ("btn", "12"),
        "left" => ("btn", "13"), "right" => ("btn", "14"), "lt" => ("axis", "+4"), _ => ("axis", "+5"),
    }
}

/// retroarch.cfg écrit à chaque lancement : RetroArch complète le reste et ne le réécrit pas.
pub fn config(console: &str, o: &crate::reglages::Opts, pseudo: &str) -> String {
    let get = |k: &str| o.get(k).map(String::as_str);
    let mut c = String::from(
        "config_save_on_exit = \"false\"\nvideo_fullscreen = \"false\"\nvideo_windowed_fullscreen = \"false\"\nvideo_driver = \"glcore\"\n\
         pause_nonactive = \"false\"\nmenu_driver = \"rgui\"\nmenu_show_load_content_animation = \"false\"\n\
         input_menu_toggle = \"nul\"\ninput_menu_toggle_gamepad_combo = \"0\"\ninput_exit_emulator = \"nul\"\ninput_pause_toggle = \"nul\"\n\
         input_hold_fast_forward = \"nul\"\ninput_toggle_fast_forward = \"nul\"\ninput_rewind = \"nul\"\ninput_reset = \"nul\"\n\
         input_save_state = \"nul\"\ninput_load_state = \"nul\"\ninput_toggle_fullscreen = \"nul\"\n\
         input_joypad_driver = \"sdl2\"\ninput_autodetect_enable = \"false\"\ninput_player1_joypad_index = \"0\"\n\
         input_player1_l_x_plus_axis = \"+0\"\ninput_player1_l_x_minus_axis = \"-0\"\ninput_player1_l_y_plus_axis = \"+1\"\ninput_player1_l_y_minus_axis = \"-1\"\n\
         input_player1_r_x_plus_axis = \"+2\"\ninput_player1_r_x_minus_axis = \"-2\"\ninput_player1_r_y_plus_axis = \"+3\"\ninput_player1_r_y_minus_axis = \"-3\"\n\
         input_player1_up_btn = \"11\"\ninput_player1_down_btn = \"12\"\ninput_player1_left_btn = \"13\"\ninput_player1_right_btn = \"14\"\n\
         input_player1_analog_dpad_mode = \"1\"\nnetplay_public_announce = \"false\"\nnetplay_nat_traversal = \"false\"\n",
    );
    // N64, PS1, PS2 : les sticks restent des sticks (les jeux en ont besoin), la croix fait la croix.
    if matches!(console, "N64" | "PS1" | "PS2") {
        c = c.replace("input_player1_analog_dpad_mode = \"1\"", "input_player1_analog_dpad_mode = \"0\"");
    }
    // PS1 : une DualShock (sticks et vibrations), les jeux numériques marchent aussi avec.
    if console == "PS1" {
        c += "input_libretro_device_p1 = \"517\"\n";
    }
    // En Local cadre déjà l'image au format de la console : RetroArch la remplit. Plein écran (format 0) : celui du jeu.
    let cadre = get("format_jeu").and_then(|v| v.parse::<f64>().ok()).is_some_and(|f| f > 0.0);
    c += &format!("video_scale_integer = \"false\"\naspect_ratio_index = \"{}\"\n", if cadre { 24 } else { 22 });
    for (id, retropad, defaut) in boutons(console) {
        let (genre, v) = entree(crate::reglages::touche(o, id).unwrap_or(defaut));
        let autre = if genre == "btn" { "axis" } else { "btn" };
        c += &format!("input_player1_{retropad}_{genre} = \"{v}\"\ninput_player1_{retropad}_{autre} = \"nul\"\n");
    }
    // Volume en décibels (0 dB : 100 %).
    match get("volume").and_then(|v| v.parse::<f32>().ok()).map(|v| v.clamp(0.0, 100.0)) {
        Some(v) if v == 0.0 => c += "audio_mute_enable = \"true\"\n",
        Some(v) => c += &format!("audio_mute_enable = \"false\"\naudio_volume = \"{:.1}\"\n", 20.0 * (v / 100.0).log10()),
        None => c += "audio_mute_enable = \"false\"\naudio_volume = \"0.0\"\n",
    }
    // PS2 : plus de marge pour le son, contre les craquements quand une image prend du retard.
    c += &format!("audio_latency = \"{}\"\n", if console == "PS2" { 128 } else { 64 });
    if get("lissage") == Some("lisse") {
        c += "video_smooth = \"true\"\n";
    } else {
        c += "video_smooth = \"false\"\n";
    }
    let pseudo: String = pseudo.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-' || *c == '.').take(32).collect();
    if !pseudo.is_empty() {
        c += &format!("netplay_nickname = \"{pseudo}\"\n");
    }
    // Hôte : la partie passe par le relais du Local.
    if get("netplay") == Some("hote") {
        c += &format!("netplay_use_mitm_server = \"true\"\nnetplay_mitm_server = \"custom\"\nnetplay_custom_mitm_server = \"{RELAIS}:{PORT_RELAIS}\"\n");
    } else {
        c += "netplay_use_mitm_server = \"false\"\n";
    }
    c
}

/// Session de relais reçue de Loc : 12 octets en base64.
fn session_valide(s: &str) -> bool {
    s.len() == 16 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'+' || b == b'/' || b == b'=')
}

/// Version européenne (50 Hz) d'après le nom No-Intro : elle a des bandes noires dans l'image.
fn pal(nom: &str) -> bool {
    ["(Europe", "(E)", "(Germany", "(France", "(Italy", "(Spain", "(Australia", "(Netherlands", "(Sweden", "(Scandinavia"].iter().any(|r| nom.contains(r))
}

/// N64 : les jeux européens sont rognés de leurs bandes noires (options du cœur, refaites à chaque lancement).
/// Valeurs en pixels de l'image d'origine (320×288 en Europe), estimées sur Super Mario 64.
fn options_n64(dir: &str, game: &str) -> std::io::Result<()> {
    // Ajustées sur Super Mario 64 européen : il restait un liseré en bas et sur les côtés à 24 / 24 / 4 / 4.
    let (h, b, c) = if pal(game) { ("24", "28", "6") } else { ("0", "0", "0") };
    options_coeur(dir, "Mupen64Plus-Next", &[("mupen64plus-EnableOverscan", "Enabled"), ("mupen64plus-OverscanTop", h), ("mupen64plus-OverscanBottom", b), ("mupen64plus-OverscanLeft", c), ("mupen64plus-OverscanRight", c)])
}

/// Options d'un cœur (config\<cœur>\<cœur>.opt) imposées par En Local ; les autres sont gardées.
fn options_coeur(dir: &str, coeur: &str, reglees: &[(&str, &str)]) -> std::io::Result<()> {
    let d = format!("{dir}\\config\\{coeur}");
    let f = format!("{d}\\{coeur}.opt");
    let mut out: Vec<String> = std::fs::read_to_string(&f).unwrap_or_default().lines().filter(|x| !reglees.iter().any(|(k, _)| x.split(" =").next() == Some(*k))).map(String::from).collect();
    out.extend(reglees.iter().map(|(k, v)| format!("{k} = \"{v}\"")));
    std::fs::create_dir_all(d)?;
    std::fs::write(f, out.join("\n") + "\n")
}

pub fn start(dir: &str, game: &str, console: &str, parent: isize, o: &crate::reglages::Opts) -> Result<String, String> {
    let coeur = coeur(console).ok_or("console inconnue")?;
    let dll = format!("{dir}\\cores\\{coeur}_libretro.dll");
    if !std::path::Path::new(&dll).exists() {
        return Err(format!("cœur {coeur} manquant"));
    }
    if console == "N64" {
        let _ = options_n64(dir, game);
    }
    if console == "PS2" && !bios_ps2(dir) {
        return Err("BIOS PS2 manquant : ajoute celui de ta PS2 dans Réglages, PlayStation 2".into());
    }
    // PS2 : le VU1 sur son propre cœur du processeur (MTVU) ; sans lui, Gran Turismo 4 et les jeux lourds
    // tournent sous la vitesse normale et le son grésille.
    if console == "PS2" {
        let _ = options_coeur(dir, "LRPS2", &[("pcsx2_mtvu", "enabled")]);
    }
    let pseudo = o.get("pseudo").cloned().unwrap_or_default();
    let cfg = format!("{dir}\\enlocal.cfg");
    std::fs::write(&cfg, config(console, o, &pseudo)).map_err(|e| e.to_string())?;
    let mut args: Vec<String> = vec!["-c".into(), cfg, "-v".into(), "--log-file".into(), format!("{dir}\\enlocal.log"), "-L".into(), dll, game.into()];
    match o.get("netplay").map(String::as_str) {
        Some("hote") => args.push("--host".into()),
        Some("invite") => {
            let s = o.get("relais").filter(|s| session_valide(s)).ok_or("la partie de l'hôte n'est pas prête")?;
            args.extend(["--connect".into(), RELAIS.into(), "--port".into(), PORT_RELAIS.to_string(), "--mitm-session".into(), s.clone()]);
        }
        _ => {}
    }
    let child = Command::new(crate::embed::exe(dir, "retroarch.exe", crate::embed::EXE_RETRO))
        .env("SDL_GAMECONTROLLERCONFIG", crate::pad::mappings())
        .args(&args)
        // Sorties fermées : sinon RetroArch ouvre sa « Log Console » à côté du jeu.
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map(crate::embed::tie)
        .map_err(|e| e.to_string())?;
    crate::embed::coller(child, parent, "RetroArch", "RetroArch", "", std::time::Duration::from_secs(30))
}

#[cfg(test)]
mod tests {
    pub(super) fn opts(l: &[(&str, &str)]) -> crate::reglages::Opts {
        l.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn config_retroarch() {
        let c = super::config("SNES", &opts(&[("volume", "50"), ("touche_a", "south"), ("netplay", "hote")]), "Black Reaper!");
        assert!(c.contains("input_player1_a_btn = \"0\"") && c.contains("input_player1_a_axis = \"nul\""));
        assert!(c.contains("input_player1_b_btn = \"0\"")); // B reste en bas : deux boutons sur la même touche, c'est le choix du joueur
        assert!(c.contains("audio_volume = \"-6.0\""));
        assert!(c.contains("netplay_nickname = \"BlackReaper\""));
        assert!(c.contains("netplay_custom_mitm_server = \"loc-lab.fr:55435\""));
        let n64 = super::config("N64", &opts(&[("touche_z", "rt"), ("volume", "0")]), "");
        assert!(n64.contains("input_player1_l2_axis = \"+5\"") && n64.contains("input_player1_l2_btn = \"nul\""));
        assert!(n64.contains("input_player1_analog_dpad_mode = \"0\"") && n64.contains("audio_mute_enable = \"true\""));
        assert!(!n64.contains("netplay_nickname"));
    }

    #[test]
    fn options_d_un_coeur() {
        let d = std::env::temp_dir().join(format!("enlocal-opt-{}", std::process::id()));
        std::fs::create_dir_all(d.join("config").join("LRPS2")).unwrap();
        std::fs::write(d.join("config").join("LRPS2").join("LRPS2.opt"), "pcsx2_bios = \"x.bin\"\npcsx2_mtvu = \"disabled\"\npcsx2_mtvu_bis = \"1\"\n").unwrap();
        super::options_coeur(&d.to_string_lossy(), "LRPS2", &[("pcsx2_mtvu", "enabled")]).unwrap();
        let t = std::fs::read_to_string(d.join("config").join("LRPS2").join("LRPS2.opt")).unwrap();
        assert_eq!(t, "pcsx2_bios = \"x.bin\"\npcsx2_mtvu_bis = \"1\"\npcsx2_mtvu = \"enabled\"\n");
        assert!(super::config("PS2", &super::tests::opts(&[]), "").contains("audio_latency = \"128\""));
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn disques_playstation() {
        let d = std::env::temp_dir().join(format!("enlocal-psx-{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        // ISO 9660 minimal : SYSTEM.CNF à la racine (secteur 20), racine en 18.
        let iso = |cnf: &str, secteur: usize, decalage: usize| {
            let mut b = vec![0u8; 22 * secteur];
            let s = |n: usize| n * secteur + decalage;
            b[s(16) + 1..s(16) + 6].copy_from_slice(b"CD001");
            let mut racine = vec![0u8; 34];
            racine[0] = 34;
            racine[2..6].copy_from_slice(&18u32.to_le_bytes());
            racine[10..14].copy_from_slice(&2048u32.to_le_bytes());
            b[s(16) + 156..s(16) + 156 + 34].copy_from_slice(&racine);
            let nom = b"SYSTEM.CNF;1";
            let mut e = vec![0u8; 33 + nom.len() + 1];
            e[0] = e.len() as u8;
            e[2..6].copy_from_slice(&20u32.to_le_bytes());
            e[10..14].copy_from_slice(&(cnf.len() as u32).to_le_bytes());
            e[32] = nom.len() as u8;
            e[33..33 + nom.len()].copy_from_slice(nom);
            b[s(18)..s(18) + e.len()].copy_from_slice(&e);
            b[s(20)..s(20) + cnf.len()].copy_from_slice(cnf.as_bytes());
            b
        };
        std::fs::write(d.join("ps2.iso"), iso("BOOT2 = cdrom0:\\SLES_538.25;1\r\n", 2048, 0)).unwrap();
        std::fs::write(d.join("ps1 (Track 1).bin"), iso("BOOT = cdrom:\\SCES_003.44;1\r\n", 2352, 24)).unwrap();
        std::fs::write(d.join("ps1.cue"), "FILE \"ps1 (Track 1).bin\" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n").unwrap();
        std::fs::write(d.join("gc.iso"), vec![0u8; 40000]).unwrap();
        assert_eq!(super::console_de(&d.join("ps2.iso")), Some("PS2"));
        assert_eq!(super::console_de(&d.join("ps1.cue")), Some("PS1"));
        assert_eq!(super::console_de(&d.join("gc.iso")), None);
        assert_eq!(super::pistes(&d.join("ps1.cue")), [d.join("ps1 (Track 1).bin")]);
        std::fs::write(d.join("piege.cue"), "FILE \"..\\..\\x.bin\" BINARY\n").unwrap();
        assert!(super::pistes(&d.join("piege.cue")).is_empty());
        let mut bios = vec![0u8; 4 << 20];
        bios[0x2700..0x2706].copy_from_slice(b"RESET\0");
        bios[0x2710..0x2717].copy_from_slice(b"ROMDIR\0");
        assert!(super::bios_ps2_valide(&bios) && !super::bios_ps2_valide(&bios[..1000]));
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn consoles_et_sessions() {
        assert_eq!(super::console("sfc"), Some("SNES"));
        assert_eq!(super::titre("Super Mario 64 (Europe) (En,Fr,De)"), "Super Mario 64");
        assert_eq!(super::titre("Legend of Zelda, The - A Link to the Past (Europe) [!]"), "The Legend of Zelda - A Link to the Past");
        assert_eq!(super::titre("Pokemon - Crystal Version (USA, Europe) (Rev 1)"), "Pokemon - Crystal Version");
        assert_eq!(super::titre("(Europe)"), "(Europe)");
        assert!(super::pal("Super Mario 64 (Europe) (En,Fr,De)") && !super::pal("Mario Kart 64 (USA)"));
        assert_eq!(super::console("v64"), Some("N64"));
        assert_eq!(super::console("iso"), None);
        assert!(super::session_valide("AAECAwQFBgcICQoL"));
        assert!(!super::session_valide("AAECAwQFBgcICQoL\" --x"));
    }
}
