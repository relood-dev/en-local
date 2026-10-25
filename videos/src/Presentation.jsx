// Vidéo de présentation d'En Local : neuf scènes, avec ou sans voix off, en 16:9 ou 9:16.
import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { BIENTOT, C, CONSOLES, Ecran, Fond, Icone, Loc, Pastille, Polices, Scene, Titre, useFormat, useRessort } from './ui.jsx';
import { TITRES } from './textes.js';
import DUREES from './durees.json';

export const FPS = 60;
// Chaque scène dure le temps de sa réplique, plus un temps pour respirer.
export const plan = (titres = TITRES, durees = DUREES) => {
  let debut = 0;
  return Object.keys(titres).map((id) => {
    const duree = Math.round(Math.max(4.6, (durees[id] || 4) + 1.5) * FPS);
    const s = { id, debut, duree };
    debut += duree - 12; // les scènes se chevauchent un peu (fondu enchaîné)
    return s;
  });
};
export const dureeTotale = (titres, durees) => {
  const p = plan(titres, durees);
  const d = p[p.length - 1];
  return d.debut + d.duree;
};

/** Mise en page commune : titre en haut (ou à gauche), visuel au centre (ou à droite). */
export const Cadre = ({ id, children, teintes, titres = TITRES, colonne = '34%' }) => {
  const { vertical, u } = useFormat();
  return (
    <AbsoluteFill>
      <Fond teinte={teintes?.[0]} teinte2={teintes?.[1]} />
      <AbsoluteFill style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: (vertical ? 70 : 90) * u, padding: (vertical ? 90 : 110) * u }}>
        <div style={{ flex: vertical ? 'none' : `0 0 ${colonne}`, marginTop: vertical ? 120 * u : 0 }}>
          <Titre lignes={titres[id]} taille={vertical ? 118 : 104} centre={vertical} />
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 0 }}>{children}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ---------- Scènes ---------- */

const Intro = () => {
  const f = useCurrentFrame();
  const { u } = useFormat();
  const r = useRessort(6, { damping: 12, stiffness: 90 });
  const halo = interpolate(f, [0, 90], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill>
      <Fond teinte="#6b7bff" teinte2="#ff6bb0" />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 40 * u }}>
        <div style={{ position: 'relative', transform: `scale(${r})` }}>
          <div style={{ position: 'absolute', inset: -60 * u, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,.35), transparent 65%)', opacity: halo, filter: `blur(${30 * u}px)` }} />
          <Img src={staticFile('img/logo.png')} style={{ width: 260 * u, position: 'relative', borderRadius: 60 * u }} />
        </div>
        <Titre lignes={TITRES.p1} delai={18} taille={130} />
      </AbsoluteFill>
      <Loc nom="coucou" taille={230} delai={40} style={{ position: 'absolute', right: 80 * u, bottom: -12 * u }} />
    </AbsoluteFill>
  );
};

const Consoles = () => {
  const { vertical, u } = useFormat();
  return (
    <Cadre id="p2" teintes={['#e60012', '#3b5bff']}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${vertical ? 2 : 3}, 1fr)`, gap: 34 * u }}>
        {CONSOLES.map(([id, nom, d], i) => <TuileConsole key={id} nom={nom} d={d} delai={10 + i * 7} />)}
      </div>
    </Cadre>
  );
};
export const TuileConsole = ({ nom, d, delai, bientot, taille = 250 }) => {
  const r = useRessort(delai, { damping: 12, stiffness: 130 });
  const f = useCurrentFrame();
  const { u: base } = useFormat();
  const u = base * taille / 250;
  const flotte = Math.sin((f + delai * 9) / 28) * 6 * u;
  return (
    <div style={{ width: 250 * u, height: 250 * u, borderRadius: 48 * u, background: 'linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.04))', boxShadow: `inset 0 0 0 ${2 * u}px rgba(255,255,255,.12), 0 ${30 * u}px ${60 * u}px rgba(0,0,0,.45)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 * u, transform: `translateY(${(1 - r) * 140 * u + flotte}px) scale(${0.5 + r * 0.5}) rotate(${(1 - r) * 18}deg)`, opacity: r }}>
      <Icone d={d} taille={110 * u} couleur={bientot ? C.doux : C.texte} />
      <div style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: (nom.length > 12 ? 26 : 32) * u, lineHeight: `${40 * u}px`, color: bientot ? C.doux : C.texte, textAlign: 'center', padding: `0 ${10 * u}px` }}>{nom}</div>
      {bientot && <div style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: 20 * u, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.fond, background: C.texte, borderRadius: 999, padding: `${5 * u}px ${14 * u}px` }}>Bientôt</div>}
    </div>
  );
};

