// En Local : lance les jeux DS, 3DS, GameCube, Wii, Wii U et Switch dans l'app.
// DS : cœur libretro chargé dans l'app. Autres consoles : émulateur collé dans la fenêtre.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod embed;
mod gametdb;
mod maison;
mod libretro;
mod pad;
mod perf;
mod presence;
mod pseudo;
mod clips;
mod dossier;
mod importer;
mod medias;
mod nsz;
mod reglages;
mod salon;
mod saves;
mod son;
mod switch;

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

/* Dossier d'En Local : celui de l'exe, ou la racine du projet en développement. */
pub fn root() -> &'static str {
    static R: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    R.get_or_init(|| {
        let exe = std::env::current_exe().unwrap_or_default();
        let installe = exe.parent().map(|d| d.to_path_buf()).unwrap_or_default();
        // Seulement ces deux dossiers, jamais un « emu » trouvé plus haut.
        let dev = exe.ancestors().nth(5).filter(|r| r.join("proto").join("src-tauri").is_dir()).map(|r| r.to_path_buf());
        let dir = if installe.join("emu").is_dir() { installe } else { dev.filter(|r| r.join("emu").is_dir()).unwrap_or(installe) };
        maison::propre(&dir)
    })
}
fn emu(nom: &str) -> String {
    format!("{}\\emu\\{nom}", root())
}
fn azahar() -> String {
    emu("azahar-enlocal")
}
fn dolphin() -> String {
    emu("dolphin-enlocal")
}
fn cemu() -> String {
    emu("cemu")
}
pub fn eden() -> String {
    emu("eden-enlocal")
}
/// Crée les dossiers de données des émulateurs (l'installeur ne copie que des fichiers).
fn preparer_emulateurs() {
    for d in [format!("{}\\user", azahar()), format!("{}\\User", dolphin()), format!("{}\\user", eden()), format!("{}\\portable", cemu()), format!("{}\\data", root())] {
        let _ = std::fs::create_dir_all(d);
    }
    let _ = std::fs::write(format!("{}\\portable.txt", dolphin()), "");
}
fn melonds() -> String {
    emu("melondsds\\melondsds_libretro-win32-x86_64-Release\\cores\\melondsds_libretro.dll")
}
/// API d'En Local hébergée par Loc.
const API: &str = "https://loc-lab.fr/enlocal";

/// Menu ouvert par-dessus un jeu.
static MENU: AtomicBool = AtomicBool::new(false);
static SNAPSHOT: std::sync::Mutex<Vec<u8>> = std::sync::Mutex::new(Vec::new());

#[derive(Serialize)]
struct Game {
    name: String,
    path: String,
    console: &'static str,
    title_id: Option<String>,
    /// Code produit : ses 3 premiers caractères désignent le jeu, toutes régions.
    product_code: Option<String>,
    /// Identifiant du disque GameCube/Wii : le netplay exige le même.
    disc_id: Option<String>,
    /// Date d'arrivée du jeu sur ce PC (secondes Unix).
    added: u64,
}

/// Fichiers de jeu sous dir. Un jeu Wii U décompressé compte pour son .rpx.
fn game_files(dir: &std::path::Path, out: &mut Vec<std::path::PathBuf>) {
    menage_mac(dir);
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    let (dirs, files): (Vec<_>, Vec<_>) = entries.flatten().map(|e| e.path()).partition(|p| p.is_dir());
    if let Some(rpx) = std::fs::read_dir(dir.join("code")).into_iter().flatten().flatten().map(|e| e.path()).find(|p| p.extension().is_some_and(|x| x.eq_ignore_ascii_case("rpx"))) {
        out.push(rpx);
        return;
    }
    out.extend(files);
    // Les MAJ et DLC Switch ne sont pas des jeux.
    for d in dirs.into_iter().filter(|d| d.file_name().is_none_or(|n| n != dossier::MAJ)) {
        game_files(&d, out);
    }
}

/// Supprime les restes d'archives Mac (__MACOSX, ._*, .DS_Store) du dossier des jeux.
fn menage_mac(dir: &std::path::Path) {
    for e in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        let nom = e.file_name().to_string_lossy().into_owned();
        let Ok(t) = e.file_type() else { continue };
        if t.is_dir() && nom == "__MACOSX" {
            let _ = std::fs::remove_dir_all(e.path());
        } else if t.is_file() && (nom == ".DS_Store" || (nom.starts_with("._") && apple_double(&e.path()))) {
            let _ = std::fs::remove_file(e.path());
        }
    }
}
/// Fichier « ._ » d'attributs Apple : jamais un jeu.
fn apple_double(p: &std::path::Path) -> bool {
    let mut en_tete = [0u8; 4];
    std::fs::metadata(p).is_ok_and(|m| m.len() <= 1024 * 1024)
        && std::fs::File::open(p).and_then(|mut f| f.read_exact(&mut en_tete)).is_ok()
        && en_tete == [0x00, 0x05, 0x16, 0x07]
}

/// Jeu 3DS chiffré ? (drapeau NoCrypto de la première partition NCCH)
fn chiffre_3ds(path: &str) -> bool {
    use std::io::{Seek, SeekFrom};
    let Ok(mut f) = std::fs::File::open(path) else { return false };
    let mut h = [0u8; 0x200];
    if f.read_exact(&mut h).is_err() {
        return false;
    }
    let ncch = match &h[0x100..0x104] {
        b"NCSD" => u32::from_le_bytes(h[0x120..0x124].try_into().unwrap()) as u64 * 0x200,
        b"NCCH" => 0,
        _ => return false,
    };
    if ncch != 0 && (f.seek(SeekFrom::Start(ncch)).is_err() || f.read_exact(&mut h).is_err()) {
        return false;
    }
    &h[0x100..0x104] == b"NCCH" && h[0x18F] & 0x04 == 0
}

#[tauri::command]
fn list_games() -> Vec<Game> {
    let mut files = Vec::new();
    game_files(&dossier::jeux(), &mut files);
    let mut games: Vec<Game> = files
        .into_iter()
        .filter_map(|path| {
            let ext = path.extension()?.to_str()?.to_lowercase();
            let console = match ext.as_str() {
                "nds" => "DS",
                "3ds" | "cci" | "cia" | "cxi" | "zcci" | "zcxi" | "3dsx" => "3DS",
                "iso" | "gcm" | "rvz" | "wia" | "wbfs" | "ciso" | "gcz" | "wad" => embed::dolphin_console(&path.to_string_lossy())?,
                "wua" | "wud" | "wux" | "wuhb" | "rpx" => "WiiU",
                "nsp" | "nsz" | "xci" | "xcz" => "Switch",
                _ => return None,
            };
            // Wii U décompressé : le nom du dossier (le .rpx a un nom de code).
            let name = if ext == "rpx" { path.parent()?.parent()?.file_name()? } else { path.file_stem()? }.to_string_lossy().into_owned();
            // Switch : le nom du dossier du jeu, souvent plus complet que celui du fichier.
            let name = match (console, path.parent()) {
                ("Switch", Some(d)) if d.parent().and_then(|p| p.file_name()).is_some_and(|n| n.eq_ignore_ascii_case("Switch")) => d.file_name().map_or(name, |n| n.to_string_lossy().into_owned()),
                _ => name,
            };
            let path = path.to_string_lossy().into_owned();
            let (title_id, product_code) = match console {
                "3DS" => (embed::title_id(&path), embed::product_code(&path)),
                "DS" => (ds_game_code(&path), ds_game_code(&path)),
                "WiiU" => (reglages::wiiu_title_id(&path), wiiu_id(&path)),
                "Switch" => (switch_title_id(&path), None),
                _ => (None, None),
            };
            if console == "Switch" && title_id.as_deref().and_then(|x| u64::from_str_radix(x, 16).ok()).is_some_and(contenu_switch) {
                return None;
            }
            let disc_id = if console == "GC" || console == "Wii" { embed::dolphin_game_id(&path) } else { None };
            let file = if ext == "rpx" { std::path::Path::new(&path).parent()?.parent()?.to_path_buf() } else { std::path::PathBuf::from(&path) };
            let added = std::fs::metadata(&file).and_then(|m| m.created().or_else(|_| m.modified())).ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_secs());
            Some(Game { name, path, console, title_id, product_code, disc_id, added })
        })
        .collect();
    games.sort_by(|a, b| a.name.cmp(&b.name));
    games
}

