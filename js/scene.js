// Cena do Cerco: colina ao entardecer, uma mesa de madeira com a maquete do campo de batalha,
// os dois castelos de blocos, as catapultas, a bandeira de vento e os efeitos (pedra voando,
// lascas, poeira).
import * as THREE from '../vendor/three/three.module.js';
import { NX, NY, NZ, WOOD, STONE, ROCK, KING, idx, CATAPULT, PLAYER, CPU } from './rules.js';
import { ceuGradiente, ambienteDoCeu, solPrincipal, luzCeuChao, neblina, caixaArredondada, escurecerBase, sombraContato, halo, espalhar } from './visual3d.js';
import { madeira, pedra } from './materiais3d.js';
import { Label } from './ui.js';

export const CS = 0.06;                       // tamanho de uma casa (bloco) em metros
export const TABLE = { x: 0, z: -1.3, w: 1.15, d: 2.3, top: 0.8 };
export const G0 = TABLE.top + 0.03;           // chão da maquete
export const OX = -NX * CS / 2, OZ = -0.33 - 31 * CS;
export const toWorld = (gx, gy, gz, out = new THREE.Vector3()) => out.set(OX + gx * CS, G0 + gy * CS, OZ + gz * CS);
export const cellCenter = (x, y, z, out = new THREE.Vector3()) => toWorld(x + 0.5, y + 0.5, z + 0.5, out);
export const toGrid = (p) => ({ x: (p.x - OX) / CS, y: (p.y - G0) / CS, z: (p.z - OZ) / CS });
export const TEAM = [0x2f6fc0, 0xc0392b];
const IS_QUEST = typeof navigator !== 'undefined' && /OculusBrowser|Quest/i.test(navigator.userAgent || '');
const CAN_TEX = typeof ImageData !== 'undefined';

const SKY = { zenite: '#3f6fbf', horizonte: '#f4c48e', chao: '#56653a', dirSol: new THREE.Vector3(-0.55, 0.42, 0.72) };

function hash(i) { let h = Math.imul(i ^ 0x9e3779b9, 2654435761); h ^= h >>> 15; return (h >>> 0) / 4294967296; }

