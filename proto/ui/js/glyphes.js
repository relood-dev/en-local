/* Symboles des touches, selon la dernière manette utilisée (ou le clavier). */
const svg = (d) => `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const GLYPHS = {
  playstation: {
    a: `<span class="k ps">${svg('<path d="M3 3l6 6M9 3l-6 6"/>')}</span>`,
    b: `<span class="k ps">${svg('<circle cx="6" cy="6" r="3.6"/>')}</span>`,
    x: `<span class="k ps">${svg('<path d="M6 2.4l3.8 6.6H2.2z"/>')}</span>`,
    y: `<span class="k ps">${svg('<rect x="2.6" y="2.6" width="6.8" height="6.8" rx=".6"/>')}</span>`,
    plus: '<span class="k mot">Options</span>',
    minus: '<span class="k mot">Create</span>',
    capture: '<span class="k mot">micro</span>',
    lb: '<span class="k sq">L1</span>', rb: '<span class="k sq">R1</span>', lt: '<span class="k sq">L2</span>',
    home: '<span class="k mot">PS</span>',
  },
  xbox: { a: '<span class="k">A</span>', b: '<span class="k">B</span>', x: '<span class="k">Y</span>', y: '<span class="k">X</span>', plus: '<span class="k mot">Menu</span>', minus: '<span class="k mot">Vue</span>', capture: '<span class="k mot">Partage</span>', lb: '<span class="k sq">LB</span>', rb: '<span class="k sq">RB</span>', lt: '<span class="k sq">LT</span>', home: '<span class="k mot">Xbox</span>' },
  nintendo: { a: '<span class="k">A</span>', b: '<span class="k">B</span>', x: '<span class="k">X</span>', y: '<span class="k">Y</span>', plus: '<span class="k">+</span>', minus: '<span class="k">−</span>', capture: '<span class="k mot">Capture</span>', lb: '<span class="k sq">L</span>', rb: '<span class="k sq">R</span>', lt: '<span class="k sq">ZL</span>', home: '<span class="k mot">HOME</span>' },
  clavier: { a: '<span class="k mot">Entrée</span>', b: '<span class="k mot">Échap</span>', x: '<span class="k mot">R</span>', y: '<span class="k mot">T</span>', plus: '<span class="k mot">Tab</span>', minus: '<span class="k mot">Espace</span>', capture: '<span class="k mot">F12</span>', lb: '<span class="k sq">Q</span>', rb: '<span class="k sq">E</span>', lt: '<span class="k sq">F</span>', home: '<span class="k mot">Échap</span>' },
};
let glyphs = GLYPHS.clavier;
