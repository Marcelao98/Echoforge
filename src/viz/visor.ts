// O visor da forja: a voz em cores.
// - Espectrograma: cada faixa de frequência pinta a cor da sua nota; o volume acende.
// - Roda das notas: os 12 semitons em círculo, marcando a nota crua e a forjada.
// - Aura: brasas que crescem com o volume e mudam de forma com o brilho da voz.

import { PitchDetector } from 'pitchy';
import { NOTE_NAMES, bandColors, hueOf, logFrequencies, noteHue, noteOf, type NoteInfo } from '../core/color.ts';
import { rmsDb, spectralBrightness } from '../core/dsp.ts';

export interface Leitura {
  db: number;
  nota: NoteInfo | null;
  hz: number;
  brilho: number;
}

export interface EstadoVisor {
  crua: Leitura;
  forjada: Leitura;
}

class Ouvido {
  private readonly tempo: Float32Array<ArrayBuffer>;
  private readonly freq: Float32Array<ArrayBuffer>;
  private readonly detector: PitchDetector<Float32Array<ArrayBuffer>>;
  readonly analyser: AnalyserNode;
  constructor(analyser: AnalyserNode) {
    this.analyser = analyser;
    this.tempo = new Float32Array(2048);
    this.freq = new Float32Array(analyser.frequencyBinCount);
    this.detector = PitchDetector.forFloat32Array(this.tempo.length);
    this.detector.minVolumeDecibels = -50;
  }
  get espectro(): Float32Array<ArrayBuffer> {
    return this.freq;
  }
  ler(): Leitura {
    this.analyser.getFloatTimeDomainData(this.tempo);
    this.analyser.getFloatFrequencyData(this.freq);
    const db = rmsDb(this.tempo);
    const [hz, clareza] = this.detector.findPitch(this.tempo, this.analyser.context.sampleRate);
    const ok = clareza > 0.88 && hz > 50 && hz < 1500 && db > -50;
    // o brilho só olha até ~8 kHz, onde a voz mora
    const limite = Math.round((8000 / (this.analyser.context.sampleRate / 2)) * this.freq.length);
    return { db, hz: ok ? hz : 0, nota: ok ? noteOf(hz) : null, brilho: spectralBrightness(this.freq.subarray(0, limite), -95) };
  }
}

class Espectrograma {
  private readonly g: CanvasRenderingContext2D;
  private freqs: Float32Array = new Float32Array(0);
  private cores: Uint8ClampedArray = new Uint8ClampedArray(0);
  private coluna: ImageData | null = null;
  private readonly canvas: HTMLCanvasElement;
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d', { willReadFrequently: false })!;
  }
  private preparar(): void {
    const h = this.canvas.height;
    if (this.freqs.length === h) return;
    // de cima (agudo) pra baixo (grave)
    this.freqs = logFrequencies(h, 60, 8000).reverse();
    this.cores = bandColors(this.freqs);
    this.coluna = this.g.createImageData(2, h);
    this.g.fillStyle = '#0b0806';
    this.g.fillRect(0, 0, this.canvas.width, h);
  }
  desenhar(espectro: Float32Array, sampleRate: number, min = -95, max = -25): void {
    this.preparar();
    const { width: w, height: h } = this.canvas;
    const col = this.coluna!;
    const binHz = sampleRate / 2 / espectro.length;
    for (let y = 0; y < h; y++) {
      const bin = Math.min(espectro.length - 1, Math.round(this.freqs[y] / binHz));
      const v = Math.max(0, Math.min(1, (espectro[bin] - min) / (max - min)));
      const k = v * v * 1.15;
      for (let x = 0; x < 2; x++) {
        const o = (y * 2 + x) * 4;
        col.data[o] = this.cores[y * 3] * k + 11 * (1 - k);
        col.data[o + 1] = this.cores[y * 3 + 1] * k + 8 * (1 - k);
        col.data[o + 2] = this.cores[y * 3 + 2] * k + 6 * (1 - k);
        col.data[o + 3] = 255;
      }
    }
    this.g.drawImage(this.canvas, -2, 0);
    this.g.putImageData(col, w - 2, 0);
  }
}

interface Brasa {
  ang: number;
  dist: number;
  vel: number;
  vida: number;
  hue: number;
}

