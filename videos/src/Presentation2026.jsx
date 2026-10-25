// Présentation d'En Local, édition d'octobre 2026 : douze scènes en motion design, effets sonores de l'app
// (outils/sons.mjs), musique du menu, avec ou sans voix off, en 16:9 ou 9:16.
import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, Ecran, Fond, Icone, Loc, Pastille, Polices, Scene, Titre, useFormat, useRessort } from './ui.jsx';
import { Cadre, FPS, Joueur, Session, TuileConsole, plan } from './Presentation.jsx';
import { TITRES } from './textes-2026.js';
import DUREES from './durees-2026.json';

export const dureeTotale2026 = () => {
  const p = plan(TITRES, DUREES);
  const d = p[p.length - 1];
  return d.debut + d.duree;
};

/** Effet sonore à l'image `at` de la scène. */
const Sfx = ({ at, nom, v = 0.6 }) => (
  <Sequence from={Math.max(0, Math.round(at))} durationInFrames={90} layout="none">
    <Audio src={staticFile(`audio/sfx-${nom}.wav`)} volume={v} />
  </Sequence>
);

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
const lisse = (t) => 1 - (1 - t) ** 3;

// Icônes (proto/ui/js/icones.js).
const I = {
  NES: '<rect x="2" y="7.5" width="20" height="9" rx="1.5"/><path d="M4.5 12h3M6 10.5v3"/><circle cx="16" cy="12.5" r="1.1"/><circle cx="19" cy="12.5" r="1.1"/><path d="M10 13h1.5M12.5 13H14"/>',
  SNES: '<path d="M7 7h10a5 5 0 0 1 0 10c-1.7 0-2.6-.7-3.2-1.5h-3.6C9.6 16.3 8.7 17 7 17A5 5 0 0 1 7 7Z"/><path d="M5.5 12h3M7 10.5v3"/><circle cx="17" cy="10.4" r=".7"/><circle cx="17" cy="13.6" r=".7"/><circle cx="15.4" cy="12" r=".7"/><circle cx="18.6" cy="12" r=".7"/>',
  N64: '<path d="M5 6h14c1.7 0 3 1.3 3 3v2.5c0 1.5-.9 2.6-2 3.2l-1 4.3c-.3 1.2-1.9 1.3-2.3.1L15.5 15h-1.7l-.8 4.6c-.2 1.2-1.8 1.2-2 0L10.2 15H8.5l-1.2 4.1c-.4 1.2-2 1.1-2.3-.1l-1-4.3c-1.1-.6-2-1.7-2-3.2V9c0-1.7 1.3-3 3-3Z"/><circle cx="12" cy="11" r="1.4"/>',
  GB: '<path d="M6.5 2.5h11v16a3 3 0 0 1-3 3h-8a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1Z"/><rect x="8" y="4.5" width="8" height="6.5" rx=".5"/><path d="M8 15h2.4M9.2 13.8v2.4"/><circle cx="14.6" cy="15.6" r=".6"/><circle cx="16" cy="14.2" r=".6"/>',
  GBC: '<path d="M6.5 2.5h11v16a3 3 0 0 1-3 3h-8a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1Z"/><rect x="8" y="4.5" width="8" height="6.5" rx=".8"/><path d="M8 15h2.4M9.2 13.8v2.4"/><circle cx="14.6" cy="15.6" r=".6"/><circle cx="16" cy="14.2" r=".6"/>',
  GBA: '<path d="M6 6.5h12c2.8 0 4.5 2.4 4.5 5.5s-1.7 5.5-4.5 5.5H6c-2.8 0-4.5-2.4-4.5-5.5S3.2 6.5 6 6.5Z"/><rect x="8" y="8.5" width="8" height="7" rx="1"/><path d="M3.6 12h2.4M4.8 10.8v2.4"/><circle cx="19.5" cy="11" r=".6"/><circle cx="18.4" cy="13" r=".6"/>',
  DS: '<rect x="6" y="2.5" width="12" height="8.5" rx="1.5"/><rect x="6" y="13" width="12" height="8.5" rx="1.5"/><path d="M8.5 17.2h1.5M14 17.2h1.5"/>',
  '3DS': '<rect x="3.5" y="2.5" width="17" height="8.5" rx="1.5"/><rect x="6" y="13" width="12" height="8.5" rx="1.5"/><circle cx="8.6" cy="16" r=".9"/>',
  GC: '<path d="M12 2.5 20.5 7.25v9.5L12 21.5 3.5 16.75v-9.5Z"/><path d="M12 12l8.5-4.75M12 12v9.5M12 12 3.5 7.25"/>',
  Wii: '<rect x="8.5" y="2" width="7" height="20" rx="3.5"/><path d="M12 5.5v3M10.5 7h3"/><circle cx="12" cy="12.5" r="1"/><path d="M11 17.5h2"/>',
  WiiU: '<rect x="2" y="5.5" width="20" height="13" rx="4"/><rect x="7" y="8" width="10" height="8" rx="1"/><circle cx="4.6" cy="10" r=".6"/><circle cx="19.4" cy="14" r=".6"/>',
  Switch: '<rect x="2.5" y="5" width="4.5" height="14" rx="2.25"/><rect x="17" y="5" width="4.5" height="14" rx="2.25"/><rect x="8" y="6" width="8" height="12" rx="1"/><circle cx="4.75" cy="9" r=".6"/><circle cx="19.25" cy="15" r=".6"/>',
  PS1: '<path d="M7 8.5h10c2.6 0 4.2 1.8 4.6 4.4l.8 5c.3 1.8-1.6 2.9-3 1.7L16.5 17h-9l-2.9 2.6c-1.4 1.2-3.3.1-3-1.7l.8-5C2.8 10.3 4.4 8.5 7 8.5Z"/><path d="M6.5 11.5v3M5 13h3"/><circle cx="17.5" cy="12" r=".6"/><circle cx="19.2" cy="13.6" r=".6"/>',
  PS2: '<path d="M7 8.5h10c2.6 0 4.2 1.8 4.6 4.4l.8 5c.3 1.8-1.6 2.9-3 1.7L16.5 17h-9l-2.9 2.6c-1.4 1.2-3.3.1-3-1.7l.8-5C2.8 10.3 4.4 8.5 7 8.5Z"/><path d="M6.5 11.5v3M5 13h3"/><circle cx="17.5" cy="12" r=".6"/><circle cx="15.8" cy="13.6" r=".6"/><circle cx="19.2" cy="13.6" r=".6"/><circle cx="9.5" cy="15" r="1.2"/><circle cx="14.5" cy="15" r="1.2"/>',
  PS3: '<path d="M7 8.5h10c2.6 0 4.2 1.8 4.6 4.4l.8 5c.3 1.8-1.6 2.9-3 1.7L16.5 17h-9l-2.9 2.6c-1.4 1.2-3.3.1-3-1.7l.8-5C2.8 10.3 4.4 8.5 7 8.5Z"/><path d="M6.5 11.5v3M5 13h3"/><circle cx="17.5" cy="12" r=".6"/><circle cx="15.8" cy="13.6" r=".6"/><circle cx="19.2" cy="13.6" r=".6"/>',
  manette: '<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><circle cx="16" cy="11.5" r="1" fill="currentColor"/><circle cx="18" cy="13.5" r="1" fill="currentColor"/>',
  horloge: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  coupe: '<path d="M8 4h8v6a4 4 0 0 1-8 0V4ZM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 14v4M8.5 20h7"/>',
  pokeball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h6M15 12h6"/><circle cx="12" cy="12" r="3"/>',
  disquette: '<path d="M5 3.5h11l3.5 3.5v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5Z"/><path d="M7.5 3.5v5h8v-5M7.5 20.5v-6h9v6"/>',
  bouclier: '<path d="M12 2.5 20 5.5v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10v-6Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
};
const CONSOLES15 = [['NES', 'NES'], ['SNES', 'Super Nintendo'], ['N64', 'Nintendo 64'], ['GB', 'Game Boy'], ['GBC', 'Game Boy Color'], ['GBA', 'GBA'], ['DS', 'DS'], ['3DS', '3DS'], ['GC', 'GameCube'], ['Wii', 'Wii'], ['WiiU', 'Wii U'], ['Switch', 'Switch'], ['PS1', 'PlayStation'], ['PS2', 'PS2'], ['PS3', 'PS3']];

