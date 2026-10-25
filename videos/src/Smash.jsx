// Vidéo pour les joueurs de Smash : huit scènes, avec ou sans voix off, en 16:9 ou 9:16.
import React from 'react';
import { AbsoluteFill, Img, interpolate, random, staticFile, useCurrentFrame } from 'remotion';
import { Cadre, Joueur, Session, TuileConsole, Video, dureeTotale } from './Presentation.jsx';
import { C, CONSOLES, Fond, Loc, Pastille, Titre, useFormat, useRessort } from './ui.jsx';
import { TITRES } from './textes-smash.js';
import DUREES from './durees-smash.json';

const BORNE = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

/** Impact façon coup smash : flash, ondes de choc et lignes de vitesse, à l'image `a`. */
const Impact = ({ a = 0, couleur = '#ff8a3d', flash = true }) => {
  const f = useCurrentFrame() - a;
  const { u } = useFormat();
  if (f < 0 || f > 60) return null;
  const lignes = interpolate(f, [0, 22], [0, 1], BORNE);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {flash && <AbsoluteFill style={{ background: '#fff', opacity: interpolate(f, [0, 2, 12], [0, 0.5, 0], BORNE) }} />}
      {[0, 7, 14].map((d) => {
        const t = interpolate(f - d, [0, 40], [0, 1], BORNE);
        const e = 1 - (1 - t) ** 3;
        return (
          <AbsoluteFill key={d} style={{ alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 1500 * u * e, height: 1500 * u * e, borderRadius: '50%', border: `${(1 - e) * 26 * u}px solid ${couleur}`, opacity: t > 0 ? 1 - t : 0 }} />
          </AbsoluteFill>
        );
      })}
      <svg viewBox="-100 -100 200 200" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 1 - lignes }}>
        {Array.from({ length: 28 }, (_, i) => {
          const ang = (i / 28) * Math.PI * 2 + random(`l${i}`) * 0.2;
          const r0 = 30 + lignes * 60 + random(`r${i}`) * 10;
          const r1 = r0 + 20 + random(`L${i}`) * 30;
          return <line key={i} x1={Math.cos(ang) * r0} y1={Math.sin(ang) * r0} x2={Math.cos(ang) * r1} y2={Math.sin(ang) * r1} stroke="#fff" strokeWidth={0.6 + random(`w${i}`)} strokeLinecap="round" />;
        })}
      </svg>
    </AbsoluteFill>
  );
};

/** Secousse de l'écran juste après un impact. */
const useSecousse = (a) => {
  const f = useCurrentFrame();
  const { u } = useFormat();
  const k = interpolate(f - a, [0, 20], [1, 0], BORNE) * (f >= a ? 1 : 0);
  return `translate(${Math.sin(f * 2.3) * 16 * k * u}px, ${Math.cos(f * 3.1) * 12 * k * u}px)`;
};

/* ---------- Scènes ---------- */

const Intro = () => {
  const { u, vertical } = useFormat();
  const r = useRessort(4, { damping: 10, stiffness: 160 });
  return (
    <AbsoluteFill>
      <Fond teinte="#ff4d2e" teinte2="#ffb02e" />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 40 * u, transform: useSecousse(14) }}>
        <Img src={staticFile('img/logo.png')} style={{ width: 200 * u, borderRadius: 46 * u, transform: `scale(${r * 1.0}) rotate(${(1 - r) * -30}deg)` }} />
        <Titre lignes={TITRES.s1} delai={14} taille={vertical ? 100 : 124} />
      </AbsoluteFill>
      <Impact a={14} />
      <Loc nom="manette" taille={230} delai={40} style={{ position: 'absolute', right: 80 * u, bottom: -12 * u }} />
    </AbsoluteFill>
  );
};

