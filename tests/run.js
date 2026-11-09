// Testes do Cerco (node tests/run.js): regras, IA, IA contra IA, robô nos desafios e fumaça do jogo.
// Não toca som. Sai com código 1 se algo falhar (ou se passar de 200 s).
import * as R from '../js/rules.js';
import * as A from '../js/ai.js';
import * as C from '../js/challenges.js';

const T0 = Date.now();
const killer = setTimeout(() => { console.error('Demorou demais (200 s): abortado.'); process.exit(1); }, 200000);
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ok  ', m); } else { fails++; console.log('  FALHOU', m); } };
const { PLAYER, CPU, WOOD, STONE, ROCK, KING } = R;

console.log('Regras');
{
  const g = R.matchGrid();
  ok(R.countBlocks(g, PLAYER) === R.countBlocks(g, CPU) && R.countBlocks(g, PLAYER) > 100, `castelos iguais dos dois lados (${R.countBlocks(g, PLAYER)} pontos de bloco)`);
  const lev = R.supportLevels(g);
  ok(![...g.t].some((t, i) => t && lev[i] > R.MAX_OVER), 'castelo padrão fica de pé sozinho');
  ok(g.kings.every(k => k && !k.down), 'dois reis de pé');
  // tiro determinístico
  const a = R.cloneGrid(g), b = R.cloneGrid(g);
  const ra = R.fire(a, PLAYER, { yaw: 0.05, power: 0.6, ammo: 'stone' }, 2), rb = R.fire(b, PLAYER, { yaw: 0.05, power: 0.6, ammo: 'stone' }, 2);
  ok(JSON.stringify(ra.hits) === JSON.stringify(rb.hits) && a.t.every((v, i) => v === b.t[i]), 'mesmo tiro, mesmo resultado');
  // vento empurra para o lado
  const p0 = R.previewPath(PLAYER, { yaw: 0, power: 0.5 }, 0), p3 = R.previewPath(PLAYER, { yaw: 0, power: 0.5 }, 3);
  ok(p3[p3.length - 1][0] > p0[p0.length - 1][0] + 1, `vento 3 leva a pedra para a direita (${p0.at(-1)[0].toFixed(1)} -> ${p3.at(-1)[0].toFixed(1)})`);
  const pf = R.previewPath(PLAYER, { yaw: 0, power: 1 }, 0);
  ok(pf.at(-1)[2] < p0.at(-1)[2], 'mais força vai mais longe');
  const pc = R.previewPath(CPU, { yaw: 0, power: 0.5 }, 0);
  ok(pc.at(-1)[2] > pc[0][2], 'a catapulta do computador atira no sentido contrário');
  // não bate no próprio castelo
  const own = R.cloneGrid(g);
  const ro = R.fire(own, PLAYER, { yaw: 0, power: 0.0, ammo: 'stone' }, 0);
  ok(!ro.hits.some(h => R.inRegion(PLAYER, h.z)), 'o tiro passa por cima do próprio castelo');
}
{
  // madeira deixa passar, pedra segura
  const g = R.newGrid();
  R.set(g, 5, 2, 10, WOOD); R.set(g, 5, 2, 9, WOOD);
  const lane = R.newGrid();
  const path = R.previewPath(PLAYER, { yaw: 0, power: 0.3 }, 0);
  // acha a casa onde esse tiro passa a ~altura 2 e põe 2 madeiras em fila nela
  let cell = null;
  for (const [x, y, z] of path) if (y < 2.6 && y > 1.2 && z < 20) { cell = [Math.floor(x), Math.floor(y), Math.floor(z)]; break; }
  ok(!!cell, 'achou a casa por onde o tiro passa');
  const w = R.newGrid();
  R.set(w, cell[0], cell[1], cell[2], WOOD); R.set(w, cell[0], cell[1], cell[2] - 1, WOOD); R.set(w, cell[0], cell[1] - 1, cell[2] - 1, WOOD);
  for (let y = 0; y < cell[1] - 1; y++) { R.set(w, cell[0], y, cell[2], STONE); R.set(w, cell[0], y, cell[2] - 1, STONE); }
  const rw = R.fire(w, PLAYER, { yaw: 0, power: 0.3, ammo: 'stone' }, 0);
  ok(rw.hits.filter(h => h.destroyed && h.t === WOOD).length >= 2, `pedra atravessa duas madeiras (${rw.hits.length} batidas)`);
  const s = R.newGrid();
  R.set(s, cell[0], cell[1], cell[2], STONE); R.set(s, cell[0], cell[1], cell[2] - 1, WOOD);
  for (let y = 0; y < cell[1]; y++) { R.set(s, cell[0], y, cell[2], STONE); R.set(s, cell[0], y, cell[2] - 1, STONE); }
  const rs = R.fire(s, PLAYER, { yaw: 0, power: 0.3, ammo: 'stone' }, 0);
  ok(rs.hits.length === 1 && rs.hits[0].t === STONE && rs.hits[0].destroyed, 'pedra quebra um bloco de pedra e para nele');
  const s2 = R.newGrid();
  for (let y = 0; y <= cell[1]; y++) R.set(s2, cell[0], y, cell[2], STONE);
  R.fire(s2, PLAYER, { yaw: 0, power: 0.3, ammo: 'bomb' }, 0);
  ok(R.get(s2, cell[0], cell[1], cell[2]) === 0, 'bomba quebra a pedra');
}
{
  // bomba: só o bloco atingido e os 6 encostados (7 no máximo); rei não morre de explosão
  const pth = R.previewPath(PLAYER, { yaw: 0, power: 0.55 }, 0);
  const [ex, , ez] = pth.at(-1);
  const g = R.newGrid();
  const cx = Math.floor(ex), cz = Math.floor(ez);
  for (let x = cx - 2; x <= cx + 2; x++) for (let y = 0; y <= 3; y++) for (let z = cz - 2; z <= cz + 2; z++) R.set(g, x, y, z, WOOD);
  const r = R.fire(g, PLAYER, { yaw: 0, power: 0.55, ammo: 'bomb' }, 0);
  ok(r.hits.length > 1 && r.hits.length <= 7, `bomba pega no máximo 7 blocos (pegou ${r.hits.length})`);
}
{
  // desabamento: pilar quebrado derruba a ponte e o rei em cima
  const g = R.newGrid();
  for (let y = 0; y <= 3; y++) { R.set(g, 2, y, 5, WOOD); R.set(g, 8, y, 5, WOOD); }
  for (let x = 2; x <= 8; x++) R.set(g, x, 4, 5, WOOD);
  R.setKing(g, CPU, 5, 5, 5);
  let lev = R.supportLevels(g);
  ok(lev[R.idx(5, 4, 5)] === 3 - 0 || lev[R.idx(5, 4, 5)] <= 3, 'meio da ponte longe dos pilares');
  // ponte de 7 com pilares nas pontas: o meio está a 3 casas -> cai sozinha?
  const ev0 = R.collapse(R.cloneGrid(g));
  ok(ev0.length > 0, 'vão de 7 casas com pilar só nas pontas não se segura (máximo 2 de balanço)');
  // ponte curta: aguenta
  const h = R.newGrid();
  for (let y = 0; y <= 3; y++) { R.set(h, 3, y, 5, WOOD); R.set(h, 7, y, 5, WOOD); }
  for (let x = 3; x <= 7; x++) R.set(h, x, 4, 5, WOOD);
  R.setKing(h, CPU, 4, 5, 5);
  ok(R.collapse(h).length === 0, 'vão de 5 casas (2 de cada lado) se segura');
  for (let y = 0; y <= 3; y++) h.t[R.idx(3, y, 5)] = 0;
  const ev = R.collapse(h);
  ok(ev.length > 0 && h.kings[CPU].down, 'sem um pilar, a ponte desaba e o rei cai');
  // bloco caindo de 2+ quebra a madeira
  const k = R.newGrid();
  R.set(k, 4, 0, 4, STONE); R.set(k, 4, 1, 4, STONE); R.set(k, 4, 2, 4, WOOD); R.set(k, 5, 2, 4, WOOD);
  k.t[R.idx(4, 0, 4)] = 0; k.t[R.idx(4, 1, 4)] = 0;
  R.collapse(k);
  ok([...k.t].filter(Boolean).length === 0, 'madeira que cai 2 casas se quebra');
  // esmagar o rei
  const m = R.newGrid();
  R.setKing(m, CPU, 5, 0, 5);
  R.set(m, 4, 0, 5, WOOD); R.set(m, 4, 1, 5, WOOD); R.set(m, 5, 2, 5, WOOD); R.set(m, 4, 2, 5, WOOD);
  m.t[R.idx(4, 0, 5)] = 0;
  R.collapse(m);
  ok(m.kings[CPU].down, 'bloco que cai em cima do rei derruba o rei');
}
{
  // conserto
  const g = R.matchGrid();
  ok(R.canPlace(g, PLAYER, 0, 0, 24) && !R.canPlace(g, PLAYER, 0, 1, 24), 'conserto: só em cima de algo ou no chão');
  ok(!R.canPlace(g, PLAYER, 0, 0, 3), 'conserto: não pode no castelo do outro');
  ok(R.placeSpots(g, PLAYER).length > 20, 'há lugares para consertar');
  // partida: tiro -> conserto -> vez do outro, vento muda
  const m = new R.Match({ starter: PLAYER, random: R.rng(5) });
  m.fire({ yaw: 0, power: 0.5, ammo: 'stone' });
  ok(m.phase === 'repair' && m.turn === PLAYER, 'depois do tiro vem o conserto');
  ok(!m.repair([0, 3, 0]) && m.phase === 'repair', 'conserto em lugar inválido é recusado');
  m.repair([0, 0, 24]);
  ok(m.turn === CPU && m.phase === 'aim' && R.get(m.g, 0, 0, 24) === WOOD, 'bloco posto e vez do computador');
  m.fire({ yaw: 0, power: 0.5, ammo: 'bomb' });
  ok(m.bombs[CPU] === R.BOMBS - 1, 'bomba gasta');
  // fim por tiros: ganha quem tem mais bloco
  const n = new R.Match({ starter: PLAYER, random: R.rng(7) });
  while (!n.over) { n.fire({ yaw: 0.35, power: 0, ammo: 'stone' }); if (!n.over) n.repair(n.turn === PLAYER ? R.placeSpots(n.g, PLAYER)[0] : null); }
  ok(n.endReason === 'blocos' && n.winner === PLAYER && n.shots[0] === R.ROUNDS, `acabaram os ${R.ROUNDS} tiros: quem consertou mais ganha`);
}