/* ---------- Briques ---------- */

/** Un PC (écran sur son pied), l'accueil d'En Local dedans. */
const PC = ({ delai = 0, taille = 380, nom, style }) => {
  const r = useRessort(delai, { damping: 14, stiffness: 110 });
  const { u } = useFormat();
  const w = taille * u;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `translateY(${(1 - r) * 80 * u}px) scale(${0.8 + r * 0.2})`, opacity: r, ...style }}>
      <div style={{ width: w, height: w * 0.62, borderRadius: 22 * u, padding: 10 * u, background: C.s2, boxShadow: `inset 0 0 0 ${2 * u}px rgba(255,255,255,.14), 0 ${30 * u}px ${70 * u}px rgba(0,0,0,.55)` }}>
        <Img src={staticFile('img/accueil.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14 * u, opacity: 0.85 }} />
      </div>
      <div style={{ width: 16 * u, height: 40 * u, background: C.s2 }} />
      <div style={{ width: w * 0.36, height: 12 * u, borderRadius: 6 * u, background: C.s2 }} />
      {nom && <div style={{ marginTop: 16 * u, fontFamily: 'Inter', fontWeight: 700, fontSize: 28 * u, color: C.doux }}>{nom}</div>}
    </div>
  );
};

/** Nœud rond (le serveur du Local) qui pulse. */
const Noeud = ({ delai = 0, taille = 170, style }) => {
  const r = useRessort(delai, { damping: 10, stiffness: 130 });
  const f = useCurrentFrame();
  const { u } = useFormat();
  const pulse = ((f - delai) % 50) / 50;
  return (
    <div style={{ position: 'relative', width: taille * u, height: taille * u, transform: `scale(${r})`, ...style }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', boxShadow: `0 0 0 ${2 * u}px rgba(255,255,255,${0.5 * (1 - pulse)})`, transform: `scale(${1 + pulse * 0.6})` }} />
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: C.s2, boxShadow: `inset 0 0 0 ${2 * u}px rgba(255,255,255,.18), 0 ${20 * u}px ${50 * u}px rgba(0,0,0,.5)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Img src={staticFile('img/logo.png')} style={{ width: '62%', borderRadius: 26 * u }} />
      </div>
    </div>
  );
};

/** Ligne pointillée qui se trace de (x1,y1) à (x2,y2), avec des points qui y circulent. */
const Lien = ({ x1, y1, x2, y2, delai = 0, flux = true, sens = 1 }) => {
  const f = useCurrentFrame();
  const { u } = useFormat();
  const t = lisse(interpolate(f, [delai, delai + 24], [0, 1], clamp));
  const xe = x1 + (x2 - x1) * t, ye = y1 + (y2 - y1) * t;
  const points = flux && t >= 1 ? [0, 1, 2].map((k) => {
    const p = (((f - delai) / 40 + k / 3) % 1 + 1) % 1;
    const q = sens > 0 ? p : 1 - p;
    return <circle key={k} cx={x1 + (x2 - x1) * q} cy={y1 + (y2 - y1) * q} r={6 * u} fill={C.texte} opacity={Math.sin(p * Math.PI)} />;
  }) : null;
  return (
    <g>
      <line x1={x1} y1={y1} x2={xe} y2={ye} stroke="rgba(255,255,255,.28)" strokeWidth={3 * u} strokeDasharray={`${10 * u} ${12 * u}`} strokeDashoffset={-f * 1.2 * u} strokeLinecap="round" />
      {points}
    </g>
  );
};

/** Pastille carrée avec icône (objet qui voyage). */
const Objet = ({ icone, texte, style }) => {
  const { u } = useFormat();
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 * u, padding: `${14 * u}px ${22 * u}px`, borderRadius: 20 * u, background: C.texte, color: C.fond, fontFamily: 'Inter', fontWeight: 800, fontSize: 28 * u, boxShadow: `0 ${16 * u}px ${40 * u}px rgba(0,0,0,.5)`, whiteSpace: 'nowrap', ...style }}>
      {icone && <Icone d={I[icone]} taille={36 * u} couleur={C.fond} />}{texte}
    </div>
  );
};

/* ---------- Scènes ---------- */

const Intro = () => {
  const f = useCurrentFrame();
  const { u } = useFormat();
  const ligne = interpolate(f, [0, 10, 16], [0, 1, 1], clamp);
  const ouvre = interpolate(f, [10, 22], [0, 1], clamp);
  const r = useRessort(14, { damping: 11, stiffness: 110 });
  const flash = interpolate(f, [14, 20, 40], [0, 0.9, 0], clamp);
  return (
    <AbsoluteFill>
      <Fond teinte="#6b7bff" teinte2="#ff6bb0" />
      {/* Allumage façon vieil écran : une ligne, puis l'image s'ouvre. */}
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: `${ligne * 70}%`, height: Math.max(3 * u, ouvre * 900 * u), background: `rgba(255,255,255,${0.9 * (1 - ouvre)})`, filter: `blur(${2 * u}px)` }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 40 * u }}>
        <div style={{ position: 'relative', transform: `scale(${r})` }}>
          <div style={{ position: 'absolute', inset: -70 * u, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,.4), transparent 65%)', opacity: 0.4 + flash, filter: `blur(${30 * u}px)` }} />
          <Img src={staticFile('img/logo.png')} style={{ width: 260 * u, position: 'relative', borderRadius: 60 * u }} />
        </div>
        <Titre lignes={TITRES.e1} delai={26} taille={130} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: '#fff', opacity: flash * 0.25 }} />
      <Loc nom="coucou" taille={230} delai={50} style={{ position: 'absolute', right: 80 * u, bottom: -12 * u }} />
      <Sfx at={0} nom="whooshBas" v={0.5} />
      <Sfx at={14} nom="impact" v={0.7} />
      <Sfx at={16} nom="lancer" v={0.7} />
      <Sfx at={50} nom="pixel" v={0.5} />
    </AbsoluteFill>
  );
};

const Consoles = () => {
  const { vertical, u } = useFormat();
  const f = useCurrentFrame();
  const n = Math.min(15, Math.max(0, Math.floor((f - 10) / 4) + 1));
  return (
    <Cadre id="e2" titres={TITRES} teintes={['#e60012', '#3b5bff']} colonne="30%">
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26 * u }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${vertical ? 3 : 5}, 1fr)`, gap: 18 * u }}>
          {CONSOLES15.map(([id, nom], i) => <TuileConsole key={id} nom={nom} d={I[id]} delai={10 + i * 4} taille={vertical ? 230 : 190} />)}
        </div>
        <div style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: 40 * u, color: C.doux, fontVariantNumeric: 'tabular-nums' }}>{n} / 15</div>
      </div>
      {CONSOLES15.map((_, i) => <Sfx key={i} at={16 + i * 4} nom="compte" v={0.4} />)}
      <Sfx at={16 + 15 * 4 + 6} nom="niveau" v={0.55} />
    </Cadre>
  );
};