/// Title ID d'un .nsp, lu dans le ticket ou le cnmt.xml. Les .xci n'en donnent pas.
fn switch_title_id(path: &str) -> Option<String> {
    let hex16 = |s: &str| (s.len() >= 16 && s[..16].bytes().all(|b| b.is_ascii_hexdigit())).then(|| s[..16].to_uppercase());
    let (_, entrees) = entrees_nsp(path)?;
    if let Some(id) = entrees.iter().find(|e| e.0.ends_with(".tik")).and_then(|e| hex16(&e.0)) {
        return Some(id);
    }
    let xml = cnmt_xml(path)?;
    let at = xml.find("<Id>0x")? + 6;
    hex16(&xml[at..])
}
/// Version d'une mise à jour Switch, lue dans son cnmt.xml.
fn switch_version(path: &str) -> Option<u32> {
    let xml = cnmt_xml(path)?;
    xml.split("<Version>").nth(1)?.split('<').next()?.trim().parse().ok()
}
fn cnmt_xml(path: &str) -> Option<String> {
    use std::io::{Seek, SeekFrom};
    let (mut f, entrees) = entrees_nsp(path)?;
    let (_, off, size) = entrees.into_iter().find(|e| e.0.ends_with(".cnmt.xml"))?;
    let mut xml = vec![0u8; size.min(64 * 1024) as usize];
    f.seek(SeekFrom::Start(off)).and_then(|_| f.read_exact(&mut xml)).ok()?;
    Some(String::from_utf8_lossy(&xml).into_owned())
}
/// Fichiers d'un .nsp (PFS0) : (nom, position, taille).
fn entrees_nsp(path: &str) -> Option<(std::fs::File, Vec<(String, u64, u64)>)> {
    let mut f = std::fs::File::open(path).ok()?;
    let mut hdr = [0u8; 16];
    f.read_exact(&mut hdr).ok()?;
    if &hdr[..4] != b"PFS0" {
        return None;
    }
    let n = u32::from_le_bytes(hdr[4..8].try_into().ok()?) as usize;
    let strings = u32::from_le_bytes(hdr[8..12].try_into().ok()?) as usize;
    if n > 4096 || strings > 1 << 20 {
        return None;
    }
    let mut table = vec![0u8; n * 24 + strings];
    f.read_exact(&mut table).ok()?;
    let data = 16 + table.len() as u64;
    let entrees = table[..n * 24].chunks_exact(24).map(|e| {
        let at = n * 24 + u32::from_le_bytes(e[16..20].try_into().unwrap()) as usize;
        let s = table.get(at..).unwrap_or_default();
        let nom = String::from_utf8_lossy(&s[..s.iter().position(|&b| b == 0).unwrap_or(s.len())]).into_owned();
        (nom, data + u64::from_le_bytes(e[..8].try_into().unwrap()), u64::from_le_bytes(e[8..16].try_into().unwrap()))
    }).collect();
    Some((f, entrees))
}

#[derive(Serialize)]
struct Maj {
    path: String,
    nom: String,
    /// Version dans le nom du fichier (« [v851968] »).
    version: Option<u32>,
}

fn contenus_switch(dir: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    for e in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        let p = e.path();
        if p.is_dir() {
            out.extend(contenus_switch(&p));
        } else if p.extension().and_then(|x| x.to_str()).is_some_and(|x| x.eq_ignore_ascii_case("nsp") || x.eq_ignore_ascii_case("nsz")) {
            out.push(p);
        }
    }
    out.sort();
    out
}

/// Switch : mise à jour (jeu + 0x800) ou DLC (jeu + 0x1000 + n) ?
fn contenu_switch(id: u64) -> bool {
    id & 0x800 != 0 || (id >> 12) & 1 == 1
}
/// Title ID : dans le nom du fichier, sinon dans le fichier.
fn id_switch(p: &std::path::Path) -> Option<u64> {
    let nom = p.file_stem()?.to_string_lossy().into_owned();
    let id = nom.split('[').skip(1).filter_map(|x| x.split(']').next()).find(|x| x.len() == 16 && x.bytes().all(|b| b.is_ascii_hexdigit())).map(String::from)
        .or_else(|| switch_title_id(p.to_str()?))?;
    u64::from_str_radix(&id, 16).ok()
}
/// MAJ et DLC Switch sous dir, avec leur title ID.
fn contenus_switch_ids(dir: &std::path::Path) -> Vec<(std::path::PathBuf, u64)> {
    contenus_switch(dir).into_iter().filter_map(|p| id_switch(&p).filter(|x| contenu_switch(*x)).map(|x| (p, x))).collect()
}

fn majs_de(dir: &std::path::Path, title_id: &str) -> Vec<Maj> {
    let Some(cible) = (title_id.len() == 16).then(|| u64::from_str_radix(title_id, 16).ok()).flatten().map(|x| (x & !0xFFF) + 0x800) else { return Vec::new() };
    let crochet = |nom: &str, debut: &str| nom.split('[').skip(1).filter_map(|x| x.split(']').next()).find_map(|x| x.strip_prefix(debut).map(String::from));
    contenus_switch_ids(dir).into_iter().filter(|(_, id)| *id == cible).filter_map(|(p, _)| {
        let nom = p.file_stem()?.to_string_lossy().into_owned();
        let version = crochet(&nom, "v").and_then(|v| v.parse::<u32>().ok()).or_else(|| switch_version(p.to_str()?));
        Some(Maj { path: p.to_string_lossy().into_owned(), nom, version })
    }).collect()
}

#[tauri::command]
fn switch_updates(title_id: String) -> Vec<Maj> {
    majs_de(&dossier::switch(), &title_id)
}

/// Médias, lus hors du thread de l'interface.
#[tauri::command]
async fn medias_liste() -> serde_json::Value {
    tauri::async_runtime::spawn_blocking(|| serde_json::json!({ "albums": medias::albums(), "videos": medias::videos(), "dossier": medias::racine().to_string_lossy() }))
        .await
        .unwrap_or(serde_json::Value::Null)
}

fn dossier_media(sorte: &str) -> std::path::PathBuf {
    if sorte == "captures" {
        return maison::dossier_captures();
    }
    medias::choisi(sorte).unwrap_or_else(|| {
        medias::preparer();
        medias::racine().join(if sorte == "videos" { "Vidéos" } else { "Musique" })
    })
}

#[tauri::command]
fn ouvrir_medias(sorte: String) {
    let _ = std::process::Command::new("explorer").arg(dossier_media(&sorte)).spawn();
}

#[tauri::command]
fn dossiers_medias() -> serde_json::Value {
    let un = |s: &str| serde_json::json!({ "chemin": dossier_media(s).to_string_lossy(), "choisi": medias::choisi(s).is_some() });
    serde_json::json!({ "musique": un("musique"), "videos": un("videos"), "captures": un("captures") })
}

/// Crée un dossier de médias là où l'utilisateur le choisit. None si annulé.
#[tauri::command]
async fn creer_dossier_media(app: AppHandle, sorte: String, nom: String) -> Result<Option<String>, String> {
    let nom = nom.trim().to_string();
    if nom.is_empty() || nom.len() > 80 || nom.contains(['\\', '/', ':', '*', '?', '"', '<', '>', '|']) || nom.starts_with('.') {
        return Err("Nom de dossier invalide (sans \\ / : * ? \" < > |)".into());
    }
    let owner = main_hwnd(&app)?;
    let Some(parent) = tauri::async_runtime::spawn_blocking(move || dossier::selectionner(owner, "Où créer ce dossier ?")).await.ok().flatten() else {
        return Ok(None);
    };
    let d = std::path::Path::new(&parent).join(&nom);
    if !medias::dossier_permis(&d) {
        return Err("Pas ici : choisis un dossier à toi (pas dans Windows ni Program Files).".into());
    }
    medias::choisir(&sorte, Some(&d.to_string_lossy()))?;
    let d = dossier_media(&sorte);
    for x in medias::deux_chemins(&d) {
        let _ = app.asset_protocol_scope().allow_directory(&x, true);
    }
    Ok(Some(d.to_string_lossy().into_owned()))
}

/// Le dossier est toujours choisi dans la fenêtre de Windows, jamais donné par l'interface.
/// defaut : revenir au dossier d'En Local.
#[tauri::command]
async fn choisir_dossier_media(app: AppHandle, sorte: String, defaut: bool) -> Result<Option<String>, String> {
    let owner = main_hwnd(&app)?;
    let s = sorte.clone();
    let chemin = if defaut {
        None
    } else {
        let titre = format!("Choisis le dossier {}", match sorte.as_str() { "musique" => "de ta musique", "videos" => "de tes vidéos", _ => "de tes captures et photos" });
        let Some(c) = tauri::async_runtime::spawn_blocking(move || dossier::selectionner(owner, &titre)).await.ok().flatten() else {
            return Ok(None);
        };
        if !medias::dossier_permis(std::path::Path::new(&c)) {
            return Err("Choisis un dossier précis (pas un disque entier, ton dossier utilisateur ou un dossier de Windows).".into());
        }
        Some(c)
    };
    medias::choisir(&s, chemin.as_deref())?;
    let d = dossier_media(&s);
    for x in medias::deux_chemins(&d) {
        let _ = app.asset_protocol_scope().allow_directory(&x, true);
    }
    Ok(Some(d.to_string_lossy().into_owned()))
}

