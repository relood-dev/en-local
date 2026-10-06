/*
 * Salle de session et saisie du code, en plein écran.
 * Code : 3 lettres et 3 chiffres (ex. KQM-482).
 */
const LETTRES = 'ABCDEFGHJKLMNPQRSTUVWXYZ', CHIFFRES = '23456789';
let salle = null;
let salleFocus = 0;

function ouvrirSalle(etat) {
  salle = etat;
  salleFocus = 0;
  $('#salle').style.display = 'flex';
  drawSalle();
  entree($('#salle .salle-carte'), 'pop-salle');
}
function fermerSalle() {
  salle = null;
  $('#salle').style.display = 'none';
}

/* ---------- Salle ---------- */

/** etat : { i, hosting, texte?, actions: [{ label, k, fn }] } */
function salleSession(etat) {
  if (salle?.mode === 'salle' && salle.i === etat.i) Object.assign(salle, etat), drawSalle();
  else ouvrirSalle({ mode: 'salle', ...etat });
}

function drawSalle() {
  if (!salle) return;
  if (salle.mode === 'code') return drawCode();
  const g = games[salle.i];
  const titre = fiche(g)?.title || g.name;
  const parId = new Map(membres.map((m) => [m.id, m]));
  const joueurs = (session?.members || []).map((m) => ({ ...m, avatar: parId.get(m.id)?.avatar || (m.id === me?.id ? me.avatar : '') }));
  if (!joueurs.length && me) joueurs.push({ id: me.id, name: me.name, avatar: me.avatar });
  const places = Math.max(session?.slots || 2, joueurs.length);
  const cases = Array.from({ length: places }, (_, k) => {
    const j = joueurs[k];
    return j ? `<div class="joueur"><img class="av" src="${esc(j.avatar || 'img/hang-coucou.png')}" alt=""><span>${esc(j.name || '')}${k === 0 && salle.hosting ? ' <i>hôte</i>' : ''}</span></div>`
      : '<div class="joueur libre"><span class="av"></span><span>Place libre</span></div>';
  }).join('');
  // Seules les parties qui changent sont redessinées, pour éviter le clignotement.
  const parties = {
    jeu: `<div class="icone grande">${iconeHtml(g)}</div><div><h2>${esc(titre)}</h2><span>${LONG[g.console]}</span></div>`,
    code: `<small>Code de la session</small><b>${esc(session?.code || '…')}</b><span>${esc(salle.texte || (salle.hosting ? 'Les membres le voient dans le Local et sur Discord.' : 'Tu es dans la session.'))}</span>`,
    joueurs: cases,
    actions: salle.actions.map((a, n) => `<button class="choix${n === salleFocus ? ' focus' : ''}" data-n="${n}">${n === salleFocus ? glyphs.a : a.k !== 'a' ? glyphs[a.k] || '' : ''}${esc(a.label)}</button>`).join(''),
    loc: `<img src="img/loc/loc_${salle.hosting ? 'attente' : 'enligne'}.gif" alt="">`,
  };
  const box = $('#salle');
  if (!box.querySelector('.salle-carte:not(.saisie)')) {
    box.innerHTML = `<div class="salle-carte">${Object.keys(parties).map((k) => `<div class="salle-${k}"></div>`).join('')}</div>`;
  }
  for (const [k, html] of Object.entries(parties)) {
    const el = box.querySelector('.salle-' + k);
    if (el._html !== html) (el.innerHTML = html), (el._html = html);
  }
  box.querySelectorAll('.choix').forEach((b) => (b.onclick = () => actionSalle(+b.dataset.n)));
}
function actionSalle(n) {
  const a = salle?.actions[n];
  if (a) a.fn();
}

/** Membres à inviter, ceux sur En Local d'abord. */
function choisirInvite() {
  const dedans = new Set((session?.members || []).map((m) => m.id));
  const candidats = membres.filter((m) => !m.me && !dedans.has(m.id)).sort((a, b) => (a.app === 'en-ligne' ? 0 : 1) - (b.app === 'en-ligne' ? 0 : 1));
  if (!candidats.length) return toast('Personne à inviter pour l\'instant.');
  sheet('Inviter', 'Loc lui envoie un message sur Discord avec le bouton pour rejoindre.', [
    ...candidats.slice(0, 30).map((m) => ({ label: `${m.name}${m.app === 'en-ligne' ? ' · sur En Local' : ''}`, fn: () => inviter(m) })),
    { label: 'Annuler', cancel: true },
  ]);
}

/* ---------- Code ---------- */

