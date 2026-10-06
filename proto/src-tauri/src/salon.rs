//! Salon Switch hébergé sur le PC de l'hôte : pare-feu, port UPnP, vérification par Loc, puis Eden héberge.
//! En cas d'échec, on reste sur le serveur du Local.
use std::net::{SocketAddr, UdpSocket};
use std::hash::Hasher;
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const PORTS: std::ops::RangeInclusive<u16> = 24872..=24891;
const REGLE: &str = "En Local - salon du jeu";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct Salon {
    port: u16,
    sonde: Option<UdpSocket>,
    places: u8, // > 0 : le jeu héberge le salon
    box_ouverte: bool,
}
static SALON: Mutex<Option<Salon>> = Mutex::new(None);

/// Règles du pare-feu (UDP entrant). Demande les droits admin une seule fois.
fn pare_feu() -> Result<(), String> {
    let existe = Command::new("netsh").args(["advfirewall", "firewall", "show", "rule", &format!("name={REGLE}")]).creation_flags(CREATE_NO_WINDOW).output();
    if existe.is_ok_and(|o| o.status.success()) {
        return Ok(());
    }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let regle = |prog: &str| format!("netsh advfirewall firewall add rule name=\"{REGLE}\" dir=in action=allow protocol=UDP localport={}-{} profile=any program=\"{prog}\"", PORTS.start(), PORTS.end());
    let cmd = format!("{} & {}", regle(&exe.to_string_lossy()), regle(&format!("{}\\eden.exe", crate::eden())));
    // Les guillemets simples sont doublés pour PowerShell.
    let ps = format!("Start-Process cmd -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '/c {}'", cmd.replace('\'', "''"));
    let ok = Command::new("powershell").args(["-NoProfile", "-Command", &ps]).creation_flags(CREATE_NO_WINDOW).status().is_ok_and(|s| s.success());
    if ok { Ok(()) } else { Err("Le pare-feu de Windows n'a pas été autorisé.".into()) }
}

/// Adresse locale de ce PC (celle de la route vers Internet).
fn ip_locale() -> Option<std::net::Ipv4Addr> {
    let s = UdpSocket::bind("0.0.0.0:0").ok()?;
    s.connect("1.1.1.1:53").ok()?;
    match s.local_addr().ok()? {
        SocketAddr::V4(a) => Some(*a.ip()),
        _ => None,
    }
}

/// Ouvre le port en UPnP. Sinon la sonde dira s'il est ouvert à la main.
fn ouvrir_box(port: u16) -> bool {
    use igd_next::{search_gateway, PortMappingProtocol, SearchOptions};
    let Some(ip) = ip_locale() else { return false };
    let mut options = SearchOptions::default();
    options.timeout = Some(Duration::from_secs(3));
    let Ok(box_) = search_gateway(options) else { return false };
    box_.add_port(PortMappingProtocol::UDP, port, SocketAddr::from((ip, port)), 6 * 3600, "En Local").is_ok()
}
fn fermer_box(port: u16) {
    use igd_next::{search_gateway, PortMappingProtocol, SearchOptions};
    let mut options = SearchOptions::default();
    options.timeout = Some(Duration::from_secs(2));
    if let Ok(box_) = search_gateway(options) {
        let _ = box_.remove_port(PortMappingProtocol::UDP, port);
    }
}

/// Étape 1 : pare-feu, port libre, box. On écoute en attendant la sonde.
#[tauri::command]
pub async fn salon_preparer() -> Result<u16, String> {
    tauri::async_runtime::spawn_blocking(|| {
        salon_fermer_sync();
        pare_feu()?;
        let (port, sonde) = PORTS.clone().find_map(|p| UdpSocket::bind(("0.0.0.0", p)).ok().map(|s| (p, s))).ok_or("Aucun port libre pour le salon.")?;
        let box_ouverte = ouvrir_box(port);
        *SALON.lock().unwrap() = Some(Salon { port, sonde: Some(sonde), places: 0, box_ouverte });
        Ok(port)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Étape 2 : a-t-on reçu enlocal:<jeton> de Loc en 3 s ?
#[tauri::command]
pub async fn salon_sonde(jeton: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(sonde) = SALON.lock().unwrap().as_mut().and_then(|s| s.sonde.take()) else { return false };
        let attendu = format!("enlocal:{jeton}");
        let fin = Instant::now() + Duration::from_secs(3);
        let mut buf = [0u8; 64];
        while Instant::now() < fin {
            let _ = sonde.set_read_timeout(Some(fin.saturating_duration_since(Instant::now()).max(Duration::from_millis(10))));
            if let Ok((n, _)) = sonde.recv_from(&mut buf) {
                if buf[..n] == *attendu.as_bytes() {
                    return true;
                }
            }
        }
        false
    })
    .await
    .unwrap_or(false)
}

/// Étape 3 : rend le mot de passe. Eden crée le salon à son lancement.
#[tauri::command]
pub fn salon_lancer(places: u8) -> Result<String, String> {
    let mut g = SALON.lock().unwrap();
    let s = g.as_mut().ok_or("Salon non préparé.")?;
    // 32 caractères hexadécimaux aléatoires.
    let hasard = || std::hash::BuildHasher::build_hasher(&std::collections::hash_map::RandomState::new()).finish();
    s.places = places.clamp(2, 8);
    Ok(format!("{:016x}{:016x}", hasard(), hasard()))
}

/// Places du salon s'il est hébergé ici sur ce port, sinon None.
pub fn places_heberges(port: u16) -> Option<u8> {
    SALON.lock().unwrap().as_ref().filter(|s| s.port == port && s.places > 0).map(|s| s.places)
}

/// Arrête le salon et referme le port.
#[tauri::command]
pub async fn salon_fermer() {
    let _ = tauri::async_runtime::spawn_blocking(salon_fermer_sync).await;
}
fn salon_fermer_sync() {
    let Some(s) = SALON.lock().unwrap().take() else { return };
    if s.box_ouverte {
        fermer_box(s.port);
    }
}

#[cfg(test)]
mod tests {
    /// Test manuel : ouvre puis referme un port sur la box.
    #[test]
    #[ignore]
    fn box_upnp() {
        println!("ip locale : {:?}", super::ip_locale());
        println!("port ouvert : {}", super::ouvrir_box(24891));
        super::fermer_box(24891);
    }
}
