//! Mii du joueur, créé dans En Local au format des 3DS et Wii U (96 octets).
//! La 3DS et la Switch le reçoivent au lancement (ENLOCAL_MII), la Wii U dans le compte de Cemu,
//! la Wii dans sa base de Mii (RFL_DB.dat).

/// Le Mii des réglages du jeu, s'il est entier (CRC bon).
pub fn du_joueur(o: &crate::reglages::Opts) -> Option<[u8; 96]> {
    let h = o.get("mii")?;
    if h.len() != 192 || !h.bytes().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    let mut m = [0u8; 96];
    for (i, b) in m.iter_mut().enumerate() {
        *b = u8::from_str_radix(&h[2 * i..2 * i + 2], 16).ok()?;
    }
    (crc(&m) == 0).then_some(m)
}
/// Pour ENLOCAL_MII : vide sans Mii.
pub fn hex(o: &crate::reglages::Opts) -> String {
    du_joueur(o).map_or(String::new(), |m| m.iter().map(|b| format!("{b:02x}")).collect())
}

/// CRC-16 CCITT des Mii (départ à 0). Sur des données suivies de leur CRC, il vaut 0.
fn crc(b: &[u8]) -> u16 {
    let mut c: u16 = 0;
    for &x in b {
        c ^= (x as u16) << 8;
        for _ in 0..8 {
            c = if c & 0x8000 != 0 { (c << 1) ^ 0x1021 } else { c << 1 };
        }
    }
    c
}

/// Wii U : MiiData et MiiName du compte de Cemu (le même format). Le compte est créé par Cemu à son premier lancement.
pub fn cemu(cemu_dir: &str, m: &[u8; 96]) {
    let f = format!("{cemu_dir}\\portable\\mlc01\\usr\\save\\system\\act\\80000001\\account.dat");
    let Ok(texte) = std::fs::read_to_string(&f) else { return };
    let donnees: String = m.iter().map(|b| format!("{b:02x}")).collect();
    let nom: String = (0..11).map(|k| if k < 10 { u16::from_le_bytes([m[0x1a + 2 * k], m[0x1b + 2 * k]]) } else { 0 }).map(|u| format!("{u:04x}")).collect();
    let fin = if texte.contains("\r\n") { "\r\n" } else { "\n" };
    let neuf: Vec<String> = texte
        .lines()
        .map(|l| match l.split_once('=') {
            Some(("MiiData", _)) => format!("MiiData={donnees}"),
            Some(("MiiName", _)) => format!("MiiName={nom}"),
            _ => l.to_string(),
        })
        .collect();
    let neuf = neuf.join(fin) + fin;
    if neuf != texte {
        let _ = std::fs::write(&f, neuf);
    }
}

/* ---------- 3DS ---------- */

const CFL_TAILLE: usize = 0x4BD20;

