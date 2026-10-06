//! Jeux Switch compressés (.nsz, .xcz), qu'Eden ne lit pas.
//! nsz les décompresse au premier lancement avec les clés du joueur, puis l'original est supprimé.
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn compresse(p: &Path) -> bool {
    p.extension().and_then(|x| x.to_str()).is_some_and(|x| x.eq_ignore_ascii_case("nsz") || x.eq_ignore_ascii_case("xcz"))
}
fn decompresse(p: &Path) -> PathBuf {
    let xci = p.extension().is_some_and(|x| x.eq_ignore_ascii_case("xcz"));
    p.with_extension(if xci { "xci" } else { "nsp" })
}
fn compresses(dir: &Path, out: &mut Vec<PathBuf>) {
    for e in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        let p = e.path();
        if p.is_dir() {
            compresses(&p, out);
        } else if compresse(&p) {
            out.push(p);
        }
    }
}

/// Fichiers à décompresser : le jeu, et tout son dossier s'il en a un.
fn a_faire(jeu: &Path) -> Vec<PathBuf> {
    let mut l = Vec::new();
    match jeu.parent() {
        Some(d) if d != crate::dossier::switch() => compresses(d, &mut l),
        _ if compresse(jeu) => l.push(jeu.to_path_buf()),
        _ => {}
    }
    l
}

fn un(nsz: &Path, f: &Path, maison: &Path) -> Result<(), String> {
    let cible = decompresse(f);
    if cible.exists() {
        return Ok(()); // déjà décompressé
    }
    let dir = f.parent().ok_or("dossier introuvable")?;
    let ok = std::process::Command::new(nsz)
        .args([std::ffi::OsStr::new("-D"), std::ffi::OsStr::new("-o"), dir.as_os_str(), f.as_os_str()])
        .env("USERPROFILE", maison)
        .env("HOME", maison)
        .creation_flags(CREATE_NO_WINDOW)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .is_ok_and(|s| s.success());
    // Réussi seulement si le fichier décompressé est plus gros que l'original.
    let taille = |p: &Path| std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
    if ok && taille(&cible) > taille(f) {
        std::fs::remove_file(f).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        let _ = std::fs::remove_file(&cible);
        Err(format!("{} n'a pas pu être décompressé (place sur le disque ?).", f.file_name().unwrap_or_default().to_string_lossy()))
    }
}

/// Rend le chemin du jeu à lancer.
#[tauri::command]
pub async fn preparer_switch(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // Seulement un jeu du dossier des jeux, car on y supprime des fichiers.
        crate::jeu_permis(&path)?;
        let jeu = PathBuf::from(&path);
        let fichiers = a_faire(&jeu);
        if fichiers.is_empty() {
            return Ok(path);
        }
        let nsz = PathBuf::from(format!("{}\\emu\\nsz\\nsz.exe", crate::root()));
        let cles = PathBuf::from(format!("{}\\user\\keys\\prod.keys", crate::eden()));
        if !cles.exists() {
            return Err("Il faut d'abord les clés de ta Switch (Réglages, Nintendo Switch).".into());
        }
        // nsz cherche les clés dans ~\.switch : dossier temporaire le temps de la décompression.
        let maison = PathBuf::from(format!("{}\\data\\nsz-maison", crate::root()));
        std::fs::create_dir_all(maison.join(".switch")).map_err(|e| e.to_string())?;
        std::fs::copy(&cles, maison.join(".switch").join("prod.keys")).map_err(|e| e.to_string())?;
        let r = fichiers.iter().try_for_each(|f| un(&nsz, f, &maison));
        let _ = std::fs::remove_dir_all(&maison);
        r?;
        Ok(if compresse(&jeu) { decompresse(&jeu).to_string_lossy().into_owned() } else { path })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    #[test]
    fn noms() {
        assert_eq!(super::decompresse(Path::new("E:\\Switch\\Jeu\\Jeu.nsz")), Path::new("E:\\Switch\\Jeu\\Jeu.nsp"));
        assert_eq!(super::decompresse(Path::new("E:\\Switch\\Jeu.XCZ")), Path::new("E:\\Switch\\Jeu.xci"));
        assert!(super::compresse(Path::new("a.NSZ")) && !super::compresse(Path::new("a.nsp")));
    }

    /// Test sur une copie d'un vrai .nsz (chemin dans ENLOCAL_NSZ).
    #[test]
    #[ignore]
    fn vrai_fichier() {
        let f = std::path::PathBuf::from(std::env::var("ENLOCAL_NSZ").unwrap());
        let maison = std::env::temp_dir().join("enlocal-nsz-maison");
        std::fs::create_dir_all(maison.join(".switch")).unwrap();
        std::fs::copy(std::env::var("ENLOCAL_CLES").unwrap(), maison.join(".switch").join("prod.keys")).unwrap();
        let r = super::un(Path::new("C:\\EnLocal\\emu\\nsz\\nsz.exe"), &f, &maison);
        let _ = std::fs::remove_dir_all(&maison);
        r.unwrap();
        let sortie = super::decompresse(&f);
        println!("{} : {} Mo, original encore là : {}", sortie.display(), std::fs::metadata(&sortie).unwrap().len() / 1_000_000, f.exists());
        assert!(!f.exists());
        std::fs::remove_file(sortie).unwrap();
    }
}
