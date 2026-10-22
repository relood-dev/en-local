//! Jeu à distance, façon Parsec : le jeu tourne chez l'hôte, l'interface envoie son image par WebRTC.
//! Ici : le son du seul émulateur (boucle WASAPI du processus, sans Discord ni le reste du PC), et
//! les manettes des invités, servies à Eden comme manettes DSU (protocole cemuhook) sur
//! 127.0.0.1:26760 et 26761 : 4 manettes par port, joueurs 2 à 8.
use std::net::{SocketAddr, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::ipc::{Channel, InvokeResponseBody};

pub const PORTS: [u16; 2] = [26760, 26761];
const INVITES: usize = 7;

struct Serveur {
    socket: UdpSocket,
    /// Clients DSU (Eden) et heure de leur dernière demande : ils la renouvellent toutes les 3 s.
    clients: Mutex<Vec<(SocketAddr, Instant)>>,
}
static SERVEURS: Mutex<Vec<&'static Serveur>> = Mutex::new(Vec::new());
/// Dernier paquet envoyé pour chaque invité, et son compteur.
static PADS: Mutex<[Option<(u32, [u8; 100])>; INVITES]> = Mutex::new([None; INVITES]);
static SON: AtomicBool = AtomicBool::new(false);

fn crc32(data: &[u8]) -> u32 {
    let mut crc = !0u32;
    for &b in data {
        crc ^= b as u32;
        for _ in 0..8 {
            crc = if crc & 1 != 0 { (crc >> 1) ^ 0xEDB8_8320 } else { crc >> 1 };
        }
    }
    !crc
}

/// En-tête DSU (20 octets, type compris) puis la somme de contrôle sur tout le paquet.
fn signer(p: &mut [u8], genre: u32) {
    p[0..4].copy_from_slice(b"DSUS");
    p[4..6].copy_from_slice(&1001u16.to_le_bytes());
    let taille = (p.len() - 16) as u16;
    p[6..8].copy_from_slice(&taille.to_le_bytes());
    p[8..12].fill(0);
    p[12..16].copy_from_slice(b"ENLO");
    p[16..20].copy_from_slice(&genre.to_le_bytes());
    let c = crc32(p);
    p[8..12].copy_from_slice(&c.to_le_bytes());
}

/// Boutons au format libretro (ceux de pad.rs, par position) vers les bits DSU que lit Eden.
fn bits_dsu(retro: u16) -> u16 {
    // libretro : 0 bas, 1 gauche, 2 select, 3 start, 4-7 croix (haut, bas, gauche, droite),
    // 8 droite, 9 haut, 10 L, 11 R, 12 L2, 13 R2, 14 L3, 15 R3.
    // DSU : 0 Share, 1 L3, 2 R3, 3 Options, 4 haut, 5 droite, 6 bas, 7 gauche, 8 L2, 9 R2,
    // 10 L1, 11 R1, 12 Triangle (haut), 13 Rond (droite), 14 Croix (bas), 15 Carré (gauche).
    const VERS: [u8; 16] = [14, 15, 0, 3, 4, 6, 7, 5, 13, 12, 10, 11, 8, 9, 1, 2];
    (0..16).filter(|i| retro & (1 << i) != 0).fold(0, |a, i| a | 1 << VERS[i])
}

/// Stick SDL (-32768 à 32767, bas positif) vers DSU (0 à 255, haut positif).
fn axe(v: i32, inverse: bool) -> u8 {
    let v = if inverse { -v } else { v };
    (128 + v / 256).clamp(0, 255) as u8
}

fn paquet(id: usize, compteur: u32, boutons: u16, sticks: [i32; 4]) -> [u8; 100] {
    let mut p = [0u8; 100];
    let pad = id % 4;
    // Infos de la manette : numéro, branchée, gyroscope complet, USB, adresse, batterie pleine, active.
    p[20..24].copy_from_slice(&[pad as u8, 2, 2, 1]);
    p[29] = id as u8 + 1;
    p[30] = 5;
    p[31] = 1;
    p[32..36].copy_from_slice(&compteur.to_le_bytes());
    p[36..38].copy_from_slice(&bits_dsu(boutons).to_le_bytes());
    p[40] = axe(sticks[0], false);
    p[41] = axe(sticks[1], true);
    p[42] = axe(sticks[2], false);
    p[43] = axe(sticks[3], true);
    // Gâchettes analogiques (R2 puis L2).
    p[54] = if boutons & 1 << 13 != 0 { 255 } else { 0 };
    p[55] = if boutons & 1 << 12 != 0 { 255 } else { 0 };
    signer(&mut p, 0x0010_0002);
    p
}

fn envoyer(id: usize, p: &[u8]) {
    let Some(s) = SERVEURS.lock().unwrap().get(id / 4).copied() else { return };
    let mut clients = s.clients.lock().unwrap();
    clients.retain(|(_, vu)| vu.elapsed() < Duration::from_secs(8));
    for (a, _) in clients.iter() {
        let _ = s.socket.send_to(p, a);
    }
}

/// Répond aux demandes d'Eden : version, état des 4 manettes du port, abonnement aux données.
fn servir(s: &'static Serveur, base: usize) {
    let mut buf = [0u8; 100];
    loop {
        let Ok((n, de)) = s.socket.recv_from(&mut buf) else { continue };
        if n < 20 || &buf[0..4] != b"DSUC" {
            continue;
        }
        match u32::from_le_bytes([buf[16], buf[17], buf[18], buf[19]]) {
            0x0010_0000 => {
                let mut p = [0u8; 22];
                p[20..22].copy_from_slice(&1001u16.to_le_bytes());
                signer(&mut p, 0x0010_0000);
                let _ = s.socket.send_to(&p, de);
            }
            0x0010_0001 => {
                let pads = *PADS.lock().unwrap();
                for pad in 0..4 {
                    let mut p = [0u8; 32];
                    let branchee = pads.get(base + pad).is_some_and(Option::is_some);
                    p[20..24].copy_from_slice(&[pad as u8, if branchee { 2 } else { 0 }, 2, 1]);
                    p[30] = 5;
                    signer(&mut p, 0x0010_0001);
                    let _ = s.socket.send_to(&p, de);
                }
            }
            0x0010_0002 => {
                let mut clients = s.clients.lock().unwrap();
                clients.retain(|(a, _)| *a != de);
                clients.push((de, Instant::now()));
            }
            _ => {}
        }
    }
}

fn demarrer_serveurs() -> Result<(), String> {
    let mut serveurs = SERVEURS.lock().unwrap();
    if !serveurs.is_empty() {
        return Ok(());
    }
    for (k, port) in PORTS.iter().enumerate() {
        let socket = UdpSocket::bind(("127.0.0.1", *port)).map_err(|e| format!("port {port} des manettes à distance occupé : {e}"))?;
        let s: &'static Serveur = Box::leak(Box::new(Serveur { socket, clients: Mutex::new(Vec::new()) }));
        serveurs.push(s);
        std::thread::spawn(move || servir(s, k * 4));
    }
    Ok(())
}

/// Hôte : serveurs des manettes, et son du jeu envoyé à l'interface (PCM 16 bits, 48 kHz, stéréo).
#[tauri::command]
pub fn distance_debut(son: Channel<InvokeResponseBody>) -> Result<(), String> {
    demarrer_serveurs()?;
    if !SON.swap(true, Ordering::SeqCst) {
        std::thread::spawn(move || {
            if let Err(e) = capturer_son(&son) {
                crate::journal_rust(&format!("jeu à distance, son : {e}"));
            }
            SON.store(false, Ordering::SeqCst);
        });
    }
    Ok(())
}

/// Manette d'un invité : boutons libretro et sticks (gauche x, y, droit x, y).
#[tauri::command]
pub fn distance_pad(slot: usize, boutons: u16, sticks: [i32; 4]) {
    if slot >= INVITES {
        return;
    }
    let p = {
        let mut pads = PADS.lock().unwrap();
        let compteur = pads[slot].map_or(1, |(c, _)| c.wrapping_add(1).max(1));
        let p = paquet(slot, compteur, boutons, sticks);
        pads[slot] = Some((compteur, p));
        p
    };
    envoyer(slot, &p);
}

/// Invité parti : Eden débranche une manette dont le paquet revient avec le même compteur.
#[tauri::command]
pub fn distance_fin(slot: usize) {
    if let Some((_, p)) = PADS.lock().unwrap().get_mut(slot).and_then(Option::take) {
        envoyer(slot, &p);
    }
}

#[tauri::command]
pub fn distance_arret() {
    SON.store(false, Ordering::SeqCst);
    for slot in 0..INVITES {
        distance_fin(slot);
    }
}

#[windows::core::implement(windows::Win32::Media::Audio::IActivateAudioInterfaceCompletionHandler, windows::Win32::System::Com::IAgileObject)]
struct Active(windows::Win32::Foundation::HANDLE);
impl windows::Win32::Media::Audio::IActivateAudioInterfaceCompletionHandler_Impl for Active_Impl {
    fn ActivateCompleted(&self, _: Option<&windows::Win32::Media::Audio::IActivateAudioInterfaceAsyncOperation>) -> windows::core::Result<()> {
        unsafe { windows::Win32::System::Threading::SetEvent(self.0) }
    }
}
impl windows::Win32::System::Com::IAgileObject_Impl for Active_Impl {}

/// Boucle WASAPI limitée au processus de l'émulateur (Windows 10 2004 et plus).
fn capturer_son(vers: &Channel<InvokeResponseBody>) -> windows::core::Result<()> {
    use windows::core::Interface;
    use windows::Win32::Media::Audio::*;
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
    use windows::Win32::System::Threading::{CreateEventW, WaitForSingleObject};
    // PROPVARIANT de type VT_BLOB (65), à la main : celui de windows-core libérerait le bloc à la fin.
    #[repr(C)]
    struct Blob {
        vt: u16,
        reserve: [u16; 3],
        taille: u32,
        donnees: *const u8,
    }
    let Some(pid) = crate::son::pids().into_iter().next() else {
        return Err(windows::core::Error::new(windows::core::HRESULT(-1), "aucun émulateur lancé"));
    };
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let params = AUDIOCLIENT_ACTIVATION_PARAMS {
            ActivationType: AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
            Anonymous: AUDIOCLIENT_ACTIVATION_PARAMS_0 {
                ProcessLoopbackParams: AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS { TargetProcessId: pid, ProcessLoopbackMode: PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE },
            },
        };
        let blob = Blob { vt: 65, reserve: [0; 3], taille: std::mem::size_of::<AUDIOCLIENT_ACTIVATION_PARAMS>() as u32, donnees: &params as *const _ as *const u8 };
        let fini = CreateEventW(None, false, false, None)?;
        let handler: IActivateAudioInterfaceCompletionHandler = Active(fini).into();
        let op = ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, &IAudioClient::IID, Some(&blob as *const Blob as *const windows::core::PROPVARIANT), &handler)?;
        WaitForSingleObject(fini, 5000);
        let mut hr = windows::core::HRESULT(0);
        let mut obtenu = None;
        op.GetActivateResult(&mut hr, &mut obtenu)?;
        hr.ok()?;
        let client: IAudioClient = obtenu.ok_or_else(|| windows::core::Error::from(windows::core::HRESULT(-1)))?.cast()?;
        let format = WAVEFORMATEX { wFormatTag: WAVE_FORMAT_PCM as u16, nChannels: 2, nSamplesPerSec: 48000, nAvgBytesPerSec: 192_000, nBlockAlign: 4, wBitsPerSample: 16, cbSize: 0 };
        client.Initialize(AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM, 200_000, 0, &format, None)?;
        let capture: IAudioCaptureClient = client.GetService()?;
        client.Start()?;
        crate::journal_rust(&format!("jeu à distance : son du processus {pid}"));
        let mut morceau = Vec::with_capacity(4096);
        while SON.load(Ordering::SeqCst) {
            std::thread::sleep(Duration::from_millis(5));
            while capture.GetNextPacketSize()? > 0 {
                let (mut data, mut n, mut flags) = (std::ptr::null_mut(), 0u32, 0u32);
                capture.GetBuffer(&mut data, &mut n, &mut flags, None, None)?;
                let octets = n as usize * 4;
                if flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0 || data.is_null() {
                    morceau.resize(morceau.len() + octets, 0);
                } else {
                    morceau.extend_from_slice(std::slice::from_raw_parts(data, octets));
                }
                capture.ReleaseBuffer(n)?;
            }
            if !morceau.is_empty() && vers.send(InvokeResponseBody::Raw(std::mem::take(&mut morceau))).is_err() {
                break;
            }
        }
        let _ = client.Stop();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn paquets_dsu() {
        // Somme de contrôle de référence (zlib) : « 123456789 » -> CBF43926.
        assert_eq!(super::crc32(b"123456789"), 0xCBF4_3926);
        // A (bouton de droite, libretro 8) -> Rond (bit 13) ; B (bas, 0) -> Croix (14) ; ZL (12) -> L2 (8).
        assert_eq!(super::bits_dsu(1 << 8), 1 << 13);
        assert_eq!(super::bits_dsu(1 << 0 | 1 << 12), 1 << 14 | 1 << 8);
        let p = super::paquet(5, 7, 0, [0, -32768, 32767, 0]);
        assert_eq!(&p[0..4], b"DSUS");
        assert_eq!(u16::from_le_bytes([p[6], p[7]]), 84);
        assert_eq!(p[20], 1); // invité 6 : manette 2 du second port
        assert_eq!((p[40], p[41], p[42]), (128, 255, 255)); // stick gauche en haut, droit à droite
        let mut q = p;
        q[8..12].fill(0);
        assert_eq!(super::crc32(&q), u32::from_le_bytes([p[8], p[9], p[10], p[11]]));
    }
}
