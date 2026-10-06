// Côté machine de l'accueil : icônes des jeux, images posées et captures.
// L'interface ne lit que data\home et data\captures (protocole asset).
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::ipc::{InvokeBody, Request, Response};

pub fn dossier(nom: &str) -> PathBuf {
    let d = PathBuf::from(crate::root()).join("data").join(nom);
    let _ = std::fs::create_dir_all(&d);
    d
}

/// Chemin sans le préfixe \\?\, pour le protocole asset.
pub fn propre(p: &Path) -> String {
    let p = std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf());
    p.to_string_lossy().trim_start_matches(r"\\?\").to_string()
}

/// Dossiers lisibles par l'interface, avec leur vrai chemin.
pub fn dossiers_lisibles() -> Vec<PathBuf> {
    ["home", "captures", "jaquettes", "sprites", "miniatures"].iter().flat_map(|n| {
        let d = dossier(n);
        let vrai = PathBuf::from(propre(&d));
        [d, vrai]
    }).collect()
}

/* ---------- Icônes des jeux ---------- */

/// Icône lue dans le jeu : [largeur u16][hauteur u16][RGBA]. Vide si elle est chiffrée.
pub fn icone(path: &str, console: &str) -> Response {
    let img = match console {
        "DS" => icone_ds(path),
        "3DS" => icone_3ds(path),
        "WiiU" => icone_wiiu(path),
        _ => None,
    };
    Response::new(img.map(|(w, h, px)| {
        let mut out = Vec::with_capacity(4 + px.len());
        out.extend((w as u16).to_le_bytes());
        out.extend((h as u16).to_le_bytes());
        out.extend(px);
        out
    }).unwrap_or_default())
}

/// DS : icône 32×32 de la bannière, 4 bits par pixel, palette de 16 couleurs.
fn icone_ds(path: &str) -> Option<(usize, usize, Vec<u8>)> {
    let mut f = std::fs::File::open(path).ok()?;
    let mut hdr = [0u8; 0x6C];
    f.read_exact(&mut hdr).ok()?;
    let banniere = u32::from_le_bytes(hdr[0x68..0x6C].try_into().ok()?) as u64;
    if banniere == 0 {
        return None;
    }
    let mut b = vec![0u8; 0x240];
    f.seek(SeekFrom::Start(banniere)).and_then(|_| f.read_exact(&mut b)).ok()?;
    Some((32, 32, ds_pixels(&b[0x20..0x220], &b[0x220..0x240])))
}

fn ds_pixels(bitmap: &[u8], palette: &[u8]) -> Vec<u8> {
    let couleur = |k: usize| -> [u8; 4] {
        if k == 0 {
            return [0, 0, 0, 0];
        }
        let c = u16::from_le_bytes([palette[k * 2], palette[k * 2 + 1]]);
        let v = |s: u16| (((c >> s) & 31) as u32 * 255 / 31) as u8;
        [v(0), v(5), v(10), 255]
    };
    let mut px = vec![0u8; 32 * 32 * 4];
    for (n, octet) in bitmap.iter().enumerate() {
        let (tuile, dans) = (n / 32, n % 32);
        let (tx, ty) = (tuile % 4, tuile / 4);
        let (y, x) = (ty * 8 + dans / 4, tx * 8 + (dans % 4) * 2);
        for (d, k) in [(0, (octet & 15) as usize), (1, (octet >> 4) as usize)] {
            let i = (y * 32 + x + d) * 4;
            px[i..i + 4].copy_from_slice(&couleur(k));
        }
    }
    px
}

