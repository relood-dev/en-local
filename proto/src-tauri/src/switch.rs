//! Clés et firmware de la Switch du joueur, copiés là où Eden les lit.
//! En Local ne les fournit jamais : il copie seulement les fichiers choisis par le joueur.

use std::path::{Path, PathBuf};

fn user() -> PathBuf {
    PathBuf::from(crate::eden()).join("user")
}
fn cles() -> PathBuf {
    user().join("keys")
}
fn firmware() -> PathBuf {
    user().join("nand").join("system").join("Contents").join("registered")
}

/// En place : prod.keys, et nombre de fichiers du firmware.
#[derive(serde::Serialize)]
pub struct Etat {
    pub cles: bool,
    /// title.keys : nécessaire à certains .nsp.
    pub titres: bool,
    pub firmware: usize,
}
pub fn etat() -> Etat {
    let n = std::fs::read_dir(firmware()).map_or(0, |d| d.flatten().filter(|e| est_nca(&e.path())).count());
    Etat { cles: cles().join("prod.keys").is_file(), titres: cles().join("title.keys").is_file(), firmware: n }
}
fn est_nca(p: &Path) -> bool {
    p.extension().is_some_and(|x| x.eq_ignore_ascii_case("nca"))
}

/// Vérifie le format « nom = clé hexadécimale » et la présence des clés principales.
fn cles_valides(texte: &str) -> bool {
    let lignes: Vec<(&str, &str)> = texte.lines().filter_map(|l| l.split_once('=')).map(|(a, b)| (a.trim(), b.trim())).collect();
    let hex = |v: &str| v.len() >= 32 && v.bytes().all(|b| b.is_ascii_hexdigit());
    lignes.iter().any(|(k, v)| *k == "header_key" && hex(v)) && lignes.iter().filter(|(k, v)| k.starts_with("master_key_") && hex(v)).count() >= 1
}

/// Copie prod.keys, et title.keys s'il est à côté.
pub fn poser_cles(src: &Path) -> Result<(), String> {
    let texte = std::fs::read(src).ok().filter(|b| b.len() < 1 << 20).and_then(|b| String::from_utf8(b).ok()).unwrap_or_default();
    if !cles_valides(&texte) {
        return Err("Ce fichier n'est pas un prod.keys (il doit venir de ta Switch, avec Lockpick_RCM).".into());
    }
    std::fs::create_dir_all(cles()).map_err(|e| e.to_string())?;
    std::fs::write(cles().join("prod.keys"), texte).map_err(|e| e.to_string())?;
    if let Some(t) = src.parent().map(|d| d.join("title.keys")).filter(|t| t.is_file()) {
        let _ = std::fs::copy(t, cles().join("title.keys"));
    }
    Ok(())
}

pub fn poser_titres(src: &Path) -> Result<usize, String> {
    let texte = std::fs::read(src).ok().filter(|b| b.len() < 4 << 20).and_then(|b| String::from_utf8(b).ok()).unwrap_or_default();
    let hex = |v: &str| v.len() == 32 && v.bytes().all(|b| b.is_ascii_hexdigit());
    let n = texte.lines().filter_map(|l| l.split_once('=')).filter(|(a, b)| hex(a.trim()) && hex(b.trim())).count();
    if n == 0 {
        return Err("Ce fichier n'est pas un title.keys (il doit venir de ta Switch, avec Lockpick_RCM).".into());
    }
    std::fs::create_dir_all(cles()).map_err(|e| e.to_string())?;
    std::fs::write(cles().join("title.keys"), texte).map_err(|e| e.to_string())?;
    Ok(n)
}

/// Remplace le firmware par les .nca du dossier choisi. Rend leur nombre.
pub fn poser_firmware(src: &Path) -> Result<usize, String> {
    let mut ncas = Vec::new();
    lister(src, 2, &mut ncas);
    // Un firmware complet a plus de 200 fichiers.
    if ncas.len() < 100 {
        return Err(format!("Ce dossier ne contient pas un firmware ({} fichiers .nca, il en faut plus de 100). Choisis le dossier sorti de ta Switch avec TegraExplorer.", ncas.len()));
    }
    let dest = firmware();
    let neuf = dest.with_file_name("registered.nouveau");
    let _ = std::fs::remove_dir_all(&neuf);
    std::fs::create_dir_all(&neuf).map_err(|e| e.to_string())?;
    for f in &ncas {
        std::fs::copy(f, neuf.join(f.file_name().unwrap())).map_err(|e| format!("Copie impossible : {e}"))?;
    }
    // L'ancien firmware n'est remplacé qu'une fois le nouveau entièrement copié.
    let _ = std::fs::remove_dir_all(&dest);
    std::fs::rename(&neuf, &dest).map_err(|e| e.to_string())?;
    Ok(ncas.len())
}
fn lister(dir: &Path, profondeur: u32, out: &mut Vec<PathBuf>) {
    for e in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        let p = e.path();
        if p.is_dir() && profondeur > 0 {
            lister(&p, profondeur - 1, out);
        } else if est_nca(&p) {
            out.push(p);
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn reconnait_un_prod_keys() {
        let k = "a".repeat(64);
        assert!(super::cles_valides(&format!("aes_kek_generation_source = {k}\nheader_key = {k}\nmaster_key_00 = {}\n", &k[..32])));
        assert!(!super::cles_valides("bonjour"));
        assert!(!super::cles_valides(&format!("header_key = {k}\n")));
        let d = std::env::temp_dir().join("enlocal-title.keys");
        std::fs::write(&d, "pas une clé\n").unwrap();
        assert!(super::poser_titres(&d).is_err());
    }

    #[test]
    #[ignore]
    fn vraie_switch() {
        let e = super::etat();
        let texte = std::fs::read_to_string(super::cles().join("prod.keys")).unwrap_or_default();
        println!("cles {} valides {} firmware {}", e.cles, super::cles_valides(&texte), e.firmware);
    }
}
