import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Enigma, Rotor, Plugboard, groupBy5 } from '../src/enigma.js';

test('known vector: I-II-III, ref B, AAA, no plugboard', () => {
  const e = new Enigma();
  assert.equal(
    e.encode('A'.repeat(26)),
    'BDZGOWCXLTKSBTMCDLPBMUQOFX'
  );
});

test('encryption is reciprocal', () => {
  const cfg = {
    rotors: ['IV', 'II', 'V'],
    reflector: 'C',
    positions: 'QWE',
    rings: 'BNM',
    plugboard: 'AB CD EF GH IJ KL',
  };
  const plain = 'ATTACKATDAWNTHEWEATHERISCLEAR';
  const ct = new Enigma(cfg).encode(plain);
  assert.notEqual(ct, plain);
  assert.equal(new Enigma(cfg).encode(ct), plain);
});

test('no letter ever encodes to itself', () => {
  const e = new Enigma({ rotors: ['V', 'III', 'I'], positions: 'XYZ' });
  for (let i = 0; i < 500; i++) {
    const ch = String.fromCharCode(65 + (i % 26));
    assert.notEqual(e.encodeChar(ch), ch);
  }
});

test('double-step anomaly: ADU -> AER -> BFS', () => {
  const e = new Enigma({ rotors: ['I', 'II', 'III'], positions: 'ADU' });
  e.encodeChar('A');
  assert.equal(e.positions, 'ADV');
  e.encodeChar('A');
  assert.equal(e.positions, 'AEW');
  e.encodeChar('A');
  assert.equal(e.positions, 'BFX');
});

test('fast rotor steps every keypress', () => {
  const e = new Enigma({ positions: 'AAA' });
  e.encode('ABCD');
  assert.equal(e.positions, 'AAE');
});

test('ring setting shifts output', () => {
  const base = new Enigma({ positions: 'AAA', rings: 'AAA' }).encode('HELLO');
  const ring = new Enigma({ positions: 'AAA', rings: 'BBB' }).encode('HELLO');
  assert.notEqual(base, ring);
});

test('plugboard is an involution and rejects bad pairs', () => {
  const pb = new Plugboard('AB CZ');
  assert.equal(pb.swap(0), 1);
  assert.equal(pb.swap(1), 0);
  assert.equal(pb.swap(2), 25);
  assert.equal(pb.swap(5), 5);
  assert.throws(() => new Plugboard('AA'), /itself/);
  assert.throws(() => new Plugboard('AB BC'), /already plugged/);
});

test('rotor forward/backward are inverses', () => {
  const r = new Rotor('IV', 'K', 'F');
  for (let c = 0; c < 26; c++) assert.equal(r.backward(r.forward(c)), c);
});

test('four rotors and 8-rotor set are supported', () => {
  const cfg = {
    rotors: ['VIII', 'VI', 'VII', 'V'],
    reflector: 'C',
    positions: 'ABCD',
    rings: 'EFGH',
    plugboard: 'QW ER TY',
  };
  const ct = new Enigma(cfg).encode('KRIEGSMARINE');
  assert.equal(new Enigma(cfg).encode(ct), 'KRIEGSMARINE');
});

test('non-letters dropped by default, kept on request', () => {
  const a = new Enigma().encode('HI THERE!');
  assert.equal(a.length, 7);
  const b = new Enigma().encode('HI THERE!', { keepOther: true });
  assert.match(b, /^.. .....!$/);
});

test('historical Enigma Instruction Manual 1930 message', () => {
  // Ciphertext from the 1930 manual; decrypts with II-I-III, ref A,
  // rings XMV, ground ABL, plugboard AM FI NV PS TU WZ.
  const ct = 'GCDSE AHUGW TQGRK VLFGX UCALX VYMIG MMNMF DXTGN VHVRM MEVOU YFZSL RHDRR XFJWC FHUHM UNZEF RDISI KBGPM YVXUZ';
  const e = new Enigma({
    rotors: ['II', 'I', 'III'],
    reflector: 'A',
    positions: 'ABL',
    rings: 'XMV',
    plugboard: 'AM FI NV PS TU WZ',
  });
  const pt = e.encode(ct);
  assert.equal(
    pt,
    'FEINDLIQEINFANTERIEKOLONNEBEOBAQTETXANFANGSUEDAUSGANGBAERWALDEXENDEDREIKMOSTWAERTSNEUSTADT'
  );
});

test('groupBy5 formats in 5-letter blocks', () => {
  assert.equal(groupBy5('ABCDEFGHIJK'), 'ABCDE FGHIJ K');
  assert.equal(groupBy5(''), '');
});