const Bibliotheque = () => {
  const { vertical } = useFormat();
  const f = useCurrentFrame();
  const bascule = interpolate(f, [170, 200], [0, 1], clamp);
  return (
    <Cadre id="e3" titres={TITRES} teintes={['#2fd27a', '#3b5bff']}>
      <div style={{ position: 'relative' }}>
        <div style={{ opacity: 1 - bascule }}><Ecran src="accueil.jpg" delai={8} largeur={vertical ? 940 : 1150} /></div>
        <div style={{ position: 'absolute', inset: 0, opacity: bascule }}><Ecran src="jeux.jpg" delai={170} largeur={vertical ? 940 : 1150} inclinaison={0} /></div>
      </div>
      <Sfx at={8} nom="ouvrir" v={0.5} />
      {[60, 75, 90, 105].map((t) => <Sfx key={t} at={t} nom="tic" v={0.45} />)}
      <Sfx at={170} nom="onglet" v={0.55} />
    </Cadre>
  );
};

const Ensemble = () => (
  <>
    <Session id="e4" titres={TITRES} />
    {[0, 1, 2, 3, 4, 5].map((i) => <Sfx key={i} at={30 + i * 12} nom="tic" v={0.55} />)}
    <Sfx at={30 + 5 * 12 + 4} nom="ok" v={0.6} />
    {[0, 1, 2, 3].map((i) => <Sfx key={`j${i}`} at={130 + i * 16} nom={i ? 'pixel' : 'arrivee'} v={0.5} />)}
    <Sfx at={210} nom="notif" v={0.45} />
  </>
);

