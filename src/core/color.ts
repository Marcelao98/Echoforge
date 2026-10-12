// A voz em cores: cada nota musical tem uma cor no círculo cromático.
// Dó é vermelho, e a cada semitom o matiz anda 30°. A oitava mexe no brilho.

export const NOTE_NAMES = ['Dó', 'Dó♯', 'Ré', 'Ré♯', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Sol♯', 'Lá', 'Lá♯', 'Si'] as const;

export interface NoteInfo {
  midi: number;
  /** 0 = Dó … 11 = Si */
  classe: number;
  oitava: number;
  nome: string;
  /** Desvio da nota exata, em cents (-50…50). */
  cents: number;
}

export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

export function noteOf(freq: number): NoteInfo | null {
  if (!(freq > 0) || !Number.isFinite(freq)) return null;
  const exact = freqToMidi(freq);
  const midi = Math.round(exact);
  const classe = ((midi % 12) + 12) % 12;
  const oitava = Math.floor(midi / 12) - 1;
  return { midi, classe, oitava, nome: `${NOTE_NAMES[classe]}${oitava}`, cents: Math.round((exact - midi) * 100) };
}

/** Matiz contínuo (0–360) de uma frequência: notas vizinhas têm cores vizinhas. */
export function hueOf(freq: number): number {
  const pc = (((freqToMidi(freq) % 12) + 12) % 12);
  return pc * 30;
}

export function noteHue(classe: number): number {
  return (((classe % 12) + 12) % 12) * 30;
}

/** HSL → RGB, componentes 0–255. h em graus, s e l em 0–1. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/**
 * Paleta do espectrograma: pra cada faixa de frequência, a cor da nota dela.
 * Devolve RGB por faixa; a intensidade (volume) é aplicada na hora de desenhar.
 */
export function bandColors(freqs: ArrayLike<number>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(freqs.length * 3);
  for (let i = 0; i < freqs.length; i++) {
    const f = freqs[i];
    const [r, g, b] = f > 0 ? hslToRgb(hueOf(f), 0.9, 0.55) : [0, 0, 0];
    out[i * 3] = r;
    out[i * 3 + 1] = g;
    out[i * 3 + 2] = b;
  }
  return out;
}

/** Frequências em escala logarítmica, do grave ao agudo, pra eixo do espectrograma. */
export function logFrequencies(count: number, minHz = 60, maxHz = 8000): Float32Array {
  const out = new Float32Array(count);
  const ratio = Math.log(maxHz / minHz);
  for (let i = 0; i < count; i++) out[i] = minHz * Math.exp((ratio * i) / Math.max(1, count - 1));
  return out;
}
