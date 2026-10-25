//! Copie des sauvegardes dans Saved Games\En Local, pour qu'elles survivent à une désinstallation.
//! Copiées à chaque fin de partie et au démarrage.
use std::path::{Path, PathBuf};

/// Dossiers à copier : (dans l'app, dans la copie). Les jeux installés (« content ») ne sont pas copiés.
fn dossiers() -> Vec<(String, &'static str)> {
    let r = crate::root();
    vec![
        (chemin!("{r}\\data\\ds\\saves"), "DS"),
        (chemin!("{r}\\emu\\azahar-enlocal\\user\\sdmc\\Nintendo 3DS"), "3DS\\sdmc"),
        (chemin!("{r}\\emu\\azahar-enlocal\\user\\nand\\data"), "3DS\\nand"),
        (chemin!("{r}\\emu\\dolphin-enlocal\\User\\GC"), "GameCube"),
        (chemin!("{r}\\emu\\dolphin-enlocal\\User\\Wii\\title"), "Wii"),
        (chemin!("{r}\\emu\\cemu\\portable\\mlc01\\usr\\save"), "Wii U"),
        (chemin!("{r}\\emu\\eden-enlocal\\user\\nand\\user\\save"), "Switch\\user"),
        (chemin!("{r}\\emu\\eden-enlocal\\user\\nand\\system\\save"), "Switch\\system"),
    ]
}

pub fn dossier() -> Option<PathBuf> {
    let u = std::env::var("USERPROFILE").ok().filter(|u| !u.is_empty())?;
    Some(PathBuf::from(u).join("Saved Games").join("En Local"))
}

/// Copie les fichiers absents, et ceux qui ont changé si remplacer est vrai.
fn copier(de: &Path, vers: &Path, remplacer: bool) {
    let Ok(liste) = std::fs::read_dir(de) else { return };
    for e in liste.flatten() {
        let (src, dst) = (e.path(), vers.join(e.file_name()));
        let Ok(t) = e.file_type() else { continue };
        if t.is_dir() {
            if e.file_name() != "content" {
                copier(&src, &dst, remplacer);
            }
        } else if t.is_file() {
            let changer = match (e.metadata(), std::fs::metadata(&dst)) {
                (_, Err(_)) => true,
                (Ok(a), Ok(b)) => remplacer && (a.len() != b.len() || a.modified().ok() != b.modified().ok()),
                _ => false,
            };
            if changer {
                let _ = std::fs::create_dir_all(vers);
                let _ = std::fs::copy(&src, &dst);
            }
        }
    }
}

pub fn garder() {
    let Some(base) = dossier() else { return };
    for (d, n) in dossiers() {
        copier(Path::new(&d), &base.join(n), true);
    }
}

/// Restaure seulement les émulateurs sans sauvegarde : une sauvegarde effacée exprès ne revient pas.
pub fn restaurer() {
    let Some(base) = dossier() else { return };
    for (d, n) in dossiers() {
        let vide = std::fs::read_dir(&d).map(|mut l| l.next().is_none()).unwrap_or(true);
        if vide {
            copier(&base.join(n), Path::new(&d), false);
        }
    }
}

/* ---------- Synchronisation entre les appareils du joueur (gardée par Loc) ---------- */
//
// Les sauvegardes sont découpées en jeux : clé « zone/chemin » (ex. switch/0000000000000000/@moi/01006A800016E000),
// et pour chaque jeu ses fichiers (chemin dans la zone -> empreinte SHA-256, taille). L'app (synchro-saves.js)
// compare avec Loc et la dernière version synchronisée ici (base), puis envoie ou reçoit des jeux entiers :
// un jeu n'est jamais un mélange de deux appareils. Une sauvegarde remplacée est d'abord copiée dans
// data/sauvegardes-remplacees.

use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

/// Dossier de sauvegardes d'un émulateur, et profondeur d'un jeu dans ce dossier.
struct Zone {
    nom: &'static str,
    dossier: PathBuf,
    profondeur: usize,
}

