// Vozes forjadas (presets): formato, validação e link de compartilhamento.
// O mesmo código valida a voz no navegador e no servidor MCP do Claude Code.

import { PARAMS, PARAM_BY_ID, clampParam, defaultValues, type ParamValues } from './params.ts';

export interface Preset {
  /** Identificador em kebab-case; vira o nome do arquivo em presets/. */
  id: string;
  nome: string;
  emoji: string;
  descricao: string;
  /** O que o Mestre Tímbrio fala quando a voz é escolhida. */
  fala: string;
  /** Só os parâmetros que fogem do padrão. */
  params: ParamValues;
}

export interface NormalizeResult {
  preset: Preset;
  avisos: string[];
}

export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/**
 * Aceita qualquer coisa vinda de fora (JSON de arquivo, link, Claude Code)
 * e devolve uma voz válida, com avisos do que precisou ser corrigido.
 */
export function normalizePreset(raw: unknown): NormalizeResult {
  const avisos: string[] = [];
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (k: string, fallback: string) => (typeof obj[k] === 'string' && (obj[k] as string).trim() ? (obj[k] as string).trim() : fallback);

  const nome = str('nome', 'Voz sem nome');
  let id = str('id', '');
  if (!ID_PATTERN.test(id)) {
    const novo = slugify(id || nome) || 'voz';
    if (id) avisos.push(`id "${id}" não é kebab-case; usei "${novo}".`);
    id = novo;
  }

  const params: ParamValues = {};
  const rawParams = (obj.params && typeof obj.params === 'object' ? obj.params : {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(rawParams)) {
    const def = PARAM_BY_ID.get(key);
    if (!def) {
      avisos.push(`parâmetro desconhecido "${key}" ignorado.`);
      continue;
    }
    const r = clampParam(def, value);
    if (r.aviso) avisos.push(r.aviso);
    if (r.value !== def.default) params[key] = r.value;
  }

  return {
    preset: {
      id,
      nome,
      emoji: str('emoji', '🎙️'),
      descricao: str('descricao', ''),
      fala: str('fala', ''),
      params,
    },
    avisos,
  };
}

/** Todos os valores da mesa pra uma voz: padrão + o que a voz muda. */
export function resolveValues(preset: Pick<Preset, 'params'>): ParamValues {
  return { ...defaultValues(), ...preset.params };
}

/** O inverso de resolveValues: guarda só o que foge do padrão. */
export function diffFromDefaults(values: ParamValues): ParamValues {
  const out: ParamValues = {};
  for (const p of PARAMS) {
    const v = values[p.id];
    if (v !== undefined && v !== p.default) out[p.id] = v;
  }
  return out;
}

// --- link de compartilhamento: #voz=<base64url do JSON> ---

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodePreset(preset: Preset): string {
  return toBase64Url(JSON.stringify(preset));
}

/** Devolve null se o código não for uma voz legível. */
export function decodePreset(code: string): NormalizeResult | null {
  try {
    return normalizePreset(JSON.parse(fromBase64Url(code)));
  } catch {
    return null;
  }
}

export function shareUrl(baseUrl: string, preset: Preset): string {
  return `${baseUrl.replace(/#.*$/, '')}#voz=${encodePreset(preset)}`;
}
