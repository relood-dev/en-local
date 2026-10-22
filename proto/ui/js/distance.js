/*
 * Jeu à distance, façon Parsec : le jeu tourne chez l'hôte (Switch). L'image de la fenêtre d'En Local
 * et le son de l'émulateur (distance.rs) partent en WebRTC, directement de PC à PC. Les manettes des
 * invités reviennent par un canal de données ; Eden les lit comme joueurs 2 à 8.
 * Loc ne passe que les messages de connexion (/sessions/:code/signal).
 */
const ICE_DISTANCE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
let distance = null; // { role: 'hote' | 'invite', code, … }

const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));
const signal = (d, to, data) => api('POST', `/sessions/${d.code}/signal`, { to, data });
const journal = (texte) => invoke('journal', { texte: `jeu à distance : ${texte}` }).catch(() => {});

/** Toutes les 30 s dans le journal : ping, images/s, et chez l'hôte ce qui freine l'encodeur (cpu, bandwidth). */
function mesurer(pc, qui) {
  const t = setInterval(async () => {
    if (['closed', 'failed'].includes(pc.connectionState)) return clearInterval(t);
    const m = [];
    (await pc.getStats()).forEach((x) => {
      if (x.type === 'candidate-pair' && x.nominated && x.currentRoundTripTime != null) m.push(`ping ${Math.round(x.currentRoundTripTime * 1000)} ms`);
      if (x.type === 'outbound-rtp' && x.kind === 'video') m.push(`${x.framesPerSecond ?? 0} i/s ${x.frameHeight ?? '?'}p, frein ${x.qualityLimitationReason}`);
      if (x.type === 'inbound-rtp' && x.kind === 'video') m.push(`${x.framesPerSecond ?? 0} i/s ${x.frameHeight ?? '?'}p, ${x.framesDropped ?? 0} perdues, tampon ${x.jitterBufferEmittedCount ? Math.round((x.jitterBufferDelay / x.jitterBufferEmittedCount) * 1000) : '?'} ms`);
    });
    journal(`${qui} : ${m.join(', ')}`);
  }, 30_000);
}
const nomMembre = (id) => session?.members?.find((m) => m.id === id)?.name || 'Un joueur';

/** Description locale avec tous ses candidats : un seul message dans chaque sens. */
async function descriptionComplete(pc) {
  if (pc.iceGatheringState !== 'complete') {
    await Promise.race([new Promise((ok) => pc.addEventListener('icegatheringstatechange', () => pc.iceGatheringState === 'complete' && ok())), attendre(4000)]);
  }
  return pc.localDescription.sdp;
}

/** Messages de Loc : la requête attend jusqu'à 25 s (pas de minuterie, l'interface cachée en jeu la ralentirait). */
async function boucleSignaux(d) {
  while (distance === d) {
    let msgs;
    try {
      msgs = await api('GET', `/sessions/${d.code}/signal?attente=25000${d.role === 'hote' ? '&ecran=1' : ''}`);
    } catch (e) {
      if (/terminée/.test(String(e))) return finDistance(d.role === 'invite' ? `${d.hote.name} a arrêté la partie.` : '');
      await attendre(3000);
      continue;
    }
    for (const m of msgs) if (distance === d) await (d.role === 'hote' ? messageHote : messageInvite)(d, m).catch((e) => console.error('jeu à distance', e));
  }
}

/* ---------- Hôte ---------- */

/**
 * Jeux dont le sans fil local est limité en consoles : en session, ceux qui font tourner le jeu prennent
 * aussi des invités à distance. Super Mario Party : 2 consoles au plus, 2 joueurs chacune.
 */
const INVITES_EN_SESSION = ['010036B0034E4000'];
const invitesEnSession = (g) => Boolean(session && !session.distance && INVITES_EN_SESSION.includes((g?.title_id || '').toUpperCase()));

/**
 * Après le lancement en session à distance, ou d'un jeu de INVITES_EN_SESSION : on attend les invités.
 * La capture de la fenêtre (choisie d'office, voir tauri.conf.json) et du son ne démarre qu'avec le premier.
 */
function distanceHote() {
  if (!session || distance) return;
  distance = { role: 'hote', code: session.code, pairs: new Map() };
  compter('distance');
  boucleSignaux(distance);
}
async function capturer(d) {
  try {
    d.capture = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 60 }, width: { max: 1920 }, height: { max: 1080 } }, audio: false });
    const image = d.capture.getVideoTracks()[0];
    image.contentHint = 'motion';
    d.ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    if (d.ctx.state !== 'running') await d.ctx.resume().catch(() => {});
    await d.ctx.audioWorklet.addModule('js/distance-son.js');
    const noeud = new AudioWorkletNode(d.ctx, 'son-distance', { outputChannelCount: [2] });
    const sortie = d.ctx.createMediaStreamDestination();
    noeud.connect(sortie);
    const son = new Channel();
    son.onmessage = (buf) => {
      if (!d.sonRecu) (d.sonRecu = true), journal(`son reçu (${buf.byteLength} octets, contexte ${d.ctx.state})`);
      noeud.port.postMessage(buf, [buf]);
    };
    await invoke('distance_debut', { son });
    // Image et son dans deux flux : le navigateur ne retarde pas l'image pour la caler sur le son.
    d.flux = [new MediaStream([image]), sortie.stream];
  } catch (e) {
    d.capture?.getTracks().forEach((t) => t.stop());
    d.ctx?.close();
    d.capture = d.ctx = null;
    journal(`capture impossible : ${e.message || e}`);
    toast(`Jeu à distance impossible : ${e.message || e}`);
  }
}

