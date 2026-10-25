import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { FPS, Presentation, dureeTotale } from './Presentation.jsx';
import { Smash, dureeSmash } from './Smash.jsx';
import { Presentation2026, dureeTotale2026 } from './Presentation2026.jsx';

// Chaque vidéo existe en 16:9 et 9:16, avec et sans voix off.
const FORMATS = [['16x9', 1920, 1080], ['9x16', 1080, 1920]];

const Racine = () => (
  <>
    {FORMATS.flatMap(([nom, w, h]) => [
      <Composition key={`p-${nom}`} id={`Presentation-${nom}`} component={Presentation} width={w} height={h} fps={FPS} durationInFrames={dureeTotale()} defaultProps={{ voix: false }} />,
      <Composition key={`pv-${nom}`} id={`Presentation-voix-${nom}`} component={Presentation} width={w} height={h} fps={FPS} durationInFrames={dureeTotale()} defaultProps={{ voix: true }} />,
      <Composition key={`s-${nom}`} id={`Smash-${nom}`} component={Smash} width={w} height={h} fps={FPS} durationInFrames={dureeSmash()} defaultProps={{ voix: false }} />,
      <Composition key={`n-${nom}`} id={`EnLocal2026-${nom}`} component={Presentation2026} width={w} height={h} fps={FPS} durationInFrames={dureeTotale2026()} defaultProps={{ voix: false }} />,
      <Composition key={`nv-${nom}`} id={`EnLocal2026-voix-${nom}`} component={Presentation2026} width={w} height={h} fps={FPS} durationInFrames={dureeTotale2026()} defaultProps={{ voix: true }} />,
      <Composition key={`sv-${nom}`} id={`Smash-voix-${nom}`} component={Smash} width={w} height={h} fps={FPS} durationInFrames={dureeSmash()} defaultProps={{ voix: true }} />,
    ])}
  </>
);

registerRoot(Racine);
