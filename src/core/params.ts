// Catálogo dos parâmetros da mesa de som.
// É a fonte única da verdade: a interface desenha os controles a partir daqui,
// o motor de áudio lê os valores por estes ids, e o servidor MCP valida as
// vozes que o Claude Code forja contra estes limites.
// Sem DOM, sem Web Audio: roda no navegador e no Node.

export type SectionId = 'entrada' | 'garganta' | 'bigorna' | 'encantos' | 'ambiente' | 'saida';

export interface Section {
  id: SectionId;
  nome: string;
  emoji: string;
  descricao: string;
}

export const SECTIONS: readonly Section[] = [
  { id: 'entrada', nome: 'Fole', emoji: '🌬️', descricao: 'O ar que entra na forja: volume do microfone e o portão que cala o ruído.' },
  { id: 'garganta', nome: 'Garganta', emoji: '🗣️', descricao: 'Tom e timbre: a altura da voz e o tamanho da criatura que fala.' },
  { id: 'bigorna', nome: 'Bigorna', emoji: '🔨', descricao: 'Equalização e saturação: onde a voz é martelada.' },
  { id: 'encantos', nome: 'Encantos', emoji: '✨', descricao: 'Robô, multidão, bits quebrados e filtros de rádio.' },
  { id: 'ambiente', nome: 'Ambiente', emoji: '🏰', descricao: 'Onde a voz ecoa: taverna, caverna, catedral.' },
  { id: 'saida', nome: 'Saída', emoji: '🔥', descricao: 'Volume final da voz forjada.' },
];

export const ROOMS = ['nenhum', 'taverna', 'caverna', 'catedral', 'masmorra', 'floresta'] as const;
export type Room = (typeof ROOMS)[number];

export const ROOM_LABELS: Record<Room, string> = {
  nenhum: 'Nenhum',
  taverna: 'Taverna',
  caverna: 'Caverna',
  catedral: 'Catedral',
  masmorra: 'Masmorra',
  floresta: 'Floresta',
};

interface BaseParam {
  id: string;
  nome: string;
  section: SectionId;
  /** Explicação curta, na voz do Mestre Tímbrio. */
  dica: string;
  /** Controles marcados como fader viram deslizantes verticais; o resto vira knob. */
  fader?: boolean;
}

export interface NumberParam extends BaseParam {
  kind: 'number';
  min: number;
  max: number;
  step: number;
  default: number;
  unidade: string;
}

export interface ChoiceParam extends BaseParam {
  kind: 'choice';
  opcoes: readonly string[];
  rotulos: Record<string, string>;
  default: string;
}

export type ParamDef = NumberParam | ChoiceParam;

const num = (p: Omit<NumberParam, 'kind'>): NumberParam => ({ kind: 'number', ...p });

