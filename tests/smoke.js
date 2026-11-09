// Fumaça do main.js: carrega o jogo inteiro no Node com um navegador de mentira (sem WebGL, sem som)
// e confere que menu, partida (com o robô), mira do PC e do VR, conserto e desafios funcionam.
import * as nodeModule from 'node:module';

// ---- navegador de mentira ----
function fakeCtx() {
  const fn = () => proxy;
  const proxy = new Proxy(fn, {
    get(_, k) {
      if (k === 'measureText') return (t) => ({ width: String(t).length * 12 });
      if (k === 'canvas') return null;
      return fn;
    },
    set() { return true; },
    apply() { return proxy; },
  });
  return proxy;
}
function fakeElement(tag = 'div') {
  const listeners = {};
  return {
    tagName: tag.toUpperCase(), style: {}, dataset: {}, children: [], textContent: '', innerHTML: '', width: 300, height: 150,
    listeners,
    addEventListener(t, f) { (listeners[t] ||= []).push(f); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    getContext() { return fakeCtx(); },
    setPointerCapture() {}, releasePointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
    dispatch(t, e) { for (const f of listeners[t] || []) f(e); },
  };
}
function installDom() {
  const els = {};
  const winListeners = {};
  const store = new Map();
  const doc = {
    createElement: (t) => fakeElement(t),
    createElementNS: (_, t) => fakeElement(t),
    getElementById: (id) => (els[id] ||= fakeElement('div')),
    body: fakeElement('body'),
    addEventListener() {},
  };
  const win = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, isSecureContext: false,
    addEventListener(t, f) { (winListeners[t] ||= []).push(f); },
    removeEventListener() {},
    dispatch(t, e) { for (const f of winListeners[t] || []) f(e); },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  };
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.self = win;
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node-teste' }, configurable: true, writable: true });
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  return { els, win, store };
}

// Troca só o WebGLRenderer do Three.js por um de mentira (o resto do Three.js é o de verdade).
function installThreeStub() {
  const stub = new URL('./three-stub.js', import.meta.url).href;
  const resolve = (spec, ctx, next) => {
    if (spec.endsWith('vendor/three/three.module.js') && !String(ctx.parentURL || '').endsWith('three-stub.js')) return { url: stub, shortCircuit: true };
    return next(spec, ctx);
  };
  if (nodeModule.registerHooks) nodeModule.registerHooks({ resolve });
  else throw new Error('Node sem module.registerHooks (precisa do Node 22.15 ou mais novo)');
}

