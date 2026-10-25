//! PS3 : RPCS3, collé dans notre fenêtre comme Cemu. Jeux : dossier de disque (PS3_GAME) ou .iso
//! déchiffré. Le firmware n'est pas fourni : chacun installe celui de Sony (PS3UPDAT.PUP).
use crate::plateforme::SansFenetre;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::process::Command;
use std::time::{Duration, Instant};

/// Champs texte d'un PARAM.SFO (TITLE, TITLE_ID…).
pub fn sfo(b: &[u8]) -> Vec<(String, String)> {
    let u32_ = |o: usize| b.get(o..o + 4).map(|x| u32::from_le_bytes(x.try_into().unwrap()) as usize);
    let u16_ = |o: usize| b.get(o..o + 2).map(|x| u16::from_le_bytes(x.try_into().unwrap()) as usize);
    let cstr = |o: usize, max: usize| b.get(o..(o + max).min(b.len())).map(|x| String::from_utf8_lossy(&x[..x.iter().position(|&c| c == 0).unwrap_or(x.len())]).into_owned());
    let mut out = Vec::new();
    if b.get(..4) != Some(b"\0PSF") {
        return out;
    }
    let (Some(cles), Some(donnees), Some(n)) = (u32_(8), u32_(12), u32_(16)) else { return out };
    for i in 0..n.min(256) {
        let e = 20 + i * 16;
        let (Some(k), Some(fmt), Some(len), Some(d)) = (u16_(e), u16_(e + 2), u32_(e + 4), u32_(e + 12)) else { break };
        // 0x0204 : texte UTF-8 terminé par un zéro.
        if fmt == 0x0204 {
            if let (Some(k), Some(v)) = (cstr(cles + k, 64), cstr(donnees + d, len)) {
                out.push((k, v));
            }
        }
    }
    out
}

/// Nom et identifiant (ex. « BLES00932 ») d'un jeu : PARAM.SFO d'un dossier de disque, ou lu dans l'.iso.
pub fn infos(path: &str) -> Option<(String, String)> {
    let b = if path.to_lowercase().ends_with(".iso") { sfo_iso(path)? } else { std::fs::read(path).ok()? };
    let champs = sfo(&b);
    let get = |k: &str| champs.iter().find(|(c, _)| c == k).map(|(_, v)| v.trim().to_string()).filter(|v| !v.is_empty());
    Some((get("TITLE")?.replace(['\n', '\r'], " "), get("TITLE_ID")?))
}

/// .iso de PS3 : ISO 9660 avec un dossier PS3_GAME à la racine.
pub fn est_iso(path: &str) -> bool {
    sfo_iso(path).is_some()
}

/// PS3_GAME\PARAM.SFO dans une image ISO 9660 (secteurs de 2048 octets).
fn sfo_iso(path: &str) -> Option<Vec<u8>> {
    let mut f = std::fs::File::open(path).ok()?;
    let mut lire = |lba: u64, taille: usize| -> Option<Vec<u8>> {
        let mut b = vec![0u8; taille];
        f.seek(SeekFrom::Start(lba * 2048)).ok()?;
        f.read_exact(&mut b).ok()?;
        Some(b)
    };
    let pvd = lire(16, 2048)?;
    if &pvd[1..6] != b"CD001" {
        return None;
    }
    // Entrée de dossier : position (LBA) en 2, taille en 10, nom en 33 (longueur en 32).
    let entree = |d: &[u8]| (u32::from_le_bytes(d[2..6].try_into().unwrap()) as u64, u32::from_le_bytes(d[10..14].try_into().unwrap()) as usize);
    let chercher = |dossier: &[u8], nom: &str| -> Option<(u64, usize)> {
        let mut o = 0;
        while o + 33 < dossier.len() {
            let l = dossier[o] as usize;
            if l == 0 {
                // Fin du secteur : l'entrée suivante commence au secteur d'après.
                o = (o / 2048 + 1) * 2048;
                continue;
            }
            let n = dossier[o + 32] as usize;
            let nom_ici = String::from_utf8_lossy(dossier.get(o + 33..o + 33 + n)?);
            if nom_ici.split(';').next()?.eq_ignore_ascii_case(nom) {
                return Some(entree(&dossier[o..]));
            }
            o += l;
        }
        None
    };
    let (lba, taille) = entree(&pvd[156..]);
    let racine = lire(lba, taille.min(1 << 20))?;
    let (lba, taille) = chercher(&racine, "PS3_GAME")?;
    let jeu = lire(lba, taille.min(1 << 20))?;
    let (lba, taille) = chercher(&jeu, "PARAM.SFO")?;
    lire(lba, taille.min(1 << 16))
}