/// 3DS : le Mii dans la base de l'éditeur Mii (CFL_DB.dat). Mario Kart 7 et d'autres jeux y cherchent
/// le Mii du joueur. Le dossier est créé par Azahar au premier lancement d'un jeu 3DS.
pub fn trois_ds(azahar_dir: &str, m: &[u8; 96]) {
    let dir = format!("{azahar_dir}\\user\\nand\\data\\00000000000000000000000000000000\\extdata\\00048000\\F000000B\\user");
    let f = format!("{dir}\\CFL_DB.dat");
    let mut db = match std::fs::read(&f) {
        Ok(b) if b.len() == CFL_TAILLE && &b[..4] == b"CFOG" && crc(&b[..0xC820]) == 0 => b,
        Ok(_) => return, // base abîmée ou d'un autre format : on n'y touche pas
        Err(_) if std::path::Path::new(&dir).is_dir() => cfl_vide(),
        Err(_) => return,
    };
    if poser_3ds(&mut db, m) {
        let _ = std::fs::write(&f, db);
    }
}
/// Base vide, comme celle de la console (vérifiée sur une base créée par Azahar).
fn cfl_vide() -> Vec<u8> {
    let mut db = vec![0u8; CFL_TAILLE];
    db[..8].copy_from_slice(b"CFOG\x00\x01\x00\x00");
    db[0x23F8..0x2400].copy_from_slice(b"CFHE\xff\xff\xff\xff");
    for i in 0..3000 {
        let o = 0x2400 + 0xE * i;
        db[o + 10..o + 14].copy_from_slice(&[0xFF, 0x7F, 0xFF, 0x7F]); // précédent et suivant : aucun
    }
    db[0xC820..0xC824].copy_from_slice(b"CFRA");
    let c = crc(&db[..0xC81E]);
    db[0xC81E..0xC820].copy_from_slice(&c.to_be_bytes());
    let c = crc(&db[0xC820..0xE4BE]);
    db[0xE4BE..0xE4C0].copy_from_slice(&c.to_be_bytes());
    db
}
/// Notre Mii à sa place (même identifiant), sinon en premier : le premier Mii est celui du joueur.
fn poser_3ds(db: &mut [u8], m: &[u8; 96]) -> bool {
    let place = |i: usize| 8 + i * 0x5C;
    let vide = |db: &[u8], i: usize| db[place(i)..place(i) + 0x5C].iter().all(|&x| x == 0);
    let Some(i) = (0..100).find(|&i| db[place(i) + 0x0C..place(i) + 0x10] == m[0x0C..0x10]).or_else(|| (0..100).find(|&i| vide(db, i))) else {
        return false;
    };
    let mut e = [0u8; 0x5C];
    e.copy_from_slice(&m[..0x5C]);
    e[0x19] |= 0x40; // favori, comme le Mii du joueur sur la console
    if db[place(i)..place(i) + 0x5C] == e {
        return false;
    }
    db[place(i)..place(i) + 0x5C].copy_from_slice(&e);
    let c = crc(&db[..0xC81E]);
    db[0xC81E..0xC820].copy_from_slice(&c.to_be_bytes());
    true
}

/* ---------- Wii ---------- */

const RFL_TAILLE: usize = 0x1F1E0;
const RFL_MII: usize = 0x4A;

/// Wii : le Mii dans la base de la console (créée vide si besoin, comme le fait la Wii).
pub fn wii(dolphin_dir: &str, m: &[u8; 96]) {
    let dir = format!("{dolphin_dir}\\User\\Wii\\shared2\\menu\\FaceLib");
    let f = format!("{dir}\\RFL_DB.dat");
    let mut db = match std::fs::read(&f) {
        Ok(b) if b.len() == RFL_TAILLE && &b[..4] == b"RNOD" && crc(&b) == 0 => b,
        Ok(_) => return, // base d'un autre format ou abîmée : on n'y touche pas
        Err(_) => base_vide(),
    };
    if poser_wii(&mut db, &mii_wii(m)) && std::fs::create_dir_all(&dir).is_ok() {
        let _ = std::fs::write(&f, db);
    }
}
/// Base vide, comme la formate la Wii (RFL_Format.c).
fn base_vide() -> Vec<u8> {
    let mut db = vec![0u8; RFL_TAILLE];
    db[..4].copy_from_slice(b"RNOD");
    db[0x1CEC] = 0x80; // isolation
    db[0x1D00..0x1D04].copy_from_slice(b"RNHD");
    db[0x1D04..0x1D08].copy_from_slice(&[0xFF; 4]); // tête et queue : -1
    for i in 0..10000 {
        let o = 0x1D08 + 12 * i;
        db[o + 8..o + 12].copy_from_slice(&[0x7F, 0xFF, 0x7F, 0xFF]); // suivant et précédent : -1
    }
    let c = crc(&db[..RFL_TAILLE - 2]);
    db[RFL_TAILLE - 2..].copy_from_slice(&c.to_be_bytes());
    db
}
/// Notre Mii à sa place (même identifiant), sinon à la première place libre. Faux si rien n'a changé.
fn poser_wii(db: &mut [u8], w: &[u8; RFL_MII]) -> bool {
    let place = |i: usize| 4 + i * RFL_MII;
    let Some(i) = (0..100).find(|&i| db[place(i) + 0x18..place(i) + 0x20] == w[0x18..0x20]).or_else(|| (0..100).find(|&i| db[place(i)..place(i) + RFL_MII].iter().all(|&x| x == 0))) else {
        return false;
    };
    if db[place(i)..place(i) + RFL_MII] == w[..] {
        return false;
    }
    db[place(i)..place(i) + RFL_MII].copy_from_slice(w);
    let c = crc(&db[..RFL_TAILLE - 2]);
    db[RFL_TAILLE - 2..].copy_from_slice(&c.to_be_bytes());
    true
}

