import { Enigma, ROTORS, ALPHABET, groupBy5 } from './src/enigma.js';

const KEY_ROWS = ['QWERTZUIO', 'ASDFGHJK', 'PYXCVBNML'];
const ROTOR_NAMES = Object.keys(ROTORS);
const MAX_CABLES = 13;

const $ = (id) => document.getElementById(id);

/** Single source of truth. Rotor arrays are left-to-right, as on the machine. */
const state = {
  count: 3,
  rotors: ['I', 'II', 'III'],
  rings: ['A', 'A', 'A'],
  positions: ['A', 'A', 'A'],
  reflector: 'B',
  plugs: new Map(), // letter -> letter, stored both ways
  group5: true,
};

let pendingPlug = null; // letter awaiting a partner
let lampTimer = null;

/* ------------------------------------------------------------------ config */

const plugString = () => {
  const seen = new Set();
  const out = [];
  for (const [a, b] of state.plugs) {
    if (seen.has(a) || seen.has(b)) continue;
    seen.add(a); seen.add(b);
    out.push(a + b);
  }
  return out.sort().join(' ');
};

const machine = () => new Enigma({
  rotors: state.rotors.slice(0, state.count),
  reflector: state.reflector,
  positions: state.positions.slice(0, state.count).join(''),
  rings: state.rings.slice(0, state.count).join(''),
  plugboard: plugString(),
});

/* ------------------------------------------------------------- rotor panel */

function buildRotorBank() {
  const bank = $('rotorBank');
  bank.textContent = '';
  const labels = state.count === 4
    ? ['Greek (4th)', 'Left (slow)', 'Middle', 'Right (fast)']
    : ['Left (slow)', 'Middle', 'Right (fast)'];

  for (let i = 0; i < state.count; i++) {
    const cell = document.createElement('div');
    cell.className = 'rotor';

    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.textContent = labels[i];
    cell.append(slot);

    // Rotor choice
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', `${labels[i]} rotor`);
    for (const name of ROTOR_NAMES) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = `Rotor ${name}`;
      opt.selected = state.rotors[i] === name;
      sel.append(opt);
    }
    sel.addEventListener('change', () => {
      state.rotors[i] = sel.value;
      render();
    });
    cell.append(sel);

    // Ring setting
    const ringWrap = document.createElement('div');
    ringWrap.className = 'slot';
    ringWrap.style.marginTop = '8px';
    ringWrap.textContent = 'Ring';
    cell.append(ringWrap);

    const ring = document.createElement('select');
    ring.setAttribute('aria-label', `${labels[i]} ring setting`);
    for (const ch of ALPHABET) {
      const opt = document.createElement('option');
      opt.value = ch;
      opt.textContent = `${ch} (${ALPHABET.indexOf(ch) + 1})`;
      opt.selected = state.rings[i] === ch;
      ring.append(opt);
    }
    ring.addEventListener('change', () => {
      state.rings[i] = ring.value;
      render();
    });
    cell.append(ring);

    // Position window with steppers
    const grp = document.createElement('div');
    grp.className = 'window-group';

    const down = document.createElement('button');
    down.className = 'step';
    down.type = 'button';
    down.textContent = '−';
    down.title = 'Step back';
    down.setAttribute('aria-label', `Step ${labels[i]} rotor back`);
    down.addEventListener('click', () => nudge(i, -1));

    const win = document.createElement('div');
    win.className = 'win';
    win.textContent = state.positions[i];

    const up = document.createElement('button');
    up.className = 'step';
    up.type = 'button';
    up.textContent = '+';
    up.title = 'Step forward';
    up.setAttribute('aria-label', `Step ${labels[i]} rotor forward`);
    up.addEventListener('click', () => nudge(i, 1));

    grp.append(down, win, up);
    cell.append(grp);
    bank.append(cell);
  }
}

function nudge(i, delta) {
  const cur = ALPHABET.indexOf(state.positions[i]);
  state.positions[i] = ALPHABET[(cur + delta + 26) % 26];
  render();
}

/* ---------------------------------------------------------------- plugboard */

