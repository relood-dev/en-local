//! Copie des sauvegardes dans Saved Games\En Local, pour qu'elles survivent à une désinstallation.
//! Copiées à chaque fin de partie et au démarrage.
use std::path::{Path, PathBuf};

/// Dossiers à copier : (dans l'app, dans la copie). Les jeux installés (« content ») ne sont pas copiés.
fn dossiers() -> Vec<(String, &'static str)> {
    let r = crate::root();
    vec![
        (format!("{r}\\data\\ds\\saves"), "DS"),
        (format!("{r}\\emu\\azahar-enlocal\\user\\sdmc\\Nintendo 3DS"), "3DS\\sdmc"),
        (format!("{r}\\emu\\azahar-enlocal\\user\\nand\\data"), "3DS\\nand"),
        (format!("{r}\\emu\\dolphin-enlocal\\User\\GC"), "GameCube"),
        (format!("{r}\\emu\\dolphin-enlocal\\User\\Wii\\title"), "Wii"),
        (format!("{r}\\emu\\cemu\\portable\\mlc01\\usr\\save"), "Wii U"),
        (format!("{r}\\emu\\eden-enlocal\\user\\nand\\user\\save"), "Switch\\user"),
        (format!("{r}\\emu\\eden-enlocal\\user\\nand\\system\\save"), "Switch\\system"),
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

#[cfg(test)]
mod tests {
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