#[tauri::command]
fn switch_etat() -> switch::Etat {
    switch::etat()
}
/// Pokédex : l'outil pokedex (PKHeX.Core, GPL) lit les sauvegardes Pokémon. Résultat gardé dans data\\pokedex.json.
#[tauri::command]
async fn pokedex(relire: bool) -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    tauri::async_runtime::spawn_blocking(move || {
        let garde = format!("{}\\data\\pokedex.json", root());
        if !relire {
            if let Ok(t) = std::fs::read_to_string(&garde) {
                return Ok(t);
            }
        }
        let dossiers = [
            format!("{}\\data\\ds\\saves", root()),
            format!("{}\\user\\sdmc\\Nintendo 3DS", azahar()),
            format!("{}\\user\\nand\\user\\save", eden()),
            format!("{}\\User\\GC", dolphin()),
        ];
        let sortie = std::process::Command::new(format!("{}\\emu\\pokedex\\pokedex.exe", root()))
            .args(&dossiers)
            .creation_flags(0x0800_0000)
            .output()
            .map_err(|e| format!("Le Pokédex n'a pas pu lire les sauvegardes : {e}"))?;
        let t = String::from_utf8_lossy(&sortie.stdout).into_owned();
        if !t.starts_with('{') {
            return Err("Le Pokédex n'a pas pu lire les sauvegardes.".into());
        }
        let _ = std::fs::write(&garde, &t);
        Ok(t)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 3DS : boot9.bin de la console du joueur, copié dans le sysdata d'Azahar. Jamais fourni.
fn boot9() -> std::path::PathBuf {
    std::path::PathBuf::from(format!("{}\\user\\sysdata\\boot9.bin", azahar()))
}
#[tauri::command]
fn trois_ds_etat() -> bool {
    std::fs::metadata(boot9()).is_ok_and(|m| m.len() == 0x10000)
}
/// Vérifie que le fichier fait exactement 64 Ko et n'est pas vide.
#[tauri::command]
async fn trois_ds_poser(app: AppHandle) -> Result<Option<String>, String> {
    let owner = main_hwnd(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let Some(f) = dossier::selectionner_fichier(owner, "Choisis le boot9.bin de ta 3DS", ("Bootrom de la 3DS (boot9.bin)", "*.bin")) else { return Ok(None) };
        let o = std::fs::read(&f).map_err(|e| e.to_string())?;
        if o.len() != 0x10000 || o.iter().all(|&b| b == 0 || b == 0xFF) {
            return Err("Ce fichier n'est pas un boot9.bin (64 Ko, sorti de ta 3DS avec GodMode9, lecteur [M:] MEMORY VIRTUAL).".into());
        }
        let cible = boot9();
        std::fs::create_dir_all(cible.parent().unwrap()).map_err(|e| e.to_string())?;
        std::fs::write(&cible, o).map_err(|e| e.to_string())?;
        Ok(Some("boot9.bin installé".into()))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Switch : prod.keys ou dossier du firmware, sortis de la console du joueur.
#[tauri::command]
async fn switch_poser(app: AppHandle, quoi: String) -> Result<Option<String>, String> {
    let owner = main_hwnd(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        if quoi == "titres" {
            let Some(f) = dossier::selectionner_fichier(owner, "Choisis le title.keys de ta Switch", ("Clés des jeux (title.keys)", "*.keys")) else { return Ok(None) };
            switch::poser_titres(std::path::Path::new(&f)).map(|n| Some(format!("Clés des jeux installées ({n})")))
        } else if quoi == "cles" {
            let Some(f) = dossier::selectionner_fichier(owner, "Choisis le prod.keys de ta Switch", ("Clés de la console (prod.keys)", "*.keys")) else { return Ok(None) };
            switch::poser_cles(std::path::Path::new(&f)).map(|_| Some("Clés installées".into()))
        } else {
            let Some(d) = dossier::selectionner(owner, "Choisis le dossier du firmware de ta Switch (fichiers .nca)") else { return Ok(None) };
            switch::poser_firmware(std::path::Path::new(&d)).map(|n| Some(format!("Firmware installé ({n} fichiers)")))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn dossier_jeux() -> serde_json::Value {
    let racine = dossier::jeux();
    let compte: serde_json::Map<String, serde_json::Value> = dossier::CONSOLES.iter().map(|(id, nom)| {
        let n = std::fs::read_dir(racine.join(nom)).into_iter().flatten().flatten().filter(|e| e.file_name() != "Lisez-moi.txt" && e.file_name() != dossier::MAJ).count();
        (id.to_string(), n.into())
    }).collect();
    serde_json::json!({ "chemin": racine.to_string_lossy(), "existe": racine.is_dir(), "consoles": compte, "disques": dossier::disques() })
}

#[tauri::command]
fn definir_dossier_jeux(chemin: String) -> Result<String, String> {
    dossier::definir(&chemin).map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
async fn choisir_dossier(app: AppHandle, titre: Option<String>) -> Option<String> {
    let owner = main_hwnd(&app).ok()?;
    let titre = titre.unwrap_or_else(|| "Choisis un dossier".into());
    tauri::async_runtime::spawn_blocking(move || dossier::selectionner(owner, &titre)).await.ok().flatten()
}

#[tauri::command]
fn creer_dossier_jeux(parent: String, nom: String) -> Result<String, String> {
    let nom = nom.trim();
    if nom.is_empty() || nom.len() > 80 || nom.contains(['\\', '/', ':', '*', '?', '"', '<', '>', '|']) || nom.starts_with('.') {
        return Err("Nom de dossier invalide (sans \\ / : * ? \" < > |)".into());
    }
    dossier::definir(&std::path::Path::new(&parent).join(nom).to_string_lossy()).map(|p| p.to_string_lossy().into_owned())
}

fn classer(p: &std::path::Path) -> Option<(&'static str, bool, Option<u64>)> {
    let ext = p.extension()?.to_str()?.to_lowercase();
    let nom = p.file_name()?.to_string_lossy().into_owned();
    let id = nom.split('[').skip(1).filter_map(|x| x.split(']').next()).find(|x| x.len() == 16 && x.bytes().all(|b| b.is_ascii_hexdigit())).and_then(|x| u64::from_str_radix(x, 16).ok());
    match ext.as_str() {
        "nds" => Some(("DS", false, None)),
        "nsp" | "nsz" | "xci" | "xcz" => {
            let id = id_switch(p);
            Some(("Switch", id.is_some_and(contenu_switch), id))
        }
        "3ds" | "cci" | "cxi" | "zcci" | "zcxi" | "3dsx" => Some(("3DS", false, None)),
        "cia" => Some(("3DS", id.is_some_and(|x| matches!(x >> 32, 0x0004_000E | 0x0004_008C)), None)),
        "wua" | "wud" | "wux" | "wuhb" => Some(("WiiU", id.is_some_and(|x| matches!(x >> 32, 0x0005_000E | 0x0005_000C)), None)),
        "iso" | "gcm" | "rvz" | "wia" | "wbfs" | "ciso" | "gcz" | "wad" => embed::dolphin_console(&p.to_string_lossy()).map(|c| (c, false, None)),
        _ => None,
    }
}

/// Ajouter des jeux : fichiers, dossiers ou archives, rangés dans le dossier de leur console.
/// La progression va à l'interface (événement « import »).
#[tauri::command]
async fn importer_jeux(app: AppHandle, chemins: Vec<String>) -> importer::Bilan {
    tauri::async_runtime::spawn_blocking(move || {
        let b = importer::importer(&chemins, &classer, &|t| {
            let _ = app.emit("import", t);
        });
        menage_mac(&dossier::jeux());
        b
    })
    .await
    .unwrap_or_default()
}

/// Fenêtre Windows pour choisir des jeux ou des archives (plusieurs à la fois).
#[tauri::command]
async fn choisir_jeux(app: AppHandle) -> Vec<String> {
    let Ok(owner) = main_hwnd(&app) else { return Vec::new() };
    tauri::async_runtime::spawn_blocking(move || dossier::selectionner_plusieurs(owner, "Ajouter des jeux")).await.unwrap_or_default()
}

/// Range le dossier des jeux. simuler : rend seulement la liste.
#[tauri::command]
async fn ranger_jeux(simuler: bool) -> serde_json::Value {
    tauri::async_runtime::spawn_blocking(move || {
        let racine = dossier::jeux();
        let _ = dossier::organiser(&racine);
        let liste = dossier::a_ranger(&racine, &classer);
        let faits = if simuler { 0 } else { dossier::ranger(&liste) };
        serde_json::json!({ "liste": liste, "faits": faits })
    })
    .await
    .unwrap_or(serde_json::Value::Null)
}

#[derive(Serialize, Default, PartialEq, Debug)]
struct Contenus {
    maj: Option<String>,
    dlc: usize,
}

/// MAJ et DLC d'après les title ID, dans les noms de fichiers et dans Cemu.
/// Switch : MAJ = jeu + 0x800, DLC = jeu + 0x1000 + n. Wii U / 3DS : 0005000E / 0004000E (MAJ), 0005000C / 0004008C (DLC).
fn contenus_de(console: &str, base: &str, noms: &[(String, Option<u32>)]) -> Contenus {
    let Ok(id) = u64::from_str_radix(base, 16) else { return Contenus::default() };
    let est_maj = |x: u64| match console {
        "Switch" => x == id + 0x800,
        _ => x & 0xFFFF_FFFF == id & 0xFFFF_FFFF && matches!(x >> 32, 0x0005_000E | 0x0004_000E),
    };
    let est_dlc = |x: u64| match console {
        "Switch" => x & !0xFFF == (id & !0xFFF) + 0x1000,
        _ => x & 0xFFFF_FFFF == id & 0xFFFF_FFFF && matches!(x >> 32, 0x0005_000C | 0x0004_008C),
    };
    let mut c = Contenus::default();
    let mut vu = std::collections::HashSet::new();
    let mut version: Option<u32> = None;
    for (nom, v) in noms {
        let ids = nom.split('[').skip(1).filter_map(|x| x.split(']').next()).filter(|x| x.len() == 16).filter_map(|x| u64::from_str_radix(x, 16).ok());
        for x in ids {
            if est_dlc(x) && vu.insert(x) {
                c.dlc += 1;
            }
            if est_maj(x) {
                let lue = v.or_else(|| nom.split("[v").nth(1).or_else(|| nom.split("(v").nth(1)).and_then(|r| r.split(|ch: char| !ch.is_ascii_digit()).next()?.parse().ok()));
                version = version.max(lue.or(Some(0)));
            }
        }
    }
    // Version inconnue : « ? ».
    c.maj = version.map(|v| if v == 0 { "?".into() } else if console == "Switch" { (v >> 16).to_string() } else { v.to_string() });
    c
}

fn noms_sous(dir: &std::path::Path, profondeur: u32, out: &mut Vec<(String, Option<u32>)>) {
    for e in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        let nom = e.file_name().to_string_lossy().into_owned();
        let p = e.path();
        if p.is_dir() && profondeur > 0 && !["code", "content", "meta"].contains(&nom.as_str()) {
            noms_sous(&p, profondeur - 1, out);
        }
        out.push((nom, None));
    }
}

/// Contenus de chaque jeu : [[chemin, console, title ID]] -> { chemin: Contenus }.
#[tauri::command]
async fn contenus_jeux(jeux: Vec<(String, String, String)>) -> std::collections::HashMap<String, Contenus> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut noms = Vec::new();
        noms_sous(&dossier::jeux(), 4, &mut noms);
        for f in contenus_switch(&dossier::switch()) {
            let nom = f.file_stem().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
            let a_un_id = nom.split('[').skip(1).filter_map(|x| x.split(']').next()).any(|x| x.len() == 16 && x.bytes().all(|b| b.is_ascii_hexdigit()));
            if !a_un_id {
                if let Some(id) = switch_title_id(&f.to_string_lossy()) {
                    noms.push((format!("{nom} [{id}]"), switch_version(&f.to_string_lossy())));
                }
            }
        }
        // Wii U : contenus installés dans Cemu (mlc01\usr\title), ceux du dossier des jeux compris.
        embed::lier_contenus_wiiu(&cemu());
        for haut in ["0005000e", "0005000c"] {
            for e in std::fs::read_dir(format!("{CEMU}\\portable\\mlc01\\usr\\title\\{haut}", CEMU = cemu())).into_iter().flatten().flatten() {
                let bas = e.file_name().to_string_lossy().into_owned();
                let meta = std::fs::read_to_string(e.path().join("meta").join("meta.xml")).unwrap_or_default();
                let v = meta.split("<title_version").nth(1).and_then(|r| r.split('>').nth(1)?.split('<').next()?.trim().parse().ok());
                noms.push((format!("[{}{}]", haut.to_uppercase(), bas.to_uppercase()), v));
            }
        }
        jeux.into_iter().filter(|(_, _, id)| id.len() == 16).map(|(path, console, id)| {
            let c = contenus_de(&console, &id, &noms);
            (path, c)
        }).collect()
    })
    .await
    .unwrap_or_default()
}

/// Identifiant Wii U (« ALZP01 ») depuis meta.xml, pour les jaquettes.
fn wiiu_id(rpx: &str) -> Option<String> {
    let meta = std::fs::read_to_string(std::path::Path::new(rpx).parent()?.parent()?.join("meta").join("meta.xml")).ok()?;
    let tag = |name: &str| -> Option<String> {
        let open = meta.find(&format!("<{name} "))?;
        let from = open + meta[open..].find('>')? + 1;
        let to = from + meta[from..].find('<')?;
        Some(meta[from..to].trim().to_string())
    };
    let product = tag("product_code")?;
    let company = tag("company_code")?;
    let id = format!("{}{}", product.rsplit('-').next()?, &company[company.len().checked_sub(2)?..]);
    (id.len() == 6 && id.bytes().all(|b| b.is_ascii_alphanumeric())).then_some(id)
}

/// Code ami d'un jeu DS, lu dans le bloc DWCUserData de la sauvegarde.
/// Code = identifiant + CRC-8 de [identifiant, code de jeu] sur 7 bits.
fn dwc_friend_code(save: &[u8]) -> Option<u64> {
    fn crc32(data: &[u8]) -> u32 {
        let mut crc = !0u32;
        for &b in data {
            crc ^= b as u32;
            for _ in 0..8 {
                crc = if crc & 1 != 0 { (crc >> 1) ^ 0xEDB8_8320 } else { crc >> 1 };
            }
        }
        !crc
    }
    fn crc8(data: &[u8]) -> u8 {
        let mut crc = 0u8;
        for &b in data {
            crc ^= b;
            for _ in 0..8 {
                crc = if crc & 0x80 != 0 { (crc << 1) ^ 7 } else { crc << 1 };
            }
        }
        crc
    }
    let u32_at = |o: usize| u32::from_le_bytes(save[o..o + 4].try_into().unwrap());
    (0..save.len().saturating_sub(0x40)).step_by(4).find_map(|o| {
        if u32_at(o) != 0x40 || u32_at(o + 0x3C) != crc32(&save[o..o + 0x3C]) {
            return None;
        }
        let pid = u32_at(o + 0x1C);
        if pid == 0 || pid > i32::MAX as u32 {
            return None;
        }
        let mut key = [0u8; 8];
        key[..4].copy_from_slice(&pid.to_le_bytes());
        key[4..].copy_from_slice(&save[o + 0x24..o + 0x28]);
        Some(((crc8(&key) as u64 & 0x7F) << 32) | pid as u64)
    })
}

#[tauri::command]
fn ds_friend_code(path: String) -> Option<String> {
    let stem = std::path::Path::new(&path).file_stem()?.to_string_lossy().into_owned();
    let save = std::fs::read(format!("{ROOT}\\data\\ds\\saves\\melonDS DS\\{stem}.sav", ROOT = root())).ok()?;
    let fc = format!("{:012}", dwc_friend_code(&save)?);
    Some(format!("{}-{}-{}", &fc[..4], &fc[4..8], &fc[8..]))
}

/// Code produit d'un jeu DS (en-tête 0x0C).
fn ds_game_code(path: &str) -> Option<String> {
    let mut hdr = [0u8; 0x10];
    std::fs::File::open(path).ok()?.read_exact(&mut hdr).ok()?;
    let code = std::str::from_utf8(&hdr[0x0C..0x10]).ok()?;
    code.bytes().all(|b| b.is_ascii_alphanumeric()).then(|| code.to_string())
}

fn main_hwnd(app: &AppHandle) -> Result<isize, String> {
    let w = app.get_webview_window("main").ok_or("fenêtre introuvable")?;
    Ok(w.hwnd().map_err(|e| e.to_string())?.0 as isize)
}

/// Lancé hors du thread de l'interface pour qu'elle reste fluide.
#[tauri::command]
/// update : mise à jour Switch choisie ("" pour aucune). opts : réglages de la console et du jeu.
async fn play(app: AppHandle, path: String, console: String, room: Option<embed::Room>, update: Option<String>, opts: Option<reglages::Opts>, frames: Channel<InvokeResponseBody>) -> Result<String, String> {
    let o = opts.unwrap_or_default();
    let clips = o.get("clips").and_then(|v| v.parse::<u64>().ok()).filter(|n| *n > 0);
    let qualite = o.get("clips_qualite").cloned().unwrap_or_default();
    let parent = main_hwnd(&app).ok();
    let r = tauri::async_runtime::spawn_blocking(move || start_game(app, path, console, room, update, o, frames)).await.map_err(|e| e.to_string())?;
    if let (Ok(_), Some(secs), Some(parent)) = (&r, clips, parent) {
        std::thread::spawn(move || clips::demarrer(parent, secs, qualite));
    }
    r
}

fn start_game(app: AppHandle, path: String, console: String, room: Option<embed::Room>, update: Option<String>, o: reglages::Opts, frames: Channel<InvokeResponseBody>) -> Result<String, String> {
    jeu_permis(&path)?;
    embed::format(&o);
    MENU.store(false, Ordering::Relaxed);
    // Pseudo du joueur dans les émulateurs.
    let pseudo = o.get("pseudo").and_then(|p| pseudo::propre(p));
    libretro::pseudo(pseudo.clone());
    if let Some(p) = &pseudo {
        match console.as_str() {
            "Switch" => pseudo::eden(&format!("{}\\user", eden()), p),
            "3DS" => pseudo::azahar(&format!("{}\\user", azahar()), p),
            _ => {}
        }
    }
    if console == "DS" {
        libretro::start(melonds(), path, format!("{ROOT}\\data\\ds", ROOT = root()), frames, reglages::melonds(&o), reglages::volume(&o), reglages::touches_ds(&o))?;
        Ok("DS lancé (méthode A)".into())
    } else if console == "WiiU" {
        let log = embed::start_cemu(&cemu(), &path, main_hwnd(&app)?, &o)?;
        Ok(format!("Wii U lancé (Cemu) — {log}"))
    } else if console == "Switch" {
        // Mise à jour choisie : les autres de ce jeu sont écartées.
        let tid = switch_title_id(&path);
        let maj = tid.as_deref().and_then(|x| u64::from_str_radix(x, 16).ok()).map(|x| (x & !0xFFF) + 0x800);
        let choisie = update.is_some();
        let contenu: Vec<std::path::PathBuf> = contenus_switch_ids(&dossier::switch()).into_iter()
            .filter(|(p, id)| update.as_ref().is_none_or(|choix| Some(*id) != maj || p.to_string_lossy() == *choix))
            .map(|(p, _)| p).collect();
        let log = embed::start_eden(&eden(), &path, main_hwnd(&app)?, room.as_ref(), contenu, choisie, &o, tid.as_deref())?;
        Ok(format!("Switch lancée (Eden) — {log}"))
    } else if console == "GC" || console == "Wii" {
        let log = embed::start_dolphin(&dolphin(), &path, main_hwnd(&app)?, &o)?;
        Ok(format!("{console} lancé (Dolphin) — {log}"))
    } else {
        // Jeu chiffré : Azahar le lit avec le boot9.bin.
        if chiffre_3ds(&path) && !trois_ds_etat() {
            return Err("Ce jeu 3DS est chiffré : il faut le boot9.bin de ta 3DS pour le lire.".into());
        }
        let hwnd = main_hwnd(&app)?;
        let log = embed::start(&format!("{AZAHAR}\\azahar.exe", AZAHAR = azahar()), &azahar(), &path, hwnd, room.as_ref(), &o)?;
        Ok(format!("3DS lancé (méthode B) — fenêtres : {log}"))
    }
}

/// Seuls les jeux du dossier des jeux se lancent.
fn jeu_permis(path: &str) -> Result<(), String> {
    let vrai = |p: &std::path::Path| std::fs::canonicalize(p).ok();
    match (vrai(std::path::Path::new(path)), vrai(&dossier::jeux())) {
        (Some(j), Some(d)) if j.starts_with(&d) => Ok(()),
        _ => Err("Ce jeu n'est pas dans ton dossier des jeux.".into()),
    }
}

#[tauri::command]
fn habillage_ds(app: AppHandle, format: f64, visible: bool) {
    if let Ok(h) = main_hwnd(&app) {
        embed::habillage_ds(h, format, visible);
    }
}

/// Journal des erreurs de l'interface, gardé petit.
#[tauri::command]
fn journal(texte: String) {
    let f = format!("{ROOT}\\data\\ui.log", ROOT = root());
    let ancien = std::fs::read_to_string(&f).unwrap_or_default();
    // Coupé sur une limite de caractère (un accent coupé en deux ferait planter).
    let debut = if ancien.len() > 50_000 { (ancien.len() - 25_000..ancien.len()).find(|&i| ancien.is_char_boundary(i)).unwrap_or(0) } else { 0 };
    let garde = &ancien[debut..];
    let ligne: String = texte.chars().filter(|c| !c.is_control()).take(600).collect();
    let _ = std::fs::write(&f, format!("{garde}{ligne}\n"));
}
pub fn journal_rust(texte: &str) {
    journal(texte.to_string());
}

/// Reset rapide : la DS redémarre sur place. Les autres consoles sont relancées par l'interface.
#[tauri::command]
fn reset_jeu() -> bool {
    if libretro::is_running() {
        libretro::RESET.store(true, Ordering::Relaxed);
        libretro::PAUSED.store(false, Ordering::Relaxed);
        return true;
    }
    false
}

#[tauri::command]
fn salon_en_jeu(room: embed::Room) -> Result<(), String> {
    embed::salon_en_jeu(&room)
}

#[tauri::command]
async fn sprite(n: u16, chroma: bool, badge: Option<bool>) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || maison::sprite(n, chroma, badge.unwrap_or(false))).await.ok().flatten()
}

/// Jaquette téléchargée une fois. Rend (fichier, rang de l'adresse qui a marché).
#[tauri::command]
async fn jaquette(urls: Vec<String>) -> Option<(String, usize)> {
    tauri::async_runtime::spawn_blocking(move || maison::jaquette(&urls)).await.ok().flatten()
}

#[tauri::command]
fn oublier_jaquettes() {
    let _ = std::fs::remove_dir_all(maison::dossier("jaquettes"));
}

/// Nouvelle version disponible ? Demandée à Loc, réservé aux membres.
#[tauri::command]
async fn verifier_maj(app: AppHandle, jeton: String) -> Result<Option<(String, String)>, String> {
    use tauri_plugin_updater::UpdaterExt;
    if !app.config().plugins.0.contains_key("updater") {
        return Ok(None);
    }
    let maj = app.updater_builder().header("Authorization", format!("Bearer {jeton}")).map_err(|e| e.to_string())?.build().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    Ok(maj.map(|m| (m.version, m.body.unwrap_or_default())))
}
/// Télécharge la mise à jour, vérifie sa signature, l'installe et relance.
#[tauri::command]
async fn installer_maj(app: AppHandle, jeton: String) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    if libretro::is_running() || embed::is_running() {
        return Err("Quitte ton jeu avant la mise à jour.".into());
    }
    let updater = app.updater_builder().header("Authorization", format!("Bearer {jeton}")).map_err(|e| e.to_string())?.build().map_err(|e| e.to_string())?;
    // Connexion qui coupe en plein téléchargement : jusqu'à 3 essais. La progression va à l'interface.
    let mut erreur = String::new();
    for essai in 1..=3 {
        let Some(maj) = updater.check().await.map_err(|e| e.to_string())? else { return Ok(()) };
        let recu = std::sync::atomic::AtomicU64::new(0);
        let a = app.clone();
        match maj.download_and_install(move |n, total| {
            let avant = recu.fetch_add(n as u64, Ordering::Relaxed);
            // Un événement par Mo reçu, pas un par morceau.
            if (avant + n as u64) >> 20 != avant >> 20 {
                let _ = a.emit("maj-progres", (avant + n as u64, total.unwrap_or(0), essai));
            }
        }, || {}).await {
            Ok(()) => app.restart(),
            Err(e) => erreur = e.to_string(),
        }
    }
    Err(erreur)
}

#[tauri::command]
async fn volume_jeux(v: f32) -> usize {
    tauri::async_runtime::spawn_blocking(move || son::volume_jeux(v)).await.unwrap_or(0)
}

/// Affichage : plein, sans-bordure ou fenetre.
#[tauri::command]
fn mode_ecran(app: AppHandle, mode: String) -> Result<(), String> {
    let w = app.get_webview_window("main").ok_or("fenêtre introuvable")?;
    let e = |r: tauri::Result<()>| r.map_err(|e| e.to_string());
    match mode.as_str() {
        "plein" => e(w.set_fullscreen(true)),
        "sans-bordure" => {
            e(w.set_fullscreen(false))?;
            e(w.set_decorations(false))?;
            e(w.maximize())
        }
        _ => {
            e(w.set_fullscreen(false))?;
            e(w.set_decorations(true))?;
            e(w.unmaximize())
        }
    }
}

/// Matériel du PC, pour les réglages recommandés.
#[tauri::command]
async fn materiel() -> serde_json::Value {
    tauri::async_runtime::spawn_blocking(|| {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        // Win32_VideoController plafonne à 4 Go : la vraie valeur est dans le registre.
        let script = r#"
$vram = @{}
Get-ChildItem 'HKLM:\SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue | ForEach-Object {
  $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
  if ($p.DriverDesc -and $p.'HardwareInformation.qwMemorySize') { $vram[$p.DriverDesc] = [long]$p.'HardwareInformation.qwMemorySize' }
}
$gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object { @{ nom = $_.Name; vram = [long]$(if ($vram[$_.Name]) { $vram[$_.Name] } else { [uint32]$_.AdapterRAM }) / 1MB; largeur = $_.CurrentHorizontalResolution; hauteur = $_.CurrentVerticalResolution } })
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
@{ gpus = $gpus; cpu = $cpu.Name.Trim(); coeurs = $cpu.NumberOfCores; threads = $cpu.NumberOfLogicalProcessors; ram = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB) } | ConvertTo-Json -Compress -Depth 4
"#;
        std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", script])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()
            .and_then(|o| serde_json::from_slice(&o.stdout).ok())
            .unwrap_or(serde_json::Value::Null)
    })
    .await
    .unwrap_or(serde_json::Value::Null)
}