function buildPlugboard() {
  const root = $('plugboard');
  root.textContent = '';
  KEY_ROWS.forEach((row, ri) => {
    const line = document.createElement('div');
    line.className = `board-row r${ri + 1}`;
    for (const ch of row) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'plug';
      b.dataset.letter = ch;
      b.textContent = ch;
      b.addEventListener('click', () => togglePlug(ch));
      line.append(b);
    }
    root.append(line);
  });
}

function togglePlug(ch) {
  const { plugs } = state;

  // Already wired? Unplug the whole cable.
  if (plugs.has(ch)) {
    const mate = plugs.get(ch);
    plugs.delete(ch);
    plugs.delete(mate);
    pendingPlug = null;
    return render();
  }

  if (pendingPlug === ch) { pendingPlug = null; return render(); }

  if (pendingPlug === null) {
    if (plugs.size / 2 >= MAX_CABLES) {
      return flash(`All ${MAX_CABLES} cables are in use.`, true);
    }
    pendingPlug = ch;
    return render();
  }

  plugs.set(pendingPlug, ch);
  plugs.set(ch, pendingPlug);
  pendingPlug = null;
  render();
}

function renderPlugboard() {
  for (const b of $('plugboard').querySelectorAll('.plug')) {
    const ch = b.dataset.letter;
    const mate = state.plugs.get(ch);
    b.classList.toggle('selected', pendingPlug === ch);
    b.classList.toggle('paired', Boolean(mate));
    b.textContent = ch;
    b.setAttribute('aria-pressed', String(Boolean(mate)));
    if (mate) {
      const tag = document.createElement('span');
      tag.className = 'mate';
      tag.textContent = mate;
      b.append(tag);
      b.title = `${ch} ↔ ${mate} — click to unplug`;
    } else {
      b.title = pendingPlug === ch
        ? 'Click another letter to connect'
        : `Plug ${ch}`;
    }
  }
  const pairs = plugString();
  $('plugPairs').textContent = pairs || 'none';
  const n = state.plugs.size / 2;
  $('plugCount').textContent = `${n} of ${MAX_CABLES} cables`;
}

/* ------------------------------------------------------ lampboard/keyboard */

function buildBoards() {
  const lamps = $('lampboard');
  const keys = $('keyboard');
  lamps.textContent = '';
  keys.textContent = '';

  KEY_ROWS.forEach((row, ri) => {
    const lampRow = document.createElement('div');
    lampRow.className = `board-row r${ri + 1}`;
    const keyRow = document.createElement('div');
    keyRow.className = `board-row r${ri + 1}`;

    for (const ch of row) {
      const lamp = document.createElement('div');
      lamp.className = 'lamp';
      lamp.id = `lamp-${ch}`;
      lamp.textContent = ch;
      lampRow.append(lamp);

      const key = document.createElement('button');
      key.type = 'button';
      key.className = 'key';
      key.id = `key-${ch}`;
      key.textContent = ch;
      key.addEventListener('click', () => pressKey(ch));
      keyRow.append(key);
    }
    lamps.append(lampRow);
    keys.append(keyRow);
  });
}

/** Append one letter to the message, exactly as pressing a real key would. */
function pressKey(ch) {
  const box = $('input');
  box.value += ch;
  render();
  const out = lastOutputLetter();
  if (out) lightLamp(out);
  bounceKey(ch);
}

function lastOutputLetter() {
  const letters = $('output').value.replace(/[^A-Z]/g, '');
  return letters.at(-1) || null;
}

function lightLamp(ch) {
  clearTimeout(lampTimer);
  for (const l of document.querySelectorAll('.lamp.on')) l.classList.remove('on');
  const lamp = $(`lamp-${ch}`);
  if (!lamp) return;
  lamp.classList.add('on');
  $('live').textContent = `Lamp ${ch}`;
  lampTimer = setTimeout(() => lamp.classList.remove('on'), 420);
}

function bounceKey(ch) {
  const key = $(`key-${ch}`);
  if (!key) return;
  key.classList.add('down');
  setTimeout(() => key.classList.remove('down'), 110);
}

/* -------------------------------------------------------------- main render */

