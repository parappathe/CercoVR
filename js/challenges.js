// Desafios: um alvo montado do outro lado, sem adversário atirando de volta. Derrubar o rei com
// o menor número de tiros. O vento de cada tiro é fixo (lista que se repete).
import { PLAYER, CPU, WOOD, STONE, ROCK, newGrid, builder, standardCastle, set, fire, cloneGrid } from './rules.js';
import { bestShot, topShots, evaluate } from './ai.js';

export const CHALLENGES = [
  {
    name: 'Primeiro tiro', desc: 'O rei está num palanque de madeira, sem proteção. Acerte em cheio.',
    wind: [0], bombs: 0, par: [1, 2, 5],
    build: (b) => b.box(4, 6, 0, 0, 1, 2, WOOD).king(5, 1, 1),
  },
  {
    name: 'Muralha', desc: 'Uma muralha de madeira na frente. A pedra atravessa madeira.',
    wind: [0], bombs: 0, par: [1, 3, 6],
    build: (b) => b.box(2, 8, 0, 2, 0, 0, WOOD).box(4, 6, 0, 0, 2, 3, WOOD).king(5, 1, 2),
  },
  {
    name: 'Vento de lado', desc: 'Vento forte para a direita. Mire contra ele.',
    wind: [3], bombs: 0, par: [1, 3, 6],
    build: (b) => b.box(3, 7, 0, 0, 1, 2, WOOD).box(3, 3, 1, 1, 1, 2, WOOD).box(7, 7, 1, 1, 1, 2, WOOD).king(5, 1, 1),
  },
  {
    name: 'Torre alta', desc: 'O rei mora no alto de uma torre fina. Ele cai junto com ela.',
    wind: [1], bombs: 0, par: [1, 3, 6],
    build: (b) => b.box(5, 5, 0, 4, 2, 2, WOOD).box(4, 6, 0, 0, 0, 0, STONE).king(5, 5, 2),
  },
  {
    name: 'Pedra dura', desc: 'Casinha de pedra: a pedra para o tiro. Você tem 2 bombas.',
    wind: [0, 1], bombs: 2, par: [3, 5, 8],
    build: (b) => b.box(4, 6, 0, 2, 1, 3, STONE).clear(5, 5, 1, 1, 2, 2).king(5, 1, 2).box(4, 6, 0, 0, 2, 2, STONE),
  },
  {
    name: 'Atrás do morro', desc: 'Um paredão de rocha no meio do campo. Passe por cima.',
    wind: [-1], bombs: 0, par: [2, 4, 7],
    build: (b, g) => { for (let x = 1; x <= 9; x++) for (let y = 0; y <= 2; y++) set(g, x, y, 11, ROCK); b.box(3, 7, 0, 1, 0, 0, WOOD).king(5, 0, 2); },
  },
  {
    name: 'A ponte', desc: 'O rei está numa ponte entre dois pilares. Sem pilar, a ponte cai.',
    wind: [0, -1], bombs: 0, par: [1, 3, 6],
    build: (b) => b.box(2, 2, 0, 3, 2, 2, WOOD).box(8, 8, 0, 3, 2, 2, WOOD).box(2, 8, 4, 4, 2, 2, WOOD).box(3, 7, 0, 1, 0, 0, STONE).king(5, 5, 2),
  },
  {
    name: 'Vento que vira', desc: 'O vento troca de lado a cada tiro.',
    wind: [3, -3, 2, -2], bombs: 0, par: [2, 4, 7],
    build: (b) => b.box(3, 7, 0, 1, 0, 0, WOOD).box(4, 6, 0, 1, 2, 3, WOOD).box(4, 6, 2, 2, 2, 3, STONE).clear(5, 5, 1, 1, 2, 2).king(5, 1, 2),
  },
  {
    name: 'Duas camadas', desc: 'Pedra por fora, madeira por dentro. Uma bomba ajuda.',
    wind: [1, 0, -1], bombs: 1, par: [3, 5, 8],
    build: (b) => b.box(3, 7, 0, 2, 0, 0, STONE).box(3, 7, 0, 2, 1, 1, WOOD).box(4, 6, 0, 1, 2, 3, WOOD).box(4, 6, 2, 2, 2, 3, STONE).clear(5, 5, 1, 1, 2, 2).king(5, 1, 2),
  },
  {
    name: 'A fortaleza', desc: 'O castelo inteiro, com vento. Duas bombas.',
    wind: [2, -1, 0, 1, -2, 0], bombs: 2, par: [6, 8, 12],
    build: (b, g) => standardCastle(g, CPU),
  },
];

export function setupChallenge(c) {
  const g = newGrid();
  standardCastle(g, PLAYER);
  c.build(builder(g, CPU), g);
  return { g, shots: 0, bombs: c.bombs, done: false, maxShots: c.par[2], get wind() { return c.wind[this.shots % c.wind.length]; } };
}
export function fireChallenge(c, st, shot) {
  if (st.done) return null;
  if (shot.ammo === 'bomb') { if (st.bombs <= 0) shot = { ...shot, ammo: 'stone' }; else st.bombs--; }
  const w = c.wind[st.shots % c.wind.length];
  const r = fire(st.g, PLAYER, shot, w);
  st.shots++;
  if (st.g.kings[CPU].down || st.shots >= c.par[2]) st.done = true;
  return r;
}
export const won = (st) => st.g.kings[CPU].down;
export function starsFor(c, st) {
  if (!won(st)) return 0;
  return st.shots <= c.par[0] ? 3 : st.shots <= c.par[1] ? 2 : 1;
}
export const goalText = (c) => `3 estrelas: até ${c.par[0]} tiro${c.par[0] > 1 ? 's' : ''} · 2: até ${c.par[1]} · 1: até ${c.par[2]}`;

// Tiro do robô no desafio (o mesmo cálculo da IA, sem errar).
// Olha dois tiros à frente: entre os melhores primeiros tiros, fica com o que deixa o melhor segundo.
export function robotShot(c, st) {
  const w = c.wind[st.shots % c.wind.length], w2 = c.wind[(st.shots + 1) % c.wind.length];
  const first = bestShot(st.g, PLAYER, w, { search: 'fine', bombs: st.bombs, bombBias: 4 });
  if (first.score >= 10000) return first.shot;
  let best = null;
  for (const cand of topShots(st.g, PLAYER, w, st.bombs, 8)) {
    const g2 = cloneGrid(st.g);
    fire(g2, PLAYER, cand.shot, w, { keepPath: false });
    if (g2.kings[CPU].down) return cand.shot;
    const left = st.bombs - (cand.shot.ammo === 'bomb' ? 1 : 0);
    const second = bestShot(g2, PLAYER, w2, { search: 'coarse', bombs: left, bombBias: 4 });
    const v = second.score + cand.score * 0.01;
    if (!best || v > best.v) best = { v, shot: cand.shot };
  }
  return best && best.v >= 10000 ? best.shot : first.shot;
}
// Resolve o desafio inteiro (para os testes e o dev.win()).
export function solve(c) {
  const st = setupChallenge(c);
  const shots = [];
  while (!st.done) { const s = robotShot(c, st); shots.push(s); fireChallenge(c, st, s); }
  return { st, shots, stars: starsFor(c, st) };
}
export { cloneGrid };
