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
/// Dossier sorti de la Switch avec le firmware (plus de 100 fichiers .nca).
pub fn est_firmware(dir: &Path) -> bool {
    let mut ncas = Vec::new();
    lister(dir, 2, &mut ncas);
    ncas.len() >= 100
}
/*
 * Title ID d'un NSP qui ne le donne ni dans son nom, ni dans un ticket, ni dans un cnmt.xml :
 * on le lit dans l'en-tête chiffré de son .cnmt.nca, avec la clé « header_key » du prod.keys
 * du joueur (AES-128-XTS, comme Eden). L'en-tête fait 0xC00 octets en secteurs de 0x200 ;
 * le title ID est en 0x210, dans le deuxième secteur, derrière la marque « NCA3 » en 0x200.
 */
pub fn title_id_nca(nsp: &str) -> Option<u64> {
    title_id_avec(nsp, &header_key(&cles().join("prod.keys"))?)
}
fn title_id_avec(nsp: &str, cle: &[u8; 32]) -> Option<u64> {
    use std::io::{Read, Seek, SeekFrom};
    let (mut f, entrees) = crate::entrees_nsp(nsp)?;
    let (_, off, taille) = entrees.into_iter().find(|e| e.0.ends_with(".cnmt.nca"))?;
    if taille < 0x400 {
        return None;
    }
    let mut secteur = [0u8; 0x20];
    f.seek(SeekFrom::Start(off + 0x200)).and_then(|_| f.read_exact(&mut secteur)).ok()?;
    let clair = xts_dechiffrer(cle, 1, &secteur)?;
    (&clair[..4] == b"NCA3").then(|| u64::from_le_bytes(clair[0x10..0x18].try_into().unwrap()))
}
fn header_key(prod_keys: &Path) -> Option<[u8; 32]> {
    let texte = std::fs::read_to_string(prod_keys).ok()?;
    let v = texte.lines().filter_map(|l| l.split_once('=')).find(|(k, _)| k.trim() == "header_key")?.1.trim().to_string();
    if v.len() != 64 {
        return None;
    }
    let mut k = [0u8; 32];
    for (i, b) in k.iter_mut().enumerate() {
        *b = u8::from_str_radix(&v[2 * i..2 * i + 2], 16).ok()?;
    }
    Some(k)
}
/// AES-128-XTS (tweak de Nintendo : numéro de secteur en gros-boutiste) sur le début d'un secteur.
fn xts_dechiffrer(cle: &[u8; 32], secteur: u64, donnees: &[u8]) -> Option<Vec<u8>> {
    use windows::Win32::Security::Cryptography::*;
    let aes = |k: &[u8], bloc: &[u8], chiffrer: bool| -> Option<[u8; 16]> {
        let mut h = BCRYPT_KEY_HANDLE::default();
        let mut sortie = [0u8; 16];
        let mut n = 0u32;
        unsafe {
            BCryptGenerateSymmetricKey(BCRYPT_AES_ECB_ALG_HANDLE, &mut h, None, k, 0).ok().ok()?;
            let r = if chiffrer {
                BCryptEncrypt(h, Some(bloc), None, None, Some(&mut sortie), &mut n, BCRYPT_FLAGS(0))
            } else {
                BCryptDecrypt(h, Some(bloc), None, None, Some(&mut sortie), &mut n, BCRYPT_FLAGS(0))
            };
            let _ = BCryptDestroyKey(h);
            r.ok().ok()?;
        }
        Some(sortie)
    };
    let mut tweak = [0u8; 16];
    tweak[8..].copy_from_slice(&secteur.to_be_bytes());
    let mut t = aes(&cle[16..], &tweak, true)?;
    let mut out = Vec::with_capacity(donnees.len());
    for bloc in donnees.chunks_exact(16) {
        let x: Vec<u8> = bloc.iter().zip(t).map(|(a, b)| a ^ b).collect();
        out.extend(aes(&cle[..16], &x, false)?.iter().zip(t).map(|(a, b)| a ^ b));
        // Bloc suivant : le tweak est multiplié par x dans GF(2^128).
        let retenue = t[15] >> 7;
        for i in (1..16).rev() {
            t[i] = (t[i] << 1) | (t[i - 1] >> 7);
        }
        t[0] = (t[0] << 1) ^ if retenue == 1 { 0x87 } else { 0 };
    }
    Some(out)
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
    /// Le title ID lu dans l'en-tête chiffré est celui du nom, pour chaque NSP du dossier Switch :
    /// `NSP_DIR=<dossier Switch> PROD_KEYS=<prod.keys> cargo test --release -- --ignored title_id_des_nsp --nocapture`.
    #[test]
    #[ignore]
    fn title_id_des_nsp() {
        let mut n = 0;
        // Les tests tournent hors de l'app : clés et dossier sont donnés à part.
        let cle = super::header_key(std::path::Path::new(&std::env::var("PROD_KEYS").expect("PROD_KEYS"))).expect("header_key");
        let dir = std::env::var("NSP_DIR").map(std::path::PathBuf::from).unwrap_or_else(|_| crate::dossier::switch());
        for p in crate::contenus_switch(&dir) {
            let nom = p.file_stem().unwrap().to_string_lossy().into_owned();
            let Some(attendu) = nom.split('[').skip(1).filter_map(|x| x.split(']').next()).find(|x| x.len() == 16) else { continue };
            if p.extension().is_some_and(|x| x == "nsz") {
                continue;
            }
            let lu = super::title_id_avec(&p.to_string_lossy(), &cle);
            println!("{nom} -> {lu:016X?}");
            assert_eq!(lu, u64::from_str_radix(attendu, 16).ok(), "{nom}");
            n += 1;
        }
        assert!(n > 0, "aucun NSP à vérifier");
    }

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
