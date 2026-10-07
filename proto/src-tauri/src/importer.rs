//! Ajouter des jeux : fichiers ou archives (.zip, .7z, .rar) déposés dans l'app. Les archives sont
//! décompressées, chaque jeu, mise à jour ou DLC va dans le dossier de sa console, puis le dossier
//! des jeux est rangé. Les fichiers d'origine ne sont jamais supprimés quand ils viennent d'ailleurs.

use crate::dossier::{self, Classer, CONSOLES, MAJ};
use std::path::{Path, PathBuf};

const ARCHIVES: [&str; 3] = ["zip", "7z", "rar"];

#[derive(serde::Serialize, Default)]
pub struct Bilan {
    /// Jeux, MAJ et DLC placés : (console, nom).
    pub ajoutes: Vec<(String, String)>,
    /// Fichiers qui ne sont pas des jeux (textes, images…), laissés de côté.
    pub ignores: usize,
    pub erreurs: Vec<String>,
}

fn est_archive(p: &Path) -> bool {
    p.extension().and_then(|e| e.to_str()).is_some_and(|e| ARCHIVES.contains(&e.to_lowercase().as_str()))
}

/// Déplace (même disque), sinon copie : l'original venu d'un autre disque reste en place.
fn amener(de: &Path, vers: &Path) -> std::io::Result<()> {
    if std::fs::symlink_metadata(de)?.file_type().is_symlink() {
        return Ok(());
    }
    if std::fs::rename(de, vers).is_ok() {
        return Ok(());
    }
    if de.is_dir() {
        std::fs::create_dir_all(vers)?;
        for e in std::fs::read_dir(de)?.flatten() {
            amener(&e.path(), &vers.join(e.file_name()))?;
        }
        Ok(())
    } else {
        std::fs::copy(de, vers).map(|_| ())
    }
}

/// Un nom libre dans `dossier` (« Nom », « Nom (2) »…).
fn libre(dossier: &Path, nom: &str) -> PathBuf {
    let p = dossier.join(nom);
    if !p.exists() {
        return p;
    }
    let (base, ext) = match nom.rsplit_once('.') {
        Some((b, e)) if !b.is_empty() && e.len() <= 5 => (b.to_string(), format!(".{e}")),
        _ => (nom.to_string(), String::new()),
    };
    (2..).map(|n| dossier.join(format!("{base} ({n}){ext}"))).find(|p| !p.exists()).unwrap()
}

/// Nom lisible d'un jeu Wii U décompressé : celui de meta.xml (français, sinon anglais), sinon le dossier.
fn nom_wiiu(d: &Path) -> String {
    let meta = std::fs::read_to_string(d.join("meta").join("meta.xml")).unwrap_or_default();
    let balise = |b: &str| meta.split(&format!("<{b}")).nth(1).and_then(|r| r.split('>').nth(1)?.split('<').next()).map(|x| x.split_whitespace().collect::<Vec<_>>().join(" "));
    let nom = balise("longname_fr").filter(|x| !x.is_empty()).or_else(|| balise("longname_en").filter(|x| !x.is_empty()));
    let nom = nom.unwrap_or_else(|| d.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default());
    nom.chars().filter(|c| !"\\/:*?\"<>|".contains(*c)).collect::<String>().trim().trim_end_matches('.').to_string()
}
/// Title ID d'un dossier Wii U décompressé (code\app.xml, sinon meta\meta.xml).
fn id_wiiu(d: &Path) -> Option<String> {
    let xml = [d.join("code").join("app.xml"), d.join("meta").join("meta.xml")].iter().find_map(|f| std::fs::read_to_string(f).ok())?;
    let id = xml.split("<title_id").nth(1)?.split('>').nth(1)?.split('<').next()?.trim().to_lowercase();
    (id.len() == 16 && id.bytes().all(|b| b.is_ascii_hexdigit())).then_some(id)
}

/// Les dossiers Wii U décompressés (code, content, meta) sous `d`, et tous les autres fichiers.
/// Les liens (symboliques, jonctions) sont ignorés : une archive piégée ne peut pas faire sortir de la zone.
fn trier(d: &Path, profondeur: u32, wiiu: &mut Vec<PathBuf>, fichiers: &mut Vec<PathBuf>) {
    for e in std::fs::read_dir(d).into_iter().flatten().flatten() {
        let Ok(t) = e.file_type() else { continue };
        if t.is_symlink() {
            continue;
        }
        let p = e.path();
        if t.is_dir() {
            if p.join("code").is_dir() && (p.join("meta").is_dir() || p.join("content").is_dir()) {
                wiiu.push(p);
            } else if profondeur > 0 {
                trier(&p, profondeur - 1, wiiu, fichiers);
            }
        } else if t.is_file() {
            fichiers.push(p);
        }
    }
}
/// Un dossier Wii U sans aucun lien dedans (sinon il n'est pas déplacé).
fn sans_liens(d: &Path) -> bool {
    std::fs::read_dir(d).into_iter().flatten().flatten().all(|e| e.file_type().is_ok_and(|t| !t.is_symlink() && (!t.is_dir() || sans_liens(&e.path()))))
}

