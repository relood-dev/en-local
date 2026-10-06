// Fiches des jeux GameTDB (gametdb.com). Bases téléchargées dans data\gametdb\, renouvelées chaque mois.
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{Duration, SystemTime};

#[derive(serde::Serialize, Clone, Default)]
pub struct Info {
    /// Identifiant GameTDB, pour les jaquettes.
    pub id: String,
    pub title: String,
    /// Titre anglais, pour RetroAchievements.
    pub title_en: String,
    pub synopsis: String,
    pub developer: String,
    pub publisher: String,
    pub year: String,
    pub genres: Vec<String>,
    /// Joueurs sur une console (0 : inconnu).
    pub players: u32,
    /// Joueurs en ligne (0 : pas de jeu en ligne).
    pub online: u32,
    /// Jeu eShop : la jaquette GameTDB est un modèle rouge.
    pub eshop: bool,
}

/// Base de chaque console (Wii et GameCube partagent la leur).
fn base(console: &str) -> Option<&'static str> {
    Some(match console {
        "Wii" | "GC" => "wiitdb",
        "DS" => "dstdb",
        "3DS" => "3dstdb",
        "WiiU" => "wiiutdb",
        "Switch" => "switchtdb",
        _ => return None,
    })
}

fn dir() -> PathBuf {
    PathBuf::from(crate::root()).join("data").join("gametdb")
}

/// Téléchargée si elle manque ou a plus d'un mois.
fn xml(name: &str) -> Option<PathBuf> {
    let file = dir().join(format!("{name}.xml"));
    let fresh = std::fs::metadata(&file).ok().and_then(|m| m.modified().ok()).and_then(|t| SystemTime::now().duration_since(t).ok()).is_some_and(|age| age < Duration::from_secs(30 * 86400));
    if !fresh {
        let _ = std::fs::create_dir_all(dir());
        let extra = if name == "wiitdb" { "&GAMECUBE=1" } else { "" };
        let script = format!(
            "$ErrorActionPreference='Stop'; $z = Join-Path $env:TEMP 'enlocal-{name}.zip'; \
             Invoke-WebRequest -UseBasicParsing 'https://www.gametdb.com/{name}.zip?LANG=FR{extra}' -OutFile $z; \
             Expand-Archive -Force $z '{}'; Remove-Item $z",
            dir().display()
        );
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let _ = std::process::Command::new("powershell").args(["-NoProfile", "-Command", &script]).creation_flags(CREATE_NO_WINDOW).status();
    }
    file.exists().then_some(file)
}

/// Fiches des jeux demandés. Switch : par le nom, son code produit n'est pas dans ses fichiers.
pub fn infos(wanted: Vec<(String, String)>) -> HashMap<String, Info> {
    let mut by_base: HashMap<&str, Vec<String>> = HashMap::new();
    for (console, id) in wanted {
        if let Some(b) = base(&console) {
            by_base.entry(b).or_default().push(id);
        }
    }
    let mut out = HashMap::new();
    for (b, ids) in by_base {
        let Some(text) = xml(b).and_then(|f| std::fs::read_to_string(f).ok()) else { continue };
        for id in ids {
            let found = if b == "switchtdb" { find_by_title(&text, &id) } else { find(&text, &id) };
            if let Some(info) = found {
                out.insert(id, info);
            }
        }
    }
    out
}