/// 3DS décryptée : icône 48×48 du SMDH, RGB565, tuiles en ordre Morton.
fn icone_3ds(path: &str) -> Option<(usize, usize, Vec<u8>)> {
    let mut f = std::fs::File::open(path).ok()?;
    let mut ncsd = [0u8; 0x200];
    f.read_exact(&mut ncsd).ok()?;
    if &ncsd[0x100..0x104] != b"NCSD" {
        return None;
    }
    let ncch = u32::from_le_bytes(ncsd[0x120..0x124].try_into().ok()?) as u64 * 0x200;
    let mut n = [0u8; 0x200];
    f.seek(SeekFrom::Start(ncch)).and_then(|_| f.read_exact(&mut n)).ok()?;
    let exefs = ncch + u32::from_le_bytes(n[0x1A0..0x1A4].try_into().ok()?) as u64 * 0x200;
    let mut tete = [0u8; 0xA0];
    f.seek(SeekFrom::Start(exefs)).and_then(|_| f.read_exact(&mut tete)).ok()?;
    let entree = tete.chunks_exact(16).find(|e| &e[..5] == b"icon\0")?;
    let off = u32::from_le_bytes(entree[8..12].try_into().ok()?) as u64;
    let mut smdh = vec![0u8; 0x36C0];
    f.seek(SeekFrom::Start(exefs + 0x200 + off)).and_then(|_| f.read_exact(&mut smdh)).ok()?;
    if &smdh[..4] != b"SMDH" {
        return None;
    }
    Some((48, 48, smdh_pixels(&smdh[0x24C0..0x24C0 + 48 * 48 * 2])))
}

fn smdh_pixels(data: &[u8]) -> Vec<u8> {
    let mut px = vec![0u8; 48 * 48 * 4];
    for tuile in 0..36 {
        let (tx, ty) = (tuile % 6, tuile / 6);
        for i in 0..64usize {
            let x = (i & 1) | ((i >> 1) & 2) | ((i >> 2) & 4);
            let y = ((i >> 1) & 1) | ((i >> 2) & 2) | ((i >> 3) & 4);
            let k = (tuile * 64 + i) * 2;
            let c = u16::from_le_bytes([data[k], data[k + 1]]);
            let (r, g, b) = ((c >> 11) & 31, (c >> 5) & 63, c & 31);
            let p = ((ty * 8 + y) * 48 + tx * 8 + x) * 4;
            px[p..p + 4].copy_from_slice(&[(r as u32 * 255 / 31) as u8, (g as u32 * 255 / 63) as u8, (b as u32 * 255 / 31) as u8, 255]);
        }
    }
    px
}

/// Wii U décompressé : meta\iconTex.tga.
fn icone_wiiu(rpx: &str) -> Option<(usize, usize, Vec<u8>)> {
    let tga = std::fs::read(Path::new(rpx).parent()?.parent()?.join("meta").join("iconTex.tga")).ok()?;
    tga_pixels(&tga)
}

fn tga_pixels(t: &[u8]) -> Option<(usize, usize, Vec<u8>)> {
    let (id, genre) = (*t.first()? as usize, *t.get(2)?);
    let (w, h) = (u16::from_le_bytes([t[12], t[13]]) as usize, u16::from_le_bytes([t[14], t[15]]) as usize);
    let (bpp, desc) = (*t.get(16)? as usize / 8, *t.get(17)?);
    if !(genre == 2 || genre == 10) || !(bpp == 3 || bpp == 4) || w == 0 || h == 0 || w > 1024 || h > 1024 {
        return None;
    }
    let mut src = &t[18 + id..];
    let mut brut = Vec::with_capacity(w * h * bpp);
    if genre == 2 {
        brut.extend_from_slice(src.get(..w * h * bpp)?);
    } else {
        while brut.len() < w * h * bpp {
            let (&tete, reste) = src.split_first()?;
            let n = (tete & 0x7F) as usize + 1;
            if tete & 0x80 != 0 {
                let p = reste.get(..bpp)?;
                (0..n).for_each(|_| brut.extend_from_slice(p));
                src = &reste[bpp..];
            } else {
                brut.extend_from_slice(reste.get(..n * bpp)?);
                src = &reste[n * bpp..];
            }
        }
    }
    let haut_en_bas = desc & 0x20 != 0;
    let mut px = vec![0u8; w * h * 4];
    for y in 0..h {
        let ligne = if haut_en_bas { y } else { h - 1 - y };
        for x in 0..w {
            let s = (ligne * w + x) * bpp;
            let d = (y * w + x) * 4;
            px[d..d + 4].copy_from_slice(&[brut[s + 2], brut[s + 1], brut[s], if bpp == 4 { brut[s + 3] } else { 255 }]);
        }
    }
    Some((w, h, px))
}

