/**
 * Enigma machine core.
 *
 * Signal path for each keypress:
 *   key -> plugboard -> rotors (right to left) -> reflector
 *       -> rotors (left to right) -> plugboard -> lamp
 *
 * Rotors step BEFORE the signal passes through them.
 */

const A = 65;
export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** 'A' -> 0 */
const toIdx = (ch) => ch.toUpperCase().charCodeAt(0) - A;
/** 0 -> 'A' */
const toChr = (i) => String.fromCharCode(A + (((i % 26) + 26) % 26));
const mod26 = (n) => ((n % 26) + 26) % 26;

/**
 * Historical wirings. `notch` lists the letters visible in the window at the
 * moment the rotor steps its left neighbour.
 */
export const ROTORS = {
  I:    { wiring: 'EKMFLGDQVZNTOWYHXUSPAIBRCJ', notch: 'Q', label: 'I' },
  II:   { wiring: 'AJDKSIRUXBLHWTMCQGZNPYFVOE', notch: 'E', label: 'II' },
  III:  { wiring: 'BDFHJLCPRTXVZNYEIWGAKMUSQO', notch: 'V', label: 'III' },
  IV:   { wiring: 'ESOVPZJAYQUIRHXLNFTGKDCMWB', notch: 'J', label: 'IV' },
  V:    { wiring: 'VZBRGITYUPSDNHLXAWMJQOFECK', notch: 'Z', label: 'V' },
  VI:   { wiring: 'JPGVOUMFYQBENHZRDKASXLICTW', notch: 'ZM', label: 'VI' },
  VII:  { wiring: 'NZJHGRCXMYSWBOUFAIVLPEKQDT', notch: 'ZM', label: 'VII' },
  VIII: { wiring: 'FKQHTLXOCBJSPDZRAMEWNIUYGV', notch: 'ZM', label: 'VIII' },
};

export const REFLECTORS = {
  A: 'EJMZALYXVBWFCRQUONTSPIKHGD',
  B: 'YRUHQSLDPXNGOKMIEBFZCWVJAT',
  C: 'FVPJIAOYEDRZXWGCTKUQSBNMHL',
};

/** Rotor order on the real machine is left-to-right; we work right-to-left. */
export class Rotor {
  constructor(name, position = 'A', ring = 'A') {
    const spec = ROTORS[name];
    if (!spec) throw new Error(`Unknown rotor: ${name}`);
    this.name = name;
    this.notches = spec.notch.split('').map(toIdx);
    this.forwardMap = spec.wiring.split('').map(toIdx);
    this.backwardMap = new Array(26);
    this.forwardMap.forEach((to, from) => { this.backwardMap[to] = from; });
    this.pos = typeof position === 'number' ? position : toIdx(position);
    this.ring = typeof ring === 'number' ? ring : toIdx(ring);
  }

  /** True when this rotor's notch is in the window, so it will carry on step. */
  get atNotch() {
    return this.notches.includes(this.pos);
  }

  step() {
    this.pos = mod26(this.pos + 1);
  }

  /** Right-to-left pass. */
  forward(c) {
    const shift = this.pos - this.ring;
    return mod26(this.forwardMap[mod26(c + shift)] - shift);
  }

  /** Left-to-right pass. */
  backward(c) {
    const shift = this.pos - this.ring;
    return mod26(this.backwardMap[mod26(c + shift)] - shift);
  }

  get window() {
    return toChr(this.pos);
  }
}

export class Plugboard {
  /** @param {string} pairs e.g. "AB CD EF" or "ab cd" */
  constructor(pairs = '') {
    this.map = Array.from({ length: 26 }, (_, i) => i);
    this.pairs = [];
    const tokens = String(pairs).toUpperCase().match(/[A-Z]{2}/g) || [];
    const used = new Set();
    for (const tok of tokens) {
      const [a, b] = [toIdx(tok[0]), toIdx(tok[1])];
      if (a === b) throw new Error(`Cannot plug ${tok[0]} to itself`);
      if (used.has(a) || used.has(b)) {
        throw new Error(`Letter already plugged in pair ${tok}`);
      }
      used.add(a); used.add(b);
      this.map[a] = b;
      this.map[b] = a;
      this.pairs.push(tok);
    }
  }

  swap(c) {
    return this.map[c];
  }
}

export class Enigma {
  /**
   * @param {object} cfg
   * @param {string[]} cfg.rotors    left-to-right, e.g. ['I','II','III']
   * @param {string}   cfg.reflector 'A' | 'B' | 'C'
   * @param {string}   cfg.positions ground setting, e.g. 'AAA'
   * @param {string}   cfg.rings     ring settings (Ringstellung), e.g. 'AAA'
   * @param {string}   cfg.plugboard e.g. 'AB CD'
   */
  constructor({
    rotors = ['I', 'II', 'III'],
    reflector = 'B',
    positions = 'AAA',
    rings = 'AAA',
    plugboard = '',
  } = {}) {
    if (!REFLECTORS[reflector]) throw new Error(`Unknown reflector: ${reflector}`);
    const pos = positions.padEnd(rotors.length, 'A');
    const rng = rings.padEnd(rotors.length, 'A');

    // Store right-to-left: index 0 is the fast rotor.
    this.rotors = rotors
      .map((name, i) => new Rotor(name, pos[i], rng[i]))
      .reverse();
    this.reflectorName = reflector;
    this.reflector = REFLECTORS[reflector].split('').map(toIdx);
    this.plugboard = new Plugboard(plugboard);
  }

  /**
   * Advance the rotors, honouring the double-step anomaly: the middle rotor
   * steps both when the fast rotor carries and when it is itself at its notch.
   */
  stepRotors() {
    const [fast, middle, slow] = this.rotors;
    const middleAtNotch = middle && middle.atNotch;
    const fastAtNotch = fast.atNotch;

    if (middleAtNotch) {
      middle.step();
      if (slow) slow.step();
    } else if (fastAtNotch) {
      if (middle) middle.step();
    }
    fast.step();
  }

  /** Encipher one letter A-Z (also decipher — the machine is reciprocal). */
  encodeChar(ch) {
    const idx = toIdx(ch);
    if (idx < 0 || idx > 25) return ch;

    this.stepRotors();

    let c = this.plugboard.swap(idx);
    for (const r of this.rotors) c = r.forward(c);
    c = this.reflector[c];
    for (let i = this.rotors.length - 1; i >= 0; i--) c = this.rotors[i].backward(c);
    c = this.plugboard.swap(c);

    return toChr(c);
  }

  /**
   * Process a whole message. Non-letters are dropped by default, matching
   * historical practice; pass {keepOther:true} to pass them through untouched.
   */
  encode(text, { keepOther = false } = {}) {
    let out = '';
    for (const ch of String(text).toUpperCase()) {
      if (ch >= 'A' && ch <= 'Z') out += this.encodeChar(ch);
      else if (keepOther) out += ch;
    }
    return out;
  }

  /** Current window letters, left-to-right as seen on the machine. */
  get positions() {
    return this.rotors.map((r) => r.window).reverse().join('');
  }
}

export const groupBy5 = (s) => (s.match(/.{1,5}/g) || []).join(' ');
