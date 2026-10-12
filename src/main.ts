// Liga tudo: mesa, vozes, guia, visor e o motor de áudio.

import './style.css';
import { PARAMS, SECTIONS, defaultValues, type ParamValues } from './core/params.ts';
import { decodePreset, diffFromDefaults, normalizePreset, resolveValues, shareUrl, slugify, type Preset } from './core/preset.ts';
import { PERSONA } from './core/persona.ts';
import { VoiceEngine } from './audio/engine.ts';
import { Visor, rodaParada, type EstadoVisor } from './viz/visor.ts';
import { Guia } from './ui/guia.ts';
import { fader, knob, medir, seletor, type Controle } from './ui/controles.ts';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

// --- armazenamento local (só conveniência: pode falhar em aba anônima) ---
const CHAVE_BAU = 'echoforge:bau';
const CHAVE_MESA = 'echoforge:mesa';
const ler = <T>(chave: string, padrao: T): T => {
  try {
    const v = localStorage.getItem(chave);
    return v ? (JSON.parse(v) as T) : padrao;
  } catch {
    return padrao;
  }
};
const gravar = (chave: string, valor: unknown) => {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* sem armazenamento: segue sem lembrar */
  }
};

// --- vozes ---
const prontas: Preset[] = Object.values(
  import.meta.glob<unknown>('../presets/*.json', { eager: true, import: 'default' }),
)
  .map((raw) => normalizePreset(raw).preset)
  .sort((a, b) => (a.id === 'narrador' ? -1 : b.id === 'narrador' ? 1 : a.nome.localeCompare(b.nome, 'pt-BR')));

let bau: Preset[] = ler<unknown[]>(CHAVE_BAU, []).map((r) => normalizePreset(r).preset);
let vozAtual: Preset | null = null;
let valores: ParamValues = defaultValues();

const guia = new Guia($('#guia'));
let motor: VoiceEngine | null = null;
let visor: Visor | null = null;

// --- mesa de som ---
const controles = new Map<string, Controle>();
let medidorEntrada: HTMLElement | null = null;
let medidorSaida: HTMLElement | null = null;
let salvarMesa = 0;

function aoMudar(id: string, valor: number | string): void {
  valores = { ...valores, [id]: valor };
  motor?.aplicar(valores);
  marcarVoz();
  clearTimeout(salvarMesa);
  salvarMesa = window.setTimeout(() => gravar(CHAVE_MESA, { voz: vozAtual?.id ?? null, params: diffFromDefaults(valores) }), 300);
}

function montarMesa(): void {
  const mesa = $('#mesa');
  for (const secao of SECTIONS) {
    const faixa = document.createElement('div');
    faixa.className = `faixa faixa-${secao.id}`;
    faixa.innerHTML = `<h2 title="${secao.descricao}"><span>${secao.emoji}</span> ${secao.nome}</h2><div class="faixa-controles"></div>`;
    const caixa = faixa.querySelector('.faixa-controles')!;
    for (const def of PARAMS.filter((p) => p.section === secao.id)) {
      let c: Controle;
      if (def.kind === 'choice') c = seletor(def, aoMudar);
      else if (def.fader) {
        const f = fader(def, aoMudar);
        if (def.id === 'entrada') medidorEntrada = f.medidor;
        if (def.id === 'saida') medidorSaida = f.medidor;
        c = f;
      } else c = knob(def, aoMudar);
      c.el.addEventListener('pointerenter', () => guia.dica(def.nome, def.dica));
      c.el.addEventListener('pointerleave', () => guia.voltar());
      c.el.addEventListener('focusin', () => guia.dica(def.nome, def.dica));
      c.el.addEventListener('focusout', () => guia.voltar());
      controles.set(def.id, c);
      caixa.append(c.el);
    }
    mesa.append(faixa);
  }
}

function aplicarValores(novos: ParamValues): void {
  valores = { ...novos };
  for (const [id, c] of controles) c.set(valores[id]);
  motor?.aplicar(valores);
  gravar(CHAVE_MESA, { voz: vozAtual?.id ?? null, params: diffFromDefaults(valores) });
}

// --- barra de vozes ---
function marcarVoz(): void {
  // compara as duas na ordem do catálogo, senão a ordem das chaves do JSON engana
  const mexida = vozAtual !== null && JSON.stringify(diffFromDefaults(valores)) !== JSON.stringify(diffFromDefaults(resolveValues(vozAtual)));
  document.querySelectorAll<HTMLElement>('.voz').forEach((b) => {
    const ativa = b.dataset.id === vozAtual?.id;
    b.classList.toggle('ativa', ativa);
    b.classList.toggle('mexida', ativa && mexida);
  });
}

function escolherVoz(p: Preset, falar = true): void {
  vozAtual = p;
  aplicarValores(resolveValues(p));
  marcarVoz();
  if (falar) guia.dizer(p.fala || `${p.emoji} ${p.nome}. ${p.descricao}`);
}