const Distance = () => {
  const { vertical, u } = useFormat();
  const W = (vertical ? 920 : 1080) * u, H = (vertical ? 900 : 700) * u;
  const hote = { x: W / 2, y: 190 * u };
  const invites = [0, 1, 2].map((k) => ({ x: W * (0.17 + k * 0.33), y: H - 120 * u }));
  return (
    <Cadre id="e5" titres={TITRES} teintes={['#9b5bff', '#3bd5ff']}>
      <div style={{ position: 'relative', width: W, height: H }}>
        <svg width={W} height={H} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {invites.map((p, k) => <Lien key={k} x1={hote.x} y1={hote.y + 150 * u} x2={p.x} y2={p.y - 90 * u} delai={44 + k * 8} />)}
        </svg>
        <div style={{ position: 'absolute', left: hote.x, top: hote.y, transform: 'translate(-50%, -50%)' }}>
          <PC delai={6} taille={vertical ? 420 : 380} />
        </div>
        {invites.map((p, k) => <Invite key={k} i={k} x={p.x} y={p.y} delai={70 + k * 12} />)}
      </div>
      <Sfx at={6} nom="ouvrir" v={0.5} />
      <Sfx at={44} nom="envoi" v={0.55} />
      {[0, 1, 2].map((k) => <Sfx key={k} at={74 + k * 12} nom="arrivee" v={0.35} />)}
    </Cadre>
  );
};
const Invite = ({ i, x, y, delai }) => {
  const r = useRessort(delai, { damping: 10, stiffness: 150 });
  const f = useCurrentFrame();
  const { u } = useFormat();
  const appui = Math.max(0, Math.sin((f - delai - 30 - i * 11) / 5)) > 0.85 ? 1 : 0;
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) scale(${r})`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 * u }}>
      <Joueur i={i + 1} delai={delai} taille={120} />
      <div style={{ padding: `${8 * u}px ${16 * u}px`, borderRadius: 999, background: appui ? C.texte : 'rgba(255,255,255,.1)', transform: `scale(${1 + appui * 0.08})` }}>
        <Icone d={I.manette} taille={52 * u} couleur={appui ? C.fond : C.texte} />
      </div>
    </div>
  );
};

const Classiques = () => {
  const { vertical, u } = useFormat();
  const W = (vertical ? 920 : 1000) * u, H = (vertical ? 900 : 760) * u;
  const c = { x: W / 2, y: H / 2 - 30 * u };
  const R = (vertical ? 330 : 300) * u;
  const autour = ['NES', 'SNES', 'N64', 'GBA', 'PS1'].map((id, k) => {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
    return { id, x: c.x + Math.cos(a) * R, y: c.y + Math.sin(a) * R * 0.85 };
  });
  return (
    <Cadre id="e6" titres={TITRES} teintes={['#ff4d6d', '#ffd23f']}>
      <div style={{ position: 'relative', width: W, height: H }}>
        <svg width={W} height={H} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {autour.map((p, k) => <Lien key={k} x1={p.x} y1={p.y} x2={c.x} y2={c.y} delai={40 + k * 6} sens={k % 2 ? 1 : -1} />)}
        </svg>
        <Noeud delai={20} taille={170} style={{ position: 'absolute', left: c.x - 85 * u, top: c.y - 85 * u }} />
        {autour.map((p, k) => <Mini key={p.id} id={p.id} x={p.x} y={p.y} delai={8 + k * 6} />)}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'center' }}>
          <Pastille delai={110}>✦ Aucun port à ouvrir</Pastille>
        </div>
      </div>
      {autour.map((_, k) => <Sfx key={k} at={10 + k * 6} nom="pixel" v={0.35} />)}
      <Sfx at={20} nom="impact" v={0.4} />
      <Sfx at={110} nom="piece" v={0.55} />
    </Cadre>
  );
};
const Mini = ({ id, x, y, delai }) => {
  const r = useRessort(delai, { damping: 10, stiffness: 150 });
  const f = useCurrentFrame();
  const { u } = useFormat();
  const flotte = Math.sin((f + delai * 7) / 22) * 6 * u;
  return (
    <div style={{ position: 'absolute', left: x - 70 * u, top: y - 70 * u + flotte, width: 140 * u, height: 140 * u, borderRadius: 34 * u, background: 'linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.05))', boxShadow: `inset 0 0 0 ${2 * u}px rgba(255,255,255,.14), 0 ${20 * u}px ${40 * u}px rgba(0,0,0,.45)`, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${r}) rotate(${(1 - r) * 25}deg)` }}>
      <Icone d={I[id]} taille={78 * u} />
    </div>
  );
};

