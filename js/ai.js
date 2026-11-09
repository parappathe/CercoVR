// Adversários do Cerco. A IA mira simulando tiros na cópia da grade (como quem calcula de cabeça)
// e depois erra um pouco, conforme o estilo. Tudo no Cerco está à vista, então não há trapaça
// possível: ela só não sabe o vento do próximo turno.
import { PLAYER, CPU, KING, WOOD, STONE, ROCK, NX, NY, NZ, YAW_MAX, cloneGrid, fire, idx, inGrid, placeSpots, canPlace, castleZ } from './rules.js';

export const OPPONENTS = [
  {
    name: 'Barão Bonachão', title: 'o distraído',
    desc: 'Mira no olho e erra bastante. Conserta onde der.',
    color: 0x3a7ab8, yawNoise: 0.05, powNoise: 0.06, search: 'coarse', bombBias: 30, repair: 'random', think: 1.2,
  },
  {
    name: 'Duquesa Pólvora', title: 'a explosiva',
    desc: 'Ama bomba: gasta logo e mira na base da torre.',
    color: 0xb83a3a, yawNoise: 0.024, powNoise: 0.03, search: 'coarse', bombBias: -5, repair: 'front', think: 1.3,
  },
  {
    name: 'Mestre Arquimedes', title: 'o engenheiro',
    desc: 'Calcula o tiro, guarda a bomba e tapa o buraco certo.',
    color: 0x6a4ab0, yawNoise: 0.018, powNoise: 0.022, search: 'fine', bombBias: 12, repair: 'smart', think: 1.6,
  },
];
// O robô dos testes: o mesmo cálculo, sem errar.
export const ROBOT = { name: 'Robô', yawNoise: 0, powNoise: 0, search: 'fine', bombBias: 8, repair: 'smart', think: 0.4 };

// O quanto o rei do lado `target` está protegido: blocos perto dele pesam mais.
export function shield(g, target) {
  const k = g.kings[target];
  if (!k || k.down) return 0;
  let s = 0;
  for (let dz = -2; dz <= 2; dz++) for (let dy = -4; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = k.x + dx, y = k.y + dy, z = k.z + dz;
    if (!inGrid(x, y, z)) continue;
    const t = g.t[idx(x, y, z)];
    if (!t || t === KING) continue;
    const d = Math.max(Math.abs(dx), Math.abs(dz), dy > 0 ? dy : Math.abs(dy) * 0.6);
    s += (t === STONE ? 1.4 : 1) * g.hp[idx(x, y, z)] * (3 / (1 + d));
  }
  return s;
}

// Valor de um tiro para quem atira (side).
export function evaluate(g, side, shot, wind) {
  const target = 1 - side;
  const gg = cloneGrid(g);
  const before = shield(gg, target);
  const r = fire(gg, side, shot, wind, { keepPath: false });
  if (gg.kings[target].down) return { score: 10000, r };
  if (gg.kings[side].down) return { score: -10000, r };
  const k = gg.kings[target];
  let score = (before - shield(gg, target)) * 4 + r.hits.filter(h => h.destroyed).length * 0.5;
  score += (g.kings[target].y - k.y) * 2;   // rei desceu (a torre afundou)
  if (!r.hits.length && r.impact) {
    const dx = r.impact.x - (k.x + 0.5), dz = r.impact.z - (k.z + 0.5);
    score -= Math.hypot(dx, dz) * 0.3;
  }
  return { score, r };
}

function grid(yawStep, powStep, yawC = 0, yawR = YAW_MAX, powC = 0.5, powR = 0.5) {
  const out = [];
  for (let y = yawC - yawR; y <= yawC + yawR + 1e-9; y += yawStep) for (let p = powC - powR; p <= powC + powR + 1e-9; p += powStep) {
    if (Math.abs(y) > YAW_MAX || p < 0 || p > 1) continue;
    out.push({ yaw: +y.toFixed(4), power: +p.toFixed(4) });
  }
  return out;
}

