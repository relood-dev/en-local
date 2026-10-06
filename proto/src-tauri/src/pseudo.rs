//! Pseudo du joueur dans les émulateurs (Eden, Azahar, melonDS), visible des autres en local sans fil.

/// 10 caractères au plus, sans emoji (limite des consoles).
pub fn propre(nom: &str) -> Option<String> {
    let n: String = nom.chars().filter(|c| c.is_alphanumeric() || " ._-!?'&+".contains(*c)).take(10).collect();
    let n = n.trim();
    (!n.is_empty()).then(|| n.to_string())
}

/// Eden : nom du profil dans profiles.dat. Créé s'il n'existe pas.
pub fn eden(user: &str, nom: &str) {
    let dir = format!("{user}\\nand\\system\\save\\8000000000000010\\su\\avators");
    let f = format!("{dir}\\profiles.dat");
    let mut b = match std::fs::read(&f) {
        Ok(b) if b.len() == 0x650 => b,
        Ok(_) => return, // format inconnu : on n'y touche pas
        Err(_) => {
            let mut b = vec![0; 0x650];
            let id = aleatoire();
            b[0x10..0x20].copy_from_slice(&id);
            b[0x20..0x30].copy_from_slice(&id);
            if std::fs::create_dir_all(&dir).is_err() {
                return;
            }
            b
        }
    };
    let mut octets = Vec::new();
    for c in nom.chars() {
        if octets.len() + c.len_utf8() > 0x20 {
            break;
        }
        octets.extend_from_slice(c.to_string().as_bytes());
    }
    for u in 0..8 {
        let o = 0x10 + u * 0xC8;
        if b[o..o + 0x10].iter().any(|&x| x != 0) {
            let champ = &mut b[o + 0x28..o + 0x48];
            champ.fill(0);
            champ[..octets.len()].copy_from_slice(&octets);
        }
    }
    let _ = std::fs::write(&f, b);
}

/// Azahar : bloc 0x000A0000 de la config console. Le fichier existe après un premier lancement.
pub fn azahar(user: &str, nom: &str) {
    let f = format!("{user}\\nand\\data\\00000000000000000000000000000000\\sysdata\\00010017\\00000000\\config");
    let Ok(mut b) = std::fs::read(&f) else { return };
    if b.len() < 4 {
        return;
    }
    let n = u16::from_le_bytes([b[0], b[1]]) as usize;
    for i in 0..n {
        let o = 4 + i * 12;
        if o + 12 > b.len() {
            return;
        }
        if u32::from_le_bytes(b[o..o + 4].try_into().unwrap()) != 0x000A_0000 {
            continue;
        }
        let debut = u32::from_le_bytes(b[o + 4..o + 8].try_into().unwrap()) as usize;
        let taille = u16::from_le_bytes([b[o + 8], b[o + 9]]) as usize;
        if taille < 2 || debut + taille > b.len() {
            return;
        }
        let zone = &mut b[debut..debut + taille];
        zone.fill(0);
        for (k, u) in nom.encode_utf16().take(taille / 2 - 1).enumerate() {
            zone[2 * k..2 * k + 2].copy_from_slice(&u.to_le_bytes());
        }
        let _ = std::fs::write(&f, b);
        return;
    }
}

fn aleatoire() -> [u8; 16] {
    use std::hash::{BuildHasher, Hasher};
    let mut id = [0u8; 16];
    for moitie in id.chunks_mut(8) {
        let mut h = std::collections::hash_map::RandomState::new().build_hasher();
        h.write_u128(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos());
        moitie.copy_from_slice(&h.finish().to_le_bytes());
    }
    id
}

#[cfg(test)]
mod tests {
    #[test]
    fn pseudo_et_profils() {
        assert_eq!(super::propre("relood").as_deref(), Some("relood"));
        assert_eq!(super::propre("ᴘɪxᴇʟ 🎮 kin!").as_deref(), Some("ᴘɪxᴇʟ  kin"));
        assert_eq!(super::propre("🎮"), None);
        let t = std::env::temp_dir().join(format!("enlocal-pseudo-{}", std::process::id()));
        let user = t.to_string_lossy().into_owned();
        super::eden(&user, "joueur02");
        let f = format!("{user}\\nand\\system\\save\\8000000000000010\\su\\avators\\profiles.dat");
        let b = std::fs::read(&f).unwrap();
        assert_eq!(b.len(), 0x650);
        assert_eq!(b[0x10..0x20], b[0x20..0x30]);
        assert!(b[0x10..0x20].iter().any(|&x| x != 0));
        assert_eq!(&b[0x38..0x40], b"joueur02");
        assert!(b[0xD8..0xE8].iter().all(|&x| x == 0));
        super::eden(&user, "relood"); // renommé, même id
        let c = std::fs::read(&f).unwrap();
        assert_eq!(b[0x10..0x20], c[0x10..0x20]);
        assert_eq!(&c[0x38..0x40], b"relood\0\0");
        let _ = std::fs::remove_dir_all(t);
    }
}
