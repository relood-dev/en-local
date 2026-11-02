//! Figurines posées depuis le menu HOME : amiibo (Switch, 3DS) et Skylanders (Wii).
//! Ce sont les fichiers du joueur, dans Médias\Amiibo (.bin) et Médias\Skylanders (.sky) :
//! En Local n'en fournit aucun. L'émulateur suit le fichier data\<sorte>.txt (un chemin par ligne).
use std::collections::HashMap;
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

/// Identifiant d'un amiibo (tête et queue, 16 chiffres hexa) : à 0x54 dans une copie de la puce,
/// à 0x1DC dans une copie déchiffrée (amiitool).
fn id_amiibo(p: &Path) -> Option<String> {
    let b = std::fs::read(p).ok()?;
    if !(520..=1024).contains(&b.len()) {
        return None;
    }
    let id = [0x54, 0x1DC].into_iter().map(|o| &b[o..o + 8]).find(|x| x.iter().any(|&v| v != 0))?;
    Some(id.iter().map(|x| format!("{x:02x}")).collect())
}
/// « Bob (5d0001005505, Decrypted) » : Bob.
fn nom_amiibo(nom: &str) -> String {
    nom.split(" (").next().unwrap_or(nom).trim().to_string()
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
    let images = if amiibo { HashMap::new() } else { images_skylanders() };
    let liste: Vec<serde_json::Value> = l
        .iter()
        .filter_map(|p| {
            let nom = p.file_stem()?.to_string_lossy().into_owned();
            let chemin = p.to_string_lossy().into_owned();
            if amiibo {
                return Some(serde_json::json!({ "chemin": chemin, "nom": nom_amiibo(&nom), "id": id_amiibo(p)? }));
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
            // Image de la figurine : « <nom>.jpg » (ou .png, .webp) à côté de son .sky, sinon celle du pack
            // d'images (même figurine, sinon même personnage dans une autre variante).
            let image = ["jpg", "png", "webp"].iter().map(|e| p.with_extension(e)).find(|i| i.is_file())
                .or_else(|| {
                    let (perso, variante) = id_skylander(p)?;
                    images.get(&format!("{perso}_{variante}")).or_else(|| images.get(&perso.to_string())).cloned()
                })
                .map(|i| i.to_string_lossy().into_owned());
            Some(serde_json::json!({ "chemin": chemin, "nom": nom, "jeu": jeu, "element": element, "symbole": symbole, "image": image }))
        })
        .collect();
    serde_json::json!({ "figurines": liste, "posters": posters, "dossier": racine.to_string_lossy() })
}

/// Tous les amiibo sortis (AmiiboAPI), gardés une semaine dans data : la collection montre ceux qui manquent.
/// `jeux` : title ID des jeux (Switch, 3DS, Wii U, en majuscules) qui le lisent, avec ce qu'il y fait.
#[tauri::command]
pub async fn amiibo_catalogue() -> Vec<serde_json::Value> {
    tauri::async_runtime::spawn_blocking(|| {
        let f = PathBuf::from(chemin!("{}\\data\\amiibo-usages.json", crate::root()));
        let frais = std::fs::metadata(&f).ok().and_then(|m| m.modified().ok()).and_then(|t| t.elapsed().ok()).is_some_and(|d| d.as_secs() < 7 * 86400);
        if !frais {
            use crate::plateforme::SansFenetre;
            let tmp = f.with_extension("tmp");
            let ok = std::process::Command::new(crate::plateforme::CURL).args(["-fsSL", "--max-time", "60", "-o"]).arg(&tmp).arg("https://amiiboapi.org/api/amiibo/?showusage").sans_fenetre().status().is_ok_and(|s| s.success());
            if ok {
                let _ = std::fs::rename(&tmp, &f);
            }
        }
        let v: serde_json::Value = std::fs::read(&f).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        let texte = |a: &serde_json::Value, k: &str| a[k].as_str().unwrap_or_default().to_string();
        let jeux = |a: &serde_json::Value| {
            let mut m = serde_json::Map::new();
            for g in ["gamesSwitch", "games3DS", "gamesWiiU"].iter().filter_map(|k| a[*k].as_array()).flatten() {
                let usage = g["amiiboUsage"].as_array().map(|u| u.iter().filter_map(|x| x["Usage"].as_str()).collect::<Vec<_>>().join(" / ")).unwrap_or_default();
                for id in g["gameID"].as_array().into_iter().flatten().filter_map(|x| x.as_str()) {
                    m.insert(id.to_uppercase(), usage.clone().into());
                }
            }
            m
        };
        v["amiibo"].as_array().map(|l| l.iter().map(|a| serde_json::json!({
            "id": format!("{}{}", texte(a, "head"), texte(a, "tail")).to_lowercase(),
            "nom": texte(a, "name"), "serie": texte(a, "amiiboSeries"), "image": texte(a, "image"), "sorte": texte(a, "type"), "jeux": jeux(a),
        })).collect()).unwrap_or_default()
    })
    .await
    .unwrap_or_default()
}

/// Pack d'images des Skylanders (portalsync-pictures : illustrations rassemblées par des fans, 96×96,
/// « <personnage>_<variante>.png »), téléchargé une fois dans data.
fn dossier_images_sky() -> PathBuf {
    crate::maison::dossier("skylanders-images")
}
/// « 105_4096 » -> image, et « 105 » -> une image du personnage (la plus petite variante).
fn images_skylanders() -> HashMap<String, PathBuf> {
    let mut l: Vec<PathBuf> = std::fs::read_dir(dossier_images_sky()).into_iter().flatten().flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|e| e == "png")).collect();
    l.sort();
    let mut m = HashMap::new();
    for p in l {
        let Some(nom) = p.file_stem().map(|n| n.to_string_lossy().into_owned()) else { continue };
        if let Some((perso, _)) = nom.split_once('_') {
            m.entry(perso.to_string()).or_insert_with(|| p.clone());
        }
        m.insert(nom, p);
    }
    m
}
/// Personnage et variante d'une figurine, en clair dans le premier secteur de sa copie (.sky).
fn id_skylander(p: &Path) -> Option<(u16, u16)> {
    use std::io::Read;
    let mut b = [0u8; 0x20];
    std::fs::File::open(p).ok()?.read_exact(&mut b).ok()?;
    Some((u16::from_le_bytes([b[0x10], b[0x11]]), u16::from_le_bytes([b[0x1C], b[0x1D]])))
}
/// Télécharge le pack d'images s'il manque. true : il vient d'arriver (la collection se relit).
#[tauri::command]
pub async fn skylanders_images() -> bool {
    tauri::async_runtime::spawn_blocking(|| {
        use crate::plateforme::SansFenetre;
        let d = dossier_images_sky();
        if !images_skylanders().is_empty() {
            return false;
        }
        let tmp = std::env::temp_dir().join("enlocal-skylanders-images");
        let _ = std::fs::remove_dir_all(&tmp);
        let _ = std::fs::create_dir_all(&tmp);
        let z = tmp.join("thumbnails.zip");
        let ok = std::process::Command::new(crate::plateforme::CURL)
            .args(["-fsSL", "--max-time", "120", "-o"]).arg(&z).arg("https://github.com/rhsts/portalsync-pictures/releases/download/pictures-1/thumbnails.zip")
            .sans_fenetre().status().is_ok_and(|s| s.success())
            && std::process::Command::new("tar").arg("-xf").arg(&z).arg("-C").arg(&tmp).sans_fenetre().status().is_ok_and(|s| s.success());
        if !ok {
            return false;
        }
        let _ = std::fs::create_dir_all(&d);
        let mut n = 0;
        for e in std::fs::read_dir(tmp.join("thumbnails")).into_iter().flatten().flatten() {
            let nom = e.file_name().to_string_lossy().into_owned();
            // Seulement « 123_456.png ».
            let propre = nom.strip_suffix(".png").is_some_and(|x| x.split('_').count() == 2 && x.split('_').all(|c| !c.is_empty() && c.bytes().all(|b| b.is_ascii_digit())));
            if propre && std::fs::rename(e.path(), d.join(&nom)).or_else(|_| std::fs::copy(e.path(), d.join(&nom)).map(|_| ())).is_ok() {
                n += 1;
            }
        }
        let _ = std::fs::remove_dir_all(&tmp);
        n > 0
    })
    .await
    .unwrap_or(false)
}

/// Notre Cemu (forks/cemu-skylanders.patch) pilote le portail Skylanders : repère posé par sa compilation.
#[tauri::command]
pub fn cemu_portail() -> bool {
    Path::new(&crate::cemu()).join("enlocal-skylanders.txt").is_file()
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
        let mut dechiffre = vec![0u8; 540];
        dechiffre[0x1DC..0x1E4].copy_from_slice(&[2, 0x5d, 0, 1, 0, 0x55, 5, 2]);
        std::fs::write(&d, &dechiffre).unwrap();
        assert_eq!(super::id_amiibo(&d).as_deref(), Some("025d000100550502"));
        assert_eq!(super::nom_amiibo("Bob (5d0001005505, Decrypted)"), "Bob");
        std::fs::write(&d, [0u8; 100]).unwrap();
        assert_eq!(super::id_amiibo(&d), None);
        let _ = std::fs::remove_file(d);
    }
}
