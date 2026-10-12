// Processadores de áudio que o Web Audio não traz prontos.
// Roda na thread de áudio (AudioWorklet), então é JS puro, sem imports.

const dbToGain = (db) => Math.pow(10, db / 20);

/**
 * Portão de ruído: abaixo do limiar, a voz é fechada suavemente.
 * Mede o volume com um seguidor de envelope e fecha com histerese pra não picotar.
 */
class PortaoProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'limiar', defaultValue: -60, minValue: -100, maxValue: 0, automationRate: 'k-rate' }];
  }

  constructor() {
    super();
    this.env = 0;
    this.gain = 1;
    this.hold = 0;
    const sr = sampleRate;
    this.envCoef = Math.exp(-1 / (0.01 * sr)); // seguidor de 10 ms
    this.openCoef = Math.exp(-1 / (0.002 * sr)); // abre em 2 ms
    this.closeCoef = Math.exp(-1 / (0.08 * sr)); // fecha em 80 ms
    this.holdSamples = Math.round(0.12 * sr); // segura aberto 120 ms
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;
    const limiar = parameters.limiar[0];
    const open = dbToGain(limiar);
    const close = dbToGain(limiar - 6);
    const frames = input[0].length;
    for (let i = 0; i < frames; i++) {
      let peak = 0;
      for (let ch = 0; ch < input.length; ch++) peak = Math.max(peak, Math.abs(input[ch][i]));
      this.env = peak > this.env ? peak : this.env * this.envCoef + peak * (1 - this.envCoef);
      let target;
      if (limiar <= -90 || this.env >= open) {
        target = 1;
        this.hold = this.holdSamples;
      } else if (this.hold > 0) {
        target = 1;
        this.hold--;
      } else {
        target = this.env < close ? 0 : this.gain;
      }
      const coef = target > this.gain ? this.openCoef : this.closeCoef;
      this.gain = target + (this.gain - target) * coef;
      for (let ch = 0; ch < output.length; ch++) output[ch][i] = (input[ch] || input[0])[i] * this.gain;
    }
    return true;
  }
}

/**
 * Bitcrusher: reduz a resolução (bits). A partir de 16 bits deixa o som passar intacto.
 * Abaixo de 8 bits também segura amostras (reduz a taxa), pro som ficar mais "quebrado".
 */
class BitsProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'bits', defaultValue: 16, minValue: 2, maxValue: 16, automationRate: 'k-rate' }];
  }

  constructor() {
    super();
    this.held = [0, 0];
    this.counter = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;
    const bits = Math.round(parameters.bits[0]);
    if (bits >= 16) {
      for (let ch = 0; ch < output.length; ch++) output[ch].set(input[ch] || input[0]);
      return true;
    }
    const levels = Math.pow(2, bits - 1);
    const hold = bits < 8 ? 8 - bits + 1 : 1;
    const frames = input[0].length;
    for (let i = 0; i < frames; i++) {
      if (this.counter <= 0) {
        for (let ch = 0; ch < output.length; ch++) {
          const s = (input[ch] || input[0])[i];
          this.held[ch] = Math.round(s * levels) / levels;
        }
        this.counter = hold;
      }
      this.counter--;
      for (let ch = 0; ch < output.length; ch++) output[ch][i] = this.held[ch];
    }
    return true;
  }
}

registerProcessor('echoforge-portao', PortaoProcessor);
registerProcessor('echoforge-bits', BitsProcessor);
