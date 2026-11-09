// Regras do Cerco, sem navegador: grade de blocos, balística da catapulta, dano, desabamento
// e a partida. Tudo determinístico (o acaso vem só do rng passado de fora), para a IA e o robô
// poderem simular tiros e os testes conferirem.

export const PLAYER = 0, CPU = 1;
export const NX = 11, NY = 10, NZ = 30;
export const EMPTY = 0, WOOD = 1, STONE = 2, ROCK = 3, KING = 4;
export const HP = [0, 1, 2, 999, 1];
export const ROUNDS = 12;          // tiros de cada um antes de decidir pelos blocos de pé
export const BOMBS = 2;            // bombas por partida
export const MAX_OVER = 2;         // quantas casas um bloco aguenta de balanço sem nada embaixo
export const GRAV = 20;            // casas/s²
export const WIND_ACC = 0.6;       // aceleração lateral por ponto de vento
export const YAW_MAX = 0.35;       // mira para os lados (radianos)
export const DT = 1 / 120;
export const ANGLE = Math.PI / 4;  // a catapulta sempre lança a 45°

export const speedFor = (power) => 15 + 12 * Math.min(1, Math.max(0, power));
export const idx = (x, y, z) => x + NX * (y + NY * z);
export const inGrid = (x, y, z) => x >= 0 && x < NX && y >= 0 && y < NY && z >= 0 && z < NZ;
export const solid = (t) => t !== EMPTY;

// Castelo de cada lado: lz = 0 é a frente (virada para o inimigo).
export const castleZ = (side, lz) => (side === PLAYER ? 22 + lz : 7 - lz);
export const sideOfZ = (z) => (z >= 15 ? PLAYER : CPU);
export const inRegion = (side, z) => (side === PLAYER ? z >= 21 && z <= 29 : z >= 0 && z <= 8);
// Catapulta: atrás do próprio castelo (o tiro passa por cima dele; não bate no próprio lado).
export const CATAPULT = [{ x: 5, y: 1.6, z: 29.6 }, { x: 5, y: 1.6, z: 0.4 }];

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// ---------- Grade ----------
export function newGrid() {
  return { t: new Uint8Array(NX * NY * NZ), hp: new Uint8Array(NX * NY * NZ), kings: [null, null] };
}
export function cloneGrid(g) {
  return { t: g.t.slice(), hp: g.hp.slice(), kings: g.kings.map(k => (k ? { ...k } : null)) };
}
export function get(g, x, y, z) { return inGrid(x, y, z) ? g.t[idx(x, y, z)] : EMPTY; }
export function set(g, x, y, z, type) {
  if (!inGrid(x, y, z)) return;
  const i = idx(x, y, z);
  g.t[i] = type; g.hp[i] = HP[type] > 255 ? 255 : HP[type];
}
export function setKing(g, side, x, y, z) {
  set(g, x, y, z, KING);
  g.kings[side] = { x, y, z, down: false, side };
}
export function countBlocks(g, side) {
  let n = 0;
  for (let z = 0; z < NZ; z++) {
    if (!inRegion(side, z)) continue;
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
      const t = g.t[idx(x, y, z)];
      if (t === WOOD || t === STONE) n += g.hp[idx(x, y, z)];
    }
  }
  return n;
}

// Construtor de castelo em coordenadas do lado (x, y, lz).
export function builder(g, side) {
  const Z = (lz) => castleZ(side, lz);
  return {
    box(x0, x1, y0, y1, lz0, lz1, type) {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let lz = lz0; lz <= lz1; lz++) set(g, x, y, Z(lz), type);
      return this;
    },
    clear(x0, x1, y0, y1, lz0, lz1) { return this.box(x0, x1, y0, y1, lz0, lz1, EMPTY); },
    king(x, y, lz) { setKing(g, side, x, y, Z(lz)); return this; },
  };
}