/// Connexion RetroAchievements. Le mot de passe passe par l'entrée standard, il n'est jamais gardé.
#[tauri::command]
async fn ra_connexion(user: String, password: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let script = "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; \
            $u = [Console]::In.ReadLine(); $p = [Console]::In.ReadLine(); \
            try { $r = Invoke-RestMethod -UseBasicParsing -Method Post 'https://retroachievements.org/dorequest.php' -UserAgent 'EnLocal/0.1' -Body @{ r = 'login2'; u = $u; p = $p }; $r | ConvertTo-Json -Compress } \
            catch { $e = $_.ErrorDetails.Message; if ($e) { $e } else { '{\"Success\":false,\"Error\":\"Connexion impossible\"}' } }";
        let mut child = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", script])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;
        {
            use std::io::Write;
            let mut stdin = child.stdin.take().ok_or("PowerShell")?;
            writeln!(stdin, "{}\n{}", user.replace(['\n', '\r'], ""), password.replace(['\n', '\r'], "")).map_err(|e| e.to_string())?;
        }
        let out = child.wait_with_output().map_err(|e| e.to_string())?;
        let v: serde_json::Value = serde_json::from_slice(&out.stdout).map_err(|_| "Réponse illisible de RetroAchievements".to_string())?;
        if v.get("Success").and_then(|s| s.as_bool()) == Some(true) && v.get("Token").is_some() {
            Ok(v)
        } else {
            Err(v.get("Error").and_then(|e| e.as_str()).unwrap_or("Pseudo ou mot de passe incorrect").to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn cemu_packs(path: String) -> Vec<reglages::Pack> {
    reglages::wiiu_title_id(&path).map(|t| reglages::cemu_packs(&cemu(), &t)).unwrap_or_default()
}

/// Packs graphiques de la communauté Cemu, téléchargés là où Cemu les range.
#[tauri::command]
async fn cemu_packs_maj() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        // Apostrophes doublées : le chemin passe entre guillemets simples dans PowerShell.
        let dest = format!("{CEMU}\\portable\\graphicPacks\\downloadedGraphicPacks", CEMU = cemu()).replace('\'', "''");
        let script = format!(
            "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; \
             $r = Invoke-RestMethod -UseBasicParsing 'https://api.github.com/repos/cemu-project/cemu_graphic_packs/releases/latest'; \
             $a = $r.assets | Where-Object {{ $_.name -like '*.zip' }} | Select-Object -First 1; \
             $z = Join-Path $env:TEMP 'enlocal-graphicpacks.zip'; \
             Invoke-WebRequest -UseBasicParsing $a.browser_download_url -OutFile $z; \
             if (Test-Path '{dest}') {{ Remove-Item -Recurse -Force '{dest}' }}; \
             Expand-Archive $z '{dest}' -Force; Set-Content '{dest}\\version.txt' $r.tag_name; Remove-Item $z"
        );
        let ok = std::process::Command::new("powershell").args(["-NoProfile", "-Command", &script]).creation_flags(CREATE_NO_WINDOW).status().map(|s| s.success()).unwrap_or(false);
        if ok { Ok(()) } else { Err("Téléchargement des packs graphiques impossible".to_string()) }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn dolphin_mods(path: String) -> Vec<reglages::ModDolphin> {
    embed::dolphin_game_id(&path).map(|id| reglages::dolphin_mods(&dolphin(), &id)).unwrap_or_default()
}

#[tauri::command]
fn eden_mods(title_id: String) -> Vec<String> {
    if title_id.len() != 16 || !title_id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Vec::new();
    }
    reglages::eden_mods(&eden(), &title_id)
}

#[tauri::command]
fn open_folder(quoi: String, path: String) {
    let dir = match quoi.as_str() {
        "mods-switch" => switch_title_id(&path).map(|t| format!("{EDEN}\\user\\load\\{t}", EDEN = eden())),
        "textures-dolphin" => embed::dolphin_game_id(&path).map(|id| format!("{DOLPHIN}\\User\\Load\\Textures\\{id}", DOLPHIN = dolphin())),
        "packs-cemu" => Some(format!("{CEMU}\\portable\\graphicPacks", CEMU = cemu())),
        "mods-3ds" => embed::title_id(&path).map(|t| format!("{AZAHAR}\\user\\load\\mods\\{t}", AZAHAR = azahar())),
        _ => None,
    };
    if let Some(dir) = dir {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::process::Command::new("explorer").arg(dir).spawn();
    }
}

/// Netplay GameCube / Wii. L'état arrive à l'interface par l'événement « netplay ».
#[tauri::command]
fn netplay(app: AppHandle, path: String, host_code: String, name: String, opts: Option<reglages::Opts>) -> Result<(), String> {
    MENU.store(false, Ordering::Relaxed);
    let parent = main_hwnd(&app)?;
    jeu_permis(&path)?;
    embed::format(opts.as_ref().unwrap_or(&Default::default()));
    let host_code: String = host_code.chars().filter(|c| c.is_ascii_alphanumeric()).take(8).collect();
    embed::start_netplay(&dolphin(), &path, &host_code, &name, parent, &opts.unwrap_or_default(), move |lobby| {
        let _ = app.emit("netplay", lobby);
    })
}

#[tauri::command]
fn presence(p: presence::Presence) {
    presence::set(p);
}

#[tauri::command]
fn presence_clear() {
    presence::clear();
}

#[tauri::command]
fn netplay_launch() -> Result<(), String> {
    embed::netplay_launch()
}

#[tauri::command]
fn netplay_stop() -> Result<(), String> {
    embed::netplay_stop()
}

#[tauri::command]
fn netplay_message(text: String) -> Result<(), String> {
    embed::netplay_message(&text)
}

#[tauri::command]
fn netplay_cancel() {
    embed::netplay_cancel();
}

#[tauri::command]
async fn menu_shown() {
    if MENU.load(Ordering::Relaxed) {
        embed::show(false);
    }
}

#[tauri::command]
async fn resume() {
    MENU.store(false, Ordering::Relaxed);
    libretro::PAUSED.store(false, Ordering::Relaxed);
    embed::show(true);
}

#[tauri::command]
async fn quit_game() {
    let _ = tauri::async_runtime::spawn_blocking(stop_game).await;
}
fn stop_game() {
    MENU.store(false, Ordering::Relaxed);
    embed::netplay_cancel();
    libretro::stop();
    embed::stop();
    clips::arreter();
    saves::garder();
}

/// Fiches GameTDB : [[console, identifiant]] -> { identifiant: fiche }.
#[tauri::command]
async fn game_infos(wanted: Vec<(String, String)>) -> std::collections::HashMap<String, gametdb::Info> {
    tauri::async_runtime::spawn_blocking(move || gametdb::infos(wanted)).await.unwrap_or_default()
}

/// Temps de jeu dans data\stats.json : l'interface compte, Rust garde.
#[tauri::command]
fn load_stats() -> String {
    std::fs::read_to_string(format!("{ROOT}\\data\\stats.json", ROOT = root())).unwrap_or_default()
}

#[tauri::command]
fn save_stats(json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&json).map_err(|e| e.to_string())?;
    let file = format!("{ROOT}\\data\\stats.json", ROOT = root());
    // Écrit à côté puis renommé : une coupure ne perd rien.
    std::fs::write(format!("{file}.tmp"), &json).and_then(|_| std::fs::rename(format!("{file}.tmp"), &file)).map_err(|e| e.to_string())
}

#[tauri::command]
async fn game_icon(path: String, console: String) -> tauri::ipc::Response {
    tauri::async_runtime::spawn_blocking(move || maison::icone(&path, &console)).await.unwrap_or_else(|_| tauri::ipc::Response::new(Vec::new()))
}

#[tauri::command]
fn save_image(request: tauri::ipc::Request) -> Result<String, String> {
    maison::garder_image(request)
}

#[tauri::command]
fn capture(request: tauri::ipc::Request) -> Result<String, String> {
    maison::capturer(request)
}

/// Bouton de partage : l'image du jeu tout de suite, avant le menu de capture.
#[tauri::command]
/// menu : prendre l'image gardée à l'ouverture du menu.
async fn garder_photo(menu: Option<bool>) {
    if menu == Some(true) {
        return maison::poser_photo(SNAPSHOT.lock().unwrap().clone());
    }
    let _ = tauri::async_runtime::spawn_blocking(maison::garder_photo).await;
}

#[tauri::command]
fn list_captures() -> Vec<maison::Capture> {
    maison::captures()
}

/// Un identifiant Discord n'a que des chiffres.
#[tauri::command]
fn open_discord_user(id: String) -> Result<(), String> {
    if id.is_empty() || id.len() > 20 || !id.bytes().all(|b| b.is_ascii_digit()) {
        return Err("identifiant invalide".into());
    }
    std::process::Command::new("rundll32").args(["url.dll,FileProtocolHandler", &format!("https://discord.com/users/{id}")]).spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn ouvrir_ra(page: String) -> Result<(), String> {
    let chemin = match page.as_str() {
        "inscription" => "register",
        "reglages" => "settings",
        _ => return Err("page inconnue".into()),
    };
    std::process::Command::new("rundll32").args(["url.dll,FileProtocolHandler", &format!("https://retroachievements.org/{chemin}")]).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Page d'En Local sur le site (installer une mise à jour à la main).
#[tauri::command]
fn ouvrir_site() -> Result<(), String> {
    std::process::Command::new("rundll32").args(["url.dll,FileProtocolHandler", "https://loc-lab.fr/en-local/"]).spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn pad_info() -> serde_json::Value {
    serde_json::json!({ "name": pad::NAME.lock().unwrap().clone(), "kind": *pad::KIND.lock().unwrap() })
}

/// quoi = « maj » : le dossier Switch.
#[tauri::command]
fn open_games_folder(quoi: Option<String>) {
    let dir = if quoi.as_deref() == Some("maj") { dossier::switch() } else { dossier::jeux() };
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::process::Command::new("explorer").arg(dir).spawn();
}

#[tauri::command]
fn ouvrir_saves() {
    if let Some(dir) = saves::dossier() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::process::Command::new("explorer").arg(dir).spawn();
    }
}

#[tauri::command]
async fn quit_app(app: AppHandle) {
    let _ = tauri::async_runtime::spawn_blocking(|| (stop_game(), embed::attendre_fermeture())).await;
    app.exit(0);
}

/// Connexion Discord : on écoute sur 127.0.0.1 et Loc nous renvoie sur /callback.
/// L'interface échange ensuite le ticket contre un jeton.
#[tauri::command]
async fn login(app: AppHandle, challenge: String) -> Result<String, String> {
    if challenge.len() != 43 || !challenge.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_') {
        return Err("défi de connexion invalide".into());
    }
    let query = tauri::async_runtime::spawn_blocking(move || wait_callback(&challenge)).await.map_err(|e| e.to_string())??;
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    Ok(query)
}

fn wait_callback(challenge: &str) -> Result<String, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    // Navigateur par défaut (explorer.exe comprend mal les URL avec « & »).
    std::process::Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", &format!("{API}/auth/start?port={port}&challenge={challenge}")])
        .spawn()
        .map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(10 * 60);
    loop {
        let mut conn = match listener.accept() {
            Ok((conn, _)) => conn,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() > deadline {
                    return Err("connexion abandonnée (délai dépassé)".into());
                }
                std::thread::sleep(Duration::from_millis(200));
                continue;
            }
            Err(e) => return Err(e.to_string()),
        };
        let _ = conn.set_nonblocking(false);
        let _ = conn.set_read_timeout(Some(Duration::from_secs(5)));
        let mut buf = [0u8; 4096];
        let n = conn.read(&mut buf).unwrap_or(0);
        let head = String::from_utf8_lossy(&buf[..n]);
        let target = head.split_whitespace().nth(1).unwrap_or("");
        if let Some(query) = target.strip_prefix("/callback?") {
            let page = "<!doctype html><meta charset=utf-8><title>En Local</title><body style=\"margin:0;height:100vh;display:grid;place-items:center;background:#0a0a0c;color:#f2f2f4;font:16px system-ui,sans-serif\"><p>C'est bon : tu peux fermer cet onglet et revenir dans En Local.</p>";
            let _ = write!(conn, "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{page}", page.len());
            return Ok(query.to_string());
        }
        let _ = conn.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    }
}

