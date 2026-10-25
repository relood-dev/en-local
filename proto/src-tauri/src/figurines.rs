//! Figurines posées depuis le menu HOME : amiibo (Switch, 3DS) et Skylanders (Wii).
//! Ce sont les fichiers du joueur, dans Médias\Amiibo (.bin) et Médias\Skylanders (.sky) :
//! En Local n'en fournit aucun. L'émulateur suit le fichier data\<sorte>.txt (un chemin par ligne).
use std::path::{Path, PathBuf};

pub fn dossier(sorte: &str) -> PathBuf {
    crate::medias::racine().join(if sorte == "amiibo" { "Amiibo" } else { "Skylanders" })
}
pub fn fichier(sorte: &str) -> String {
    chemin!("{}\\data\\{sorte}.txt", crate::root())
}
/// Au lancement d'un jeu : rien sur le lecteur ni sur le portail.
pub fn vider() {
    for s in ["amiibo", "skylanders"] {
        let _ = std::fs::write(fichier(s), "");
    }
}

/// Identifiant d'un amiibo (tête et queue, 16 chiffres hexa), lu à 0x54 dans la copie de la puce.
fn id_amiibo(p: &Path) -> Option<String> {
    let b = std::fs::read(p).ok()?;
    if !(532..=1024).contains(&b.len()) {
        return None;
    }
    Some(b[0x54..0x5c].iter().map(|x| format!("{x:02x}")).collect())
}

fn parcourir(d: &Path, ext: &str, profondeur: u32, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(d) else { return };
    let mut l: Vec<PathBuf> = rd.flatten().map(|e| e.path()).collect();
    l.sort();
    for p in l {
        if out.len() >= 3000 {
            return;
        }
        if p.is_dir() && profondeur > 0 {
            parcourir(&p, ext, profondeur - 1, out);
        } else if p.extension().is_some_and(|x| x.eq_ignore_ascii_case(ext)) {
            out.push(p);
        }
    }
}

/// Première image d'un dossier dont le nom contient `mot` (poster du jeu, symbole d'élément).
fn image(d: &Path, mot: &str) -> Option<String> {
    let mut l: Vec<PathBuf> = std::fs::read_dir(d).ok()?.flatten().map(|e| e.path()).collect();
    l.sort();
    l.into_iter()
        .find(|p| {
            let n = p.file_name().map(|x| x.to_string_lossy().to_lowercase()).unwrap_or_default();
            n.contains(mot) && (n.ends_with(".png") || n.ends_with(".jpg"))
        })
        .map(|p| p.to_string_lossy().into_owned())
}

/// Les figurines du joueur. Skylanders : rangées par dossier de jeu, puis d'élément (comme les
/// copies habituelles), avec le poster du jeu et le symbole de l'élément s'ils y sont.
#[tauri::command]
pub fn figurines(sorte: String) -> serde_json::Value {
    let sorte = if sorte == "amiibo" { sorte } else { "skylanders".into() };
    let racine = dossier(&sorte);
    let _ = std::fs::create_dir_all(&racine);
    let amiibo = sorte == "amiibo";
    let mut l = Vec::new();
    parcourir(&racine, if amiibo { "bin" } else { "sky" }, 4, &mut l);
    let mut posters = serde_json::Map::new();
    let liste: Vec<serde_json::Value> = l
        .iter()
        .filter_map(|p| {
            let nom = p.file_stem()?.to_string_lossy().into_owned();
            let chemin = p.to_string_lossy().into_owned();
            if amiibo {
                return Some(serde_json::json!({ "chemin": chemin, "nom": nom, "id": id_amiibo(p)? }));
            }
            let parties: Vec<String> = p.strip_prefix(&racine).ok()?.parent()?.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect();
            let jeu = parties.first().cloned().unwrap_or_default();
            if !jeu.is_empty() && !posters.contains_key(&jeu) {
                if let Some(i) = image(&racine.join(&jeu), "poster") {
                    posters.insert(jeu.clone(), i.into());
                }
            }
            // « Fire/Alternate types » : l'élément reste Fire.
            let element = parties.get(1).cloned().unwrap_or_default();
            let symbole = (!element.is_empty()).then(|| image(&racine.join(&jeu).join(&element), "symbol")).flatten();
            Some(serde_json::json!({ "chemin": chemin, "nom": nom, "jeu": jeu, "element": element, "symbole": symbole }))
        })
        .collect();
    serde_json::json!({ "figurines": liste, "posters": posters, "dossier": racine.to_string_lossy() })
}

/// Pose ces figurines (aucune : tout est retiré). Seulement des fichiers du dossier du joueur.
#[tauri::command]
pub fn figurines_poser(sorte: String, chemins: Vec<String>) -> Result<(), String> {
    // `sorte` sert au nom du fichier écrit dans data : seulement les deux connues.
    if !["amiibo", "skylanders"].contains(&sorte.as_str()) {
        return Err("sorte inconnue".into());
    }
    let racine = std::fs::canonicalize(dossier(&sorte)).map_err(|e| e.to_string())?;
    let ext = if sorte == "amiibo" { "bin" } else { "sky" };
    for c in &chemins {
        let p = std::fs::canonicalize(c).map_err(|_| "Fichier introuvable".to_string())?;
        if !p.starts_with(&racine) || !p.extension().is_some_and(|x| x.eq_ignore_ascii_case(ext)) || c.contains('\n') {
            return Err("Fichier refusé".into());
        }
    }
    let f = fichier(&sorte);
    let tmp = format!("{f}.tmp");
    std::fs::write(&tmp, chemins.join("\n")).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &f).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn id_des_amiibo() {
        let d = std::env::temp_dir().join("enlocal-amiibo-test.bin");
        let mut b = vec![0u8; 540];
        b[0x54..0x5c].copy_from_slice(&[0, 0, 0, 0, 0, 0x34, 1, 2]);
        std::fs::write(&d, &b).unwrap();
        assert_eq!(super::id_amiibo(&d).as_deref(), Some("0000000000340102"));
        assert!(super::figurines_poser(r"..\..\x".into(), vec![]).is_err());
        std::fs::write(&d, [0u8; 100]).unwrap();
        assert_eq!(super::id_amiibo(&d), None);
        let _ = std::fs::remove_file(d);
    }
}