/// Le Mii au format de la Wii (RFLiCharData, champs du bit de poids fort au plus faible).
/// Ce que la Wii n'a pas (coiffures et yeux ajoutés sur 3DS…) reprend le choix par défaut.
fn mii_wii(m: &[u8; 96]) -> [u8; RFL_MII] {
    let u16le = |o: usize| u16::from_le_bytes([m[o], m[o + 1]]) as u32;
    let u32le = |o: usize| u32::from_le_bytes([m[o], m[o + 1], m[o + 2], m[o + 3]]);
    let c = |v: u32, max: u32, def: u32| if v <= max { v } else { def };
    // Champs (valeur, bits) rangés depuis le bit de poids fort.
    let mot = |champs: &[(u32, u32)]| {
        let mut v = 0u32;
        let mut reste = 16;
        for &(x, n) in champs {
            reste -= n;
            v |= (x & ((1 << n) - 1)) << reste;
        }
        (v as u16).to_be_bytes()
    };
    let info = u16le(0x18);
    let (eye, brow) = (u32le(0x34), u32le(0x38));
    let (nose, mouth, poils, lunettes, grain) = (u16le(0x3c), u16le(0x3e), u16le(0x42), u16le(0x44), u16le(0x46));
    let mut w = [0u8; RFL_MII];
    w[0..2].copy_from_slice(&mot(&[(0, 1), (info & 1, 1), ((info >> 1) & 15, 4), ((info >> 5) & 31, 5), (c((info >> 10) & 15, 11, 0), 4), (0, 1)]));
    for k in 0..10 {
        let car = u16::from_le_bytes([m[0x1a + 2 * k], m[0x1b + 2 * k]]).to_be_bytes();
        w[0x02 + 2 * k..0x04 + 2 * k].copy_from_slice(&car);
        w[0x36 + 2 * k..0x38 + 2 * k].copy_from_slice(&car);
    }
    w[0x16] = m[0x2e];
    w[0x17] = m[0x2f];
    // Identifiant : Mii normal (bit de poids fort), console d'après l'adresse MAC.
    let id = 0x8000_0000 | (u32::from_be_bytes([m[0x0c], m[0x0d], m[0x0e], m[0x0f]]) & 0x0FFF_FFFF);
    w[0x18..0x1c].copy_from_slice(&id.to_be_bytes());
    w[0x1c] = (m[0x10] as u32 + m[0x11] as u32 + m[0x12] as u32) as u8 & 0x7F;
    w[0x1d..0x20].copy_from_slice(&m[0x13..0x16]);
    w[0x20..0x22].copy_from_slice(&mot(&[(c((m[0x30] as u32 >> 1) & 15, 7, 0), 3), (c(m[0x30] as u32 >> 5, 5, 0), 3), (0, 4), (0, 3), (0, 1), (0, 2)]));
    w[0x22..0x24].copy_from_slice(&mot(&[(c(m[0x32] as u32, 71, 33), 7), (m[0x33] as u32 & 7, 3), ((m[0x33] as u32 >> 3) & 1, 1), (0, 5)]));
    w[0x24..0x26].copy_from_slice(&mot(&[(brow & 31, 5), (c((brow >> 16) & 15, 11, 6), 5), (0, 6)]));
    w[0x26..0x28].copy_from_slice(&mot(&[((brow >> 5) & 7, 3), (c((brow >> 8) & 15, 8, 4), 4), (c((brow >> 25) & 31, 18, 10).max(3), 5), (c((brow >> 21) & 15, 12, 2), 4)]));
    w[0x28..0x2a].copy_from_slice(&mot(&[(c(eye & 63, 47, 2), 6), (c((eye >> 16) & 31, 7, 4), 5), (c((eye >> 25) & 31, 18, 12), 5)]));
    w[0x2a..0x2c].copy_from_slice(&mot(&[(c((eye >> 6) & 7, 5, 0), 3), (c((eye >> 9) & 15, 7, 4), 4), (c((eye >> 21) & 15, 12, 2), 4), (0, 5)]));
    w[0x2c..0x2e].copy_from_slice(&mot(&[(c(nose & 31, 11, 1), 4), (c((nose >> 5) & 15, 8, 4), 4), (c((nose >> 9) & 31, 18, 9), 5), (0, 3)]));
    w[0x2e..0x30].copy_from_slice(&mot(&[(c(mouth & 63, 23, 23), 5), (c((mouth >> 6) & 7, 2, 0), 2), (c((mouth >> 9) & 15, 8, 4), 4), (c(m[0x40] as u32 & 31, 18, 13), 5)]));
    w[0x30..0x32].copy_from_slice(&mot(&[(c(lunettes & 15, 8, 0), 4), (c((lunettes >> 4) & 7, 5, 0), 3), (c((lunettes >> 7) & 15, 7, 4), 4), (c((lunettes >> 11) & 31, 20, 10), 5)]));
    w[0x32..0x34].copy_from_slice(&mot(&[(c(m[0x40] as u32 >> 5, 3, 0), 2), (c(poils & 7, 3, 0), 2), ((poils >> 3) & 7, 3), (c((poils >> 6) & 15, 8, 4), 4), (c((poils >> 10) & 31, 16, 10), 5)]));
    w[0x34..0x36].copy_from_slice(&mot(&[(grain & 1, 1), (c((grain >> 1) & 15, 8, 4), 4), (c((grain >> 10) & 31, 30, 20), 5), (c((grain >> 5) & 31, 16, 2), 5), (0, 1)]));
    w
}

