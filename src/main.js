/* Duskhollow: phase-1 proof of concept.
 * Rules from the design brief:
 *  - Game logic lives on a logical grid (TownMap). Rendering only projects grid -> iso screen.
 *  - 64x32 tiles, 2:1 projection, defined once in CONFIG.
 *  - Floor is drawn in its own layer. All objects/actors are depth-sorted by the screen-y of their feet.
 *  - 8-direction sprites, Flare direction order.
 *  - NPCs and dialogue are data (src/data.js).
 *  - Touch input becomes intents (moveTo / interact).
 */
(function () {
'use strict';

const CONFIG = {
  TILE_W: 64, TILE_H: 32,
  MAP_W: 40, MAP_H: 40,
  HERO_SPEED: 3.6,          // tiles per second
  HERO_START: { x: 19, y: 34 },
  HERO_LIGHT: 560,          // light radius in world px
  DUSK_TINT: 0xa9b2d6,      // multiply tint for twilight
  DARKNESS: 0x05030a,
  DARK_ALPHA: 0.8,
  WORLD_ZOOM: 1.0           // CSS px per world px (multiplied by DPR)
};
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const FLOOR_DEPTH = -1e7;
const HERO_COLS = 20;
const STATS = { HP_MAX: 100, MP_MAX: 60, HP_START: 58, MP_START: 24, HP_POTION: 40, MP_POTION: 30, POTIONS: 3,
  SKILL_COST: 12, SKILL_COOLDOWN: 3500, SWING_MS: 260, CAST_MS: 420, TALK_RANGE: 1.9 };
const Settings = { tapToMove: localStorage.getItem('dh_tapToMove') === '1' };

// ---------- projection (the ONLY place grid -> screen happens) ----------
const Iso = {
  toScreen(gx, gy) { return { x: (gx - gy) * CONFIG.TILE_W / 2, y: (gx + gy) * CONFIG.TILE_H / 2 }; },
  toGrid(sx, sy) {
    const a = sx / (CONFIG.TILE_W / 2), b = sy / (CONFIG.TILE_H / 2);
    return { x: Math.round((a + b) / 2), y: Math.round((b - a) / 2) };
  }
};
// Flare direction order: 0=-x,1=(-x,-y),2=-y,3=(+x,-y),4=+x,5=(+x,+y),6=+y,7=(-x,+y)
const DIR = { '-1,0': 0, '-1,-1': 1, '0,-1': 2, '1,-1': 3, '1,0': 4, '1,1': 5, '0,1': 6, '-1,1': 7 };
function dirFrom(dx, dy) { return DIR[Math.sign(Math.round(dx * 100)) + ',' + Math.sign(Math.round(dy * 100))]; }

// Seeded RNG so the town looks the same every load
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ---------- the logical town map (no rendering in here) ----------
class TownMap {
  constructor() {
    const W = CONFIG.MAP_W, H = CONFIG.MAP_H;
    this.w = W; this.h = H;
    this.floor = []; this.block = [];
    for (let y = 0; y < H; y++) { this.floor.push(new Array(W).fill('g')); this.block.push(new Array(W).fill(0)); }
    this.objects = [];       // {tile|frame, x, y, tall, kind}
    this.specials = [];      // big composite props {frame, cx, cy, ox, oy, depthY, kind}
    this.interactables = []; // {x, y, w, h, sign}
    this.lights = [];        // {x, y, r, glow}
    this.reserved = new Set();
    this.build();
  }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  key(x, y) { return x + ',' + y; }
  setBlock(x, y) { if (this.inb(x, y)) this.block[y][x] = 1; }
  isFree(x, y) { return this.inb(x, y) && !this.block[y][x]; }
  reserve(x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.reserved.add(this.key(x, y)); }
  obj(tile, x, y, opts = {}) {
    this.objects.push(Object.assign({ tile, x, y, tall: false }, opts));
    if (opts.block !== false && opts.solid) this.setBlock(x, y);
    this.reserved.add(this.key(x, y));
  }
  path(x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.inb(x, y)) { this.floor[y][x] = 'p'; this.reserved.add(this.key(x, y)); } }
  // Cabin variant A: runs along +x; pieces 212..215
  cabinA(x0, y0) {
    for (let i = 0; i < 4; i++) this.obj(212 + i, x0 + i, y0, { tall: true });
    for (let x = x0 - 1; x <= x0 + 3; x++) for (let y = y0 - 2; y <= y0; y++) this.setBlock(x, y);
    this.reserve(x0 - 2, y0 - 3, x0 + 4, y0 + 1);
  }
  // Cabin variant B: runs along y; pieces 208..211
  cabinB(x0, y0) {
    for (let i = 0; i < 4; i++) this.obj(208 + i, x0, y0 + 3 - i, { tall: true });
    for (let x = x0 - 2; x <= x0; x++) for (let y = y0 - 1; y <= y0 + 3; y++) this.setBlock(x, y);
    this.reserve(x0 - 3, y0 - 2, x0 + 1, y0 + 4);
  }
  build() {
    const R = rng(1996 + 2026);
    // Roads and square
    this.path(3, 20, 36, 21);
    this.path(19, 8, 20, 37);
    this.path(16, 17, 23, 24);
    this.path(31, 13, 32, 19);            // spur to the bell tower
    // Square: founders' fire, the heart of the town
    this.obj(102, 20, 20, { solid: true, kind: 'fire' });
    this.lights.push({ x: 20, y: 20, r: 230, glow: 1.25, flicker: true });
    // Buildings
    this.cabinA(24, 13);                  // smithy
    this.obj(103, 27, 15, { solid: true }); // anvil
    this.obj(100, 23, 14, { solid: true }); // wood pile
    this.obj(137, 28, 16, { solid: true }); // chopping stump
    this.lights.push({ x: 26.5, y: 15, r: 150, glow: 0.8, flicker: true });
    this.cabinA(12, 13);                  // the Lantern Inn (two cabins)
    this.cabinA(7, 13);
    this.obj(98, 17, 14, { solid: true });
    this.obj(99, 10, 15, { solid: true });
    this.lights.push({ x: 14, y: 15, r: 150, glow: 0.7, flicker: true });
    this.cabinB(13, 23);                  // healer's house
    this.lights.push({ x: 15, y: 25, r: 120, glow: 0.5 });
    this.cabinB(27, 25);                  // abandoned house
    // Trader's cart corner
    this.obj(96, 32, 24, { solid: true });
    this.obj(101, 33, 23, { solid: true });
    this.obj(100, 30, 25, { solid: true });
    this.lights.push({ x: 31.5, y: 23.5, r: 110, glow: 0.45 });
    // Signpost at the south road
    this.obj(138, 22, 32, { solid: true, tall: true });
    this.interactables.push({ x: 22, y: 32, w: 1, h: 1, sign: 'signpost' });
    // Sealed crypt stairs at the north end (composite prop, 4x4 footprint)
    this.special('pit', 18, 4, 4, 4, { flat: true, kind: 'crypt' });
    this.interactables.push({ x: 18, y: 4, w: 4, h: 4, sign: 'crypt' });
    this.lights.push({ x: 19.5, y: 5.5, r: 120, glow: 0.35, cold: true });
    // Ruined bell tower (composite prop, 4x4 footprint)
    this.special('tower', 30, 9, 4, 4, { kind: 'tower' });
    this.interactables.push({ x: 30, y: 9, w: 4, h: 4, sign: 'tower' });
    // Graveyard on both sides of the abbey road
    const stones = [140, 141, 142, 143];
    for (let y = 5; y <= 10; y += 2) for (let x = 10; x <= 16; x += 2) {
      if (R() < 0.8) this.obj(stones[Math.floor(R() * 4)], x + (y % 4 === 1 ? 1 : 0), y, { solid: true });
    }
    for (let y = 5; y <= 9; y += 2) for (let x = 23; x <= 27; x += 2) {
      if (R() < 0.75) this.obj(stones[Math.floor(R() * 4)], x, y + (x % 4 === 3 ? 1 : 0), { solid: true });
    }
    [[9, 4], [15, 11], [24, 10], [28, 4], [12, 3]].forEach(([x, y], i) => this.obj(244 + (i % 4), x, y, { solid: true, tall: true }));
    // NPC spots stay clear
    window.NPCS.forEach(n => this.reserve(n.x - 1, n.y - 1, n.x + 1, n.y + 1));
    this.reserve(CONFIG.HERO_START.x - 1, CONFIG.HERO_START.y - 1, CONFIG.HERO_START.x + 1, CONFIG.HERO_START.y + 1);
    // Forest border
    const W = this.w, H = this.h;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (edge <= 2) {
        this.setBlock(x, y);
        const chance = edge === 0 ? 0.55 : edge === 1 ? 0.6 : 0.45;
        if (!this.reserved.has(this.key(x, y)) && R() < chance) {
          const north = y < 12 && x < 30;
          const t = north ? 244 + Math.floor(R() * 4) : (R() < 0.5 ? 248 : 252) + Math.floor(R() * 4);
          this.obj(t, x, y, { tall: true });
        }
      }
    }
    // Scatter: shrubs (walkable), rocks and a few trees (blocking)
    for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
      if (this.reserved.has(this.key(x, y)) || this.block[y][x] || this.floor[y][x] === 'p') continue;
      const r = R();
      if (r < 0.025 && Math.hypot(x - 20, y - 20) > 7) this.obj(248 + Math.floor(R() * 8), x, y, { solid: true, tall: true });
      else if (r < 0.05) this.obj(128 + Math.floor(R() * 4), x, y, { solid: true });
      else if (r < 0.16) this.obj(112 + Math.floor(R() * 16), x, y, {});
    }
  }
  special(frame, x0, y0, w, h, opts) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { this.setBlock(x, y); this.reserved.add(this.key(x, y)); }
    this.reserve(x0 - 1, y0 - 1, x0 + w, y0 + h);
    this.specials.push(Object.assign({ frame, x0, y0, w, h }, opts));
  }
  // grid for pathfinding: 0 walkable, 1 blocked
  pathGrid(extraBlocked) {
    const g = this.block.map(r => r.slice());
    (extraBlocked || []).forEach(p => { if (this.inb(p.x, p.y)) g[p.y][p.x] = 1; });
    return g;
  }
}

