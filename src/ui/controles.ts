// Controles da mesa de som: knob giratório, fader vertical e seletor.
// Todos falam a mesma língua: recebem a definição do parâmetro e avisam quando o valor muda.

import { clampParam, formatValue, type ChoiceParam, type NumberParam, type ParamDef } from '../core/params.ts';

export interface Controle {
  readonly el: HTMLElement;
  set(value: number | string): void;
}

type AoMudar = (id: string, value: number | string) => void;

const ARCO = 270;

function rotulo(def: ParamDef): HTMLElement {
  const l = document.createElement('div');
  l.className = 'ctl-nome';
  l.textContent = def.nome;
  return l;
}

function leitor(): HTMLElement {
  const v = document.createElement('div');
  v.className = 'ctl-valor';
  return v;
}

/** Knob: arrasta pra cima/baixo, roda do mouse, setas do teclado, duplo clique volta ao padrão. Shift = ajuste fino. */
export function knob(def: NumberParam, aoMudar: AoMudar): Controle {
  const el = document.createElement('div');
  el.className = 'ctl knob';
  el.dataset.param = def.id;
  const corpo = document.createElement('div');
  corpo.className = 'knob-corpo';
  corpo.tabIndex = 0;
  corpo.setAttribute('role', 'slider');
  corpo.setAttribute('aria-label', def.nome);
  corpo.setAttribute('aria-valuemin', String(def.min));
  corpo.setAttribute('aria-valuemax', String(def.max));
  corpo.innerHTML = `
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle class="knob-trilho" cx="50" cy="50" r="40" pathLength="360" />
      <circle class="knob-arco" cx="50" cy="50" r="40" pathLength="360" />
      <circle class="knob-tampa" cx="50" cy="50" r="29" />
      <line class="knob-ponteiro" x1="50" y1="50" x2="50" y2="27" />
    </svg>`;
  const valor = leitor();
  el.append(rotulo(def), corpo, valor);

  const arco = corpo.querySelector<SVGCircleElement>('.knob-arco')!;
  const ponteiro = corpo.querySelector<SVGLineElement>('.knob-ponteiro')!;
  let atual = def.default;

  const pos = (v: number) => (v - def.min) / (def.max - def.min);
  const desenhar = () => {
    // o arco nasce do zero (se o parâmetro é bipolar) ou do mínimo
    const zero = def.min < 0 && def.max > 0 ? pos(0) : 0;
    const p = pos(atual);
    const ini = Math.min(zero, p) * ARCO;
    const fim = Math.max(zero, p) * ARCO;
    arco.style.strokeDasharray = `${Math.max(0.001, fim - ini)} 360`;
    arco.style.strokeDashoffset = String(-ini);
    ponteiro.style.transform = `rotate(${p * ARCO - ARCO / 2}deg)`;
    valor.textContent = formatValue(def, atual);
    corpo.setAttribute('aria-valuenow', String(atual));
    corpo.setAttribute('aria-valuetext', valor.textContent);
    el.classList.toggle('mexido', atual !== def.default);
  };

  const mudar = (v: number) => {
    const novo = clampParam(def, v).value as number;
    if (novo === atual) return;
    atual = novo;
    desenhar();
    aoMudar(def.id, atual);
  };

  let arrasto: { y: number; v: number } | null = null;
  corpo.addEventListener('pointerdown', (e) => {
    corpo.setPointerCapture(e.pointerId);
    arrasto = { y: e.clientY, v: atual };
    corpo.focus();
  });
  corpo.addEventListener('pointermove', (e) => {
    if (!arrasto) return;
    const escala = (def.max - def.min) / (e.shiftKey ? 800 : 180);
    mudar(arrasto.v + (arrasto.y - e.clientY) * escala);
  });
  const soltar = () => (arrasto = null);
  corpo.addEventListener('pointerup', soltar);
  corpo.addEventListener('pointercancel', soltar);
  corpo.addEventListener('dblclick', () => mudar(def.default));
  corpo.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      mudar(atual + (e.deltaY < 0 ? 1 : -1) * def.step * (e.shiftKey ? 1 : 2));
    },
    { passive: false },
  );
  corpo.addEventListener('keydown', (e) => {
    const passo = def.step * (e.shiftKey ? 1 : Math.max(1, Math.round((def.max - def.min) / def.step / 40)));
    const mapa: Record<string, number> = {
      ArrowUp: atual + passo,
      ArrowRight: atual + passo,
      ArrowDown: atual - passo,
      ArrowLeft: atual - passo,
      Home: def.min,
      End: def.max,
    };
    if (e.key in mapa) {
      e.preventDefault();
      mudar(mapa[e.key]);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      mudar(def.default);
    }
  });

  desenhar();
  return {
    el,
    set(v) {
      atual = clampParam(def, v).value as number;
      desenhar();
    },
  };
}

/** Fader vertical de mesa de som, com medidor de volume ao lado. */
export function fader(def: NumberParam, aoMudar: AoMudar): Controle & { medidor: HTMLElement } {
  const el = document.createElement('div');
  el.className = 'ctl fader';
  el.dataset.param = def.id;
  const trilho = document.createElement('div');
  trilho.className = 'fader-trilho';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(def.min);
  input.max = String(def.max);
  input.step = String(def.step);
  input.setAttribute('aria-label', def.nome);
  const medidor = document.createElement('div');
  medidor.className = 'medidor';
  medidor.innerHTML = '<div class="medidor-barra"></div><div class="medidor-pico"></div>';
  trilho.append(input, medidor);
  const valor = leitor();
  el.append(rotulo(def), trilho, valor);

  const desenhar = (v: number) => {
    input.value = String(v);
    valor.textContent = formatValue(def, v);
    el.classList.toggle('mexido', v !== def.default);
  };
  input.addEventListener('input', () => {
    const v = clampParam(def, input.value).value as number;
    valor.textContent = formatValue(def, v);
    el.classList.toggle('mexido', v !== def.default);
    aoMudar(def.id, v);
  });
  input.addEventListener('dblclick', () => {
    desenhar(def.default);
    aoMudar(def.id, def.default);
  });
  desenhar(def.default);
  return { el, medidor, set: (v) => desenhar(clampParam(def, v).value as number) };
}

/** Seletor de opções (ex.: a sala do reverb). */
export function seletor(def: ChoiceParam, aoMudar: AoMudar): Controle {
  const el = document.createElement('div');
  el.className = 'ctl seletor';
  el.dataset.param = def.id;
  const sel = document.createElement('select');
  sel.setAttribute('aria-label', def.nome);
  for (const o of def.opcoes) sel.add(new Option(def.rotulos[o] ?? o, o));
  el.append(rotulo(def), sel);
  sel.addEventListener('change', () => {
    el.classList.toggle('mexido', sel.value !== def.default);
    aoMudar(def.id, sel.value);
  });
  const set = (v: number | string) => {
    sel.value = String(clampParam(def, v).value);
    el.classList.toggle('mexido', sel.value !== def.default);
  };
  set(def.default);
  return { el, set };
}

/** Atualiza um medidor: db de -60 a 0. */
export function medir(medidor: HTMLElement, db: number): void {
  const p = Math.max(0, Math.min(1, (db + 60) / 60));
  medidor.style.setProperty('--nivel', String(p));
  medidor.classList.toggle('quente', db > -6);
}
