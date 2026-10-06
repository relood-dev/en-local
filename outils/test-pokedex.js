// Test de l'anti-triche du Pokédex : node outils/test-pokedex.js
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const src = fs.readFileSync(process.argv[2] || `${__dirname}/../proto/ui/js/pokedex.js`, 'utf8');
function monde(minutesJoues) {
  const store = {}; const notifs = [];
  let donnees = null;
  const ctx = {
    localStorage: new Proxy(store, { get: (o, k) => o[k], set: (o, k, v) => ((o[k] = String(v)), true) }),
    invoke: async () => JSON.stringify(donnees), notifier: (n) => notifs.push(n.texte), toast() {}, drawProfil() {},
    games: [{ path: 'p', name: 'Pokémon Noire' }], stats: { p: { secs: minutesJoues * 60 } }, estPokemon: (g) => Boolean(g) && /pok/i.test(g.name),
    current: null, onglet: 'accueil', profilVu: null, fiche: () => null, IntersectionObserver: class { observe() {} },
    Date, Math, JSON, Map, Set, Object, Number, String, Array, setTimeout,
  };
  vm.createContext(ctx);
  vm.runInContext(src + '\n;this.api = { chargerPokedex, pokedexAvantPartie, pokedexChiffres, get credit() { return pokedexCredit; }, set t(v) { pokedexAvant.t = v; } };', ctx);
  const save = (pris, poss = []) => (donnees = { jeux: [{ cle: 'B-1-Enzo', version: 'B', jeu: 'Noire', pris, poss }], pokemon: [] });
  return { api: ctx.api, notifs, save, ctx };
}
const range = (n) => Array.from({ length: n }, (_, k) => k + 1);
(async () => {
  // 1. Début honnête : 1 Pokémon pour 10 min de jeu -> compté.
  let w = monde(10); w.save([495], [[495, 0, 0]]); await w.api.chargerPokedex(false);
  assert.equal(w.api.pokedexChiffres().pris, 1);
  // 2. Session normale : +3 espèces en 5 min -> comptées.
  await w.api.pokedexAvantPartie({ name: 'Pokémon Noire' }); w.api.t = Date.now() - 5 * 60000;
  w.save([495, 496, 497, 498]); await w.api.chargerPokedex(true);
  assert.equal(w.api.pokedexChiffres().pris, 4);
  // 3. Sauvegarde complète posée pendant une partie de 5 min -> refusée.
  await w.api.pokedexAvantPartie({ name: 'Pokémon Noire' }); w.api.t = Date.now() - 5 * 60000;
  w.save(range(649)); await w.api.chargerPokedex(true);
  assert.equal(w.api.pokedexChiffres().pris, 4); assert.match(w.notifs.at(-1), /trop rapide/);
  // 4. Sauvegarde changée hors partie (au démarrage) -> rien.
  w.save(range(649)); await w.api.chargerPokedex(true);
  assert.equal(w.api.pokedexChiffres().pris, 4);
  // 5. Premier lancement avec une sauvegarde complète et 20 min de jeu -> rien, avec un message.
  w = monde(20); w.save(range(649)); await w.api.chargerPokedex(false);
  assert.equal(w.api.pokedexChiffres().pris, 0); assert.match(w.notifs.at(-1), /compteront/);
  // 6. Chromatique légal attrapé pendant une partie -> compté.
  w = monde(0); w.save([]); await w.api.chargerPokedex(false);
  await w.api.pokedexAvantPartie({ name: 'Pokémon Noire' }); w.api.t = Date.now() - 30 * 60000;
  w.save([506], [[506, 0, 1]]); await w.api.chargerPokedex(true);
  assert.deepEqual([w.api.pokedexChiffres().pris, w.api.pokedexChiffres().chroma], [1, 1]);
  console.log('6 scénarios OK');
})().catch((e) => { console.error(e); process.exit(1); });