class Roda {
  private readonly g: CanvasRenderingContext2D;
  private brasas: Brasa[] = [];
  private raio = 0;
  private hueAtual = 20;
  private readonly canvas: HTMLCanvasElement;
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d')!;
  }
  desenhar(e: EstadoVisor): void {
    const { width: w, height: h } = this.canvas;
    const g = this.g;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) / 2 - 6;
    g.clearRect(0, 0, w, h);

    // 12 setores, um por nota
    for (let i = 0; i < 12; i++) {
      const a0 = ((i - 3) / 12) * Math.PI * 2 - Math.PI / 12;
      const a1 = a0 + (Math.PI * 2) / 12;
      const ativo = e.forjada.nota?.classe === i;
      const cru = e.crua.nota?.classe === i;
      g.beginPath();
      g.moveTo(cx + Math.cos(a0) * R * 0.72, cy + Math.sin(a0) * R * 0.72);
      g.arc(cx, cy, R, a0, a1);
      g.arc(cx, cy, R * 0.72, a1, a0, true);
      g.closePath();
      g.fillStyle = `hsla(${noteHue(i)}, 85%, ${ativo ? 58 : 32}%, ${ativo ? 1 : 0.55})`;
      g.fill();
      if (cru) {
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(255,240,220,0.9)';
        g.stroke();
      }
      const am = (a0 + a1) / 2;
      g.fillStyle = ativo ? '#1a0f08' : 'rgba(255,235,210,0.75)';
      g.font = `${Math.max(9, R * 0.085)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(NOTE_NAMES[i], cx + Math.cos(am) * R * 0.86, cy + Math.sin(am) * R * 0.86);
    }

    // aura: cresce com o volume, a cor segue a nota forjada
    const vol = Math.max(0, Math.min(1, (e.forjada.db + 60) / 50));
    this.raio += (vol - this.raio) * 0.25;
    if (e.forjada.hz > 0) this.hueAtual = hueOf(e.forjada.hz);
    const nucleo = R * (0.18 + this.raio * 0.45);
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, nucleo * 1.6);
    grad.addColorStop(0, `hsla(${this.hueAtual}, 100%, 75%, ${0.35 + this.raio * 0.6})`);
    grad.addColorStop(0.5, `hsla(${this.hueAtual}, 95%, 50%, ${0.2 + this.raio * 0.4})`);
    grad.addColorStop(1, 'hsla(20, 90%, 10%, 0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, Math.min(R * 0.7, nucleo * 1.6), 0, Math.PI * 2);
    g.fill();

    // brasas: voz brilhante solta brasas mais rápidas e mais longe
    const novas = Math.round(vol * 4);
    for (let i = 0; i < novas; i++) {
      this.brasas.push({ ang: Math.random() * Math.PI * 2, dist: nucleo * 0.6, vel: 0.6 + e.forjada.brilho * 5 + Math.random() * 1.5, vida: 1, hue: this.hueAtual + (Math.random() - 0.5) * 30 });
    }
    this.brasas = this.brasas.filter((b) => b.vida > 0 && b.dist < R * 0.7);
    for (const b of this.brasas) {
      b.dist += b.vel;
      b.ang += 0.01;
      b.vida -= 0.02;
      g.fillStyle = `hsla(${b.hue}, 100%, 65%, ${b.vida})`;
      g.beginPath();
      g.arc(cx + Math.cos(b.ang) * b.dist, cy + Math.sin(b.ang) * b.dist, 1.5 + b.vida * 2, 0, Math.PI * 2);
      g.fill();
    }

    // nota no centro
    const nota = e.forjada.nota;
    g.fillStyle = 'rgba(255,245,230,0.95)';
    g.textAlign = 'center';
    g.font = `600 ${R * 0.2}px system-ui, sans-serif`;
    g.fillText(nota ? nota.nome : '—', cx, cy - R * 0.04);
    g.font = `${R * 0.09}px system-ui, sans-serif`;
    g.fillStyle = 'rgba(255,235,210,0.7)';
    g.fillText(nota ? `${Math.round(e.forjada.hz)} Hz` : 'fala algo', cx, cy + R * 0.16);
  }
}

/** Ajusta o tamanho interno do canvas ao tamanho na tela (nítido em telas de alta densidade). */
function ajustar(canvas: HTMLCanvasElement): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

const SILENCIO: Leitura = { db: -Infinity, nota: null, hz: 0, brilho: 0 };

/** Desenha a roda parada, antes da forja acender, pra tela não ficar vazia. */
export function rodaParada(canvas: HTMLCanvasElement): void {
  ajustar(canvas);
  new Roda(canvas).desenhar({ crua: SILENCIO, forjada: SILENCIO });
}

export class Visor {
  private readonly cru: Ouvido;
  private readonly forjado: Ouvido;
  private readonly espCru: Espectrograma;
  private readonly espForjado: Espectrograma;
  private readonly roda: Roda;
  private quadro = 0;
  private rodando = false;

  private readonly canvases: { cru: HTMLCanvasElement; forjado: HTMLCanvasElement; roda: HTMLCanvasElement };
  private readonly aoLer: (e: EstadoVisor) => void;

  constructor(
    analyserIn: AnalyserNode,
    analyserOut: AnalyserNode,
    canvases: { cru: HTMLCanvasElement; forjado: HTMLCanvasElement; roda: HTMLCanvasElement },
    aoLer: (e: EstadoVisor) => void,
  ) {
    this.canvases = canvases;
    this.aoLer = aoLer;
    this.cru = new Ouvido(analyserIn);
    this.forjado = new Ouvido(analyserOut);
    this.espCru = new Espectrograma(canvases.cru);
    this.espForjado = new Espectrograma(canvases.forjado);
    this.roda = new Roda(canvases.roda);
  }

  iniciar(): void {
    if (this.rodando) return;
    this.rodando = true;
    const passo = () => {
      if (!this.rodando) return;
      Object.values(this.canvases).forEach(ajustar);
      const e: EstadoVisor = { crua: this.cru.ler(), forjada: this.forjado.ler() };
      const sr = this.cru.analyser.context.sampleRate;
      this.espCru.desenhar(this.cru.espectro, sr);
      this.espForjado.desenhar(this.forjado.espectro, sr);
      this.roda.desenhar(e);
      this.aoLer(e);
      this.quadro = requestAnimationFrame(passo);
    };
    this.quadro = requestAnimationFrame(passo);
  }

  parar(): void {
    this.rodando = false;
    cancelAnimationFrame(this.quadro);
  }
}