/// --play <fichier> : lance ce jeu au démarrage (tests).
#[tauri::command]
fn autoplay() -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    args.iter().position(|a| a == "--play").and_then(|i| args.get(i + 1).cloned())
}

#[tauri::command]
fn game_shot() -> tauri::ipc::Response {
    tauri::ipc::Response::new(embed::capture().unwrap_or_default())
}

#[tauri::command]
fn snapshot() -> tauri::ipc::Response {
    tauri::ipc::Response::new(SNAPSHOT.lock().unwrap().clone())
}

#[tauri::command]
fn home(app: AppHandle) {
    toggle_home(&app);
}

#[tauri::command]
fn pointer(x: f64, y: f64, down: bool) {
    libretro::set_pointer(x, y, down);
}

pub fn toggle_home(app: &AppHandle) {
    if !libretro::is_running() && !embed::is_running() {
        return;
    }
    if MENU.load(Ordering::Relaxed) {
        let _ = app.emit("menu", false);
        return;
    }
    MENU.store(true, Ordering::Relaxed);
    libretro::PAUSED.store(true, Ordering::Relaxed);
    // Rien de lisible : on garde l'image précédente.
    if let Some(img) = embed::capture() {
        *SNAPSHOT.lock().unwrap() = img;
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_focus();
    }
    let _ = app.emit("menu", true);
}