const Bientot = () => {
  const { vertical, u } = useFormat();
  return (
    <Cadre id="p2b" teintes={['#2f6bff', '#9b5bff']}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 24 * u, maxWidth: 4 * (vertical ? 200 : 220) * u + 3 * 24 * u }}>
        {BIENTOT.map(([id, nom, d], i) => <TuileConsole key={id} nom={nom} d={d} delai={10 + i * 6} taille={vertical ? 200 : 220} bientot />)}
      </div>
    </Cadre>
  );
};

const Bibliotheque = () => {
  const { vertical } = useFormat();
  const f = useCurrentFrame();
  const bascule = interpolate(f, [170, 200], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <Cadre id="p3" teintes={['#2fd27a', '#3b5bff']}>
      <div style={{ position: 'relative' }}>
        <div style={{ opacity: 1 - bascule }}><Ecran src="accueil.jpg" delai={8} largeur={vertical ? 940 : 1150} /></div>
        <div style={{ position: 'absolute', inset: 0, opacity: bascule }}><Ecran src="jeux.jpg" delai={170} largeur={vertical ? 940 : 1150} inclinaison={0} /></div>
      </div>
    </Cadre>
  );
};

// Code de session à 6 caractères qui défile comme les roulettes de l'app, puis les joueurs arrivent.
const CODE = 'CJL252';
const SIGNES = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const Session = ({ id = 'p4', titres, colonne, teintes = ['#ffb02e', '#ff4d6d'] }) => {
  const { u, vertical } = useFormat();
  const f = useCurrentFrame();
  return (
    <Cadre id={id} titres={titres} colonne={colonne} teintes={teintes}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 60 * u }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 * u }}>
          {CODE.split('').map((c, i) => <Roulette key={i} final={c} arret={30 + i * 12} tiret={i === 2} />)}
        </div>
        <div style={{ display: 'flex', gap: (vertical ? 24 : 34) * u }}>
          {[0, 1, 2, 3].map((i) => <Joueur key={i} i={i} delai={130 + i * 16} />)}
        </div>
        <div style={{ opacity: interpolate(f, [210, 230], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          <Pastille delai={210}>✦ Même en pleine partie</Pastille>
        </div>
      </div>
    </Cadre>
  );
};
const Roulette = ({ final, arret, tiret }) => {
  const f = useCurrentFrame();
  const { u } = useFormat();
  const tourne = f < arret;
  const c = tourne ? SIGNES[(f * 3 + final.charCodeAt(0)) % SIGNES.length] : final;
  const choc = interpolate(f, [arret, arret + 10], [1.18, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <>
      <div style={{ width: 120 * u, height: 160 * u, borderRadius: 28 * u, background: tourne ? 'rgba(255,255,255,.06)' : C.texte, color: tourne ? C.doux : C.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter', fontWeight: 800, fontSize: 96 * u, boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.14)', transform: `scale(${tourne ? 1 : choc})`, filter: tourne ? `blur(${2 * u}px)` : 'none' }}>{c}</div>
      {tiret && <div style={{ width: 40 * u, height: 8 * u, borderRadius: 4, background: C.doux }} />}
    </>
  );
};
export const Joueur = ({ i, delai, taille = 150 }) => {
  const r = useRessort(delai, { damping: 10, stiffness: 160 });
  const { u } = useFormat();
  return (
    <div style={{ width: taille * u, height: taille * u, borderRadius: '50%', background: C.s2, boxShadow: `0 0 0 ${5 * u}px ${C.fond}, 0 0 0 ${9 * u}px ${C.texte}`, overflow: 'hidden', transform: `scale(${r}) translateY(${(1 - r) * 60 * u}px)` }}>
      <Img src={staticFile(`img/mii-tete${i}.png`)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.15) translateY(6%)' }} />
    </div>
  );
};

const Tournois = () => {
  const { vertical } = useFormat();
  return (
    <Cadre id="p5" teintes={['#ffd23f', '#7b5bff']}>
      <div style={{ position: 'relative' }}>
        <Ecran src="tournois.jpg" delai={6} largeur={vertical ? 940 : 1150} />
        <Loc nom="gg" taille={200} delai={60} style={{ position: 'absolute', right: -40, bottom: -70 }} />
      </div>
    </Cadre>
  );
};

const Depot = () => {
  const { vertical, u } = useFormat();
  const fichiers = ['Jeu.nsp', 'MAJ v6.nsp', 'DLC.nsp', 'Archive.zip'];
  return (
    <Cadre id="p6" teintes={['#3bd5ff', '#2fd27a']}>
      <div style={{ position: 'relative' }}>
        <Ecran src="depot.jpg" delai={6} largeur={vertical ? 940 : 1150} />
        {fichiers.map((nom, i) => <Fichier key={nom} nom={nom} i={i} />)}
      </div>
    </Cadre>
  );
};
const Fichier = ({ nom, i }) => {
  const f = useCurrentFrame();
  const { u } = useFormat();
  const t = interpolate(f, [40 + i * 18, 100 + i * 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const e = 1 - (1 - t) ** 3;
  const x = interpolate(e, [0, 1], [-420 - i * 40, 280 + i * 30]) * u;
  const y = (interpolate(e, [0, 1], [-260 + i * 60, 180]) - Math.sin(e * Math.PI) * 120) * u;
  return (
    <div style={{ position: 'absolute', left: '40%', top: '40%', transform: `translate(${x}px, ${y}px) scale(${1 - e * 0.55}) rotate(${(1 - e) * -20}deg)`, opacity: t < 1 ? 1 : 0, padding: `${16 * u}px ${24 * u}px`, borderRadius: 18 * u, background: C.texte, color: C.fond, fontFamily: 'Inter', fontWeight: 800, fontSize: 30 * u, boxShadow: '0 20px 50px rgba(0,0,0,.5)', whiteSpace: 'nowrap' }}>
      {nom}
    </div>
  );
};

const Mii = () => {
  const { u, vertical } = useFormat();
  return (
    <Cadre id="p7" teintes={['#ff6bb0', '#3bd5ff']}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 * u }}>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          {[0, 1, 2, 3].map((i) => <MiiSaut key={i} i={i} />)}
        </div>
        <div style={{ display: 'flex', gap: 26 * u }}>
          {CONSOLES.filter(([id]) => ['3DS', 'Wii', 'WiiU', 'Switch'].includes(id)).map(([id, nom, d], i) => (
            <Pastille key={id} delai={90 + i * 10}><Icone d={d} taille={40 * u} />{nom}</Pastille>
          ))}
        </div>
      </div>
    </Cadre>
  );
};
const MiiSaut = ({ i }) => {
  const f = useCurrentFrame();
  const r = useRessort(12 + i * 9, { damping: 9, stiffness: 120 });
  const { u, vertical } = useFormat();
  const saut = Math.max(0, Math.sin((f - 60 - i * 8) / 9)) * 30 * u * (f > 60 ? 1 : 0);
  const t = vertical ? 300 : 340;
  return <Img src={staticFile(`img/mii${i}.png`)} style={{ width: t * u, margin: `0 ${-70 * u}px`, transform: `translateY(${(1 - r) * 300 * u - saut}px)`, opacity: r }} />;
};

const Profil = () => {
  const { vertical, u } = useFormat();
  const f = useCurrentFrame();
  const n = Math.round(interpolate(f, [40, 140], [0, 49], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  return (
    <Cadre id="p8" teintes={['#ff4d6d', '#ffb02e']}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34 * u }}>
        <Ecran src="profil.jpg" delai={6} largeur={vertical ? 940 : 1100} />
        <div style={{ display: 'flex', gap: 20 * u, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Pastille delai={40}>{n} défis</Pastille>
          <Pastille delai={50}>Pokédex</Pastille>
          <Pastille delai={60}>Captures et clips</Pastille>
        </div>
      </div>
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
        <Titre lignes={TITRES.p9} delai={14} taille={124} />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end' }}>
        <Loc nom="fete" taille={280} delai={36} style={{ marginBottom: -14 * u }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const SCENES = { p1: Intro, p2: Consoles, p2b: Bientot, p3: Bibliotheque, p4: Session, p5: Tournois, p6: Depot, p7: Mii, p8: Profil, p9: Outro };

export const Presentation = ({ voix }) => <Video voix={voix} scenes={SCENES} titres={TITRES} durees={DUREES} musique="salon" />;

/** Enchaîne les scènes avec leur voix off et la musique du menu. */
export const Video = ({ voix, scenes, titres, durees, musique }) => {
  const { durationInFrames } = useVideoConfig();
  const p = plan(titres, durees);
  // Avec la voix off, la musique baisse pendant chaque réplique.
  const volumeMusique = (f) => {
    if (!voix) return interpolate(f, [durationInFrames - 90, durationInFrames], [0.75, 0], { extrapolateLeft: 'clamp' });
    const parle = p.some((s) => f >= s.debut + 10 && f <= s.debut + 10 + (durees[s.id] || 0) * FPS);
    return parle ? 0.28 : 0.6;
  };
  return (
    <AbsoluteFill style={{ background: C.fond }}>
      <Polices />
      <Audio src={staticFile(`audio/${musique}.wav`)} volume={volumeMusique} />
      {p.map((s) => {
        const S = scenes[s.id];
        return (
          <Sequence key={s.id} from={s.debut} durationInFrames={s.duree}>
            <Scene duree={s.duree}><S /></Scene>
            {voix && <Sequence from={10}><Audio src={staticFile(`voix/${s.id}.wav`)} /></Sequence>}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