/** suite(code) : à la place de join (session en pleine partie). annuler : au retour. */
function ouvrirCode(prefill = '', { suite, annuler } = {}) {
  if (!me) return login();
  const brut = String(prefill).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const valeurs = Array.from({ length: 6 }, (_, k) => {
    const jeu = k < 3 ? LETTRES : CHIFFRES;
    const c = brut[k];
    return c && jeu.includes(c) ? jeu.indexOf(c) : -1;
  });
  ouvrirSalle({ mode: 'code', valeurs, pos: valeurs.findIndex((v) => v < 0) === -1 ? 5 : Math.max(0, valeurs.findIndex((v) => v < 0)), lien: Boolean(prefill), suite, annuler });
}
const codeTexte = () => salle.valeurs.map((v, k) => (v < 0 ? '' : (k < 3 ? LETTRES : CHIFFRES)[v])).join('');
const codeComplet = () => salle.valeurs.every((v) => v >= 0);

function drawCode() {
  const roue = (v, k) => {
    const jeu = k < 3 ? LETTRES : CHIFFRES;
    const car = (d) => (v < 0 ? (d ? '' : '·') : jeu[(v + d + jeu.length) % jeu.length]);
    return `<div class="roue${k === salle.pos ? ' active' : ''}" data-k="${k}"><span class="voisin">${car(-1)}</span><b>${car(0)}</b><span class="voisin">${car(1)}</span></div>`;
  };
  $('#salle').innerHTML = `<div class="salle-carte saisie">
    <h2>Rejoindre une session</h2>
    <p>${salle.lien ? 'Session partagée sur Discord.' : 'Le code donné par l\'hôte, ou sur sa carte dans Discord.'}</p>
    <div class="roues">${salle.valeurs.slice(0, 3).map(roue).join('')}<i>-</i>${salle.valeurs.slice(3).map((v, k) => roue(v, k + 3)).join('')}</div>
    <div class="salle-actions"><button class="choix focus${codeComplet() ? '' : ' grise'}" data-a="ok">${glyphs.a}Rejoindre</button><button class="choix" data-a="non">${glyphs.b}Annuler</button></div>
    <img class="salle-loc" src="img/loc/loc_enligne.gif" alt="">
  </div>`;
  $('#salle').querySelectorAll('.roue').forEach((el) => (el.onclick = () => ((salle.pos = +el.dataset.k), drawCode())));
  $('#salle').querySelector('[data-a="ok"]').onclick = validerCode;
  $('#salle').querySelector('[data-a="non"]').onclick = annulerCode;
}
function annulerCode() {
  const a = salle?.annuler;
  fermerSalle();
  a?.();
}
function tourner(d) {
  const jeu = salle.pos < 3 ? LETTRES : CHIFFRES;
  const v = salle.valeurs[salle.pos];
  salle.valeurs[salle.pos] = v < 0 ? (d > 0 ? 0 : jeu.length - 1) : (v + d + jeu.length) % jeu.length;
  drawCode();
  entree($('#salle .roue.active'), d > 0 ? 'tourne-bas' : 'tourne-haut');
}
function validerCode() {
  if (!codeComplet()) return entree($('#salle .roues'), 'non');
  const code = codeTexte();
  const suite = salle.suite || join;
  fermerSalle();
  suite(`${code.slice(0, 3)}-${code.slice(3)}`);
}
function taperCode(touche) {
  const c = touche.toUpperCase();
  if (touche === 'Backspace') {
    if (salle.valeurs[salle.pos] < 0 && salle.pos > 0) salle.pos--;
    salle.valeurs[salle.pos] = -1;
    return drawCode();
  }
  const jeu = salle.pos < 3 ? LETTRES : CHIFFRES;
  if (c.length !== 1 || !jeu.includes(c)) return false;
  salle.valeurs[salle.pos] = jeu.indexOf(c);
  salle.pos = Math.min(5, salle.pos + 1);
  drawCode();
  return true;
}

/* ---------- Touches ---------- */

function navSalle(k) {
  if (salle.mode === 'code') {
    if (k === 'up' || k === 'down') return tourner(k === 'up' ? -1 : 1);
    if (k === 'left' || k === 'right') return ((salle.pos = Math.max(0, Math.min(5, salle.pos + (k === 'left' ? -1 : 1)))), drawCode());
    if (k === 'a') return codeComplet() ? validerCode() : ((salle.pos = Math.min(5, salle.pos + 1)), drawCode());
    if (k === 'b') return annulerCode();
    return;
  }
  const n = salle.actions.length;
  if (k === 'left' || k === 'right') return ((salleFocus = (salleFocus + (k === 'left' ? -1 : 1) + n) % n), drawSalle());
  if (k === 'a') return actionSalle(salleFocus);
  const a = salle.actions.find((x) => x.k === k);
  if (a) a.fn();
}