/// Bouton Home / PS / Guide : Steam le prend aussi et passe devant. Si En Local était au premier
/// plan, il y revient (plusieurs essais : Steam met un moment à s'ouvrir).
pub fn garder_focus(app: &AppHandle) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Input::KeyboardAndMouse::*;
    use windows::Win32::UI::WindowsAndMessaging::*;
    let Ok(moi) = main_hwnd(app) else { return };
    if unsafe { GetForegroundWindow() }.0 as isize != moi {
        return;
    }
    std::thread::spawn(move || {
        for ms in [120, 250, 400, 700, 1200] {
            std::thread::sleep(std::time::Duration::from_millis(ms));
            unsafe {
                if GetForegroundWindow().0 as isize == moi {
                    continue;
                }
                // Windows n'autorise SetForegroundWindow qu'après une touche : un Alt simulé.
                let alt = |haut: bool| INPUT { r#type: INPUT_KEYBOARD, Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: VK_MENU, dwFlags: if haut { KEYEVENTF_KEYUP } else { KEYBD_EVENT_FLAGS(0) }, ..Default::default() } } };
                SendInput(&[alt(false), alt(true)], std::mem::size_of::<INPUT>() as i32);
                let _ = SetForegroundWindow(HWND(moi as _));
            }
        }
    });
}