/* ---------- Images de l'accueil et captures ---------- */

fn maintenant_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis())
}

fn entete<'a>(r: &'a Request, nom: &str) -> Option<&'a str> {
    r.headers().get(nom)?.to_str().ok()
}

fn decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Nom de fichier sûr pour Windows.
fn sur(s: &str) -> String {
    let s: String = s.chars().map(|c| if r#"\/:*?"<>|"#.contains(c) || c.is_control() { ' ' } else { c }).collect();
    let s = s.trim().trim_matches('.').to_string();
    if s.is_empty() { "Jeu".into() } else { s.chars().take(80).collect() }
}

/// Copie une image dans data\home. En-tête « ext » : png, jpg, jpeg, webp ou gif.
pub fn garder_image(r: Request) -> Result<String, String> {
    let ext = entete(&r, "ext").unwrap_or("").to_ascii_lowercase();
    if !["png", "jpg", "jpeg", "webp", "gif"].contains(&ext.as_str()) {
        return Err("Format non pris en charge (PNG, JPG, WEBP ou GIF).".into());
    }
    let InvokeBody::Raw(octets) = r.body() else { return Err("image manquante".into()) };
    if octets.is_empty() || octets.len() > 60 << 20 {
        return Err("Image vide ou trop lourde (60 Mo au plus).".into());
    }
    let f = dossier("home").join(format!("{}.{ext}", maintenant_ms()));
    std::fs::write(&f, octets).map_err(|e| e.to_string())?;
    Ok(propre(&f))
}

/// Image prise à l'appui sur le bouton de partage, avant le menu de capture.
static PHOTO: std::sync::Mutex<Option<Vec<u8>>> = std::sync::Mutex::new(None);
pub fn garder_photo() {
    *PHOTO.lock().unwrap() = crate::embed::capture();
}
pub fn poser_photo(img: Vec<u8>) {
    *PHOTO.lock().unwrap() = (img.len() > 4).then_some(img);
}

pub fn capturer(r: Request) -> Result<String, String> {
    let jeu = sur(&decode(entete(&r, "jeu").unwrap_or("Jeu")));
    let png = match r.body() {
        InvokeBody::Raw(o) if !o.is_empty() => o.clone(),
        _ => {
            let gardee = PHOTO.lock().unwrap().take();
            let img = gardee.or_else(crate::embed::capture).ok_or("rien à capturer")?;
            let (w, h) = (u16::from_le_bytes([img[0], img[1]]) as u32, u16::from_le_bytes([img[2], img[3]]) as u32);
            encoder_png(w, h, &img[4..])?
        }
    };
    let d = dossier_captures().join(&jeu);
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    let f = d.join(format!("{}.png", maintenant_ms()));
    std::fs::write(&f, png).map_err(|e| e.to_string())?;
    Ok(propre(&f))
}

fn encoder_png(w: u32, h: u32, rgba: &[u8]) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    let mut enc = png::Encoder::new(&mut out, w, h);
    enc.set_color(png::ColorType::Rgba);
    enc.set_depth(png::BitDepth::Eight);
    let mut wr = enc.write_header().map_err(|e| e.to_string())?;
    wr.write_image_data(rgba).map_err(|e| e.to_string())?;
    drop(wr);
    Ok(out)
}

#[derive(serde::Serialize)]
pub struct Capture {
    path: String,
    jeu: String,
    t: u64,
}

