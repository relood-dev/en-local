/*
 * Saisie de texte plein écran, avec un clavier AZERTY pour la manette.
 * Au clavier, on tape directement dans le champ.
 * valider(valeurs) rend un message d'erreur, ou rien si tout va bien.
 */
let saisie = null;
const saisieOuverte = () => Boolean(saisie);
const CLAVIERS = {
  min: ['1234567890', 'azertyuiop', 'qsdfghjklm', 'wxcvbn-_.@'],
  sym: ['!?#$%&*+=/', '()[]{}<>|\\', '\'"`~^:;,€£', '¨°§µ²'],
};

function saisirTexte(o) {
  saisie = { ...o, champ: 0, maj: false, sym: false, focus: 0, erreur: '' };
  $('#saisie').style.display = 'flex';
  drawSaisie();
  entree($('#saisie .salle-carte'), 'pop-salle');
  setTimeout(() => $('#saisie input')?.focus(), 50);
}
function fermerSaisie() {
  saisie = null;
  $('#saisie').style.display = 'none';
  drawAide();
}

function drawSaisie() {
  const s = saisie;
  const valeurs = Object.fromEntries(s.champs.map((c) => [c.id, $(`#sz-${c.id}`)?.value ?? c.valeur ?? '']));
  const rangs = (s.sym ? CLAVIERS.sym : CLAVIERS.min).map((r) => [...r].map((t) => (s.maj && !s.sym ? t.toUpperCase() : t)));
  let n = 0;
  const el = (html, cls, data) => `<button class="sz-el ${cls}" data-n="${n++}" ${data}>${html}</button>`;
  const champs = s.champs.map((c, k) => `<label class="sz-champ${k === s.champ ? ' actif' : ''}" data-n="${n++}" data-champ="${k}"><small>${esc(c.label)}</small><input id="sz-${c.id}" type="${c.secret ? 'password' : 'text'}" spellcheck="false" autocomplete="off" value="${esc(valeurs[c.id])}"></label>`).join('');
  const clavier = rangs.map((r) => `<div class="rang">${r.map((t) => el(esc(t), 'touche', `data-t="${esc(t)}"`)).join('')}</div>`).join('')
    + `<div class="rang">${el(s.maj ? '⇧ MAJ' : '⇧ maj', `touche moyen${s.maj ? ' actif' : ''}`, 'data-a="maj"')}${el(s.sym ? 'abc' : '#&?', 'touche moyen', 'data-a="sym"')}${el('Espace', 'touche large', 'data-t=" "')}${el(icone('<path d="M20 6H9l-6 6 6 6h11zM12 9l6 6M18 9l-6 6"/>'), 'touche moyen', 'data-a="effacer"')}</div>`;
  $('#saisie').innerHTML = `<div class="salle-carte saisie-carte">
    <h2>${esc(s.titre)}</h2>${s.texte ? `<p>${esc(s.texte)}</p>` : ''}
    <div class="sz-champs">${champs}</div>
    ${s.erreur ? `<p class="sz-erreur">${esc(s.erreur)}</p>` : ''}
    ${s.liens?.length ? `<div class="sz-liens">${s.liens.map((l, k) => el(esc(l.label), 'sz-lien', `data-lien="${k}"`)).join('')}</div>` : ''}
    <div class="clavier sz-clavier">${clavier}</div>
    <div class="salle-actions">${el(`${glyphs.plus}${esc(s.bouton || 'Valider')}`, 'choix main', 'data-a="valider"')}${el(`${glyphs.b}Annuler`, 'choix', 'data-a="annuler"')}</div>
  </div>`;
  const tous = [...$('#saisie').querySelectorAll('[data-n]')];
  tous.forEach((x) => (x.onclick = (e) => {
    if (x.dataset.champ !== undefined) return ((s.champ = +x.dataset.champ), (s.focus = +x.dataset.n), focusSaisie());
    e.preventDefault();
    s.focus = +x.dataset.n;
    activerSaisie();
  }));
  s.champs.forEach((c, k) => {
    const i = $(`#sz-${c.id}`);
    i.onfocus = () => { if (s.champ !== k) (s.champ = k), focusSaisie(); };
  });
  focusSaisie();
}
function focusSaisie() {
  const els = [...$('#saisie').querySelectorAll('[data-n]')];
  saisie.focus = Math.max(0, Math.min(saisie.focus, els.length - 1));
  els.forEach((x) => x.classList.toggle('focus', +x.dataset.n === saisie.focus));
  $('#saisie').querySelectorAll('.sz-champ').forEach((x) => x.classList.toggle('actif', +x.dataset.champ === saisie.champ));
  $('#aide-g').innerHTML = `<div>${glyphs.b}Annuler</div><div>${glyphs.y}Effacer</div>`;
  $('#aide-d').innerHTML = `<div>${glyphs.a}Taper</div><div>${glyphs.plus}${esc(saisie.bouton || 'Valider')}</div>`;
}
const champActif = () => $(`#sz-${saisie.champs[saisie.champ].id}`);
function taperSaisie(t) {
  const i = champActif();
  i.value = (i.value + t).slice(0, 200);
  if (saisie.maj && !saisie.sym) (saisie.maj = false), drawSaisie();
}
function effacerSaisie() {
  const i = champActif();
  i.value = i.value.slice(0, -1);
}
async function validerSaisie() {
  const s = saisie;
  const valeurs = Object.fromEntries(s.champs.map((c) => [c.id, $(`#sz-${c.id}`).value]));
  const erreur = await s.valider(valeurs);
  if (saisie !== s) return;
  if (erreur) return ((s.erreur = erreur), drawSaisie());
  fermerSaisie();
}
function activerSaisie() {
  const x = $('#saisie').querySelector(`[data-n="${saisie.focus}"]`);
  if (!x) return;
  if (x.dataset.champ !== undefined) return ((saisie.champ = +x.dataset.champ), focusSaisie());
  if (x.dataset.t !== undefined) return taperSaisie(x.dataset.t);
  if (x.dataset.lien !== undefined) return saisie.liens[+x.dataset.lien].fn();
  const a = x.dataset.a;
  if (a === 'maj') (saisie.maj = !saisie.maj), drawSaisie();
  if (a === 'sym') (saisie.sym = !saisie.sym), drawSaisie();
  if (a === 'effacer') effacerSaisie();
  if (a === 'valider') validerSaisie();
  if (a === 'annuler') fermerSaisie();
}
function navSaisie(k) {
  const els = [...$('#saisie').querySelectorAll('[data-n]')];
  if (['up', 'down', 'left', 'right'].includes(k)) {
    document.activeElement?.blur();
    const n = voisin(els, els.findIndex((x) => +x.dataset.n === saisie.focus), k);
    if (n >= 0) (saisie.focus = +els[n].dataset.n), focusSaisie();
    return;
  }
  if (k === 'a') return activerSaisie();
  if (k === 'y') return effacerSaisie();
  if (k === 'plus') return validerSaisie();
  if (k === 'b') return fermerSaisie();
}
