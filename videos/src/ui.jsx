// Briques visuelles des vidéos, dans la DA d'En Local : fond noir, blanc pour l'accent, Inter, grands arrondis.
import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Gif } from '@remotion/gif';

export const C = { fond: '#0a0a0b', s1: '#121214', s2: '#1a1a1d', texte: '#f5f5f7', doux: '#a1a1a8', discret: '#6b6b73', trait: 'rgba(255,255,255,.08)' };

/** Police Inter de l'app. */
export const Polices = () => (
  <style>{`
    @font-face { font-family: Inter; src: url(${staticFile('fonts/Inter-Regular.ttf')}); font-weight: 400; }
    @font-face { font-family: Inter; src: url(${staticFile('fonts/Inter-SemiBold.ttf')}); font-weight: 600; }
    @font-face { font-family: Inter; src: url(${staticFile('fonts/Inter-Bold.ttf')}); font-weight: 700 800; }
  `}</style>
);

export const useFormat = () => {
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  // Unité : 1 = 1 px en 1080p horizontal ; les tailles suivent le petit côté.
  const u = Math.min(width, height) / 1080;
  return { vertical, u, width, height };
};

/** Ressort d'apparition, décalé de `delai` images. */
export const useRessort = (delai = 0, config = { damping: 16, stiffness: 120, mass: 0.8 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delai, fps, config });
};