// ---------- audio: generated wind (starts only after the Start tap) ----------
const Sound = {
  ctx: null, master: null, on: true,
  start() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const ctx = this.ctx = new AC();
      const master = this.master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
      const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 0.8;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lfoGain = ctx.createGain(); lfoGain.gain.value = 300;
      lfo.connect(lfoGain); lfoGain.connect(lp.frequency);
      src.connect(lp); lp.connect(master);
      const drone = ctx.createOscillator(); drone.type = 'sine'; drone.frequency.value = 55;
      const dg = ctx.createGain(); dg.gain.value = 0.05; drone.connect(dg); dg.connect(master);
      src.start(); lfo.start(); drone.start();
      master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 3);
    } catch (e) { console.warn('audio unavailable', e); }
  },
  toggle() {
    this.on = !this.on;
    if (this.ctx) { this.master.gain.cancelScheduledValues(this.ctx.currentTime); this.master.gain.setTargetAtTime(this.on ? 0.5 : 0, this.ctx.currentTime, 0.2); if (this.on) this.ctx.resume(); }
    document.getElementById('btnSound').classList.toggle('off', !this.on);
  }
};

// ---------- DOM dialogue ----------
const Dialogue = {
  el: null, open: false, lines: [], idx: 0, shown: 0, timer: null, onClose: null, closedAt: 0,
  init() {
    this.el = document.getElementById('dialogue');
    document.addEventListener('pointerdown', (e) => {
      if (!this.open) return;
      if (e.target.closest && (e.target.closest('#hud button') || e.target.closest('#credits'))) return;
      e.preventDefault(); e.stopPropagation(); this.advance();
    }, true);
  },
  show(name, role, lines, onClose) {
    this.open = true; this.lines = lines; this.idx = 0; this.onClose = onClose;
    document.getElementById('dlgName').textContent = name;
    document.getElementById('dlgRole').textContent = role || '';
    this.el.classList.remove('hidden');
    document.body.classList.add('dlg-open'); Controls.release();
    this.type();
  },
  type() {
    const text = this.lines[this.idx], t = document.getElementById('dlgText');
    this.shown = 0; clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.shown += 2; t.textContent = text.slice(0, this.shown);
      if (this.shown >= text.length) { clearInterval(this.timer); this.timer = null; }
    }, 22);
    document.getElementById('dlgHint').textContent = this.idx < this.lines.length - 1 ? 'tap to continue' : 'tap to close';
  },
  advance() {
    const text = this.lines[this.idx];
    if (this.timer) { clearInterval(this.timer); this.timer = null; document.getElementById('dlgText').textContent = text; return; }
    this.idx++;
    if (this.idx >= this.lines.length) return this.close();
    this.type();
  },
  close() {
    this.open = false; clearInterval(this.timer); this.timer = null; this.closedAt = performance.now();
    this.el.classList.add('hidden');
    document.body.classList.remove('dlg-open');
    if (this.onClose) this.onClose();
  }
};
function toast(msg, ms = 1800) {
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._h); toast._h = setTimeout(() => t.classList.add('hidden'), ms);
}

