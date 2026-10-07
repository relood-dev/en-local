//! Dossier des jeux : un dossier par console, et le rangement des fichiers mal placés.
//! Switch : un dossier par jeu, avec ses MAJ et DLC.

use std::path::{Path, PathBuf};

pub const CONSOLES: [(&str, &str); 6] = [("Switch", "Switch"), ("3DS", "3DS"), ("WiiU", "Wii U"), ("Wii", "Wii"), ("GC", "GameCube"), ("DS", "DS")];
pub const MAJ: &str = "MAJ et DLC";

fn reglage() -> PathBuf {
    Path::new(crate::root()).join("data").join("dossier-jeux.txt")
}
/// Dossier choisi, sinon C:\EnLocal\Jeux.
pub fn jeux() -> PathBuf {
    std::fs::read_to_string(reglage()).ok().map(|s| PathBuf::from(s.trim())).filter(|p| p.is_absolute()).unwrap_or_else(|| Path::new(crate::root()).join("Jeux"))
}
pub fn switch() -> PathBuf {
    jeux().join("Switch")
}
/// Nom du dossier d'un jeu : celui du fichier, sans [title ID] ni (version).
fn nom_jeu(f: &Path) -> String {
    let stem = f.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let (mut out, mut dans) = (String::new(), 0u32);
    for c in stem.chars() {
        match c {
            '[' | '(' => dans += 1,
            ']' | ')' => dans = dans.saturating_sub(1),
            _ if dans == 0 => out.push(c),
            _ => {}
        }
    }
    let out = out.split_whitespace().collect::<Vec<_>>().join(" ").trim_end_matches(['.', ' ', '-']).to_string();
    if out.is_empty() { stem } else { out }
}

/// Texte d'explication posé dans chaque dossier.
fn lisez_moi(console: &str) -> &'static str {
    match console {
        "Switch" => "Tes jeux Switch (.nsp, .xci), sortis de ta console : un dossier par jeu.\r\nSes mises à jour et DLC (.nsp) : dans un sous-dossier de ce jeu (« MAJ et DLC »).\r\n",
        "3DS" => "Tes jeux 3DS (.3ds, .cci, .cia), sortis de ta console.\r\nMises à jour et DLC : dans « MAJ et DLC ».\r\n",
        "WiiU" => "Tes jeux Wii U : un dossier par jeu (code, content, meta), ou .wua / .wud / .wux.\r\nMises à jour et DLC : dans « MAJ et DLC ».\r\n",
        "Wii" => "Tes jeux Wii (.iso, .wbfs, .rvz), sortis de ta console.\r\n",
        "GC" => "Tes jeux GameCube (.iso, .rvz, .gcm), sortis de ta console.\r\n",
        _ => "Tes jeux DS (.nds), sortis de tes cartouches.\r\n",
    }
}

/// Crée un dossier par console. Ne touche à rien d'existant.
pub fn organiser(racine: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(racine)?;
    for (id, nom) in CONSOLES {
        let d = racine.join(nom);
        std::fs::create_dir_all(&d)?;
        if matches!(id, "3DS" | "WiiU") {
            std::fs::create_dir_all(d.join(MAJ))?;
        }
        let texte = d.join("Lisez-moi.txt");
        if !texte.exists() {
            std::fs::write(texte, lisez_moi(id))?;
        }
    }
    Ok(())
}

