// Liga as regras e a IA à cena, ao Quest (controles e mãos) e ao mouse/teclado.
import * as THREE from '../vendor/three/three.module.js';
import { PLAYER, CPU, NX, NY, NZ, KING, WOOD, STONE, ROUNDS, BOMBS, YAW_MAX, Match, cloneGrid, canPlace, place, collapse, countBlocks, previewPath, idx, rng, inRegion } from './rules.js';
import { OPPONENTS, ROBOT, chooseShot, chooseRepair } from './ai.js';
import { CHALLENGES, setupChallenge, fireChallenge, starsFor, goalText, robotShot, solve, won } from './challenges.js';
import { buildWorld, TABLE, G0, CS, OX, OZ, toWorld, toGrid, cellCenter } from './scene.js';
import { createShell } from './shell.js';
import { setTheme } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave } from './save.js';

setTheme({
  bg: 'rgba(250,242,226,0.97)', edge: '#8a4a1a', text: '#2e2014', dim: '#7a6650', btn: '#efdcc0', btnHover: '#ffc85a',
  btnOn: '#8a4a1a', btnOnText: '#ffffff', lock: '#e4dacb', star: '#e8a020', labelBg: 'rgba(250,242,226,0.92)',
  title: 'bold 60px Georgia, serif',
});

const save = loadSave();
const sfx = new Sfx();
sfx.on = save.sound;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const GRAB_DIST = 0.075;
const PULL_FULL = 0.22;            // metros de puxão para força máxima
const PREVIEW_FRAC = 0.35;         // a mira mostra só o começo da trajetória
const STAND = { x: 0, z: 0.05 };

// o renderer nasce na casca; o mundo precisa dele para o reflexo do céu
const shell = createShell({ scene: new THREE.Scene(), sfx, save, storeSave, stand: STAND, exposure: 1.0, statusPos: new THREE.Vector3(-0.62, 1.45, -0.9), statusWidth: 0.6, shadows: true, hooks: {} });
const world = buildWorld(shell.renderer);
const { scene } = world;
// troca a cena provisória pela de verdade, levando a câmera, os controles e o painel
{
  const old = shell.scene;
  for (const o of [...old.children]) scene.add(o);
  shell.scene = scene;
  shell.render = () => shell.renderer.render(scene, shell.camera);
}
const { renderer, camera, panel } = shell;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.05;
shell.statusLabel.mesh.rotation.set(-0.15, 0.55, 0);
shell.orbit.target.set(0, G0 + 0.02, TABLE.z);
shell.orbit.dist = 1.55; shell.orbit.pitch = 0.85; shell.orbit.yaw = 0; shell.orbit.keys = 'none';
shell.orbit.minPitch = 0.15; shell.orbit.maxPitch = 1.35; shell.orbit.minDist = 0.6; shell.orbit.maxDist = 2.6;
const menuCam = (t) => ({ pos: new THREE.Vector3(Math.sin(t * 0.12) * 1.3, 1.25, TABLE.z + Math.cos(t * 0.12) * 1.6), look: new THREE.Vector3(0, G0 + 0.1, TABLE.z) });

// chão invisível da maquete (para escolher onde pôr o bloco de conserto)
const groundPick = new THREE.Mesh(new THREE.PlaneGeometry(NX * CS, NZ * CS), new THREE.MeshBasicMaterial({ visible: false }));
groundPick.rotation.x = -Math.PI / 2;
groundPick.position.set(OX + NX * CS / 2, G0, OZ + NZ * CS / 2);
scene.add(groundPick);

// ---------- Estado ----------
let app = 'menu', mode = 'match', match = null, ch = null, oppIndex = 0;
let phase = 'idle';   // 'aim' | 'flight' | 'repair' | 'think' | 'cpuAim' | 'over' | 'intro'
let time = 0, msg = null, random = rng((Date.now() % 100000) + 1);
let aim = { yaw: 0, power: 0.55, ammo: 'stone' };
let shooter = PLAYER;
let disp = null;                 // grade mostrada (durante o voo é a de antes do tiro)
let flight = null;               // { path, t, r, side, landed, fallT, drops }
let cpu = null;                  // { shot, t }
let chResult = null, timerAuto = 0;
let held = null;                 // VR: { entry, kind: 'cup' | 'block', start }
let drag = null;                 // PC: { x, y, yaw, power, moved }
let hoverSpot = null;
const timers = [];
const later = (sec, fn) => timers.push({ at: time + sec, fn });
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const opponent = () => OPPONENTS[oppIndex];
const grid = () => (mode === 'match' ? match?.g : ch?.st.g);
const curWind = () => (mode === 'match' ? match.wind : CHALLENGES[ch.i].wind[ch.st.shots % CHALLENGES[ch.i].wind.length]);
const bombsLeft = (side = PLAYER) => (mode === 'match' ? match.bombs[side] : ch.st.bombs);

function showGrid(g) { disp = g; world.setGrid(g); }

