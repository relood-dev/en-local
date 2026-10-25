//! macOS : clips vidéo pas encore disponibles (il faudra ScreenCaptureKit à la place de ddagrab).

pub static MICRO: std::sync::Mutex<Option<Option<String>>> = std::sync::Mutex::new(None);

pub fn demarrer(_parent: isize, _secs: u64, _qualite: String) {}

pub fn arreter() {}

#[tauri::command]
pub async fn miniature(_path: String) -> Option<String> {
    None
}

#[tauri::command]
pub async fn clip(_jeu: String, _avant: Option<f64>) -> Result<String, String> {
    Err("Les clips ne sont pas encore disponibles sur Mac.".into())
}
