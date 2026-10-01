// Escritório 3D MinhaImob — Three.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { db } from './db.js';
import { $, $$, esc, brlK, num, toast } from './ui.js';
import { AGENTS, runTarefa } from './engine/agents.js';
import { forecast } from './engine/scoring.js';
import { mountChat } from './views/ia.js';
import { mountFeed } from './views/time.js';
import { bus } from './engine/orquestrador.js';
import { iniciarSociedade, socBus } from './sociedade/navegador.js';

const ctx = { db, data: null, async refresh() { ctx.data = await db.loadAll(); return ctx.data; }, go: (r) => (location.href = 'app.html#/' + r) };
window.__mi = ctx;

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const ok = await db.init({ requireAuth: true });
if (!ok) throw new Error('auth');
if (db.mode === 'local' && !db.store.t('empreendimentos').length && !localStorage.getItem('mi_seeded')) { await db.rpc('fn_seed_demo'); localStorage.setItem('mi_seeded', '1'); }
await ctx.refresh();
db.realtime();
db.on(async (t) => { if (/^agent_/.test(t)) return; await ctx.refresh(); drawWall(); hudKpis(); });

const host = $('#scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch {
  $('#loading').innerHTML = '<div class="center card" style="max-width:420px"><h2>WebGL indisponível</h2><p class="muted mt-s">Seu navegador não suporta 3D. Use os Corretores IA na versão 2D.</p><a class="btn primary mt" href="app.html#/ia">Abrir Corretores IA</a></div>';
  throw new Error('webgl');
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace = THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);

const labels = new CSS2DRenderer();
labels.setSize(innerWidth, innerHeight);
Object.assign(labels.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
host.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070a11);
scene.fog = new THREE.Fog(0x070a11, 48, 90);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 200);
const HOME = { pos: new THREE.Vector3(1.5, 12.5, 17.5), target: new THREE.Vector3(1.5, 0.6, -0.5) };
camera.position.copy(HOME.pos);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME.target);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = 1.38;
controls.minDistance = 5;
controls.maxDistance = 48;
controls.update();

// ---------------------------------------------------------------------------
// Materiais e helpers
// ---------------------------------------------------------------------------
const M = {
  floor: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.1 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x232b3c, roughness: 0.9 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 0.55 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.6 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x9aa3b5, roughness: 0.35, metalness: 0.8 }),
  black: new THREE.MeshStandardMaterial({ color: 0x0d1018, roughness: 0.5, metalness: 0.3 }),
  chair: new THREE.MeshStandardMaterial({ color: 0x222a3b, roughness: 0.8 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9fc3ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.12, depthWrite: false }),
  frame: new THREE.MeshStandardMaterial({ color: 0x2b3446, roughness: 0.4, metalness: 0.6 }),
  sofa: new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 0.9 }),
  pot: new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.7 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x2f6b45, roughness: 0.8, flatShading: true }),
  gold: new THREE.MeshStandardMaterial({ color: 0xd9a55b, roughness: 0.3, metalness: 0.7, emissive: 0x3a2508, emissiveIntensity: 0.4 }),
  light: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1d6, emissiveIntensity: 1.6 }),
};
function box(w, h, d, mat, x = 0, y = 0, z = 0, parent = scene, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true;
  parent.add(m);
  return m;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { tex: t, canvas: c, g };
}

// ---------------------------------------------------------------------------
// Luzes
// ---------------------------------------------------------------------------
scene.add(new THREE.HemisphereLight(0xb8c8ff, 0x3a2a18, 1.25));
scene.add(new THREE.AmbientLight(0x404a66, 0.6));
const sun = new THREE.DirectionalLight(0xfff0dd, 2.1);
sun.position.set(-14, 22, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 16, bottom: -16, near: 1, far: 70 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);
[[-6, -4], [6, -4], [-5, 4], [5, 4], [14.5, 6], [-13, 8]].forEach(([x, z]) => {
  const p = new THREE.PointLight(0xffd9a8, 16, 13, 2);
  p.position.set(x, 4.2, z);
  scene.add(p);
});

// ---------------------------------------------------------------------------
// Ambiente: piso, paredes, skyline, painel ao vivo
// ---------------------------------------------------------------------------
const FW = 38, FD = 26;
const floorTex = canvasTex(1024, 1024, (g, w, h) => {
  g.fillStyle = '#2a2018'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 64) for (let x = (y / 64) % 2 ? -128 : 0; x < w; x += 256) {
    g.fillStyle = `hsl(28, 22%, ${30 + Math.random() * 6}%)`; g.fillRect(x + 1, y + 1, 254, 62);
  }
});
floorTex.tex.wrapS = floorTex.tex.wrapT = THREE.RepeatWrapping;
floorTex.tex.repeat.set(4, 3);
M.floor.map = floorTex.tex;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(FW, FD), M.floor);
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
// tapete do lounge e da área de trabalho
const rug = new THREE.Mesh(new THREE.PlaneGeometry(7, 5), new THREE.MeshStandardMaterial({ color: 0x2b2f3d, roughness: 1 }));
rug.rotation.x = -Math.PI / 2; rug.position.set(-13, 0.01, 7.5); rug.receiveShadow = true; scene.add(rug);

// paredes
box(FW, 4.6, 0.3, M.wall, 0, 2.3, -FD / 2);            // fundo
box(0.3, 4.6, FD, M.wall, FW / 2, 2.3, 0);             // direita
// parede de vidro à esquerda
for (let z = -FD / 2; z <= FD / 2; z += 3.25) box(0.12, 4.6, 0.12, M.frame, -FW / 2, 2.3, z);
box(0.12, 0.12, FD, M.frame, -FW / 2, 4.55, 0); box(0.12, 0.25, FD, M.frame, -FW / 2, 0.12, 0);
const glassWall = new THREE.Mesh(new THREE.PlaneGeometry(FD, 4.6), M.glass);
glassWall.rotation.y = Math.PI / 2; glassWall.position.set(-FW / 2, 2.3, 0); scene.add(glassWall);