/// Ajoute `chemins` (fichiers, dossiers, archives) au dossier des jeux. `etape` : texte de progression.
pub fn importer(chemins: &[String], classer: Classer, etape: &dyn Fn(String)) -> Bilan {
    importer_dans(&dossier::jeux(), chemins, classer, etape)
}
fn importer_dans(racine: &Path, chemins: &[String], classer: Classer, etape: &dyn Fn(String)) -> Bilan {
    let mut b = Bilan::default();
    let racine = racine.to_path_buf();
    if let Err(e) = dossier::organiser(&racine) {
        b.erreurs.push(format!("Dossier des jeux : {e}"));
        return b;
    }
    // Zone de travail sur le même disque que les jeux : la suite n'est que des déplacements.
    let travail = racine.join(format!(".import-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&travail);
    if std::fs::create_dir_all(&travail).is_err() {
        b.erreurs.push("Impossible de préparer l'import.".into());
        return b;
    }
    for (n, c) in chemins.iter().enumerate() {
        let p = PathBuf::from(c);
        let nom = p.file_name().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
        if !p.is_absolute() || !p.exists() || nom.is_empty() || p.starts_with(&travail) {
            b.erreurs.push(format!("{nom} : introuvable"));
            continue;
        }
        let ici = travail.join(n.to_string());
        let _ = std::fs::create_dir_all(&ici);
        if p.is_file() && est_archive(&p) {
            etape(format!("Décompression de {nom}…"));
            use std::os::windows::process::CommandExt;
            let ok = std::process::Command::new("tar").arg("-xf").arg(&p).arg("-C").arg(&ici).creation_flags(0x0800_0000).status().is_ok_and(|s| s.success());
            if !ok {
                b.erreurs.push(format!("{nom} : archive illisible ou abîmée"));
            }
        } else {
            etape(format!("Copie de {nom}…"));
            if let Err(e) = amener(&p, &ici.join(&nom)) {
                b.erreurs.push(format!("{nom} : {e}"));
            }
        }
    }
    etape("Rangement…".into());
    let (mut wiiu, mut fichiers) = (Vec::new(), Vec::new());
    trier(&travail, 6, &mut wiiu, &mut fichiers);
    // Wii U décompressé : jeu dans Wii U\<nom>, MAJ et DLC dans Wii U\MAJ et DLC\<nom>.
    let dossier_wiiu = racine.join(CONSOLES.iter().find(|(id, _)| *id == "WiiU").unwrap().1);
    for d in wiiu {
        if !sans_liens(&d) {
            b.erreurs.push(format!("{} : contient des liens, ignoré", d.file_name().unwrap_or_default().to_string_lossy()));
            continue;
        }
        let id = id_wiiu(&d).unwrap_or_default();
        let contenu = id.starts_with("0005000e") || id.starts_with("0005000c");
        let mut nom = nom_wiiu(&d);
        if contenu && !nom.to_lowercase().contains(if id.starts_with("0005000e") { "mise à jour" } else { "dlc" }) {
            nom = format!("{nom} - {}", if id.starts_with("0005000e") { "Mise à jour" } else { "DLC" });
        }
        let parent = if contenu { dossier_wiiu.join(MAJ) } else { dossier_wiiu.clone() };
        let _ = std::fs::create_dir_all(&parent);
        let cible = libre(&parent, &nom);
        match std::fs::rename(&d, &cible) {
            Ok(()) => b.ajoutes.push(("WiiU".into(), cible.file_name().unwrap().to_string_lossy().into_owned())),
            Err(e) => b.erreurs.push(format!("{nom} : {e}")),
        }
    }
    // Autres fichiers : les jeux, MAJ et DLC reconnus vont à la racine, puis le rangement les place.
    for f in fichiers {
        let nom = f.file_name().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
        if nom.starts_with("._") || nom == ".DS_Store" {
            continue;
        }
        match classer(&f) {
            Some((console, _, _)) => {
                let cible = libre(&racine, &nom);
                match std::fs::rename(&f, &cible) {
                    Ok(()) => b.ajoutes.push((console.into(), nom)),
                    Err(e) => b.erreurs.push(format!("{nom} : {e}")),
                }
            }
            None => b.ignores += 1,
        }
    }
    let _ = std::fs::remove_dir_all(&travail);
    dossier::ranger(&dossier::a_ranger(&racine, classer));
    b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn noms_libres_et_wiiu() {
        let d = std::env::temp_dir().join("enlocal-import-test");
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(d.join("Jeu").join("code")).unwrap();
        std::fs::create_dir_all(d.join("Jeu").join("meta")).unwrap();
        std::fs::write(d.join("Jeu").join("meta").join("meta.xml"), "<menu><longname_en type=\"string\">The Legend of Zelda\nBreath of the Wild</longname_en><title_id type=\"hexBinary\">00050000101C9500</title_id></menu>").unwrap();
        std::fs::write(d.join("a.nsp"), b"x").unwrap();
        assert_eq!(nom_wiiu(&d.join("Jeu")), "The Legend of Zelda Breath of the Wild");
        assert_eq!(id_wiiu(&d.join("Jeu")).as_deref(), Some("00050000101c9500"));
        assert_eq!(libre(&d, "a.nsp").file_name().unwrap(), "a (2).nsp");
        assert_eq!(libre(&d, "b.nsp").file_name().unwrap(), "b.nsp");
        let (mut w, mut f) = (Vec::new(), Vec::new());
        trier(&d, 3, &mut w, &mut f);
        assert_eq!((w.len(), f.len()), (1, 1));
        assert!(est_archive(Path::new("x.ZIP")) && !est_archive(Path::new("x.nsp")));
    }
    /// Import réel (tar.exe de Windows) dans un dossier de jeux de test :
    /// `cargo test --release -- --ignored import_reel`.
    #[test]
    #[ignore]
    fn import_reel() {
        let base = std::env::temp_dir().join("enlocal-import-reel");
        let _ = std::fs::remove_dir_all(&base);
        let src = base.join("telechargements");
        std::fs::create_dir_all(src.join("pack")).unwrap();
        for f in ["Super Jeu [0100AAAA00010000].nsp", "Super Jeu Update [0100AAAA00010800][v65536].nsp", "Super Jeu DLC 1 [0100AAAA00011001].nsp", "Lisez-moi.txt"] {
            std::fs::write(src.join("pack").join(f), b"x").unwrap();
        }
        assert!(std::process::Command::new("tar").current_dir(src.join("pack")).args(["-a", "-cf", "../pack.zip", "."]).status().unwrap().success());
        std::fs::write(src.join("Autre Jeu DLC [0100BBBB00011001].nsp"), b"x").unwrap();
        let jeux = base.join("Jeux");
        std::fs::create_dir_all(&jeux).unwrap();
        let classer = |p: &Path| -> Option<(&'static str, bool, Option<u64>)> {
            let n = p.file_name()?.to_string_lossy().to_string();
            let id = n.split('[').nth(1).and_then(|x| u64::from_str_radix(&x[..16], 16).ok());
            (p.extension()?.to_str()? == "nsp").then(|| ("Switch", id.is_some_and(|x| x & 0x800 != 0 || (x >> 12) & 1 == 1), id))
        };
        let b = importer_dans(&jeux, &[src.join("pack.zip").to_string_lossy().into(), src.join("Autre Jeu DLC [0100BBBB00011001].nsp").to_string_lossy().into()], &classer, &|t| println!("{t}"));
        println!("ajoutés {:?} ignorés {} erreurs {:?}", b.ajoutes, b.ignores, b.erreurs);
        let existe = |r: &str| jeux.join(r).exists();
        assert!(existe("Switch/Super Jeu/Super Jeu [0100AAAA00010000].nsp"));
        assert!(existe("Switch/Super Jeu/MAJ et DLC/Super Jeu Update [0100AAAA00010800][v65536].nsp"));
        assert!(existe("Switch/Super Jeu/MAJ et DLC/Super Jeu DLC 1 [0100AAAA00011001].nsp"));
        assert!(existe("Switch/Autre Jeu DLC/MAJ et DLC/Autre Jeu DLC [0100BBBB00011001].nsp"));
        assert_eq!((b.ajoutes.len(), b.ignores), (4, 1));
        assert!(src.join("pack.zip").exists(), "l'archive d'origine reste");
        assert!(!std::fs::read_dir(&jeux).unwrap().flatten().any(|e| e.file_name().to_string_lossy().starts_with(".import")));
    }
}