// ---------- Partidas e desafios ----------
function newMatch(i) {
  mode = 'match';
  oppIndex = clamp(i, 0, OPPONENTS.length - 1);
  match = new Match({ starter: random() < 0.5 ? PLAYER : CPU, random });
  ch = null;
  startPlay();
  msg = { text: match.turn === PLAYER ? 'Sorteio: você atira primeiro.' : `Sorteio: ${opponent().name} atira primeiro.`, t: 3.5 };
  world.catapults[CPU].ring.visible = false;
  beginTurn();
}
function newChallenge(i, skipIntro = false) {
  mode = 'challenge';
  const k = clamp(i, 0, CHALLENGES.length - 1);
  ch = { i: k, st: setupChallenge(CHALLENGES[k]) };
  match = null; chResult = null;
  startPlay();
  if (skipIntro || dev.autoplay) beginTurn();
  else { phase = 'intro'; showScreen('chIntro'); }
}
function startPlay() {
  app = 'play'; shell.hidePanel();
  timers.length = 0; flight = null; cpu = null; held = null; drag = null;
  aim = { yaw: 0, power: 0.55, ammo: 'stone' };
  world.ball.visible = false; world.setPreview(null); world.ghost.visible = false; world.repairBlock.visible = false;
  showGrid(grid());
  world.catapults[PLAYER].setAim(0, 0); world.catapults[CPU].setAim(0, 0);
  shell.orbit.menu = null; shell.orbit.snap = true;
  if (shell.vr && !rigPlaced) { shell.recenter(); rigPlaced = true; }
}
let rigPlaced = false;

function beginTurn() {
  if (mode === 'match' && match.over) return endMatch();
  shooter = mode === 'match' ? match.turn : PLAYER;
  world.setWind(curWind());
  if (shooter === PLAYER) {
    phase = 'aim';
    if (!msg || msg.t > 20) msg = { text: 'Sua vez: puxe a catapulta e solte.', t: 30 };
    if (aim.ammo === 'bomb' && bombsLeft() <= 0) aim.ammo = 'stone';
  } else {
    phase = 'think';
    cpu = { t: 0, shot: null };
    later(opponent().think * 0.5, () => {
      const c = chooseShot(match, CPU, opponent(), random);
      cpu.shot = c.shot; cpu.t = 0; phase = 'cpuAim';
    });
  }
  updateHint();
}

function fireShot(shot) {
  const side = shooter;
  const before = cloneGrid(grid());
  let r;
  if (mode === 'match') r = match.fire(shot);
  else r = fireChallenge(CHALLENGES[ch.i], ch.st, shot);
  if (!r) return;
  showGrid(before);
  world.catapults[side].release();
  world.setBall(shot.ammo === 'bomb' && (mode === 'match' ? true : true) ? shot.ammo : 'stone');
  world.setPreview(null);
  sfx.launch();
  shell.pulseAll(0.6, 60);
  flight = { path: r.path, t: -0.12, r, side, landed: false, fallT: 0, drops: null, ammo: shot.ammo };
  phase = 'flight';
  updateHint();
}

// quedas: para cada bloco na posição final, quantas casas ele desceu
function dropsOf(r) {
  const cur = new Map();
  for (const ev of r.falls) for (const c of ev.cells) {
    const from = idx(c.x, c.y, c.z);
    const prev = cur.get(from) || 0;
    cur.delete(from);
    if (!c.broke && c.ny >= 0) cur.set(idx(c.x, c.ny, c.z), prev + (c.y - c.ny));
  }
  return cur;
}
const FALL_G = 45;   // casas/s² na animação da queda
function updateFlight(dt) {
  const f = flight;
  f.t += dt;
  if (!f.landed) {
    const i = Math.floor(Math.max(0, f.t) / (1 / 120));
    if (f.t < 0) { world.ball.visible = false; return; }
    if (i < f.path.length - 1) {
      const [x, y, z] = f.path[i];
      toWorld(x, y, z, world.ball.position);
      world.ball.visible = true;
      world.ball.rotation.x += dt * 8;
      return;
    }
    // chegou
    f.landed = true; f.fallT = 0;
    world.ball.visible = false;
    const imp = f.r.impact;
    if (imp && !imp.out) toWorld(imp.x, Math.max(0.1, imp.y), imp.z, _v); else _v.set(0, G0, TABLE.z);
    if (f.ammo === 'bomb') { world.boom(_v); sfx.boom(); } else if (f.r.hits.length) sfx.crash(f.r.hits.some(h => h.t === STONE)); else sfx.thud();
    if (!f.r.hits.length) world.dust(_v, 0.08, 0xc8b490, 1);
    for (const h of f.r.hits) {
      cellCenter(h.x, h.y, h.z, _v2);
      world.burst(_v2, h.t, h.destroyed ? 9 : 3, f.ammo === 'bomb' ? 1.6 : 1);
      if (h.destroyed) world.dust(_v2, 0.1);
    }
    f.drops = dropsOf(f.r);
    for (const ev of f.r.falls) for (const c of ev.cells) if (c.broke && c.ny >= 0) { cellCenter(c.x, c.ny, c.z, _v2); later(Math.sqrt(2 * (c.y - c.ny) / FALL_G), () => { world.burst(_v2.clone(), c.t, 6); world.dust(_v2.clone(), 0.09); }); }
    if (f.r.falls.length) later(0.25, () => sfx.rumble());
    shell.pulseAll(0.4, 80);
    disp = grid();
    if (f.r.kings.some(k => k)) later(0.3, () => sfx.kingDown());
  }
  if (f.landed) {
    f.fallT += dt;
    const T = f.fallT;
    let falling = false;
    world.setGrid(grid(), f.drops.size ? (i) => { const d = f.drops.get(i); if (!d) return 0; const o = Math.max(0, d - 0.5 * FALL_G * T * T); if (o > 0) falling = true; return o; } : null);
    if (!falling && T > 0.6) { flight = null; afterShot(); }
  }
}

