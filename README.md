# 🔥 Echoforge

**Forja de vozes pra RPG de mesa.** Muda o tom e o timbre da sua voz em tempo
real, numa mesa de som de verdade, e mostra a sua voz em cores — guiado pelo
**Mestre Tímbrio, o Forjador de Vozes**.

👉 **Abrir:** https://marcelao98.github.io/Echoforge/

- Sem instalar nada, sem IA, sem conta. Tudo roda no seu navegador e a sua voz
  não sai do seu computador.
- 12 vozes prontas: Narrador Épico, Orc, Anão, Elfo, Goblin, Dragão, Fantasma,
  Lich, Fada, Construto, Deus Antigo e Pedra Mensageira.
- Integra com o **Claude Code**: "forja a voz de um anão bêbado numa caverna" e
  ele cria a voz pra você.

## A mesa

| Seção | Controles |
|---|---|
| 🌬️ **Fole** | Ganho (com medidor) e Portão (cala o ruído de fundo) |
| 🗣️ **Garganta** | **Tom** (altura) e **Timbre** (formantes: o tamanho da criatura), independentes; Agilidade (latência) |
| 🔨 **Bigorna** | Graves, Médios, Agudos e Brasa (saturação) |
| ✨ **Encantos** | Robô + Engrenagem, Multidão, Bits, Rádio e Abafar |
| 🏰 **Ambiente** | Sala (taverna, caverna, catedral, masmorra, floresta), Reverb, Eco, Distância, Retorno |
| 🔥 **Saída** | Volume (com medidor e limitador de segurança) |

Knobs: arrasta pra cima/baixo, roda do mouse ou setas. **Shift** = ajuste fino.
**Duplo clique** volta ao padrão. Passa o mouse em qualquer controle e o Mestre
Tímbrio explica o que ele faz.

## A voz em cores

Cada nota musical tem uma cor (Dó é vermelho e a cada semitom o matiz anda
30°). O **visor** mostra a voz crua em cima e a forjada embaixo: os harmônicos
viram faixas coloridas e dá pra *ver* o tom descer quando você vira orc. A
**roda das notas** marca a nota que você está falando, e a **aura** cresce com o
volume e solta brasas mais rápidas quando a voz é mais brilhante.

## Usar no Discord (ou Foundry, OBS…)

O navegador não consegue virar microfone sozinho, então a voz passa por um
**cabo de áudio virtual**, que é grátis:

1. Instale o **VB-CABLE** (https://vb-audio.com/Cable/) no Windows/macOS. No Linux, use
   um sink nulo do PipeWire/PulseAudio (`pactl load-module module-null-sink sink_name=echoforge`).
2. No Echoforge, em **📡 Envio**, escolha **CABLE Input** e ligue o envio.
3. No Discord, em *Configurações → Voz e Vídeo → Dispositivo de entrada*, escolha
   **CABLE Output**. Desligue a redução de ruído do Discord (Krisp), que briga com os efeitos.
4. Pra se ouvir, ligue **🎧 Retorno** e escolha o seu fone. **Use fone**: em caixa de som
   a voz volta pro microfone e apita.

Escolher o dispositivo de saída funciona no Chrome e no Edge. Em outros
navegadores, o envio vai pra saída padrão do sistema.

Dica: **⏺️ Gravar 5 segundos** grava a voz forjada pra você se ouvir sem precisar do retorno.

## Compartilhar vozes

- **🔗 Copiar link**: quem abrir ganha a mesma voz, já guardada no baú do navegador.
- **⬇️ Exportar / ⬆️ Importar**: a voz vira um `.json` pequeno.
- **💾 Guardar no baú**: fica salva neste navegador.

## Com o Claude Code

O repositório traz um servidor MCP (`.mcp.json`) e a skill `forjar-voz`. Abra
o Claude Code na pasta do projeto e peça:

> forja uma voz de kobold ansioso que mora num esgoto

Ele usa as ferramentas `listar_parametros`, `forjar_voz`, `ajustar_voz`,
`ver_voz`, `listar_vozes`, `apagar_voz` e `link_da_voz`, grava em
`presets/<id>.json` e te devolve um link que abre a voz na hora.

Requer Node 22.18+ (o servidor roda TypeScript direto). Variáveis opcionais:
`ECHOFORGE_PRESETS` (pasta das vozes) e `ECHOFORGE_URL` (endereço do app pros links).

## Desenvolver

```bash
npm install
npm run dev                    # http://localhost:5173
npm test                       # testes do núcleo e do MCP
npm run build && npm run e2e   # abre um Chromium com microfone falso e mede o tom
```

O formato de uma voz:

```json
{
  "id": "orc",
  "nome": "Orc",
  "emoji": "👹",
  "descricao": "Grave, rouco e largo.",
  "fala": "Ugh! Grita que fica melhor.",
  "params": { "tom": -5, "timbre": -4, "graves": 6, "drive": 45, "sala": "taverna", "salaMix": 20 }
}
```

Só vai em `params` o que foge do padrão. Os ids e limites estão em
`src/core/params.ts`.

## Créditos

- [Signalsmith Stretch](https://signalsmith-audio.co.uk/code/stretch/) (MIT): tom e formantes em tempo real.
- [pitchy](https://github.com/ianprime0509/pitchy) (MIT): detecção da nota.
- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk) (MIT).

Licença MIT.