/** Fond : noir de l'app, deux halos de couleur qui dérivent lentement, grain léger. */
export const Fond = ({ teinte = '#3b5bff', teinte2 = '#ff4d6d' }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const x1 = 30 + Math.sin(f / 140) * 12;
  const y1 = 35 + Math.cos(f / 170) * 10;
  const x2 = 70 + Math.cos(f / 160) * 12;
  const y2 = 70 + Math.sin(f / 130) * 10;
  return (
    <AbsoluteFill style={{ background: C.fond, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${x1}% ${y1}%, ${teinte}33, transparent 45%), radial-gradient(circle at ${x2}% ${y2}%, ${teinte2}26, transparent 45%)` }} />
      <AbsoluteFill style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.035) 1px, transparent 1px)', backgroundSize: `${Math.round(Math.min(width, height) / 270)}px ${Math.round(Math.min(width, height) / 270)}px`, opacity: 0.8 }} />
    </AbsoluteFill>
  );
};

/** Titre en deux lignes : chaque mot monte, net, avec un léger flou au départ. */
export const Titre = ({ lignes, delai = 0, taille = 96, centre = true, style }) => {
  const { u } = useFormat();
  let k = 0;
  return (
    <div style={{ fontFamily: 'Inter', color: C.texte, textAlign: centre ? 'center' : 'left', ...style }}>
      {lignes.map((ligne, i) => (
        <div key={i} style={{ fontSize: taille * u * (i === 0 ? 1 : 0.62), fontWeight: i === 0 ? 800 : 600, letterSpacing: i === 0 ? '-0.04em' : '-0.02em', lineHeight: 1.08, color: i === 0 ? C.texte : C.doux, marginTop: i ? 10 * u : 0 }}>
          {ligne.split(' ').map((mot) => <Mot key={k} mot={mot} delai={delai + 4 * k++} />)}
        </div>
      ))}
    </div>
  );
};
const Mot = ({ mot, delai }) => {
  const r = useRessort(delai);
  return (
    <span style={{ display: 'inline-block', marginRight: '0.26em', transform: `translateY(${(1 - r) * 60}%)`, opacity: r, filter: `blur(${(1 - r) * 10}px)` }}>{mot}</span>
  );
};

/** Capture de l'app dans un cadre arrondi, avec perspective qui se redresse et lente avancée. */
export const Ecran = ({ src, delai = 0, largeur = 1300, inclinaison = 18, style }) => {
  const f = useCurrentFrame();
  const r = useRessort(delai, { damping: 20, stiffness: 70 });
  const { u } = useFormat();
  const pousse = interpolate(f - delai, [0, 400], [1, 1.06], { extrapolateRight: 'clamp' });
  return (
    <div style={{ perspective: 2400 * u, ...style }}>
      <div style={{ width: largeur * u, borderRadius: 26 * u, overflow: 'hidden', boxShadow: `0 ${40 * u}px ${120 * u}px rgba(0,0,0,.6), 0 0 0 ${2 * u}px rgba(255,255,255,.12)`, transform: `rotateX(${(1 - r) * inclinaison}deg) translateY(${(1 - r) * 120 * u}px) scale(${(0.9 + r * 0.1) * pousse})`, opacity: r }}>
        <Img src={staticFile(`img/${src}`)} style={{ width: '100%', display: 'block' }} />
      </div>
    </div>
  );
};

/** Loc, la mascotte du Local (GIF animé). */
export const Loc = ({ nom, taille = 220, delai = 0, style }) => {
  const r = useRessort(delai, { damping: 11, stiffness: 140 });
  const { u } = useFormat();
  return (
    <div style={{ width: taille * u, height: taille * u, transform: `scale(${r}) rotate(${(1 - r) * -12}deg)`, transformOrigin: 'bottom center', ...style }}>
      <Gif src={staticFile(`img/loc_${nom}.gif`)} width={taille * u} height={taille * u} fit="contain" />
    </div>
  );
};

/** Pastille comme les étiquettes de l'app (MAJ, DLC, temps de jeu…). */
export const Pastille = ({ children, delai = 0, style }) => {
  const r = useRessort(delai);
  const { u } = useFormat();
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 * u, padding: `${12 * u}px ${22 * u}px`, borderRadius: 999, background: 'rgba(255,255,255,.08)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.12)', fontFamily: 'Inter', fontWeight: 700, fontSize: 30 * u, color: C.texte, transform: `scale(${0.6 + r * 0.4})`, opacity: r, ...style }}>
      {children}
    </div>
  );
};

// Icônes des consoles, reprises de l'app (proto/ui/js/icones.js).
export const CONSOLES = [
  ['DS', 'DS', '<rect x="6" y="2.5" width="12" height="8.5" rx="1.5"/><rect x="6" y="13" width="12" height="8.5" rx="1.5"/><path d="M8.5 17.2h1.5M14 17.2h1.5"/>'],
  ['3DS', '3DS', '<rect x="3.5" y="2.5" width="17" height="8.5" rx="1.5"/><rect x="6" y="13" width="12" height="8.5" rx="1.5"/><circle cx="8.6" cy="16" r=".9"/>'],
  ['GC', 'GameCube', '<path d="M12 2.5 20.5 7.25v9.5L12 21.5 3.5 16.75v-9.5Z"/><path d="M12 12l8.5-4.75M12 12v9.5M12 12 3.5 7.25"/>'],
  ['Wii', 'Wii', '<rect x="8.5" y="2" width="7" height="20" rx="3.5"/><path d="M12 5.5v3M10.5 7h3"/><circle cx="12" cy="12.5" r="1"/><path d="M11 17.5h2"/>'],
  ['WiiU', 'Wii U', '<rect x="2" y="5.5" width="20" height="13" rx="4"/><rect x="7" y="8" width="10" height="8" rx="1"/><circle cx="4.6" cy="10" r=".6"/><circle cx="19.4" cy="14" r=".6"/>'],
  ['Switch', 'Switch', '<rect x="2.5" y="5" width="4.5" height="14" rx="2.25"/><rect x="17" y="5" width="4.5" height="14" rx="2.25"/><rect x="8" y="6" width="8" height="12" rx="1"/><circle cx="4.75" cy="9" r=".6"/><circle cx="19.25" cy="15" r=".6"/>'],
];
// Consoles prévues dans les prochaines mises à jour (cœurs libretro ou émulateurs libres).
export const BIENTOT = [
  ['NES', 'NES', '<rect x="2" y="7" width="20" height="11" rx="1.5"/><path d="M2 11h20M5 14.5h4"/><rect x="13" y="13.5" width="2.5" height="2" rx=".4"/><rect x="17" y="13.5" width="2.5" height="2" rx=".4"/>'],
  ['SNES', 'Super Nintendo', '<path d="M7 7h10a5 5 0 0 1 0 10H7A5 5 0 0 1 7 7Z"/><path d="M5 12h3M6.5 10.5v3"/><circle cx="16" cy="10.6" r=".7"/><circle cx="17.4" cy="12" r=".7"/><circle cx="14.6" cy="12" r=".7"/><circle cx="16" cy="13.4" r=".7"/>'],
  ['GB', 'Game Boy', '<path d="M6.5 2.5h11a1.5 1.5 0 0 1 1.5 1.5v14.5a3 3 0 0 1-3 3h-9.5a1.5 1.5 0 0 1-1.5-1.5V4a1.5 1.5 0 0 1 1.5-1.5Z"/><rect x="7.5" y="5" width="9" height="6.5" rx="1"/><path d="M8 16h2.4M9.2 14.8v2.4"/><circle cx="14.4" cy="16.6" r=".7"/><circle cx="16" cy="15.2" r=".7"/>'],
  ['N64', 'Nintendo 64', '<path d="M3 9.5c0-2 1.5-3 3.5-3h11c2 0 3.5 1 3.5 3 0 2.5-1.2 4-3 4-1 0-1.5 1-2 3l-.5 2h-7l-.5-2c-.5-2-1-3-2-3-1.8 0-3-1.5-3-4Z"/><circle cx="12" cy="11" r="1.4"/>'],
  ['PS1', 'PlayStation', '<rect x="2.5" y="5" width="19" height="14" rx="1.5"/><circle cx="12" cy="11" r="4"/><path d="M4.5 16.5h3M16.5 16.5h3"/>'],
  ['PSP', 'PSP', '<rect x="1.5" y="7" width="21" height="10" rx="5"/><rect x="6.5" y="8.5" width="11" height="7" rx="1"/><path d="M3.5 12h1.6M4.3 11.2v1.6"/><circle cx="20" cy="12" r=".7"/>'],
  ['PS2', 'PlayStation 2', '<rect x="5" y="2.5" width="14" height="19" rx="1.5"/><path d="M5 7h14M9 13.5h6M9 16h6"/>'],
];
export const Icone = ({ d, taille = 64, couleur = C.texte }) => (
  <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
);

/** Entrée et sortie d'une scène : fondu, léger zoom et flou. */
export const Scene = ({ children, duree }) => {
  const f = useCurrentFrame();
  const entree = interpolate(f, [0, 14], [0, 1], { extrapolateRight: 'clamp' });
  const sortie = interpolate(f, [duree - 14, duree], [1, 0], { extrapolateLeft: 'clamp' });
  const o = Math.min(entree, sortie);
  return <AbsoluteFill style={{ opacity: o, transform: `scale(${1.04 - 0.04 * entree + (1 - sortie) * 0.05})`, filter: `blur(${(1 - o) * 8}px)` }}>{children}</AbsoluteFill>;
};