/// Dossier des captures : celui choisi, sinon data\captures.
pub fn dossier_captures() -> PathBuf {
    let d = crate::medias::choisi("captures").unwrap_or_else(|| dossier("captures"));
    let _ = std::fs::create_dir_all(&d);
    d
}

/// Toutes les captures, les plus récentes d'abord.
pub fn captures() -> Vec<Capture> {
    let racine = dossier_captures();
    let mut fichiers = Vec::new();
    images_sous(&racine, 3, &mut fichiers);
    let mut out: Vec<Capture> = fichiers
        .into_iter()
        .filter_map(|p| {
            let jeu = p.parent().filter(|d| *d != racine).and_then(|d| d.file_name()).map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "Photos".into());
            let t = p.file_stem()?.to_str()?.parse::<u64>().ok().filter(|t| *t > 1_000_000_000_000).or_else(|| {
                let m = std::fs::metadata(&p).ok()?.modified().ok()?;
                Some(m.duration_since(std::time::UNIX_EPOCH).ok()?.as_millis() as u64)
            })?;
            Some(Capture { t, path: propre(&p), jeu })
        })
        .collect();
    out.sort_by(|a, b| b.t.cmp(&a.t));
    out
}

fn images_sous(dir: &Path, profondeur: u32, out: &mut Vec<PathBuf>) {
    for e in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        let p = e.path();
        if p.is_dir() {
            if profondeur > 0 {
                images_sous(&p, profondeur - 1, out);
            }
        } else if p.extension().and_then(|x| x.to_str()).is_some_and(|x| ["png", "jpg", "jpeg", "webp", "gif"].contains(&x.to_ascii_lowercase().as_str())) && out.len() < 5000 {
            out.push(p);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn icone_ds_tuiles_et_palette() {
        let mut bitmap = vec![0u8; 512];
        bitmap[32] = 0x02;
        let mut pal = vec![0u8; 32];
        pal[4..6].copy_from_slice(&0x7C00u16.to_le_bytes());
        let px = ds_pixels(&bitmap, &pal);
        assert_eq!(&px[(8) * 4..(8) * 4 + 4], &[0, 0, 255, 255]);
        assert_eq!(&px[..4], &[0, 0, 0, 0]);
    }

    #[test]
    fn icone_3ds_ordre_morton() {
        let mut data = vec![0u8; 48 * 48 * 2];
        data[2..4].copy_from_slice(&0xF800u16.to_le_bytes());
        data[4..6].copy_from_slice(&0x07E0u16.to_le_bytes());
        let px = smdh_pixels(&data);
        assert_eq!(&px[4..8], &[255, 0, 0, 255]);
        assert_eq!(&px[48 * 4..48 * 4 + 4], &[0, 255, 0, 255]);
    }

    #[test]
    fn tga_rle_bas_en_haut() {
        let mut t = vec![0u8; 18];
        t[2] = 10;
        t[12] = 2;
        t[14] = 1;
        t[16] = 24;
        t.extend([0x81, 255, 0, 0]);
        let (w, h, px) = tga_pixels(&t).unwrap();
        assert_eq!((w, h), (2, 1));
        assert_eq!(&px, &[0, 0, 255, 255, 0, 0, 255, 255]);
    }

    /// Test avec les vraies icônes : cargo test -- --ignored vraies_icones
    #[test]
    #[ignore]
    fn vraies_icones() {
        let sortie = dossier("icones-test");
        let mut n = 0;
        for (dir, console) in [("DS", "DS"), ("3DS", "3DS")] {
            for f in std::fs::read_dir(PathBuf::from(crate::root()).join("Jeux").join(dir)).into_iter().flatten().flatten() {
                let p = f.path().to_string_lossy().into_owned();
                let img = if console == "DS" { icone_ds(&p) } else { icone_3ds(&p) };
                if let Some((w, h, px)) = img {
                    std::fs::write(sortie.join(format!("{}.png", f.file_name().to_string_lossy())), encoder_png(w as u32, h as u32, &px).unwrap()).unwrap();
                    n += 1;
                }
            }
        }
        let wiiu = PathBuf::from(crate::root()).join("Jeux").join("Wii U").join("The Legend of Zelda Breath of the Wild").join("code").join("U-King.rpx");
        if let Some((w, h, px)) = icone_wiiu(&wiiu.to_string_lossy()) {
            std::fs::write(sortie.join("botw.png"), encoder_png(w as u32, h as u32, &px).unwrap()).unwrap();
            n += 1;
        }
        println!("{n} icônes");
        assert!(n > 0);
    }

    #[test]
    fn noms_surs() {
        assert_eq!(sur("Pokémon: X/Y"), "Pokémon  X Y");
        assert_eq!(sur(".."), "Jeu");
        assert_eq!(decode("Pok%C3%A9mon%20X"), "Pokémon X");
    }
}

/* ---------- Jaquettes ---------- */

/// Sprite d'un Pokémon (ou d'un badge) depuis PokéAPI, téléchargé une fois dans data\\sprites.
pub fn sprite(n: u16, chroma: bool, badge: bool) -> Option<String> {
    use std::os::windows::process::CommandExt;
    if n == 0 || n > if badge { 77 } else { 1025 } {
        return None;
    }
    let dir = dossier("sprites");
    let _ = std::fs::create_dir_all(&dir);
    let f = dir.join(if badge { format!("badge-{n}.png") } else { format!("{n}{}.png", if chroma { "-chroma" } else { "" }) });
    if std::fs::metadata(&f).is_ok_and(|m| m.len() > 0) {
        return Some(f.to_string_lossy().into_owned());
    }
    let url = if badge {
        format!("https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/badges/{n}.png")
    } else {
        format!("https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{}{n}.png", if chroma { "shiny/" } else { "" })
    };
    let tmp = f.with_extension("part");
    let ok = std::process::Command::new("curl.exe")
        .args(["-f", "-s", "-L", "--max-time", "20", "-o"]).arg(&tmp).arg(&url)
        .creation_flags(0x0800_0000)
        .status()
        .is_ok_and(|s| s.success());
    if ok && std::fs::metadata(&tmp).is_ok_and(|m| m.len() > 100) && std::fs::rename(&tmp, &f).is_ok() {
        return Some(f.to_string_lossy().into_owned());
    }
    let _ = std::fs::remove_file(&tmp);
    None
}

pub fn jaquette(urls: &[String]) -> Option<(String, usize)> {
    use std::os::windows::process::CommandExt;
    let dir = dossier("jaquettes");
    let _ = std::fs::create_dir_all(&dir);
    let nom = |u: &str| -> Option<String> {
        let reste = u.strip_prefix("https://art.gametdb.com/")?;
        (reste.len() < 120 && reste.bytes().all(|b| b.is_ascii_alphanumeric() || b"/._-".contains(&b)) && !reste.contains("..")).then(|| reste.replace('/', "_"))
    };
    // Déjà téléchargée : aucun réseau.
    for (i, u) in urls.iter().enumerate() {
        let f = dir.join(nom(u)?);
        if std::fs::metadata(&f).is_ok_and(|m| m.len() > 0) {
            return Some((f.to_string_lossy().into_owned(), i));
        }
    }
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    for (i, u) in urls.iter().enumerate() {
        let f = dir.join(nom(u)?);
        let tmp = f.with_extension("part");
        let ok = std::process::Command::new("curl.exe")
            .args(["-f", "-s", "-L", "--max-time", "25", "-o"]).arg(&tmp).arg(u)
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .is_ok_and(|s| s.success());
        if ok && std::fs::metadata(&tmp).is_ok_and(|m| m.len() > 500) && std::fs::rename(&tmp, &f).is_ok() {
            return Some((f.to_string_lossy().into_owned(), i));
        }
        let _ = std::fs::remove_file(&tmp);
    }
    None
}