function botaoVoz(p: Preset, doBau: boolean): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `voz${doBau ? ' do-bau' : ''}`;
  b.dataset.id = p.id;
  b.title = p.descricao;
  b.innerHTML = `<span class="voz-emoji">${p.emoji}</span><span class="voz-nome"></span>`;
  b.querySelector('.voz-nome')!.textContent = p.nome;
  b.addEventListener('click', () => escolherVoz(p));
  if (doBau) {
    const x = document.createElement('span');
    x.className = 'voz-apagar';
    x.textContent = '×';
    x.title = 'Tirar do baú';
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      bau = bau.filter((v) => v.id !== p.id);
      gravar(CHAVE_BAU, bau);
      montarVozes();
    });
    b.append(x);
  }
  return b;
}

function montarVozes(): void {
  const lista = $('#vozes-lista');
  lista.replaceChildren(...prontas.map((p) => botaoVoz(p, false)));
  if (bau.length) {
    const sep = document.createElement('span');
    sep.className = 'vozes-sep';
    sep.textContent = 'Baú:';
    lista.append(sep, ...bau.map((p) => botaoVoz(p, true)));
  }
  marcarVoz();
}

function guardarNoBau(p: Preset): void {
  bau = [...bau.filter((v) => v.id !== p.id), p];
  gravar(CHAVE_BAU, bau);
  montarVozes();
}

/** A voz que está na mesa agora, como preset (a escolhida, ou uma avulsa se nada foi escolhido). */
function vozDaMesa(nome?: string): Preset {
  const base = vozAtual ?? { id: 'voz-avulsa', nome: 'Voz avulsa', emoji: '🎙️', descricao: 'Forjada na mesa.', fala: '' };
  const n = nome ?? base.nome;
  return normalizePreset({ ...base, id: nome ? slugify(nome) : base.id, nome: n, params: diffFromDefaults(valores) }).preset;
}

$('#salvar').addEventListener('click', () => {
  const nome = prompt('Que nome essa voz vai ter?', vozAtual && !prontas.includes(vozAtual) ? vozAtual.nome : '');
  if (!nome?.trim()) return;
  const p = normalizePreset({
    ...vozDaMesa(nome.trim()),
    emoji: '🛡️',
    descricao: 'Forjada por você.',
    fala: `${nome.trim()}, direto do baú. Essa saiu da sua bigorna.`,
  }).preset;
  guardarNoBau(p);
  vozAtual = p;
  marcarVoz();
  guia.dizer(PERSONA.falas.vozSalva);
});

$('#link').addEventListener('click', async () => {
  const url = shareUrl(location.href, vozDaMesa());
  try {
    await navigator.clipboard.writeText(url);
    guia.dizer(PERSONA.falas.linkCopiado);
  } catch {
    prompt('Copia o link:', url);
  }
});

