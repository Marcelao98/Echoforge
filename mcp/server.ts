#!/usr/bin/env node
// Servidor MCP do Echoforge: deixa o Claude Code forjar vozes.
// Não tem IA dentro: o Claude decide os parâmetros, este servidor valida e grava em presets/.
// O app carrega presets/*.json no build, e o link_da_voz abre a voz direto, sem build.
//
// Rodar: node mcp/server.ts   (Node 22.18+; o Claude Code acha ele pelo .mcp.json)
// Variáveis: ECHOFORGE_PRESETS (pasta das vozes), ECHOFORGE_URL (endereço do app).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { PARAMS, SECTIONS } from '../src/core/params.ts';
import { PERSONA } from '../src/core/persona.ts';
import { Bau } from './store.ts';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const bau = new Bau(
  process.env.ECHOFORGE_PRESETS ?? join(RAIZ, 'presets'),
  process.env.ECHOFORGE_URL ?? 'https://marcelao98.github.io/Echoforge/',
);

const texto = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const json = (v: unknown) => texto(JSON.stringify(v, null, 2));
const erro = (e: unknown) => ({ ...texto(`Erro: ${e instanceof Error ? e.message : String(e)}`), isError: true });

const valorParam = z.union([z.number(), z.string()]);
const paramsSchema = z
  .record(z.string(), valorParam)
  .describe('Só os parâmetros que mudam do padrão. Ids e limites em listar_parametros. Valores fora do limite são corrigidos e avisados.');

export function criarServidor(): McpServer {
  const server = new McpServer(
    { name: 'echoforge', version: '0.1.0' },
    {
      instructions:
        `Você é o ${PERSONA.nome}, ${PERSONA.titulo}, na forja do Echoforge. ` +
        'Antes de forjar, chame listar_parametros pra saber ids e limites. ' +
        'Tom e timbre (formantes) são o coração da voz: tom muda a altura, timbre muda o tamanho da criatura. ' +
        'Depois de forjar, entregue o link_da_voz pra pessoa abrir no navegador.',
    },
  );

  server.registerTool(
    'listar_parametros',
    {
      title: 'Listar parâmetros da mesa',
      description: 'Todos os controles da mesa de som: id, seção, limites, padrão, unidade e o que cada um faz.',
      annotations: { readOnlyHint: true },
    },
    async () =>
      json({
        secoes: SECTIONS,
        parametros: PARAMS.map((p) =>
          p.kind === 'number'
            ? { id: p.id, nome: p.nome, secao: p.section, min: p.min, max: p.max, passo: p.step, padrao: p.default, unidade: p.unidade, dica: p.dica }
            : { id: p.id, nome: p.nome, secao: p.section, opcoes: p.opcoes, padrao: p.default, dica: p.dica },
        ),
      }),
  );

  server.registerTool(
    'listar_vozes',
    {
      title: 'Listar vozes',
      description: 'As vozes que já existem no baú (presets/), com id, nome, emoji e descrição.',
      annotations: { readOnlyHint: true },
    },
    async () => json(bau.listar().map(({ id, nome, emoji, descricao }) => ({ id, nome, emoji, descricao }))),
  );

  server.registerTool(
    'ver_voz',
    {
      title: 'Ver voz',
      description: 'A voz completa: parâmetros, descrição e a fala do Mestre Tímbrio.',
      inputSchema: { id: z.string().describe('id da voz, ex.: orc') },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      try {
        return json(bau.ler(id));
      } catch (e) {
        return erro(e);
      }
    },
  );

  server.registerTool(
    'forjar_voz',
    {
      title: 'Forjar voz nova',
      description:
        'Cria uma voz nova e grava em presets/<id>.json. Devolve a voz normalizada, avisos do que foi corrigido e o link pra abrir no navegador.',
      inputSchema: {
        nome: z.string().min(1).describe('Nome pra mostrar, ex.: "Anão Bêbado"'),
        id: z.string().optional().describe('kebab-case; se faltar, sai do nome'),
        emoji: z.string().optional(),
        descricao: z.string().describe('Uma frase sobre como a voz soa'),
        fala: z.string().describe(`O que o ${PERSONA.nome} fala quando a voz é escolhida: dica de interpretação, no tom dele (anão ferreiro, bem-humorado)`),
        params: paramsSchema,
        sobrescrever: z.boolean().optional().describe('true pra substituir uma voz com o mesmo id'),
      },
    },
    async ({ sobrescrever, ...voz }) => {
      try {
        const r = bau.gravar(voz, sobrescrever ?? false);
        return json({ voz: r.preset, avisos: r.avisos, arquivo: `presets/${r.preset.id}.json`, link: bau.link(r.preset.id) });
      } catch (e) {
        return erro(e);
      }
    },
  );

  server.registerTool(
    'ajustar_voz',
    {
      title: 'Ajustar voz',
      description: 'Muda só parte de uma voz que já existe. Em params, mande null num parâmetro pra voltar ele ao padrão.',
      inputSchema: {
        id: z.string(),
        params: z.record(z.string(), valorParam.nullable()).optional(),
        nome: z.string().optional(),
        emoji: z.string().optional(),
        descricao: z.string().optional(),
        fala: z.string().optional(),
      },
    },
    async ({ id, ...mudancas }) => {
      try {
        const r = bau.ajustar(id, mudancas);
        return json({ voz: r.preset, avisos: r.avisos, link: bau.link(id) });
      } catch (e) {
        return erro(e);
      }
    },
  );

  server.registerTool(
    'apagar_voz',
    {
      title: 'Apagar voz',
      description: 'Remove presets/<id>.json. Não tem volta (a não ser pelo git).',
      inputSchema: { id: z.string() },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      try {
        bau.apagar(id);
        return texto(`Voz "${id}" derretida.`);
      } catch (e) {
        return erro(e);
      }
    },
  );

  server.registerTool(
    'link_da_voz',
    {
      title: 'Link da voz',
      description: 'Link que abre o Echoforge já com essa voz na mesa (e guarda no baú do navegador).',
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      try {
        return texto(bau.link(id));
      } catch (e) {
        return erro(e);
      }
    },
  );

  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await criarServidor().connect(new StdioServerTransport());
}
