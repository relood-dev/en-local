/*
 * Icônes de l'interface. Elles prennent la couleur du texte.
 * Consoles : silhouettes dessinées pour En Local, sans logos.
 */
const icone = (d, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const DOCK = {
  quitter: '<path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>',
  collections: '<rect x="3" y="6" width="13" height="15" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/>',
  succes: '<path d="M8 4h8v6a4 4 0 0 1-8 0V4ZM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 14v4M8.5 20h7"/>',
  medias: '<path d="M5 19v-3M9.5 19V8M14 19v-6M18.5 19V5"/>',
  recherche: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  profil: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  accueil: '<path d="M3.5 11 12 4l8.5 7v8a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-6v6H5A1.5 1.5 0 0 1 3.5 19v-8Z"/>',
  jeux: '<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><circle cx="16" cy="11.5" r="1" fill="currentColor"/><circle cx="18" cy="13.5" r="1" fill="currentColor"/>',
  sessions: '<path d="M4 11a11 11 0 0 1 16 0M7.5 14.5a6 6 0 0 1 9 0"/><circle cx="12" cy="18.5" r="1.3" fill="currentColor"/>',
  membres: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-2-4.7"/>',
  tournois: '<path d="M8 4h8v6a4 4 0 0 1-8 0V4ZM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 14v4M8.5 20h7"/>',
  captures: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z"/><circle cx="12" cy="13" r="3.2"/>',
  emulateurs: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6v6H9z"/><path d="M9 1.5V4M15 1.5V4M9 20v2.5M15 20v2.5M1.5 9H4M1.5 15H4M20 9h2.5M20 15h2.5"/>',
  reglages: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
};

const ICONES_CONSOLES = {
  DS: '<rect x="6" y="2.5" width="12" height="8.5" rx="1.5"/><rect x="6" y="13" width="12" height="8.5" rx="1.5"/><path d="M8.5 17.2h1.5M14 17.2h1.5"/>',
  '3DS': '<rect x="3.5" y="2.5" width="17" height="8.5" rx="1.5"/><rect x="6" y="13" width="12" height="8.5" rx="1.5"/><circle cx="8.6" cy="16" r=".9"/>',
  GC: '<path d="M12 2.5 20.5 7.25v9.5L12 21.5 3.5 16.75v-9.5Z"/><path d="M12 12l8.5-4.75M12 12v9.5M12 12 3.5 7.25"/>',
  Wii: '<rect x="8.5" y="2" width="7" height="20" rx="3.5"/><path d="M12 5.5v3M10.5 7h3"/><circle cx="12" cy="12.5" r="1"/><path d="M11 17.5h2"/>',
  WiiU: '<rect x="2" y="5.5" width="20" height="13" rx="4"/><rect x="7" y="8" width="10" height="8" rx="1"/><circle cx="4.6" cy="10" r=".6"/><circle cx="19.4" cy="14" r=".6"/>',
  N64: '<path d="M5 6h14c1.7 0 3 1.3 3 3v2.5c0 1.5-.9 2.6-2 3.2l-1 4.3c-.3 1.2-1.9 1.3-2.3.1L15.5 15h-1.7l-.8 4.6c-.2 1.2-1.8 1.2-2 0L10.2 15H8.5l-1.2 4.1c-.4 1.2-2 1.1-2.3-.1l-1-4.3c-1.1-.6-2-1.7-2-3.2V9c0-1.7 1.3-3 3-3Z"/><circle cx="12" cy="11" r="1.4"/>',
  SNES: '<path d="M7 7h10a5 5 0 0 1 0 10c-1.7 0-2.6-.7-3.2-1.5h-3.6C9.6 16.3 8.7 17 7 17A5 5 0 0 1 7 7Z"/><path d="M5.5 12h3M7 10.5v3"/><circle cx="17" cy="10.4" r=".7"/><circle cx="17" cy="13.6" r=".7"/><circle cx="15.4" cy="12" r=".7"/><circle cx="18.6" cy="12" r=".7"/>',
  NES: '<rect x="2" y="7.5" width="20" height="9" rx="1.5"/><path d="M4.5 12h3M6 10.5v3"/><circle cx="16" cy="12.5" r="1.1"/><circle cx="19" cy="12.5" r="1.1"/><path d="M10 13h1.5M12.5 13H14"/>',
  GBA: '<path d="M6 6.5h12c2.8 0 4.5 2.4 4.5 5.5s-1.7 5.5-4.5 5.5H6c-2.8 0-4.5-2.4-4.5-5.5S3.2 6.5 6 6.5Z"/><rect x="8" y="8.5" width="8" height="7" rx="1"/><path d="M3.6 12h2.4M4.8 10.8v2.4"/><circle cx="19.5" cy="11" r=".6"/><circle cx="18.4" cy="13" r=".6"/>',
  GBC: '<path d="M6.5 2.5h11v16a3 3 0 0 1-3 3h-8a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1Z"/><rect x="8" y="4.5" width="8" height="6.5" rx=".8"/><path d="M8 15h2.4M9.2 13.8v2.4"/><circle cx="14.6" cy="15.6" r=".6"/><circle cx="16" cy="14.2" r=".6"/>',
  GB: '<path d="M6.5 2.5h11v16a3 3 0 0 1-3 3h-8a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1Z"/><rect x="8" y="4.5" width="8" height="6.5" rx=".5"/><path d="M8 15h2.4M9.2 13.8v2.4"/><circle cx="14.6" cy="15.6" r=".6"/><circle cx="16" cy="14.2" r=".6"/>',
  PS1: '<path d="M7 8.5h10c2.6 0 4.2 1.8 4.6 4.4l.8 5c.3 1.8-1.6 2.9-3 1.7L16.5 17h-9l-2.9 2.6c-1.4 1.2-3.3.1-3-1.7l.8-5C2.8 10.3 4.4 8.5 7 8.5Z"/><path d="M6.5 11.5v3M5 13h3"/><circle cx="17.5" cy="12" r=".6"/><circle cx="19.2" cy="13.6" r=".6"/>',
  PS2: '<path d="M7 8.5h10c2.6 0 4.2 1.8 4.6 4.4l.8 5c.3 1.8-1.6 2.9-3 1.7L16.5 17h-9l-2.9 2.6c-1.4 1.2-3.3.1-3-1.7l.8-5C2.8 10.3 4.4 8.5 7 8.5Z"/><path d="M6.5 11.5v3M5 13h3"/><circle cx="17.5" cy="12" r=".6"/><circle cx="15.8" cy="13.6" r=".6"/><circle cx="19.2" cy="13.6" r=".6"/><circle cx="9.5" cy="15" r="1.2"/><circle cx="14.5" cy="15" r="1.2"/>',
  PS3: '<path d="M7 8.5h10c2.6 0 4.2 1.8 4.6 4.4l.8 5c.3 1.8-1.6 2.9-3 1.7L16.5 17h-9l-2.9 2.6c-1.4 1.2-3.3.1-3-1.7l.8-5C2.8 10.3 4.4 8.5 7 8.5Z"/><path d="M6.5 11.5v3M5 13h3"/><circle cx="17.5" cy="12" r=".6"/><circle cx="15.8" cy="13.6" r=".6"/><circle cx="19.2" cy="13.6" r=".6"/>',
  Switch: '<rect x="2.5" y="5" width="4.5" height="14" rx="2.25"/><rect x="17" y="5" width="4.5" height="14" rx="2.25"/><rect x="8" y="6" width="8" height="12" rx="1"/><circle cx="4.75" cy="9" r=".6"/><circle cx="19.25" cy="15" r=".6"/>',
};
const iconeConsole = (c, cls = 'ico') => icone(ICONES_CONSOLES[c] || '', cls);
