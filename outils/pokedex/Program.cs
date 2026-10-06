// Lit les sauvegardes Pokémon des dossiers donnés avec PKHeX.Core et écrit un JSON.
// Usage : pokedex <dossier> [<dossier>…]
using System.Text.Json;
using PKHeX.Core;

// Test (--essai <dossier>) : crée une sauvegarde Ultra-Lune connue puis la lit.
if (args.Length == 2 && args[0] == "--essai")
{
    var essai = BlankSaveFile.Get(GameVersion.UM);
    // Attrapé puis relâché : il reste dans le Pokédex du jeu.
    essai.SetBoxSlotAtIndex(new PK7 { Species = 25, CurrentLevel = 5, Version = GameVersion.UM, Language = 2 }, 1, EntityImportSettings.All);
    essai.SetBoxSlotAtIndex(new PK7(), 1);
    essai.SetBoxSlotAtIndex(new PK7 { Species = 26, Form = 1, CurrentLevel = 30, Version = GameVersion.UM, Language = 2, PID = 0x12345678, TID16 = 4242 }, 2, EntityImportSettings.All);
    var evoli = new PK7 { Species = 133, Form = 0, CurrentLevel = 5, Version = GameVersion.UM, Language = 2 };
    evoli.SetShiny();
    essai.SetBoxSlotAtIndex(evoli, 0, EntityImportSettings.All);
    var dossierEssai = Path.Combine(args[1], "title", "00040000", "001b5100", "data", "00000001");
    Directory.CreateDirectory(dossierEssai);
    File.WriteAllBytes(Path.Combine(dossierEssai, "main"), essai.Write().ToArray());
    args = new[] { args[1] };
}
var fr = GameInfo.GetStrings("fr");
var jeux = new List<object>();
// (espèce, forme) -> état
var pokemon = new Dictionary<(ushort, byte), Etat>();
Etat Etat(ushort n, byte f) => pokemon.TryGetValue((n, f), out var e) ? e : pokemon[(n, f)] = new Etat();

foreach (var dossier in args.Where(Directory.Exists))
{
    foreach (var fichier in Directory.EnumerateFiles(dossier, "*", SearchOption.AllDirectories))
    {
        long taille;
        try { taille = new FileInfo(fichier).Length; } catch { continue; }
        if (taille < 0x2000 || taille > 0x400000) continue; // taille hors de celles des sauvegardes Pokémon
        SaveFile? sav;
        try
        {
            var octets = File.ReadAllBytes(fichier);
            if (!SaveUtil.TryGetSaveFile((Memory<byte>)octets, out sav, fichier)) sav = ParJeu(fichier, octets);
        }
        catch { continue; }
        if (sav is null || sav.Generation == 0) continue;
        var version = sav.Version.ToString();
        var nomJeu = (int)sav.Version < fr.gamelist.Length ? fr.gamelist[(int)sav.Version] : version;

        // Pokédex du jeu : vu et attrapé (même relâché depuis).
        var prisJeu = new List<ushort>();
        var vusJeu = new List<ushort>();
        for (ushort n = 1; n <= sav.MaxSpeciesID; n++)
        {
            bool vu, pris;
            try { vu = sav.GetSeen(n); pris = sav.GetCaught(n); } catch { continue; }
            if (!vu && !pris) continue;
            var e = Etat(n, 0);
            e.Vu |= vu || pris;
            e.Pris |= pris;
            if (pris) e.Jeux.Add(version);
            if (pris) prisJeu.Add(n); else vusJeu.Add(n);
        }
        // Carte de dresseur : nom, ID, temps, argent, badges et Pokédex régional.
        var (nomDex, regional) = Regional(sav);
        // Pokémon possédés (équipe et boîtes). Ceux refusés par le contrôle de légalité de PKHeX ne comptent pas.
        var possJeu = new List<int[]>();
        var illegaux = 0;
        IEnumerable<PKM> possedes = sav.BoxData;
        if (sav.HasParty) possedes = possedes.Concat(sav.PartyData);
        foreach (var pk in possedes)
        {
            if (pk.Species == 0 || pk.Species > sav.MaxSpeciesID || pk.IsEgg) continue;
            bool legal;
            try { legal = new LegalityAnalysis(pk).Valid; } catch { legal = false; }
            if (!legal) { illegaux++; continue; }
            possJeu.Add(new[] { (int)pk.Species, (int)pk.Form, pk.IsShiny ? 1 : 0 });
            foreach (var f in new byte[] { 0, pk.Form }.Distinct())
            {
                var e = Etat(pk.Species, f);
                e.Vu = e.Pris = true;
                e.Jeux.Add(version);
                if (f == pk.Form && pk.IsShiny) e.Chroma = true;
                if (f == pk.Form) e.Possedes++;
            }
        }
        // cle : identité de la sauvegarde (jeu, ID et nom du dresseur).
        jeux.Add(new
        {
            fichier, cle = $"{version}-{sav.ID32}-{sav.OT}", jeu = nomJeu, version, generation = sav.Generation, dresseur = sav.OT,
            id = sav.DisplayTID, genre = sav.Gender, heures = sav.PlayedHours, minutes = sav.PlayedMinutes, argent = sav.Money,
            badges = Badges(sav), dex = nomDex, regional, pris = prisJeu, vus = vusJeu, max = sav.MaxSpeciesID,
            poss = possJeu, illegaux,
        });
    }
}

