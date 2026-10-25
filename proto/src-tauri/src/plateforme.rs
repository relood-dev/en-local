//! Ce qui diffère entre Windows et macOS, en petit : le reste du code reste commun.

/// Lancer un programme sans ouvrir de console (Windows). Rien à faire sur macOS.
pub trait SansFenetre {
    fn sans_fenetre(&mut self) -> &mut Self;
}
impl SansFenetre for std::process::Command {
    #[cfg(windows)]
    fn sans_fenetre(&mut self) -> &mut Self {
        use std::os::windows::process::CommandExt;
        self.creation_flags(0x0800_0000)
    }
    #[cfg(not(windows))]
    fn sans_fenetre(&mut self) -> &mut Self {
        self
    }
}

/// Chemin écrit avec des « \ » (Windows) : sur macOS, les « \ » deviennent des « / ».
pub fn chemin(s: String) -> String {
    if cfg!(windows) { s } else { s.replace('\\', "/") }
}
/// format! pour un chemin : `chemin!("{}\\data\\x", root())`.
#[macro_export]
macro_rules! chemin {
    ($($t:tt)*) => { $crate::plateforme::chemin(format!($($t)*)) };
}

/// Ouvre une adresse dans le navigateur par défaut.
pub fn ouvrir_url(url: &str) -> Result<(), String> {
    // Windows : explorer.exe comprend mal les URL avec « & ».
    #[cfg(windows)]
    let mut c = {
        let mut c = std::process::Command::new("rundll32");
        c.args(["url.dll,FileProtocolHandler", url]);
        c
    };
    #[cfg(not(windows))]
    let mut c = {
        let mut c = std::process::Command::new("open");
        c.arg(url);
        c
    };
    c.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Montre un dossier dans l'Explorateur (Windows) ou le Finder (macOS).
pub fn ouvrir_dossier(dossier: impl AsRef<std::ffi::OsStr>) {
    let _ = std::process::Command::new(if cfg!(windows) { "explorer" } else { "open" }).arg(dossier).spawn();
}

/// curl : livré avec Windows 10 (curl.exe) et avec macOS.
pub const CURL: &str = if cfg!(windows) { "curl.exe" } else { "curl" };