/// Code de session dans un lien enlocal://join/KQM-482.
fn link_code(args: &[String]) -> Option<String> {
    let rest = args.iter().find_map(|a| a.strip_prefix("enlocal://join/"))?;
    let code: String = rest.chars().filter(|c| c.is_ascii_alphanumeric()).take(6).collect::<String>().to_uppercase();
    let ok = code.len() == 6 && code[..3].bytes().all(|b| b.is_ascii_alphabetic()) && code[3..].bytes().all(|b| b.is_ascii_digit());
    ok.then(|| format!("{}-{}", &code[..3], &code[3..]))
}

#[tauri::command]
fn lien_initial() -> Option<String> {
    link_code(&std::env::args().collect::<Vec<_>>())
}

/// Déclare enlocal:// pour l'utilisateur courant (sans droits admin).
fn register_protocol() {
    use std::os::windows::process::CommandExt;
    let Ok(exe) = std::env::current_exe() else { return };
    let key = r"HKCU\Software\Classes\enlocal";
    let command = format!("\"{}\" \"%1\"", exe.display());
    for args in [
        vec!["add", key, "/ve", "/d", "URL:En Local", "/f"],
        vec!["add", key, "/v", "URL Protocol", "/d", "", "/f"],
        vec!["add", &format!(r"{key}\shell\open\command"), "/ve", "/d", &command, "/f"],
    ] {
        let _ = std::process::Command::new("reg").args(args).creation_flags(0x0800_0000).status();
    }
}

fn ask_close(app: &AppHandle) {
    if !MENU.load(Ordering::Relaxed) {
        toggle_home(app);
    }
    let _ = app.emit("close-request", ());
}

/// Alt+F4 en jeu : un crochet clavier le capte avant l'émulateur.
fn watch_alt_f4(app: AppHandle) {
    use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows::Win32::UI::Input::KeyboardAndMouse::VK_F4;
    use windows::Win32::UI::WindowsAndMessaging::*;
    static APP: std::sync::OnceLock<AppHandle> = std::sync::OnceLock::new();
    let _ = APP.set(app);
    unsafe extern "system" fn hook(code: i32, w: WPARAM, l: LPARAM) -> LRESULT {
        let key = &*(l.0 as *const KBDLLHOOKSTRUCT);
        if code >= 0 && w.0 as u32 == WM_SYSKEYDOWN && key.vkCode == VK_F4.0 as u32 && (libretro::is_running() || embed::is_running()) {
            if let Some(app) = APP.get() {
                if main_hwnd(app).is_ok_and(|h| GetForegroundWindow().0 as isize == h) {
                    let app = app.clone();
                    // Le crochet doit rendre la main tout de suite.
                    std::thread::spawn(move || ask_close(&app));
                    return LRESULT(1);
                }
            }
        }
        CallNextHookEx(None, code, w, l)
    }
    std::thread::spawn(|| unsafe {
        let _hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook), None, 0);
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {}
    });
}

fn main() {
    tauri::Builder::default()
        // Une seule instance : un lien ouvert est relayé à celle qui tourne.
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
            if let Some(code) = link_code(&args) {
                let _ = app.emit("lien", code);
            }
        }))
        .setup(|app| {
            preparer_emulateurs();
            // Récupère les sauvegardes d'une nouvelle installation, puis met la copie à jour.
            std::thread::spawn(|| (saves::restaurer(), saves::garder()));
            // Mises à jour seulement dans l'app installée (la version de développement n'a pas de clé publique).
            if app.config().plugins.0.contains_key("updater") {
                app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            pad::start(app.handle().clone());
            // L'interface ne lit que les images de l'accueil et les captures.
            for d in maison::dossiers_lisibles().into_iter().chain(medias::lisibles()) {
                let _ = app.asset_protocol_scope().allow_directory(&d, true);
            }
            watch_alt_f4(app.handle().clone());
            // Fenêtre d'habillage transparente, au-dessus du jeu.
            if let Some(main) = app.get_webview_window("main") {
                match tauri::WebviewWindowBuilder::new(app, "habillage", tauri::WebviewUrl::App("habillage.html".into()))
                    .parent(&main)
                    // Mêmes options WebView2 que la fenêtre principale, sinon WebView2 refuse.
                    .map(|b| b.additional_browser_args("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion --autoplay-policy=no-user-gesture-required"))
                    .and_then(|b| b.transparent(true).decorations(false).shadow(false).skip_taskbar(true).focused(false).visible(false).resizable(false).build())
                {
                    Ok(h) => {
                        let _ = h.set_ignore_cursor_events(true);
                        if let Ok(hwnd) = h.hwnd() {
                            embed::habillage(hwnd.0 as isize);
                        }
                        journal_rust("habillage : fenêtre créée");
                    }
                    Err(e) => journal_rust(&format!("habillage : fenêtre impossible ({e})")),
                }
            }
            std::thread::spawn(register_protocol);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Resized(_) | WindowEvent::Moved(_) = event {
                if let Ok(h) = window.hwnd() {
                    embed::fit(h.0 as isize);
                }
            }
            // En jeu, fermer la fenêtre ouvre d'abord le menu avec une question.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if libretro::is_running() || embed::is_running() {
                    api.prevent_close();
                    ask_close(window.app_handle());
                }
            }
            if let WindowEvent::Destroyed = event {
                libretro::stop();
                embed::stop();
            }
        })
        .invoke_handler(tauri::generate_handler![verifier_maj, installer_maj, ouvrir_site, importer_jeux, choisir_jeux, oublier_jaquettes, jaquette, journal, habillage_ds, switch_etat, switch_poser, volume_jeux, list_games, medias_liste, ouvrir_medias, dossiers_medias, choisir_dossier_media, creer_dossier_media, dossier_jeux, definir_dossier_jeux, choisir_dossier, creer_dossier_jeux, ranger_jeux, contenus_jeux, ra_connexion, ouvrir_ra, mode_ecran, materiel, switch_updates, cemu_packs, cemu_packs_maj, dolphin_mods, eden_mods, open_folder, open_games_folder, ouvrir_saves, reset_jeu, salon_en_jeu, pokedex, sprite, perf::performances, trois_ds_etat, trois_ds_poser, clips::clip, clips::miniature, garder_photo, nsz::preparer_switch, salon::salon_preparer, salon::salon_sonde, salon::salon_lancer, salon::salon_fermer, pad_info, open_discord_user, game_icon, save_image, capture, list_captures, load_stats, save_stats, game_infos, play, login, menu_shown, resume, quit_game, quit_app, home, snapshot, game_shot, autoplay, lien_initial, ds_friend_code, netplay, netplay_launch, netplay_stop, netplay_message, netplay_cancel, presence, presence_clear, pointer])
        .run(tauri::generate_context!())
        .expect("En Local n'a pas pu démarrer");
}