fn zones() -> Vec<Zone> {
    let z = |nom, dossier: String, profondeur| Zone { nom, dossier: PathBuf::from(dossier), profondeur };
    let rpcs3 = if cfg!(windows) { chemin!("{}\\dev_hdd0", crate::rpcs3()) } else { chemin!("{}\\portable\\dev_hdd0", crate::rpcs3()) };
    vec![
        z("ds", chemin!("{}\\data\\ds\\saves", crate::root()), 2),
        z("3ds", chemin!("{}\\user\\sdmc\\Nintendo 3DS", crate::azahar()), 5),
        z("gc", chemin!("{}\\User\\GC", crate::dolphin()), 3),
        z("wii", chemin!("{}\\User\\Wii\\title", crate::dolphin()), 2),
        z("wiiu", chemin!("{}\\portable\\mlc01\\usr\\save", crate::cemu()), 2),
        z("switch", chemin!("{}\\user\\nand\\user\\save", crate::eden()), 3),
        z("retro", chemin!("{}\\saves", crate::retroarch()), 2),
        z("ps3", chemin!("{rpcs3}\\home\\00000001\\savedata"), 1),
    ]
}

/// Le profil d'Eden (profiles.dat), sous les deux noms de dossier qu'Eden utilise pour lui.
pub fn profil_eden() -> Option<(String, String)> {
    let d = std::fs::read(chemin!("{}\\user\\nand\\system\\save\\8000000000000010\\su\\avators\\profiles.dat", crate::eden())).ok()?;
    let u = d.get(0x10..0x20)?;
    let (lo, hi) = (u64::from_le_bytes(u[..8].try_into().ok()?), u64::from_le_bytes(u[8..].try_into().ok()?));
    if lo == 0 && hi == 0 {
        return None;
    }
    let plein = format!("{hi:016X}{lo:016X}");
    let bis = format!("{}{}", &plein[14..], "0".repeat(14));
    Some((plein, bis))
}

/// Chemin dans la zone, tel qu'envoyé à Loc (« / », profil Eden remplacé par @moi), ou None s'il ne se synchronise pas.
fn vers_loc(zone: &str, morceaux: &[String], profil: Option<&(String, String)>) -> Option<Vec<String>> {
    let nom = morceaux.last()?;
    // Sans tenir compte des majuscules : Windows et macOS ne les distinguent pas.
    if nom.starts_with("._") || nom.eq_ignore_ascii_case(".DS_Store") || nom.to_ascii_lowercase().ends_with(".tmp") || morceaux.iter().any(|m| m.eq_ignore_ascii_case("content")) {
        return None;
    }
    let mut m = morceaux.to_vec();
    match zone {
        "wii" if m[0] == "00000001" => return None,
        "wiiu" if m[0].eq_ignore_ascii_case("system") => return None,
        "switch" => {
            if m[0] != "0000000000000000" || m.len() < 3 {
                return None;
            }
            if m[1].bytes().any(|b| b != b'0') {
                let (plein, bis) = profil?;
                m[1] = if m[1].eq_ignore_ascii_case(plein) { "@moi".into() } else if m[1].eq_ignore_ascii_case(bis) { "@moi-bis".into() } else { return None };
            }
        }
        _ => {}
    }
    Some(m)
}

/// Morceau de chemin sûr sur Windows comme sur macOS : Windows retire les « . » et espaces de fin
/// (« .. » caché en « .. ») et réserve des noms d'appareils (CON, NUL, COM1…).
fn morceau_sur(x: &str) -> bool {
    let base = x.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserve = ["CON", "PRN", "AUX", "NUL"].contains(&base.as_str()) || (base.len() == 4 && (base.starts_with("COM") || base.starts_with("LPT")) && base.as_bytes()[3].is_ascii_digit());
    !x.is_empty() && !x.ends_with(['.', ' ']) && !reserve && !x.contains(['\\', ':', '/', '*', '?', '"', '<', '>', '|']) && !x.chars().any(char::is_control)
}