async function messageHote(d, { from, data }) {
  if (data?.type === 'reponse') return d.pairs.get(from)?.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
  if (data?.type === 'aurevoir') return fermerPair(d, from);
  if (data?.type === 'clavier') return d.pairs.has(from) && repondreClavier(Boolean(data.ok), String(data.texte ?? '').slice(0, 500));
  if (data?.type !== 'bonjour') return;
  if (!d.flux) await capturer(d); // les messages passent un par un : une seule capture
  if (!d.flux) return signal(d, from, { type: 'refus' });
  fermerPair(d, from); // il revient : nouvelle connexion
  const slot = [0, 1, 2, 3, 4, 5, 6].find((k) => ![...d.pairs.values()].some((p) => p.slot === k));
  if (slot === undefined) return signal(d, from, { type: 'complet' });
  const pc = new RTCPeerConnection({ iceServers: ICE_DISTANCE });
  const p = { pc, slot, n: 0 };
  d.pairs.set(from, p);
  for (const flux of d.flux) for (const t of flux.getTracks()) {
    const tr = pc.addTransceiver(t, { direction: 'sendonly', streams: [flux], sendEncodings: t.kind === 'video' ? [{ maxBitrate: 12_000_000, maxFramerate: 60 }] : undefined });
    // H.264 d'abord : encodé par la carte graphique, le processeur reste au jeu.
    if (t.kind === 'video') {
      const codecs = RTCRtpSender.getCapabilities('video').codecs;
      tr.setCodecPreferences([...codecs.filter((c) => /h264/i.test(c.mimeType)), ...codecs.filter((c) => !/h264/i.test(c.mimeType))]);
    }
  }
  // Manette : sans ordre ni renvoi, l'état complet arrive en continu (un paquet perdu ne retarde rien).
  const dc = pc.createDataChannel('manette', { ordered: false, maxRetransmits: 0 });
  dc.onmessage = (e) => {
    const [n, boutons, ...sticks] = JSON.parse(e.data);
    if (!(n > p.n) || sticks.length !== 4) return;
    p.n = n;
    invoke('distance_pad', { slot, boutons, sticks });
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') {
      son('arrivee', true);
      toast(`${nomMembre(from)} joue avec toi : manette ${slot + 2}`);
      mesurer(pc, `vers ${nomMembre(from)}`);
    }
    if (['failed', 'closed'].includes(pc.connectionState) && d.pairs.get(from) === p) fermerPair(d, from);
  };
  await pc.setLocalDescription(await pc.createOffer());
  await signal(d, from, { type: 'offre', sdp: await descriptionComplete(pc), manette: slot + 2 });
}

/** Le clavier du jeu s'ouvre aussi chez les invités (c'est souvent eux qui choisissent leur nom). */
function clavierAuxInvites(data) {
  const d = distance;
  if (d?.role === 'hote') for (const id of d.pairs.keys()) signal(d, id, data).catch(() => {});
}

function fermerPair(d, id) {
  const p = d.pairs.get(id);
  if (!p) return;
  d.pairs.delete(id);
  p.pc.close();
  invoke('distance_fin', { slot: p.slot });
}

/* ---------- Invité ---------- */

/** L'invité ne lance rien : il voit l'écran de l'hôte et joue avec sa manette. */
async function distanceInvite(s, ecran = s.host) {
  const d = { role: 'invite', code: s.code, hote: ecran, n: 0 };
  distance = d;
  compter('distance');
  if (!musique.paused) musique.pause();
  const el = document.createElement('section');
  el.id = 'distance';
  el.innerHTML = `<video autoplay playsinline></video><p class="distance-etat"></p><p class="distance-aide">${glyphs.home} Menu</p>`;
  document.body.append(el);
  d.el = el;
  volumeDistance();
  // Retour sur l'écran de l'hôte depuis le menu d'En Local.
  d.retour = Object.assign(document.createElement('button'), { className: 'btn glass distance-retour', onclick: revenirDistance });
  d.retour.innerHTML = `${glyphs.home} Revenir sur l'écran de ${esc(ecran.name)}`;
  document.body.append(d.retour);
  etatDistance(`Connexion à l'écran de ${s.host.name}…`);
  invoke('distance_manette', { actif: true });
  d.renvoi = setInterval(() => d.etat && envoyerManette(d.etat), 100);
  boucleSignaux(d);
  await signal(d, ecran.id, { type: 'bonjour' }).catch((e) => finDistance(e));
  updatePresence();
}