/// Firmware installé (dev_flash), sinon RPCS3 ne lance rien.
/// Données de RPCS3 (config, dev_flash…) : à côté de rpcs3.exe ; sur Mac, dans « portable » à côté de
/// RPCS3.app (mode portable de RPCS3 : sinon il range tout dans ~/Library/Application Support).
fn donnees(dir: &str) -> String {
    if cfg!(windows) { dir.to_string() } else { format!("{dir}/portable") }
}
fn programme(dir: &str) -> String {
    if cfg!(windows) { crate::embed::exe(dir, "rpcs3.exe", crate::embed::EXE_PS3) } else { format!("{dir}/RPCS3.app/Contents/MacOS/rpcs3") }
}

pub fn firmware(dir: &str) -> bool {
    Path::new(&donnees(dir)).join("dev_flash").join("vsh").join("etc").join("version.txt").exists()
}

/// Installe le PS3UPDAT.PUP de Sony choisi par le joueur. RPCS3 ne le fait qu'avec son interface :
/// on la lance, on attend que le firmware soit là, puis on la ferme.
pub fn installer_firmware(dir: &str, pup: &str) -> Result<(), String> {
    if !pup.to_lowercase().ends_with(".pup") || !Path::new(pup).is_file() {
        return Err("Choisis le fichier PS3UPDAT.PUP téléchargé sur le site de Sony.".into());
    }
    preparer(dir, &Default::default()).map_err(|e| e.to_string())?;
    if !Path::new(&programme(dir)).is_file() {
        return Err("RPCS3 (l'émulateur PS3) n'est pas installé.".into());
    }
    let _ = std::fs::create_dir_all(donnees(dir));
    // macOS : RPCS3 ouvert caché (open -j) et en arrière-plan ; « open » se termine avec lui (-W).
    #[cfg(not(windows))]
    let mut child = Command::new("open").args(["-j", "-g", "-n", "-W", &format!("{dir}/RPCS3.app"), "--args", "--installfw", pup]).spawn().map_err(|e| e.to_string())?;
    #[cfg(windows)]
    let mut child = Command::new(programme(dir)).args(["--installfw", pup]).spawn().map(crate::embed::tie).map_err(|e| e.to_string())?;
    let fin = Instant::now() + Duration::from_secs(600);
    while !firmware(dir) && Instant::now() < fin && !matches!(child.try_wait(), Ok(Some(_))) {
        std::thread::sleep(Duration::from_millis(500));
    }
    // Le fichier de version arrive en dernier : on laisse RPCS3 finir d'écrire.
    std::thread::sleep(Duration::from_secs(3));
    let _ = child.kill();
    // macOS : c'est « open » qui a été arrêté, RPCS3 tourne encore.
    #[cfg(not(windows))]
    let _ = Command::new("pkill").args(["-f", &programme(dir)]).status();
    if firmware(dir) { Ok(()) } else { Err("RPCS3 n'a pas pu installer ce firmware.".into()) }
}

/// Boutons de la manette pour RPCS3 (son gestionnaire SDL) : touches choisies, sinon la même place.
fn bouton(o: &crate::reglages::Opts, id: &str, defaut: &str) -> &'static str {
    match crate::reglages::touche(o, id).unwrap_or(defaut) {
        "south" => "South", "east" => "East", "west" => "West", "north" => "North",
        "lb" => "LB", "rb" => "RB", "lt" => "LT", "rt" => "RT",
        "start" => "Start", "back" => "Back", "l3" => "LS", "r3" => "RS",
        "up" => "Up", "down" => "Down", "left" => "Left", _ => "Right",
    }
}

/// config.yml : sans plein écran, RPCS3 se ferme avec le jeu. Et jamais son écran de bienvenue
/// ni ses confirmations (réglages de son interface, GuiConfigs\CurrentSettings.ini).
fn preparer(dir: &str, o: &crate::reglages::Opts) -> std::io::Result<()> {
    let dir = &donnees(dir);
    let cfg = chemin!("{dir}\\config");
    std::fs::create_dir_all(chemin!("{cfg}\\input_configs\\global"))?;
    std::fs::write(chemin!("{cfg}\\config.yml"), crate::reglages::rpcs3(o))?;
    let gui = chemin!("{dir}\\GuiConfigs\\CurrentSettings.ini");
    std::fs::create_dir_all(chemin!("{dir}\\GuiConfigs"))?;
    std::fs::write(&gui, sans_bienvenue(&std::fs::read_to_string(&gui).unwrap_or_default()))
}