// ---------- touch controls: floating joystick + action buttons (DOM, multitouch via pointer ids) ----------
const Controls = {
  scene: null, joy: { id: null, ox: 0, oy: 0, x: 0, y: 0, mag: 0 }, keys: {}, attackHeld: false, R: 52, DEAD: 9,
  init() {
    const zone = document.getElementById('joyZone'), base = document.getElementById('joyBase'), knob = document.getElementById('joyKnob');
    this.base = base; this.knob = knob;
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.joy.id !== null || Dialogue.open) return;
      this.joy.id = e.pointerId; this.joy.ox = e.clientX; this.joy.oy = e.clientY;
      try { zone.setPointerCapture(e.pointerId); } catch (_) {}
      base.classList.remove('rest'); base.style.left = e.clientX + 'px'; base.style.top = e.clientY + 'px';
      this.moveKnob(e.clientX, e.clientY);
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === this.joy.id) { e.preventDefault(); this.moveKnob(e.clientX, e.clientY); } });
    const end = (e) => { if (e.pointerId === this.joy.id) this.release(); };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end); zone.addEventListener('lostpointercapture', end);
    const bind = (id, down, up) => {
      const b = document.getElementById(id);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); try { b.setPointerCapture(e.pointerId); } catch (_) {} b.classList.add('pressed'); if (this.scene && !Dialogue.open) down(); });
      const u = (e) => { b.classList.remove('pressed'); if (up) up(); };
      b.addEventListener('pointerup', u); b.addEventListener('pointercancel', u); b.addEventListener('lostpointercapture', u);
      b.addEventListener('contextmenu', e => e.preventDefault());
    };
    bind('btnAttack', () => { this.attackHeld = true; this.scene.attack(); }, () => { this.attackHeld = false; });
    bind('btnSkill', () => this.scene.skill());
    bind('btnTalk', () => this.scene.interact());
    bind('btnHp', () => this.scene.drink('hp'));
    bind('btnMp', () => this.scene.drink('mp'));
    // keyboard for desktop testing
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase(); this.keys[k] = true;
      if (!this.scene || !this.scene.sys.isActive()) return;
      if (Dialogue.open) { if (k === ' ' || k === 'enter' || k === 'e') { e.preventDefault(); Dialogue.advance(); } return; }
      if (k === ' ') { e.preventDefault(); if (!e.repeat) { this.attackHeld = true; this.scene.attack(); } }
      else if (k === 'f' && !e.repeat) this.scene.skill();
      else if ((k === 'e' || k === 'enter') && !e.repeat) this.scene.interact();
      else if (k === '1' && !e.repeat) this.scene.drink('hp');
      else if (k === '2' && !e.repeat) this.scene.drink('mp');
      if (k.startsWith('arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); this.keys[k] = false; if (k === ' ') this.attackHeld = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.attackHeld = false; this.release(); });
    this.loop();
  },
  moveKnob(cx, cy) {
    let dx = cx - this.joy.ox, dy = cy - this.joy.oy; const d = Math.hypot(dx, dy);
    if (d > this.R) { dx = dx / d * this.R; dy = dy / d * this.R; }
    this.knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    const m = d <= this.DEAD ? 0 : Math.min(1, (d - this.DEAD) / (this.R - this.DEAD));
    this.joy.mag = m; this.joy.x = d ? dx / Math.min(d, this.R) : 0; this.joy.y = d ? dy / Math.min(d, this.R) : 0;
  },
  release() {
    this.joy.id = null; this.joy.mag = 0; this.joy.x = this.joy.y = 0; this.attackHeld = false;
    if (this.knob) { this.knob.style.transform = ''; this.base.classList.add('rest'); this.base.style.left = ''; this.base.style.top = ''; }
  },
  vector() {
    if (this.joy.mag > 0) return { x: this.joy.x, y: this.joy.y, mag: this.joy.mag };
    const K = this.keys; let x = 0, y = 0;
    if (K['a'] || K['arrowleft']) x -= 1; if (K['d'] || K['arrowright']) x += 1;
    if (K['w'] || K['arrowup']) y -= 1; if (K['s'] || K['arrowdown']) y += 1;
    return (x || y) ? { x, y, mag: 1 } : { x: 0, y: 0, mag: 0 };
  },
  attach(scene) { this.scene = scene; this.release(); this._talk = undefined; },
  setTalk(name) {
    if (name === this._talk) return; this._talk = name;
    const b = document.getElementById('btnTalk'); b.classList.toggle('ready', !!name);
    document.getElementById('talkLbl').textContent = name || 'Talk';
  },
  setStats(st) {
    const q = (id) => document.getElementById(id);
    q('hpFill').style.height = (st.hp / STATS.HP_MAX * 100) + '%'; q('hpText').textContent = Math.round(st.hp);
    q('mpFill').style.height = (st.mp / STATS.MP_MAX * 100) + '%'; q('mpText').textContent = Math.round(st.mp);
    q('hpCount').textContent = st.hpPot; q('mpCount').textContent = st.mpPot;
    q('btnHp').classList.toggle('dim', st.hpPot <= 0); q('btnMp').classList.toggle('dim', st.mpPot <= 0);
  },
  flashOrb(kind) { const o = document.getElementById(kind === 'hp' ? 'orbHp' : 'orbMp'); o.classList.remove('flash'); void o.offsetWidth; o.classList.add('flash'); },
  loop() {
    const s = this.scene;
    if (s && s.sys && s.sys.isActive()) {
      const st = s.stats, now = s.time.now, left = Math.max(0, st.skillReadyAt - now);
      const pct = left > 0 ? (left / STATS.SKILL_COOLDOWN * 100) : 0;
      const cd = document.getElementById('skillCd'); cd.style.setProperty('--cd', pct.toFixed(1) + '%');
      document.getElementById('btnSkill').classList.toggle('dim', left === 0 && st.mp < STATS.SKILL_COST);
    }
    requestAnimationFrame(() => this.loop());
  }
};
const Menu = {
  init() {
    const m = document.getElementById('menu');
    const sync = () => {
      document.getElementById('mTap').textContent = 'Tap-to-move: ' + (Settings.tapToMove ? 'On' : 'Off');
      document.getElementById('mSound').textContent = 'Sound: ' + (Sound.on ? 'On' : 'Off');
      document.body.classList.toggle('tapmove', Settings.tapToMove);
    };
    this.sync = sync; sync();
    this.open = () => { if (Dialogue.open) Dialogue.close(); Controls.release(); sync(); m.classList.remove('hidden'); const g = window.__game; if (g && g.scene.isActive('Town')) g.scene.pause('Town'); };
    const close = () => { m.classList.add('hidden'); const g = window.__game; if (g && g.scene.isPaused('Town')) g.scene.resume('Town'); };
    document.getElementById('mResume').addEventListener('click', close);
    document.getElementById('mTap').addEventListener('click', () => { Settings.tapToMove = !Settings.tapToMove; localStorage.setItem('dh_tapToMove', Settings.tapToMove ? '1' : '0'); sync(); });
    document.getElementById('mSound').addEventListener('click', () => { Sound.start(); Sound.toggle(); sync(); });
    document.getElementById('mTitle').addEventListener('click', () => { m.classList.add('hidden'); const g = window.__game; if (g) { g.scene.stop('Town'); g.scene.start('Title'); } });
  }
};

