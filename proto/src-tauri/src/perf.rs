//! Priorité de l'app et de WebView2 selon le réglage Performances.
//! Maximum : priorité haute. Économie : priorité basse. Normal : par défaut.
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::Diagnostics::ToolHelp::*;
use windows::Win32::System::Threading::*;

/// L'app et tous ses processus enfants (WebView2).
fn processus() -> Vec<u32> {
    let moi = std::process::id();
    let mut liens: Vec<(u32, u32)> = Vec::new();
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return vec![moi] };
        let mut e = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        if Process32FirstW(snap, &mut e).is_ok() {
            loop {
                liens.push((e.th32ProcessID, e.th32ParentProcessID));
                if Process32NextW(snap, &mut e).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snap);
    }
    let mut l = vec![moi];
    let mut k = 0;
    while k < l.len() {
        let p = l[k];
        l.extend(liens.iter().filter(|(id, parent)| *parent == p && *id != p).map(|(id, _)| *id));
        k += 1;
    }
    l
}

fn regler(h: HANDLE, priorite: PROCESS_CREATION_FLAGS, economie: bool) {
    let etat = PROCESS_POWER_THROTTLING_STATE {
        Version: PROCESS_POWER_THROTTLING_CURRENT_VERSION,
        ControlMask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
        StateMask: if economie { PROCESS_POWER_THROTTLING_EXECUTION_SPEED } else { 0 },
    };
    unsafe {
        let _ = SetPriorityClass(h, priorite);
        let _ = SetProcessInformation(h, ProcessPowerThrottling, &etat as *const _ as *const _, std::mem::size_of_val(&etat) as u32);
    }
}

/// Les émulateurs ne sont pas touchés.
#[tauri::command]
pub fn performances(mode: String) {
    let (priorite, economie) = match mode.as_str() {
        "maximum" => (HIGH_PRIORITY_CLASS, false),
        "economie" => (BELOW_NORMAL_PRIORITY_CLASS, true),
        _ => (NORMAL_PRIORITY_CLASS, false),
    };
    let emus = ["eden.exe", "azahar.exe", "dolphin.exe", "cemu.exe", "ffmpeg.exe", "nsz.exe", "eden-room.exe"];
    for pid in processus() {
        unsafe {
            let Ok(h) = OpenProcess(PROCESS_SET_INFORMATION | PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { continue };
            let mut nom = [0u16; 260];
            let mut n = nom.len() as u32;
            let exe = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, windows::core::PWSTR(nom.as_mut_ptr()), &mut n)
                .map(|_| String::from_utf16_lossy(&nom[..n as usize]).to_lowercase())
                .unwrap_or_default();
            if !emus.iter().any(|e| exe.ends_with(e)) {
                regler(h, priorite, economie);
            }
            let _ = CloseHandle(h);
        }
    }
}