#[cfg(test)]
mod tests {
    /// Le CRC de la Wii (RFL_Database.c) : sur toute la base, CRC compris, il vaut 0.
    fn crc_wii(b: &[u8]) -> u16 {
        let mut c: u16 = 0;
        for &x in b {
            let mut d = x;
            for _ in 0..8 {
                c = if c & 0x8000 != 0 { (c << 1) ^ 0x1021 } else { c << 1 };
                if d & 0x80 != 0 {
                    c ^= 1;
                }
                d <<= 1;
            }
        }
        c
    }

    #[test]
    fn mii_partout() {
        // Le Mii standard d'une 3DS (octets relevés sur la console), avec son CRC.
        let mut m = [0u8; 96];
        let h = "03011030d285b6b300c8850a98391ee440f407b737100000a60041007a00610068006100720050006c00750073004040000021010268441826344614811217680d0000290052485041007a00610068006100720050006c0075007300";
        for (i, b) in m.iter_mut().enumerate().take(h.len() / 2) {
            *b = u8::from_str_radix(&h[2 * i..2 * i + 2], 16).unwrap();
        }
        let c = super::crc(&m[..0x5e]);
        m[0x5e..].copy_from_slice(&c.to_be_bytes());
        let mut o = crate::reglages::Opts::new();
        o.insert("mii".into(), m.iter().map(|b| format!("{b:02x}")).collect());
        assert_eq!(super::du_joueur(&o), Some(m));
        o.insert("mii".into(), "00".repeat(96).replacen("00", "01", 1));
        assert_eq!(super::du_joueur(&o), None, "CRC faux : refusé");

        // 3DS : base vide valable, Mii posé en premier, CRC juste.
        let mut cfl = super::cfl_vide();
        assert_eq!(super::crc(&cfl[..0xC820]), 0);
        assert_eq!(super::crc(&cfl[0xC820..0xE4C0]), 0);
        assert!(super::poser_3ds(&mut cfl, &m));
        assert!(!super::poser_3ds(&mut cfl, &m));
        assert_eq!(&cfl[8 + 0x1A..8 + 0x1E], &m[0x1A..0x1E]);
        assert_eq!(super::crc(&cfl[..0xC820]), 0);

        // Wii : la base créée et le Mii posé passent le contrôle de la Wii.
        let mut db = super::base_vide();
        assert_eq!(crc_wii(&db), 0);
        let w = super::mii_wii(&m);
        assert!(super::poser_wii(&mut db, &w));
        assert!(!super::poser_wii(&mut db, &w), "déjà en place : rien à écrire");
        assert_eq!(crc_wii(&db), 0);
        assert_eq!(db.len(), 0x1F1E0);
        // Nom en UTF-16 gros-boutiste, yeux du Mii standard (type 2, hauteur 12).
        assert_eq!(&w[0x02..0x06], &[0, b'A', 0, b'z']);
        assert_eq!(u16::from_be_bytes([w[0x28], w[0x29]]) >> 10, 2);
        assert_eq!(u16::from_be_bytes([w[0x28], w[0x29]]) & 31, 12);
        assert_eq!(w[0x18] & 0x80, 0x80);
    }
}