pub fn definir(chemin: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(chemin.trim());
    if !p.is_absolute() || chemin.contains('\n') {
        return Err("Chemin invalide".into());
    }
    if !crate::medias::dossier_permis(&p) {
        return Err("Choisis un dossier précis (pas un disque entier, ton dossier utilisateur ou un dossier de Windows).".into());
    }
    organiser(&p).map_err(|e| format!("Impossible de créer le dossier : {e}"))?;
    std::fs::create_dir_all(reglage().parent().unwrap()).map_err(|e| e.to_string())?;
    std::fs::write(reglage(), p.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
    Ok(p)
}

#[derive(serde::Serialize, Debug, PartialEq)]
pub struct Rangement {
    pub de: String,
    pub vers: String,
}

/// Place attendue d'un fichier : (console, MAJ ou DLC ?, title ID Switch).
/// La console vient de l'extension, MAJ/DLC du title ID.
pub type Classer<'a> = &'a dyn Fn(&Path) -> Option<(&'static str, bool, Option<u64>)>;

/// Fichiers mal placés : à la racine, chez une autre console, ou MAJ mêlée aux jeux.
/// Les jeux Wii U décompressés ne bougent pas (ils seraient incomplets).
pub fn a_ranger(racine: &Path, classer: Classer) -> Vec<Rangement> {
    let mut out = Vec::new();
    let mut fichiers = Vec::new();
    lister(racine, 4, &mut fichiers);
    let switch = racine.join("Switch");
    let classes: Vec<_> = fichiers.into_iter().filter_map(|f| classer(&f).map(|c| (f, c))).collect();
    // Dossier de jeu Switch (Switch\<jeu>) qui contient déjà ce fichier, s'il y en a un.
    let deja_dans = |f: &Path| f.ancestors().skip(1).find(|a| a.parent() == Some(switch.as_path()) && a.file_name().is_some_and(|n| n != MAJ)).map(Path::to_path_buf);
    // Title ID du jeu -> son dossier (les MAJ et DLC ont les mêmes bits hauts). D'abord les dossiers
    // qui existent déjà (créés par une MAJ ou un DLC arrivé avant le jeu), puis ceux des jeux.
    let mut dossiers: std::collections::HashMap<u64, PathBuf> = classes.iter()
        .filter(|(_, (c, _, _))| *c == "Switch")
        .filter_map(|(f, (_, _, id))| Some(((*id)? & !0x1FFF, deja_dans(f)?)))
        .collect();
    for (f, (c, maj, id)) in &classes {
        if *c == "Switch" && !maj {
            if let Some(id) = id {
                dossiers.entry(id & !0x1FFF).or_insert_with(|| switch.join(nom_jeu(f)));
            }
        }
    }
    // Dossier d'un jeu : celui où il est déjà, celui de ses MAJ et DLC, sinon Switch\<son nom>.
    let dossier_jeu = |f: &Path, id: Option<u64>| deja_dans(f).or_else(|| id.and_then(|x| dossiers.get(&(x & !0x1FFF)).cloned())).unwrap_or_else(|| switch.join(nom_jeu(f)));
    for (f, (console, maj, id)) in classes {
        let Some((_, nom)) = CONSOLES.iter().find(|(id, _)| *id == console) else { continue };
        let parent = f.parent().unwrap_or(racine);
        let dest = if console != "Switch" {
            let dest = if maj { racine.join(nom).join(MAJ) } else { racine.join(nom) };
            let dans_maj = parent.ancestors().any(|a| a.file_name().is_some_and(|n| n == MAJ));
            if parent.starts_with(&dest) && (maj || !dans_maj) {
                continue;
            }
            dest
        } else if !maj {
            dossier_jeu(&f, id)
        } else {
            // MAJ ou DLC : dans un sous-dossier de son jeu. Jeu pas encore là : son dossier est créé
            // (au nom du fichier), et le jeu le rejoindra en arrivant.
            let jeu = dossier_jeu(&f, id);
            if parent.starts_with(&jeu) && parent != jeu {
                continue;
            }
            jeu.join(MAJ)
        };
        if parent == dest {
            continue;
        }
        let Some(nom_fichier) = f.file_name() else { continue };
        let cible = dest.join(nom_fichier);
        if cible.exists() {
            continue;
        }
        out.push(Rangement { de: f.to_string_lossy().into_owned(), vers: cible.to_string_lossy().into_owned() });
    }
    out
}
fn lister(dir: &Path, profondeur: u32, out: &mut Vec<PathBuf>) {
    for e in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        let p = e.path();
        if p.is_dir() {
            if p.join("code").is_dir() || profondeur == 0 {
                continue;
            }
            lister(&p, profondeur - 1, out);
        } else {
            out.push(p);
        }
    }
}
/// Rend le nombre de fichiers déplacés.
pub fn ranger(liste: &[Rangement]) -> usize {
    liste.iter().filter(|r| {
        let vers = Path::new(&r.vers);
        vers.parent().is_some_and(|d| std::fs::create_dir_all(d).is_ok()) && !vers.exists() && std::fs::rename(&r.de, vers).is_ok()
    }).count()
}

/// Fenêtre Windows de choix de dossier, au-dessus d'En Local. Rend None si annulé.
pub fn selectionner(owner: isize, titre: &str) -> Option<String> {
    choisir(owner, titre, None)
}
/// Pareil pour un fichier. filtre : (nom, motif).
pub fn selectionner_fichier(owner: isize, titre: &str, filtre: (&str, &str)) -> Option<String> {
    choisir(owner, titre, Some(filtre))
}
fn choisir(owner: isize, titre: &str, filtre: Option<(&str, &str)>) -> Option<String> {
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
    use windows::Win32::UI::Shell::{FileOpenDialog, IFileOpenDialog, FOS_FILEMUSTEXIST, FOS_FORCEFILESYSTEM, FOS_PICKFOLDERS, SIGDN_FILESYSPATH};
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let d: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).ok()?;
        match filtre {
            None => d.SetOptions(d.GetOptions().ok()? | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM).ok()?,
            Some((nom, motif)) => {
                d.SetOptions(d.GetOptions().ok()? | FOS_FILEMUSTEXIST | FOS_FORCEFILESYSTEM).ok()?;
                let (n, m) = (HSTRING::from(nom), HSTRING::from(motif));
                d.SetFileTypes(&[COMDLG_FILTERSPEC { pszName: PCWSTR(n.as_ptr()), pszSpec: PCWSTR(m.as_ptr()) }]).ok()?;
            }
        }
        d.SetTitle(&HSTRING::from(titre)).ok()?;
        d.Show(HWND(owner as _)).ok()?;
        let p = d.GetResult().ok()?.GetDisplayName(SIGDN_FILESYSPATH).ok()?;
        let chemin = p.to_string().ok();
        CoTaskMemFree(Some(p.0 as _));
        chemin
    }
}