$('#exportar').addEventListener('click', () => {
  const p = vozDaMesa();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(p, null, 2) + '\n'], { type: 'application/json' }));
  a.download = `${p.id}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$<HTMLInputElement>('#importar').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const { preset, avisos } = normalizePreset(JSON.parse(await file.text()));
    guardarNoBau(preset);
    escolherVoz(preset, false);
    guia.dizer(PERSONA.falas.vozImportada + (avisos.length ? ` (Corrigi ${avisos.length} coisa(s) que vieram tortas.)` : ''));
  } catch {
    guia.dizer(PERSONA.falas.vozInvalida);
  }
});

$('#zerar').addEventListener('click', () => {
  vozAtual = null;
  aplicarValores(defaultValues());
  marcarVoz();
  guia.dizer(PERSONA.falas.zerado);
});

// --- forja (motor de áudio) ---
let ultimoAvisoAlto = 0;
let ultimoEstado: EstadoVisor | null = null;

// Gancho pros testes de ponta a ponta (e2e/smoke.mjs) lerem o que o visor vê.
(window as unknown as { __echoforge: object }).__echoforge = {
  estado: () => ultimoEstado,
  valores: () => valores,
  link: () => shareUrl(location.href, vozDaMesa()),
};

async function garantirMotor(): Promise<VoiceEngine> {
  if (motor) return motor;
  motor = await VoiceEngine.create();
  motor.aplicar(valores);
  visor = new Visor(
    motor.analyserIn,
    motor.analyserOut,
    { cru: $<HTMLCanvasElement>('#esp-cru'), forjado: $<HTMLCanvasElement>('#esp-forjado'), roda: $<HTMLCanvasElement>('#roda-canvas') },
    (e) => {
      ultimoEstado = e;
      if (medidorEntrada) medir(medidorEntrada, e.crua.db);
      if (medidorSaida) medir(medidorSaida, e.forjada.db);
      if (e.crua.db > -2 && performance.now() - ultimoAvisoAlto > 15000) {
        ultimoAvisoAlto = performance.now();
        guia.dizer(PERSONA.falas.microfoneAlto);
      }
    },
  );
  visor.iniciar();
  $('#saidas').classList.toggle('sem-escolha', !motor.podeEscolherSaida);
  return motor;
}

function estadoForja(): void {
  const acesa = motor?.ativo ?? false;
  const btn = $('#acender');
  btn.textContent = acesa ? '🧯 Apagar a forja' : '🔥 Acender a forja';
  document.body.classList.toggle('forja-acesa', acesa);
}

async function listarDispositivos(): Promise<void> {
  if (!motor) return;
  const { entradas, saidas } = await motor.dispositivos();
  const encher = (sel: HTMLSelectElement, lista: MediaDeviceInfo[], padrao: string) => {
    const atual = sel.value;
    sel.replaceChildren(new Option(padrao, ''), ...lista.filter((d) => d.deviceId && d.deviceId !== 'default').map((d, i) => new Option(d.label || `Dispositivo ${i + 1}`, d.deviceId)));
    sel.value = atual;
  };
  encher($<HTMLSelectElement>('#fonte'), entradas, 'Microfone padrão');
  encher($<HTMLSelectElement>('#disp-envio'), saidas, 'Saída padrão');
  encher($<HTMLSelectElement>('#disp-retorno'), saidas, 'Saída padrão');
}

async function acender(): Promise<void> {
  try {
    const m = await garantirMotor();
    await m.ligarMicrofone($<HTMLSelectElement>('#fonte').value || undefined);
    guia.dizer(PERSONA.falas.forjaAcesa);
    await listarDispositivos();
  } catch (err) {
    console.error(err);
    guia.dizer(PERSONA.falas.semMicrofone);
  }
  estadoForja();
}

$('#acender').addEventListener('click', async () => {
  if (motor?.ativo) {
    motor.desligarFonte();
    guia.dizer(PERSONA.falas.forjaApagada);
    estadoForja();
  } else {
    await acender();
  }
});

$<HTMLSelectElement>('#fonte').addEventListener('change', () => {
  if (motor?.ativo) void acender();
});

$<HTMLInputElement>('#arquivo').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const m = await garantirMotor();
    await m.ligarArquivo(file);
    guia.dizer(`Joguei "${file.name}" na forja, em loop. Mexe na mesa e escuta pelo Retorno.`);
  } catch {
    guia.dizer('Não consegui ler esse arquivo de áudio.');
  }
  estadoForja();
});

$<HTMLInputElement>('#retorno').addEventListener('change', async (e) => {
  const ligado = (e.target as HTMLInputElement).checked;
  const m = await garantirMotor();
  await m.setRetorno(ligado);
  if (ligado) guia.dizer(PERSONA.falas.retornoSemFone);
});
$<HTMLInputElement>('#envio').addEventListener('change', async (e) => {
  (await garantirMotor()).setEnvio((e.target as HTMLInputElement).checked);
});
$<HTMLSelectElement>('#disp-envio').addEventListener('change', async (e) => {
  await (await garantirMotor()).setDispositivoEnvio((e.target as HTMLSelectElement).value).catch(() => guia.dizer('Esse dispositivo não aceitou a voz.'));
});
$<HTMLSelectElement>('#disp-retorno').addEventListener('change', async (e) => {
  await (await garantirMotor()).setDispositivoRetorno((e.target as HTMLSelectElement).value).catch(() => guia.dizer('Esse dispositivo não aceitou a voz.'));
});

$('#gravar').addEventListener('click', async () => {
  const m = await garantirMotor();
  if (!m.ativo) {
    guia.dizer('Acende a forja primeiro, senão eu gravo o silêncio.');
    return;
  }
  const btn = $<HTMLButtonElement>('#gravar');
  btn.disabled = true;
  btn.textContent = '⏺️ Gravando…';
  guia.dizer(PERSONA.falas.gravando);
  const blob = await m.gravar(5);
  const audio = $<HTMLAudioElement>('#amostra');
  if (audio.src) URL.revokeObjectURL(audio.src);
  audio.src = URL.createObjectURL(blob);
  audio.hidden = false;
  btn.disabled = false;
  btn.textContent = '⏺️ Gravar 5 segundos';
  guia.dizer(PERSONA.falas.gravacaoPronta);
});

$('#tour').addEventListener('click', () => guia.iniciarTour());

// --- início ---
montarMesa();
montarVozes();
rodaParada($<HTMLCanvasElement>('#roda-canvas'));

const hash = new URLSearchParams(location.hash.slice(1)).get('voz');
const doLink = hash ? decodePreset(hash) : null;
if (doLink) {
  guardarNoBau(doLink.preset);
  escolherVoz(doLink.preset, false);
  guia.dizer(`Alguém te mandou a voz "${doLink.preset.nome}". Já tá na bigorna e guardada no baú. Acende a forja pra experimentar.`);
  history.replaceState(null, '', location.pathname + location.search);
} else {
  const ultima = ler<{ voz: string | null; params: ParamValues } | null>(CHAVE_MESA, null);
  if (ultima) {
    vozAtual = [...prontas, ...bau].find((p) => p.id === ultima.voz) ?? null;
    aplicarValores(resolveValues(normalizePreset({ params: ultima.params }).preset));
    marcarVoz();
  }
}
