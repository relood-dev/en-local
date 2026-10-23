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
    /// Fichiers de console installés au passage (BIOS de la PS2 dans une archive…).
    pub messages: Vec<String>,
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

/// Les dossiers Wii U décompressés (code, content, meta) et les disques PS3 (PS3_GAME) sous `d`,
/// et tous les autres fichiers.
/// Les liens (symboliques, jonctions) sont ignorés : une archive piégée ne peut pas faire sortir de la zone.
fn trier(d: &Path, profondeur: u32, wiiu: &mut Vec<PathBuf>, fichiers: &mut Vec<PathBuf>) {
    for e in std::fs::read_dir(d).into_iter().flatten().flatten() {
        let Ok(t) = e.file_type() else { continue };
        if t.is_symlink() {
            continue;
        }
        let p = e.path();
        if t.is_dir() {
            if (p.join("code").is_dir() && (p.join("meta").is_dir() || p.join("content").is_dir())) || p.join("PS3_GAME").join("PARAM.SFO").is_file() {
                wiiu.push(p);
            } else if profondeur > 0 {
                trier(&p, profondeur - 1, wiiu, fichiers);
            }
        } else if t.is_file() {
            fichiers.push(p);
        }
    }
}
/// Nom de dossier tiré d'un texte du jeu : jamais de chemin (ni séparateur, ni « .. »), vide sinon.
fn nom_dossier(x: &str) -> String {
    let n: String = x.chars().filter(|c| !c.is_control() && !"\\/:*?\"<>|".contains(*c)).collect();
    n.trim().trim_matches('.').trim().chars().take(100).collect()
}
/// Un dossier Wii U sans aucun lien dedans (sinon il n'est pas déplacé).
fn sans_liens(d: &Path) -> bool {
    std::fs::read_dir(d).into_iter().flatten().flatten().all(|e| e.file_type().is_ok_and(|t| !t.is_symlink() && (!t.is_dir() || sans_liens(&e.path()))))
}

