// Baú de vozes em disco (presets/*.json), usado pelo servidor MCP.
// Toda escrita passa por normalizePreset: o que chega aqui sai sempre válido.

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { normalizePreset, shareUrl, ID_PATTERN, type NormalizeResult, type Preset } from '../src/core/preset.ts';

export class Bau {
  readonly dir: string;
  readonly appUrl: string;

  constructor(dir: string, appUrl: string) {
    this.dir = dir;
    this.appUrl = appUrl;
    mkdirSync(dir, { recursive: true });
  }

  private caminho(id: string): string {
    if (!ID_PATTERN.test(id)) throw new Error(`id inválido: "${id}" (use kebab-case, ex.: anao-bebado)`);
    return join(this.dir, `${id}.json`);
  }

  listar(): Preset[] {
    return readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => normalizePreset(JSON.parse(readFileSync(join(this.dir, f), 'utf8'))).preset)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  existe(id: string): boolean {
    return existsSync(this.caminho(id));
  }

  ler(id: string): Preset {
    const c = this.caminho(id);
    if (!existsSync(c)) throw new Error(`não existe voz "${id}". Vozes: ${this.listar().map((p) => p.id).join(', ')}`);
    return normalizePreset(JSON.parse(readFileSync(c, 'utf8'))).preset;
  }

  /** Grava a voz. Recusa sobrescrever sem pedir, pra não apagar voz de ninguém sem querer. */
  gravar(raw: unknown, sobrescrever = false): NormalizeResult {
    const r = normalizePreset(raw);
    const c = this.caminho(r.preset.id);
    if (existsSync(c) && !sobrescrever) {
      throw new Error(`já existe a voz "${r.preset.id}". Use ajustar_voz, ou forjar_voz com sobrescrever=true.`);
    }
    writeFileSync(c, JSON.stringify(r.preset, null, 2) + '\n', 'utf8');
    return r;
  }

  /** Mistura parâmetros novos na voz existente. null num parâmetro volta ele ao padrão. */
  ajustar(id: string, mudancas: { params?: Record<string, unknown>; nome?: string; emoji?: string; descricao?: string; fala?: string }): NormalizeResult {
    const atual = this.ler(id);
    const params: Record<string, unknown> = { ...atual.params };
    for (const [k, v] of Object.entries(mudancas.params ?? {})) {
      if (v === null) delete params[k];
      else params[k] = v;
    }
    const semVazios = Object.fromEntries(Object.entries(mudancas).filter(([k, v]) => k !== 'params' && v !== undefined));
    return this.gravar({ ...atual, ...semVazios, id, params }, true);
  }

  apagar(id: string): void {
    const c = this.caminho(id);
    if (!existsSync(c)) throw new Error(`não existe voz "${id}".`);
    rmSync(c);
  }

  link(id: string): string {
    return shareUrl(this.appUrl, this.ler(id));
  }
}