// Castelo padrão das partidas: muralha da frente de pedra embaixo, torres nos cantos, a torre de
// menagem no meio com o rei no alto, cercado de ameias.
export function standardCastle(g, side) {
  const b = builder(g, side);
  b.box(2, 8, 0, 1, 0, 0, STONE).box(2, 8, 2, 3, 0, 0, WOOD);           // muralha da frente
  b.box(2, 2, 0, 1, 1, 5, WOOD).box(8, 8, 0, 1, 1, 5, WOOD);            // laterais
  b.box(3, 7, 0, 1, 5, 5, WOOD);                                        // fundo
  b.box(2, 2, 2, 5, 0, 0, STONE).box(8, 8, 2, 5, 0, 0, STONE);          // torres dos cantos
  // torre de menagem (3 x 3) com o rei escondido no meio, no 3º andar
  b.box(4, 6, 0, 0, 1, 3, STONE).box(4, 6, 1, 1, 1, 3, WOOD);
  b.box(4, 6, 2, 2, 1, 3, WOOD).box(4, 6, 2, 2, 1, 1, STONE);           // frente do andar do rei: pedra
  b.box(4, 6, 3, 3, 1, 3, STONE);                                       // laje de pedra por cima
  b.box(4, 6, 4, 4, 1, 1, WOOD).box(4, 4, 4, 4, 3, 3, WOOD).box(6, 6, 4, 4, 3, 3, WOOD); // ameias
  b.king(5, 2, 2);
  return g;
}

export function matchGrid() {
  const g = newGrid();
  standardCastle(g, PLAYER);
  standardCastle(g, CPU);
  // duas pedras no meio do campo
  set(g, 2, 0, 14, ROCK); set(g, 2, 1, 14, ROCK);
  set(g, 8, 0, 15, ROCK); set(g, 8, 1, 15, ROCK);
  return g;
}

// ---------- Apoio e desabamento ----------
// Nível de balanço de cada bloco: 0 = tem apoio embaixo (ou é o chão, ou é rocha);
// n = está a n casas de lado de um bloco apoiado. Acima de MAX_OVER, cai.
export function supportLevels(g) {
  const N = NX * NY * NZ;
  const lev = new Int8Array(N).fill(99);
  const cells = [];
  for (let i = 0; i < N; i++) if (g.t[i]) cells.push(i);
  for (const i of cells) { const y = Math.floor(i / NX) % NY; if (y === 0 || g.t[i] === ROCK) lev[i] = 0; }
  // relaxa até parar: apoio embaixo = 0; vizinho do lado (ou bloco logo acima, pendurado) = nível dele + 1
  const NB = [1, -1, NX * NY, -NX * NY];
  for (let pass = 0; pass < 60; pass++) {
    let changed = false;
    for (const i of cells) {
      if (lev[i] === 0) continue;
      const x = i % NX, y = Math.floor(i / NX) % NY;
      let best = lev[i];
      const below = i - NX;
      if (y > 0 && g.t[below] && lev[below] <= MAX_OVER) best = 0;
      else {
        for (const d of NB) {
          const j = i + d;
          if (j < 0 || j >= N || !g.t[j]) continue;
          if ((d === 1 && x === NX - 1) || (d === -1 && x === 0)) continue;
          if (lev[j] + 1 < best) best = lev[j] + 1;
        }
        const above = i + NX;
        if (y < NY - 1 && g.t[above] && lev[above] + 1 < best) best = lev[above] + 1;
      }
      if (best !== lev[i]) { lev[i] = best; changed = true; }
    }
    if (!changed) break;
  }
  return lev;
}