/// Section [main_window] du fichier de RPCS3, sans écran de bienvenue ni confirmations. Le reste est gardé.
fn sans_bienvenue(ini: &str) -> String {
    const CLES: [&str; 3] = ["infoBoxEnabledWelcome", "confirmationBoxExitGame", "confirmationBoxBootGame"];
    let mut out: Vec<String> = ini.lines().filter(|l| !CLES.iter().any(|k| l.starts_with(&format!("{k}=")))).map(String::from).collect();
    let at = match out.iter().position(|l| l.trim() == "[main_window]") {
        Some(i) => i + 1,
        None => {
            out.push("[main_window]".into());
            out.len()
        }
    };
    out.splice(at..at, CLES.iter().map(|k| format!("{k}=false")));
    out.join("\n") + "\n"
}

/// PS3 : RPCS3 sans son interface, collé dans notre fenêtre.
pub fn start(dir: &str, game: &str, parent: isize, o: &crate::reglages::Opts) -> Result<String, String> {
    if !firmware(dir) {
        return Err("firmware PS3 manquant : installe-le depuis Réglages, PS3".into());
    }
    preparer(dir, o).map_err(|e| e.to_string())?;
    let name = crate::pad::NAME.lock().unwrap().clone();
    let mut pad = format!("Player 1 Input:\n  Handler: {}\n  Device: {}\n  Config:\n", if name.is_empty() { "Keyboard" } else { "SDL" }, if name.is_empty() { "Keyboard".into() } else { format!("{name} 1") });
    if !name.is_empty() {
        for (cle, id, d) in [
            ("Cross", "croix", "south"), ("Circle", "rond", "east"), ("Square", "carre", "west"), ("Triangle", "triangle", "north"),
            ("L1", "l1", "lb"), ("R1", "r1", "rb"), ("L2", "l2", "lt"), ("R2", "r2", "rt"), ("L3", "l3", "l3"), ("R3", "r3", "r3"),
            ("Start", "start", "start"), ("Select", "select", "back"),
        ] {
            pad += &format!("    {cle}: {}\n", bouton(o, id, d));
        }
    }
    std::fs::write(chemin!("{}\\config\\input_configs\\global\\Default.yml", donnees(dir)), pad).map_err(|e| e.to_string())?;
    // Dossier de disque : RPCS3 veut le dossier du jeu (celui qui contient PS3_GAME).
    let cible = if game.to_lowercase().ends_with(".iso") { game.to_string() } else { Path::new(game).parent().and_then(|p| p.parent()).ok_or("dossier du jeu introuvable")?.to_string_lossy().into_owned() };
    let mut cmd = Command::new(programme(dir));
    #[cfg(not(windows))]
    crate::embed::suivre_cadre_injecte(&mut cmd);
    let child = cmd
        .env("SDL_GAMECONTROLLERCONFIG", crate::pad::mappings())
        .args(["--no-gui", &cible])
        .sans_fenetre()
        .spawn()
        .map(crate::embed::tie)
        .map_err(|e| e.to_string())?;
    // La fenêtre du jeu (« FPS: … | Vulkan | … ») : avant elle, RPCS3 montre la compilation des modules,
    // longue au premier lancement d'un jeu.
    crate::embed::coller(child, parent, "FPS", "RPCS3", "FPS", Duration::from_secs(900))
}

/// Icône du jeu : PS3_GAME\ICON0.PNG (dossier de disque seulement).
pub fn icone(path: &str) -> Option<(usize, usize, Vec<u8>)> {
    let f = std::fs::File::open(Path::new(path).parent()?.join("ICON0.PNG")).ok()?;
    let mut d = png::Decoder::new(f);
    d.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut r = d.read_info().ok()?;
    let mut buf = vec![0; r.output_buffer_size()];
    let info = r.next_frame(&mut buf).ok()?;
    let px = &buf[..info.buffer_size()];
    let rgba = match info.color_type {
        png::ColorType::Rgba => px.to_vec(),
        png::ColorType::Rgb => px.chunks(3).flat_map(|c| [c[0], c[1], c[2], 255]).collect(),
        png::ColorType::GrayscaleAlpha => px.chunks(2).flat_map(|c| [c[0], c[0], c[0], c[1]]).collect(),
        png::ColorType::Grayscale => px.iter().flat_map(|&g| [g, g, g, 255]).collect(),
        _ => return None,
    };
    Some((info.width as usize, info.height as usize, rgba))
}