console.log('IA');
{
  const m = new R.Match({ starter: CPU, random: R.rng(3) });
  for (const o of A.OPPONENTS) {
    const t = Date.now();
    const c = A.chooseShot(m, CPU, o, R.rng(1));
    const dt = Date.now() - t;
    ok(c.shot.power >= 0 && c.shot.power <= 1 && Math.abs(c.shot.yaw) <= R.YAW_MAX && dt < 100, `${o.name}: tiro válido em ${dt} ms`);
  }
  const best = A.bestShot(m.g, CPU, m.wind, { bombs: 0 });
  ok(best.score > 0, `a mira sem erro acerta o castelo (valor ${best.score.toFixed(1)})`);
  const sp = A.chooseRepair({ g: m.g }, CPU, A.OPPONENTS[2], R.rng(2));
  ok(sp && R.canPlace(m.g, CPU, ...sp), 'conserto da IA em lugar válido');
  // erro da mira: Barão erra mais que Arquimedes
  const spread = (o) => { let s = 0; for (let k = 0; k < 30; k++) { const c = A.chooseShot(m, CPU, o, R.rng(k + 1)); s += Math.abs(c.shot.yaw - c.aimed.yaw) + Math.abs(c.shot.power - c.aimed.power); } return s / 30; };
  const sb = spread(A.OPPONENTS[0]), sa = spread(A.OPPONENTS[2]);
  ok(sb > sa * 1.8, `Barão erra mais a mira que Arquimedes (${sb.toFixed(3)} x ${sa.toFixed(3)})`);
  // ninguém derruba o rei com um tiro só no começo
  let one = 0;
  for (let y = -15; y <= 15; y++) for (let p = 0; p <= 100; p += 2) { const g = R.cloneGrid(m.g); const r = R.fire(g, PLAYER, { yaw: y * 0.02, power: p / 100, ammo: 'stone' }, 0, { keepPath: false }); if (r.kings[CPU]) one++; }
  ok(one === 0, 'castelo inteiro: nenhuma pedrada derruba o rei de primeira');
}