export async function smoke() {
  const out = [];
  const ok = (c, m) => out.push([!!c, m]);
  const { els, win, store } = installDom();
  installThreeStub();
  const errors = [];
  const origErr = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  await import('../js/main.js');
  const dev = window.dev;
  const G = window.cerco;
  const THREE = await import('../vendor/three/three.module.js');
  const R = await import('../js/rules.js');
  const { cellCenter } = await import('../js/scene.js');
  ok(dev && typeof dev.advance === 'function', 'main.js carregou e criou window.dev');
  let s = dev.advance(0.5);
  ok(s.tela === 'menu' && s.painel, 'abre no menu principal');
  ok(els.vr.textContent.includes('VR'), `botão de VR avisa que não tem VR aqui ("${els.vr.textContent}")`);
  const canvasEl = G.renderer.domElement;
  const waitFor = (f, max = 200) => { for (let i = 0; i < max && !f(dev.state()); i++) dev.advance(0.25); return dev.advance(0.05); };

  s = dev.startMatch(1);
  ok(s.tela === 'play' && s.adversario === 'Barão Bonachão' && s.reis.every(r => r === 'de pé'), 'partida contra o Barão com os dois reis de pé');
  s = waitFor(x => x.fase === 'aim' && x.vez === 'você');
  ok(s.fase === 'aim', 'chega a sua vez de mirar (o Barão atira sozinho se começar)');
  const shots0 = s.tiros[0];
  // PC: arrastar para baixo e para a direita e soltar
  canvasEl.dispatch('pointerdown', { clientX: 640, clientY: 300, button: 0 });
  canvasEl.dispatch('pointermove', { clientX: 690, clientY: 420 });
  s = dev.advance(0.05);
  ok(s.mira.power > 0.8 && s.mira.yaw > 0.03, `arrastar mira e dá força (força ${s.mira.power.toFixed(2)}, mira ${s.mira.yaw.toFixed(2)})`);
  win.dispatch('pointerup', {});
  s = dev.advance(0.1);
  ok(s.tiros[0] === shots0 + 1 && s.fase === 'flight', 'soltar o mouse atira');
  s = waitFor(x => x.fase !== 'flight', 40);
  ok(s.fase === 'repair', `depois do voo vem o conserto (${s.fase})`);
  // conserto clicando no chão do seu lado
  const g = G.match.g;
  let spot = null;
  for (const z of [28, 27, 26]) for (const x of [0, 1, 10, 9]) if (!spot && R.canPlace(g, 0, x, 0, z)) spot = [x, 0, z];
  const p = dev.screenOf('ground', ...spot);
  canvasEl.dispatch('pointermove', { clientX: p.x, clientY: p.y });
  dev.advance(0.05);
  canvasEl.dispatch('pointerdown', { clientX: p.x, clientY: p.y, button: 0 });
  win.dispatch('pointerup', {});
  s = dev.advance(0.1);
  ok(R.get(g, ...spot) === R.WOOD && s.fase !== 'repair', `clicar no chão do seu castelo põe o bloco (${spot.join(',')})`);
  // teclas: W aumenta força, B escolhe bomba, Espaço atira
  s = waitFor(x => x.fase === 'aim' && x.vez === 'você');
  const pw = s.mira.power;
  win.dispatch('keydown', { key: 'w' });
  dev.advance(0.5);
  win.dispatch('keyup', { key: 'w' });
  s = dev.advance(0.02);
  ok(s.mira.power > pw + 0.08 || s.mira.power === 1, `W aumenta a força (${pw.toFixed(2)} -> ${s.mira.power.toFixed(2)})`);
  win.dispatch('keydown', { key: 'b' });
  s = dev.advance(0.02);
  ok(s.mira.ammo === 'bomb', 'B escolhe a bomba');
  const t1 = s.tiros[0], b1 = s.bombas[0];
  win.dispatch('keydown', { key: ' ' });
  s = dev.advance(0.05);
  ok(s.tiros[0] === t1 + 1 && s.bombas[0] === b1 - 1, 'Espaço atira a bomba');
  s = waitFor(x => x.fase === 'repair' || !!x.vencedor);
  win.dispatch('keydown', { key: 'Enter' });
  s = dev.advance(0.05);
  ok(s.fase !== 'repair', 'Enter pula o conserto');

  // VR (controle de mentira): aperto na concha, puxa para trás, solta = atira
  s = waitFor(x => x.fase === 'aim' && x.vez === 'você');
  const entry = G.shell.ctrls[1];
  entry.source = { handedness: 'right', gamepad: { buttons: [], axes: [0, 0, 0, 0] } };
  entry.side = 'right';
  const rigInv = new THREE.Matrix4().copy(G.shell.rig.matrixWorld).invert();
  const setGrab = (q) => { entry.grip.position.copy(q.clone().add(new THREE.Vector3(0, 0.02, 0.04)).applyMatrix4(rigInv)); entry.ctrl.position.copy(entry.grip.position); G.shell.rig.updateMatrixWorld(true); };
  G.world.catapults[0].setAim(0, 0);
  dev.advance(0.5);
  G.scene.updateMatrixWorld(true);
  const cup = G.world.catapults[0].cupWorld(new THREE.Vector3());
  setGrab(cup);
  G.shell.hooks.squeezeStart(entry);
  const t2 = dev.state().tiros[0];
  setGrab(cup.clone().add(new THREE.Vector3(0.03, -0.05, 0.16)));
  s = dev.advance(0.05);
  ok(s.mira.power > 0.6 && s.mira.yaw < -0.03, `VR: puxar a concha para trás dá força e mira para o lado oposto (força ${s.mira.power.toFixed(2)}, mira ${s.mira.yaw.toFixed(2)})`);
  G.shell.hooks.squeezeEnd(entry);
  s = dev.advance(0.05);
  ok(s.tiros[0] === t2 + 1, 'VR: soltar a concha atira');
  // VR: pegar o bloco da bandeja e levar ao castelo
  s = waitFor(x => x.fase === 'repair' || !!x.vencedor);
  if (s.fase === 'repair') {
    setGrab(G.world.repairBlock.position.clone());
    G.shell.hooks.squeezeStart(entry);
    let spot2 = null;
    for (const z of [28, 27]) for (const x of [10, 9, 0, 1]) if (!spot2 && R.canPlace(G.match.g, 0, x, 0, z)) spot2 = [x, 0, z];
    setGrab(cellCenter(...spot2, new THREE.Vector3()));
    dev.advance(0.05);
    G.shell.hooks.squeezeEnd(entry);
    s = dev.advance(0.05);
    ok(R.get(G.match.g, ...spot2) === R.WOOD, 'VR: soltar o bloco no castelo conserta');
  } else ok(false, 'não chegou ao conserto depois do tiro do VR');
  entry.source = null; entry.side = null;

  // o resto da partida o robô joga
  dev.autoplay = true;
  s = waitFor(x => !!x.vencedor, 3000);
  ok(s.vencedor, `partida terminou sozinha (vencedor: ${s.vencedor}, tiros ${s.tiros.join(' x ')})`);
  ok(JSON.parse(store.get('cercovr.v1') || '{"games":[]}').games[0] === 1, 'resultado salvo no localStorage');

  // Desafios pelo mesmo caminho do menu
  const C = await import('../js/challenges.js');
  const stars = [];
  for (let n = 1; n <= C.CHALLENGES.length; n++) {
    dev.loadLevel(n);
    s = waitFor(x => x.estrelas != null, 600);
    stars.push(s.estrelas);
  }
  ok(stars.every(x => x === 3), `robô tira 3 estrelas nos ${C.CHALLENGES.length} desafios dentro do jogo (${stars.join(' ')})`);
  ok(Object.keys(JSON.parse(store.get('cercovr.v1') || '{"ch":{}}').ch).length === C.CHALLENGES.length, 'estrelas dos desafios salvas');

  dev.autoplay = false;
  dev.loadLevel(10);
  s = dev.win();
  ok(s.estrelas === 3, 'dev.win() resolve o desafio');
  dev.startMatch(2);
  s = dev.win();
  ok(s.vencedor === 'você', 'dev.win() ganha a partida');

  dev.startMatch(3);
  dev.advance(0.2);
  win.dispatch('keydown', { key: 'Escape' });
  ok(dev.state().tela === 'paused', 'Esc pausa');
  win.dispatch('keydown', { key: 'Escape' });
  ok(dev.state().tela === 'play', 'Esc de novo continua');
  const loop = G.renderer._loop;
  for (let i = 0; i < 5; i++) loop?.(performance.now() + i * 16);
  ok(typeof loop === 'function', 'laço de animação ligado');
  console.error = origErr;
  ok(errors.length === 0, `sem erros no console (${errors.slice(0, 2).join(' | ')})`);
  return out;
}