export function buildWorld(renderer) {
  const scene = new THREE.Scene();
  scene.add(ceuGradiente(SKY));
  if (renderer && CAN_TEX && renderer.capabilities) ambienteDoCeu(renderer, scene, SKY, 0.6);
  const sun = solPrincipal(scene, { dir: SKY.dirSol, cor: '#ffd9a8', intensidade: 2.8, raioArea: 1.5, alvo: new THREE.Vector3(0, G0, TABLE.z), mapa: IS_QUEST ? 1024 : 2048 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.01;
  luzCeuChao(scene, { ceu: '#a9c6f2', chao: '#8a7a50', intensidade: 0.75 });
  neblina(scene, SKY.horizonte, 30, 260);

  // ---------- Colina, árvores, montanhas e castelos ao longe ----------
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x6f8f45, roughness: 0.92 });
  const groundGeo = new THREE.CircleGeometry(220, 64);
  groundGeo.rotateX(-Math.PI / 2);
  { // ondula o chão longe da mesa
    const p = groundGeo.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
      const h = r < 8 ? 0 : (Math.sin(x * 0.05) + Math.cos(z * 0.043) + Math.sin((x + z) * 0.11) * 0.5) * Math.min(1, (r - 8) / 40) * 3 - Math.min(1, r / 40) * 4;
      p.setY(i, h);
      const k = 0.85 + hash(i) * 0.25;
      col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k * 0.95;
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    groundGeo.computeVertexNormals();
  }
  grassMat.vertexColors = true;
  const ground = new THREE.Mesh(groundGeo, grassMat);
  ground.receiveShadow = true;
  scene.add(ground);
  const tuft = new THREE.ConeGeometry(0.04, 0.12, 5); tuft.translate(0, 0.06, 0);
  scene.add(espalhar(tuft, new THREE.MeshStandardMaterial({ color: 0x7e9a48, roughness: 0.9 }), 500, { raio: 9, raioMin: 1.6, semente: 3 }));
  const flower = new THREE.SphereGeometry(0.025, 6, 4); flower.translate(0, 0.08, 0);
  scene.add(espalhar(flower, new THREE.MeshStandardMaterial({ color: 0xf2d16b, roughness: 0.6 }), 120, { raio: 8, raioMin: 1.8, semente: 9 }));
  const stoneGeo = new THREE.IcosahedronGeometry(0.12, 1);
  scene.add(espalhar(stoneGeo, new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.9, flatShading: true }), 40, { raio: 10, raioMin: 2, escala: [0.4, 1.3], semente: 5, sombra: true }));
  // árvores (copa em dois cones, tronco)
  const treeGroup = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1.6, 7); trunkGeo.translate(0, 0.8, 0);
  const crownGeo = new THREE.ConeGeometry(1.0, 2.4, 8); crownGeo.translate(0, 2.6, 0);
  const crown2 = new THREE.ConeGeometry(0.75, 1.8, 8); crown2.translate(0, 3.6, 0);
  const trunks = espalhar(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.9 }), 60, { raio: 45, raioMin: 7, semente: 21, sombra: true });
  const crowns = espalhar(crownGeo, new THREE.MeshStandardMaterial({ color: 0x46703a, roughness: 0.85, flatShading: true }), 60, { raio: 45, raioMin: 7, semente: 21, sombra: true });
  const crowns2 = espalhar(crown2, new THREE.MeshStandardMaterial({ color: 0x568540, roughness: 0.85, flatShading: true }), 60, { raio: 45, raioMin: 7, semente: 21 });
  treeGroup.add(trunks, crowns, crowns2);
  scene.add(treeGroup);
  // montanhas
  const mtnMat = new THREE.MeshStandardMaterial({ color: 0x7b8fa8, roughness: 1, flatShading: true });
  for (let k = 0; k < 14; k++) {
    const a = k / 14 * Math.PI * 2 + 0.2, r = 150 + hash(k + 7) * 50;
    const m = new THREE.Mesh(new THREE.ConeGeometry(30 + hash(k) * 30, 30 + hash(k + 3) * 40, 6), mtnMat);
    m.position.set(Math.cos(a) * r, 5, Math.sin(a) * r);
    m.rotation.y = hash(k + 11) * 3;
    scene.add(m);
  }
  // castelos de verdade nas colinas (silhuetas): um azul atrás de você, um vermelho lá na frente
  for (const [x, z, team] of [[-14, 30, 0], [10, -42, 1], [-36, -55, 1], [30, 18, 0]]) {
    const c = new THREE.Group();
    const wall = new THREE.MeshStandardMaterial({ color: 0xc9bca6, roughness: 0.9 });
    const roof = new THREE.MeshStandardMaterial({ color: team ? 0x9a3a2e : 0x3a5a9a, roughness: 0.8 });
    const keep = new THREE.Mesh(new THREE.BoxGeometry(4, 5, 4), wall); keep.position.y = 2.5; c.add(keep);
    for (const [dx, dz] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.1, 7, 10), wall); t.position.set(dx, 3.5, dz); c.add(t);
      const cn = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.4, 10), roof); cn.position.set(dx, 8.2, dz); c.add(cn);
    }
    const w = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 8), wall); w.position.y = 1.5; c.add(w);
    c.position.set(x, -1.5, z);
    c.lookAt(0, -1.5, 0);
    scene.add(c);
  }

  // ---------- Mesa ----------
  const tableMat = CAN_TEX ? madeira({ clara: '#a8743f', escura: '#5e3a1c', tabuas: 6, verniz: 0.25, repete: [1, 2], leve: IS_QUEST }) : new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.7 });
  const top = new THREE.Mesh(caixaArredondada(TABLE.w, 0.05, TABLE.d, 0.012, 2), tableMat);
  top.position.set(TABLE.x, TABLE.top - 0.025, TABLE.z);
  top.castShadow = top.receiveShadow = true;
  scene.add(top);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.75 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(caixaArredondada(0.07, TABLE.top - 0.05, 0.07, 0.01, 2), legMat);
    leg.position.set(TABLE.x + sx * (TABLE.w / 2 - 0.08), (TABLE.top - 0.05) / 2, TABLE.z + sz * (TABLE.d / 2 - 0.08));
    leg.castShadow = true;
    scene.add(leg);
  }
  const tShadow = sombraContato(TABLE.w * 1.3, TABLE.d * 1.15, 0.5);
  tShadow.position.set(TABLE.x, 0.004, TABLE.z);
  scene.add(tShadow);

  // ---------- Maquete: base de grama, rio e ponte ----------
  const baseW = NX * CS + 0.2, baseD = (NZ + 4) * CS;
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x86a552, roughness: 0.9, vertexColors: true });
  const baseGeo = escurecerBase(caixaArredondada(baseW, 0.03, baseD, 0.008, 2), { altura: 0.03, forca: 0.5 });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.set(OX + NX * CS / 2, TABLE.top + 0.015, OZ + (NZ / 2) * CS);
  base.receiveShadow = true;
  scene.add(base);
  const riverMat = new THREE.MeshStandardMaterial({ color: 0x3f8db0, roughness: 0.15, metalness: 0, emissive: 0x0a2030 });
  const river = new THREE.Mesh(new THREE.BoxGeometry(baseW - 0.004, 0.006, 2.2 * CS), riverMat);
  river.position.set(base.position.x, G0 - 0.0015, OZ + 15 * CS);
  scene.add(river);
  const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x8a6038, roughness: 0.8 });
  for (let k = 0; k < 6; k++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(CS * 1.4, 0.006, CS * 0.42), bridgeMat);
    plank.position.set(OX + 9.5 * CS, G0 + 0.006 + Math.sin(k / 5 * Math.PI) * 0.01, OZ + (13.9 + k * 0.45) * CS);
    plank.castShadow = true;
    scene.add(plank);
  }
  // arvorezinhas e moitas nas margens da maquete
  const miniTree = new THREE.Group();
  for (let k = 0; k < 18; k++) {
    const side = k % 2 ? 1 : -1;
    const z = OZ + (1 + hash(k + 40) * 28) * CS;
    if (z > OZ + 12 * CS && z < OZ + 18 * CS && hash(k) < 0.5) continue;
    const x = side < 0 ? OX - 0.045 - hash(k + 3) * 0.04 : OX + NX * CS + 0.045 + hash(k + 3) * 0.04;
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 6), new THREE.MeshStandardMaterial({ color: 0x3f6a34, roughness: 0.85, flatShading: true }));
    t.position.set(x, G0 + 0.05, z);
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.02, 5), legMat);
    tr.position.set(x, G0 + 0.01, z);
    t.castShadow = true;
    miniTree.add(t, tr);
  }
  scene.add(miniTree);

  // ---------- Blocos (instâncias) ----------
  const bGeo = caixaArredondada(CS * 0.97, CS * 0.97, CS * 0.97, CS * 0.08, IS_QUEST ? 1 : 2);
  const woodMat = CAN_TEX ? madeira({ clara: '#d8a668', escura: '#8a5a2e', tabuas: 2, verniz: 0.1, leve: true, semente: 8 }) : new THREE.MeshStandardMaterial({ color: 0xc8955a, roughness: 0.75 });
  const stoneMat = CAN_TEX ? pedra({ tipo: 'calcada', cor: '#b6b0a4', escura: '#827c72', pedras: 3, leve: true }) : new THREE.MeshStandardMaterial({ color: 0xa8a296, roughness: 0.9 });
  const rockMat = CAN_TEX ? pedra({ tipo: 'rocha', cor: '#7e766c', escura: '#4e4842', leve: true, semente: 4 }) : new THREE.MeshStandardMaterial({ color: 0x6e665c, roughness: 0.95 });
  const MAXB = 800;
  const inst = {};
  for (const [t, mat] of [[WOOD, woodMat], [STONE, stoneMat], [ROCK, rockMat]]) {
    const m = new THREE.InstancedMesh(bGeo, mat, MAXB);
    m.castShadow = m.receiveShadow = true;
    m.count = 0;
    m.frustumCulled = false;
    m.setColorAt(0, new THREE.Color(1, 1, 1));
    m.userData.type = t;
    inst[t] = m;
    scene.add(m);
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color(), _e = new THREE.Euler();
  // offset(i) devolve quanto o bloco ainda está acima do lugar final (animação de queda), em casas
  function setGrid(g, offset = null) {
    const n = { [WOOD]: 0, [STONE]: 0, [ROCK]: 0 };
    for (let z = 0; z < NZ; z++) for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
      const i = idx(x, y, z), t = g.t[i];
      if (!t || t === KING) continue;
      const m = inst[t], k = n[t]++;
      if (k >= MAXB) continue;
      const h = hash(i);
      const off = offset ? offset(i) : 0;
      cellCenter(x, y + off, z, _p);
      _q.setFromEuler(_e.set(off ? off * 0.3 : 0, (h - 0.5) * 0.08, off ? off * 0.2 : 0));
      m.setMatrixAt(k, _m.compose(_p, _q, _s));
      let l = 0.92 + h * 0.16;
      if (t === STONE && g.hp[i] < 2) l *= 0.62;   // pedra rachada fica escura
      _c.setRGB(l, l * (t === WOOD ? 0.98 : 1), l * (t === WOOD ? 0.95 : 1));
      m.setColorAt(k, _c);
    }
    for (const t of [WOOD, STONE, ROCK]) {
      inst[t].count = Math.min(MAXB, n[t]);
      inst[t].instanceMatrix.needsUpdate = true;
      if (inst[t].instanceColor) inst[t].instanceColor.needsUpdate = true;
    }
    // reis e o marcador que flutua acima da coluna de cada um
    for (const s of [PLAYER, CPU]) {
      const k = g.kings[s], fig = kings[s], mk = markers[s];
      mk.visible = !!k && !k.down;
      if (mk.visible) {
        let top = k.y;
        for (let y = k.y; y < NY; y++) if (g.t[idx(k.x, y, k.z)]) top = y;
        toWorld(k.x + 0.5, top + 1.9, k.z + 0.5, mk.position);
        mk.userData.y0 = mk.position.y;
      }
      if (!k) { fig.visible = false; continue; }
      fig.visible = true;
      toWorld(k.x + 0.5, k.y, k.z + 0.5, fig.position);
      if (offset && !k.down) fig.position.y += offset(idx(k.x, k.y, k.z)) * CS;
      fig.rotation.set(0, s === PLAYER ? Math.PI : 0, k.down ? Math.PI / 2 : 0);
      if (k.down) fig.position.y = Math.max(G0, fig.position.y) + CS * 0.2;
    }
  }

  // ---------- Reis ----------
  const kings = [PLAYER, CPU].map((s) => {
    const fig = new THREE.Group();
    const robe = new THREE.MeshStandardMaterial({ color: TEAM[s], roughness: 0.6 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xf0c8a0, roughness: 0.7 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.3, metalness: 1 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(CS * 0.18, CS * 0.34, CS * 0.6, 12), robe); body.position.y = CS * 0.3;
    const head = new THREE.Mesh(new THREE.SphereGeometry(CS * 0.17, 12, 10), skin); head.position.y = CS * 0.72;
    const beard = new THREE.Mesh(new THREE.SphereGeometry(CS * 0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.9 })); beard.position.set(0, CS * 0.64, CS * 0.1); beard.scale.set(1, 0.8, 0.6);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(CS * 0.16, CS * 0.14, CS * 0.12, 8, 1, true), gold); crown.position.y = CS * 0.88;
    const pts = [];
    for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(CS * 0.035, CS * 0.08, 4), gold); const a = k / 5 * Math.PI * 2; sp.position.set(Math.cos(a) * CS * 0.15, CS * 0.97, Math.sin(a) * CS * 0.15); pts.push(sp); }
    const gem = new THREE.Mesh(new THREE.SphereGeometry(CS * 0.03, 6, 4), new THREE.MeshStandardMaterial({ color: 0xff3a5a, emissive: 0x801020, roughness: 0.2 })); gem.position.set(0, CS * 0.88, CS * 0.155);
    fig.add(body, head, beard, crown, gem, ...pts);
    for (const o of fig.children) o.castShadow = true;
    const h = halo('#ffe08a', CS * 2.2, 0.5); h.position.y = CS * 0.85; fig.add(h); fig.userData.halo = h;
    scene.add(fig);
    return fig;
  });

  // marcador: coroa dourada girando sobre o lugar do rei (o rei fica escondido dentro da torre)
  const markers = [PLAYER, CPU].map((s) => {
    const g = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.3, metalness: 1, emissive: 0x6a4a00 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(CS * 0.3, CS * 0.26, CS * 0.2, 10, 1, true), gold);
    g.add(band);
    for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(CS * 0.06, CS * 0.16, 4), gold); const a = k / 5 * Math.PI * 2; sp.position.set(Math.cos(a) * CS * 0.28, CS * 0.16, Math.sin(a) * CS * 0.28); g.add(sp); }
    const pin = new THREE.Mesh(new THREE.ConeGeometry(CS * 0.12, CS * 0.3, 8), new THREE.MeshStandardMaterial({ color: TEAM[s], roughness: 0.5, emissive: TEAM[s], emissiveIntensity: 0.25 }));
    pin.rotation.x = Math.PI; pin.position.y = -CS * 0.32; g.add(pin);
    const h = halo('#ffd86a', CS * 2.4, 0.6); g.add(h);
    g.scale.setScalar(2);
    g.visible = false;
    scene.add(g);
    return g;
  });

  // ---------- Catapultas ----------
  const catapults = [PLAYER, CPU].map((s) => makeCatapult(scene, s, legMat));

  // ---------- Projétil, prévia e efeitos ----------
  const ballMat = new THREE.MeshStandardMaterial({ color: 0x8c8a86, roughness: 0.85, flatShading: true });
  const bombMat = new THREE.MeshStandardMaterial({ color: 0x24242a, roughness: 0.35, metalness: 1 });
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(CS * 0.36, 1), ballMat);
  ball.castShadow = true; ball.visible = false;
  const fuse = halo('#ffb040', CS * 1.6, 1.4); fuse.position.y = CS * 0.4; fuse.visible = false; ball.add(fuse);
  scene.add(ball);
  const setBall = (ammo) => { ball.material = ammo === 'bomb' ? bombMat : ballMat; fuse.visible = ammo === 'bomb'; };

  const DOTS = 40;
  const dotMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(CS * 0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff1c0, transparent: true, opacity: 0.85, toneMapped: false }), DOTS);
  dotMesh.count = 0; dotMesh.frustumCulled = false;
  scene.add(dotMesh);
  function setPreview(path) {
    if (!path || path.length < 2) { dotMesh.count = 0; return; }
    const step = Math.max(1, Math.floor(path.length / DOTS));
    let k = 0;
    for (let i = step; i < path.length && k < DOTS; i += step) {
      const [x, y, z] = path[i];
      toWorld(x, y, z, _p);
      const sc = 1 - k / DOTS * 0.6;
      dotMesh.setMatrixAt(k++, _m.compose(_p, _q.identity(), _s.set(sc, sc, sc)));
    }
    _s.set(1, 1, 1);
    dotMesh.count = k;
    dotMesh.instanceMatrix.needsUpdate = true;
  }

  // lascas (pedaços que voam) e poeira
  const DEB = 160;
  const debris = new THREE.InstancedMesh(new THREE.BoxGeometry(CS * 0.3, CS * 0.22, CS * 0.26), new THREE.MeshStandardMaterial({ roughness: 0.8 }), DEB);
  debris.count = DEB; debris.frustumCulled = false; debris.castShadow = true;
  const debState = Array.from({ length: DEB }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), w: new THREE.Vector3() }));
  for (let i = 0; i < DEB; i++) { debris.setMatrixAt(i, _m.makeScale(0, 0, 0)); debris.setColorAt(i, _c.set(0xffffff)); }
  scene.add(debris);
  let debNext = 0;
  function burst(pos, type, n = 8, power = 1) {
    const col = type === STONE ? 0xa8a296 : type === ROCK ? 0x6e665c : type === KING ? 0xf2c14e : 0xc8955a;
    for (let k = 0; k < n; k++) {
      const i = debNext++ % DEB, d = debState[i];
      d.life = 1.6 + Math.random() * 0.8;
      d.p.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * CS, (Math.random() - 0.5) * CS, (Math.random() - 0.5) * CS));
      d.v.set((Math.random() - 0.5) * 0.9, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 0.9).multiplyScalar(power);
      d.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      d.w.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
      debris.setColorAt(i, _c.set(col).multiplyScalar(0.8 + Math.random() * 0.3));
    }
    debris.instanceColor.needsUpdate = true;
  }
  const PUFFS = 24;
  const puffMat = new THREE.SpriteMaterial({ map: halo('#ffffff', 1).material.map, color: 0xd8c8b0, transparent: true, opacity: 0.6, depthWrite: false });
  const puffs = Array.from({ length: PUFFS }, () => { const s = new THREE.Sprite(puffMat.clone()); s.visible = false; scene.add(s); return { s, life: 0, max: 1 }; });
  let puffNext = 0;
  function dust(pos, size = 0.12, color = 0xd8c8b0, life = 1.2) {
    for (let k = 0; k < 3; k++) {
      const p = puffs[puffNext++ % PUFFS];
      p.s.visible = true; p.life = p.max = life * (0.8 + Math.random() * 0.4);
      p.s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.04, Math.random() * 0.03, (Math.random() - 0.5) * 0.04));
      p.s.material.color.set(color);
      p.s.userData.size = size * (0.7 + Math.random() * 0.6);
    }
  }
  const flash = halo('#ffb050', 0.6, 2.2); flash.visible = false; scene.add(flash);
  let flashT = 0;
  function boom(pos) { flash.position.copy(pos); flash.visible = true; flashT = 0.35; dust(pos, 0.25, 0x5a5048, 1.6); }

  // ---------- Bandeira do vento (no meio do campo, na margem) ----------
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.32, 6), new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.7 }));
  const poleBase = new THREE.Vector3(OX - 0.06, G0, OZ + 15 * CS);
  pole.position.copy(poleBase).add(new THREE.Vector3(0, 0.16, 0));
  pole.castShadow = true;
  scene.add(pole);
  const flagGeo = new THREE.PlaneGeometry(0.12, 0.07, 8, 3); flagGeo.translate(0.06, 0, 0);
  const flagPos0 = flagGeo.attributes.position.array.slice();
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: 0xf2e6c8, roughness: 0.8, side: THREE.DoubleSide }));
  flag.position.copy(poleBase).add(new THREE.Vector3(0, 0.28, 0));
  flag.castShadow = true;
  scene.add(flag);
  const windLabel = new Label(0.2, 256, 80);
  windLabel.mesh.position.copy(poleBase).add(new THREE.Vector3(0, 0.38, 0));
  scene.add(windLabel.mesh);
  let wind = 0;
  function setWind(w) {
    wind = w;
    const arrow = w > 0 ? '→'.repeat(w) : w < 0 ? '←'.repeat(-w) : '·';
    windLabel.set([{ text: 'Vento', size: 0.35, color: '#7a5a2a' }, { text: w === 0 ? 'calmo' : `${arrow} ${Math.abs(w)}`, size: 0.5 }]);
  }

  // ---------- Fantasma do bloco de conserto e bandeja ----------
  const ghost = new THREE.Mesh(bGeo, new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.45, depthWrite: false }));
  ghost.visible = false;
  scene.add(ghost);
  const repairBlock = new THREE.Mesh(bGeo, woodMat);
  repairBlock.castShadow = true;
  repairBlock.visible = false;
  scene.add(repairBlock);
  const trayPos = toWorld(NX + 1.6, 0.4, 28.5);
  const tray = new THREE.Mesh(caixaArredondada(0.12, 0.012, 0.12, 0.004, 2), legMat);
  tray.position.copy(trayPos).add(new THREE.Vector3(0, -0.02, 0));
  tray.castShadow = tray.receiveShadow = true;
  scene.add(tray);
  // placa "Pular" ao lado da bandeja
  const skipLabel = new Label(0.11, 256, 96);
  skipLabel.set([{ text: 'Pular', size: 0.6 }]);
  skipLabel.mesh.position.copy(trayPos).add(new THREE.Vector3(0, 0.04, 0.1));
  skipLabel.mesh.rotation.x = -0.9;
  skipLabel.mesh.userData = { kind: 'skip' };
  scene.add(skipLabel.mesh);

  // ---------- Cestos de munição (pedra e bomba), do lado esquerdo da catapulta ----------
  const baskets = {};
  for (const [ammo, dx] of [['stone', -2.6], ['bomb', -4.4]]) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.05, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x9a7040, roughness: 0.9, side: THREE.DoubleSide }));
    b.position.y = 0.025;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12), b.material); bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.002;
    g.add(b, bottom);
    for (let k = 0; k < (ammo === 'bomb' ? 2 : 5); k++) {
      const s = new THREE.Mesh(ball.geometry, ammo === 'bomb' ? bombMat : ballMat);
      s.position.set((hash(k + 1) - 0.5) * 0.04, 0.035 + (k > 2 ? 0.015 : 0), (hash(k + 5) - 0.5) * 0.04);
      s.castShadow = true;
      g.add(s);
      g.userData.balls = (g.userData.balls || []).concat(s);
    }
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 10), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.04;
    hit.userData = { kind: 'ammo', ammo };
    g.add(hit);
    g.userData.hit = hit;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.004, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffd24a, toneMapped: false }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.052; ring.visible = false;
    g.add(ring); g.userData.ring = ring;
    const lab = new Label(0.11, 256, 80);
    lab.mesh.position.set(0, 0.12, 0);
    g.add(lab.mesh); g.userData.label = lab;
    toWorld(CATAPULT[PLAYER].x + 0.5 + dx, 0, CATAPULT[PLAYER].z + 0.6, g.position);
    scene.add(g);
    baskets[ammo] = g;
  }
  function setAmmo(ammo, bombs, show = true) {
    for (const [k, g] of Object.entries(baskets)) {
      g.visible = show;
      g.userData.ring.visible = k === ammo;
      if (k === 'bomb') g.userData.balls.forEach((b, i) => { b.visible = i < bombs; });
      g.userData.label.set([{ text: k === 'bomb' ? `Bomba: ${bombs}` : 'Pedra', size: 0.55, color: k === ammo ? '#b03a10' : '#4a3a2a' }]);
    }
  }

  // ---------- Animação contínua ----------
  function animate(dt, time) {
    // bandeira tremula na direção do vento
    const p = flagGeo.attributes.position;
    const amp = 0.004 + Math.abs(wind) * 0.002;
    for (let i = 0; i < p.count; i++) {
      const x = flagPos0[i * 3], y = flagPos0[i * 3 + 1];
      p.setXYZ(i, x, y - (wind === 0 ? x * 0.4 : 0), Math.sin(x * 60 - time * (6 + Math.abs(wind) * 2)) * amp * (x / 0.12));
    }
    p.needsUpdate = true;
    flag.rotation.y = wind > 0 ? 0 : wind < 0 ? Math.PI : Math.PI / 2;
    // lascas
    let any = false;
    for (let i = 0; i < DEB; i++) {
      const d = debState[i];
      if (d.life <= 0) continue;
      any = true;
      d.life -= dt;
      d.v.y -= 2.2 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y < G0 + CS * 0.1) { d.p.y = G0 + CS * 0.1; d.v.multiplyScalar(0.4); d.v.y = Math.abs(d.v.y) * 0.3; d.w.multiplyScalar(0.5); }
      d.r.addScaledVector(d.w, dt);
      const sc = d.life > 0.4 ? 1 : d.life / 0.4;
      debris.setMatrixAt(i, _m.compose(d.p, _q.setFromEuler(_e.set(d.r.x, d.r.y, d.r.z)), _s.set(sc, sc, sc)));
      if (d.life <= 0) debris.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
    _s.set(1, 1, 1);
    if (any) debris.instanceMatrix.needsUpdate = true;
    for (const pf of puffs) {
      if (pf.life <= 0) continue;
      pf.life -= dt;
      const k = 1 - pf.life / pf.max;
      pf.s.scale.setScalar(pf.s.userData.size * (0.4 + k));
      pf.s.position.y += dt * 0.03;
      pf.s.material.opacity = 0.55 * (1 - k);
      if (pf.life <= 0) pf.s.visible = false;
    }
    if (flashT > 0) { flashT -= dt; flash.material.opacity = Math.max(0, flashT / 0.35); flash.scale.setScalar(0.6 + (0.35 - flashT) * 1.2); if (flashT <= 0) flash.visible = false; }
    for (const s of [PLAYER, CPU]) {
      const h = kings[s].userData.halo; h.material.opacity = 0.5 + Math.sin(time * 3) * 0.2;
      const mk = markers[s]; mk.rotation.y = time * 1.2; if (mk.userData.y0 != null) mk.position.y = mk.userData.y0 + Math.sin(time * 2 + s) * CS * 0.12;
    }
    for (const c of catapults) c.animate(dt);
  }

  function setLabelsVisible(v) {
    windLabel.mesh.visible = v;
    for (const g of Object.values(baskets)) g.userData.label.mesh.visible = v;
    if (!v) skipLabel.mesh.visible = false;
  }

  return {
    setLabelsVisible, markers,
    scene, sun, inst, kings, catapults, ball, setBall, setPreview, burst, dust, boom, setWind, setGrid,
    ghost, repairBlock, trayPos, skipLabel, baskets, setAmmo, animate,
  };
}