function render() {
  buildRotorBank();
  renderPlugboard();

  const text = $('input').value;
  try {
    const m = machine();
    const cipher = m.encode(text);
    $('output').value = state.group5 ? groupBy5(cipher) : cipher;

    // Show where the rotors ended up, without disturbing the ground setting.
    for (const [i, w] of [...m.positions].entries()) {
      const win = $('rotorBank').children[i]?.querySelector('.win');
      if (win) win.textContent = w;
    }

    const n = text.replace(/[^A-Za-z]/g, '').length;
    $('posStatus').textContent =
      `Key ${state.positions.slice(0, state.count).join('')} → ${m.positions}`;
    $('status').textContent = `${n} letter${n === 1 ? '' : 's'}`;
    $('status').classList.remove('err');
  } catch (err) {
    $('output').value = '';
    flash(err.message, true);
  }
}

function flash(msg, isError = false) {
  const el = $('status');
  el.textContent = msg;
  el.classList.toggle('err', isError);
}

/* ------------------------------------------------------------------ wiring */

function randomKey() {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const pool = [...ROTOR_NAMES];
  for (let i = 0; i < state.count; i++) {
    const j = Math.floor(Math.random() * pool.length);
    state.rotors[i] = pool.splice(j, 1)[0];
    state.rings[i] = pick([...ALPHABET]);
    state.positions[i] = pick([...ALPHABET]);
  }
  state.reflector = pick(['A', 'B', 'C']);
  $('reflector').value = state.reflector;

  // Ten cables, as in standard wartime procedure.
  state.plugs.clear();
  const letters = [...ALPHABET];
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  for (let i = 0; i < 20; i += 2) {
    state.plugs.set(letters[i], letters[i + 1]);
    state.plugs.set(letters[i + 1], letters[i]);
  }
  pendingPlug = null;
  render();
  flash('New random key set.');
}

function resetKey() {
  state.rotors = ['I', 'II', 'III', 'IV'].slice(0, state.count);
  state.rings = Array(state.count).fill('A');
  state.positions = Array(state.count).fill('A');
  state.reflector = 'B';
  $('reflector').value = 'B';
  state.plugs.clear();
  pendingPlug = null;
  render();
  flash('Reset to default key.');
}

function init() {
  buildBoards();
  buildPlugboard();

  $('reflector').addEventListener('change', (e) => {
    state.reflector = e.target.value;
    render();
  });

  $('rotorCount').addEventListener('change', (e) => {
    const n = Number(e.target.value);
    state.count = n;
    while (state.rotors.length < n) state.rotors.push(ROTOR_NAMES[state.rotors.length]);
    while (state.rings.length < n) state.rings.push('A');
    while (state.positions.length < n) state.positions.push('A');
    render();
  });

  $('input').addEventListener('input', render);

  // Physical keyboard drives the machine when not typing in a text box.
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
    const ch = e.key.toUpperCase();
    if (ch.length === 1 && ch >= 'A' && ch <= 'Z') {
      e.preventDefault();
      pressKey(ch);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      $('input').value = $('input').value.slice(0, -1);
      render();
    }
  });

  $('copyBtn').addEventListener('click', async () => {
    const text = $('output').value;
    if (!text) return flash('Nothing to copy.');
    try {
      await navigator.clipboard.writeText(text);
      flash('Output copied to clipboard.');
    } catch {
      $('output').select();
      flash('Press Ctrl+C to copy the selection.');
    }
  });

  $('swapBtn').addEventListener('click', () => {
    const out = $('output').value.replace(/[^A-Z]/g, '');
    if (!out) return flash('Nothing to move.');
    $('input').value = out;
    render();
    flash('Output moved to input — same key decrypts it.');
  });

  $('clearBtn').addEventListener('click', () => {
    $('input').value = '';
    render();
  });

  $('group5').addEventListener('change', (e) => {
    state.group5 = e.target.checked;
    render();
  });

  $('clearPlugs').addEventListener('click', () => {
    state.plugs.clear();
    pendingPlug = null;
    render();
    flash('Plugboard cleared.');
  });

  $('randomBtn').addEventListener('click', randomKey);
  $('resetBtn').addEventListener('click', resetKey);

  render();
}

init();