// Derruba tudo que ficou sem apoio. Devolve a lista de quedas (para a animação).
export function collapse(g, events = []) {
  for (let pass = 0; pass < 14; pass++) {
    const lev = supportLevels(g);
    const loose = [];
    for (let i = 0; i < g.t.length; i++) if (g.t[i] && lev[i] > MAX_OVER) loose.push(i);
    if (!loose.length) return events;
    const looseSet = new Set(loose);
    const seen = new Set();
    // componentes soltos, do mais baixo para o mais alto
    const comps = [];
    for (const s of loose) {
      if (seen.has(s)) continue;
      const comp = [], st = [s]; seen.add(s);
      while (st.length) {
        const i = st.pop(); comp.push(i);
        const x = i % NX, y = Math.floor(i / NX) % NY, z = Math.floor(i / (NX * NY));
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          const xx = x + dx, yy = y + dy, zz = z + dz;
          if (!inGrid(xx, yy, zz)) continue;
          const j = idx(xx, yy, zz);
          if (looseSet.has(j) && !seen.has(j)) { seen.add(j); st.push(j); }
        }
      }
      comps.push(comp);
    }
    const minY = (c) => Math.min(...c.map(i => Math.floor(i / NX) % NY));
    comps.sort((a, b) => minY(a) - minY(b));
    for (const comp of comps) {
      const cs = new Set(comp);
      let d = 99;
      for (const i of comp) {
        const x = i % NX, y = Math.floor(i / NX) % NY, z = Math.floor(i / (NX * NY));
        let k = 0;
        while (y - k - 1 >= 0) { const j = idx(x, y - k - 1, z); if (g.t[j] && !cs.has(j)) break; k++; }
        d = Math.min(d, k);
      }
      if (d === 0 || d === 99) d = Math.max(1, d === 99 ? 1 : d);
      // tira do lugar e põe d casas abaixo
      const cells = comp.map(i => ({ i, t: g.t[i], hp: g.hp[i], x: i % NX, y: Math.floor(i / NX) % NY, z: Math.floor(i / (NX * NY)) }));
      for (const c of cells) g.t[c.i] = EMPTY;
      const fall = { d, cells: [] };
      for (const c of cells.sort((a, b) => a.y - b.y)) {
        const ny = c.y - d;
        if (ny < 0) continue;
        let t = c.t, hp = c.hp;
        if (t === KING) {
          const k = g.kings.find(kk => kk && !kk.down && kk.x === c.x && kk.y === c.y && kk.z === c.z);
          if (k) { k.down = true; k.y = ny; k.how = 'caiu'; }
          // o rei caído some da grade (vira peça deitada na animação)
          fall.cells.push({ x: c.x, y: c.y, z: c.z, ny, t, broke: true });
          continue;
        }
        let broke = false;
        if (d >= 2) { if (t === WOOD) broke = true; else if (t === STONE) { hp -= 1; if (hp <= 0) broke = true; } }
        const j = idx(c.x, ny, c.z);
        // caiu em cima do rei? esmaga
        if (ny - 1 >= 0) {
          const below = idx(c.x, ny - 1, c.z);
          if (g.t[below] === KING) crushKing(g, below);
        }
        fall.cells.push({ x: c.x, y: c.y, z: c.z, ny, t, broke });
        if (!broke) { g.t[j] = t; g.hp[j] = hp; }
      }
      events.push({ kind: 'fall', ...fall });
    }
  }
  // não estabilizou (não deve acontecer): tira o que sobrou solto
  const lev = supportLevels(g);
  for (let i = 0; i < g.t.length; i++) if (g.t[i] && lev[i] > MAX_OVER) g.t[i] = EMPTY;
  return events;
}
function crushKing(g, i) {
  const x = i % NX, y = Math.floor(i / NX) % NY, z = Math.floor(i / (NX * NY));
  const k = g.kings.find(kk => kk && !kk.down && kk.x === x && kk.y === y && kk.z === z);
  if (k) { k.down = true; k.how = 'esmagado'; }
  g.t[i] = EMPTY;
}