function afterShot() {
  world.setGrid(grid());
  if (mode === 'challenge') {
    if (ch.st.done) return finishChallenge();
    beginTurn();
    return;
  }
  if (match.over) return endMatch();
  if (match.turn === PLAYER) {
    phase = 'repair';
    msg = { text: 'Conserto: ponha um bloco de madeira no seu castelo (ou pule).', t: 30 };
    world.repairBlock.visible = true;
    world.repairBlock.position.copy(world.trayPos);
  } else {
    phase = 'cpuRepair';
    later(0.7, () => {
      const spot = chooseRepair(match, CPU, opponent(), random);
      match.repair(spot);
      if (spot) { cellCenter(...spot, _v); world.dust(_v, 0.06, 0xe0d0b0, 0.8); sfx.place(); }
      world.setGrid(grid());
      msg = null;
      beginTurn();
    });
  }
  updateHint();
}
function doRepair(spot) {
  if (phase !== 'repair' || mode !== 'match') return false;
  if (spot && !canPlace(match.g, PLAYER, ...spot)) { sfx.deny(); return false; }
  match.repair(spot);
  world.repairBlock.visible = false; world.ghost.visible = false; held = null; hoverSpot = null;
  if (spot) { sfx.place(); cellCenter(...spot, _v); world.dust(_v, 0.06, 0xe0d0b0, 0.8); }
  world.setGrid(grid());
  msg = null;
  beginTurn();
  return true;
}

function endMatch() {
  phase = 'over';
  save.games[oppIndex]++;
  if (match.winner === PLAYER) { save.wins[oppIndex]++; sfx.fanfare(); } else if (match.winner === CPU) sfx.bad();
  storeSave(save);
  timerAuto = 3;
  later(1.2, () => { if (app === 'play' && phase === 'over') showScreen('over'); });
  updateHint();
}
function finishChallenge() {
  phase = 'over';
  const c = CHALLENGES[ch.i];
  const stars = starsFor(c, ch.st);
  chResult = { stars, shots: ch.st.shots, won: won(ch.st) };
  save.ch[ch.i] = Math.max(save.ch[ch.i] || 0, stars);
  storeSave(save);
  for (let k = 0; k < stars; k++) later(0.3 + 0.25 * k, () => sfx.star(k));
  if (stars === 3) later(1.1, () => sfx.fanfare());
  timerAuto = 2.5;
  later(0.9, () => { if (app === 'play' && phase === 'over') showScreen('chResult'); });
}
function goMenu() {
  app = 'menu'; phase = 'idle';
  shell.orbit.menu = menuCam; shell.orbit.snap = true;
  match = null; ch = null; flight = null; held = null; timers.length = 0;
  const demo = setupChallenge(CHALLENGES[9]);
  showGrid(demo.g);
  world.setWind(0); world.setPreview(null); world.ball.visible = false; world.ghost.visible = false; world.repairBlock.visible = false;
  if (shell.vr) shell.recenter();
  showScreen('main');
  updateHint();
}
function togglePause() {
  if (app === 'play' && !panel.visible) { app = 'paused'; cancelHeld(); showScreen('pause'); }
  else if (app === 'paused') { app = 'play'; shell.hidePanel(); }
  updateHint();
}