#[cfg(test)]
mod tests {
    #[test]
    fn mac_et_chiffre() {
        let d = std::env::temp_dir().join(format!("enlocal-mac-{}", std::process::id()));
        std::fs::create_dir_all(d.join("__MACOSX").join("3DS")).unwrap();
        std::fs::write(d.join("__MACOSX").join("3DS").join("._Jeu.3ds"), [0, 5, 0x16, 7, 0, 2]).unwrap();
        std::fs::write(d.join("._Jeu.3ds"), [0, 5, 0x16, 7, 0, 2]).unwrap();
        std::fs::write(d.join("._Vrai.3ds"), b"pas un AppleDouble").unwrap();
        std::fs::write(d.join(".DS_Store"), b"x").unwrap();
        super::menage_mac(&d);
        assert!(!d.join("__MACOSX").exists() && !d.join("._Jeu.3ds").exists() && !d.join(".DS_Store").exists());
        assert!(d.join("._Vrai.3ds").exists()); // pas un fichier Apple : gardé
        let mut r = vec![0u8; 0x800];
        r[0x100..0x104].copy_from_slice(b"NCSD");
        r[0x120..0x124].copy_from_slice(&2u32.to_le_bytes());
        r[0x500..0x504].copy_from_slice(b"NCCH");
        let f = d.join("jeu.3ds");
        std::fs::write(&f, &r).unwrap();
        assert!(super::chiffre_3ds(f.to_str().unwrap()));
        r[0x400 + 0x18F] = 0x04;
        std::fs::write(&f, &r).unwrap();
        assert!(!super::chiffre_3ds(f.to_str().unwrap()));
        let _ = std::fs::remove_dir_all(d);
    }

    use super::{contenus_de, game_files, link_code, majs_de, switch_title_id, Contenus};
    #[test]
    fn liens() {
        let a = |s: &str| vec!["en-local.exe".to_string(), s.to_string()];
        assert_eq!(link_code(&a("enlocal://join/KQM-482/")), Some("KQM-482".into()));
        assert_eq!(link_code(&a("enlocal://join/kqm482")), Some("KQM-482".into()));
        assert_eq!(link_code(&a("enlocal://join/<script>")), None);
        assert_eq!(link_code(&a("--play")), None);
    }

    #[test]
    fn jeux_en_sous_dossiers() {
        let root = std::env::temp_dir().join("enlocal-jeux");
        let _ = std::fs::remove_dir_all(&root);
        for f in ["DS/Platine.nds", "Wii U/Zelda/code/U-King.rpx", "Wii U/Zelda/content/a.nds"] {
            std::fs::create_dir_all(root.join(f).parent().unwrap()).unwrap();
            std::fs::write(root.join(f), b"").unwrap();
        }
        let mut files = Vec::new();
        game_files(&root, &mut files);
        files.sort();
        assert_eq!(files, [root.join("DS/Platine.nds"), root.join("Wii U/Zelda/code/U-King.rpx")]);
    }

    fn pfs0(files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut names = Vec::new();
        let mut entries = Vec::new();
        let mut data: Vec<u8> = Vec::new();
        for (n, d) in files {
            entries.extend((data.len() as u64).to_le_bytes());
            entries.extend((d.len() as u64).to_le_bytes());
            entries.extend((names.len() as u32).to_le_bytes());
            entries.extend(0u32.to_le_bytes());
            names.extend(n.bytes().chain([0]));
            data.extend(*d);
        }
        let mut out = b"PFS0".to_vec();
        out.extend((files.len() as u32).to_le_bytes());
        out.extend((names.len() as u32).to_le_bytes());
        out.extend(0u32.to_le_bytes());
        out.extend(entries);
        out.extend(names);
        out.extend(data);
        out
    }

    #[test]
    fn title_id_switch() {
        let dir = std::env::temp_dir();
        let tik = dir.join("enlocal-tik.nsp");
        std::fs::write(&tik, pfs0(&[("a.nca", b"x"), ("01006a800016e0000000000000000005.tik", b"t")])).unwrap();
        assert_eq!(switch_title_id(tik.to_str().unwrap()), Some("01006A800016E000".into()));
        let xml = dir.join("enlocal-xml.nsp");
        std::fs::write(&xml, pfs0(&[("b.nca", b"y"), ("c.cnmt.xml", b"<ContentMeta><Type>Application</Type><Id>0x0100152000022000</Id>")])).unwrap();
        assert_eq!(switch_title_id(xml.to_str().unwrap()), Some("0100152000022000".into()));
        std::fs::write(&xml, b"pas un nsp").unwrap();
        assert_eq!(switch_title_id(xml.to_str().unwrap()), None);
    }

    #[test]
    fn mises_a_jour_switch() {
        let dir = std::env::temp_dir().join("enlocal-majs");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("Smash")).unwrap();
        for nom in ["Smash [01006A800016E800][v851968].nsp", "Smash/Smash 1.0.1 [01006a800016e800][v65536].nsz", "Costume [01006A800016F016][v0].nsp", "Autre [0100152000022800][v65536].nsp", "notes.txt"] {
            std::fs::write(dir.join(nom), b"x").unwrap();
        }
        std::fs::write(dir.join("Smash [MAJ].nsp"), pfs0(&[("a.nca", b"x"), ("01006a800016e8000000000000000005.tik", b"t")])).unwrap();
        let m = majs_de(&dir, "01006A800016E000");
        let noms: Vec<(&str, Option<u32>)> = m.iter().map(|x| (x.nom.as_str(), x.version)).collect();
        assert_eq!(noms, [("Smash 1.0.1 [01006a800016e800][v65536]", Some(65536)), ("Smash [01006A800016E800][v851968]", Some(851968)), ("Smash [MAJ]", None)]);
        assert!(majs_de(&dir, "court").is_empty());
        let f = dir.join("Smash.nsp");
        std::fs::write(&f, pfs0(&[("a.nca", b"x"), ("b.cnmt.xml", b"<ContentMeta><Type>Patch</Type><Id>0x01006a800016e800</Id><Version>851968</Version><RequiredSystemVersion>1</RequiredSystemVersion>")])).unwrap();
        let f = f.to_str().unwrap();
        assert_eq!((switch_title_id(f).as_deref(), super::switch_version(f)), (Some("01006A800016E800"), Some(851968)));
    }

    #[test]
    #[ignore]
    fn vrais_contenus() {
        let jeux: Vec<(String, String, String)> = super::list_games().into_iter().filter_map(|g| Some((g.path, g.console.to_string(), g.title_id?))).collect();
        let r = tauri::async_runtime::block_on(super::contenus_jeux(jeux));
        for (p, c) in &r {
            println!("{p} : {c:?}");
        }
    }

    #[test]
    #[ignore]
    fn codes_pokemon() {
        for g in super::list_games().into_iter().filter(|g| g.name.to_lowercase().contains("pok")) {
            println!("{} | {} | {:?} | {:?}", g.console, g.name, g.title_id, g.product_code);
        }
    }

    #[test]
    #[ignore]
    fn rangement_simule() {
        for r in super::dossier::a_ranger(&super::dossier::jeux(), &super::classer) {
            println!("{} -> {}", r.de, r.vers);
        }
    }

    #[test]
    fn contenus_des_jeux() {
        let n = |l: &[&str]| l.iter().map(|x| (x.to_string(), None)).collect::<Vec<_>>();
        let noms = n(&["Smash [01006A800016E800][v851968].nsp", "Costume [01006A800016F016][v0].nsp", "Pack [01006A800016F001][v65536].nsp", "Pack [01006A800016F001][v0].nsp", "Autre [0100152000022800][v65536].nsp",
            "The Legend of Zelda Breath of the Wild [0005000E101C9500] (v208)", "The Legend of Zelda Breath of the Wild [0005000C101C9500]"]);
        assert_eq!(contenus_de("Switch", "01006A800016E000", &noms), Contenus { maj: Some("13".into()), dlc: 2 });
        assert_eq!(contenus_de("WiiU", "00050000101C9500", &noms), Contenus { maj: Some("208".into()), dlc: 1 });
        assert_eq!(contenus_de("3DS", "0004000000055D00", &noms), Contenus::default());
        assert_eq!(contenus_de("WiiU", "00050000101C9500", &[("[0005000E101C9500]".into(), Some(240))]).maj, Some("240".into()));
    }

    #[test]
    fn identifiant_wii_u() {
        let dir = std::env::temp_dir().join("enlocal-wiiu");
        std::fs::create_dir_all(dir.join("meta")).unwrap();
        std::fs::create_dir_all(dir.join("code")).unwrap();
        std::fs::write(dir.join("meta/meta.xml"), "<menu>\n  <product_code type=\"string\" length=\"32\">WUP-P-ALZP</product_code>\n  <company_code type=\"string\" length=\"8\">0001</company_code>\n</menu>").unwrap();
        assert_eq!(super::wiiu_id(dir.join("code/U-King.rpx").to_str().unwrap()), Some("ALZP01".into()));
    }

    #[test]
    fn code_ami() {
        let mut save = vec![0u8; 0x200];
        let o = 0x80;
        save[o..o + 4].copy_from_slice(&0x40u32.to_le_bytes());
        save[o + 0x1C..o + 0x20].copy_from_slice(&123_456_789u32.to_le_bytes());
        save[o + 0x24..o + 0x28].copy_from_slice(b"EKPI");
        let mut crc = !0u32;
        for &b in &save[o..o + 0x3C] {
            crc ^= b as u32;
            for _ in 0..8 {
                crc = if crc & 1 != 0 { (crc >> 1) ^ 0xEDB8_8320 } else { crc >> 1 };
            }
        }
        save[o + 0x3C..o + 0x40].copy_from_slice(&(!crc).to_le_bytes());
        let fc = super::dwc_friend_code(&save).unwrap();
        assert_eq!(fc & 0xFFFF_FFFF, 123_456_789);
        assert!(fc >> 32 <= 0x7F);
        save[o + 0x30] ^= 1;
        assert_eq!(super::dwc_friend_code(&save), None);
    }
}