function damage(g, i, dmg, hits) {
  const t = g.t[i];
  if (!t || t === ROCK) return 0;
  const before = g.hp[i];
  const x = i % NX, y = Math.floor(i / NX) % NY, z = Math.floor(i / (NX * NY));
  if (t === KING) {
    const k = g.kings.find(kk => kk && !kk.down && kk.x === x && kk.y === y && kk.z === z);
    if (k) { k.down = true; k.how = 'atingido'; }
    g.t[i] = EMPTY;
    hits.push({ x, y, z, t, destroyed: true });
    return Math.max(0, dmg - 1);
  }
  const hp = before - dmg;
  // a pedra segura o golpe: só a madeira deixa o tiro passar adiante
  if (hp <= 0) { g.t[i] = EMPTY; g.hp[i] = 0; hits.push({ x, y, z, t, destroyed: true }); return t === WOOD ? dmg - before : 0; }
  g.hp[i] = hp;
  hits.push({ x, y, z, t, destroyed: false });
  return 0;
}

// ---------- Tiro ----------
// shot = { yaw, power, ammo: 'stone' | 'bomb' }. Muda a grade e devolve o que aconteceu.
export function launchVelocity(side, yaw, power) {
  const v = speedFor(power);
  const h = v * Math.cos(ANGLE), vy = v * Math.sin(ANGLE);
  const dirZ = side === PLAYER ? -1 : 1;
  return { vx: h * Math.sin(yaw) * (side === PLAYER ? 1 : -1), vy, vz: dirZ * h * Math.cos(yaw) };
}

export function fire(g, side, shot, wind, { keepPath = true } = {}) {
  const c = CATAPULT[side];
  const v = launchVelocity(side, Math.max(-YAW_MAX, Math.min(YAW_MAX, shot.yaw)), shot.power);
  let x = c.x + 0.5, y = c.y, z = c.z;
  let { vx, vy, vz } = v;
  const ax = wind * WIND_ACC;
  const path = keepPath ? [[x, y, z]] : null;
  const hits = [];
  let left = shot.ammo === 'bomb' ? 1 : 2;   // a pedra tem 2 de força: atravessa madeira
  let impact = null, t = 0;
  let lastCell = -1;
  while (t < 6) {
    vx += ax * DT; vy -= GRAV * DT;
    x += vx * DT; y += vy * DT; z += vz * DT; t += DT;
    if (keepPath) path.push([x, y, z]);
    if (y < 0) { impact = impact || { x, y: 0, z, ground: true }; break; }
    if (x < -4 || x > NX + 4 || z < -4 || z > NZ + 4) { impact = impact || { x, y, z, out: true }; break; }
    const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
    if (!inGrid(cx, cy, cz)) continue;
    if (inRegion(side, cz)) continue;
    const i = idx(cx, cy, cz);
    if (i === lastCell) continue;
    const ty = g.t[i];
    if (!ty) continue;
    lastCell = i;
    if (!impact) impact = { x, y, z, cell: [cx, cy, cz] };
    if (shot.ammo === 'bomb') { explode(g, cx, cy, cz, hits); left = 0; break; }
    if (ty === ROCK) { left = 0; break; }
    left = damage(g, i, left, hits);
    if (left <= 0) break;
  }
  if (shot.ammo === 'bomb' && impact && impact.ground && !hits.length) {
    // bomba no chão: explode também (pega a base do que estiver perto)
    const cx = Math.floor(impact.x), cz = Math.floor(impact.z);
    if (inGrid(cx, 0, cz)) explode(g, cx, 0, cz, hits);
  }
  const falls = collapse(g, []);
  if (keepPath) {
    // corta o caminho no ponto de impacto (o resto é só o que a pedra faria depois)
    const end = Math.max(1, path.length - 1);
    path.length = end + 1;
  }
  return { path, hits, falls, impact, time: t, kings: g.kings.map(k => (k ? k.down : false)) };
}