// ---------- Menus ----------
const challengeUnlocked = (i) => i === 0 || (save.ch[i - 1] || 0) >= 1;
function showScreen(name) {
  const vr = shell.vr;
  shell.showPanel((p) => {
    if (name === 'main') {
      p.title('Cerco', 72);
      p.text('Duelo de catapultas: derrube o rei do outro castelo', 512, 130, { size: 27, color: '#7a6650' });
      p.button('Partida contra o computador', () => showScreen('opponents'), 212, 172, 600, 92, { size: 36 });
      p.button('Desafios', () => showScreen('challenges'), 212, 280, 600, 80);
      p.button('Como jogar', () => showScreen('help'), 212, 376, 600, 80);
      p.button(`Som: ${save.sound ? 'sim' : 'não'}`, () => { save.sound = !save.sound; sfx.setOn(save.sound); storeSave(save); showScreen('main'); }, 212, 474, 290, 66, { size: 26 });
      p.button(`FPS: ${save.fps ? 'sim' : 'não'}`, () => { save.fps = !save.fps; storeSave(save); showScreen('main'); }, 522, 474, 290, 66, { size: 26 });
      const stars = Object.values(save.ch).reduce((a, b) => a + b, 0);
      p.text(`Vitórias: ${save.wins.reduce((a, b) => a + b, 0)}   ·   Estrelas nos desafios: ${stars} de ${CHALLENGES.length * 3}`, 512, 594, { size: 26, color: '#8a4a1a' });
      p.text(vr ? 'Aponte com o controle e aperte o gatilho' : 'No Quest: abra esta página no navegador do óculos e aperte "Entrar em VR"', 512, 656, { size: 22, color: '#7a6650' });
    } else if (name === 'opponents') {
      p.title('Escolha o adversário', 62);
      OPPONENTS.forEach((o, i) => p.button(`${o.name}  ·  ${o.title}`, () => newMatch(i), 72, 116 + i * 156, 880, 136, { size: 34, sub: o.desc }));
      p.text(`Vitórias: ${save.wins.join(' / ')}`, 512, 600, { size: 24, color: '#7a6650' });
      p.button('Voltar', () => showScreen('main'), 362, 632, 300, 66, { size: 28 });
    } else if (name === 'challenges') {
      p.title('Desafios', 56);
      CHALLENGES.forEach((c, i) => p.tile(52 + (i % 5) * 186, 110 + Math.floor(i / 5) * 200, 172, 176, { num: i + 1, name: c.name, stars: save.ch[i] || 0, done: save.ch[i] != null, locked: !challengeUnlocked(i), action: () => newChallenge(i) }));
      p.text('Passe um desafio (1 estrela) para liberar o próximo.', 512, 540, { size: 24, color: '#7a6650' });
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 600, 300, 70, { size: 30 });
    } else if (name === 'help') {
      p.title('Como jogar', 60);
      const rows = [
        'Cada um tem um castelo de blocos com um rei escondido. Derrube o rei do outro.',
        'Na sua vez: puxe o braço da catapulta para trás (força) e mire de lado. Solte.',
        'A pedra atravessa madeira mas para na pedra. A bomba estoura em volta (2 por partida).',
        'O vento muda a cada tiro: veja a bandeira no meio do campo.',
        'Bloco sem apoio cai; rei que cai ou leva pedrada está derrubado.',
        'Depois do tiro, ponha 1 bloco de madeira para consertar o seu castelo.',
        vr ? 'VR: aperte a concha da catapulta, puxe e solte. Cestos: pedra ou bomba.' : 'PC: arraste com o mouse (para baixo = força, para o lado = mira) e solte.',
        vr ? 'Conserto: pegue o bloco na bandeja e leve ao castelo. B ou Y: pausa.' : 'Teclas: A/D mira, W/S força, Espaço atira, B troca munição. Botão direito: câmera.',
      ];
      rows.forEach((t, i) => p.text(t, 40, 124 + i * 54, { size: 23, align: 'left' }));
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 586, 300, 80);
    } else if (name === 'pause') {
      p.title('Pausa', 66);
      p.text(mode === 'match' ? `Contra ${opponent().name} · tiro ${match.shots[0] + 1} de ${ROUNDS}` : `Desafio ${ch.i + 1}: ${CHALLENGES[ch.i].name}`, 512, 130, { size: 28, color: '#7a6650' });
      p.button('Continuar', () => togglePause(), 262, 176, 500, 84);
      p.button(mode === 'match' ? 'Recomeçar a partida' : 'Recomeçar o desafio', () => (mode === 'match' ? newMatch(oppIndex) : newChallenge(ch.i, true)), 262, 276, 500, 84);
      p.button('Como jogar', () => showScreen('help'), 262, 376, 245, 84, { size: 30 });
      p.button('Recentralizar', () => { togglePause(); shell.recenter(); }, 517, 376, 245, 84, { size: 30, locked: !vr });
      p.button('Menu principal', () => goMenu(), 262, 476, 500, 84);
    } else if (name === 'over') {
      const w = match.winner;
      p.title(w === PLAYER ? 'Você venceu!' : w === CPU ? `${opponent().name} venceu` : 'Empate!', 72);
      const why = match.endReason === 'rei' ? (w === PLAYER ? 'O rei deles foi ao chão.' : 'Derrubaram o seu rei.') : `Acabaram os ${ROUNDS} tiros: ganha quem tem mais castelo de pé.`;
      p.text(why, 512, 150, { size: 30, bold: true });
      p.text(`Blocos de pé: você ${countBlocks(match.g, PLAYER)} x ${countBlocks(match.g, CPU)} ${opponent().name}   ·   tiros: ${match.shots[0]} x ${match.shots[1]}`, 512, 206, { size: 25, color: '#7a6650' });
      p.text(`Contra ${opponent().name}: ${save.wins[oppIndex]} vitória(s) em ${save.games[oppIndex]} partida(s)`, 512, 254, { size: 24, color: '#7a6650' });
      p.button('Jogar de novo', () => newMatch(oppIndex), 262, 310, 500, 92, { size: 36 });
      p.button('Outro adversário', () => showScreen('opponents'), 262, 420, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 520, 500, 80);
    } else if (name === 'chIntro') {
      const c = CHALLENGES[ch.i];
      p.title(`Desafio ${ch.i + 1}: ${c.name}`, 66);
      p.text(c.desc, 512, 150, { size: 26 });
      p.text(`Vento: ${c.wind.length > 1 ? 'muda a cada tiro' : c.wind[0] === 0 ? 'calmo' : `força ${Math.abs(c.wind[0])} para a ${c.wind[0] > 0 ? 'direita' : 'esquerda'}`}${c.bombs ? ` · bombas: ${c.bombs}` : ''}`, 512, 200, { size: 25, color: '#7a6650' });
      p.text(goalText(c), 512, 252, { size: 23, color: '#8a4a1a' });
      p.button('Começar', () => { shell.hidePanel(); beginTurn(); }, 262, 320, 500, 96, { size: 38 });
      p.button('Desafios', () => showScreen('challenges'), 262, 440, 500, 80);
    } else if (name === 'chResult') {
      const c = CHALLENGES[ch.i];
      p.title(chResult.won ? 'Rei derrubado!' : 'Não foi dessa vez', 66);
      p.stars(chResult.stars, 512, 160, 80);
      p.text(chResult.won ? `Tiros: ${chResult.shots}` : `Acabaram os ${c.par[2]} tiros`, 512, 232, { size: 30, bold: true });
      p.text(goalText(c), 512, 276, { size: 22, color: '#7a6650' });
      p.text(`Melhor: ${save.ch[ch.i] || 0} estrela(s)`, 512, 314, { size: 24 });
      p.button('Tentar de novo', () => newChallenge(ch.i, true), 262, 350, 245, 84, { size: 30 });
      p.button('Próximo', () => newChallenge(ch.i + 1), 517, 350, 245, 84, { size: 30, locked: ch.i >= CHALLENGES.length - 1 || !challengeUnlocked(ch.i + 1) });
      p.button('Desafios', () => showScreen('challenges'), 262, 454, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 554, 500, 80);
    }
  });
  updateHint();
}

