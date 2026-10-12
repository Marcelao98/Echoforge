// Matemática de áudio pura, sem Web Audio: curvas e respostas ao impulso.
// O motor (src/audio/engine.ts) usa isto pra preencher os nós do navegador.

import type { Room } from './params.ts';

export const dbToGain = (db: number): number => Math.pow(10, db / 20);
export const gainToDb = (g: number): number => (g > 0 ? 20 * Math.log10(g) : -Infinity);

/**
 * Curva da "Brasa" (saturação): tanh com ganho crescente, normalizada pra que
 * o pico continue em ±1. amount 0–100; 0 devolve uma reta (sem efeito).
 */
export function driveCurve(amount: number, size = 2048): Float32Array {
  const k = 1 + (Math.max(0, Math.min(100, amount)) / 100) * 24;
  const norm = Math.tanh(k);
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

/** Quantização do bitcrusher: o mesmo cálculo que roda no worklet. */
export function quantize(sample: number, bits: number): number {
  if (bits >= 16) return sample;
  const levels = Math.pow(2, bits - 1);
  return Math.round(sample * levels) / levels;
}

export interface RoomShape {
  /** Duração da cauda em segundos. */
  duracao: number;
  /** Quão rápido a cauda some (maior = some mais rápido). */
  decaimento: number;
  /** Atraso antes da cauda começar, em segundos. */
  preAtraso: number;
  /** 0–1: quanto a cauda perde brilho com o tempo. */
  abafamento: number;
}

export const ROOM_SHAPES: Record<Exclude<Room, 'nenhum'>, RoomShape> = {
  taverna: { duracao: 0.9, decaimento: 4.5, preAtraso: 0.008, abafamento: 0.55 },
  caverna: { duracao: 3.2, decaimento: 2.2, preAtraso: 0.03, abafamento: 0.35 },
  catedral: { duracao: 5.5, decaimento: 1.4, preAtraso: 0.05, abafamento: 0.15 },
  masmorra: { duracao: 1.8, decaimento: 3.0, preAtraso: 0.015, abafamento: 0.7 },
  floresta: { duracao: 1.2, decaimento: 5.5, preAtraso: 0.06, abafamento: 0.8 },
};

/** Gerador pseudoaleatório determinístico (mulberry32): a mesma sala soa sempre igual. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Resposta ao impulso sintética de uma sala: ruído com decaimento exponencial,
 * passando por um passa-baixa que fecha com o tempo. Devolve um canal por lado
 * (esquerdo e direito com sementes diferentes, pra soar largo).
 */
export function impulseResponse(room: Exclude<Room, 'nenhum'>, sampleRate: number): [Float32Array, Float32Array] {
  const shape = ROOM_SHAPES[room];
  const length = Math.max(1, Math.round(shape.duracao * sampleRate));
  const pre = Math.round(shape.preAtraso * sampleRate);
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < 2; ch++) {
    const rand = rng(room.length * 7919 + ch * 104729);
    const data = new Float32Array(length);
    let lp = 0;
    for (let i = pre; i < length; i++) {
      const t = (i - pre) / sampleRate;
      const env = Math.exp(-shape.decaimento * t);
      // o filtro fecha com o tempo: a cauda fica mais escura que o começo
      const alpha = 1 - shape.abafamento * Math.min(1, t / shape.duracao) * 0.95;
      lp += alpha * ((rand() * 2 - 1) - lp);
      data[i] = lp * env;
    }
    channels.push(data);
  }
  // normaliza pela energia, pra salas grandes não explodirem o volume
  let energy = 0;
  for (const c of channels) for (const s of c) energy += s * s;
  const scale = energy > 0 ? 1 / Math.sqrt(energy / 2) : 1;
  for (const c of channels) for (let i = 0; i < c.length; i++) c[i] *= scale;
  return [channels[0], channels[1]];
}

/** Volume RMS de um bloco, em dBFS. */
export function rmsDb(buf: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return gainToDb(Math.sqrt(sum / Math.max(1, buf.length)));
}

/** Centroide espectral normalizado (0–1) a partir de magnitudes em dB: o "brilho" da voz. */
export function spectralBrightness(dbBins: ArrayLike<number>, minDb = -100): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < dbBins.length; i++) {
    const m = Math.max(0, dbBins[i] - minDb);
    num += m * i;
    den += m;
  }
  return den > 0 ? num / den / Math.max(1, dbBins.length - 1) : 0;
}