/// Fenêtre Windows de choix de plusieurs fichiers (jeux et archives). Rend la liste, vide si annulé.
pub fn selectionner_plusieurs(owner: isize, titre: &str) -> Vec<String> {
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
    use windows::Win32::UI::Shell::{FileOpenDialog, IFileOpenDialog, FOS_ALLOWMULTISELECT, FOS_FILEMUSTEXIST, FOS_FORCEFILESYSTEM, SIGDN_FILESYSPATH};
    let mut out = Vec::new();
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let Ok(d) = CoCreateInstance::<_, IFileOpenDialog>(&FileOpenDialog, None, CLSCTX_INPROC_SERVER) else { return out };
        let Ok(o) = d.GetOptions() else { return out };
        let _ = d.SetOptions(o | FOS_ALLOWMULTISELECT | FOS_FILEMUSTEXIST | FOS_FORCEFILESYSTEM);
        let (n, m) = (HSTRING::from("Jeux et archives"), HSTRING::from("*.zip;*.7z;*.rar;*.nsp;*.nsz;*.xci;*.xcz;*.3ds;*.cci;*.cia;*.nds;*.iso;*.rvz;*.wbfs;*.gcm;*.wua;*.wud;*.wux"));
        let (n2, m2) = (HSTRING::from("Tous les fichiers"), HSTRING::from("*.*"));
        let _ = d.SetFileTypes(&[COMDLG_FILTERSPEC { pszName: PCWSTR(n.as_ptr()), pszSpec: PCWSTR(m.as_ptr()) }, COMDLG_FILTERSPEC { pszName: PCWSTR(n2.as_ptr()), pszSpec: PCWSTR(m2.as_ptr()) }]);
        let _ = d.SetTitle(&HSTRING::from(titre));
        if d.Show(HWND(owner as _)).is_err() {
            return out;
        }
        let Ok(items) = d.GetResults() else { return out };
        for i in 0..items.GetCount().unwrap_or(0) {
            if let Ok(p) = items.GetItemAt(i).and_then(|it| it.GetDisplayName(SIGDN_FILESYSPATH)) {
                if let Ok(t) = p.to_string() {
                    out.push(t);
                }
                CoTaskMemFree(Some(p.0 as _));
            }
        }
    }
    out
}