const Tournois = () => {
  const { vertical } = useFormat();
  return (
    <Cadre id="e7" titres={TITRES} teintes={['#ffd23f', '#7b5bff']}>
      <div style={{ position: 'relative' }}>
        <Ecran src="tournois.jpg" delai={6} largeur={vertical ? 940 : 1150} />
        <Loc nom="gg" taille={200} delai={60} style={{ position: 'absolute', right: -40, bottom: -70 }} />
      </div>
      <Sfx at={6} nom="ouvrir" v={0.5} />
      <Sfx at={62} nom="succes" v={0.5} />
    </Cadre>
  );
};

/** Deux PC et le Local entre eux ; des objets voyagent de l'un à l'autre. */
const DeuxPC = ({ objets, debut = 50, ecart = 34, children }) => {
  const { vertical, u } = useFormat();
  const f = useCurrentFrame();
  const W = (vertical ? 940 : 1120) * u, H = (vertical ? 1180 : 600) * u;
  const a = vertical ? { x: W / 2, y: 200 * u } : { x: 190 * u, y: H / 2 };
  const b = vertical ? { x: W / 2, y: H - 200 * u } : { x: W - 190 * u, y: H / 2 };
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return (
    <div style={{ position: 'relative', width: W, height: H }}>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <Lien x1={a.x} y1={a.y} x2={m.x} y2={m.y} delai={24} flux={false} />
        <Lien x1={m.x} y1={m.y} x2={b.x} y2={b.y} delai={30} flux={false} />
      </svg>
      <div style={{ position: 'absolute', left: a.x, top: a.y, transform: 'translate(-50%, -50%)' }}><PC delai={4} taille={vertical ? 440 : 280} nom="PC du salon" /></div>
      <div style={{ position: 'absolute', left: b.x, top: b.y, transform: 'translate(-50%, -50%)' }}><PC delai={12} taille={vertical ? 440 : 280} nom="PC portable" /></div>
      <Noeud delai={20} taille={130} style={{ position: 'absolute', left: m.x - 65 * u, top: m.y - 65 * u }} />
      {objets.map((o, k) => {
        const t0 = debut + k * ecart;
        const t = interpolate(f, [t0, t0 + 40], [0, 1], clamp);
        if (t <= 0) return null;
        const e = lisse(t);
        const x = a.x + (b.x - a.x) * e, y = a.y + (b.y - a.y) * e - Math.sin(e * Math.PI) * 60 * u;
        const arrive = interpolate(f, [t0 + 40, t0 + 52], [1, 0], clamp);
        return <div key={k} style={{ position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) scale(${0.9 + Math.sin(e * Math.PI) * 0.2})`, opacity: arrive }}><Objet {...o} /></div>;
      })}
      {children?.({ a, b, m, W, H })}
    </div>
  );
};

const Profil = () => {
  const objets = [{ icone: 'horloge', texte: '214 h de jeu' }, { icone: 'coupe', texte: '52 défis' }, { texte: 'Ton Mii' }, { icone: 'pokeball', texte: 'Pokédex' }];
  return (
    <Cadre id="e8" titres={TITRES} teintes={['#3b5bff', '#2fd27a']}>
      <DeuxPC objets={objets} />
      {objets.map((_, k) => <Sfx key={k} at={50 + k * 34} nom="envoi" v={0.45} />)}
      {objets.map((_, k) => <Sfx key={`b${k}`} at={90 + k * 34} nom="pixel" v={0.35} />)}
    </Cadre>
  );
};

const Sauvegardes = () => {
  const f = useCurrentFrame();
  const { u } = useFormat();
  return (
    <Cadre id="e9" titres={TITRES} teintes={['#2fd27a', '#ffb02e']}>
      <DeuxPC objets={[{ icone: 'disquette', texte: 'Sauvegarde · Smash Bros.' }]} debut={40}>
        {({ a, m }) => {
          // Une sauvegarde abîmée (que des zéros) part, et s'arrête sur le bouclier du Local.
          const t = lisse(interpolate(f, [130, 165], [0, 1], clamp));
          const choc = f >= 165;
          const tremble = choc ? Math.sin(f * 2.2) * interpolate(f, [165, 185], [10, 0], clamp) * u : 0;
          const fond = interpolate(f, [175, 200], [1, 0], clamp);
          const bouclier = useRessortLocal(163);
          return (
            <>
              {f >= 130 && (
                <div style={{ position: 'absolute', left: a.x + (m.x - 110 * u - a.x) * t + tremble, top: a.y + (m.y - a.y) * t, transform: 'translate(-50%, -50%)', opacity: fond }}>
                  <Objet icone="disquette" texte="0000 0000" style={{ background: '#3a3a40', color: C.doux, textDecoration: choc ? 'line-through' : 'none' }} />
                </div>
              )}
              <div style={{ position: 'absolute', left: m.x, top: m.y, transform: `translate(-50%, -50%) scale(${bouclier * 1.25})`, opacity: bouclier }}>
                <div style={{ width: 150 * u, height: 150 * u, borderRadius: '50%', background: C.texte, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 ${60 * u}px rgba(255,255,255,.45)` }}>
                  <Icone d={I.bouclier} taille={92 * u} couleur={C.fond} />
                </div>
              </div>
            </>
          );
        }}
      </DeuxPC>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 70 * u, display: 'flex', justifyContent: 'center', opacity: interpolate(f, [185, 200], [0, 1], clamp) }}>
        <Pastille delai={185}>✦ Rien n'est écrasé</Pastille>
      </div>
      <Sfx at={40} nom="envoi" v={0.5} />
      <Sfx at={82} nom="ok" v={0.5} />
      <Sfx at={130} nom="whoosh" v={0.4} />
      <Sfx at={163} nom="bouclier" v={0.65} />
      <Sfx at={185} nom="notif" v={0.4} />
    </Cadre>
  );
};
const useRessortLocal = (delai) => useRessort(delai, { damping: 9, stiffness: 160 });