console.log('IA contra IA');
function duel(a, b, seed) {
  const rnd = R.rng(seed);
  const m = new R.Match({ starter: seed % 2, random: rnd });
  const S = [A.OPPONENTS[a], A.OPPONENTS[b]];
  while (!m.over) { const c = A.chooseShot(m, m.turn, S[m.turn], rnd); m.fire(c.shot); if (!m.over) m.repair(A.chooseRepair(m, m.turn, S[m.turn], rnd)); }
  return m;
}
for (const [a, b] of [[2, 0], [2, 1], [1, 0]]) {
  const w = [0, 0, 0]; let shots = 0;
  const N = 12;
  for (let s = 1; s <= N; s++) { const m = duel(a, b, s * 7 + a); w[m.winner == null ? 2 : m.winner]++; shots += m.shots[0] + m.shots[1]; }
  ok(w[0] > w[1], `${A.OPPONENTS[a].name} ganha mais que perde de ${A.OPPONENTS[b].name} (${w[0]} x ${w[1]}, ${w[2]} empates, ${(shots / N).toFixed(1)} tiros por partida)`);
}

console.log('Desafios (robô)');
for (const [i, c] of C.CHALLENGES.entries()) {
  const r = C.solve(c);
  ok(r.stars === 3, `${i + 1}. ${c.name}: robô tira 3 estrelas com ${r.st.shots} tiro(s) (meta ${c.par[0]})`);
}
{
  // atirar à toa não dá 3 estrelas na fortaleza
  const c = C.CHALLENGES[9];
  const st = C.setupChallenge(c);
  while (!st.done) C.fireChallenge(c, st, { yaw: 0.3, power: 0.2, ammo: 'stone' });
  ok(C.starsFor(c, st) === 0, 'atirando à toa não ganha estrela');
}

console.log('Fumaça do jogo (main.js no Node)');
{
  const { smoke } = await import('./smoke.js');
  const res = await smoke();
  for (const [c, m] of res) ok(c, m);
}

clearTimeout(killer);
console.log(`\n${passes} ok, ${fails} falha(s) em ${((Date.now() - T0) / 1000).toFixed(1)} s`);
if (fails) { console.log('Algo falhou.'); process.exit(1); }
console.log('Tudo certo');
process.exit(0);