// ---------- Scenes ----------
class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    const w = this.scale.width, h = this.scale.height;
    this.cameras.main.setBackgroundColor('#0a080e');
    const title = this.add.text(w / 2, h / 2 - 60 * DPR, 'DUSKHOLLOW', { fontFamily: 'Georgia, serif', fontSize: (30 * DPR) + 'px', color: '#b89a68' }).setOrigin(0.5);
    title.setLetterSpacing && title.setLetterSpacing(8 * DPR);
    const bw = Math.min(360 * DPR, w * 0.6), bh = 10 * DPR;
    const frame = this.add.rectangle(w / 2, h / 2, bw + 6 * DPR, bh + 6 * DPR).setStrokeStyle(1 * DPR, 0x6b5636);
    const bar = this.add.rectangle(w / 2 - bw / 2, h / 2, 1, bh, 0xb0542a).setOrigin(0, 0.5);
    const label = this.add.text(w / 2, h / 2 + 26 * DPR, 'Lighting the lanterns... 0%', { fontFamily: 'Georgia, serif', fontSize: (13 * DPR) + 'px', color: '#8d7a5a' }).setOrigin(0.5);
    this.load.on('progress', v => { bar.width = Math.max(1, bw * v); label.setText('Lighting the lanterns... ' + Math.round(v * 100) + '%'); });
    this.load.image('tiles', 'assets/grassland_tiles.png');
    this.load.image('light', 'assets/light.png');
    this.load.image('glow', 'assets/glow.png');
    this.load.spritesheet('hero', 'assets/hero.png', { frameWidth: 128, frameHeight: 128 });
    window.NPCS.forEach(n => this.load.spritesheet(n.sheet, 'assets/' + n.sheet + '.png', { frameWidth: 128, frameHeight: 128 }));
  }
  create() {
    // Register tile frames from Flare tile definitions
    const tex = this.textures.get('tiles');
    for (const id in window.TILEDEFS) { const [x, y, w, h] = window.TILEDEFS[id]; tex.add('t' + id, 0, x, y, w, h); }
    tex.add('pit', 0, 768, 704, 256, 128);
    tex.add('tower', 0, 512, 736, 256, 256);
    // Animations: hero sheet = 12 cols (4 stance + 8 run) x 8 dirs; NPC sheets = 4 stance x 8 dirs
    for (let d = 0; d < 8; d++) {
      const H = HERO_COLS;
      this.anims.create({ key: 'hero_idle_' + d, frames: this.anims.generateFrameNumbers('hero', { start: d * H, end: d * H + 3 }), frameRate: 5, repeat: -1, yoyo: true });
      this.anims.create({ key: 'hero_run_' + d, frames: this.anims.generateFrameNumbers('hero', { start: d * H + 4, end: d * H + 11 }), frameRate: 13, repeat: -1 });
      this.anims.create({ key: 'hero_swing_' + d, frames: this.anims.generateFrameNumbers('hero', { start: d * H + 12, end: d * H + 15 }), frameRate: 16, repeat: 0 });
      this.anims.create({ key: 'hero_cast_' + d, frames: this.anims.generateFrameNumbers('hero', { start: d * H + 16, end: d * H + 19 }), frameRate: 11, repeat: 0 });
      window.NPCS.forEach(n => this.anims.create({ key: n.sheet + '_idle_' + d, frames: this.anims.generateFrameNumbers(n.sheet, { start: d * 4, end: d * 4 + 3 }), frameRate: 4, repeat: -1, yoyo: true }));
    }
    this.time.delayedCall(350, () => this.scene.start('Title'));
  }
}

class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }
  create() {
    document.getElementById('hud').classList.add('hidden');
    this.cameras.main.setBackgroundColor('#07050b');
    this.layout();
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));
    this.cameras.main.fadeIn(600, 0, 0, 0);
  }
  onResize() { this.children.removeAll(true); this.layout(); }
  layout() {
    const w = this.scale.width, h = this.scale.height, s = Math.min(w / (900 * DPR), h / (420 * DPR), 1.4) * DPR;
    // A small silhouette tableau: trees and a cabin around a fire
    const cx = w / 2, by = h * 0.86;
    const place = (t, x, y, sc, tint) => { const d = window.TILEDEFS[t]; return this.add.image(x, y, 'tiles', 't' + t).setOrigin(d[4] / d[2], d[5] / d[3]).setScale(sc).setTint(tint); };
    [[-330, 248], [-250, 244], [250, 252], [340, 249], [-420, 245], [430, 246]].forEach(([dx, t], i) => place(t, cx + dx * s, by + (i % 2) * 8 * s, s * 1.1, 0x2a2838));
    [212, 213, 214, 215].forEach((t, i) => place(t, cx - 150 * s + i * 32 * s, by - 26 * s + i * 16 * s, s, 0x3a3448));
    place(102, cx + 70 * s, by - 6 * s, s, 0x8a7060);
    const glow = this.add.image(cx + 70 * s, by - 14 * s, 'glow').setScale(2.2 * s).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.8);
    this.tweens.add({ targets: glow, alpha: { from: 0.55, to: 0.95 }, scale: { from: 2.0 * s, to: 2.4 * s }, duration: 220, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const g = this.add.graphics();
    for (let i = 0; i < 18; i++) { g.fillStyle(0x0a0812, 0.06); g.fillRect(0, by + i * 4 * s, w, h); }
    // Title
    const t = this.add.text(cx, h * 0.24, 'DUSKHOLLOW', { fontFamily: 'Georgia, "Times New Roman", serif', fontSize: Math.round(56 * s) + 'px', color: '#c9a466', stroke: '#000000', strokeThickness: 6 * s });
    t.setOrigin(0.5); if (t.setLetterSpacing) t.setLetterSpacing(10 * s);
    const tg = this.add.image(cx, h * 0.24, 'glow').setBlendMode(Phaser.BlendModes.ADD).setScale(3.2 * s, 1.1 * s).setAlpha(0.35); tg.setDepth(-1);
    this.tweens.add({ targets: t, alpha: { from: 0.85, to: 1 }, duration: 1800, yoyo: true, repeat: -1 });
    this.add.text(cx, h * 0.24 + 46 * s, 'the town above the hungry stairs', { fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: Math.round(15 * s) + 'px', color: '#8d7a5a' }).setOrigin(0.5);
    this.button(cx, h * 0.5, 'Start', s, () => this.startGame());
    this.button(cx, h * 0.5 + 54 * s, 'Credits', s, () => document.getElementById('credits').classList.remove('hidden'));
    this.add.text(w - 10 * DPR, h - 8 * DPR, 'proof of concept v0.1', { fontFamily: 'Georgia, serif', fontSize: Math.round(11 * DPR) + 'px', color: '#4e4232' }).setOrigin(1, 1);
  }
  button(x, y, label, s, cb) {
    const bw = 190 * s, bh = 42 * s;
    const bg = this.add.rectangle(x, y, bw, bh, 0x1d140d, 0.92).setStrokeStyle(2 * s, 0x8a6c3e).setInteractive({ useHandCursor: true });
    const tx = this.add.text(x, y, label, { fontFamily: 'Georgia, serif', fontSize: Math.round(20 * s) + 'px', color: '#e8cf98' }).setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(0x2c1e12, 0.95));
    bg.on('pointerout', () => bg.setFillStyle(0x1d140d, 0.92));
    bg.on('pointerup', () => { if (!document.getElementById('credits').classList.contains('hidden')) return; cb(); });
    bg.name = 'btn_' + label;
    return bg;
  }
  startGame() {
    if (this.starting) return; this.starting = true;
    Sound.start();
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Town'));
  }
}