const Depot = () => {
  const { vertical } = useFormat();
  const fichiers = ['Jeu.nsp', 'MAJ v6.nsp', 'DLC.nsp', 'Archive.zip'];
  return (
    <Cadre id="e10" titres={TITRES} teintes={['#3bd5ff', '#2fd27a']}>
      <div style={{ position: 'relative' }}>
        <Ecran src="depot.jpg" delai={6} largeur={vertical ? 940 : 1150} />
        {fichiers.map((nom, i) => <Fichier key={nom} nom={nom} i={i} />)}
      </div>
      {fichiers.map((_, i) => <Sfx key={i} at={98 + i * 18} nom="tape" v={0.6} />)}
      <Sfx at={170} nom="ok" v={0.5} />
    </Cadre>
  );
};
const Fichier = ({ nom, i }) => {
  const f = useCurrentFrame();
  const { u } = useFormat();
  const t = interpolate(f, [40 + i * 18, 100 + i * 18], [0, 1], clamp);
  const e = lisse(t);
  const x = interpolate(e, [0, 1], [-420 - i * 40, 280 + i * 30]) * u;
  const y = (interpolate(e, [0, 1], [-260 + i * 60, 180]) - Math.sin(e * Math.PI) * 120) * u;
  return (
    <div style={{ position: 'absolute', left: '40%', top: '40%', transform: `translate(${x}px, ${y}px) scale(${1 - e * 0.55}) rotate(${(1 - e) * -20}deg)`, opacity: t < 1 ? 1 : 0 }}>
      <Objet texte={nom} />
    </div>
  );
};