#[cfg(test)]
pub(crate) mod tests {
    /// PARAM.SFO minimal : TITLE et TITLE_ID.
    pub(crate) fn sfo_test() -> Vec<u8> {
        let cles = b"TITLE\0TITLE_ID\0\0";
        let (t, id) = (b"Demon's Souls\0\0\0", b"BLES00932\0\0\0\0\0\0\0");
        let (debut_cles, debut_donnees) = (20 + 2 * 16, 20 + 2 * 16 + cles.len());
        let mut b = b"\0PSF".to_vec();
        b.extend(0x101u32.to_le_bytes());
        b.extend((debut_cles as u32).to_le_bytes());
        b.extend((debut_donnees as u32).to_le_bytes());
        b.extend(2u32.to_le_bytes());
        for (k, len, max, d) in [(0u16, 14u32, 16u32, 0u32), (6, 10, 16, 16)] {
            b.extend(k.to_le_bytes());
            b.extend(0x0204u16.to_le_bytes());
            b.extend(len.to_le_bytes());
            b.extend(max.to_le_bytes());
            b.extend(d.to_le_bytes());
        }
        b.extend(cles);
        b.extend(t);
        b.extend(id);
        b
    }

    #[test]
    fn bienvenue_coupee() {
        let a = super::sans_bienvenue("[Meta]\nx=1\n[main_window]\ninfoBoxEnabledWelcome=true\nlastExplorePathPUP=C:/x\n");
        assert!(a.contains("[main_window]\ninfoBoxEnabledWelcome=false") && !a.contains("=true") && a.contains("lastExplorePathPUP=C:/x") && a.contains("[Meta]\nx=1"));
        assert!(super::sans_bienvenue("").contains("[main_window]\ninfoBoxEnabledWelcome=false\nconfirmationBoxExitGame=false"));
    }

    #[test]
    fn param_sfo() {
        let c = super::sfo(&sfo_test());
        assert!(c.contains(&("TITLE".into(), "Demon's Souls".into())));
        assert!(c.contains(&("TITLE_ID".into(), "BLES00932".into())));
        assert!(super::sfo(b"pas un sfo").is_empty());
    }

    #[test]
    fn iso_de_ps3() {
        // ISO 9660 : racine en 20 avec PS3_GAME (21), qui contient PARAM.SFO (22).
        let sfo = sfo_test();
        let mut iso = vec![0u8; 23 * 2048];
        let entree = |nom: &[u8], lba: u32, taille: u32| {
            let mut e = vec![0u8; 33 + nom.len() + (nom.len() + 1) % 2];
            e[0] = e.len() as u8;
            e[2..6].copy_from_slice(&lba.to_le_bytes());
            e[10..14].copy_from_slice(&taille.to_le_bytes());
            e[32] = nom.len() as u8;
            e[33..33 + nom.len()].copy_from_slice(nom);
            e
        };
        iso[16 * 2048 + 1..16 * 2048 + 6].copy_from_slice(b"CD001");
        let racine = entree(b"\0", 20, 2048);
        iso[16 * 2048 + 156..16 * 2048 + 156 + racine.len()].copy_from_slice(&racine);
        let ps3 = entree(b"PS3_GAME", 21, 2048);
        iso[20 * 2048..20 * 2048 + ps3.len()].copy_from_slice(&ps3);
        let p = entree(b"PARAM.SFO;1", 22, sfo.len() as u32);
        iso[21 * 2048..21 * 2048 + p.len()].copy_from_slice(&p);
        iso[22 * 2048..22 * 2048 + sfo.len()].copy_from_slice(&sfo);
        let f = std::env::temp_dir().join("enlocal-ps3-test.iso");
        std::fs::write(&f, &iso).unwrap();
        let f = f.to_string_lossy().into_owned();
        assert_eq!(super::infos(&f), Some(("Demon's Souls".into(), "BLES00932".into())));
        iso[16 * 2048 + 1] = b'X';
        std::fs::write(&f, &iso).unwrap();
        assert!(!super::est_iso(&f));
    }
}