class TownScene extends Phaser.Scene {
  constructor() { super('Town'); }
  create() {
    const map = this.map = new TownMap();
    window.__town = this; // for debugging / automated tests
    this.cameras.main.setBackgroundColor('#06050a');
    const cam = this.cameras.main;
    cam.setZoom(CONFIG.WORLD_ZOOM * DPR);
    // Floor layer (static, below everything)
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const id = (map.floor[y][x] === 'p' ? 32 : 16) + (x % 4) + (y % 4) * 4;
      this.tileImage(id, x, y).setDepth(FLOOR_DEPTH).setTint(CONFIG.DUSK_TINT);
    }
    // Composite props
    this.tall = [];
    map.specials.forEach(sp => {
      const c = Iso.toScreen(sp.x0 + (sp.w - 1) / 2, sp.y0 + (sp.h - 1) / 2);
      const img = this.add.image(c.x, c.y, 'tiles', sp.frame).setTint(CONFIG.DUSK_TINT);
      if (sp.flat) { img.setOrigin(0.5, 0.5).setDepth(FLOOR_DEPTH + 1); }
      else { img.setOrigin(0.5, 0.78); img.setDepth(c.y + 40); this.tall.push(img); }
    });
    // Objects (depth = screen y of the tile they stand on)
    map.objects.forEach(o => {
      const img = this.tileImage(o.tile, o.x, o.y);
      img.setDepth(img.y + o.x * 0.001).setTint(CONFIG.DUSK_TINT);
      if (o.tall) this.tall.push(img);
      if (o.kind === 'fire') img.setTint(0xffffff);
    });
    // NPCs
    this.npcs = window.NPCS.map(n => {
      const p = Iso.toScreen(n.x, n.y);
      const spr = this.add.sprite(p.x, p.y, n.sheet, n.face * 4).setOrigin(0.5, 0.75);
      spr.play({ key: n.sheet + '_idle_' + n.face, startFrame: Math.floor(Math.random() * 4) });
      spr.setDepth(p.y + 0.5).setTint(this.mulTint(n.tint, 0xd0d4ec));
      const label = this.add.text(p.x, p.y - 62, n.name, { fontFamily: 'Georgia, serif', fontSize: '11px', color: '#e2c58a', stroke: '#000', strokeThickness: 3, resolution: DPR * 2 }).setOrigin(0.5, 1).setDepth(9e8).setAlpha(0);
      return { data: n, spr, label, talked: false, gossipIdx: Math.floor(Math.random() * n.gossip.length) };
    });
    // Hero
    const s = CONFIG.HERO_START;
    this.hero = { gx: s.x, gy: s.y, dir: 2, path: [], moving: false, pendingInteract: null };
    const hp = Iso.toScreen(s.x, s.y);
    this.heroSpr = this.add.sprite(hp.x, hp.y, 'hero', 2 * HERO_COLS).setOrigin(0.5, 0.75).setTint(0xe6e2f0);
    this.heroSpr.play('hero_idle_2');
    this.heroSpr.on('animationcomplete', (anim) => {
      if (anim.key.startsWith('hero_swing') || anim.key.startsWith('hero_cast')) this.heroSpr.play((this.hero.moving ? 'hero_run_' : 'hero_idle_') + this.hero.dir, true);
    });
    // Combat-ish stats (no monsters yet; potions and skill need something to show)
    this.stats = { hp: STATS.HP_START, mp: STATS.MP_START, hpPot: STATS.POTIONS, mpPot: STATS.POTIONS, skillReadyAt: 0, lockUntil: 0 };
    this.tempLights = [];
    this.interactTarget = null;
    Controls.attach(this);
    this.updateHud();
    this.marker = this.add.ellipse(0, 0, 30, 15).setStrokeStyle(1.5, 0xe2b45a, 0.9).setDepth(FLOOR_DEPTH + 2).setVisible(false);
    // Pathfinding
    this.es = new EasyStar.js();
    this.es.setGrid(map.pathGrid(this.npcs.map(n => n.data)));
    this.es.setAcceptableTiles([0]);
    this.es.enableDiagonals();
    this.es.disableCornerCutting();
    this.es.setIterationsPerCalculation(4000);
    // Lighting: darkness render texture with lights erased out of it, plus warm additive glows
    this.lightImg = this.make.image({ key: 'light', add: false }).setOrigin(0.5);
    this.dark = this.add.renderTexture(0, 0, this.scale.width, this.scale.height).setOrigin(0, 0).setScrollFactor(0).setDepth(1e9);
    this.glows = map.lights.map(l => {
      const p = Iso.toScreen(l.x, l.y);
      const g = this.add.image(p.x, p.y - 10, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(1e9 + 1).setScale(l.r / 128 * 1.1, l.r / 128 * 1.1).setAlpha(0.55 * l.glow);
      if (l.cold) g.setTint(0x6080ff);
      return { l, g, p, phase: Math.random() * 10 };
    });
    // Camera
    const tl = Iso.toScreen(0, map.h - 1), tr = Iso.toScreen(map.w - 1, 0), br = Iso.toScreen(map.w - 1, map.h - 1);
    cam.setBounds(tl.x - 64, -160, (tr.x - tl.x) + 128, br.y + 220);
    cam.startFollow(this.heroSpr, true, 0.15, 0.15);
    cam.fadeIn(700, 0, 0, 0);
    // Darkness is drawn by its own unzoomed screen-space camera
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCam.ignore(this.children.list.filter(c => c !== this.dark));
    cam.ignore(this.dark);
    this.events.on('addedtoscene', (go) => { if (go !== this.dark) this.uiCam.ignore(go); });
    // Input -> intents
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', () => { this.holding = false; }, this);
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => { this.scale.off('resize', this.onResize, this); document.getElementById('hud').classList.add('hidden'); });
    // HUD
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('btnSound').classList.toggle('off', !Sound.on);
    this.time.delayedCall(900, () => toast(Settings.tapToMove ? 'Tap the ground to walk. Tap a villager to talk.' : 'Left thumb: move. Glowing button: talk.', 3200));
  }
  mulTint(a, b) {
    const r = ((a >> 16 & 255) * (b >> 16 & 255)) / 255, g = ((a >> 8 & 255) * (b >> 8 & 255)) / 255, bl = ((a & 255) * (b & 255)) / 255;
    return (r << 16) | (g << 8) | bl;
  }
  tileImage(id, gx, gy) {
    const d = window.TILEDEFS[id]; const p = Iso.toScreen(gx, gy);
    return this.add.image(p.x, p.y, 'tiles', 't' + id).setOrigin(d[4] / d[2], d[5] / d[3]);
  }
  onResize(size) { if (this.dark) this.dark.resize(size.width, size.height); if (this.uiCam) this.uiCam.setSize(size.width, size.height); }

  // ----- input -----
  onDown(p) {
    if (!Settings.tapToMove) return;
    if (Dialogue.open || performance.now() - Dialogue.closedAt < 200) return;
    this.holding = true; this.holdStart = performance.now(); this.lastRetarget = 0; this.downAt = { x: p.x, y: p.y };
    const npc = this.npcAt(p.worldX, p.worldY);
    if (npc) { this.holding = false; return this.intentInteract(npc); }
    const g = Iso.toGrid(p.worldX, p.worldY);
    const sign = this.map.interactables.find(it => g.x >= it.x - 1 && g.x <= it.x + it.w && g.y >= it.y - 1 && g.y <= it.y + it.h && !this.map.isFree(g.x, g.y));
    if (sign) { this.holding = false; return this.intentInspect(sign); }
    this.intentMove(g.x, g.y);
  }
  onMove(p) {
    if (!this.holding || !p.isDown || Dialogue.open) return;
    const now = performance.now();
    const moved = Math.hypot(p.x - this.downAt.x, p.y - this.downAt.y) > 12 * DPR;
    if ((moved || now - this.holdStart > 350) && now - this.lastRetarget > 180) {
      this.lastRetarget = now;
      const g = Iso.toGrid(p.worldX, p.worldY);
      this.intentMove(g.x, g.y, true);
    }
  }
  npcAt(wx, wy) {
    let best = null, bd = 1e9;
    for (const n of this.npcs) {
      const dx = wx - n.spr.x, dy = wy - (n.spr.y - 26);
      if (Math.abs(dx) < 24 && dy > -40 && dy < 36) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = n; } }
    }
    if (best) return best;
    const g = Iso.toGrid(wx, wy);
    return this.npcs.find(n => n.data.x === g.x && n.data.y === g.y) || null;
  }

  // ----- intents -----
  intentMove(tx, ty, quiet) {
    this.hero.pendingInteract = null;
    const goal = this.nearestFree(tx, ty, null);
    if (!goal) return;
    this.findPath(goal.x, goal.y, () => {});
    if (!quiet || !this.marker.visible) this.showMarker(goal.x, goal.y);
  }
  intentInteract(npc) {
    const n = npc.data;
    const hx = Math.round(this.hero.gx), hy = Math.round(this.hero.gy);
    if (Math.max(Math.abs(hx - n.x), Math.abs(hy - n.y)) <= 1 && !this.hero.moving) return this.talk(npc);
    const goal = this.nearestFree(n.x, n.y, { adjacentTo: n });
    if (!goal) return;
    this.showMarker(n.x, n.y);
    this.hero.pendingInteract = { npc };
    this.findPath(goal.x, goal.y);
  }
  intentInspect(sign) {
    const cx = sign.x + (sign.w - 1) / 2, cy = sign.y + (sign.h - 1) / 2;
    const goal = this.nearestFree(Math.round(cx), Math.round(cy), { rect: sign });
    if (!goal) return;
    this.hero.pendingInteract = { sign, cx, cy };
    this.showMarker(goal.x, goal.y);
    this.findPath(goal.x, goal.y);
  }
  // Nearest walkable tile. With adjacentTo/rect, only tiles touching that NPC/prop count.
  nearestFree(tx, ty, opt) {
    const hx = this.hero.gx, hy = this.hero.gy, npcBlocked = (x, y) => this.npcs.some(n => n.data.x === x && n.data.y === y);
    let best = null, bd = 1e9;
    for (let r = 0; r <= 8 && !best; r++) {
      for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) {
        if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== r) continue;
        if (!this.map.isFree(x, y) || npcBlocked(x, y)) continue;
        if (opt && opt.adjacentTo && Math.max(Math.abs(x - opt.adjacentTo.x), Math.abs(y - opt.adjacentTo.y)) !== 1) continue;
        if (opt && opt.rect) { const R = opt.rect; if (x < R.x - 1 || x > R.x + R.w || y < R.y - 1 || y > R.y + R.h) continue; }
        const d = (x - hx) ** 2 + (y - hy) ** 2 + ((x - tx) ** 2 + (y - ty) ** 2) * 0.5;
        if (d < bd) { bd = d; best = { x, y }; }
      }
    }
    return best;
  }
  findPath(gx, gy) {
    const h = this.hero;
    // start from the tile we're heading to, so re-paths are smooth
    const sx = h.path.length ? h.path[0].x : Math.round(h.gx), sy = h.path.length ? h.path[0].y : Math.round(h.gy);
    const token = (this.pathToken = (this.pathToken || 0) + 1);
    this.es.findPath(sx, sy, gx, gy, (path) => {
      if (token !== this.pathToken) return;
      if (!path) { h.pendingInteract = null; return; }
      const first = h.path.length ? [h.path[0]] : [];
      h.path = first.concat(path.slice(1));
      if (!h.path.length) this.arrive();
    });
  }
  showMarker(x, y) {
    const p = Iso.toScreen(x, y);
    this.marker.setPosition(p.x, p.y).setVisible(true).setAlpha(1).setScale(1);
    this.tweens.killTweensOf(this.marker);
    this.tweens.add({ targets: this.marker, alpha: 0, scale: 1.6, duration: 650, onComplete: () => this.marker.setVisible(false) });
  }
  arrive() {
    const h = this.hero, pi = h.pendingInteract; h.pendingInteract = null;
    if (!pi) return;
    if (pi.npc) this.talk(pi.npc);
    else if (pi.sign) { this.face(pi.cx - h.gx, pi.cy - h.gy); const s = window.SIGNS[pi.sign.sign]; Dialogue.show(s.name, s.role, s.lines.slice()); }
  }
  face(dx, dy) {
    const ang = Math.atan2(dy, dx); const snapped = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
    const d = dirFrom(Math.cos(snapped), Math.sin(snapped));
    if (d !== undefined) { this.hero.dir = d; this.heroSpr.play('hero_idle_' + d, true); }
  }
  talk(npc) {
    const n = npc.data, h = this.hero;
    this.face(n.x - h.gx, n.y - h.gy);
    const back = dirFrom(Math.sign(Math.round(h.gx) - n.x), Math.sign(Math.round(h.gy) - n.y));
    if (back !== undefined) npc.spr.play(n.sheet + '_idle_' + back, true);
    let lines;
    if (!npc.talked) { lines = n.greeting.slice(); npc.talked = true; }
    else { lines = n.gossip[npc.gossipIdx % n.gossip.length].slice(); npc.gossipIdx++; }
    Dialogue.show(n.name, n.role, lines, () => {
      this.time.delayedCall(2500, () => npc.spr.play(n.sheet + '_idle_' + n.face, true));
      if (n.id === 'healer' && this.stats.hp < STATS.HP_MAX) { this.stats.hp = STATS.HP_MAX; this.floatText('Mended', '#ffd0a0'); Controls.flashOrb('hp'); this.updateHud(); toast('Mother Maelis mends your wounds.', 1800); }
    });
  }

  // ----- per-frame -----
  update(time, delta) {
    this.es.calculate();
    const h = this.hero, dt = Math.min(delta, 50) / 1000;
    const v = Dialogue.open ? { mag: 0 } : Controls.vector();
    const locked = time < this.stats.lockUntil;
    if (!Dialogue.open && Controls.attackHeld && !locked) this.attack();
    if (v.mag > 0 && !locked) {
      h.path = []; h.pendingInteract = null;
      this.moveAnalog(v, dt);
    } else if (v.mag > 0 || locked) {
      // swinging/casting: stand still
    } else if (h.path.length) {
      const t = h.path[0];
      const dx = t.x - h.gx, dy = t.y - h.gy, dist = Math.hypot(dx, dy);
      const step = CONFIG.HERO_SPEED * dt;
      const d = dirFrom(dx, dy);
      if (d !== undefined && (d !== h.dir || !h.moving)) { h.dir = d; this.heroSpr.play('hero_run_' + d, true); }
      h.moving = true;
      if (dist <= step) { h.gx = t.x; h.gy = t.y; h.path.shift(); if (!h.path.length) { h.moving = false; this.heroSpr.play('hero_idle_' + h.dir, true); this.arrive(); } }
      else { h.gx += dx / dist * step; h.gy += dy / dist * step; }
    } else if (h.moving) {
      h.moving = false; this.heroSpr.anims.timeScale = 1; this.heroSpr.play('hero_idle_' + h.dir, true);
    }
    this.updateInteract(time);
    const p = Iso.toScreen(h.gx, h.gy);
    this.heroSpr.setPosition(p.x, p.y).setDepth(p.y + 0.6);
    // Occlusion: tall things in front of the hero fade
    if (!this._occT || time - this._occT > 90) {
      this._occT = time;
      const hb = new Phaser.Geom.Rectangle(p.x - 14, p.y - 52, 28, 52);
      for (const img of this.tall) {
        const front = img.depth > this.heroSpr.depth;
        const hit = front && Phaser.Geom.Intersects.RectangleToRectangle(hb, img.getBounds());
        const target = hit ? 0.45 : 1;
        if (img.alpha !== target) img.setAlpha(img.alpha + (target - img.alpha) * 0.5 > 0.97 ? 1 : img.alpha + (target - img.alpha) * 0.5);
      }
    }
    // NPC name labels appear when near
    for (const n of this.npcs) {
      const near = Math.hypot(n.data.x - h.gx, n.data.y - h.gy) < 4.5;
      n.label.setAlpha(Phaser.Math.Linear(n.label.alpha, near ? 1 : 0, 0.15));
    }
    this.drawLight(time);
  }
  drawLight(time) {
    const cam = this.cameras.main, z = cam.zoom, wv = cam.worldView, rt = this.dark, li = this.lightImg;
    rt.clear();
    rt.fill(CONFIG.DARKNESS, CONFIG.DARK_ALPHA);
    const toS = (x, y) => ({ x: (x - wv.x) * z, y: (y - wv.y) * z });
    const hs = toS(this.heroSpr.x, this.heroSpr.y - 20);
    const flick = 1 + Math.sin(time * 0.011) * 0.012 + Math.sin(time * 0.037) * 0.008;
    li.setScale((CONFIG.HERO_LIGHT * 2 / 512) * z * flick, (CONFIG.HERO_LIGHT * 2 / 512) * z * 0.7 * flick);
    rt.erase(li, hs.x, hs.y);
    for (const gl of this.glows) {
      const s = toS(gl.p.x, gl.p.y);
      const r = gl.l.r * 1.7 * (gl.l.flicker ? (1 + Math.sin(time * 0.013 + gl.phase) * 0.05 + Math.sin(time * 0.029 + gl.phase) * 0.03) : 1);
      if (s.x < -r * z * 2 || s.y < -r * z * 2 || s.x > rt.width + r * z * 2 || s.y > rt.height + r * z * 2) continue;
      li.setScale((r * 2 / 512) * z, (r * 2 / 512) * z * 0.6);
      rt.erase(li, s.x, s.y);
      if (gl.l.flicker) gl.g.setAlpha(0.5 * gl.l.glow * (0.85 + Math.sin(time * 0.02 + gl.phase) * 0.15));
    }
    this.tempLights = this.tempLights.filter(t => time < t.until);
    for (const t of this.tempLights) {
      const k = 1 - (t.until - time) / t.dur, s = toS(t.x, t.y), r = t.r * (0.6 + 0.4 * Math.sin(Math.min(1, k) * Math.PI));
      li.setScale((r * 2 / 512) * z, (r * 2 / 512) * z * 0.65);
      rt.erase(li, s.x, s.y);
    }
    rt.render();
  }

  // ----- analog movement with grid collision + sliding -----
  canStand(x, y) {
    const r = 0.26;
    for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
      const tx = Math.round(x + ox), ty = Math.round(y + oy);
      if (!this.map.isFree(tx, ty)) return false;
      if (this.npcs.some(n => n.data.x === tx && n.data.y === ty)) return false;
    }
    return true;
  }
  moveAnalog(v, dt) {
    const h = this.hero;
    // snap the screen-space stick angle to 8 screen directions, then map to grid directions
    const oct = ((Math.round(Math.atan2(v.y, v.x) / (Math.PI / 4)) % 8) + 8) % 8;
    const GRID = [[1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]]; // right, down-right, down, down-left, left, up-left, up, up-right
    const [gx, gy] = GRID[oct], len = Math.hypot(gx, gy);
    const speed = CONFIG.HERO_SPEED * (0.3 + 0.7 * v.mag);
    const nx = h.gx + gx / len * speed * dt, ny = h.gy + gy / len * speed * dt;
    if (this.canStand(nx, ny)) { h.gx = nx; h.gy = ny; }
    else if (gx !== 0 && this.canStand(nx, h.gy)) { h.gx = nx; }
    else if (gy !== 0 && this.canStand(h.gx, ny)) { h.gy = ny; }
    else if (gx !== 0 && gy === 0) { // head-on into a wall along x: nudge toward tile center on y to slip past corners
      const cy = Math.round(h.gy); if (Math.abs(cy - h.gy) > 0.02 && this.canStand(h.gx, h.gy + Math.sign(cy - h.gy) * speed * dt * 0.7)) h.gy += Math.sign(cy - h.gy) * speed * dt * 0.7;
    } else if (gy !== 0 && gx === 0) {
      const cx = Math.round(h.gx); if (Math.abs(cx - h.gx) > 0.02 && this.canStand(h.gx + Math.sign(cx - h.gx) * speed * dt * 0.7, h.gy)) h.gx += Math.sign(cx - h.gx) * speed * dt * 0.7;
    }
    const d = DIR[gx + ',' + gy];
    if (d !== h.dir || !h.moving || !this.heroSpr.anims.currentAnim || !this.heroSpr.anims.currentAnim.key.startsWith('hero_run')) { h.dir = d; this.heroSpr.play('hero_run_' + d, true); }
    this.heroSpr.anims.timeScale = 0.55 + 0.45 * v.mag;
    h.moving = true;
  }

  // ----- interact (talk/inspect) -----
  updateInteract(time) {
    if (this._intT && time - this._intT < 120) return; this._intT = time;
    const h = this.hero; let best = null, bd = STATS.TALK_RANGE;
    for (const n of this.npcs) { const d = Math.hypot(n.data.x - h.gx, n.data.y - h.gy); if (d < bd) { bd = d; best = { npc: n, label: 'Talk' }; } }
    if (!best) for (const it of this.map.interactables) {
      const cx = Math.max(it.x - 0.5, Math.min(h.gx, it.x + it.w - 0.5)), cy = Math.max(it.y - 0.5, Math.min(h.gy, it.y + it.h - 0.5));
      const d = Math.hypot(cx - h.gx, cy - h.gy);
      if (d < 1.4 && d < bd) { bd = d; best = { sign: it, label: 'Look' }; }
    }
    this.interactTarget = best;
    Controls.setTalk(best ? (best.npc ? best.npc.data.name.split(' ')[0] : 'Look') : null);
  }
  interact() {
    if (Dialogue.open || !this.interactTarget) return;
    const t = this.interactTarget;
    if (this.hero.moving) { this.hero.moving = false; this.hero.path = []; }
    if (t.npc) this.talk(t.npc);
    else { const it = t.sign; const cx = it.x + (it.w - 1) / 2, cy = it.y + (it.h - 1) / 2; this.hero.pendingInteract = { sign: it, cx, cy }; this.arrive(); }
  }

  // ----- actions -----
  attack() {
    const now = this.time.now, st = this.stats;
    if (Dialogue.open || now < st.lockUntil) return;
    st.lockUntil = now + STATS.SWING_MS;
    this.hero.path = [];
    this.heroSpr.anims.timeScale = 1;
    this.heroSpr.play('hero_swing_' + this.hero.dir, true);
    // swing arc in the facing direction (screen space)
    const g = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]][this.hero.dir];
    const sv = Iso.toScreen(g[0], g[1]), a = Math.atan2(sv.y, sv.x);
    const arc = this.add.graphics().setPosition(this.heroSpr.x, this.heroSpr.y - 20).setDepth(this.heroSpr.depth + 1).setBlendMode(Phaser.BlendModes.ADD);
    arc.lineStyle(5, 0xfff0c0, 0.9); arc.beginPath(); arc.arc(0, 0, 30, a - 1.1, a + 1.1); arc.strokePath();
    arc.lineStyle(2, 0xffb050, 0.8); arc.beginPath(); arc.arc(0, 0, 36, a - 0.9, a + 0.9); arc.strokePath();
    arc.setScale(0.7, 0.45);
    this.tweens.add({ targets: arc, scaleX: 1.15, scaleY: 0.7, alpha: 0, duration: 230, ease: 'Cubic.easeOut', onComplete: () => arc.destroy() });
    this.swings = (this.swings || 0) + 1;
  }
  skill() {
    const now = this.time.now, st = this.stats;
    if (Dialogue.open || now < st.lockUntil) return;
    if (now < st.skillReadyAt) return;
    if (st.mp < STATS.SKILL_COST) { toast('Not enough mana.', 1200); Controls.flashOrb('mp'); return; }
    st.mp -= STATS.SKILL_COST; st.skillReadyAt = now + STATS.SKILL_COOLDOWN; st.lockUntil = now + STATS.CAST_MS;
    this.hero.path = [];
    this.heroSpr.anims.timeScale = 1;
    this.heroSpr.play('hero_cast_' + this.hero.dir, true);
    this.updateHud();
    const x = this.heroSpr.x, y = this.heroSpr.y - 14;
    this.time.delayedCall(160, () => {
      const flash = this.add.image(x, y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(1e9 + 2).setScale(0.4).setTint(0xffa040);
      this.tweens.add({ targets: flash, scale: 2.4, alpha: 0, duration: 520, onComplete: () => flash.destroy() });
      const N = 16;
      for (let i = 0; i < N; i++) {
        const ang = i / N * Math.PI * 2;
        const f = this.add.image(x, y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(y + 2).setScale(0.35).setTint(i % 2 ? 0xff6a10 : 0xffc040);
        this.tweens.add({ targets: f, x: x + Math.cos(ang) * 120, y: y + Math.sin(ang) * 60, scale: 0.12, alpha: 0, duration: 650, ease: 'Quad.easeOut', onComplete: () => f.destroy() });
      }
      this.tempLights.push({ x, y, r: 260, until: this.time.now + 650, dur: 650 });
    });
    this.casts = (this.casts || 0) + 1;
  }
  drink(kind) {
    const st = this.stats, hp = kind === 'hp';
    if (Dialogue.open) return;
    if ((hp ? st.hpPot : st.mpPot) <= 0) { toast('No ' + (hp ? 'healing' : 'mana') + ' potions left.', 1200); return; }
    if (hp ? st.hp >= STATS.HP_MAX : st.mp >= STATS.MP_MAX) { toast((hp ? 'Health' : 'Mana') + ' is already full.', 1000); return; }
    if (hp) { st.hpPot--; const g = Math.min(STATS.HP_POTION, STATS.HP_MAX - st.hp); st.hp += g; this.floatText('+' + g, '#ff6a5a'); }
    else { st.mpPot--; const g = Math.min(STATS.MP_POTION, STATS.MP_MAX - st.mp); st.mp += g; this.floatText('+' + g, '#7aa0ff'); }
    Controls.flashOrb(kind);
    const col = hp ? 0xff3030 : 0x4070ff, x = this.heroSpr.x, y = this.heroSpr.y;
    for (let i = 0; i < 14; i++) {
      const c = this.add.circle(x + Phaser.Math.Between(-16, 16), y - Phaser.Math.Between(0, 30), Phaser.Math.Between(2, 4), col, 0.9).setBlendMode(Phaser.BlendModes.ADD).setDepth(this.heroSpr.depth + 1);
      this.tweens.add({ targets: c, y: c.y - Phaser.Math.Between(30, 60), alpha: 0, duration: Phaser.Math.Between(500, 900), delay: i * 25, onComplete: () => c.destroy() });
    }
    const ring = this.add.ellipse(x, y, 40, 20).setStrokeStyle(2, col, 0.9).setDepth(FLOOR_DEPTH + 3).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: ring, scale: 1.8, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
    this.updateHud();
  }
  floatText(txt, color) {
    const t = this.add.text(this.heroSpr.x, this.heroSpr.y - 64, txt, { fontFamily: 'Georgia, serif', fontSize: '14px', color, stroke: '#000', strokeThickness: 3, resolution: DPR * 2 }).setOrigin(0.5).setDepth(9e8);
    this.tweens.add({ targets: t, y: t.y - 26, alpha: 0, duration: 1100, onComplete: () => t.destroy() });
  }
  updateHud() { Controls.setStats(this.stats); }
}

// ---------- boot ----------
function makeGame() {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#0a080e',
    scale: { mode: Phaser.Scale.NONE, width: Math.round(window.innerWidth * DPR), height: Math.round(window.innerHeight * DPR), zoom: 1 / DPR },
    render: { antialias: true, roundPixels: false },
    input: { activePointers: 2 },
    scene: [BootScene, TitleScene, TownScene]
  });
  let rz;
  const resize = () => { clearTimeout(rz); rz = setTimeout(() => { game.scale.resize(Math.round(window.innerWidth * DPR), Math.round(window.innerHeight * DPR)); game.scale.setZoom(1 / DPR); }, 120); };
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  window.__game = game;
  return game;
}

window.addEventListener('DOMContentLoaded', () => {
  Dialogue.init();
  document.getElementById('btnCloseCredits').addEventListener('click', () => document.getElementById('credits').classList.add('hidden'));
  document.getElementById('btnSound').addEventListener('click', (e) => { e.stopPropagation(); Sound.start(); Sound.toggle(); if (Menu.sync) Menu.sync(); });
  document.getElementById('btnMenu').addEventListener('click', (e) => { e.stopPropagation(); Menu.open(); });
  Controls.init(); Menu.init();
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('touchmove', e => { if (!e.target.closest || !e.target.closest('#credits .panel')) e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', e => e.preventDefault());
  document.addEventListener('gesturestart', e => e.preventDefault());
  makeGame();
});

window.Duskhollow = { CONFIG, Iso, TownMap };
})();
