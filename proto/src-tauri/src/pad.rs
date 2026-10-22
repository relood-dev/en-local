// Manettes par SDL3. L'état sert au cœur DS, les appuis aux menus.
// Le bouton Home / PS / Guide ouvre le menu par-dessus le jeu.
use sdl3::event::Event;
use sdl3::gamepad::{Axis, Button, GamepadType};
use std::collections::HashMap;
use std::sync::atomic::{AtomicI16, AtomicU16, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Boutons au format libretro.
pub static BUTTONS: AtomicU16 = AtomicU16::new(0);
/// Sticks gauche et droit, de -32768 à 32767.
pub static AXES: [AtomicI16; 4] = [AtomicI16::new(0), AtomicI16::new(0), AtomicI16::new(0), AtomicI16::new(0)];
/// Nom SDL de la dernière manette. Dolphin la désigne par « SDL/0/<nom> ».
pub static NAME: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());
/// Type de la dernière manette, pour l'aide des touches.
pub static KIND: std::sync::Mutex<&'static str> = std::sync::Mutex::new("");
/// Jeu à distance, côté invité : l'état complet de la manette part vers l'hôte à chaque changement.
static DISTANCE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
#[tauri::command]
pub fn distance_manette(actif: bool) {
    DISTANCE.store(actif, Ordering::Relaxed);
}
/// Boutons libretro, puis les deux sticks.
fn etat(app: &AppHandle) {
    if DISTANCE.load(Ordering::Relaxed) {
        let a = |k: usize| AXES[k].load(Ordering::Relaxed) as i32;
        let _ = app.emit("pad-etat", [BUTTONS.load(Ordering::Relaxed) as i32, a(0), a(1), a(2), a(3)]);
    }
}
/// Identifiant SDL, utilisé par Cemu.
pub static GUID: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());

/*
 * Manettes que SDL ne connaît pas : le joueur dit à En Local quel bouton est quoi (assistant dans
 * les Réglages). La correspondance est gardée dans data\manettes.txt, au format SDL, et donnée
 * aux émulateurs (SDL_GAMECONTROLLERCONFIG). Seulement celles-là : la correspondance d'une manette
 * connue, vue par le SDL3 d'En Local, ne vaut pas pour le SDL des émulateurs (la croix de la
 * DualSense ne répondait plus dans Eden).
 */
/// Correspondances créées par le joueur, à ajouter à SDL au prochain tour de boucle.
static A_AJOUTER: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());

fn fichier_manettes() -> String {
    format!("{}\\data\\manettes.txt", crate::root())
}
fn manettes_perso() -> Vec<String> {
    std::fs::read_to_string(fichier_manettes()).unwrap_or_default().lines().filter(|l| mapping_valide(l)).map(str::to_string).collect()
}
/// « guid,nom,a:b0,…,platform:Windows, » : seulement des champs de manette, rien d'autre.
fn mapping_valide(m: &str) -> bool {
    let mut champs = m.split(',');
    let guid_ok = champs.next().is_some_and(|g| g.len() == 32 && g.bytes().all(|b| b.is_ascii_hexdigit()));
    let nom_ok = champs.next().is_some_and(|n| !n.is_empty() && n.len() <= 64 && !n.contains(['\n', '\r']));
    guid_ok && nom_ok && m.len() < 1024 && champs.filter(|c| !c.is_empty()).all(|c| {
        c.split_once(':').is_some_and(|(k, v)| k.bytes().all(|b| b.is_ascii_lowercase()) && !v.is_empty() && v.bytes().all(|b| b.is_ascii_alphanumeric() || b"+-.~".contains(&b)))
    })
}
/// Pour les émulateurs : les manettes configurées dans En Local.
/// Le contrôle du nom dans l'identifiant est retiré : SDL2 et SDL3 ne le calculent pas pareil.
pub fn mappings() -> String {
    manettes_perso().iter().map(|m| if m.len() > 8 && m.is_char_boundary(8) { format!("{}0000{}", &m[..4], &m[8..]) } else { m.clone() }).collect::<Vec<_>>().join("\n")
}

