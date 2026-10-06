//! Médias : musique et vidéos du PC. Un album = un dossier.

use std::path::{Path, PathBuf};

const AUDIO: [&str; 7] = ["mp3", "flac", "ogg", "opus", "m4a", "wav", "aac"];
const VIDEO: [&str; 4] = ["mp4", "webm", "mkv", "mov"];
const IMAGE: [&str; 4] = ["jpg", "jpeg", "png", "webp"];
const MAX_FICHIERS: usize = 5000;

pub fn racine() -> PathBuf {
    Path::new(crate::root()).join("Médias")
}
/// Dossier choisi pour une sorte de médias, gardé dans data\dossier-<sorte>.txt.
pub fn choisi(sorte: &str) -> Option<PathBuf> {
    std::fs::read_to_string(crate::maison::dossier("").join(format!("dossier-{sorte}.txt"))).ok().map(|s| PathBuf::from(s.trim())).filter(|p| p.is_absolute())
}
/// None : dossier par défaut.
pub fn choisir(sorte: &str, chemin: Option<&str>) -> Result<Option<PathBuf>, String> {
    if !["musique", "videos", "captures"].contains(&sorte) {
        return Err("sorte inconnue".into());
    }
    let f = crate::maison::dossier("").join(format!("dossier-{sorte}.txt"));
    let Some(c) = chemin else {
        let _ = std::fs::remove_file(f);
        return Ok(None);
    };
    let p = PathBuf::from(c.trim());
    if !p.is_absolute() || c.contains('\n') {
        return Err("Chemin invalide".into());
    }
    std::fs::create_dir_all(&p).map_err(|e| format!("Impossible de créer le dossier : {e}"))?;
    std::fs::write(f, p.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
    Ok(Some(p))
}
/// Refuse les dossiers trop larges (racine, profil, Windows) : l'interface pourrait tout lire.
pub fn dossier_permis(p: &Path) -> bool {
    let vrai = std::fs::canonicalize(p).map(|x| PathBuf::from(x.to_string_lossy().trim_start_matches(r"\\?\"))).unwrap_or_else(|_| p.to_path_buf());
    if vrai.parent().is_none() || vrai.components().count() < 2 {
        return false;
    }
    let bas = vrai.to_string_lossy().to_lowercase();
    let interdits = ["windir", "ProgramFiles", "ProgramFiles(x86)", "ProgramData", "APPDATA", "LOCALAPPDATA"].iter().filter_map(|v| std::env::var(v).ok()).map(|x| x.to_lowercase());
    if interdits.into_iter().any(|x| bas.starts_with(&x)) {
        return false;
    }
    std::env::var("USERPROFILE").map(|u| u.to_lowercase() != bas.trim_end_matches('\\')).unwrap_or(true)
}

pub fn deux_chemins(d: &Path) -> [PathBuf; 2] {
    [d.to_path_buf(), std::fs::canonicalize(d).map(|p| PathBuf::from(p.to_string_lossy().trim_start_matches(r"\\?\"))).unwrap_or_else(|_| d.to_path_buf())]
}

/// Dossiers lus : celui choisi, sinon ceux d'En Local et de Windows.
pub fn video_permise(p: &std::path::Path) -> bool {
    let Ok(vrai) = std::fs::canonicalize(p) else { return false };
    dossiers("Vidéos").iter().filter_map(|d| std::fs::canonicalize(d).ok()).any(|d| vrai.starts_with(d))
}

fn dossiers(sorte: &str) -> Vec<PathBuf> {
    if let Some(d) = choisi(if sorte == "Musique" { "musique" } else { "videos" }) {
        return vec![d].into_iter().filter(|d| d.is_dir()).collect();
    }
    let mut l = vec![racine().join(sorte)];
    if let Ok(profil) = std::env::var("USERPROFILE") {
        let windows = if sorte == "Musique" { "Music" } else { "Videos" };
        l.push(Path::new(&profil).join(windows));
    }
    l.into_iter().filter(|d| d.is_dir()).collect()
}
pub fn preparer() {
    for (d, texte) in [("Musique", "Ta musique : un dossier par album (avec cover.jpg si tu veux une pochette).\r\nMP3, FLAC, OGG, M4A, WAV.\r\n"), ("Vidéos", "Tes vidéos (MP4, WebM, MKV), un dossier par série si tu veux.\r\n")] {
        let p = racine().join(d);
        let _ = std::fs::create_dir_all(&p);
        let f = p.join("Lisez-moi.txt");
        if !f.exists() {
            let _ = std::fs::write(f, texte);
        }
    }
}
/// Dossiers que l'interface peut lire, avec leur vrai chemin.
pub fn lisibles() -> Vec<PathBuf> {
    preparer();
    let mut l: Vec<PathBuf> = dossiers("Musique").into_iter().chain(dossiers("Vidéos")).collect();
    l.push(crate::maison::dossier("pochettes"));
    l.push(crate::maison::dossier_captures());
    l.iter().flat_map(|d| deux_chemins(d)).collect()
}

fn extension(p: &Path) -> String {
    p.extension().and_then(|x| x.to_str()).unwrap_or("").to_ascii_lowercase()
}
fn chemin(p: &Path) -> String {
    std::fs::canonicalize(p).map(|x| x.to_string_lossy().trim_start_matches(r"\\?\").to_string()).unwrap_or_else(|_| p.to_string_lossy().into_owned())
}
/// Exemple : « 03 - Titre.mp3 » -> « Titre ».
fn titre(p: &Path) -> String {
    let n = p.file_stem().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
    let t = n.trim_start_matches(|c: char| c.is_ascii_digit()).trim_start_matches([' ', '-', '.', '_']).trim();
    if t.is_empty() { n } else { t.to_string() }
}
fn fichiers(dir: &Path, exts: &[&str], profondeur: u32, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut l: Vec<PathBuf> = rd.flatten().map(|e| e.path()).collect();
    l.sort();
    for p in l {
        if out.len() >= MAX_FICHIERS {
            return;
        }
        if p.is_dir() {
            if profondeur > 0 {
                fichiers(&p, exts, profondeur - 1, out);
            }
        } else if exts.contains(&extension(&p).as_str()) {
            out.push(p);
        }
    }
}

#[derive(serde::Serialize)]
pub struct Piste {
    pub titre: String,
    pub path: String,
}
#[derive(serde::Serialize)]
pub struct Album {
    pub nom: String,
    pub pochette: Option<String>,
    pub pistes: Vec<Piste>,
}
#[derive(serde::Serialize)]
pub struct Video {
    pub titre: String,
    pub path: String,
    pub dossier: String,
}

/// Albums : les pistes regroupées par dossier.
pub fn albums() -> Vec<Album> {
    let mut pistes = Vec::new();
    for d in dossiers("Musique") {
        fichiers(&d, &AUDIO, 4, &mut pistes);
    }
    let mut par: Vec<(PathBuf, Vec<PathBuf>)> = Vec::new();
    for p in pistes {
        let dir = p.parent().unwrap_or(Path::new("")).to_path_buf();
        match par.iter_mut().find(|(d, _)| *d == dir) {
            Some((_, l)) => l.push(p),
            None => par.push((dir, vec![p])),
        }
    }
    let racines = dossiers("Musique");
    par.into_iter()
        .map(|(dir, l)| {
            let nom = if racines.contains(&dir) { "Titres".to_string() } else { dir.file_name().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default() };
            Album { nom, pochette: pochette(&dir, &l[0]), pistes: l.iter().map(|p| Piste { titre: titre(p), path: chemin(p) }).collect() }
        })
        .collect()
}

pub fn videos() -> Vec<Video> {
    let mut l = Vec::new();
    for d in dossiers("Vidéos") {
        fichiers(&d, &VIDEO, 3, &mut l);
    }
    l.into_iter().map(|p| Video { titre: titre(&p), dossier: p.parent().and_then(|d| d.file_name()).map(|x| x.to_string_lossy().into_owned()).unwrap_or_default(), path: chemin(&p) }).collect()
}

/// Pochette : une image du dossier, sinon celle du premier MP3.
fn pochette(dir: &Path, premiere: &Path) -> Option<String> {
    let mut images: Vec<PathBuf> = std::fs::read_dir(dir).ok()?.flatten().map(|e| e.path()).filter(|p| IMAGE.contains(&extension(p).as_str())).collect();
    images.sort_by_key(|p| {
        let n = p.file_stem().map(|x| x.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
        ["cover", "folder", "front", "album"].iter().position(|x| n.contains(x)).unwrap_or(9)
    });
    if let Some(i) = images.first() {
        return Some(chemin(i));
    }
    let id = {
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        premiere.hash(&mut h);
        h.finish()
    };
    let cache = crate::maison::dossier("pochettes").join(format!("{id:016x}.img"));
    if cache.exists() {
        return Some(chemin(&cache));
    }
    let image = image_id3(premiere)?;
    std::fs::write(&cache, image).ok()?;
    Some(chemin(&cache))
}

/// Image intégrée d'un MP3 (cadre APIC).
pub fn image_id3(p: &Path) -> Option<Vec<u8>> {
    use std::io::Read;
    let mut f = std::fs::File::open(p).ok()?;
    let mut h = [0u8; 10];
    f.read_exact(&mut h).ok()?;
    if &h[..3] != b"ID3" || !(3..=4).contains(&h[3]) {
        return None;
    }
    let taille = h[6..10].iter().fold(0usize, |t, b| (t << 7) | (*b as usize & 0x7f));
    let mut tag = vec![0u8; taille.min(8 << 20)];
    f.read_exact(&mut tag).ok()?;
    lire_apic(&tag, h[3])
}
fn lire_apic(tag: &[u8], version: u8) -> Option<Vec<u8>> {
    let mut i = 0;
    while i + 10 <= tag.len() {
        let id = &tag[i..i + 4];
        if id[0] == 0 {
            break;
        }
        let t = &tag[i + 4..i + 8];
        let n = if version == 4 { t.iter().fold(0usize, |a, b| (a << 7) | (*b as usize & 0x7f)) } else { u32::from_be_bytes(t.try_into().ok()?) as usize };
        let corps = tag.get(i + 10..(i + 10).checked_add(n)?)?;
        if id == b"APIC" {
            // Fichier venu d'ailleurs : chaque position est vérifiée, aucune indexation qui panique.
            let codage = *corps.first()?;
            let mut k = 1 + corps.get(1..)?.iter().position(|&b| b == 0)? + 1 + 1;
            if codage == 1 || codage == 2 {
                while k + 1 < corps.len() && !(corps[k] == 0 && corps[k + 1] == 0) {
                    k += 2;
                }
                k += 2;
            } else {
                k += corps.get(k..)?.iter().position(|&b| b == 0)? + 1;
            }
            return corps.get(k..).map(|x| x.to_vec()).filter(|x| x.len() > 100);
        }
        i += 10 + n;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dossiers_permis() {
        assert!(!dossier_permis(Path::new("C:\\")));
        assert!(!dossier_permis(Path::new("C:\\Windows\\System32")));
        if let Ok(u) = std::env::var("USERPROFILE") {
            assert!(!dossier_permis(Path::new(&u)));
            assert!(dossier_permis(&Path::new(&u).join("Music")));
        }
        assert!(dossier_permis(Path::new("D:\\Musique")));
    }

    #[test]
    fn titres_et_pochette_id3() {
        assert_eq!(titre(Path::new("03 - Gerudo Valley.mp3")), "Gerudo Valley");
        assert_eq!(titre(Path::new("1999.mp3")), "1999");
        let image = vec![0xFFu8; 200];
        let mut apic = vec![0u8];
        apic.extend(b"image/jpeg\0");
        apic.push(3);
        apic.extend(b"x\0");
        apic.extend(&image);
        let mut tag = Vec::new();
        tag.extend(b"TIT2");
        tag.extend(5u32.to_be_bytes());
        tag.extend([0, 0, 0, b'a', b'b', b'c', b'd']);
        tag.extend(b"APIC");
        tag.extend((apic.len() as u32).to_be_bytes());
        tag.extend([0, 0]);
        tag.extend(&apic);
        assert_eq!(lire_apic(&tag, 3), Some(image));
        assert_eq!(lire_apic(b"TIT2\0\0\0\x01\0\0a", 3), None);
        // Cadres APIC tronqués ou piégés : pas de plantage.
        for corps in [&b""[..], b"\0", b"\0image/jpeg", b"\0image/jpeg\0", b"\0image/jpeg\0\x03", b"\x01x\0\x03\0"] {
            let mut t = b"APIC".to_vec();
            t.extend((corps.len() as u32).to_be_bytes());
            t.extend([0, 0]);
            t.extend(corps);
            assert_eq!(lire_apic(&t, 3), None);
        }
        let mut t = b"APIC".to_vec();
        t.extend(u32::MAX.to_be_bytes());
        t.extend([0, 0, 0]);
        assert_eq!(lire_apic(&t, 3), None);
    }
}