/// Chemin sur ce disque d'un fichier reçu de Loc (zone et chemin vérifiés).
fn vers_disque(zone: &str, rel: &str) -> Result<PathBuf, String> {
    let z = zones().into_iter().find(|z| z.nom == zone).ok_or("zone inconnue")?;
    let mut m: Vec<String> = rel.split('/').map(String::from).collect();
    if rel.len() > 300 || !m.iter().all(|x| morceau_sur(x)) {
        return Err("chemin refusé".into());
    }
    if zone == "switch" && m.len() > 1 && m[1].starts_with('@') {
        let (plein, bis) = profil_eden().ok_or("Lance un jeu Switch une fois sur cet appareil (profil Eden manquant)")?;
        m[1] = match m[1].as_str() {
            "@moi" => plein,
            "@moi-bis" => bis,
            _ => return Err("chemin refusé".into()),
        };
    }
    if vers_loc(zone, &m, profil_eden().as_ref()).is_none() {
        return Err("chemin refusé".into());
    }
    Ok(m.iter().fold(z.dossier, |p, x| p.join(x)))
}

/// Un fichier de sauvegarde : (chemin dans la zone pour Loc, chemin sur le disque).
fn parcourir(d: &Path, morceaux: &mut Vec<String>, out: &mut Vec<(Vec<String>, PathBuf)>) {
    for e in std::fs::read_dir(d).into_iter().flatten().flatten() {
        let Ok(t) = e.file_type() else { continue };
        morceaux.push(e.file_name().to_string_lossy().into_owned());
        if t.is_dir() && morceaux.len() < 12 {
            parcourir(&e.path(), morceaux, out);
        } else if t.is_file() {
            out.push((morceaux.clone(), e.path()));
        }
        morceaux.pop();
    }
}

fn fichier_data(nom: &str) -> String {
    chemin!("{}\\data\\{nom}", crate::root())
}
fn lire_json<T: serde::de::DeserializeOwned + Default>(nom: &str) -> T {
    std::fs::read_to_string(fichier_data(nom)).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}
fn garder_json<T: serde::Serialize>(nom: &str, v: &T) {
    if let Ok(t) = serde_json::to_vec(v) {
        let _ = crate::ecrire_sur(&fichier_data(nom), &t);
    }
}

/// Empreinte d'un fichier, et s'il n'a que des zéros.
fn empreinte_fichier(p: &Path) -> Option<(String, bool)> {
    let contenu = std::fs::read(p).ok()?;
    Some((format!("{:x}", Sha256::digest(&contenu)), abime(&contenu)))
}
fn abime(contenu: &[u8]) -> bool {
    !contenu.is_empty() && contenu.iter().all(|&b| b == 0)
}
/// Empreinte d'un jeu : ses fichiers triés, « chemin\0empreinte\n » (même calcul que Loc).
pub fn empreinte_jeu(f: &BTreeMap<String, (String, u64)>) -> String {
    let mut h = Sha256::new();
    for (c, (e, _)) in f {
        h.update(format!("{c}\0{e}\n"));
    }
    format!("{:x}", h.finalize())
}

/// Un jeu sur ce disque : ses fichiers (chemin pour Loc -> empreinte, taille), où ils sont, et sa dernière modification.
#[derive(Default)]
struct Jeu {
    f: BTreeMap<String, (String, u64)>,
    disque: BTreeMap<String, PathBuf>,
    mtime: u64,
}
const MAX_FICHIER: u64 = 128 * 1024 * 1024;

