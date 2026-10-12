import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARAMS, PARAM_BY_ID, SECTIONS, clampParam, defaultValues, formatValue } from '../src/core/params.ts';
import { decodePreset, diffFromDefaults, encodePreset, normalizePreset, resolveValues, shareUrl, slugify } from '../src/core/preset.ts';
import { bandColors, hslToRgb, hueOf, logFrequencies, noteOf } from '../src/core/color.ts';
import { driveCurve, impulseResponse, quantize, rmsDb, spectralBrightness } from '../src/core/dsp.ts';

describe('catálogo de parâmetros', () => {
  it('ids únicos e seção existente', () => {
    const ids = PARAMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const secoes = new Set(SECTIONS.map((s) => s.id));
    for (const p of PARAMS) expect(secoes.has(p.section)).toBe(true);
  });

  it('padrão dentro dos limites e no passo', () => {
    for (const p of PARAMS) {
      if (p.kind === 'number') {
        expect(p.default).toBeGreaterThanOrEqual(p.min);
        expect(p.default).toBeLessThanOrEqual(p.max);
        expect(clampParam(p, p.default)).toEqual({ value: p.default });
      } else {
        expect(p.opcoes).toContain(p.default);
      }
    }
  });

  it('corrige valor fora do limite e avisa', () => {
    const tom = PARAM_BY_ID.get('tom')!;
    expect(clampParam(tom, 40).value).toBe(12);
    expect(clampParam(tom, 40).aviso).toMatch(/fora/);
    expect(clampParam(tom, -3.3).value).toBe(-3.5);
    expect(clampParam(tom, '2').value).toBe(2);
    expect(clampParam(tom, 'muito').aviso).toMatch(/não é número/);
    const sala = PARAM_BY_ID.get('sala')!;
    expect(clampParam(sala, 'caverna')).toEqual({ value: 'caverna' });
    expect(clampParam(sala, 'vulcão').value).toBe('nenhum');
  });

  it('formata valores pra mostrar na mesa', () => {
    expect(formatValue(PARAM_BY_ID.get('tom')!, 3)).toBe('+3 st');
    expect(formatValue(PARAM_BY_ID.get('bits')!, 16)).toBe('limpo');
    expect(formatValue(PARAM_BY_ID.get('passaBaixa')!, 3500)).toBe('3.5k Hz');
    expect(formatValue(PARAM_BY_ID.get('sala')!, 'catedral')).toBe('Catedral');
  });
});

