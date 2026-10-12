// Teste de ponta a ponta: sobe o build, abre num Chromium de verdade com um
// microfone falso (uma "voz" sintética a 150 Hz) e confere que a forja
// realmente muda o tom, que o visor reage e que a página cabe no celular.
//
// Uso: npm run build && npm run e2e
// Chromium: usa CHROMIUM_PATH, ou /opt/pw-browsers/chromium, ou o do Playwright.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const RAIZ = new URL('..', import.meta.url).pathname;
const TELAS = join(RAIZ, 'e2e', 'screens');
const PORTA = 4317;
const F0 = 150;
mkdirSync(TELAS, { recursive: true });

/** Voz sintética: dente de serra a 150 Hz com vibrato leve, passando por duas "formantes". */
function vozSintetica(caminho, segundos = 12, sr = 48000) {
  const n = segundos * sr;
  const dados = new Int16Array(n);
  let fase = 0;
  const ress = [
    { f: 700, q: 6, y1: 0, y2: 0 },
    { f: 1200, q: 8, y1: 0, y2: 0 },
  ];
  for (const r of ress) {
    const w = (2 * Math.PI * r.f) / sr;
    r.a1 = 2 * Math.exp(-w / (2 * r.q)) * Math.cos(w);
    r.a2 = -Math.exp(-w / r.q);
  }
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = F0 * (1 + 0.004 * Math.sin(2 * Math.PI * 5 * t));
    fase = (fase + f / sr) % 1;
    const x = 2 * fase - 1;
    let y = x * 0.3;
    for (const r of ress) {
      const out = x * 0.05 + r.a1 * r.y1 + r.a2 * r.y2;
      r.y2 = r.y1;
      r.y1 = out;
      y += out * 0.15;
    }
    dados[i] = Math.max(-1, Math.min(1, y * 0.5)) * 32767;
  }
  const cab = Buffer.alloc(44);
  cab.write('RIFF', 0);
  cab.writeUInt32LE(36 + n * 2, 4);
  cab.write('WAVEfmt ', 8);
  cab.writeUInt32LE(16, 16);
  cab.writeUInt16LE(1, 20);
  cab.writeUInt16LE(1, 22);
  cab.writeUInt32LE(sr, 24);
  cab.writeUInt32LE(sr * 2, 28);
  cab.writeUInt16LE(2, 32);
  cab.writeUInt16LE(16, 34);
  cab.write('data', 36);
  cab.writeUInt32LE(n * 2, 40);
  writeFileSync(caminho, Buffer.concat([cab, Buffer.from(dados.buffer)]));
}

const falhas = [];
const conferir = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) falhas.push(msg);
};

const wav = join(TELAS, 'voz-falsa.wav');
vozSintetica(wav);

// roda o vite direto (sem npx) pra que o kill no fim derrube o servidor de verdade
const servidor = spawn(process.execPath, [join(RAIZ, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PORTA), '--strictPort'], { cwd: RAIZ, stdio: 'pipe' });
process.on('exit', () => servidor.kill());
await new Promise((ok, erro) => {
  servidor.stdout.on('data', (d) => String(d).includes(String(PORTA)) && ok());
  servidor.on('exit', (c) => erro(new Error(`vite preview saiu (${c}). Rodou npm run build?`)));
  setTimeout(() => erro(new Error('vite preview não subiu')), 20000);
});