/// Tous les jeux sauvegardés sur ce disque. Les empreintes déjà calculées (même taille, même date) sont reprises.
fn jeux_locaux() -> BTreeMap<String, Jeu> {
    let mut cache: std::collections::HashMap<String, (u64, u64, String, bool)> = lire_json("saves-empreintes-2.json");
    let mut nouveau = std::collections::HashMap::new();
    let profil = profil_eden();
    let mut jeux: BTreeMap<String, Jeu> = BTreeMap::new();
    // Par jeu : son plus gros fichier (taille, que des zéros ?). Ce fichier vidé, c'est une sauvegarde
    // abîmée par une coupure de courant (un petit fichier de zéros peut être normal : Smash en a).
    let mut plus_gros: std::collections::HashMap<String, (u64, bool)> = std::collections::HashMap::new();
    for z in zones() {
        let mut fichiers = Vec::new();
        parcourir(&z.dossier, &mut Vec::new(), &mut fichiers);
        for (morceaux, disque) in fichiers {
            let Some(m) = vers_loc(z.nom, &morceaux, profil.as_ref()) else { continue };
            let Ok(meta) = std::fs::metadata(&disque) else { continue };
            if meta.len() > MAX_FICHIER {
                continue;
            }
            let mtime = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_millis() as u64);
            let cle_cache = disque.to_string_lossy().into_owned();
            let (h, zeros) = match cache.remove(&cle_cache) {
                Some((n, t, h, z)) if n == meta.len() && t == mtime => (h, z),
                _ => match empreinte_fichier(&disque) {
                    Some(x) => x,
                    None => continue,
                },
            };
            nouveau.insert(cle_cache, (meta.len(), mtime, h.clone(), zeros));
            // Le jeu : les premiers dossiers ; un fichier moins profond est un jeu à lui seul.
            let unite = m[..z.profondeur.min(m.len())].join("/");
            let gros = plus_gros.entry(format!("{}/{unite}", z.nom)).or_insert((0, false));
            if meta.len() > gros.0 {
                *gros = (meta.len(), zeros);
            }
            let rel = m.join("/");
            let jeu = jeux.entry(format!("{}/{unite}", z.nom)).or_default();
            jeu.f.insert(rel.clone(), (h, meta.len()));
            jeu.disque.insert(rel, disque);
            jeu.mtime = jeu.mtime.max(mtime);
        }
    }
    garder_json("saves-empreintes-2.json", &nouveau);
    // Sauvegarde abîmée : le jeu ne part pas (il écraserait la bonne version des autres appareils).
    jeux.retain(|cle, _| !plus_gros.get(cle).is_some_and(|g| g.1));
    jeux
}

/// Les sauvegardes de cet appareil et la dernière version synchronisée de chaque jeu.
pub fn local() -> serde_json::Value {
    let jeux: serde_json::Map<String, serde_json::Value> = jeux_locaux()
        .into_iter()
        .map(|(cle, j)| (cle, serde_json::json!({ "h": empreinte_jeu(&j.f), "f": j.f, "mtime": j.mtime })))
        .collect();
    let base: BTreeMap<String, String> = lire_json("saves-synchro.json");
    serde_json::json!({ "jeux": jeux, "base": base })
}

/// Contenu d'un fichier de sauvegarde, à envoyer.
pub fn lire(cle: &str, rel: &str) -> Result<Vec<u8>, String> {
    let jeux = jeux_locaux();
    let p = jeux.get(cle).and_then(|j| j.disque.get(rel)).ok_or("fichier introuvable")?;
    std::fs::read(p).map_err(|e| e.to_string())
}

/// Empreinte SHA-256 en hexadécimal : sert aussi de nom de fichier, donc jamais de « / » ni de « .. ».
fn empreinte_valide(e: &str) -> bool {
    e.len() == 64 && e.bytes().all(|b| b.is_ascii_hexdigit())
}
fn recus() -> PathBuf {
    PathBuf::from(fichier_data("saves-recues"))
}
/// Garde un fichier reçu de Loc, vérifié par son empreinte.
pub fn poser(empreinte: &str, contenu: &[u8]) -> Result<(), String> {
    if !empreinte_valide(empreinte) || format!("{:x}", Sha256::digest(contenu)) != empreinte {
        return Err("fichier abîmé pendant le téléchargement".into());
    }
    std::fs::create_dir_all(recus()).map_err(|e| e.to_string())?;
    crate::ecrire_sur(&recus().join(empreinte).to_string_lossy(), contenu).map_err(|e| e.to_string())
}

/// Note la version de Loc comme synchronisée pour ce jeu.
pub fn base(cle: &str, h: &str) {
    let mut b: BTreeMap<String, String> = lire_json("saves-synchro.json");
    b.insert(cle.to_string(), h.to_string());
    garder_json("saves-synchro.json", &b);
}