/// Fiche d'un jeu. Une copie « toutes régions » sans vraie fiche prend celle d'une autre région.
fn find(text: &str, id: &str) -> Option<Info> {
    let entry = |id: &str| -> Option<&str> {
        let at = text.find(&format!("<id>{id}</id>"))?;
        let start = text[..at].rfind("<game ")?;
        let end = at + text[at..].find("</game>")?;
        Some(&text[start..end])
    };
    let is_update = |g: &str| tag(g, "type").is_some_and(|t| t.ends_with("Ware"));
    let mut games: Vec<&str> = entry(id).into_iter().filter(|g| !is_update(g)).collect();
    if games.is_empty() && id.len() == 4 {
        games = "PEJKFDSIUA".chars().filter_map(|r| entry(&format!("{}{r}", &id[..3]))).filter(|g| !is_update(g)).take(1).collect();
    }
    let g = games.first().copied().or_else(|| entry(id))?;
    let locale = |lang: &str| g.find(&format!("<locale lang=\"{lang}\">")).map(|s| &g[s..s + g[s..].find("</locale>").unwrap_or(0)]);
    let pick = |name: &str| locale("FR").and_then(|l| tag(l, name)).filter(|s| !s.is_empty()).or_else(|| locale("EN").and_then(|l| tag(l, name))).unwrap_or_default();
    let input = g.find("<input").map(|s| &g[s..s + g[s..].find('>').unwrap_or(0)]).unwrap_or("");
    let players = attr(input, "players").or_else(|| attr(input, "players-multi-cart")).and_then(|p| p.parse().ok()).unwrap_or(0);
    let wifi = g.find("<wi-fi").map(|s| &g[s..s + g[s..].find('>').unwrap_or(0)]).unwrap_or("");
    Some(Info {
        id: tag(g, "id").unwrap_or_default(),
        title: pick("title"),
        title_en: locale("EN").and_then(|l| tag(l, "title")).filter(|s| !s.is_empty()).unwrap_or_else(|| pick("title")),
        synopsis: pick("synopsis"),
        developer: tag(g, "developer").unwrap_or_default(),
        publisher: tag(g, "publisher").unwrap_or_default(),
        year: g.find("<date ").and_then(|s| attr(&g[s..s + g[s..].find('>').unwrap_or(0)], "year")).unwrap_or_default(),
        genres: tag(g, "genre").map(|s| s.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect()).unwrap_or_default(),
        players,
        online: attr(wifi, "players").and_then(|p| p.parse().ok()).unwrap_or(0),
        eshop: tag(g, "type").as_deref() == Some("eShop"),
    })
}

/// Fiche dont le titre correspond au nom, sans accents ni ponctuation.
fn find_by_title(text: &str, name: &str) -> Option<Info> {
    let want = simple(name);
    if want.is_empty() {
        return None;
    }
    let mots_voulus = mots(name);
    let mut proche: Option<(usize, String)> = None;
    let mut rest = text;
    while let Some(at) = rest.find("<game ") {
        let Some(fin) = rest[at..].find("</game>") else { break };
        let end = at + fin;
        let g = &rest[at..end];
        for t in g.match_indices("<title>").filter_map(|(i, _)| tag(&g[i..], "title")) {
            if simple(&t) == want {
                return find(text, &tag(g, "id")?);
            }
            // Mêmes mots à la ponctuation près, jamais un titre plus long.
            let m = mots(&t);
            if mots_voulus.len() >= 2 && m.len() == mots_voulus.len() && mots_voulus.iter().all(|w| m.contains(w)) && proche.is_none() {
                proche = tag(g, "id").map(|id| (0, id));
            }
        }
        rest = &rest[end..];
    }
    find(text, &proche?.1)
}

fn mots(s: &str) -> Vec<String> {
    const PETITS: [&str; 12] = ["the", "of", "a", "an", "and", "le", "la", "les", "de", "du", "des", "et"];
    let mut out: Vec<String> = s.split(|c: char| !c.is_alphanumeric()).map(simple).filter(|w| !w.is_empty() && !PETITS.contains(&w.as_str())).collect();
    out.dedup();
    out
}

/// Exemple : « Pokémon X : Mise à jour™ » -> « pokemonxmiseajour ».
fn simple(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'à' | 'â' | 'ä' | 'á' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'î' | 'ï' | 'í' => 'i',
            'ô' | 'ö' | 'ó' => 'o',
            'ù' | 'û' | 'ü' | 'ú' => 'u',
            'ç' => 'c',
            c => c,
        })
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

fn tag(xml: &str, name: &str) -> Option<String> {
    let open = format!("<{name}>");
    let from = xml.find(&open)? + open.len();
    let to = from + xml[from..].find(&format!("</{name}>"))?;
    Some(unescape(xml[from..to].trim()))
}

fn attr(tag: &str, name: &str) -> Option<String> {
    let key = format!(" {name}=\"");
    let from = tag.find(&key)? + key.len();
    Some(tag[from..from + tag[from..].find('"')?].to_string())
}

fn unescape(s: &str) -> String {
    let s = s.replace("\r", "").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&#39;", "'");
    s.replace("&amp;", "&")
}

#[cfg(test)]
mod tests {
    use super::find;