/// Décompresse une archive dans `vers`. Les .zip passent par .NET : le tar de Windows saute les
/// fichiers aux noms avec ™ ou 【】 (les DLC de Smash). .NET refuse aussi les chemins qui sortent de `vers`.
/// Les .rar et .7z passent par 7-Zip, livré avec En Local : le tar de Windows lit mal les RAR5.
/// Les chemins passent par l'environnement ou en arguments, jamais dans le texte d'une commande.
fn decompresser(archive: &Path, vers: &Path) -> bool {
    use std::os::windows::process::CommandExt;
    let zip = archive.extension().is_some_and(|e| e.eq_ignore_ascii_case("zip"));
    let mut c = if zip {
        let mut c = std::process::Command::new("powershell");
        c.args(["-NoProfile", "-NonInteractive", "-Command", "Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory($env:ENLOCAL_ARCHIVE, $env:ENLOCAL_VERS)"]);
        c.env("ENLOCAL_ARCHIVE", archive).env("ENLOCAL_VERS", vers);
        c
    } else if Path::new(&crate::emu("7zip\\7z.exe")).is_file() {
        let mut c = std::process::Command::new(crate::emu("7zip\\7z.exe"));
        c.arg("x").arg(format!("-o{}", vers.display())).args(["-y", "-bso0", "-bsp0", "--"]).arg(archive);
        c
    } else {
        let mut c = std::process::Command::new("tar");
        c.arg("-xf").arg(archive).arg("-C").arg(vers);
        c
    };
    c.creation_flags(0x0800_0000).status().is_ok_and(|s| s.success())
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
    // Import coupé avant la fin (app fermée) : ses fichiers, déjà sortis de leur dossier d'origine, sont rangés avec celui-ci.
    for e in std::fs::read_dir(&racine).into_iter().flatten().flatten() {
        let nom = e.file_name().to_string_lossy().into_owned();
        if nom.starts_with(".import-") && e.path() != travail {
            let _ = std::fs::rename(e.path(), travail.join(&nom[1..]));
        }
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
            if !decompresser(&p, &ici) {
                b.erreurs.push(format!("{nom} : archive abîmée ou incomplète, seule une partie a pu être sortie (re-télécharge-la, ou répare-la avec WinRAR)"));
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
    // Wii U décompressé : jeu dans Wii U\<nom>, MAJ et DLC dans Wii U\MAJ et DLC\<nom>. PS3 : PS3\<nom>.
    let dossier_wiiu = racine.join(CONSOLES.iter().find(|(id, _)| *id == "WiiU").unwrap().1);
    for d in wiiu {
        if !sans_liens(&d) {
            b.erreurs.push(format!("{} : contient des liens, ignoré", d.file_name().unwrap_or_default().to_string_lossy()));
            continue;
        }
        // Disque PS3 : PS3\<titre du jeu>.
        if let Some(info) = crate::ps3::infos(&d.join("PS3_GAME").join("PARAM.SFO").to_string_lossy()) {
            let nom = [nom_dossier(&info.0), nom_dossier(&info.1)].into_iter().find(|n| !n.is_empty()).unwrap_or_else(|| "Jeu PS3".into());
            let parent = racine.join(CONSOLES.iter().find(|(id, _)| *id == "PS3").unwrap().1);
            let _ = std::fs::create_dir_all(&parent);
            let cible = libre(&parent, &nom);
            if cible.parent() != Some(parent.as_path()) {
                b.erreurs.push(format!("{nom} : nom de jeu invalide"));
                continue;
            }
            match std::fs::rename(&d, &cible) {
                Ok(()) => b.ajoutes.push(("PS3".into(), cible.file_name().unwrap().to_string_lossy().into_owned())),
                Err(e) => b.erreurs.push(format!("{nom} : {e}")),
            }
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
    // Disques PlayStation en .cue : le .cue et ses pistes ensemble, dans PS1\<titre> ou PS2\<titre>.
    let cues: Vec<PathBuf> = fichiers.iter().filter(|f| f.extension().is_some_and(|e| e.eq_ignore_ascii_case("cue"))).cloned().collect();
    let mut pris = std::collections::HashSet::new();
    for cue in cues {
        let console = crate::retro::console_de(&cue).unwrap_or("PS1");
        let pistes: Vec<PathBuf> = crate::retro::pistes(&cue).into_iter().filter(|p| p.is_file()).collect();
        let stem = cue.file_stem().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
        let nom = Some(nom_dossier(&crate::retro::titre(&stem))).filter(|n| !n.is_empty()).unwrap_or_else(|| "Jeu".into());
        let parent = racine.join(CONSOLES.iter().find(|(id, _)| *id == console).unwrap().1);
        let cible = libre(&parent, &nom);
        if std::fs::create_dir_all(&cible).is_err() {
            b.erreurs.push(format!("{nom} : dossier impossible à créer"));
            continue;
        }
        for f in std::iter::once(&cue).chain(pistes.iter()) {
            if let Err(e) = std::fs::rename(f, cible.join(f.file_name().unwrap_or_default())) {
                b.erreurs.push(format!("{nom} : {e}"));
            }
            pris.insert(f.clone());
        }
        b.ajoutes.push((console.into(), nom));
    }
    // Autres fichiers : les jeux, MAJ et DLC reconnus vont à la racine, puis le rangement les place.
    for f in fichiers.into_iter().filter(|f| !pris.contains(f)) {
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
            // BIOS de la PS2 (souvent livré en archive) : installé, pas rangé avec les jeux.
            None if std::fs::metadata(&f).is_ok_and(|m| (1 << 20..=8 << 20).contains(&m.len())) && std::fs::read(&f).is_ok_and(|x| crate::retro::bios_ps2_valide(&x)) => {
                match crate::retro::poser_bios_ps2(&crate::emu("retroarch"), &f) {
                    Ok(_) => b.messages.push(format!("BIOS PS2 installé : {nom}")),
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
    #[test]
    fn noms_de_dossier_sans_chemin() {
        assert_eq!(nom_dossier("..\\..\\Windows"), "Windows");
        assert_eq!(nom_dossier(".."), "");
        assert_eq!(nom_dossier("C:/x\ty"), "Cxy");
        assert_eq!(nom_dossier("Demon's Souls"), "Demon's Souls");
    }
    #[test]
    fn cue_avec_ses_pistes() {
        let d = std::env::temp_dir().join(format!("enlocal-cue-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(d.join("src")).unwrap();
        std::fs::write(d.join("src").join("Crash Bandicoot (Europe).cue"), "FILE \"Crash Bandicoot (Europe).bin\" BINARY\n  TRACK 01 MODE2/2352\n").unwrap();
        std::fs::write(d.join("src").join("Crash Bandicoot (Europe).bin"), b"x").unwrap();
        let b = importer_dans(&d.join("Jeux"), &[d.join("src").to_string_lossy().into_owned()], &|_| None, &|_| {});
        assert_eq!(b.ajoutes, [("PS1".to_string(), "Crash Bandicoot".to_string())]);
        let jeu = d.join("Jeux").join("PS1").join("Crash Bandicoot");
        assert!(jeu.join("Crash Bandicoot (Europe).cue").is_file() && jeu.join("Crash Bandicoot (Europe).bin").is_file());
        assert_eq!(b.ignores, 0);
        let _ = std::fs::remove_dir_all(&d);
    }
    #[test]
    fn import_coupe_repris() {
        let d = std::env::temp_dir().join(format!("enlocal-coupe-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        let reste = d.join("Jeux").join(".import-1").join("0").join("Spyro");
        std::fs::create_dir_all(&reste).unwrap();
        std::fs::write(reste.join("Spyro (Europe).cue"), "FILE \"Spyro (Europe).bin\" BINARY\n  TRACK 01 MODE2/2352\n").unwrap();
        std::fs::write(reste.join("Spyro (Europe).bin"), b"x").unwrap();
        let b = importer_dans(&d.join("Jeux"), &[], &|_| None, &|_| {});
        assert_eq!(b.ajoutes, [("PS1".to_string(), "Spyro".to_string())]);
        assert!(!d.join("Jeux").join(".import-1").exists());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn disque_ps3() {
        let d = std::env::temp_dir().join(format!("enlocal-ps3-import-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        let jeu = d.join("src").join("BLES00932");
        std::fs::create_dir_all(jeu.join("PS3_GAME").join("USRDIR")).unwrap();
        std::fs::write(jeu.join("PS3_GAME").join("PARAM.SFO"), crate::ps3::tests::sfo_test()).unwrap();
        std::fs::write(jeu.join("PS3_GAME").join("USRDIR").join("EBOOT.BIN"), b"x").unwrap();
        let b = importer_dans(&d.join("Jeux"), &[jeu.to_string_lossy().into_owned()], &|_| None, &|_| {});
        assert_eq!(b.ajoutes, [("PS3".to_string(), "Demon's Souls".to_string())]);
        assert!(d.join("Jeux").join("PS3").join("Demon's Souls").join("PS3_GAME").join("USRDIR").join("EBOOT.BIN").is_file());
        let _ = std::fs::remove_dir_all(&d);
    }
    /// Import réel (tar.exe de Windows) dans un dossier de jeux de test :
    /// `cargo test --release -- --ignored import_reel`.
    /// Zip aux noms en ™ et 【】 : tout est décompressé (le tar de Windows en sautait).
    #[test]
    fn zip_noms_unicode() {
        let d = std::env::temp_dir().join(format!("enlocal-zip-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(d.join("src")).unwrap();
        let noms = ["Super Smash Bros.™ Ultimate - 【Pack 1】.nsp", "Super Smash Bros.™ Ultimate - 【Pack 2】.nsp", "Jeu.nsp"];
        for n in noms {
            std::fs::write(d.join("src").join(n), b"x").unwrap();
        }
        let zip = d.join("a.zip");
        let ok = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", "Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:S, $env:Z)"])
            .env("S", d.join("src")).env("Z", &zip).status().unwrap().success();
        assert!(ok);
        std::fs::create_dir_all(d.join("out")).unwrap();
        assert!(super::decompresser(&zip, &d.join("out")));
        for n in noms {
            assert!(d.join("out").join(n).is_file(), "{n} manquant");
        }
        let _ = std::fs::remove_dir_all(&d);
    }

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