var noms = fr.specieslist;
var sortie = pokemon.OrderBy(kv => kv.Key.Item1).ThenBy(kv => kv.Key.Item2).Select(kv =>
{
    var (n, f) = kv.Key;
    string forme = "";
    if (f != 0)
    {
        try
        {
            var formes = FormConverter.GetFormList(n, fr.types, fr.forms, GameInfo.GenderSymbolUnicode, EntityContext.Gen9);
            forme = f < formes.Length ? formes[f] : f.ToString();
        }
        catch { forme = f.ToString(); }
    }
    var e = kv.Value;
    return new { n, f, nom = n < noms.Length ? noms[n] : n.ToString(), forme, vu = e.Vu, pris = e.Pris, chroma = e.Chroma, possedes = e.Possedes, jeux = e.Jeux.Order().ToArray() };
});
// noms : tous les noms français, de 0 à 1025.
Console.Out.Write(JsonSerializer.Serialize(new { jeux, pokemon = sortie, total = 1025, noms = noms.Take(1026).ToArray() }));

// Le chemin donne le jeu (title ID). Gardée seulement si les sommes de contrôle sont bonnes.
static SaveFile? ParJeu(string fichier, byte[] o)
{
    var chemin = fichier.ToUpperInvariant();
    bool jeu(params string[] ids) => ids.Any(chemin.Contains);
    SaveFile? s = null;
    try
    {
        if (jeu("\\0011C400\\", "\\0011C500\\")) s = new SAV6AO(o);
        else if (jeu("\\00055D00\\", "\\00055E00\\")) s = new SAV6XY(o);
        else if (jeu("\\00164800\\", "\\00175E00\\")) s = new SAV7SM(o);
        else if (jeu("\\001B5000\\", "\\001B5100\\")) s = new SAV7USUM(o);
        else if (jeu("\\010003F003A34000\\", "\\0100187003A36000\\")) s = new SAV7b(o);
        else if (jeu("\\0100ABF008968000\\", "\\01008DB008C2C000\\")) s = new SAV8SWSH(o);
        else if (jeu("\\0100000011D90000\\", "\\010018E011D92000\\")) s = new SAV8BS(o);
        else if (jeu("\\01001F5010DFA000\\")) s = new SAV8LA(o);
        else if (jeu("\\0100A3D008C5C000\\", "\\01008F6008C5E000\\")) s = new SAV9SV(o);
    }
    catch { return null; }
    return s is { ChecksumsValid: true } ? s : null;
}

// Un bit par badge (16 pour HGSS). -1 si inconnu.
static int Badges(SaveFile sav)
{
    // 5e génération : dans le bloc Misc.
    if (sav is SAV5BW bw) return bw.Misc.Badges;
    if (sav is SAV5B2W2 b2) return b2.Misc.Badges;
    var t = sav.GetType();
    var p = t.GetProperty("Badges16") ?? t.GetProperty("Badges");
    try { return p is null ? -1 : Convert.ToInt32(p.GetValue(sav)); } catch { return -1; }
}
// Pokédex régional (8e génération et après) : [espèce, numéro]. Sinon le national.
static (string, int[][]) Regional(SaveFile sav)
{
    string? prop = sav switch
    {
        SAV8SWSH => "PokeDexIndex",
        SAV8BS => "PokeDexIndex",
        SAV8LA => "DexIndexHisui",
        SAV9SV => "DexPaldea",
        _ => null,
    };
    string nom = sav switch { SAV8SWSH => "Pokédex de Galar", SAV8BS => "Pokédex de Sinnoh", SAV8LA => "Pokédex de Hisui", SAV9SV => "Pokédex de Paldea", _ => "Pokédex national" };
    if (prop is null) return (nom, Array.Empty<int[]>());
    var l = new List<int[]>();
    for (ushort n = 1; n <= sav.MaxSpeciesID; n++)
    {
        try
        {
            var info = sav.Personal[n];
            var v = info.GetType().GetProperty(prop)?.GetValue(info);
            if (v is not null && Convert.ToInt32(v) > 0) l.Add(new[] { (int)n, Convert.ToInt32(v) });
        }
        catch { }
    }
    return (nom, l.OrderBy(x => x[1]).ToArray());
}

class Etat
{
    public bool Vu, Pris, Chroma;
    public int Possedes;
    public HashSet<string> Jeux = new();
}