// ---------- Entrada ----------
const canAim = () => app === 'play' && phase === 'aim' && !panel.visible && !dev.autoplay;
const canRepair = () => app === 'play' && phase === 'repair' && !panel.visible && !dev.autoplay;
function setAim(yaw, power) {
  aim.yaw = clamp(yaw, -YAW_MAX, YAW_MAX);
  aim.power = clamp(power, 0, 1);
}
function pickAmmo(a) {
  if (!canAim()) return;
  if (a === 'bomb' && bombsLeft() <= 0) { sfx.deny(); msg = { text: 'Acabaram as bombas.', t: 2 }; return; }
  aim.ammo = a; sfx.pick();
}
function shoot() {
  if (!canAim()) return;
  if (aim.power < 0.03) { msg = { text: 'Puxe a catapulta para trás antes de soltar.', t: 2 }; return; }
  fireShot({ ...aim });
}
// célula para o conserto a partir de um raio
function spotFromRay(rc) {
  const g = grid();
  const objs = [world.inst[WOOD], world.inst[STONE], groundPick];
  const h = rc.intersectObjects(objs, false)[0];
  if (!h) return null;
  if (h.object === groundPick) {
    const q = toGrid(h.point);
    const s = [Math.floor(q.x), 0, Math.floor(q.z)];
    return canPlace(g, PLAYER, ...s) ? s : nearestSpot(h.point);
  }
  const n = h.face.normal.clone();
  const q = toGrid(h.point.clone().addScaledVector(n, -CS * 0.05));
  const c = [Math.floor(q.x), Math.floor(q.y), Math.floor(q.z)];
  const s = [c[0] + Math.round(n.x), c[1] + Math.round(n.y), c[2] + Math.round(n.z)];
  return canPlace(g, PLAYER, ...s) ? s : nearestSpot(h.point);
}
// lugar válido mais perto de um ponto (até 1,6 casa)
function nearestSpot(p) {
  const g = grid(), q = toGrid(p);
  let best = null, bd = 1.6;
  for (let x = Math.floor(q.x) - 2; x <= Math.floor(q.x) + 2; x++) for (let y = Math.max(0, Math.floor(q.y) - 2); y <= Math.floor(q.y) + 2; y++) for (let z = Math.floor(q.z) - 2; z <= Math.floor(q.z) + 2; z++) {
    if (!canPlace(g, PLAYER, x, y, z)) continue;
    const d = Math.hypot(x + 0.5 - q.x, y + 0.5 - q.y, z + 0.5 - q.z);
    if (d < bd) { bd = d; best = [x, y, z]; }
  }
  return best;
}
function pickables() { return [world.baskets.stone.userData.hit, world.baskets.bomb.userData.hit, world.skipLabel.mesh]; }
function rayPick(rc) { const h = rc.intersectObjects(pickables(), false)[0]; return h ? { ud: h.object.userData, dist: h.distance } : null; }
function activate(ud) {
  if (!ud) return false;
  if (ud.kind === 'ammo') { pickAmmo(ud.ammo); return true; }
  if (ud.kind === 'skip' && canRepair()) { doRepair(null); return true; }
  return false;
}
function touchAt(p) {
  let best = null, bd = GRAB_DIST;
  for (const o of pickables()) { o.getWorldPosition(_v); const d = _v.distanceTo(p); if (d < bd) { bd = d; best = o.userData; } }
  return best;
}
// VR: pegar a concha, o bloco da bandeja, ou tocar num cesto/placa
function tryGrab(e) {
  const p = shell.grabPoint(e);
  if (canAim()) {
    const cup = world.catapults[PLAYER].cupWorld(_v);
    if (cup.distanceTo(p) < GRAB_DIST * 1.2) { held = { entry: e, kind: 'cup', start: p.clone() }; sfx.pick(); shell.pulse(e, 0.3, 20); return true; }
  }
  if (canRepair() && world.repairBlock.position.distanceTo(p) < GRAB_DIST * 1.2) { held = { entry: e, kind: 'block' }; sfx.pick(); shell.pulse(e, 0.3, 20); return true; }
  const ud = touchAt(p);
  if (ud) { activate(ud); shell.pulse(e, 0.3, 20); return true; }
  return false;
}
function releaseHeld() {
  if (!held) return;
  const h = held; held = null;
  if (h.kind === 'cup') { if (canAim() && aim.power >= 0.05) shoot(); else { setAim(aim.yaw, 0); } }
  else if (h.kind === 'block') {
    if (hoverSpot && canRepair()) doRepair(hoverSpot);
    else { world.repairBlock.position.copy(world.trayPos); world.ghost.visible = false; }
  }
}
function cancelHeld() { if (held?.kind === 'block') world.repairBlock.position.copy(world.trayPos); held = null; drag = null; }
function updateHeld() {
  if (!held) return;
  const p = shell.grabPoint(held.entry, new THREE.Vector3());
  if (held.kind === 'cup') {
    const piv = world.catapults[PLAYER].pivotWorld(_v);
    const dx = piv.x - p.x, dz = piv.z - p.z;
    const yaw = Math.atan2(dx, -dz);
    const back = Math.max(0, (p.z - held.start.z) * 1 + Math.max(0, held.start.y - p.y) * 0.5);
    const before = aim.power;
    setAim(yaw, back / PULL_FULL);
    if (Math.floor(aim.power * 8) !== Math.floor(before * 8)) { shell.pulse(held.entry, 0.1 + aim.power * 0.4, 12); sfx.creak(aim.power); }
  } else {
    world.repairBlock.position.copy(p);
    hoverSpot = nearestSpot(p);
  }
}