/// Une manette inconnue configurée par le joueur.
#[tauri::command]
pub fn manette_ajouter(mapping: String) -> Result<(), String> {
    let mapping = if mapping.ends_with(',') { mapping } else { format!("{mapping},") };
    if !mapping_valide(&mapping) {
        return Err("Configuration de manette invalide.".into());
    }
    let guid = &mapping[..32];
    let mut lignes: Vec<String> = manettes_perso().into_iter().filter(|l| !l.starts_with(guid)).collect();
    lignes.push(mapping.clone());
    std::fs::write(fichier_manettes(), lignes.join("\n") + "\n").map_err(|e| e.to_string())?;
    A_AJOUTER.lock().unwrap().push(mapping);
    Ok(())
}

#[derive(serde::Serialize, Clone)]
struct Inconnue {
    nom: String,
    guid: String,
}

// Nintendo : le bouton du bas est B, celui de droite est A.
fn retro_id(b: Button) -> Option<u16> {
    Some(match b {
        Button::South => 0,
        Button::West => 1,
        Button::Back => 2,
        Button::Start => 3,
        Button::DPadUp => 4,
        Button::DPadDown => 5,
        Button::DPadLeft => 6,
        Button::DPadRight => 7,
        Button::East => 8,
        Button::North => 9,
        Button::LeftShoulder => 10,
        Button::RightShoulder => 11,
        Button::LeftStick => 14,
        Button::RightStick => 15,
        _ => return None,
    })
}

fn kind(t: GamepadType) -> &'static str {
    match t {
        GamepadType::PS3 | GamepadType::PS4 | GamepadType::PS5 => "playstation",
        GamepadType::NintendoSwitchPro
        | GamepadType::NintendoSwitchJoyconLeft
        | GamepadType::NintendoSwitchJoyconRight
        | GamepadType::NintendoSwitchJoyconPair => "nintendo",
        _ => "xbox",
    }
}

/// On valide comme sur la console de la manette.
fn menu_name(b: Button, kind: &str) -> Option<&'static str> {
    let nintendo = kind == "nintendo";
    Some(match b {
        Button::Guide => "home",
        Button::DPadUp => "up",
        Button::DPadDown => "down",
        Button::DPadLeft => "left",
        Button::DPadRight => "right",
        Button::East => if nintendo { "a" } else { "b" },
        Button::South => if nintendo { "b" } else { "a" },
        // Par position, comme sur Switch : X en haut, Y à gauche.
        Button::North => "x",
        Button::West => "y",
        Button::Start => "plus",
        Button::Back => "minus",
        // Bouton de partage : menu de capture en jeu.
        Button::Misc1 => "capture",
        Button::LeftShoulder => "lb",
        Button::RightShoulder => "rb",
        _ => return None,
    })
}

#[derive(Clone, serde::Serialize)]
struct Pad {
    name: String,
    kind: &'static str,
}

fn set(id: u16, down: bool) {
    if down {
        BUTTONS.fetch_or(1 << id, Ordering::Relaxed);
    } else {
        BUTTONS.fetch_and(!(1 << id), Ordering::Relaxed);
    }
}

/// Gâchettes : état pour le cœur DS, événement « lt » / « rt » pour les menus.
fn edge(app: &AppHandle, id: u16, down: bool, name: &str) {
    let was = BUTTONS.load(Ordering::Relaxed) & (1 << id) != 0;
    set(id, down);
    if down && !was {
        let _ = app.emit("pad", name);
        let _ = app.emit("pad-brut", name);
    }
}

/// Position physique d'un bouton, pour réassigner les touches.
fn phys(b: Button) -> Option<&'static str> {
    Some(match b {
        Button::South => "south",
        Button::East => "east",
        Button::West => "west",
        Button::North => "north",
        Button::LeftShoulder => "lb",
        Button::RightShoulder => "rb",
        Button::Start => "start",
        Button::Back => "back",
        Button::LeftStick => "l3",
        Button::RightStick => "r3",
        Button::DPadUp => "up",
        Button::DPadDown => "down",
        Button::DPadLeft => "left",
        Button::DPadRight => "right",
        _ => return None,
    })
}