// Les Smash et la console de chacun (icônes de l'app).
const JEUX = [['GC', 'Melee'], ['Wii', 'Brawl'], ['3DS', 'Smash 3DS'], ['WiiU', 'Smash Wii U'], ['Switch', 'Ultimate']];
const Jeux = () => {
  const { vertical, u } = useFormat();
  const t = 260;
  return (
    <Cadre id="s2" titres={TITRES} colonne="40%" teintes={['#e60012', '#3b5bff']}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 26 * u, maxWidth: 3 * t * u + 2 * 26 * u }}>
        {JEUX.map(([id, nom], i) => <TuileConsole key={id} nom={nom} d={CONSOLES.find((c) => c[0] === id)[2]} delai={10 + i * 9} taille={t} />)}
      </div>
    </Cadre>
  );
};

const Combat = () => (
  <>
    <Session id="s3" titres={TITRES} colonne="40%" teintes={['#ffb02e', '#ff4d6d']} />
    <Impact a={102} couleur="#ffb02e" flash={false} />
  </>
);

// Les shaders arrivent des autres membres : la barre se remplit, puis les effets éclatent.
const Shaders = () => {
  const { u, vertical } = useFormat();
  const f = useCurrentFrame();
  const t = interpolate(f, [30, 150], [0, 1], BORNE);
  const e = 1 - (1 - t) ** 2;
  const pret = f >= 150;
  return (
    <Cadre id="s4" titres={TITRES} colonne="40%" teintes={['#3bd5ff', '#9b5bff']}>
      <div style={{ position: 'relative', width: (vertical ? 860 : 900) * u }}>
        <div style={{ padding: 44 * u, borderRadius: 36 * u, background: 'linear-gradient(180deg, rgba(255,255,255,.1), rgba(255,255,255,.04))', boxShadow: `inset 0 0 0 ${2 * u}px rgba(255,255,255,.12), 0 ${30 * u}px ${80 * u}px rgba(0,0,0,.5)`, fontFamily: 'Inter', color: C.texte }}>
          <div style={{ fontSize: 26 * u, fontWeight: 600, color: C.doux }}>Shaders partagés · Switch</div>
          <div style={{ fontSize: 46 * u, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 8 * u }}>Super Smash Bros. Ultimate</div>
          <div style={{ height: 22 * u, borderRadius: 999, background: 'rgba(255,255,255,.08)', marginTop: 36 * u, overflow: 'hidden' }}>
            <div style={{ width: `${e * 100}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #3bd5ff, #9b5bff)', boxShadow: '0 0 30px #3bd5ff' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 * u, fontSize: 28 * u, fontWeight: 700 }}>
            <span style={{ color: C.doux }}>{pret ? 'Prêt pour le combat' : 'Reçu des membres…'}</span>
            <span>{(e * 84.7).toFixed(1).replace('.', ',')} Mo</span>
          </div>
        </div>
        <Etincelles a={150} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: -110 * u, display: 'flex', justifyContent: 'center' }}>
          {pret && <Pastille delai={152}>✦ Zéro saccade sur les effets</Pastille>}
        </div>
      </div>
    </Cadre>
  );
};
const Etincelles = ({ a }) => {
  const f = useCurrentFrame() - a;
  const { u } = useFormat();
  if (f < 0) return null;
  const couleurs = ['#3bd5ff', '#9b5bff', '#ff6bb0', '#ffd23f', '#ffffff'];
  return Array.from({ length: 46 }, (_, i) => {
    const ang = random(`a${i}`) * Math.PI * 2;
    const v = 6 + random(`v${i}`) * 16;
    const t = Math.min(f, 70);
    const x = Math.cos(ang) * v * t * u;
    const y = (Math.sin(ang) * v * t + 0.12 * t * t) * u;
    const taille = (6 + random(`t${i}`) * 12) * u;
    return <div key={i} style={{ position: 'absolute', left: '50%', top: '50%', width: taille, height: taille, borderRadius: '50%', background: couleurs[i % couleurs.length], boxShadow: `0 0 ${taille * 2}px ${couleurs[i % couleurs.length]}`, transform: `translate(${x}px, ${y}px)`, opacity: interpolate(f, [0, 10, 70], [0, 1, 0], BORNE) }} />;
  });
};

// Une manette dessinée : les boutons s'allument un par un, comme dans l'assistant de l'app.
const BOUTONS = [['X', 236, 70], ['A', 262, 96], ['B', 236, 122], ['Y', 210, 96]];
const Manette = () => {
  const { u, vertical } = useFormat();
  const f = useCurrentFrame();
  const r = useRessort(6, { damping: 14, stiffness: 90 });
  const largeur = (vertical ? 760 : 820) * u;
  return (
    <Cadre id="s5" titres={TITRES} colonne="40%" teintes={['#2fd27a', '#3b5bff']}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 44 * u }}>
        <svg viewBox="-12 0 324 230" width={largeur} style={{ overflow: 'visible', transform: `translateY(${(1 - r) * 200 * u}px) rotate(${(1 - r) * -8}deg)`, opacity: r }}>
          <path d="M70 30h160a52 52 0 0 1 50 38l24 96a34 34 0 0 1-60 28l-30-38H86l-30 38a34 34 0 0 1-60-28l24-96a52 52 0 0 1 50-38Z" fill="rgba(255,255,255,.06)" stroke={C.texte} strokeWidth="3" strokeLinejoin="round" />
          <circle cx="78" cy="96" r="24" fill="none" stroke={C.doux} strokeWidth="3" />
          <circle cx="194" cy="132" r="17" fill="none" stroke={C.doux} strokeWidth="3" />
          <path d="M98 124h12v-12h12v12h12v12h-12v12h-12v-12h-12Z" fill="none" stroke={C.doux} strokeWidth="3" strokeLinejoin="round" />
          {BOUTONS.map(([n, x, y], i) => {
            const a = 50 + i * 26;
            const on = interpolate(f - a, [0, 4, 22], [0, 1, 0.25], BORNE) * (f >= a ? 1 : 0);
            const onde = interpolate(f - a, [0, 24], [0, 1], BORNE);
            return (
              <g key={n}>
                {f >= a && <circle cx={x} cy={y} r={12 + onde * 26} fill="none" stroke="#2fd27a" strokeWidth={3 * (1 - onde)} />}
                <circle cx={x} cy={y} r="12" fill={on > 0.3 ? '#2fd27a' : 'none'} fillOpacity={on} stroke={C.texte} strokeWidth="3" />
                <text x={x} y={y + 5} textAnchor="middle" fontFamily="Inter" fontWeight="800" fontSize="14" fill={C.texte}>{n}</text>
              </g>
            );
          })}
        </svg>
        <div style={{ display: 'flex', gap: 18 * u, flexWrap: 'wrap', justifyContent: 'center', maxWidth: largeur }}>
          <Pastille delai={160}>Manettes inconnues</Pastille>
          <Pastille delai={172}>Disposition d’Ultimate</Pastille>
          <Pastille delai={184}>Vibrations au choix</Pastille>
        </div>
      </div>
    </Cadre>
  );
};

// Un tableau de tournoi : les traits se dessinent, les gagnants avancent, le champion brille.
const Tournois = () => {
  const { u } = useFormat();
  const f = useCurrentFrame();
  const trace = (a) => interpolate(f, [a, a + 24], [1, 0], BORNE);
  const traits = [
    ['M150 70H250V230H150M250 150H330', 40],
    ['M150 390H250V550H150M250 470H330', 52],
    ['M470 150H560V470H470M560 310H640', 120],
  ];
  const tete = (i, x, y, delai, taille = 120) => (
    <div style={{ position: 'absolute', left: (x - taille / 2) * u, top: (y - taille / 2) * u }}><Joueur i={i} delai={delai} taille={taille} /></div>
  );
  const champion = useRessort(150, { damping: 9, stiffness: 140 });
  return (
    <Cadre id="s6" titres={TITRES} colonne="40%" teintes={['#ffd23f', '#ff4d2e']}>
      <div style={{ position: 'relative', width: 800 * u, height: 620 * u, transform: useSecousse(150) }}>
        <svg viewBox="0 0 800 620" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {traits.map(([d, a]) => <path key={a} d={d} fill="none" stroke={C.texte} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" strokeDashoffset={trace(a)} opacity=".7" />)}
        </svg>
        {tete(0, 80, 70, 6)}{tete(1, 80, 230, 12)}{tete(2, 80, 390, 18)}{tete(3, 80, 550, 24)}
        {tete(0, 400, 150, 70)}{tete(3, 400, 470, 82)}
        <div style={{ position: 'absolute', left: 650 * u, top: 230 * u, width: 160 * u, height: 160 * u, borderRadius: '50%', boxShadow: `0 0 ${80 * champion * u}px #ffd23f`, opacity: champion }} />
        {tete(0, 730, 310, 150, 170)}
        <div style={{ position: 'absolute', left: 650 * u, top: 410 * u, width: 160 * u, display: 'flex', justifyContent: 'center' }}>
          <Pastille delai={168}>GG</Pastille>
        </div>
      </div>
      <Impact a={150} couleur="#ffd23f" flash={false} />
    </Cadre>
  );
};

// Les trois combattants Mii d'Ultimate, avec le Mii fait dans En Local.
const TYPES = ['Boxeur Mii', 'Épéiste Mii', 'Tireur Mii'];
const Mii = () => {
  const { u } = useFormat();
  return (
    <Cadre id="s7" titres={TITRES} colonne="40%" teintes={['#ff6bb0', '#3bd5ff']}>
      <div style={{ display: 'flex', gap: 30 * u, alignItems: 'flex-end' }}>
        {TYPES.map((type, i) => <Combattant key={type} type={type} i={i} />)}
      </div>
    </Cadre>
  );
};
const Combattant = ({ type, i }) => {
  const { u, vertical } = useFormat();
  const f = useCurrentFrame();
  const r = useRessort(12 + i * 14, { damping: 9, stiffness: 120 });
  const saut = Math.max(0, Math.sin((f - 70 - i * 10) / 9)) * 28 * u * (f > 70 ? 1 : 0);
  // Les images de Mii Studio ont de grandes marges vides : on ne garde que le Mii.
  const w = (vertical ? 760 : 820) * u;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 * u }}>
      <div style={{ position: 'relative', width: w * 0.3, height: w * 0.62, transform: `translateY(${(1 - r) * 300 * u - saut}px)`, opacity: r }}>
        <Img src={staticFile(`img/mii${i}.png`)} style={{ position: 'absolute', width: w, left: -w * 0.35, top: -w * 0.36 }} />
      </div>
      <Pastille delai={60 + i * 12}>{type}</Pastille>
    </div>
  );
};

const Outro = () => {
  const { u } = useFormat();
  const r = useRessort(4, { damping: 12, stiffness: 100 });
  return (
    <AbsoluteFill>
      <Fond teinte="#ff4d2e" teinte2="#6b7bff" />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 44 * u, transform: useSecousse(16) }}>
        <Img src={staticFile('img/logo.png')} style={{ width: 200 * u, borderRadius: 46 * u, transform: `scale(${r})` }} />
        <Titre lignes={TITRES.s8} delai={16} taille={120} />
        <Pastille delai={40}>loc-lab.fr/rejoindre</Pastille>
      </AbsoluteFill>
      <Impact a={16} couleur="#ff4d2e" />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end' }}>
        <Loc nom="gg" taille={260} delai={46} style={{ marginBottom: -14 * u }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const SCENES = { s1: Intro, s2: Jeux, s3: Combat, s4: Shaders, s5: Manette, s6: Tournois, s7: Mii, s8: Outro };

export const Smash = ({ voix }) => <Video voix={voix} scenes={SCENES} titres={TITRES} durees={DUREES} musique="boutique" />;
export const dureeSmash = () => dureeTotale(TITRES, DUREES);