const exe = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const navegador = await chromium.launch({
  executablePath: exe,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${wav}`,
    '--autoplay-policy=no-user-gesture-required',
  ],
});

try {
  const ctx = await navegador.newContext({ viewport: { width: 1360, height: 1000 }, permissions: ['microphone'] });
  const pagina = await ctx.newPage();
  const erros = [];
  pagina.on('pageerror', (e) => erros.push(String(e)));
  pagina.on('console', (m) => m.type() === 'error' && !m.text().includes('fonts.g') && erros.push(m.text()));

  const url = `http://localhost:${PORTA}/`;
  await pagina.goto(url);
  await pagina.waitForSelector('.voz');

  conferir((await pagina.locator('.voz').count()) >= 12, 'vozes prontas aparecem');
  conferir((await pagina.locator('.mesa .ctl').count()) >= 20, 'mesa desenhou todos os controles');
  conferir((await pagina.locator('.guia-texto').textContent()).length > 0, 'Mestre Tímbrio falou');
  conferir(!(await pagina.locator('.guia-acoes').isVisible()), 'botões do tour escondidos fora do tour');

  await pagina.click('#acender');
  await pagina.waitForFunction(() => document.body.classList.contains('forja-acesa'), null, { timeout: 10000 });
  conferir(true, 'forja acendeu com o microfone');

  /** Média do tom detectado na voz crua e na forjada, durante alguns quadros. */
  const medirTom = async () => {
    await pagina.waitForTimeout(1500);
    return pagina.evaluate(async () => {
      const amostras = { crua: [], forjada: [], db: [] };
      for (let i = 0; i < 30; i++) {
        const e = window.__echoforge.estado();
        if (e?.crua.hz) amostras.crua.push(e.crua.hz);
        if (e?.forjada.hz) amostras.forjada.push(e.forjada.hz);
        if (e) amostras.db.push(e.forjada.db);
        await new Promise((r) => setTimeout(r, 50));
      }
      const mediana = (a) => (a.length ? a.sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
      return { crua: mediana(amostras.crua), forjada: mediana(amostras.forjada), db: mediana(amostras.db) };
    });
  };

  const perto = (a, b, tolSemitons = 0.6) => a > 0 && Math.abs(12 * Math.log2(a / b)) < tolSemitons;

  const limpo = await medirTom();
  conferir(perto(limpo.crua, F0), `voz crua detectada em ~${F0} Hz (veio ${limpo.crua.toFixed(1)})`);
  conferir(perto(limpo.forjada, F0), `sem efeito, a forjada fica igual (veio ${limpo.forjada.toFixed(1)})`);
  conferir(limpo.db > -45, `tem som saindo da forja (${limpo.db.toFixed(1)} dB)`);
  const nivel = await pagina.evaluate(() => getComputedStyle(document.querySelector('.faixa-entrada .medidor')).getPropertyValue('--nivel'));
  conferir(Number(nivel) > 0, `medidor de entrada mexe (${nivel})`);
  await pagina.screenshot({ path: join(TELAS, 'forja-limpa.png'), fullPage: true });

  for (const [id, st] of [
    ['orc', -5],
    ['fada', 9],
  ]) {
    await pagina.click(`.voz[data-id="${id}"]`);
    const r = await medirTom();
    const esperado = F0 * 2 ** (st / 12);
    conferir(perto(r.forjada, esperado), `${id}: tom ${st > 0 ? '+' : ''}${st} st → ~${esperado.toFixed(0)} Hz (veio ${r.forjada.toFixed(1)})`);
    await pagina.screenshot({ path: join(TELAS, `voz-${id}.png`), fullPage: true });
  }

  // knob pelo teclado: Tom +12 a partir do zero
  await pagina.click('#zerar');
  const tom = pagina.locator('[data-param="tom"] .knob-corpo');
  await tom.focus();
  await pagina.keyboard.press('End');
  conferir((await tom.getAttribute('aria-valuenow')) === '12', 'knob responde ao teclado');
  const oitava = await medirTom();
  conferir(perto(oitava.forjada, F0 * 2), `tom +12 dobra a frequência (veio ${oitava.forjada.toFixed(1)})`);

  // link de compartilhamento
  const link = await pagina.evaluate(() => window.__echoforge.link());
  const outra = await ctx.newPage();
  await outra.goto(link);
  await outra.waitForSelector('.voz.do-bau');
  conferir((await outra.locator('.voz.do-bau.ativa').count()) === 1, 'link abre a voz e guarda no baú');
  conferir(!(await outra.evaluate(() => location.hash)), 'link limpa o #voz da barra');
  await outra.close();

  // tour
  await pagina.click('#tour');
  conferir((await pagina.locator('.destaque-tour').count()) === 1, 'tour destaca um pedaço da tela');
  await pagina.screenshot({ path: join(TELAS, 'tour.png') });

  // celular
  const cel = await navegador.newContext({ viewport: { width: 375, height: 800 }, deviceScaleFactor: 2 });
  const pc = await cel.newPage();
  await pc.goto(url);
  await pc.waitForSelector('.voz');
  const larguras = await pc.evaluate(() => ({ doc: document.documentElement.scrollWidth, tela: innerWidth }));
  conferir(larguras.doc <= larguras.tela, `cabe no celular sem rolar pro lado (${larguras.doc} ≤ ${larguras.tela})`);
  await pc.screenshot({ path: join(TELAS, 'celular.png'), fullPage: true });
  await cel.close();

  conferir(erros.length === 0, `sem erros no console${erros.length ? ': ' + erros.join(' | ') : ''}`);
} finally {
  await navegador.close();
  servidor.kill();
}

console.log(falhas.length ? `\n${falhas.length} falha(s).` : '\nTudo certo na forja.');
process.exit(falhas.length ? 1 : 0);