describe('vozes (presets)', () => {
  it('normaliza voz vinda de fora', () => {
    const { preset, avisos } = normalizePreset({ nome: 'Anão Bêbado', params: { tom: -3, timbre: 99, xyz: 1, sala: 'caverna' } });
    expect(preset.id).toBe('anao-bebado');
    expect(preset.params).toEqual({ tom: -3, timbre: 12, sala: 'caverna' });
    expect(avisos.some((a) => a.includes('xyz'))).toBe(true);
    expect(avisos.some((a) => a.includes('timbre'))).toBe(true);
  });

  it('descarta parâmetros iguais ao padrão', () => {
    const { preset } = normalizePreset({ id: 'x', nome: 'X', params: { tom: 0, bits: 16 } });
    expect(preset.params).toEqual({});
  });

  it('aguenta lixo sem quebrar', () => {
    expect(normalizePreset(null).preset.id).toBe('voz-sem-nome');
    expect(normalizePreset('abc').preset.params).toEqual({});
  });

  it('resolve e desfaz os valores da mesa', () => {
    const values = resolveValues({ params: { tom: 4 } });
    expect(values.tom).toBe(4);
    expect(values.timbre).toBe(0);
    expect(diffFromDefaults(values)).toEqual({ tom: 4 });
    expect(Object.keys(defaultValues()).length).toBe(PARAMS.length);
  });

  it('link de compartilhamento vai e volta, com acento e emoji', () => {
    const { preset } = normalizePreset({ id: 'dragao', nome: 'Dragão Ancião', emoji: '🐉', params: { tom: -10, sala: 'caverna' } });
    const back = decodePreset(encodePreset(preset));
    expect(back?.preset).toEqual(preset);
    expect(shareUrl('https://x.io/app/#voz=velho', preset)).toMatch(/^https:\/\/x\.io\/app\/#voz=[A-Za-z0-9_-]+$/);
    expect(decodePreset('%%%')).toBeNull();
  });

  it('slug sem acento', () => {
    expect(slugify('Ção Épico!!')).toBe('cao-epico');
  });

  it('todas as vozes em presets/ são válidas e sem avisos', () => {
    const dir = join(import.meta.dirname, '..', 'presets');
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(10);
    for (const f of files) {
      const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      const { preset, avisos } = normalizePreset(raw);
      expect(avisos, f).toEqual([]);
      expect(`${preset.id}.json`).toBe(f);
      expect(preset.fala, f).not.toBe('');
      expect(preset.params, f).toEqual(raw.params);
    }
  });
});

describe('cores', () => {
  it('Lá 440 é Lá4 e tem o matiz do Lá', () => {
    expect(noteOf(440)).toMatchObject({ nome: 'Lá4', classe: 9, cents: 0 });
    expect(hueOf(440)).toBeCloseTo(270);
    expect(noteOf(261.63)?.nome).toBe('Dó4');
    expect(noteOf(0)).toBeNull();
  });

  it('oitavas têm a mesma cor', () => {
    expect(hueOf(110)).toBeCloseTo(hueOf(880));
  });

  it('hsl → rgb nos cantos', () => {
    expect(hslToRgb(0, 1, 0.5)).toEqual([255, 0, 0]);
    expect(hslToRgb(120, 1, 0.5)).toEqual([0, 255, 0]);
    expect(hslToRgb(240, 1, 0.5)).toEqual([0, 0, 255]);
  });

  it('eixo logarítmico e paleta por faixa', () => {
    const f = logFrequencies(64, 60, 8000);
    expect(f[0]).toBeCloseTo(60);
    expect(f[63]).toBeCloseTo(8000);
    expect(bandColors(f).length).toBe(64 * 3);
  });
});

describe('dsp', () => {
  it('brasa zero é reta, brasa cheia satura mas não passa de 1', () => {
    const reta = driveCurve(0, 5);
    expect(Math.abs(reta[4] - 1)).toBeLessThan(1e-9);
    const cheia = driveCurve(100, 101);
    expect(cheia[100]).toBeCloseTo(1);
    expect(cheia[75]).toBeGreaterThan(0.99); // x=0.5 já satura
    expect(Math.max(...cheia)).toBeLessThanOrEqual(1);
  });

  it('quantiza', () => {
    expect(quantize(0.3, 16)).toBe(0.3);
    expect(quantize(0.3, 2)).toBe(0.5);
  });

  it('salas: determinísticas, normalizadas e com cauda que some', () => {
    const [l, r] = impulseResponse('caverna', 8000);
    const [l2] = impulseResponse('caverna', 8000);
    expect(l).toEqual(l2);
    expect(l).not.toEqual(r);
    const energia = (a: Float32Array) => a.reduce((s, x) => s + x * x, 0);
    expect((energia(l) + energia(r)) / 2).toBeCloseTo(1, 3);
    const inicio = energia(l.slice(0, 2000));
    const fim = energia(l.slice(-2000));
    expect(fim).toBeLessThan(inicio / 100);
  });

  it('rms e brilho', () => {
    expect(rmsDb(new Float32Array(10).fill(1))).toBeCloseTo(0);
    expect(rmsDb(new Float32Array(10))).toBe(-Infinity);
    const grave = new Float32Array(10).fill(-100);
    grave[0] = 0;
    const agudo = new Float32Array(10).fill(-100);
    agudo[9] = 0;
    expect(spectralBrightness(grave)).toBe(0);
    expect(spectralBrightness(agudo)).toBe(1);
  });
});
