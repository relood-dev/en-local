//! macOS : pas de volume par programme dans le système. Les consoles dans l'app suivent le volume
//! directement ; nos émulateurs relisent le fichier data/volume-jeu.txt (0 à 1) pendant la partie.

pub fn pids() -> Vec<u32> {
    Vec::new()
}

pub fn fichier() -> String {
    format!("{}/data/volume-jeu.txt", crate::root())
}

pub fn volume_jeux(v: f32) -> usize {
    let v = v.clamp(0.0, 1.0);
    crate::libretro::gain(v);
    let f = fichier();
    let _ = std::fs::write(format!("{f}.tmp"), format!("{v:.3}"));
    let _ = std::fs::rename(format!("{f}.tmp"), &f);
    usize::from(crate::embed::is_running())
}