const etatDistance = (texte) => distance?.el && (distance.el.querySelector('.distance-etat').textContent = texte);

async function messageInvite(d, { from, data }) {
  if (from !== d.hote.id) return;
  if (data?.type === 'complet') return finDistance(`Toutes les manettes sont déjà prises chez ${d.hote.name}.`);
  if (data?.type === 'refus') return finDistance(`L'écran de ${d.hote.name} n'a pas pu être partagé.`);
  if (data?.type === 'clavier') return saisieClavier(data.c, (ok, texte) => (fermerSaisie(), signal(d, d.hote.id, { type: 'clavier', ok, texte })));
  if (data?.type === 'clavier-fin') return saisieOuverte() && fermerSaisie();
  if (data?.type !== 'offre') return;
  d.pc?.close();
  const pc = new RTCPeerConnection({ iceServers: ICE_DISTANCE });
  d.pc = pc;
  const flux = new MediaStream();
  pc.ontrack = (e) => {
    e.receiver.jitterBufferTarget = 0; // le moins de retard possible
    e.receiver.playoutDelayHint = 0;
    flux.addTrack(e.track);
    d.el.querySelector('video').srcObject = flux;
  };
  pc.ondatachannel = (e) => (d.dc = e.channel);
  pc.onconnectionstatechange = () => {
    if (d.pc !== pc) return;
    if (pc.connectionState === 'connected') {
      etatDistance('');
      mesurer(pc, `depuis ${d.hote.name}`);
    }
    if (pc.connectionState === 'disconnected') etatDistance('Connexion instable…');
    if (pc.connectionState === 'failed') finDistance(`La connexion avec ${d.hote.name} a été perdue.`);
  };
  await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  await signal(d, d.hote.id, { type: 'reponse', sdp: await descriptionComplete(pc) });
  toast(`Tu joues avec la manette ${data.manette}`);
}

/** Boutons et sticks de la manette (pad.rs), envoyés à chaque changement et toutes les 100 ms. */
function envoyerManette(etat) {
  const d = distance;
  if (d?.role !== 'invite') return;
  d.etat = etat;
  if (d.dc?.readyState === 'open') d.dc.send(JSON.stringify([++d.n, ...etat]));
}
listen('pad-etat', (e) => envoyerManette(e.payload));

const distanceVisible = () => distance?.role === 'invite' && !distance.cache;
/** Son du jeu de l'hôte chez l'invité : le même réglage que ses jeux (Volume du jeu). */
const volumeDistance = () => distance?.el && (distance.el.querySelector('video').volume = vol('general') * vol('jeux'));
/** Les touches vont au jeu de l'hôte ; seul Home ouvre le menu. */
function navDistance(k, focus = 0) {
  if (k !== 'home') return;
  const son = (d) => () => (changerVolume('jeux', d), navDistance('home', d < 0 ? 1 : 2));
  sheet('Jeu à distance', `Tu joues sur l'écran de ${esc(distance.hote.name)}.<br>Son du jeu : ${Math.round(vol('jeux') * 100)} %`, [
    { label: 'Continuer', cancel: true },
    { label: 'Baisser le son', fn: son(-1) },
    { label: 'Monter le son', fn: son(1) },
    { label: 'Menu d\'En Local', fn: cacherDistance },
    { label: 'Quitter la partie', fn: () => finDistance() },
  ]);
  sheetFocus = focus;
  drawSheet();
}
/** Menu d'En Local pendant la partie : l'image reste connectée, la manette sert au menu (au neutre chez l'hôte). */
function cacherDistance() {
  const d = distance;
  envoyerManette([0, 0, 0, 0, 0]);
  invoke('distance_manette', { actif: false });
  d.cache = true;
  d.el.style.display = 'none';
  d.retour.style.display = 'flex';
  toast(`Home ou le bouton en bas : revenir sur l'écran de ${d.hote.name}`);
}
function revenirDistance() {
  const d = distance;
  if (d?.role !== 'invite' || !d.cache) return;
  $('#sheet').style.display = 'none';
  d.cache = false;
  d.el.style.display = '';
  d.retour.style.display = 'none';
  invoke('distance_manette', { actif: true });
}

/* ---------- Fin ---------- */

/** Arrête tout (les deux côtés). `pourquoi` : message à l'invité. */
function finDistance(pourquoi = '') {
  const d = distance;
  if (!d) return;
  distance = null;
  if (d.role === 'hote') {
    for (const id of [...d.pairs.keys()]) fermerPair(d, id);
    d.capture?.getTracks().forEach((t) => t.stop());
    d.ctx?.close();
    invoke('distance_arret');
    return;
  }
  clearInterval(d.renvoi);
  invoke('distance_manette', { actif: false });
  envoyerJournaux(`à distance chez ${d.hote.name}`, true);
  signal(d, d.hote.id, { type: 'aurevoir' }).catch(() => {});
  d.pc?.close();
  d.el.remove();
  d.retour.remove();
  leaveSession();
  updatePresence();
  if (pourquoi) sheet('Jeu à distance', esc(pourquoi.message || pourquoi), [{ label: 'OK' }]);
}