    const XML: &str = r#"<datafile>
	<game name="Pokémon X : MAJ"><id>EKJA</id><type>3DSWare</type>
		<locale lang="FR"><title>Pokémon X : Mise à jour</title><synopsis/></locale></game>
	<game name="Pokémon X (Europe)"><id>EKJP</id><type>3DS</type>
		<locale lang="EN"><title>Pokemon X</title><synopsis>An English text.</synopsis></locale>
		<locale lang="FR"><title>Pokémon X</title><synopsis>Un monde en 3D &amp; des Pokémon.</synopsis></locale>
		<developer>Game Freak</developer><publisher>Nintendo</publisher>
		<date year="2013" month="10" day="12"/><genre>adventure,role-playing</genre>
		<wi-fi players="8"><feature>online</feature></wi-fi><input players="4"/></game>
	<game name="Melee"><id>GALP01</id><type>GameCube</type>
		<locale lang="EN"><title>Super Smash Bros. Melee</title><synopsis>Fight.</synopsis></locale>
		<locale lang="FR"><title>Super Smash Bros. Melee</title><synopsis/></locale>
		<wi-fi players="0"/><input players="4"><control type="gamecube"/></input></game>
</datafile>"#;

    #[test]
    fn fiche_d_une_autre_region_si_la_copie_n_a_qu_une_mise_a_jour() {
        let i = find(XML, "EKJA").unwrap();
        assert_eq!(i.title, "Pokémon X");
        assert_eq!(i.synopsis, "Un monde en 3D & des Pokémon.");
        assert_eq!((i.developer.as_str(), i.year.as_str(), i.players, i.online), ("Game Freak", "2013", 4, 8));
        assert_eq!(i.genres, ["adventure", "role-playing"]);
    }

    /// Test avec les vraies bases : cargo test -- --ignored vraies_fiches --nocapture
    #[test]
    #[ignore]
    fn vraies_fiches() {
        let r = super::infos(vec![("3DS".into(), "EKJA".into()), ("GC".into(), "GALP01".into()), ("WiiU".into(), "ALZP01".into()), ("DS".into(), "CPUF".into()), ("Switch".into(), "Super Smash Bros Ultimate".into())]);
        for (id, i) in &r {
            println!("{id} : {} ({}, {}) {} joueurs, en ligne {} — {:.60}", i.title, i.developer, i.year, i.players, i.online, i.synopsis);
        }
        assert_eq!(r.len(), 5);
    }

    #[test]
    fn switch_par_le_nom() {
        let xml = r#"<game name="SSBU"><id>AAABA</id><type>Switch</type>
            <locale lang="EN"><title>Super Smash Bros.™ Ultimate</title><synopsis/></locale>
            <locale lang="FR"><title>Super Smash Bros. Ultimate</title><synopsis>Combats.</synopsis></locale>
            <input players="8"/></game>"#;
        let i = super::find_by_title(xml, "Super Smash Bros Ultimate").unwrap();
        assert_eq!((i.id.as_str(), i.synopsis.as_str(), i.players), ("AAABA", "Combats.", 8));
        assert!(super::find_by_title(xml, "Super Smash Bros").is_none());
        assert!(!i.eshop);
        let eshop = r#"<game name="HKS"><id>AUSUA</id><type>eShop</type><locale lang="EN"><title>Hollow Knight: Silksong</title></locale></game>"#;
        assert!(super::find_by_title(eshop, "Hollow Knight Silksong").unwrap().eshop);
        let zelda = r#"<game name="Z"><id>AAAAA</id><locale lang="EN"><title>The Legend of Zelda: Breath of the Wild</title></locale></game><game name="Z2"><id>AAAAB</id><locale lang="EN"><title>The Legend of Zelda: Breath of the Wild - The Master Trials</title></locale></game>"#;
        assert_eq!(super::find_by_title(zelda, "Legend of Zelda Breath of Wild").unwrap().id, "AAAAA");
        assert!(super::find_by_title(zelda, "Zelda").is_none()); // un seul mot : trop vague
    }

    #[test]
    fn anglais_si_pas_de_texte_francais() {
        let i = find(XML, "GALP01").unwrap();
        assert_eq!((i.synopsis.as_str(), i.players, i.online), ("Fight.", 4, 0));
        assert!(find(XML, "ZZZZ").is_none());
    }
}
