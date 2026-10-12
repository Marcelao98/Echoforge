# Echoforge

Forja de vozes pra RPG de mesa: modulador de voz em tempo real, no navegador,
com mesa de som, a voz em cores e um guia — o **Mestre Tímbrio, o Forjador de
Vozes** (nome e falas em `src/core/persona.ts`). Sem IA dentro do app: a voz
nunca sai do computador de quem usa. O Claude Code entra pelo servidor MCP.

## Mapa

```
src/core/      # lógica pura, sem DOM nem Web Audio — roda no navegador E no Node
  params.ts    # catálogo único dos controles (limites, padrão, dica). Fonte da verdade.
  preset.ts    # formato da voz, normalização/validação, link #voz=
  color.ts     # nota → cor (Dó = vermelho, +30° por semitom)
  dsp.ts       # curvas de saturação, salas de reverb sintéticas, rms, brilho
  persona.ts   # Mestre Tímbrio: falas e tour
src/audio/engine.ts   # cadeia Web Audio; só recebe ParamValues
src/viz/visor.ts      # espectrograma colorido, roda das notas, aura
src/ui/               # knobs/faders (controles.ts) e o guia (guia.ts)
src/main.ts           # liga tudo
public/worklets/forge-fx.js  # portão e bitcrusher (AudioWorklet, JS puro)
presets/*.json        # vozes prontas; entram no app no build
mcp/                  # servidor MCP (node mcp/server.ts) + baú em disco
.claude/skills/forjar-voz/   # como o Claude deve forjar vozes
tests/                # vitest: core + MCP por stdio
e2e/smoke.mjs         # Chromium com microfone falso: mede o tom de verdade
```

## Regras

- **Parâmetro novo**: declarar em `params.ts` (com `dica` na voz do Tímbrio) e
  aplicar em `VoiceEngine.aplicar`. A interface e o MCP pegam sozinhos.
- `src/core/` e `mcp/` rodam com o type stripping do Node (22.18+): imports com
  `.ts`, nada de `enum`, `namespace` ou parameter properties.
- O Signalsmith Stretch é carregado como worklet pelo arquivo **original**
  (`?url` em `engine.ts`). Não troque por import do bundle: o Vite reescreve o
  código que ele serializa pro worklet e o nó trava sem erro.
- Toda voz que entra (arquivo, link, MCP) passa por `normalizePreset`.
- Textos da interface e do código em português.

## Comandos

```
npm run dev         # app local
npm test            # vitest (core + MCP)
npm run typecheck
npm run build && npm run e2e   # ponta a ponta; prints em e2e/screens/
npm run mcp         # servidor MCP por stdio
```

O push na `main` roda o workflow `Forja` (testes + e2e) e publica no GitHub
Pages: https://marcelao98.github.io/Echoforge/
