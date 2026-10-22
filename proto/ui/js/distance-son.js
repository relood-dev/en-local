// Son du jeu à distance : morceaux PCM 16 bits stéréo venus de distance.rs, rejoués sans à-coups.
class SonDistance extends AudioWorkletProcessor {
  constructor() {
    super();
    this.tampon = new Float32Array(48000 * 2); // 1 s, stéréo entrelacé
    this.lu = 0;
    this.ecrit = 0;
    this.pret = false;
    this.port.onmessage = (e) => {
      const pcm = new Int16Array(e.data);
      for (let k = 0; k < pcm.length; k++) this.tampon[(this.ecrit + k) % this.tampon.length] = pcm[k] / 32768;
      this.ecrit += pcm.length;
      // Plus de 80 ms d'avance : on saute, la latence reste basse.
      if (this.ecrit - this.lu > 48 * 2 * 80) this.lu = this.ecrit - 48 * 2 * 30;
    };
  }
  process(_, sorties) {
    const [g, d] = sorties[0];
    const dispo = this.ecrit - this.lu;
    // On attend 30 ms de son avant de jouer, puis après chaque trou.
    if (!this.pret && dispo < 48 * 2 * 30) return true;
    this.pret = dispo >= g.length * 2;
    if (!this.pret) return true;
    for (let k = 0; k < g.length; k++) {
      g[k] = this.tampon[this.lu++ % this.tampon.length];
      d[k] = this.tampon[this.lu++ % this.tampon.length];
    }
    return true;
  }
}
registerProcessor('son-distance', SonDistance);