// skyline noturna com mar (São Luís)
const sky = canvasTex(2048, 640, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#0b1230'); gr.addColorStop(0.5, '#23305e'); gr.addColorStop(0.7, '#7a4a5e'); gr.addColorStop(0.72, '#0b1324'); gr.addColorStop(1, '#050811');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.6})`; g.fillRect(Math.random() * w, Math.random() * h * 0.45, 1.5, 1.5); }
  const horizon = h * 0.71;
  for (let x = 0; x < w;) {
    const bw = 30 + Math.random() * 70, bh = 60 + Math.random() * (Math.random() < 0.15 ? 300 : 170);
    g.fillStyle = `hsl(225, 25%, ${7 + Math.random() * 5}%)`; g.fillRect(x, horizon - bh, bw, bh);
    for (let wy = horizon - bh + 8; wy < horizon - 6; wy += 11) for (let wx = x + 5; wx < x + bw - 5; wx += 9) {
      if (Math.random() < 0.38) { g.fillStyle = Math.random() < 0.8 ? `rgba(255,${200 + Math.random() * 40},${130 + Math.random() * 60},${0.5 + Math.random() * 0.5})` : 'rgba(150,200,255,.7)'; g.fillRect(wx, wy, 4, 6); }
    }
    x += bw + 4 + Math.random() * 14;
  }
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,200,140,${Math.random() * 0.18})`; g.fillRect(Math.random() * w, horizon + 4 + Math.random() * (h - horizon), 2 + Math.random() * 20, 1); }
});
const skyline = new THREE.Mesh(new THREE.PlaneGeometry(60, 18.75), new THREE.MeshBasicMaterial({ map: sky.tex, fog: false }));
skyline.rotation.y = Math.PI / 2; skyline.position.set(-34, 5, 0); scene.add(skyline);

// logo na parede direita
const logo = canvasTex(1024, 256, (g, w, h) => {
  g.fillStyle = '#151b28'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#D9A55B'; g.font = '600 120px Fraunces, Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('MinhaImob', w / 2, h / 2 - 10);
  g.font = '700 30px Manrope, sans-serif'; g.fillStyle = '#7F8BA3'; g.fillText('VENDA IMÓVEIS COMO ÁGUA', w / 2, h / 2 + 78);
});
const logoMesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshStandardMaterial({ map: logo.tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: logo.tex, emissiveIntensity: 0.35 }));
logoMesh.rotation.y = -Math.PI / 2; logoMesh.position.set(FW / 2 - 0.17, 2.9, 2); scene.add(logoMesh);

// painel ao vivo (parede do fundo)
const wall = canvasTex(1536, 640, () => {});
const wallMesh = new THREE.Mesh(new THREE.PlaneGeometry(12, 5), new THREE.MeshStandardMaterial({ map: wall.tex, emissive: 0xffffff, emissiveMap: wall.tex, emissiveIntensity: 0.9, roughness: 0.4 }));
wallMesh.position.set(0, 2.55, -FD / 2 + 0.17); scene.add(wallMesh);
box(12.3, 5.3, 0.08, M.black, 0, 2.55, -FD / 2 + 0.12);
const ticker = [];
function logTicker(t) { ticker.unshift({ t, at: Date.now() }); ticker.splice(7); drawWall(); }
function drawWall() {
  const g = wall.g, w = wall.canvas.width, h = wall.canvas.height, d = ctx.data;
  const fc = forecast(d.deals);
  g.fillStyle = '#0b1020'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#D9A55B'; g.font = '800 34px Manrope, sans-serif'; g.fillText('PAINEL AO VIVO', 48, 64);
  g.fillStyle = '#7F8BA3'; g.font = '600 24px Manrope, sans-serif'; g.fillText(new Date().toLocaleString('pt-BR', { weekday: 'long', hour: '2-digit', minute: '2-digit' }), 330, 64);
  const kpis = [['FORECAST', brlK(fc.ponderado)], ['LEADS QUENTES', String(d.leads.filter((l) => ['quente', 'fervendo'].includes(l.temperatura)).length)], ['NEGÓCIOS ABERTOS', String(fc.abertos)], ['UNIDADES DISPONÍVEIS', String(d.unidades.filter((u) => u.status === 'disponivel').length)]];
  kpis.forEach(([l, v], i) => {
    const x = 48 + i * 366, y = 100;
    g.fillStyle = '#141b2e'; roundRect(g, x, y, 340, 170, 20); g.fill();
    g.fillStyle = '#7F8BA3'; g.font = '700 22px Manrope, sans-serif'; g.fillText(l, x + 26, y + 46);
    g.fillStyle = '#EFC27E'; g.font = '600 64px Fraunces, Georgia, serif'; g.fillText(v, x + 26, y + 126);
  });
  g.fillStyle = '#E9EDF5'; g.font = '800 24px Manrope, sans-serif'; g.fillText('ATIVIDADE DO TIME', 48, 330);
  const linhas = [...ticker.map((x) => x.t), ...d.activities.slice(0, 6).map((a) => `${a.tipo}: ${a.titulo || ''}`)].slice(0, 7);
  g.font = '600 26px Manrope, sans-serif';
  linhas.forEach((t, i) => { g.fillStyle = i === 0 && ticker.length ? '#39C98A' : '#B8C2D6'; g.fillText('• ' + String(t).slice(0, 92), 48, 378 + i * 36); });
  wall.tex.needsUpdate = true;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// ---------------------------------------------------------------------------
// Mobiliário
// ---------------------------------------------------------------------------
function plant(x, z, s = 1) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * s, 0.22 * s, 0.5 * s, 16), M.pot); pot.position.y = 0.25 * s; pot.castShadow = true; g.add(pot);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry((0.32 + Math.random() * 0.18) * s, 0), M.leaf);
    f.position.set((Math.random() - 0.5) * 0.35 * s, (0.75 + i * 0.28) * s, (Math.random() - 0.5) * 0.35 * s); f.castShadow = true; g.add(f);
  }
  g.position.set(x, 0, z); scene.add(g);
}
function chair(x, z, rotY) {
  const g = new THREE.Group();
  box(0.55, 0.08, 0.52, M.chair, 0, 0.48, 0, g);
  box(0.55, 0.62, 0.07, M.chair, 0, 0.86, -0.24, g);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42), M.metal); stem.position.y = 0.24; g.add(stem);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 5), M.black); base.position.y = 0.03; g.add(base);
  g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
  return g;
}

const DESKS = {};
function desk(agent) {
  const [x, z] = agent.mesa;
  const facing = z < 0 ? 1 : -1;            // +1: agente olha para +z (para a câmera)
  const g = new THREE.Group();
  box(2.4, 0.06, 1.15, M.wood, 0, 0.76, 0, g);
  [[-1.1, -0.5], [1.1, -0.5], [-1.1, 0.5], [1.1, 0.5]].forEach(([lx, lz]) => box(0.05, 0.76, 0.05, M.metal, lx, 0.38, lz, g));
  box(2.3, 0.3, 0.03, M.woodDark, 0, 0.6, 0.55 * facing, g, false);
  // monitores
  const scr = canvasTex(320, 192, () => {});
  const monZ = 0.28 * facing;
  [-0.42, 0.42].forEach((mx, i) => {
    const mon = new THREE.Group();
    box(0.78, 0.47, 0.035, M.black, 0, 0, 0, mon);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.43), new THREE.MeshStandardMaterial({ map: scr.tex, emissive: 0xffffff, emissiveMap: scr.tex, emissiveIntensity: i === 0 ? 1 : 0.75 }));
    s.position.z = -0.02 * facing; s.rotation.y = facing > 0 ? Math.PI : 0; mon.add(s);
    box(0.05, 0.22, 0.05, M.metal, 0, -0.33, 0, mon);
    mon.position.set(mx, 1.13, monZ); mon.rotation.y = (facing > 0 ? 0 : 0) + (i === 0 ? 0.12 : -0.12) * -facing;
    g.add(mon);
  });
  box(0.48, 0.02, 0.16, M.black, 0, 0.8, -0.05 * facing, g);
  // plaquinha com a cor do agente
  box(0.5, 0.12, 0.02, new THREE.MeshStandardMaterial({ color: agent.cor, emissive: agent.cor, emissiveIntensity: 0.4 }), 0.8, 0.85, 0.5 * facing, g);
  g.position.set(x, 0, z); scene.add(g);
  const seat = new THREE.Vector3(x, 0, z - 0.85 * facing);
  chair(seat.x, seat.z - 0.08 * facing, facing > 0 ? 0 : Math.PI);
  DESKS[agent.id] = { x, z, facing, seat, side: new THREE.Vector3(x + 1.75, 0, seat.z), scr };
}
AGENTS.forEach(desk);

// sala de reunião (vidro)
const MR = { x: 14.5, z: 6.5, w: 7, d: 7 };
const MR_DOOR_X = 12.7;
const nz = MR.z - MR.d / 2, wx = MR.x - MR.w / 2, ex = MR.x + MR.w / 2;
[[wx, MR.z, 0.1, MR.d], [MR.x, MR.z + MR.d / 2, MR.w, 0.1], [(wx + MR_DOOR_X - 0.7) / 2, nz, MR_DOOR_X - 0.7 - wx, 0.1], [(MR_DOOR_X + 0.7 + ex) / 2, nz, ex - MR_DOOR_X - 0.7, 0.1]].forEach(([x, z, w, d]) => {
  const p = new THREE.Mesh(new THREE.BoxGeometry(w, 2.8, d), M.glass); p.position.set(x, 1.4, z); scene.add(p);
  box(w, 0.06, d, M.frame, x, 2.8, z, scene, false);
});
const mesa = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.07, 40), M.wood); mesa.position.set(MR.x, 0.76, MR.z); mesa.castShadow = true; mesa.receiveShadow = true; scene.add(mesa);
const pe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 0.74, 16), M.metal); pe.position.set(MR.x, 0.37, MR.z); scene.add(pe);
const MR_SPOTS = Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2 + 0.3; return new THREE.Vector3(MR.x + Math.cos(a) * 1.85, 0, MR.z + Math.sin(a) * 1.85); });
MR_SPOTS.forEach((p) => chair(p.x, p.z, Math.atan2(MR.x - p.x, MR.z - p.z)));
const mrSign = canvasTex(512, 96, (g, w, h) => { g.fillStyle = '#0b1020'; g.fillRect(0, 0, w, h); g.fillStyle = '#EFC27E'; g.font = '800 40px Manrope, sans-serif'; g.textAlign = 'center'; g.fillText('SALA DE FECHAMENTO', w / 2, 62); });
const mrs = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.6), new THREE.MeshBasicMaterial({ map: mrSign.tex })); mrs.position.set(MR.x, 3.2, MR.z + MR.d / 2 + 0.06); scene.add(mrs);

// lounge + café
box(3.2, 0.42, 0.95, M.sofa, -13, 0.21, 9.6); box(3.2, 0.55, 0.22, M.sofa, -13, 0.6, 10.05); box(0.25, 0.6, 0.95, M.sofa, -14.6, 0.4, 9.6); box(0.25, 0.6, 0.95, M.sofa, -11.4, 0.4, 9.6);
box(1.4, 0.06, 0.8, M.wood, -13, 0.42, 7.9); box(0.08, 0.4, 0.08, M.metal, -13, 0.2, 7.9);
box(3.6, 0.95, 0.7, M.woodDark, -15.8, 0.48, 4.5); box(3.6, 0.05, 0.75, M.metal, -15.8, 0.97, 4.5);
box(0.45, 0.6, 0.45, M.black, -16.6, 1.3, 4.5); box(0.3, 0.06, 0.2, M.gold, -16.6, 1.08, 4.75);
const COFFEE = new THREE.Vector3(-15.6, 0, 5.4);
// sala de treinamento (fundo à esquerda)
const TR = { x0: -18.8, x1: -12.2, z0: -12.8, z1: -6.5, door: -15 };
[[TR.x1, (TR.z0 + TR.z1) / 2, 0.1, TR.z1 - TR.z0], [(TR.x0 + TR.door - 0.7) / 2, TR.z1, TR.door - 0.7 - TR.x0, 0.1], [(TR.door + 0.7 + TR.x1) / 2, TR.z1, TR.x1 - TR.door - 0.7, 0.1]].forEach(([x, z, w, d]) => {
  const p = new THREE.Mesh(new THREE.BoxGeometry(w, 2.8, d), M.glass); p.position.set(x, 1.4, z); scene.add(p);
  box(w, 0.06, d, M.frame, x, 2.8, z, scene, false);
});
const quadro = canvasTex(1024, 512, () => {});
const quadroMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2), new THREE.MeshStandardMaterial({ map: quadro.tex, emissive: 0xffffff, emissiveMap: quadro.tex, emissiveIntensity: 0.55, roughness: 0.5 }));
quadroMesh.position.set(-15.5, 2.0, TR.z0 - 0.02); scene.add(quadroMesh);
box(4.6, 2.4, 0.06, M.frame, -15.5, 2.0, TR.z0 - 0.06);
function drawQuadro(titulo = 'SALA DE TREINAMENTO', linhas = [], quem = '') {
  const g = quadro.g, w = 1024, h = 512;
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#A9742C'; g.font = '800 30px Manrope, sans-serif'; g.fillText('SALA DE TREINAMENTO', 40, 58);
  g.fillStyle = '#1b1f2a'; g.font = '700 42px Manrope, sans-serif'; wrap(g, titulo, 40, 118, w - 80, 48, 2);
  if (quem) { g.fillStyle = '#6e7686'; g.font = '600 24px Manrope, sans-serif'; g.fillText(quem, 40, 222); }
  g.font = '600 24px Manrope, sans-serif'; g.fillStyle = '#2a3142';
  linhas.slice(-4).forEach((l, i) => wrap(g, '• ' + l, 40, 272 + i * 58, w - 80, 28, 2));
  quadro.tex.needsUpdate = true;
}
function wrap(g, txt, x, y, maxW, lh, maxL) {
  const ws = String(txt).split(' '); let line = '', n = 0;
  for (const w of ws) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { g.fillText(n === maxL - 1 ? line + '…' : line, x, y + n * lh); n++; line = w; if (n >= maxL) return; } else line = t; }
  if (n < maxL) g.fillText(line, x, y + n * lh);
}
drawQuadro('Treinos do time acontecem aqui', ['Peça no chat: "Elisa, treine a Ana para captar leads mais quentes"']);
const TR_PROF = new THREE.Vector3(-15.5, 0, -11.5);
const TR_ALUNOS = [new THREE.Vector3(-16.5, 0, -9.2), new THREE.Vector3(-14.5, 0, -9.2)];
TR_ALUNOS.forEach((p) => chair(p.x, p.z, Math.PI));
const trSign = canvasTex(512, 96, (g, w) => { g.fillStyle = '#0b1020'; g.fillRect(0, 0, w, 96); g.fillStyle = '#C9B8FF'; g.font = '800 38px Manrope, sans-serif'; g.textAlign = 'center'; g.fillText('SALA DE TREINAMENTO', w / 2, 62); });
const trs = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.6), new THREE.MeshBasicMaterial({ map: trSign.tex })); trs.position.set(TR.door, 3.2, TR.z1 + 0.06); scene.add(trs);

// recepção
box(4, 1.05, 0.8, M.woodDark, 9, 0.52, 10.6); box(4.1, 0.05, 0.9, M.gold, 9, 1.07, 10.6, scene, false);
[[-17.6, -5.6], [17, -11], [-17, 11.5], [4, 11.5], [-12, -2.3], [0, 2.4], [0, -2.4], [17, 2.2]].forEach(([x, z], i) => plant(x, z, i > 4 ? 0.8 : 1.15));

// ---------------------------------------------------------------------------
// Agentes (humanoides low-poly animados)
// ---------------------------------------------------------------------------
const SKIN = [0xf1c7a6, 0xc68b62, 0xe7b48f, 0x8d5a3b, 0xf0caa8, 0xb07a52];
const HAIR = [0x2b1a12, 0x111111, 0x6b3b1d, 0x1b1410, 0xc59a5a, 0x3a2a20];
const STATUS = {
  ana: ['📞 ligando para leads', '✉ reativando contatos frios', '🎯 qualificando lead novo'],
  bruno: ['🤝 negociando proposta', '📄 montando proposta', '🎯 estratégia de fechamento'],
  carla: ['🏦 analisando crédito', '📋 conferindo documentos', '🧮 simulando financiamento'],
  diego: ['✎ escrevendo anúncio', '🎬 roteiro de Reels', '📊 analisando campanha'],
  elisa: ['🎓 preparando treino', '🎭 roteiro de roleplay', '📚 revisando objeções'],
  fabio: ['📈 analisando preços', '🏙 comparáveis do bairro', '📊 forecast do mês'],
};
const agents = [];
const pickables = [];

function buildAgent(a, i) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const suit = new THREE.MeshStandardMaterial({ color: a.cor, roughness: 0.55, emissive: a.cor, emissiveIntensity: 0.06 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x1b2130, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: SKIN[i % SKIN.length], roughness: 0.65 });
  const hairM = new THREE.MeshStandardMaterial({ color: HAIR[i % HAIR.length], roughness: 0.9 });
  const mk = (geo, mat, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); m.userData.agent = a.id; pickables.push(m); return m; };
  const hips = []; const shoulders = [];
  [-0.11, 0.11].forEach((x) => { const p = new THREE.Group(); p.position.set(x, 0.8, 0); body.add(p); mk(new THREE.CapsuleGeometry(0.085, 0.58, 4, 10), pants, p, 0, -0.38, 0); mk(new THREE.BoxGeometry(0.14, 0.08, 0.26), M.black, p, 0, -0.76, 0.05); hips.push(p); });
  const torso = mk(new THREE.CapsuleGeometry(0.23, 0.42, 6, 14), suit, body, 0, 1.13, 0); torso.scale.z = 0.72;
  mk(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 10), skin, body, 0, 1.47, 0);
  const head = new THREE.Group(); head.position.set(0, 1.66, 0); body.add(head);
  mk(new THREE.SphereGeometry(0.18, 20, 16), skin, head, 0, 0, 0);
  const hair = mk(new THREE.SphereGeometry(0.19, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, head, 0, 0.02, -0.01); hair.rotation.x = -0.15;
  [-0.065, 0.065].forEach((x) => mk(new THREE.SphereGeometry(0.022, 8, 8), M.black, head, x, 0.02, 0.165));
  [-0.3, 0.3].forEach((x) => { const s = new THREE.Group(); s.position.set(x, 1.36, 0); body.add(s); mk(new THREE.CapsuleGeometry(0.065, 0.46, 4, 10), suit, s, 0, -0.27, 0); mk(new THREE.SphereGeometry(0.06, 10, 8), skin, s, 0, -0.56, 0); shoulders.push(s); });
  // anel de seleção
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.58, 40), new THREE.MeshBasicMaterial({ color: a.cor, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; root.add(ring);
  // etiqueta
  const tagEl = document.createElement('div');
  tagEl.className = 'tag3d';
  tagEl.innerHTML = `<span class="n" style="background:${a.cor}">${a.nome}</span><span class="s">—</span>`;
  tagEl.addEventListener('click', () => select(a.id));
  const tag = new CSS2DObject(tagEl); tag.position.set(0, 2.2, 0); root.add(tag);
  const bubEl = document.createElement('div'); bubEl.className = 'bubble3d'; bubEl.style.display = 'none';
  const bub = new CSS2DObject(bubEl); bub.position.set(0.35, 2.05, 0); root.add(bub);
  root.scale.setScalar(1.12);
  scene.add(root);
  const D = DESKS[a.id];
  root.position.copy(D.seat);
  return { a, root, body, head, hips, shoulders, ring, tagEl, bubEl, state: 'sentado', loc: LOC.seat(a.id), path: [], speed: 1.35, t: Math.random() * 10, next: 4 + Math.random() * 10, face: D.facing > 0 ? 0 : Math.PI, status: STATUS[a.id][0], busyUntil: 0, sitting: true };
}

// ---------------------------------------------------------------------------
// Navegação: locais com waypoints de entrada (do corredor z=0 até o ponto)
// ---------------------------------------------------------------------------
const V = (x, z) => new THREE.Vector3(x, 0, z);
const MR_C = V(MR.x, MR.z);
function ringPts(a0, a1, r = 2.6) {
  let d = a1 - a0; d = Math.atan2(Math.sin(d), Math.cos(d));
  const n = Math.max(1, Math.ceil(Math.abs(d) / 0.45));
  return Array.from({ length: n + 1 }, (_, k) => { const a = a0 + (d * k) / n; return V(MR.x + Math.cos(a) * r, MR.z + Math.sin(a) * r); });
}
const angOf = (p) => Math.atan2(p.z - MR.z, p.x - MR.x);
const LOC = {
  seat: (id) => ({ kind: 'seat', pos: DESKS[id].seat.clone(), enter: [DESKS[id].side.clone()], face: DESKS[id].facing > 0 ? 0 : Math.PI }),
  side: (id) => ({ kind: 'side', pos: DESKS[id].side.clone(), enter: [] }),
  coffee: () => ({ kind: 'coffee', pos: V(-15.6, 5.6), enter: [V(-13.2, 5.6)], face: Math.PI }),
  cafe: (i) => { const p = [V(-14.2, 7.3), V(-11.8, 7.3), V(-13, 6.7), V(-14.2, 8.4)][i % 4]; return { kind: 'cafe', pos: p, enter: [V(-13.2, 5.6)], face: Math.atan2(-13 - p.x, 7.9 - p.z) }; },
  screen: () => { const x = pick([-6, 0, 6]) + (Math.random() - 0.5) * 1.2; return { kind: 'screen', pos: V(x, -8.6), enter: [], face: Math.PI }; },
  treinoProf: () => ({ kind: 'treino', pos: TR_PROF.clone(), enter: [V(TR.door, TR.z1 + 0.8), V(TR.door, TR.z1 - 0.8)], face: 0 }),
  treinoAluno: (i) => ({ kind: 'treino', pos: TR_ALUNOS[i % 2].clone(), enter: [V(TR.door, TR.z1 + 0.8), V(TR.door, TR.z1 - 0.8)], face: Math.PI }),
  meeting: (i) => {
    const spot = MR_SPOTS[i].clone(), doorIn = V(MR_DOOR_X, MR.z - MR.d / 2 + 0.8);
    return { kind: 'meeting', pos: spot, enter: [V(MR_DOOR_X, MR.z - MR.d / 2 - 0.8), doorIn, ...ringPts(angOf(doorIn), angOf(spot))], face: Math.atan2(MR.x - spot.x, MR.z - spot.z) };
  },
};
function routeTo(ag, loc, onArrive) {
  const cur = ag.loc;
  const exit = cur ? [...cur.enter].reverse() : [];
  const exitX = (exit.length ? exit[exit.length - 1] : ag.root.position).x;
  const enterX = (loc.enter.length ? loc.enter[0] : loc.pos).x;
  ag.path = [...exit, V(exitX, 0), V(enterX, 0), ...loc.enter.map((v) => v.clone()), loc.pos.clone()];
  ag.state = 'andando'; ag.sitting = false; ag.loc = null;
  ag.arrive = () => { ag.loc = loc; if (loc.face != null) ag.face = loc.face; onArrive && onArrive(); };
}
function goHome(ag, then) {
  routeTo(ag, LOC.seat(ag.a.id), () => { ag.state = 'sentado'; ag.sitting = true; ag.status = pick(STATUS[ag.a.id]); then && then(); });
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function bubble(ag, emoji, ms = 4000) { ag.bubEl.className = 'bubble3d'; ag.bubEl.textContent = emoji; ag.bubEl.style.display = ''; clearTimeout(ag.bubT); ag.bubT = setTimeout(() => (ag.bubEl.style.display = 'none'), ms); }
function falaBalao(ag, texto, ms = 5000) { ag.bubEl.className = 'fala3d'; ag.bubEl.textContent = texto.length > 150 ? texto.slice(0, 147) + '…' : texto; ag.bubEl.style.display = ''; clearTimeout(ag.bubT); ag.bubT = setTimeout(() => (ag.bubEl.style.display = 'none'), ms); }
const irPara = (ag, loc) => new Promise((res) => { const t = setTimeout(res, 45000); routeTo(ag, loc, () => { ag.state = 'parado'; clearTimeout(t); res(); }); });
const olhar = (a, b) => { a.face = Math.atan2(b.root.position.x - a.root.position.x, b.root.position.z - a.root.position.z); };

function decide(ag) {
  if (ag.locked || ag.state !== 'sentado') return;
  const r = Math.random();
  ag.next = 10 + Math.random() * 16;
  if (r < 0.55) { ag.status = pick(STATUS[ag.a.id]); ag.next = 8 + Math.random() * 14; return; }
  if (r < 0.8) { ag.status = pick(STATUS[ag.a.id]); return; }   // conversas de verdade vêm da sociedade (abaixo)
  if (r < 0.9) {
    ag.status = '☕ pegando café';
    routeTo(ag, LOC.coffee(), () => { ag.state = 'parado'; bubble(ag, '☕', 4000); setTimeout(() => { if (!ag.locked) goHome(ag); }, 5000); });
  } else {
    ag.status = '👀 olhando o painel';
    routeTo(ag, LOC.screen(), () => { ag.state = 'parado'; setTimeout(() => { if (!ag.locked) goHome(ag); }, 4500); });
  }
}

AGENTS.forEach((a, i) => agents.push(buildAgent(a, i)));
const byId = Object.fromEntries(agents.map((g) => [g.a.id, g]));
window.__office = { agents, byId };

// ---------------------------------------------------------------------------
// Monitores das mesas
// ---------------------------------------------------------------------------
function drawScreens(t) {
  agents.forEach((ag, i) => {
    const { g, canvas, tex } = DESKS[ag.a.id].scr;
    const w = canvas.width, h = canvas.height;
    g.fillStyle = '#0b1020'; g.fillRect(0, 0, w, h);
    g.fillStyle = ag.a.cor; g.fillRect(0, 0, w, 26);
    g.fillStyle = '#0b0d12'; g.font = '800 15px Manrope, sans-serif'; g.fillText(`${ag.a.nome.toUpperCase()} · ${ag.a.cargo}`, 10, 18);
    if (ag.working) {
      g.fillStyle = '#E9EDF5'; g.font = '700 16px Manrope, sans-serif'; g.fillText('Executando tarefa…', 14, 66);
      const pr = ((t * 0.35 + i) % 1);
      g.fillStyle = '#232c42'; g.fillRect(14, 84, w - 28, 14); g.fillStyle = ag.a.cor; g.fillRect(14, 84, (w - 28) * pr, 14);
      for (let k = 0; k < 4; k++) { g.fillStyle = `rgba(184,194,214,${0.25 + 0.15 * k})`; g.fillRect(14, 116 + k * 16, 60 + ((t * 80 + k * 50) % (w - 100)), 8); }
    } else {
      for (let b = 0; b < 9; b++) {
        const v = 0.3 + 0.6 * Math.abs(Math.sin(t * 0.9 + b * 0.7 + i));
        g.fillStyle = b % 3 === 0 ? ag.a.cor : '#2b3650'; g.fillRect(16 + b * 33, h - 18 - v * 110, 22, v * 110);
      }
      g.fillStyle = '#B8C2D6'; g.font = '600 13px Manrope, sans-serif'; g.fillText(ag.status.replace(/^[^\wÀ-ÿ]+/, '').slice(0, 34), 12, 46);
    }
    tex.needsUpdate = true;
  });
}

// ---------------------------------------------------------------------------
// Seleção, câmera, painel de chat
// ---------------------------------------------------------------------------
let selected = null;
const camGoal = { pos: null, target: null };
function flyTo(pos, target) { camGoal.pos = pos; camGoal.target = target; }
function select(id) {
  const ag = byId[id];
  if (!ag) return;
  selected = ag;
  agents.forEach((o) => (o.ring.material.opacity = o === ag ? 0.9 : 0));
  const p = ag.root.position;
  const front = DESKS[id].facing > 0 && ag.state === 'sentado';
  flyTo(new THREE.Vector3(p.x + 2.3, front ? 3.3 : 3.0, p.z + (front ? 5.2 : 3.8)), new THREE.Vector3(p.x, 1.2, p.z - (front ? 0 : 0.6)));
  stopTour();
  openPanel(ag);
  renderRoster();
}
const quadroFalas = [];
const stage = {
  async encenar(tipo, parts, tema) {
    const ags = parts.map((k) => byId[k]).filter(Boolean);
    ags.forEach((g) => { g.locked = true; g.speed = 2.0; });
    abrirFeed();
    if (tipo === 'treinamento') {
      const [prof, aluno] = ags;
      prof.status = `🎓 indo treinar ${aluno.a.nome}`;
      flyTo(new THREE.Vector3(aluno.root.position.x + 3, 6, aluno.root.position.z + 7), new THREE.Vector3(aluno.root.position.x, 1, aluno.root.position.z));
      await irPara(prof, LOC.side(aluno.a.id));
      olhar(prof, aluno);
      falaBalao(prof, `${aluno.a.nome}, vem comigo para a sala de treinamento?`, 3000);
      await espera(1600); falaBalao(aluno, 'Bora!', 2000); await espera(800);
      prof.status = `🎓 treinando ${aluno.a.nome}`; aluno.status = `🎓 em treinamento com ${prof.a.nome}`;
      flyTo(new THREE.Vector3(-11, 6.8, -2.5), new THREE.Vector3(-15.5, 1.2, -10.2));
      quadroFalas.length = 0; drawQuadro(tema, [], `${prof.a.nome} treinando ${aluno.a.nome}`);
      await Promise.all([irPara(prof, LOC.treinoProf()), irPara(aluno, LOC.treinoAluno(0))]);
      aluno.sitting = true; aluno.state = 'reuniao';
    } else if (tipo === 'conversa') {
      const [a, b] = ags;
      a.status = `💬 indo falar com ${b.a.nome}`; b.status = `💬 conversando com ${a.a.nome}`;
      flyTo(new THREE.Vector3(b.root.position.x + 3, 5.5, b.root.position.z + 6), new THREE.Vector3(b.root.position.x, 1, b.root.position.z));
      await irPara(a, LOC.side(b.a.id)); olhar(a, b);
    } else {
      ags.forEach((g) => (g.status = '🤝 indo para a reunião'));
      flyTo(new THREE.Vector3(MR.x - 7.5, 8.5, MR.z + 8.5), new THREE.Vector3(MR.x, 0.6, MR.z));
      await Promise.all(ags.map((g, i) => espera(i * 350).then(() => irPara(g, LOC.meeting(i))).then(() => { g.state = 'reuniao'; g.sitting = true; g.status = '🤝 em reunião'; })));
    }
  },
  falar(k, fala) {
    const g = byId[k]; if (!g) return;
    falaBalao(g, fala, Math.max(2400, Math.min(6500, fala.length * 48)));
    if (g.loc?.kind === 'treino') { quadroFalas.push(`${g.a.nome}: ${fala}`); drawQuadro(quadroTitulo(), quadroFalas); }
  },
  encerrar(parts) {
    setTimeout(() => parts.map((k) => byId[k]).filter(Boolean).forEach((g) => {
      g.locked = false;
      if (g.loc?.kind === 'seat' && g.root.position.distanceTo(DESKS[g.a.id].seat) < 0.3) { g.state = 'sentado'; g.sitting = true; g.status = pick(STATUS[g.a.id]); return; }
      g.speed = 2.0; goHome(g, () => (g.speed = 1.35));
    }), 2500);
    setTimeout(() => flyTo(HOME.pos.clone(), HOME.target.clone()), 3500);
  },
};
let _quadroTitulo = '';
const quadroTitulo = () => _quadroTitulo;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
// ---------------------------------------------------------------------------
// Sociedade: conversas reais decididas pelos próprios agentes movem o escritório
// ---------------------------------------------------------------------------
const emCena = new Map();   // conversa_id → participantes em cena
async function cenaSociedade(c) {
  if (c.contexto?.conduzida || emCena.has(c.id)) return;      // ordens do gestor já são encenadas pelo stage
  const ags = c.participantes.map((k) => byId[k]).filter(Boolean);
  if (ags.length < 2 && c.tipo !== 'recado') return;
  emCena.set(c.id, ags);
  ags.forEach((g) => { g.locked = true; g.speed = 1.8; });
  const [ini, ...resto] = ags;
  logTicker(`${{ cafe: '☕', reuniao: '🤝', treinamento: '🎓', mentoria: '🧭' }[c.tipo] || '💬'} ${ags.map((g) => g.a.nome).join(' + ')}: ${c.tema}`);
  if (c.tipo === 'cafe') { ags.forEach((g, i) => { g.status = '☕ café com o time'; routeTo(g, LOC.cafe(i), () => { g.state = 'parado'; }); }); }
  else if (c.tipo === 'reuniao') { ags.forEach((g, i) => { g.status = `🤝 reunião: ${c.tema}`; routeTo(g, LOC.meeting(i), () => { g.state = 'reuniao'; g.sitting = true; }); }); }
  else if (c.tipo === 'treinamento') {
    _quadroTitulo = c.tema; quadroFalas.length = 0; drawQuadro(c.tema, [], `${ini.a.nome} treinando ${resto.map((g) => g.a.nome).join(', ')}`);
    ini.status = `🎓 treinando ${resto[0]?.a.nome || ''}`; routeTo(ini, LOC.treinoProf(), () => { ini.state = 'parado'; });
    resto.forEach((g, i) => { g.status = `🎓 em treinamento com ${ini.a.nome}`; routeTo(g, LOC.treinoAluno(i), () => { g.state = 'reuniao'; g.sitting = true; }); });
  } else if (resto[0]) {
    const b = resto[0];
    ini.status = `💬 conversando com ${b.a.nome}`; b.status = `💬 conversando com ${ini.a.nome}`;
    routeTo(ini, LOC.side(b.a.id), () => { ini.state = 'parado'; olhar(ini, b); });
  }
}
function fimCena(c) {
  const ags = emCena.get(c.id); if (!ags) return;
  emCena.delete(c.id);
  setTimeout(() => ags.forEach((g) => {
    if ([...emCena.values()].some((x) => x.includes(g))) return;
    g.locked = false;
    if (g.loc?.kind === 'seat' && g.root.position.distanceTo(DESKS[g.a.id].seat) < 0.3) { g.state = 'sentado'; g.sitting = true; g.status = pick(STATUS[g.a.id]); return; }
    goHome(g, () => (g.speed = 1.35));
  }), 3500);
}
socBus.addEventListener('soc:conversa', (e) => {
  const { fase, conversa: c } = e.detail;
  if (fase === 'inicio') cenaSociedade(c);
  else if (fase === 'convite') { const g = byId[c.iniciador]; if (g) bubble(g, c.tipo === 'cafe' ? '☕?' : '📣', 3500); }
  else if (fase === 'fim') fimCena(c);
});
socBus.addEventListener('soc:mensagem', (e) => {
  const { conversa: c, mensagem: m } = e.detail;
  if (c.contexto?.conduzida) return;                            // o stage já mostra a fala
  const g = byId[m.de]; if (!g) return;
  if (!emCena.has(c.id) && c.status === 'aberta') cenaSociedade(c);
  if (m.intencao === 'aceitar' || m.intencao === 'recusar') { bubble(g, m.intencao === 'aceitar' ? '👍' : '🙅', 3000); return; }
  falaBalao(g, m.texto, Math.max(3500, Math.min(9000, m.texto.length * 55)));
  if (c.tipo === 'treinamento') { quadroFalas.push(`${g.a.nome}: ${m.texto}`); drawQuadro(c.tema, quadroFalas); }
});
iniciarSociedade(ctx);

bus.addEventListener('interacao:inicio', (e) => { _quadroTitulo = e.detail.tipo === 'treinamento' ? e.detail.tema : _quadroTitulo; logTicker(`${e.detail.tipo === 'treinamento' ? '🎓' : e.detail.tipo === 'reuniao' ? '🤝' : '💬'} ${(e.detail.participantes || []).map((k) => byId[k]?.a.nome).join(' + ')}: ${e.detail.tema}`); });

// painel de conversas do time
let feedCtl = null;
function abrirFeed() {
  if (innerWidth < 760) return;
  const f = $('#feed'); if (f.classList.contains('open')) return;
  f.classList.add('open'); $('#b-feed').classList.add('primary');
  f.innerHTML = '<div class="row between" style="padding:12px 14px;border-bottom:1px solid var(--border)"><b>💬 Conversas do time</b><button class="btn xs ghost" id="feed-x">✕</button></div><div id="feed-body" style="overflow:auto;padding:10px;flex:1"></div>';
  feedCtl = mountFeed($('#feed-body'), ctx, { limite: 15, compacto: true });
  $('#feed-x').onclick = fecharFeed;
}
function fecharFeed() { $('#feed').classList.remove('open'); $('#b-feed').classList.remove('primary'); feedCtl?.destroy(); feedCtl = null; }

function openPanel(ag) {
  const panel = $('#panel');
  panel.innerHTML = `<div class="row" style="padding:10px 12px 0;justify-content:flex-end"><button class="btn xs ghost" id="p-close">Fechar ✕</button></div><div style="flex:1;min-height:0" id="p-chat"></div>`;
  panel.classList.add('open');
  $('#p-close').onclick = closePanel;
  mountChat($('#p-chat'), ctx, ag.a.id, {
    stage,
    onState: (s) => {
      if (s === 'falando') { ag.locked = true; ag.status = '💬 falando com você'; bubble(ag, '💬', 2500); }
      else if (s === 'trabalhando') {
        ag.locked = true; ag.working = true; ag.status = '⚙ executando sua tarefa'; bubble(ag, '⚙', 3000);
        logTicker(`${ag.a.nome} concluiu uma tarefa para ${(db.profile?.nome || 'você').split(' ')[0]}`);
        if (ag.state !== 'sentado' && ag.state !== 'andando') goHome(ag);
        setTimeout(() => { ag.working = false; }, 3200);
      } else if (s === 'acao') { /* encenação controla o agente */ }
      else { setTimeout(() => { if (!ag.state || ag.state === 'sentado') ag.locked = false; }, 4000); if (ag.state === 'sentado') ag.status = pick(STATUS[ag.a.id]); }
    },
  });
}
function closePanel() { $('#panel').classList.remove('open'); selected = null; agents.forEach((o) => (o.ring.material.opacity = 0)); flyTo(HOME.pos.clone(), HOME.target.clone()); renderRoster(); }

const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; camGoal.pos = null; stopTour(); });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(pickables, false)[0];
  if (hit) select(hit.object.userData.agent);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  renderer.domElement.style.cursor = ray.intersectObjects(pickables, false).length ? 'pointer' : 'grab';
});

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
function renderRoster() {
  $('#roster').innerHTML = agents.map((g) => `<div class="agent-card ${selected === g ? 'on' : ''}" data-a="${g.a.id}"><div class="agent-face" style="background:${g.a.cor}">${g.a.nome[0]}</div><div class="grow" style="min-width:0"><div style="font-weight:800;font-size:13px">${g.a.nome} <span class="muted" style="font-weight:600">· ${g.a.cargo}</span></div><div class="st">${esc(g.status)}</div></div></div>`).join('');
  $$('#roster [data-a]').forEach((c) => c.onclick = () => select(c.dataset.a));
}
function hudKpis() {
  const d = ctx.data, fc = forecast(d.deals);
  $('#top-r').innerHTML = [['Forecast', brlK(fc.ponderado)], ['Leads quentes', d.leads.filter((l) => ['quente', 'fervendo'].includes(l.temperatura)).length], ['Negócios', fc.abertos], ['Disponíveis', d.unidades.filter((u) => u.status === 'disponivel').length]].map(([l, v]) => `<div class="k glass"><small>${l}</small><b>${v}</b></div>`).join('');
}
setInterval(() => { $('#clock').textContent = new Date().toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }); }, 1000);

// tour automático
let touring = false, tourA = 0;
function stopTour() { touring = false; controls.autoRotate = false; $('#b-tour').classList.remove('primary'); }
$('#b-tour').onclick = () => { touring = !touring; camGoal.pos = null; $('#b-tour').classList.toggle('primary', touring); if (!touring) stopTour(); };
$('#b-reset').onclick = () => { stopTour(); closePanel(); };
$('#b-feed').onclick = () => ($('#feed').classList.contains('open') ? fecharFeed() : abrirFeed());

// daily de vendas: todos vão para a sala de fechamento e reportam com dados reais
$('#b-daily').onclick = () => {
  stopTour(); $('#panel').classList.remove('open'); fecharFeed();
  flyTo(new THREE.Vector3(MR.x - 7.5, 8.5, MR.z + 8.5), new THREE.Vector3(MR.x, 0.6, MR.z));
  logTicker('Daily de vendas iniciada na Sala de Fechamento');
  agents.forEach((ag, i) => {
    ag.locked = true; ag.status = '☀ indo para a daily'; ag.speed = 2.6;
    setTimeout(() => routeTo(ag, LOC.meeting(i), () => { ag.state = 'reuniao'; ag.sitting = true; ag.status = '☀ na daily'; }), i * 450);
  });
  const d = ctx.data;
  const linhas = [
    ['ana', runTarefa('ana', 'ligar_hoje', d)], ['bruno', runTarefa('bruno', 'fechar', d)], ['carla', runTarefa('carla', 'capacidade', d)],
    ['diego', runTarefa('diego', 'anuncios', d)], ['fabio', runTarefa('fabio', 'forecast', d)], ['elisa', runTarefa('elisa', 'treino', d)],
  ];
  setTimeout(() => {
    const box = $('#daily');
    box.style.display = 'block';
    box.innerHTML = `<div class="row between"><h2>☀ Daily de vendas</h2><button class="btn xs ghost" id="d-x">Encerrar</button></div><p class="muted mt-s">Cada corretor reporta com base nos dados do seu CRM agora.</p>
      <div class="col mt">${linhas.map(([id, r]) => { const a = byId[id].a; return `<div class="row" style="align-items:flex-start"><div class="agent-face" style="background:${a.cor}">${a.nome[0]}</div><div class="grow"><b>${a.nome}</b> <span class="muted" style="font-size:12px">${a.cargo}</span><div style="font-size:13px">${esc(r.resumo)}</div>${r.itens[0] ? `<div class="muted" style="font-size:12px">Prioridade: ${esc(r.itens[0].titulo)} — ${esc(r.itens[0].sub || r.itens[0].detalhe || '')}</div>` : ''}</div><button class="btn xs" data-open="${id}">Abrir</button></div>`; }).join('')}</div>`;
    $('#d-x').onclick = endDaily;
    $$('#daily [data-open]').forEach((b) => b.onclick = () => { endDaily(); select(b.dataset.open); });
  }, 6500);
};
function endDaily() { $('#daily').style.display = 'none'; agents.forEach((ag) => { ag.locked = false; ag.speed = 2.2; goHome(ag, () => (ag.speed = 1.35)); }); flyTo(HOME.pos.clone(), HOME.target.clone()); }

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let screenT = 0, rosterT = 0;
function tick() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  for (const ag of agents) {
    ag.t += dt;
    if (ag.state === 'andando' && ag.path.length) {
      const target = ag.path[0];
      const p = ag.root.position;
      const dir = new THREE.Vector3(target.x - p.x, 0, target.z - p.z);
      const dist = dir.length();
      if (dist < 0.06) { ag.path.shift(); if (!ag.path.length) { ag.state = 'parado'; const fn = ag.arrive; ag.arrive = null; fn && fn(); } }
      else { dir.normalize(); p.addScaledVector(dir, Math.min(dist, ag.speed * dt)); ag.face = Math.atan2(dir.x, dir.z); }
    }
    // rotação suave
    let dr = ag.face - ag.root.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    ag.root.rotation.y += dr * Math.min(1, dt * 8);
    // animação
    const walking = ag.state === 'andando';
    const sit = ag.sitting && (ag.state === 'sentado' || ag.state === 'reuniao');
    const sw = walking ? Math.sin(ag.t * 8.5) * 0.55 : 0;
    ag.hips[0].rotation.x = sit ? -1.45 : sw; ag.hips[1].rotation.x = sit ? -1.45 : -sw;
    const typing = sit && !ag.locked ? Math.sin(ag.t * 18) * 0.06 : 0;
    ag.shoulders[0].rotation.x = sit ? -0.95 + typing : -sw * 0.8; ag.shoulders[1].rotation.x = sit ? -0.95 - typing : sw * 0.8;
    ag.body.position.y = sit ? -0.33 : walking ? Math.abs(Math.sin(ag.t * 8.5)) * 0.04 : Math.sin(ag.t * 1.6) * 0.008;
    ag.head.rotation.y = ag === selected ? Math.sin(t * 0.8) * 0.15 : sit ? Math.sin(ag.t * 0.5) * 0.12 : 0;
    ag.head.rotation.x = sit && !ag.locked ? 0.12 : 0;
    if (ag === selected) ag.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
    // decisão de comportamento
    if (ag.state === 'sentado' && !ag.locked) { ag.next -= dt; if (ag.next <= 0) decide(ag); }
    if (ag._shown !== ag.status) { (ag._sEl ||= ag.tagEl.querySelector('.s')).textContent = ag.status; ag._shown = ag.status; }
  }
  screenT += dt; if (screenT > 0.4) { drawScreens(t); screenT = 0; }
  rosterT += dt; if (rosterT > 1.5) { $$('#roster .st').forEach((el, i) => (el.textContent = agents[i].status)); rosterT = 0; }
  if (touring) { tourA += dt * 0.08; camera.position.lerp(new THREE.Vector3(Math.sin(tourA) * 26, 14 + Math.sin(tourA * 0.7) * 4, Math.cos(tourA) * 22), 0.02); controls.target.lerp(HOME.target, 0.05); }
  else if (camGoal.pos) {
    camera.position.lerp(camGoal.pos, 0.06); controls.target.lerp(camGoal.target, 0.08);
    if (camera.position.distanceTo(camGoal.pos) < 0.05) camGoal.pos = null;
  }
  controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
  requestAnimationFrame(tick);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); labels.setSize(innerWidth, innerHeight);
});

document.fonts?.ready.then(() => { drawWall(); });
drawWall(); hudKpis(); renderRoster(); drawScreens(0);
tick();
const ld = $('#loading'); ld.style.opacity = '0'; setTimeout(() => ld.remove(), 650);
setInterval(drawWall, 15000);
const hint = new URLSearchParams(location.search).get('agente');
if (hint && byId[hint]) setTimeout(() => select(hint), 800);
else setTimeout(() => toast('Clique em um corretor para conversar ou em "Daily de vendas"', 'info', 5000), 1200);