const hooks = {
  tick,
  pause: () => togglePause(),
  button: (e, k) => { if (k === 4 && canAim()) pickAmmo(aim.ammo === 'bomb' ? 'stone' : 'bomb'); },
  squeezeStart: (e) => { if (!e.isHand) tryGrab(e); },
  squeezeEnd: (e) => { if (held?.entry === e) releaseHeld(); },
  selectStart: (e) => {
    if (e.isHand && tryGrab(e)) return;
    const rc = shell.entryRay(e);
    const h = rayPick(rc);
    if (h && activate(h.ud)) return;
    if (canRepair()) { const s = spotFromRay(shell.entryRay(e)); if (s) doRepair(s); }
  },
  selectEnd: (e) => { if (held?.entry === e) releaseHeld(); },
  disconnected: (e) => { if (held?.entry === e) cancelHeld(); },
  sessionStart: () => { rigPlaced = false; updateHint(); },
  sessionEnd: () => { cancelHeld(); updateHint(); },
  pointerDown: (ev) => {
    const h = rayPick(shell.mouseRay());
    if (h && activate(h.ud)) return;
    if (canRepair()) { const s = spotFromRay(shell.mouseRay()); if (s) doRepair(s); return; }
    if (canAim()) drag = { x: ev.clientX, y: ev.clientY, yaw: aim.yaw, power: aim.power, moved: false };
  },
  pointerMove: (ev) => {
    if (drag && canAim()) {
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
      if (drag.moved) setAim(drag.yaw + dx * 0.0012, drag.power + dy * 0.0028);
    }
  },
  pointerUp: () => { if (drag) { const d = drag; drag = null; if (d.moved && canAim()) shoot(); } },
  key: (k) => {
    if (k === ' ' && canAim()) { shoot(); return true; }
    if (k === 'b' && canAim()) { pickAmmo(aim.ammo === 'bomb' ? 'stone' : 'bomb'); return true; }
    if (k === 'enter' && canRepair()) { doRepair(null); return true; }
    return false;
  },
};
Object.assign(shell.hooks, hooks);
const keyAim = (dt) => {
  if (!canAim() || shell.vr) return;
  const K = shell.keys;
  let { yaw, power } = aim;
  const fast = K.has('shift') ? 0.25 : 1;
  if (K.has('a') || K.has('arrowleft')) yaw -= 0.18 * dt * fast;
  if (K.has('d') || K.has('arrowright')) yaw += 0.18 * dt * fast;
  if (K.has('w') || K.has('arrowup')) power += 0.25 * dt * fast;
  if (K.has('s') || K.has('arrowdown')) power -= 0.25 * dt * fast;
  if (yaw !== aim.yaw || power !== aim.power) setAim(yaw, power);
};

