// O Mestre Tímbrio: avatar, balão de fala e o tour guiado pela forja.

import { PERSONA } from '../core/persona.ts';

const AVATAR = `
<svg viewBox="0 0 120 120" aria-hidden="true">
  <defs>
    <radialGradient id="tb-brilho" cx="50%" cy="60%" r="60%">
      <stop offset="0" stop-color="#ffb347" stop-opacity=".55"/>
      <stop offset="1" stop-color="#ffb347" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="60" cy="64" r="56" fill="url(#tb-brilho)"/>
  <!-- elmo -->
  <path d="M26 50 Q60 6 94 50 Z" fill="#8a6a3a" stroke="#3b2a14" stroke-width="3"/>
  <rect x="22" y="46" width="76" height="9" rx="4" fill="#b08a4a" stroke="#3b2a14" stroke-width="3"/>
  <circle cx="60" cy="30" r="5" fill="#e0b25c" stroke="#3b2a14" stroke-width="2"/>
  <!-- rosto -->
  <ellipse cx="60" cy="66" rx="25" ry="17" fill="#e9b48a" stroke="#3b2a14" stroke-width="3"/>
  <!-- óculos de forja -->
  <circle cx="49" cy="62" r="7" fill="#2b1d10" stroke="#b08a4a" stroke-width="3"/>
  <circle cx="71" cy="62" r="7" fill="#2b1d10" stroke="#b08a4a" stroke-width="3"/>
  <circle class="tb-olho" cx="50" cy="61" r="2.2" fill="#ffd27a"/>
  <circle class="tb-olho" cx="72" cy="61" r="2.2" fill="#ffd27a"/>
  <path d="M42 54 L56 56 M64 56 L78 54" stroke="#6b3b1a" stroke-width="4" stroke-linecap="round"/>
  <ellipse cx="60" cy="71" rx="5" ry="4" fill="#d4906a" stroke="#3b2a14" stroke-width="2"/>
  <!-- barba -->
  <path d="M33 72 Q34 112 60 116 Q86 112 87 72 Q78 84 60 84 Q42 84 33 72 Z" fill="#c4562a" stroke="#3b2a14" stroke-width="3"/>
  <path d="M46 96 L50 108 M60 98 L60 112 M74 96 L70 108" stroke="#8c3416" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="60" cy="112" r="3.5" fill="#e0b25c" stroke="#3b2a14" stroke-width="1.5"/>
  <!-- bigode e boca -->
  <path d="M40 80 Q50 72 60 79 Q70 72 80 80 Q70 84 60 81 Q50 84 40 80 Z" fill="#a8441e" stroke="#3b2a14" stroke-width="2"/>
  <ellipse class="tb-boca" cx="60" cy="87" rx="6" ry="1.5" fill="#3b1408"/>
</svg>`;

export class Guia {
  private readonly balao: HTMLElement;
  private readonly texto: HTMLElement;
  private readonly avatar: HTMLElement;
  private digitando = 0;
  private fixo = '';
  private tourPasso = -1;
  private tourAnterior: HTMLElement | null = null;

  constructor(raiz: HTMLElement) {
    raiz.innerHTML = `
      <div class="guia-avatar" title="${PERSONA.nome}">${AVATAR}</div>
      <div class="guia-balao" role="status" aria-live="polite">
        <div class="guia-nome">${PERSONA.nome} <span>${PERSONA.titulo}</span></div>
        <p class="guia-texto"></p>
        <div class="guia-acoes" hidden>
          <button type="button" class="btn-mini" data-tour="sair">Sair do tour</button>
          <button type="button" class="btn-mini quente" data-tour="proximo">Próximo</button>
        </div>
      </div>`;
    this.avatar = raiz.querySelector('.guia-avatar')!;
    this.balao = raiz.querySelector('.guia-balao')!;
    this.texto = raiz.querySelector('.guia-texto')!;
    raiz.querySelector('[data-tour="proximo"]')!.addEventListener('click', () => this.passo(this.tourPasso + 1));
    raiz.querySelector('[data-tour="sair"]')!.addEventListener('click', () => this.encerrarTour());
    this.dizer(PERSONA.saudacao);
  }

  /** Fala uma frase, letra por letra. A frase fica como a "fala atual" do guia. */
  dizer(frase: string): void {
    this.fixo = frase;
    this.escrever(frase);
  }

  /** Mostra uma dica passageira (ao passar o mouse num controle). */
  dica(titulo: string, frase: string): void {
    if (this.tourPasso >= 0) return;
    this.escrever(`${titulo}: ${frase}`, true);
  }

  /** Volta pra fala atual depois de uma dica. */
  voltar(): void {
    if (this.tourPasso >= 0) return;
    if (this.texto.textContent !== this.fixo) this.escrever(this.fixo, true);
  }

  private escrever(frase: string, instantaneo = false): void {
    clearInterval(this.digitando);
    this.avatar.classList.add('falando');
    if (instantaneo || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.texto.textContent = frase;
      this.avatar.classList.remove('falando');
      return;
    }
    let i = 0;
    this.texto.textContent = '';
    this.digitando = window.setInterval(() => {
      i += 2;
      this.texto.textContent = frase.slice(0, i);
      if (i >= frase.length) {
        clearInterval(this.digitando);
        this.avatar.classList.remove('falando');
      }
    }, 18);
  }

  iniciarTour(): void {
    this.passo(0);
  }

  private passo(n: number): void {
    this.tourAnterior?.classList.remove('destaque-tour');
    if (n >= PERSONA.tour.length) return this.encerrarTour();
    this.tourPasso = n;
    const etapa = PERSONA.tour[n];
    const alvo = document.querySelector<HTMLElement>(etapa.alvo);
    alvo?.classList.add('destaque-tour');
    alvo?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.tourAnterior = alvo;
    this.balao.querySelector<HTMLElement>('.guia-acoes')!.hidden = false;
    this.balao.querySelector<HTMLButtonElement>('[data-tour="proximo"]')!.textContent =
      n === PERSONA.tour.length - 1 ? 'Terminar' : `Próximo (${n + 1}/${PERSONA.tour.length})`;
    this.fixo = etapa.texto;
    this.escrever(etapa.texto);
  }

  private encerrarTour(): void {
    this.tourAnterior?.classList.remove('destaque-tour');
    this.tourPasso = -1;
    this.balao.querySelector<HTMLElement>('.guia-acoes')!.hidden = true;
    this.dizer('Pronto, agora a forja é sua. Passa o mouse em qualquer botão que eu explico.');
  }
}