/// Disques du PC (lettre, Go libres, Go au total).
#[derive(serde::Serialize)]
pub struct Disque {
    pub lettre: String,
    pub libre: u64,
    pub total: u64,
}
pub fn disques() -> Vec<Disque> {
    use windows::Win32::Storage::FileSystem::{GetDiskFreeSpaceExW, GetDriveTypeW};
    let mut out = Vec::new();
    for l in b'C'..=b'Z' {
        let racine: Vec<u16> = format!("{}:\\", l as char).encode_utf16().chain([0]).collect();
        let p = windows::core::PCWSTR(racine.as_ptr());
        // 3 : disque fixe (pas USB ni réseau).
        if unsafe { GetDriveTypeW(p) } != 3 {
            continue;
        }
        let (mut libre, mut total) = (0u64, 0u64);
        if unsafe { GetDiskFreeSpaceExW(p, Some(&mut libre), Some(&mut total), None) }.is_ok() {
            out.push(Disque { lettre: (l as char).to_string(), libre: libre >> 30, total: total >> 30 });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn organisation_et_rangement() {
        let r = std::env::temp_dir().join("enlocal-dossier-jeux");
        let _ = std::fs::remove_dir_all(&r);
        organiser(&r).unwrap();
        assert!(r.join("3DS").join(MAJ).is_dir() && r.join("GameCube").is_dir() && r.join("DS").join("Lisez-moi.txt").exists());
        assert!(!r.join("DS").join(MAJ).exists() && !r.join("Switch").join(MAJ).exists());
        for d in ["Switch/Kart/MAJ", "Switch/Smash/DLC et MAJ"] {
            std::fs::create_dir_all(r.join(d)).unwrap();
        }
        for f in [
            "Smash [01006A800016E000].nsp", "Smash [01006A800016E800].nsp", "Switch/Zelda (v0).nsp", "Switch/Zelda [01007EF00011E800].nsp", "3DS/Mario.nds", "Melee.iso", "notes.txt",
            // Déjà rangés : on n'y touche pas.
            "Switch/Kart/Kart [0100152000022000].nsp", "Switch/Kart/MAJ/Kart [0100152000022800].nsp", "Switch/Smash/DLC et MAJ/Joker [01006A800016F001].nsp",
            "Switch/Kart/Pack [0100152000023001].nsp",
        ] {
            std::fs::write(r.join(f), b"x").unwrap();
        }
        std::fs::create_dir_all(r.join("Wii U").join("Zelda").join("code")).unwrap();
        let classer = |p: &Path| -> Option<(&'static str, bool, Option<u64>)> {
            let n = p.file_name()?.to_string_lossy().to_string();
            let id = n.split('[').nth(1).and_then(|x| u64::from_str_radix(&x[..16], 16).ok());
            match p.extension()?.to_str()? {
                "nsp" => Some(("Switch", id.is_some_and(|x| x & 0x800 != 0 || (x >> 12) & 1 == 1), id)),
                "nds" => Some(("DS", false, None)),
                "iso" => Some(("GC", false, None)),
                _ => None,
            }
        };
        let mut l = a_ranger(&r, &classer);
        l.sort_by(|a, b| a.de.cmp(&b.de));
        let court = |s: &str| s.strip_prefix(&*r.to_string_lossy()).unwrap().replace('\\', "/");
        let paires: Vec<(String, String)> = l.iter().map(|x| (court(&x.de), court(&x.vers))).collect();
        assert_eq!(paires, [
            ("/3DS/Mario.nds".into(), "/DS/Mario.nds".into()),
            ("/Melee.iso".into(), "/GameCube/Melee.iso".into()),
            ("/Smash [01006A800016E000].nsp".into(), "/Switch/Smash/Smash [01006A800016E000].nsp".into()),
            ("/Smash [01006A800016E800].nsp".into(), format!("/Switch/Smash/{MAJ}/Smash [01006A800016E800].nsp")),
            ("/Switch/Kart/Pack [0100152000023001].nsp".into(), format!("/Switch/Kart/{MAJ}/Pack [0100152000023001].nsp")),
            ("/Switch/Zelda (v0).nsp".into(), "/Switch/Zelda/Zelda (v0).nsp".into()),
            // MAJ sans son jeu : le dossier du jeu est créé.
            ("/Switch/Zelda [01007EF00011E800].nsp".into(), format!("/Switch/Zelda/{MAJ}/Zelda [01007EF00011E800].nsp")),
        ]);
        assert_eq!(ranger(&l), 7);
        assert!(a_ranger(&r, &classer).is_empty());
        // Le jeu arrive après sa MAJ, sous un autre nom : il rejoint le dossier créé pour elle.
        std::fs::write(r.join("Breath of the Wild [01007EF00011E000].nsp"), b"x").unwrap();
        let l = a_ranger(&r, &classer);
        assert_eq!(l.iter().map(|x| court(&x.vers)).collect::<Vec<_>>(), ["/Switch/Zelda/Breath of the Wild [01007EF00011E000].nsp"]);
    }
}