/// Direction maintenue : répétée après un court délai.
const REPETE_APRES: Duration = Duration::from_millis(380);
const REPETE_TOUS: Duration = Duration::from_millis(95);
fn direction(b: Button) -> Option<&'static str> {
    Some(match b {
        Button::DPadUp => "up",
        Button::DPadDown => "down",
        Button::DPadLeft => "left",
        Button::DPadRight => "right",
        _ => return None,
    })
}

/// Rend la nouvelle direction quand elle change (vide : relâché).
fn stick_dir(app: &AppHandle) -> Option<&'static str> {
    static LAST: std::sync::Mutex<&str> = std::sync::Mutex::new("");
    const T: i32 = 20000;
    let (x, y) = (AXES[0].load(Ordering::Relaxed) as i32, AXES[1].load(Ordering::Relaxed) as i32);
    let dir = if x.abs() > y.abs() {
        if x > T { "right" } else if x < -T { "left" } else { "" }
    } else if y > T { "down" } else if y < -T { "up" } else { "" };
    let mut last = LAST.lock().unwrap();
    if dir == *last {
        return None;
    }
    *last = dir;
    if !dir.is_empty() {
        let _ = app.emit("pad", dir);
    }
    Some(dir)
}

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        // Sans ce réglage, SDL ignore la manette quand la fenêtre n'a pas le focus.
        sdl3::hint::set("SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS", "1");
        let sdl = match sdl3::init() {
            Ok(s) => s,
            Err(e) => return eprintln!("SDL : {e}"),
        };
        let (Ok(gamepads), Ok(joysticks), Ok(mut events)) = (sdl.gamepad(), sdl.joystick(), sdl.event_pump()) else {
            return eprintln!("manettes indisponibles");
        };
        for m in manettes_perso() {
            let _ = gamepads.add_mapping(&m);
        }
        let mut open = HashMap::new();
        // Manettes inconnues ouvertes, et position de repos de leurs axes (les gâchettes reposent à -32768).
        let mut inconnues = HashMap::new();
        let mut repos: HashMap<(u32, u8), (i16, bool)> = HashMap::new();
        let mut last = "";
        let mut tenue: Option<(&'static str, Instant)> = None;
        loop {
            let attente = tenue.map_or(100, |(_, t)| t.saturating_duration_since(Instant::now()).as_millis().max(1) as u32);
            let ev = events.wait_event_timeout_ms(attente);
            if let Some((dir, t)) = tenue {
                if Instant::now() >= t {
                    let _ = app.emit("pad", dir);
                    tenue = Some((dir, t + REPETE_TOUS));
                }
            }
            for m in std::mem::take(&mut *A_AJOUTER.lock().unwrap()) {
                let _ = gamepads.add_mapping(&m); // SDL annonce ensuite la manette comme connue
            }
            let Some(ev) = ev else { continue };
            let manette = matches!(ev, Event::GamepadButtonDown { .. } | Event::GamepadButtonUp { .. } | Event::GamepadAxisMotion { .. });
            match ev {
                Event::JoyDeviceAdded { which, .. } if !gamepads.is_gamepad(which) => {
                    // Annoncée seulement quand on appuie dessus : Windows montre aussi des
                    // périphériques qui n'en sont pas (pilotes, manettes virtuelles).
                    if let Ok(j) = joysticks.open(which) {
                        inconnues.insert(which, j);
                    }
                }
                Event::JoyDeviceRemoved { which, .. } => {
                    inconnues.remove(&which);
                }
                // Appuis d'une manette inconnue, au format SDL : b3, h0.4, +a2, -a2 (a2 : gâchette).
                Event::JoyButtonDown { which, button_idx, .. } if inconnues.contains_key(&which) => {
                    if let Some(j) = inconnues.get(&which) {
                        let _ = app.emit("pad-inconnue", Inconnue { nom: j.name(), guid: j.guid().string() });
                    }
                    let _ = app.emit("pad-inconnue-appui", format!("b{button_idx}"));
                }
                Event::JoyHatMotion { which, hat_idx, state, .. } if inconnues.contains_key(&which) => {
                    let v = state as u8;
                    if matches!(v, 1 | 2 | 4 | 8) {
                        let _ = app.emit("pad-inconnue-appui", format!("h{hat_idx}.{v}"));
                    }
                }
                Event::JoyAxisMotion { which, axis_idx, value, .. } if inconnues.contains_key(&which) => {
                    let (base, actif) = repos.entry((which.raw(), axis_idx)).or_insert((value, false));
                    let ecart = value as i32 - *base as i32;
                    if !*actif && ecart.abs() > 20000 {
                        *actif = true;
                        let gachette = *base < -24000;
                        let _ = app.emit("pad-inconnue-appui", if gachette { format!("a{axis_idx}") } else { format!("{}a{axis_idx}", if ecart > 0 { '+' } else { '-' }) });
                    } else if *actif && ecart.abs() < 8000 {
                        *actif = false;
                    }
                }
                Event::GamepadAdded { which, .. } => {
                    inconnues.remove(&which);
                    if let Ok(pad) = gamepads.open(which) {
                        let info = Pad { name: pad.name().unwrap_or_else(|| "Manette".into()), kind: kind(pad.r#type()) };
                        last = info.kind;
                        *KIND.lock().unwrap() = info.kind;
                        *NAME.lock().unwrap() = info.name.clone();
                        *GUID.lock().unwrap() = gamepads.guid_for_id(which).string();
                        let _ = app.emit("pad-connected", info.clone());
                        open.insert(which, (pad, info));
                    }
                }
                Event::GamepadRemoved { which, .. } => {
                    open.remove(&which);
                }
                Event::GamepadButtonDown { which, button, .. } => {
                    if let Some(id) = retro_id(button) {
                        set(id, true);
                    }
                    // La dernière manette utilisée choisit les symboles affichés.
                    if let Some((_, info)) = open.get(&which) {
                        if info.kind != last {
                            last = info.kind;
                            *KIND.lock().unwrap() = info.kind;
                            *NAME.lock().unwrap() = info.name.clone();
                            let _ = app.emit("pad-connected", info.clone());
                        }
                    }
                    if let Some(p) = phys(button) {
                        let _ = app.emit("pad-brut", p);
                    }
                    if let Some(d) = direction(button) {
                        tenue = Some((d, Instant::now() + REPETE_APRES));
                    }
                    if let Some(name) = menu_name(button, last) {
                        if name == "home" {
                            crate::garder_focus(&app);
                            crate::toggle_home(&app);
                        }
                        let _ = app.emit("pad", name);
                    }
                }
                Event::GamepadButtonUp { button, .. } => {
                    if let Some(id) = retro_id(button) {
                        set(id, false);
                    }
                    if direction(button).is_some() && tenue.map(|(d, _)| d) == direction(button) {
                        tenue = None;
                    }
                }
                Event::GamepadAxisMotion { axis, value, .. } => match axis {
                    Axis::LeftX | Axis::LeftY => {
                        AXES[if axis == Axis::LeftX { 0 } else { 1 }].store(value, Ordering::Relaxed);
                        if let Some(d) = stick_dir(&app) {
                            tenue = (!d.is_empty()).then(|| (d, Instant::now() + REPETE_APRES));
                        }
                    }
                    Axis::RightX => AXES[2].store(value, Ordering::Relaxed),
                    Axis::RightY => AXES[3].store(value, Ordering::Relaxed),
                    Axis::TriggerLeft => edge(&app, 12, value > 16000, "lt"),
                    Axis::TriggerRight => edge(&app, 13, value > 16000, "rt"),
                },
                _ => {}
            }
            if manette {
                etat(&app);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    #[test]
    fn mappings_de_manette() {
        let ok = "03001234c82d00000161000000000000,EchtPower,a:b1,b:b2,dpup:h0.1,lefttrigger:a2,leftx:a0,lefty:a1~,platform:Windows,";
        assert!(super::mapping_valide(ok));
        assert!(!super::mapping_valide("pas un guid,Nom,a:b1,"));
        assert!(!super::mapping_valide("03001234c82d00000161000000000000,Nom\nautre,a:b1,"));
        assert!(!super::mapping_valide("03001234c82d00000161000000000000,Nom,a:b1;rm,"));
        assert!(!super::mapping_valide("03001234c82d00000161000000000000,Nom,A:b1,"));
    }
}
