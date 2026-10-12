import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Bau } from '../mcp/store.ts';
import { decodePreset } from '../src/core/preset.ts';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'echoforge-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('baú em disco', () => {
  it('grava, lista, ajusta e apaga', () => {
    const bau = new Bau(dir, 'https://exemplo.dev/app/');
    const r = bau.gravar({ nome: 'Anão Bêbado', descricao: 'x', fala: 'y', params: { tom: -2, timbre: -30 } });
    expect(r.preset.id).toBe('anao-bebado');
    expect(r.avisos).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(dir, 'anao-bebado.json'), 'utf8')).params).toEqual({ tom: -2, timbre: -12 });
    expect(bau.listar().map((p) => p.id)).toEqual(['anao-bebado']);

    expect(() => bau.gravar({ nome: 'Anão Bêbado' })).toThrow(/já existe/);

    const a = bau.ajustar('anao-bebado', { params: { tom: null, drive: 40 }, emoji: '🍺' });
    expect(a.preset.params).toEqual({ timbre: -12, drive: 40 });
    expect(a.preset.emoji).toBe('🍺');
    expect(a.preset.descricao).toBe('x');

    const link = bau.link('anao-bebado');
    expect(link.startsWith('https://exemplo.dev/app/#voz=')).toBe(true);
    expect(decodePreset(link.split('#voz=')[1])?.preset.params).toEqual({ timbre: -12, drive: 40 });

    bau.apagar('anao-bebado');
    expect(existsSync(join(dir, 'anao-bebado.json'))).toBe(false);
  });

  it('não deixa id escapar da pasta', () => {
    const bau = new Bau(dir, 'https://x/');
    expect(() => bau.ler('../segredo')).toThrow(/id inválido/);
  });
});

describe('servidor MCP por stdio', () => {
  it('fala o protocolo e forja uma voz', async () => {
    const client = new Client({ name: 'teste', version: '0' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(import.meta.dirname, '..', 'mcp', 'server.ts')],
      env: { ...process.env, ECHOFORGE_PRESETS: dir, ECHOFORGE_URL: 'https://exemplo.dev/' } as Record<string, string>,
    });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(
        ['ajustar_voz', 'apagar_voz', 'forjar_voz', 'link_da_voz', 'listar_parametros', 'listar_vozes', 'ver_voz'].sort(),
      );

      const params = await client.callTool({ name: 'listar_parametros', arguments: {} });
      const catalogo = JSON.parse((params.content as { text: string }[])[0].text);
      expect(catalogo.parametros.find((p: { id: string }) => p.id === 'tom').max).toBe(12);

      const forjada = await client.callTool({
        name: 'forjar_voz',
        arguments: { nome: 'Kobold Ansioso', descricao: 'agudo e tremido', fala: 'Fala rápido!', params: { tom: 6, timbre: 4, sala: 'caverna' } },
      });
      const r = JSON.parse((forjada.content as { text: string }[])[0].text);
      expect(r.voz.id).toBe('kobold-ansioso');
      expect(r.link).toMatch(/^https:\/\/exemplo\.dev\/#voz=/);
      expect(existsSync(join(dir, 'kobold-ansioso.json'))).toBe(true);

      const ruim = await client.callTool({ name: 'ver_voz', arguments: { id: 'nao-existe' } });
      expect(ruim.isError).toBe(true);
    } finally {
      await client.close();
    }
  }, 20000);
});
