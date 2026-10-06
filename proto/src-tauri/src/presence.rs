// Statut Discord « Joue à En Local » (Rich Presence).
// Discord fermé : on réessaie à la mise à jour suivante.
use std::sync::Mutex;

use discord_rich_presence::activity::{Activity, Assets, Button, Party, Timestamps};
use discord_rich_presence::{DiscordIpc, DiscordIpcClient};

const APP_ID: &str = "1555468713745190964";
/// Invitation du serveur Le Local.
const SERVER_INVITE: &str = "https://discord.gg/VuAShGB4z2";

static CLIENT: Mutex<Option<DiscordIpcClient>> = Mutex::new(None);

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")] // l'interface envoie joinUrl
pub struct Presence {
    pub details: String,
    pub state: Option<String>,
    /// Début de la partie, en secondes Unix.
    pub start: i64,
    pub session: Option<String>,
    pub players: Option<i32>,
    pub slots: Option<i32>,
    pub join_url: Option<String>,
}

/// Dernier échange avec Discord, dans data\presence.log.
fn noter(texte: &str) {
    let _ = std::fs::write(format!("{}\\data\\presence.log", crate::root()), texte);
}

fn with_client<E: std::fmt::Display>(f: impl FnOnce(&mut DiscordIpcClient) -> Result<(), E>) {
    noter("connexion à Discord…");
    let mut guard = CLIENT.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        let mut client = DiscordIpcClient::new(APP_ID);
        if let Err(e) = client.connect() {
            return noter(&format!("Discord pas joignable : {e}")); // Discord n'est pas lancé
        }
        *guard = Some(client);
    }
    let c = guard.as_mut().unwrap();
    match f(c) {
        // On lit chaque réponse de Discord, sinon elles s'accumulent.
        Ok(()) => match c.recv() {
            Ok((_, v)) => noter(&v.to_string()),
            Err(e) => {
                noter(&format!("Réponse illisible : {e}"));
                *guard = None;
            }
        },
        Err(e) => {
            noter(&format!("Envoi refusé : {e}"));
            *guard = None;
        }
    }
}

pub fn set(p: Presence) {
    std::thread::spawn(move || {
        with_client(|c| {
            // « logo » : image ajoutée dans l'application Discord (Art Assets).
            let mut a = Activity::new().details(&p.details).timestamps(Timestamps::new().start(p.start)).assets(Assets::new().large_image("logo").large_text("En Local"));
            if let Some(state) = p.state.as_deref() {
                a = a.state(state);
            }
            if let (Some(id), Some(n), Some(max)) = (p.session.as_deref(), p.players, p.slots) {
                a = a.party(Party::new().id(id).size([n, max]));
            }
            let mut buttons = Vec::new();
            if let Some(url) = p.join_url.as_deref() {
                buttons.push(Button::new("Rejoindre la session", url));
            }
            buttons.push(Button::new("Discord : Le Local", SERVER_INVITE));
            a = a.buttons(buttons);
            c.set_activity(a)
        });
    });
}

pub fn clear() {
    std::thread::spawn(|| with_client(|c| c.clear_activity()));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore]
    fn vrai_statut() {
        let mut c = DiscordIpcClient::new(APP_ID);
        println!("connexion {:?}", c.connect().map_err(|e| e.to_string()));
        for logo in [true, false] {
            let mut a = Activity::new().details("Test En Local");
            if logo {
                a = a.assets(Assets::new().large_image("logo").large_text("En Local"));
            }
            println!("logo {logo} : {:?}", c.set_activity(a).map_err(|e| e.to_string()));
            println!("reponse {:?}", c.recv().map(|(op, v)| format!("{op} {}", v.to_string().chars().take(300).collect::<String>())).map_err(|e| e.to_string()));
            std::thread::sleep(std::time::Duration::from_secs(2));
        }
        let _ = c.clear_activity();
    }
}