const Parcours = () => {
  const { vertical, u } = useFormat();
  const f = useCurrentFrame();
  const n = Math.round(interpolate(f, [40, 140], [0, 104], clamp));
  return (
    <Cadre id="e11" titres={TITRES} teintes={['#ff4d6d', '#ffb02e']}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34 * u }}>
        <Ecran src="profil.jpg" delai={6} largeur={vertical ? 940 : 1100} />
        <div style={{ display: 'flex', gap: 20 * u, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Pastille delai={40}><span style={{ fontVariantNumeric: 'tabular-nums' }}>{n}</span> défis</Pastille>
          <Pastille delai={50}>Pokédex</Pastille>
          <Pastille delai={60}>Captures et clips</Pastille>
        </div>
      </div>
      {Array.from({ length: 17 }, (_, k) => <Sfx key={k} at={40 + k * 6} nom="compte" v={0.35} />)}
      <Sfx at={142} nom="niveau" v={0.55} />
    </Cadre>
  );
};

const Outro = () => {
  const { u } = useFormat();
  const r = useRessort(4, { damping: 12, stiffness: 100 });
  return (
    <AbsoluteFill>
      <Fond teinte="#6b7bff" teinte2="#2fd27a" />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 44 * u }}>
        <Img src={staticFile('img/logo.png')} style={{ width: 220 * u, borderRadius: 50 * u, transform: `scale(${r})` }} />
        <Titre lignes={TITRES.e12} delai={14} taille={124} />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end' }}>
        <Loc nom="fete" taille={280} delai={36} style={{ marginBottom: -14 * u }} />
      </AbsoluteFill>
      <Sfx at={4} nom="impact" v={0.55} />
      <Sfx at={16} nom="succes" v={0.6} />
    </AbsoluteFill>
  );
};