/// Remplace un jeu par la version de Loc (fichiers déjà reçus, ou déjà ici avec la même empreinte).
/// Ce qui est remplacé est d'abord copié dans data/sauvegardes-remplacees/<date>.
pub fn appliquer(cle: &str, f: BTreeMap<String, (String, u64)>, h: &str) -> Result<(), String> {
    if crate::embed::is_running() || crate::libretro::is_running() {
        return Err("une partie est en cours".into());
    }
    if f.is_empty() || !empreinte_valide(h) || f.values().any(|(e, _)| !empreinte_valide(e)) || empreinte_jeu(&f) != h {
        return Err("sauvegarde incomplète".into());
    }
    // Le plus gros fichier n'a que des zéros : sauvegarde abîmée sur l'autre appareil, jamais posée ici.
    if let Some((e, _)) = f.values().max_by_key(|(_, n)| *n) {
        let deja = jeux_locaux().get(cle).is_some_and(|j| j.f.values().any(|(x, _)| x == e));
        if !deja && std::fs::read(recus().join(e)).is_ok_and(|c| abime(&c)) {
            return Err("sauvegarde vide (que des zéros) refusée".into());
        }
    }
    let (zone, unite) = cle.split_once('/').ok_or("jeu invalide")?;
    let z = zones().into_iter().find(|z| z.nom == zone).ok_or("zone inconnue")?;
    let racine = std::fs::create_dir_all(&z.dossier).and_then(|_| z.dossier.canonicalize()).map_err(|e| e.to_string())?;
    let ici = jeux_locaux().remove(cle).unwrap_or_default();
    // Tout est vérifié avant de toucher au disque.
    let mut a_ecrire = Vec::new();
    for (rel, (e, _)) in &f {
        // Chaque fichier appartient bien à ce jeu, découpé comme sur cet appareil (jeux_locaux).
        let m: Vec<&str> = rel.split('/').collect();
        if m[..z.profondeur.min(m.len())].join("/") != unite {
            return Err("chemin refusé".into());
        }
        let dest = vers_disque(zone, rel)?;
        if ici.f.get(rel).is_some_and(|(x, _)| x == e) {
            continue;
        }
        let src = recus().join(e);
        if !src.is_file() {
            return Err("fichier manquant".into());
        }
        a_ecrire.push((src, dest));
    }
    let date = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs());
    let copie = PathBuf::from(fichier_data("sauvegardes-remplacees")).join(date.to_string()).join(zone);
    for (rel, p) in &ici.disque {
        let c = rel.split('/').fold(copie.clone(), |c, x| c.join(x));
        let _ = std::fs::create_dir_all(c.parent().unwrap());
        std::fs::copy(p, &c).map_err(|e| format!("copie de secours impossible : {e}"))?;
    }
    for (src, dest) in &a_ecrire {
        let _ = std::fs::create_dir_all(dest.parent().unwrap());
        // Dernière vérification, une fois les dossiers créés : rien hors de la zone (liens, noms ambigus).
        if !dest.parent().and_then(|p| p.canonicalize().ok()).is_some_and(|p| p.starts_with(&racine)) {
            return Err("chemin refusé".into());
        }
        // Un fichier déjà là mais pas compté dans ce jeu : copié de côté lui aussi.
        if dest.is_file() && !ici.disque.values().any(|p| p == dest) {
            let c = copie.join(dest.strip_prefix(&z.dossier).unwrap_or(Path::new("autre")));
            let _ = std::fs::create_dir_all(c.parent().unwrap());
            std::fs::copy(dest, &c).map_err(|e| format!("copie de secours impossible : {e}"))?;
        }
        let contenu = std::fs::read(src).map_err(|e| e.to_string())?;
        if src.file_name().is_none_or(|n| format!("{:x}", Sha256::digest(&contenu)) != n.to_string_lossy()) {
            return Err("fichier reçu abîmé".into());
        }
        crate::ecrire_sur(&dest.to_string_lossy(), &contenu).map_err(|e| e.to_string())?;
    }
    // Les fichiers que la version de Loc n'a pas.
    for (rel, p) in &ici.disque {
        if !f.contains_key(rel) {
            let _ = std::fs::remove_file(p);
        }
    }
    for (src, _) in a_ecrire {
        let _ = std::fs::remove_file(src);
    }
    base(cle, h);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sauvegarde_videe_refusee() {
        assert!(super::abime(&[0u8; 512]));
        assert!(!super::abime(&[]), "un fichier vide n'est pas abîmé");
        assert!(!super::abime(&[0, 0, 1]));
    }

    #[test]
    fn synchro_chemins_et_empreinte() {
        let m = |x: &str| x.split('/').map(String::from).collect::<Vec<_>>();
        let p = ("B1B83DBA185BB8D5D0EC55CCAB2D9118".to_string(), "D5D0EC55CCAB2D911800000000000000".to_string());
        // Profil Eden d'un appareil -> @moi, pour que le PC et le Mac parlent du même dossier.
        assert_eq!(vers_loc("switch", &m("0000000000000000/B1B83DBA185BB8D5D0EC55CCAB2D9118/01006A800016E000/save_data"), Some(&p)), Some(m("0000000000000000/@moi/01006A800016E000/save_data")));
        assert_eq!(vers_loc("switch", &m("0000000000000000/D5D0EC55CCAB2D911800000000000000/01006A800016E000/.yuzu_save_size"), Some(&p)).unwrap()[1], "@moi-bis");
        assert_eq!(vers_loc("switch", &m("cache/0000000000000000/x"), Some(&p)), None);
        assert_eq!(vers_loc("switch", &m("0000000000000000/AAAA000000000000000000000000AAAA/0100/x"), Some(&p)), None);
        assert_eq!(vers_loc("3ds", &m("x/y/title/00040000/00055e00/content/00000000.app"), None), None);
        assert_eq!(vers_loc("3ds", &m("x/y/title/00040000/00055e00/CONTENT/00000000.app"), None), None);
        assert!(vers_disque("wiiu", "SYSTEM/x/y").is_err());
        assert_eq!(vers_loc("wii", &m("00000001/00000002/data/setting.txt"), None), None);
        assert_eq!(vers_loc("ds", &m("._Pokemon.sav"), None), None);
        let piege: BTreeMap<String, (String, u64)> = [("Jeu.sav".to_string(), ("../../../.ssh/id_ed25519".to_string(), 1))].into_iter().collect();
        assert!(appliquer("ds/Jeu.sav", piege.clone(), &empreinte_jeu(&piege)).is_err());
        assert!(!morceau_sur(".. ") && !morceau_sur("x.") && !morceau_sur("NUL.txt") && !morceau_sur("com1") && morceau_sur("Pokémon Noire.sav") && morceau_sur("CONTENT"));
        assert!(vers_disque("ds", "melonDS DS/.. /x").is_err());
        let ailleurs: BTreeMap<String, (String, u64)> = [("Autre.sav".to_string(), ("0".repeat(64), 1))].into_iter().collect();
        assert!(appliquer("ds/Jeu.sav", ailleurs.clone(), &empreinte_jeu(&ailleurs)).is_err());
        assert!(vers_disque("ds", "../../.ssh/id").is_err() && vers_disque("ds", "a//b").is_err() && vers_disque("inconnue", "a").is_err());
        // Même empreinte que Loc (sauvegardes.js).
        let f: BTreeMap<String, (String, u64)> = [("b/é", "1"), ("b/z", "2"), ("a", "3")].into_iter().map(|(c, e)| (c.to_string(), (e.to_string(), 0))).collect();
        assert_eq!(empreinte_jeu(&f), format!("{:x}", Sha256::digest("a\u{0}3\nb/z\u{0}2\nb/é\u{0}1\n")));
    }
    #[test]
    fn copie_sans_les_jeux_installes() {
        let t = std::env::temp_dir().join(format!("enlocal-saves-{}", std::process::id()));
        let (a, b) = (t.join("a"), t.join("b"));
        std::fs::create_dir_all(a.join("title\\0004\\data")).unwrap();
        std::fs::create_dir_all(a.join("title\\0004\\content")).unwrap();
        std::fs::write(a.join("title\\0004\\data\\save.bin"), "v1").unwrap();
        std::fs::write(a.join("title\\0004\\content\\jeu.app"), "jeu").unwrap();
        super::copier(&a, &b, true);
        assert_eq!(std::fs::read_to_string(b.join("title\\0004\\data\\save.bin")).unwrap(), "v1");
        assert!(!b.join("title\\0004\\content").exists());
        std::fs::write(a.join("title\\0004\\data\\save.bin"), "v2!").unwrap();
        super::copier(&b, &a, false);
        assert_eq!(std::fs::read_to_string(a.join("title\\0004\\data\\save.bin")).unwrap(), "v2!");
        super::copier(&a, &b, true);
        assert_eq!(std::fs::read_to_string(b.join("title\\0004\\data\\save.bin")).unwrap(), "v2!");
        let _ = std::fs::remove_dir_all(t);
    }
}
