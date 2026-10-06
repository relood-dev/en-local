//! Volume des jeux en direct : DS par En Local, les autres par le mélangeur de Windows.

use windows::core::Interface;
use windows::Win32::Media::Audio::{eRender, IAudioSessionControl2, IAudioSessionManager2, IMMDeviceEnumerator, ISimpleAudioVolume, MMDeviceEnumerator, DEVICE_STATE_ACTIVE};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};
use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS};

const EMULATEURS: [&str; 5] = ["eden.exe", "azahar.exe", "dolphin.exe", "cemu.exe", "azahar-plus.exe"];

fn pids() -> Vec<u32> {
    let mut out = Vec::new();
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return out };
        let mut e = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut ok = Process32FirstW(snap, &mut e).is_ok();
        while ok {
            let nom = String::from_utf16_lossy(&e.szExeFile[..e.szExeFile.iter().position(|&c| c == 0).unwrap_or(0)]).to_lowercase();
            if EMULATEURS.contains(&nom.as_str()) {
                out.push(e.th32ProcessID);
            }
            ok = Process32NextW(snap, &mut e).is_ok();
        }
        let _ = windows::Win32::Foundation::CloseHandle(snap);
    }
    out
}

/// Volume de 0 à 1. Rend le nombre de sessions audio modifiées.
pub fn volume_jeux(v: f32) -> usize {
    let v = v.clamp(0.0, 1.0);
    crate::libretro::gain(v);
    let pids = pids();
    if pids.is_empty() {
        return 0;
    }
    let mut n = 0;
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let Ok(en) = CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL) else { return 0 };
        let Ok(sorties) = en.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) else { return 0 };
        for d in 0..sorties.GetCount().unwrap_or(0) {
            let Ok(sortie) = sorties.Item(d) else { continue };
            let Ok(gestion) = sortie.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) else { continue };
            let Ok(sessions) = gestion.GetSessionEnumerator() else { continue };
            for i in 0..sessions.GetCount().unwrap_or(0) {
                let Ok(s) = sessions.GetSession(i) else { continue };
                let Ok(s2) = s.cast::<IAudioSessionControl2>() else { continue };
                if !s2.GetProcessId().is_ok_and(|p| pids.contains(&p)) {
                    continue;
                }
                if let Ok(vol) = s.cast::<ISimpleAudioVolume>() {
                    if vol.SetMasterVolume(v, std::ptr::null()).is_ok() {
                        n += 1;
                    }
                }
            }
        }
    }
    n
}