export const PARAMS: readonly ParamDef[] = [
  // Fole
  num({ id: 'entrada', nome: 'Ganho', section: 'entrada', min: -24, max: 24, step: 0.5, default: 0, unidade: 'dB', fader: true,
    dica: 'Quanto ar o fole sopra. Se o medidor ficar vermelho, tá soprando demais.' }),
  num({ id: 'portao', nome: 'Portão', section: 'entrada', min: -90, max: -20, step: 1, default: -60, unidade: 'dB',
    dica: 'Abaixo desse volume, a forja fica em silêncio. Sobe pra calar ventilador e teclado.' }),

  // Garganta
  num({ id: 'tom', nome: 'Tom', section: 'garganta', min: -12, max: 12, step: 0.5, default: 0, unidade: 'st',
    dica: 'A altura da voz, em semitons. Pra baixo, gigante. Pra cima, fada.' }),
  num({ id: 'timbre', nome: 'Timbre', section: 'garganta', min: -12, max: 12, step: 0.5, default: 0, unidade: 'st',
    dica: 'O tamanho da garganta, sem mexer no tom. Negativo é peito de troll, positivo é goblin.' }),
  num({ id: 'latencia', nome: 'Agilidade', section: 'garganta', min: 30, max: 120, step: 5, default: 60, unidade: 'ms',
    dica: 'Quanto a forja espera pra trabalhar o tom. Menos é mais rápido, mais é mais limpo.' }),

  // Bigorna
  num({ id: 'graves', nome: 'Graves', section: 'bigorna', min: -15, max: 15, step: 0.5, default: 0, unidade: 'dB',
    dica: 'O peso do peito. Dragão gosta de muito.' }),
  num({ id: 'medios', nome: 'Médios', section: 'bigorna', min: -15, max: 15, step: 0.5, default: 0, unidade: 'dB',
    dica: 'O nariz da voz. Puxa pra cima e vira trombeta, pra baixo e vira veludo.' }),
  num({ id: 'agudos', nome: 'Agudos', section: 'bigorna', min: -15, max: 15, step: 0.5, default: 0, unidade: 'dB',
    dica: 'O brilho. Elfo tem de sobra, morto-vivo quase nenhum.' }),
  num({ id: 'drive', nome: 'Brasa', section: 'bigorna', min: 0, max: 100, step: 1, default: 0, unidade: '%',
    dica: 'Saturação. Deixa a voz rouca, rasgada, como quem gritou a noite inteira.' }),

  // Encantos
  num({ id: 'robo', nome: 'Robô', section: 'encantos', min: 0, max: 100, step: 1, default: 0, unidade: '%',
    dica: 'Mistura de modulação em anel. Construtos, golens e autômatos falam assim.' }),
  num({ id: 'roboHz', nome: 'Engrenagem', section: 'encantos', min: 10, max: 300, step: 1, default: 50, unidade: 'Hz',
    dica: 'A velocidade da engrenagem do robô. Baixo treme, alto zumbe metálico.' }),
  num({ id: 'multidao', nome: 'Multidão', section: 'encantos', min: 0, max: 100, step: 1, default: 0, unidade: '%',
    dica: 'Várias bocas falando junto. Bom pra enxame, legião ou entidade.' }),
  num({ id: 'bits', nome: 'Bits', section: 'encantos', min: 2, max: 16, step: 1, default: 16, unidade: 'bits',
    dica: 'Menos bits, mais quebrada a voz. 16 é limpo. 4 é fantasma de rádio velho.' }),
  num({ id: 'passaAlta', nome: 'Rádio', section: 'encantos', min: 20, max: 2000, step: 10, default: 20, unidade: 'Hz',
    dica: 'Corta os graves. Sobe pra voz soar de dentro de um elmo ou de uma pedra mágica.' }),
  num({ id: 'passaBaixa', nome: 'Abafar', section: 'encantos', min: 500, max: 20000, step: 100, default: 20000, unidade: 'Hz',
    dica: 'Corta os agudos. Baixa pra voz vir de trás de uma porta ou de debaixo d’água.' }),

  // Ambiente
  { kind: 'choice', id: 'sala', nome: 'Sala', section: 'ambiente', opcoes: ROOMS, rotulos: ROOM_LABELS, default: 'nenhum',
    dica: 'Onde a voz ecoa. Cada sala tem seu tamanho e sua pedra.' },
  num({ id: 'salaMix', nome: 'Reverb', section: 'ambiente', min: 0, max: 100, step: 1, default: 30, unidade: '%',
    dica: 'Quanto da sala entra na voz.' }),
  num({ id: 'eco', nome: 'Eco', section: 'ambiente', min: 0, max: 100, step: 1, default: 0, unidade: '%',
    dica: 'Repetições da voz. Ótimo pra deus antigo falando do fundo de um poço.' }),
  num({ id: 'ecoTempo', nome: 'Distância', section: 'ambiente', min: 50, max: 1000, step: 10, default: 300, unidade: 'ms',
    dica: 'Quanto tempo o eco leva pra voltar.' }),
  num({ id: 'ecoRetorno', nome: 'Retorno', section: 'ambiente', min: 0, max: 90, step: 1, default: 35, unidade: '%',
    dica: 'Quantas vezes o eco volta. Cuidado acima de 80.' }),

  // Saída
  num({ id: 'saida', nome: 'Volume', section: 'saida', min: -40, max: 12, step: 0.5, default: 0, unidade: 'dB', fader: true,
    dica: 'O volume da voz forjada que vai pro mundo.' }),
];

export type ParamId = (typeof PARAMS)[number]['id'];
export type ParamValues = Record<string, number | string>;

export const PARAM_BY_ID: ReadonlyMap<string, ParamDef> = new Map(PARAMS.map((p) => [p.id, p]));

export function defaultValues(): ParamValues {
  const out: ParamValues = {};
  for (const p of PARAMS) out[p.id] = p.default;
  return out;
}

export interface ClampResult {
  value: number | string;
  /** Mensagem quando o valor recebido precisou ser corrigido. */
  aviso?: string;
}

/** Corrige um valor pro que o parâmetro aceita: número dentro do limite e no passo, ou opção válida. */
export function clampParam(def: ParamDef, raw: unknown): ClampResult {
  if (def.kind === 'choice') {
    if (typeof raw === 'string' && def.opcoes.includes(raw)) return { value: raw };
    return { value: def.default, aviso: `${def.id}: "${String(raw)}" não é uma opção (${def.opcoes.join(', ')}); usei "${def.default}".` };
  }
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) {
    return { value: def.default, aviso: `${def.id}: "${String(raw)}" não é número; usei ${def.default}.` };
  }
  const stepped = Math.round((n - def.min) / def.step) * def.step + def.min;
  const clamped = Math.min(def.max, Math.max(def.min, stepped));
  const value = Number(clamped.toFixed(4));
  if (n < def.min || n > def.max) {
    return { value, aviso: `${def.id}: ${n} fora de ${def.min}…${def.max} ${def.unidade}; usei ${value}.` };
  }
  return { value };
}

export function formatValue(def: ParamDef, value: number | string): string {
  if (def.kind === 'choice') return def.rotulos[String(value)] ?? String(value);
  const v = Number(value);
  if (def.id === 'bits' && v >= 16) return 'limpo';
  if (def.id === 'passaAlta' && v <= 20) return 'aberto';
  if (def.id === 'passaBaixa' && v >= 20000) return 'aberto';
  if (def.id === 'portao' && v <= -90) return 'aberto';
  const signed = def.min < 0 && v > 0 ? '+' : '';
  const shown = Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Number(v.toFixed(1)));
  return `${signed}${shown} ${def.unidade}`;
}