const SCENES = { e1: Intro, e2: Consoles, e3: Bibliotheque, e4: Ensemble, e5: Distance, e6: Classiques, e7: Tournois, e8: Profil, e9: Sauvegardes, e10: Depot, e11: Parcours, e12: Outro };

/** Les scènes s'enchaînent, avec un souffle à chaque transition, la musique du menu et la voix off. */
export const Presentation2026 = ({ voix }) => {
  const { durationInFrames } = useVideoConfig();
  const p = plan(TITRES, DUREES);
  const volumeMusique = (f) => {
    const fin = interpolate(f, [durationInFrames - 90, durationInFrames], [1, 0], clamp);
    if (!voix) return 0.55 * fin;
    const parle = p.some((s) => f >= s.debut + 10 && f <= s.debut + 10 + (DUREES[s.id] || 0) * FPS);
    return (parle ? 0.2 : 0.45) * fin;
  };
  return (
    <AbsoluteFill style={{ background: C.fond }}>
      <Polices />
      <Audio src={staticFile('audio/boutique-2026.wav')} volume={volumeMusique} />
      {p.map((s, k) => {
        const S = SCENES[s.id];
        return (
          <Sequence key={s.id} from={s.debut} durationInFrames={s.duree}>
            <Scene duree={s.duree}><S /></Scene>
            {k > 0 && <Sfx at={0} nom="whoosh" v={0.3} />}
            {voix && <Sequence from={10}><Audio src={staticFile(`voix/${s.id}.wav`)} /></Sequence>}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
