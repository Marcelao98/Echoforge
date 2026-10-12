// Motor da forja: monta a cadeia de efeitos do Web Audio e aplica os valores da mesa.
// Não sabe nada de interface. Recebe ParamValues, devolve analisadores pro visor.
//
// fonte → ganho → portão → [visor cru] → tom/timbre → EQ → brasa → robô → multidão
//       → bits → rádio/abafar → eco → sala → volume → limitador → [visor forjado]
//       → envio (cabo virtual / alto-falante) e retorno (fone)

import SignalsmithStretch from 'signalsmith-stretch';
// O Stretch transforma o próprio código em texto pra montar o worklet; se o bundler
// reescreve o arquivo, o worklet quebra calado. Então carregamos o arquivo original, intacto.
import stretchWorkletUrl from '../../node_modules/signalsmith-stretch/SignalsmithStretch.mjs?url';
import type { ParamValues, Room } from '../core/params.ts';
import { dbToGain, driveCurve, impulseResponse } from '../core/dsp.ts';

type StretchNode = AudioNode & {
  start: (when?: number) => void;
  schedule: (opts: Record<string, number | boolean>) => void;
  configure: (opts: Record<string, number | boolean | null>) => Promise<void>;
  latency: () => Promise<number>;
};

type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };
type SinkAudio = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };

const SMOOTH = 0.03;

/** Mistura seca/molhada: entrada → (seco + efeito) → saída. */
class Mix {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly dry: GainNode;
  readonly wet: GainNode;
  constructor(ctx: AudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.input.connect(this.dry).connect(this.output);
    this.wet.connect(this.output);
    this.wet.gain.value = 0;
  }
  set(ctx: AudioContext, dry: number, wet: number): void {
    this.dry.gain.setTargetAtTime(dry, ctx.currentTime, SMOOTH);
    this.wet.gain.setTargetAtTime(wet, ctx.currentTime, SMOOTH);
  }
}

export interface Devices {
  entradas: MediaDeviceInfo[];
  saidas: MediaDeviceInfo[];
}

export class VoiceEngine {
  readonly ctx: SinkContext;
  readonly analyserIn: AnalyserNode;
  readonly analyserOut: AnalyserNode;
  readonly podeEscolherSaida: boolean;

  private source: AudioNode | null = null;
  private stream: MediaStream | null = null;
  private readonly entrada: GainNode;
  private readonly portao: AudioWorkletNode;
  private readonly garganta: Mix;
  private readonly stretch: StretchNode;
  private readonly graves: BiquadFilterNode;
  private readonly medios: BiquadFilterNode;
  private readonly agudos: BiquadFilterNode;
  private readonly brasa: Mix;
  private readonly brasaShaper: WaveShaperNode;
  private readonly robo: Mix;
  private readonly roboOsc: OscillatorNode;
  private readonly multidao: Mix;
  private readonly bits: AudioWorkletNode;
  private readonly passaAlta: BiquadFilterNode;
  private readonly passaBaixa: BiquadFilterNode;
  private readonly eco: Mix;
  private readonly ecoDelay: DelayNode;
  private readonly ecoRetorno: GainNode;
  private readonly sala: Mix;
  private readonly salaConv: ConvolverNode;
  private readonly saida: GainNode;
  private readonly envio: GainNode;
  private readonly retorno: GainNode;
  private readonly retornoAudio: SinkAudio;
  private readonly gravacaoDest: MediaStreamAudioDestinationNode;

  private ultimo: ParamValues = {};
  private salaAtual: Room | null = null;
  private latenciaAtual = 0;