// ---------- HUD ----------
function updateHint() {
  let t;
  if (app !== 'play' || panel.visible) t = 'Clique nas opções do painel';
  else if (phase === 'aim') t = 'Arraste com o mouse e solte (baixo = força, lado = mira) · A/D e W/S ajustam, Espaço atira · B: bomba · botão direito: câmera · Esc: pausa';
  else if (phase === 'repair') t = 'Clique onde pôr o bloco de madeira no seu castelo · Enter ou "Pular" para não pôr';
  else t = 'Botão direito arrastando: câmera · roda: zoom · Esc: pausa';
  shell.setHint(t);
}
function statusLines() {
  const w = curWind();
  const ws = w === 0 ? 'vento calmo' : `vento ${Math.abs(w)} para a ${w > 0 ? 'direita' : 'esquerda'}`;
  if (mode === 'challenge') {
    const c = CHALLENGES[ch.i];
    return { a: `Desafio ${ch.i + 1}: ${c.name} · tiro ${Math.min(c.par[2], ch.st.shots + 1)} de ${c.par[2]} · ${ws}${c.bombs ? ` · bombas ${ch.st.bombs}` : ''}`, b: phase === 'aim' ? `Força ${Math.round(aim.power * 100)}% · mira ${Math.round(aim.yaw * 57)}° · ${aim.ammo === 'bomb' ? 'BOMBA' : 'pedra'}` : '' };
  }
  const o = opponent();
  const who = shooter === PLAYER ? 'sua vez' : `vez de ${o.name}`;
  return {
    a: `Tiro ${Math.min(ROUNDS, match.shots[shooter] + (phase === 'aim' || phase === 'think' || phase === 'cpuAim' ? 1 : 0))} de ${ROUNDS} · ${who} · ${ws} · bombas: você ${match.bombs[0]}, ${o.name} ${match.bombs[1]}`,
    b: phase === 'aim' ? `Força ${Math.round(aim.power * 100)}% · mira ${Math.round(aim.yaw * 57)}° · ${aim.ammo === 'bomb' ? 'BOMBA' : 'pedra'}` : phase === 'think' || phase === 'cpuAim' ? `${o.name} está mirando...` : `Blocos de pé: você ${countBlocks(match.g, 0)} x ${countBlocks(match.g, 1)}`,
  };
}

// ---------- Laço ----------
let previewKey = '';
function tick(dt) {
  const paused = app === 'paused';
  if (!paused) {
    time += dt;
    for (let i = 0; i < timers.length; i++) if (timers[i].at <= time) { const t = timers.splice(i, 1)[0]; i--; t.fn(); }
  }
  if (app === 'play' && !paused) {
    if (phase === 'aim') {
      keyAim(dt);
      if (dev.autoplay) robotAim(dt);
    }
    if (phase === 'flight' && flight) updateFlight(dt);
    if (phase === 'cpuAim' && cpu?.shot) {
      cpu.t += dt;
      const k = Math.min(1, cpu.t / 1.1);
      world.catapults[CPU].setAim(cpu.shot.yaw * k, cpu.shot.power * Math.min(1, k * 1.3));
      if (cpu.t > 1.4) { const s = cpu.shot; cpu = null; fireShot(s); }
    }
    if (phase === 'repair' && dev.autoplay) { robotT += dt; if (robotT > 0.4) { robotT = 0; doRepair(chooseRepair(match, PLAYER, ROBOT, random)); } }
    if (phase === 'over' && dev.autoplay) { timerAuto -= dt; if (timerAuto <= 0 && mode === 'match') newMatch(oppIndex); }
  }
  updateHeld();
  // catapulta do jogador e a prévia curta
  if (app === 'play' && phase === 'aim') {
    world.catapults[PLAYER].setAim(aim.yaw, aim.power);
    const key = `${aim.yaw.toFixed(3)}|${aim.power.toFixed(3)}|${curWind()}`;
    if (key !== previewKey) { previewKey = key; world.setPreview(aim.power > 0.02 ? previewPath(PLAYER, aim, curWind(), PREVIEW_FRAC) : null); }
    world.setAmmo(aim.ammo, bombsLeft(), true);
    world.catapults[PLAYER].ring.visible = shell.vr && !held;
    if (world.catapults[PLAYER].ring.visible) { world.catapults[PLAYER].cupWorld(world.catapults[PLAYER].ring.position); world.catapults[PLAYER].ring.lookAt(camera.getWorldPosition(_v)); }
  } else {
    if (previewKey) { previewKey = ''; world.setPreview(null); }
    world.catapults[PLAYER].ring.visible = false;
    world.setAmmo(aim.ammo, app === 'play' ? bombsLeft() : BOMBS, app === 'play');
  }
  // fantasma do conserto
  if (canRepair()) {
    if (!held && !shell.vr) hoverSpot = spotFromRay(shell.mouseRay());
    else if (!held && shell.vr) { hoverSpot = null; for (const e of shell.ctrls) if (e.source) { const s = spotFromRay(shell.entryRay(e)); if (s) { hoverSpot = s; break; } } }
    world.ghost.visible = !!hoverSpot;
    if (hoverSpot) cellCenter(...hoverSpot, world.ghost.position);
    world.skipLabel.mesh.visible = true;
  } else { world.ghost.visible = false; world.skipLabel.mesh.visible = false; if (phase !== 'repair') world.repairBlock.visible = false; }
  if (shell.vr && app === 'play') for (const e of shell.ctrls) { if (!e.source) continue; const h = rayPick(shell.entryRay(e)); if (h) e.laserLen = h.dist; }
  shell.showPinch = app === 'play';
  world.setLabelsVisible(app === 'play' && !panel.visible);
  world.animate(dt, time);
  if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
  shell.setStatus(app === 'play' && grid() ? { ...statusLines(), msg: msg?.text } : null);
}
let robotT = 0, robotPlan = null;
function robotAim(dt) {
  robotT += dt;
  if (robotT < ROBOT.think) return;
  robotT = 0;
  let s;
  if (mode === 'challenge') s = robotShot(CHALLENGES[ch.i], ch.st);
  else s = chooseShot(match, PLAYER, ROBOT, random).shot;
  aim = { ...s };
  fireShot(s);
}

