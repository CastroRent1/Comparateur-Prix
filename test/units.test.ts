import { describe, expect, it } from 'vitest';
import { parseQuantity, sizesCompatible, unitPrice } from '../src/core/units.ts';

describe('parseQuantity', () => {
  it.each([
    ['500 g', { amount: 0.5, unit: 'kg' }],
    ['500g', { amount: 0.5, unit: 'kg' }],
    ['1 kg', { amount: 1, unit: 'kg' }],
    ['1,5 L', { amount: 1.5, unit: 'l' }],
    ['75cl', { amount: 0.75, unit: 'l' }],
    ['250 ml', { amount: 0.25, unit: 'l' }],
    ['6 x 33 cl', { amount: 1.98, unit: 'l' }],
    ['6x1,5l', { amount: 9, unit: 'l' }],
    ['2 × 250 g', { amount: 0.5, unit: 'kg' }],
    ['12 pièces', { amount: 12, unit: 'piece' }],
    ['Œufs frais 6 oeufs', { amount: 6, unit: 'piece' }],
    ['Spaghetti Barilla n°5 500 g', { amount: 0.5, unit: 'kg' }],
  ])('%s', (text, expected) => {
    expect(parseQuantity(text)).toEqual(expected);
  });

  it.each(['', 'Fromage à la coupe', 'Pack familial', 'Gouda 48+'])('renvoie undefined pour « %s »', (text) => {
    expect(parseQuantity(text)).toBeUndefined();
  });

  it('ne confond pas un mot commençant par g avec des grammes', () => {
    expect(parseQuantity('3 gaufres')).toBeUndefined();
  });
});

describe('unitPrice / sizesCompatible', () => {
  it('calcule le prix au kg', () => {
    expect(unitPrice(1.29, { amount: 0.5, unit: 'kg' })).toBe(2.58);
  });
  it('tolère 10 % d’écart de format', () => {
    expect(sizesCompatible({ amount: 0.5, unit: 'kg' }, { amount: 0.48, unit: 'kg' })).toBe(true);
    expect(sizesCompatible({ amount: 0.5, unit: 'kg' }, { amount: 1, unit: 'kg' })).toBe(false);
    expect(sizesCompatible({ amount: 1, unit: 'l' }, { amount: 1, unit: 'kg' })).toBe(false);
  });
});