  private constructor(ctx: AudioContext, stretch: StretchNode) {
    this.ctx = ctx as SinkContext;
    this.stretch = stretch;
    this.podeEscolherSaida = typeof this.ctx.setSinkId === 'function';

    this.entrada = ctx.createGain();
    this.portao = new AudioWorkletNode(ctx, 'echoforge-portao', { outputChannelCount: [1] });
    this.analyserIn = this.analyser();

    // Garganta: o stretch só entra quando tom ou timbre saem do zero, pra voz crua não ganhar atraso
    this.garganta = new Mix(ctx);
    this.garganta.input.connect(stretch).connect(this.garganta.wet);

    this.graves = ctx.createBiquadFilter();
    this.graves.type = 'lowshelf';
    this.graves.frequency.value = 220;
    this.medios = ctx.createBiquadFilter();
    this.medios.type = 'peaking';
    this.medios.frequency.value = 1200;
    this.medios.Q.value = 0.9;
    this.agudos = ctx.createBiquadFilter();
    this.agudos.type = 'highshelf';
    this.agudos.frequency.value = 4500;

    this.brasa = new Mix(ctx);
    this.brasaShaper = ctx.createWaveShaper();
    this.brasaShaper.oversample = '4x';
    this.brasa.input.connect(this.brasaShaper).connect(this.brasa.wet);

    // Robô: modulação em anel, um oscilador mexendo no ganho do sinal
    this.robo = new Mix(ctx);
    const anel = ctx.createGain();
    anel.gain.value = 0;
    this.roboOsc = ctx.createOscillator();
    this.roboOsc.connect(anel.gain);
    this.roboOsc.start();
    this.robo.input.connect(anel).connect(this.robo.wet);

    // Multidão: três cópias com atraso oscilante, espalhadas no estéreo
    this.multidao = new Mix(ctx);
    [-0.7, 0, 0.7].forEach((pan, i) => {
      const delay = ctx.createDelay(0.1);
      delay.delayTime.value = 0.014 + i * 0.009;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.25 + i * 0.17;
      const depth = ctx.createGain();
      depth.gain.value = 0.0035 + i * 0.001;
      lfo.connect(depth).connect(delay.delayTime);
      lfo.start();
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      this.multidao.input.connect(delay).connect(panner).connect(this.multidao.wet);
    });

    this.bits = new AudioWorkletNode(ctx, 'echoforge-bits', { outputChannelCount: [2] });

    this.passaAlta = ctx.createBiquadFilter();
    this.passaAlta.type = 'highpass';
    this.passaAlta.Q.value = 0.7;
    this.passaBaixa = ctx.createBiquadFilter();
    this.passaBaixa.type = 'lowpass';
    this.passaBaixa.Q.value = 0.7;

    // Eco: atraso com realimentação; um passa-baixa no laço escurece cada volta
    this.eco = new Mix(ctx);
    this.ecoDelay = ctx.createDelay(1.5);
    this.ecoRetorno = ctx.createGain();
    const ecoEscuro = ctx.createBiquadFilter();
    ecoEscuro.type = 'lowpass';
    ecoEscuro.frequency.value = 3500;
    this.eco.input.connect(this.ecoDelay);
    this.ecoDelay.connect(ecoEscuro).connect(this.ecoRetorno).connect(this.ecoDelay);
    this.ecoDelay.connect(this.eco.wet);

    this.sala = new Mix(ctx);
    this.salaConv = ctx.createConvolver();
    this.sala.input.connect(this.salaConv).connect(this.sala.wet);

    this.saida = ctx.createGain();
    const limitador = ctx.createDynamicsCompressor();
    limitador.threshold.value = -3;
    limitador.knee.value = 0;
    limitador.ratio.value = 20;
    limitador.attack.value = 0.002;
    limitador.release.value = 0.1;
    this.analyserOut = this.analyser();

    // Envio vai pro dispositivo do contexto (alto-falante ou cabo virtual).
    // Retorno vai por um <audio> separado, que pode tocar em outro dispositivo (o fone).
    this.envio = ctx.createGain();
    this.envio.gain.value = 0;
    this.retorno = ctx.createGain();
    this.retorno.gain.value = 0;
    const retornoDest = ctx.createMediaStreamDestination();
    this.retornoAudio = new Audio() as SinkAudio;
    this.retornoAudio.srcObject = retornoDest.stream;
    this.gravacaoDest = ctx.createMediaStreamDestination();

    this.entrada.connect(this.portao).connect(this.analyserIn);
    this.portao.connect(this.garganta.input);
    this.garganta.output
      .connect(this.graves)
      .connect(this.medios)
      .connect(this.agudos)
      .connect(this.brasa.input);
    this.brasa.output.connect(this.robo.input);
    this.robo.output.connect(this.multidao.input);
    this.multidao.output.connect(this.bits).connect(this.passaAlta).connect(this.passaBaixa).connect(this.eco.input);
    this.eco.output.connect(this.sala.input);
    this.sala.output.connect(this.saida).connect(limitador).connect(this.analyserOut);
    limitador.connect(this.envio).connect(ctx.destination);
    limitador.connect(this.retorno).connect(retornoDest);
    limitador.connect(this.gravacaoDest);
  }