// Melhor tiro sem erro. Devolve { shot, score }.
export function bestShot(g, side, wind, { search = 'fine', bombs = 0, bombBias = 10 } = {}) {
  const coarse = grid(0.05, 0.05);
  const scored = coarse.map(s => ({ s, v: evaluate(g, side, { ...s, ammo: 'stone' }, wind).score }));
  scored.sort((a, b) => b.v - a.v);
  let best = { shot: { ...scored[0].s, ammo: 'stone' }, score: scored[0].v };
  const refine = search === 'fine' ? 4 : 2;
  for (const c of scored.slice(0, refine)) {
    for (const s of grid(0.0125, 0.0125, c.s.yaw, 0.025, c.s.power, 0.025)) {
      const v = evaluate(g, side, { ...s, ammo: 'stone' }, wind).score;
      if (v > best.score) best = { shot: { ...s, ammo: 'stone' }, score: v };
    }
  }
  // tiro "do meio" de uma janela boa: menos sensível ao erro de mira
  if (best.score >= 10000) best.shot = centerOfWindow(g, side, wind, best.shot);
  if (bombs > 0 && best.score < 10000) {
    let bb = null;
    for (const c of scored.slice(0, 6)) {
      for (const s of grid(0.025, 0.025, c.s.yaw, 0.05, c.s.power, 0.05)) {
        const v = evaluate(g, side, { ...s, ammo: 'bomb' }, wind).score;
        if (!bb || v > bb.score) bb = { shot: { ...s, ammo: 'bomb' }, score: v };
      }
    }
    if (bb && bb.score > best.score + bombBias) best = bb;
  }
  return best;
}
// Os melhores tiros (pedra e bomba) da grade grossa, já refinados um pouco.
export function topShots(g, side, wind, bombs, n = 8) {
  const out = [];
  for (const ammo of bombs > 0 ? ['stone', 'bomb'] : ['stone']) {
    for (const s of grid(0.05, 0.05)) out.push({ shot: { ...s, ammo }, score: evaluate(g, side, { ...s, ammo }, wind).score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, n);
}
// Entre os tiros que acertam o rei, escolhe o do meio da faixa de força (mais seguro).
function centerOfWindow(g, side, wind, shot) {
  const ok = [];
  for (let dp = -0.06; dp <= 0.06 + 1e-9; dp += 0.01) {
    const s = { ...shot, power: shot.power + dp };
    if (s.power < 0 || s.power > 1) continue;
    if (evaluate(g, side, s, wind).score >= 10000) ok.push(s.power);
  }
  if (!ok.length) return shot;
  return { ...shot, power: (Math.min(...ok) + Math.max(...ok)) / 2 };
}

// Decide o tiro da vez (com o erro do estilo).
export function chooseShot(match, side, style, random = Math.random) {
  const best = bestShot(match.g, side, match.wind, { search: style.search, bombs: match.bombs[side], bombBias: style.bombBias });
  const n = () => (random() + random() + random() - 1.5) / 1.5;   // erro em sino, -1..1
  const shot = {
    yaw: Math.max(-YAW_MAX, Math.min(YAW_MAX, best.shot.yaw + n() * style.yawNoise)),
    power: Math.max(0, Math.min(1, best.shot.power + n() * style.powNoise)),
    ammo: best.shot.ammo,
  };
  return { shot, aimed: best.shot, score: best.score };
}

// Conserto: onde pôr o bloco de madeira.
export function chooseRepair(match, side, style, random = Math.random) {
  const g = match.g;
  const spots = placeSpots(g, side);
  if (!spots.length) return null;
  const k = g.kings[side];
  const near = spots.filter(([x, y, z]) => Math.abs(x - k.x) <= 2 && Math.abs(z - k.z) <= 3);
  if (style.repair === 'random') return (near.length ? near : spots)[Math.floor(random() * (near.length ? near.length : spots.length))];
  if (style.repair === 'front') {
    // levanta a frente da torre do rei
    const front = castleZ(side, 0);
    const fs = spots.filter(([x, , z]) => Math.abs(x - k.x) <= 1 && Math.abs(z - front) <= 1);
    const list = fs.length ? fs : near.length ? near : spots;
    list.sort((a, b) => b[1] - a[1]);
    return list[0];
  }
  // smart: põe onde mais aumenta a proteção (conta a pedra no telhado e na frente)
  let best = null, bv = -1e9;
  const before = shield(g, side);
  for (const s of (near.length ? near : spots)) {
    const gg = cloneGrid(g);
    gg.t[idx(...s)] = WOOD; gg.hp[idx(...s)] = 1;
    const v = shield(gg, side) - before + s[1] * 0.3 + (Math.abs(s[2] - castleZ(side, 0)) < Math.abs(k.z - castleZ(side, 0)) ? 0.8 : 0);
    if (v > bv) { bv = v; best = s; }
  }
  return best;
}

export { canPlace };