// Catapulta de madeira: base que gira (mira), braço com a concha que puxa para trás (força).
function makeCatapult(scene, side, woodMat) {
  const c = CATAPULT[side];
  const root = new THREE.Group();
  toWorld(c.x + 0.5, 0, c.z, root.position);
  root.rotation.y = side === PLAYER ? 0 : Math.PI;   // a frente (para onde atira) é -z no grupo
  scene.add(root);
  const yawG = new THREE.Group(); root.add(yawG);
  const beam = (w, h, d) => { const m = new THREE.Mesh(caixaArredondada(w, h, d, Math.min(w, h, d) * 0.2, 1), woodMat); m.castShadow = true; return m; };
  const L = CS * 2.6;
  const base1 = beam(0.012, 0.012, L), base2 = beam(0.012, 0.012, L);
  base1.position.set(-CS * 0.7, 0.006, 0); base2.position.set(CS * 0.7, 0.006, 0);
  const cross1 = beam(CS * 1.5, 0.01, 0.012); cross1.position.set(0, 0.01, -L * 0.4);
  const cross2 = beam(CS * 1.5, 0.01, 0.012); cross2.position.set(0, 0.01, L * 0.4);
  yawG.add(base1, base2, cross1, cross2);
  // rodinhas
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.8 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 12), wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(sx * CS * 0.82, 0.014, sz * L * 0.36); w.castShadow = true;
    yawG.add(w);
  }
  // cavaletes em A
  const axleY = CS * 1.35;
  for (const sx of [-1, 1]) {
    const a = beam(0.01, axleY * 1.15, 0.01); a.position.set(sx * CS * 0.6, axleY / 2, -0.018); a.rotation.x = 0.35;
    const b = beam(0.01, axleY * 1.15, 0.01); b.position.set(sx * CS * 0.6, axleY / 2, 0.018); b.rotation.x = -0.35;
    yawG.add(a, b);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, CS * 1.4, 8), new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 1, roughness: 0.4 }));
  axle.rotation.z = Math.PI / 2; axle.position.y = axleY;
  yawG.add(axle);
  // braço
  const arm = new THREE.Group(); arm.position.y = axleY; yawG.add(arm);
  const ARM = CS * 2.2;
  const stick = beam(0.011, 0.011, ARM); stick.position.z = ARM / 2 - CS * 0.5; arm.add(stick);
  const cup = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), woodMat);
  cup.rotation.x = Math.PI; cup.position.set(0, 0.012, ARM - CS * 0.55); cup.castShadow = true;
  cup.material = woodMat;
  arm.add(cup);
  const weight = new THREE.Mesh(caixaArredondada(0.04, 0.035, 0.03, 0.006, 1), new THREE.MeshStandardMaterial({ color: 0x6e6a64, roughness: 0.9 }));
  weight.position.set(0, -0.012, -CS * 0.6); weight.castShadow = true;
  arm.add(weight);
  const flagC = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.02), new THREE.MeshStandardMaterial({ color: TEAM[side], side: THREE.DoubleSide, roughness: 0.7 }));
  flagC.position.set(-CS * 0.6, axleY * 1.3, -0.02);
  yawG.add(flagC);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.003, 6, 20), new THREE.MeshBasicMaterial({ color: 0xffd24a, toneMapped: false }));
  ring.visible = false;
  scene.add(ring);
  const shadow = sombraContato(CS * 2.4, L * 1.3, 0.4); shadow.position.y = 0.002; root.add(shadow);

  // ângulo do braço: pronto = -0.2 (a concha atrás e embaixo, carregada) ... puxado = +1.1
  // (rotação em x: concha para trás = para +z no grupo)
  const st = { yaw: 0, power: 0, swing: 0, armA: 0.35, target: 0.35 };
  const REST = 0.35, PULLED = 1.25, FIRED = -2.3;
  function setAim(yaw, power) {
    st.yaw = yaw; st.power = power;
    yawG.rotation.y = side === PLAYER ? -yaw : -yaw;
    st.target = REST + (PULLED - REST) * power;
  }
  function release() { st.swing = 0.6; }
  function animate(dt) {
    if (st.swing > 0) {
      st.swing -= dt;
      const k = 1 - st.swing / 0.6;
      st.armA = k < 0.25 ? st.armA + (FIRED - st.armA) * Math.min(1, dt * 30) : st.armA + (REST - st.armA) * Math.min(1, dt * 4);
    } else st.armA += (st.target - st.armA) * Math.min(1, dt * 14);
    arm.rotation.x = st.armA;
  }
  // posição da concha no mundo (para pegar com a mão)
  const cupWorld = (out = new THREE.Vector3()) => cup.getWorldPosition(out);
  const pivotWorld = (out = new THREE.Vector3()) => arm.getWorldPosition(out);
  return { root, yawG, arm, cup, ring, setAim, release, animate, cupWorld, pivotWorld, st };
}