  static async create(): Promise<VoiceEngine> {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklets/forge-fx.js`);
    await ctx.audioWorklet.addModule(stretchWorkletUrl);
    const stretch = (await SignalsmithStretch(ctx, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] })) as unknown as StretchNode;
    stretch.start();
    return new VoiceEngine(ctx, stretch);
  }

  private analyser(): AnalyserNode {
    const a = this.ctx.createAnalyser();
    a.fftSize = 4096;
    a.smoothingTimeConstant = 0.6;
    a.minDecibels = -95;
    a.maxDecibels = -15;
    return a;
  }

  get ativo(): boolean {
    return this.source !== null;
  }

  /** Liga o microfone. Desliga o processamento do navegador: a forja quer a voz crua. */
  async ligarMicrofone(deviceId?: string): Promise<void> {
    this.desligarFonte();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    this.stream = stream;
    const src = this.ctx.createMediaStreamSource(stream);
    src.connect(this.entrada);
    this.source = src;
    await this.ctx.resume();
  }

  /** Usa um arquivo de áudio em loop no lugar do microfone (pra testar sem falar). */
  async ligarArquivo(file: Blob): Promise<void> {
    this.desligarFonte();
    const buffer = await this.ctx.decodeAudioData(await file.arrayBuffer());
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(this.entrada);
    src.start();
    this.source = src;
    await this.ctx.resume();
  }

  desligarFonte(): void {
    if (this.source instanceof AudioBufferSourceNode) this.source.stop();
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  async dispositivos(): Promise<Devices> {
    const all = await navigator.mediaDevices.enumerateDevices();
    return {
      entradas: all.filter((d) => d.kind === 'audioinput'),
      saidas: all.filter((d) => d.kind === 'audiooutput'),
    };
  }

  setEnvio(ligado: boolean): void {
    this.envio.gain.setTargetAtTime(ligado ? 1 : 0, this.ctx.currentTime, SMOOTH);
  }

  async setDispositivoEnvio(deviceId: string): Promise<void> {
    await this.ctx.setSinkId?.(deviceId);
  }

  async setRetorno(ligado: boolean): Promise<void> {
    this.retorno.gain.setTargetAtTime(ligado ? 1 : 0, this.ctx.currentTime, SMOOTH);
    if (ligado) await this.retornoAudio.play().catch(() => undefined);
    else this.retornoAudio.pause();
  }

  async setDispositivoRetorno(deviceId: string): Promise<void> {
    await this.retornoAudio.setSinkId?.(deviceId);
  }

  /** Grava a voz forjada por alguns segundos. */
  gravar(segundos: number): Promise<Blob> {
    const rec = new MediaRecorder(this.gravacaoDest.stream);
    const partes: Blob[] = [];
    rec.ondataavailable = (e) => partes.push(e.data);
    return new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(partes, { type: rec.mimeType }));
      rec.start();
      setTimeout(() => rec.stop(), segundos * 1000);
    });
  }

  /** Aplica os valores da mesa. Só mexe no que mudou desde a última vez. */
  aplicar(v: ParamValues): void {
    const n = (k: string) => Number(v[k]);
    const mudou = (...ks: string[]) => ks.some((k) => v[k] !== this.ultimo[k]);
    const t = this.ctx.currentTime;
    const alvo = (p: AudioParam, x: number) => p.setTargetAtTime(x, t, SMOOTH);

    if (mudou('entrada')) alvo(this.entrada.gain, dbToGain(n('entrada')));
    if (mudou('portao')) this.portao.parameters.get('limiar')!.setValueAtTime(n('portao'), t);

    if (mudou('tom', 'timbre')) {
      const ligado = n('tom') !== 0 || n('timbre') !== 0;
      this.garganta.set(this.ctx, ligado ? 0 : 1, ligado ? 1 : 0);
      this.stretch.schedule({
        semitones: n('tom'),
        formantSemitones: n('timbre'),
        formantCompensation: true,
        formantBaseHz: 0,
      });
    }
    if (mudou('latencia') && n('latencia') !== this.latenciaAtual) {
      this.latenciaAtual = n('latencia');
      void this.stretch.configure({ blockMs: n('latencia') });
    }

    if (mudou('graves')) alvo(this.graves.gain, n('graves'));
    if (mudou('medios')) alvo(this.medios.gain, n('medios'));
    if (mudou('agudos')) alvo(this.agudos.gain, n('agudos'));

    if (mudou('drive')) {
      const d = n('drive');
      this.brasaShaper.curve = driveCurve(d) as Float32Array<ArrayBuffer>;
      const w = Math.min(1, d / 40);
      this.brasa.set(this.ctx, 1 - w, w * dbToGain(-d / 12));
    }

    if (mudou('robo')) {
      const r = n('robo') / 100;
      this.robo.set(this.ctx, 1 - r, r * 1.4);
    }
    if (mudou('roboHz')) alvo(this.roboOsc.frequency, n('roboHz'));

    if (mudou('multidao')) {
      const m = n('multidao') / 100;
      this.multidao.set(this.ctx, 1 - m * 0.4, m * 0.7);
    }

    if (mudou('bits')) this.bits.parameters.get('bits')!.setValueAtTime(n('bits'), t);
    if (mudou('passaAlta')) alvo(this.passaAlta.frequency, n('passaAlta'));
    if (mudou('passaBaixa')) alvo(this.passaBaixa.frequency, Math.min(n('passaBaixa'), this.ctx.sampleRate / 2 - 100));

    if (mudou('eco')) this.eco.set(this.ctx, 1, n('eco') / 100);
    if (mudou('ecoTempo')) alvo(this.ecoDelay.delayTime, n('ecoTempo') / 1000);
    if (mudou('ecoRetorno')) alvo(this.ecoRetorno.gain, n('ecoRetorno') / 100);

    if (mudou('sala', 'salaMix')) {
      const sala = String(v.sala) as Room;
      if (sala !== this.salaAtual && sala !== 'nenhum') {
        const [l, r] = impulseResponse(sala, this.ctx.sampleRate);
        const buf = this.ctx.createBuffer(2, l.length, this.ctx.sampleRate);
        buf.copyToChannel(l as Float32Array<ArrayBuffer>, 0);
        buf.copyToChannel(r as Float32Array<ArrayBuffer>, 1);
        this.salaConv.buffer = buf;
      }
      this.salaAtual = sala;
      const w = sala === 'nenhum' ? 0 : n('salaMix') / 100;
      this.sala.set(this.ctx, 1 - w * 0.5, w * 0.6);
    }

    if (mudou('saida')) alvo(this.saida.gain, dbToGain(n('saida')));

    this.ultimo = { ...v };
  }

  async fechar(): Promise<void> {
    this.desligarFonte();
    this.retornoAudio.pause();
    await this.ctx.close();
  }
}