function explode(g, cx, cy, cz, hits) {
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    const x = cx + dx, y = cy + dy, z = cz + dz;
    if (!inGrid(x, y, z)) continue;
    const i = idx(x, y, z);
    if (!g.t[i] || g.t[i] === KING) continue;   // o rei se abaixa: a bomba só tira a proteção
    const far = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
    if (far > 1) continue;                      // só o bloco atingido e os 6 encostados nele
    damage(g, i, far === 0 ? 2 : 1, hits);
  }
}

// Onde o tiro cairia se não batesse em nada (para a prévia curta da mira e para a IA).
export function previewPath(side, shot, wind, frac = 1) {
  const g = newGrid();
  const r = fire(g, side, { ...shot, ammo: 'stone' }, wind);
  const n = Math.max(2, Math.floor(r.path.length * frac));
  return r.path.slice(0, n);
}

// ---------- Conserto ----------
export function canPlace(g, side, x, y, z) {
  if (!inGrid(x, y, z) || !inRegion(side, z)) return false;
  if (y >= NY - 2) return false;
  if (g.t[idx(x, y, z)]) return false;
  if (y === 0) return true;
  const below = g.t[idx(x, y - 1, z)];
  return below !== EMPTY && below !== KING;
}
export function place(g, side, x, y, z) {
  if (!canPlace(g, side, x, y, z)) return false;
  set(g, x, y, z, WOOD);
  return true;
}
export function placeSpots(g, side) {
  const out = [];
  for (let z = 0; z < NZ; z++) {
    if (!inRegion(side, z)) continue;
    for (let x = 0; x < NX; x++) for (let y = 0; y < NY - 2; y++) if (canPlace(g, side, x, y, z)) { out.push([x, y, z]); break; }
  }
  return out;
}

// ---------- Partida ----------
export class Match {
  constructor({ starter = PLAYER, random = Math.random } = {}) {
    this.g = matchGrid();
    this.random = random;
    this.turn = starter;
    this.starter = starter;
    this.shots = [0, 0];
    this.bombs = [BOMBS, BOMBS];
    this.phase = 'aim';      // 'aim' | 'repair' | 'over'
    this.winner = null;
    this.endReason = null;
    this.log = [];
    this.wind = this.rollWind();
  }
  rollWind() { return Math.round((this.random() * 2 - 1) * 3); }
  get over() { return this.phase === 'over'; }
  fire(shot) {
    if (this.phase !== 'aim') return null;
    const side = this.turn;
    if (shot.ammo === 'bomb') { if (this.bombs[side] <= 0) shot = { ...shot, ammo: 'stone' }; else this.bombs[side]--; }
    const r = fire(this.g, side, shot, this.wind);
    this.shots[side]++;
    this.log.push({ side, shot, wind: this.wind, hits: r.hits.length });
    if (this.checkOver()) return r;
    this.phase = 'repair';
    return r;
  }
  checkOver() {
    const [k0, k1] = this.g.kings;
    if (k0.down || k1.down) {
      this.phase = 'over';
      this.winner = k0.down && k1.down ? this.turn : (k1.down ? PLAYER : CPU);
      this.endReason = 'rei';
      return true;
    }
    return false;
  }
  repair(spot) {
    if (this.phase !== 'repair') return false;
    if (spot && !place(this.g, this.turn, ...spot)) return false;
    // conserto pode ter apoiado algo; nada cai, mas confere mesmo assim
    collapse(this.g, []);
    if (this.checkOver()) return true;
    this.next();
    return true;
  }
  next() {
    if (this.shots[0] >= ROUNDS && this.shots[1] >= ROUNDS) {
      this.phase = 'over';
      const a = countBlocks(this.g, PLAYER), b = countBlocks(this.g, CPU);
      this.winner = a > b ? PLAYER : b > a ? CPU : null;
      this.endReason = 'blocos';
      return;
    }
    this.turn = 1 - this.turn;
    this.wind = this.rollWind();
    this.phase = 'aim';
  }
}