// ---------- Depuração (console do navegador) ----------
// dev.autoplay = true   o robô joga por você      dev.advance(5)   avança 5 s na hora
// dev.state()           resumo                    dev.loadLevel(3) abre o desafio 3 (1 a 10)
// dev.startMatch(2)     partida contra o 2 (1 a 3) dev.win()       ganha a partida/desafio
// dev.aim(yaw, força)   mira; dev.fire() atira     dev.screenOf('cell', x,y,z) | 'stone' | 'bomb' | 'skip'
// dev.resetSave()       apaga o progresso
const dev = {
  _auto: false,
  get autoplay() { return this._auto; },
  set autoplay(v) { this._auto = !!v; cancelHeld(); },
  loadLevel(n) { newChallenge(n - 1, true); return this.state(); },
  startMatch(n = 1) { newMatch(n - 1); return this.state(); },
  advance(sec, stepT = 1 / 60) {
    const frames = Math.round(sec / stepT);
    for (let i = 0; i < frames; i++) shell.step(stepT);
    shell.resetClock(); shell.render();
    return this.state();
  },
  aim(yaw, power, ammo = aim.ammo) { setAim(yaw, power); aim.ammo = ammo; return this.state(); },
  fire() { shoot(); return this.state(); },
  win() {
    if (mode === 'challenge' && ch) {
      const r = solve(CHALLENGES[ch.i]);
      ch.st = r.st; flight = null; timers.length = 0; world.setGrid(grid()); finishChallenge();
    } else if (mode === 'match' && match) {
      const k = match.g.kings[CPU]; k.down = true; match.g.t[idx(k.x, k.y, k.z)] = 0;
      match.phase = 'over'; match.winner = PLAYER; match.endReason = 'rei';
      flight = null; timers.length = 0; world.setGrid(grid());
      endMatch();
      showScreen('over');
    }
    return this.state();
  },
  screenOf(what, ...a) {
    let o;
    if (what === 'cell') o = cellCenter(...a, new THREE.Vector3());
    else if (what === 'ground') o = toWorld(a[0] + 0.5, 0, a[2] + 0.5, new THREE.Vector3());
    else o = (what === 'skip' ? world.skipLabel.mesh : world.baskets[what].userData.hit).getWorldPosition(new THREE.Vector3());
    const p = o.clone().project(camera);
    return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight };
  },
  state() {
    const base = { tela: app, modo: mode, fase: phase, painel: panel.visible };
    const g = grid();
    if (!g) return base;
    return {
      ...base,
      adversario: mode === 'match' ? opponent().name : null,
      desafio: mode === 'challenge' ? `${ch.i + 1}: ${CHALLENGES[ch.i].name}` : null,
      vez: shooter === PLAYER ? 'você' : 'computador',
      vento: curWind(), mira: { ...aim },
      tiros: mode === 'match' ? match.shots.slice() : [ch.st.shots, 0],
      bombas: mode === 'match' ? match.bombs.slice() : [ch.st.bombs, 0],
      blocos: [countBlocks(g, PLAYER), countBlocks(g, CPU)],
      reis: g.kings.map(k => (k ? (k.down ? 'caído' : 'de pé') : null)),
      voando: !!flight,
      estrelas: mode === 'challenge' && chResult ? chResult.stars : null,
      vencedor: mode === 'match' && match.over && phase === 'over' ? (match.winner === PLAYER ? 'você' : match.winner === CPU ? opponent().name : 'empate') : null,
      salvo: { vitorias: save.wins, desafios: save.ch },
    };
  },
  resetSave() { save.wins = [0, 0, 0]; save.games = [0, 0, 0]; save.ch = {}; storeSave(save); },
};
window.dev = dev;
window.cerco = { dev, get match() { return match; }, get challenge() { return ch; }, save, camera, scene, renderer, world, shell };

goMenu();
shell.start();
