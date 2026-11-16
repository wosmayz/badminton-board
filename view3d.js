/* 羽球戰術板：斜角 3D 視角（Three.js）
   座標：俯瞰的 (x, y) 公尺 → 3D 世界 X = x − 場寬/2、Z = y − 場長/2（我方在靠近鏡頭那一側）、Y 朝上
   人物：Kenney Mini Characters（CC0）男 A 身體＋男 D 頭型膚色表情＋男 E 髮型改黑，白短褲、上衣換隊伍色（定案見 線框/chibi-3d-v3） */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const W = 6.1, L = 13.4, NET_Y = 6.7;
const MODEL_H = 0.671;          // 模型原本身高
let PERSON_H = 1.14;            // 在球場上的身高（公尺）；11/17 她覺得太大，選 65%（原 1.75）
let SCALE = PERSON_H / MODEL_H;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const toWorld = (x, y) => new THREE.Vector3(x - W / 2, 0, y - L / 2);

/* ---------- 模型零件（照 chibi-3d-v3） ---------- */
const G = {};
async function loadModels() {
  const loader = new GLTFLoader();
  for (const n of ['character-male-a', 'character-male-d', 'character-male-e'])
    G[n] = await loader.loadAsync(`models/${n}.glb`);
}

/* 頭部拆零件（共用頂點分群）：頭型、耳朵、眼睛、嘴巴、頭髮 */
function headParts(mesh) {
  const geo = mesh.geometry, pos = geo.attributes.position, idx = geo.index;
  const key = i => [pos.getX(i), pos.getY(i), pos.getZ(i)].map(v => v.toFixed(4)).join(',');
  const par = new Map(), f = k => { while (par.get(k) !== k) { par.set(k, par.get(par.get(k))); k = par.get(k); } return k; };
  for (let i = 0; i < pos.count; i++) { const k = key(i); if (!par.has(k)) par.set(k, k); }
  for (let t = 0; t < idx.count; t += 3) { const a = f(key(idx.getX(t))); par.set(f(key(idx.getX(t + 1))), a); par.set(f(key(idx.getX(t + 2))), a); }
  const comps = new Map();
  for (let t = 0; t < idx.count; t += 3) {
    const r = f(key(idx.getX(t))), e = comps.get(r) || { tris: [], verts: new Set() };
    e.tris.push(idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)); [0, 1, 2].forEach(k => e.verts.add(idx.getX(t + k))); comps.set(r, e);
  }
  return [...comps.values()].map(e => {
    let ymax = -1e9; e.verts.forEach(i => { ymax = Math.max(ymax, pos.getY(i)); });
    const n = e.verts.size;
    const role = n === 136 ? 'head' : n === 42 ? 'ear' : (n <= 12 && ymax < .44) ? 'mouth' : (n <= 12) ? 'eye' : ymax > .6 ? 'hair' : 'accessory';
    return { tris: e.tris, n, role };
  });
}
function subMesh(src, tris, skeleton, bindMatrix) {
  const g = src.geometry.clone(); g.setIndex(tris);
  const m = new THREE.SkinnedMesh(g, src.material); m.bind(skeleton, bindMatrix); return m;
}

/* 換色：shirtCols → 隊伍色（保留深淺）；remap＝[[原色, 新色]] 或函式 */
function recolor(body, shirtCols, teamHex, remap = []) {
  const geo = body.geometry, uv = geo.attributes.uv, img = body.material.map.image;
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
  const D = cx.getImageData(0, 0, cv.width, cv.height).data;
  const lum = c => .299 * c[0] + .587 * c[1] + .114 * c[2], ref = shirtCols.length ? Math.max(...shirtCols.map(lum)) : 1;
  const team = new THREE.Color(teamHex || '#000');
  const lin = c => new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255).convertSRGBToLinear();
  const ov = new Float32Array(uv.count * 4);
  for (let i = 0; i < uv.count; i++) {
    const x = Math.min(cv.width - 1, Math.floor(uv.getX(i) * cv.width)), y = Math.min(cv.height - 1, Math.floor(uv.getY(i) * cv.height)), p = (y * cv.width + x) * 4;
    const c = [D[p], D[p + 1], D[p + 2]], eq = f => f[0] === c[0] && f[1] === c[1] && f[2] === c[2];
    let out = null;
    const greenish = c[1] > c[0] + 30 && c[1] >= c[2];
    if (shirtCols.some(eq) || (shirtCols.length && greenish)) { const k = .8 + .2 * Math.min(1, lum(c) / ref); out = new THREE.Color(team.r * k, team.g * k, team.b * k); }
    else { const m = typeof remap === 'function' ? [null, remap(c)] : remap.find(([f]) => eq(f)); if (m && m[1]) out = lin(m[1]); }
    if (out) { ov[i * 4] = out.r; ov[i * 4 + 1] = out.g; ov[i * 4 + 2] = out.b; ov[i * 4 + 3] = 1; }
  }
  geo.setAttribute('override', new THREE.BufferAttribute(ov, 4));
  const mat = body.material.clone();
  mat.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute vec4 override;\nvarying vec4 vOv;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvOv=override;');
    sh.fragmentShader = 'varying vec4 vOv;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\nif(vOv.a>.5)diffuseColor.rgb=vOv.rgb;');
  };
  mat.customProgramCacheKey = () => 'ov' + teamHex; body.material = mat;
}

/* 球拍：真實比例（全長 L；握把 0.30L、拍桿 0.33L、蛋形拍面 0.35L×0.30L） */
let STRING_TEX = null;
function stringTex() {
  if (STRING_TEX) return STRING_TEX;
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 2;
  for (let k = 8; k < 256; k += 16) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k, 256); x.stroke(); x.beginPath(); x.moveTo(0, k); x.lineTo(256, k); x.stroke(); }
  STRING_TEX = new THREE.CanvasTexture(c); STRING_TEX.colorSpace = THREE.SRGBColorSpace; return STRING_TEX;
}
function racket(L) {
  const g = new THREE.Group(), frameMat = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: .45, metalness: .2 });
  const gripL = .30 * L, gripR = .019 * L * 1.4;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(gripR, gripR * 1.08, gripL, 12), new THREE.MeshStandardMaterial({ color: 0xf3f3f3, roughness: .9 }));
  grip.position.y = gripL / 2 - .12 * L; g.add(grip);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(gripR * 1.15, gripR * 1.15, .012 * L, 12), frameMat); cap.position.y = -.12 * L; g.add(cap);
  const y0 = gripL - .12 * L, shaftL = .33 * L, shaft = new THREE.Mesh(new THREE.CylinderGeometry(.01 * L, .011 * L, shaftL, 8), frameMat);
  shaft.position.y = y0 + shaftL / 2; g.add(shaft);
  const hy = y0 + shaftL, hl = .35 * L, hw = .30 * L, pts = [];
  for (let i = 0; i < 64; i++) { const t = i / 64 * Math.PI * 2, sy = Math.sin(t), cx = Math.cos(t), w = hw / 2 * (1 + .08 * sy); pts.push(new THREE.Vector3(cx * w, hy + hl / 2 + sy * hl / 2, 0)); }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, .016 * L, 8, true), frameMat));
  const thr = new THREE.Mesh(new THREE.CylinderGeometry(.005 * L * 1.3, .005 * L * 1.3, hw * .42, 6), frameMat); thr.rotation.z = Math.PI / 2; thr.position.y = hy + hl * .06; g.add(thr);
  const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p.x, p.y - hy - hl / 2)));
  const sg = new THREE.ShapeGeometry(shape, 48), uv = sg.attributes.uv, pp = sg.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pp.getX(i) / hw + .5, pp.getY(i) / hl + .5);
  const net = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: stringTex(), transparent: true, opacity: .75, side: THREE.DoubleSide, depthWrite: false }));
  net.position.y = hy + hl / 2; g.add(net);
  return g;
}

/* 背號（裝飾用，貼在上衣背面） */
function numberPlate(txt) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.font = 'bold 64px -apple-system,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(.12, .12), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
}

/* 頭上的號碼牌（和俯瞰一樣的小圓牌，永遠面向鏡頭） */
function badge(txt, dark) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.beginPath(); x.arc(64, 64, 56, 0, Math.PI * 2); x.fillStyle = dark; x.fill(); x.lineWidth = 9; x.strokeStyle = '#fff'; x.stroke();
  x.fillStyle = '#fff'; x.font = '800 54px -apple-system,"PingFang TC",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, 64, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); s.renderOrder = 10;
  s.scale.setScalar(.12 + .17 * PERSON_H); return s;
}

const SKIN_A = [[135, 85, 65], [139, 86, 65], [143, 87, 65], [162, 92, 65], [165, 93, 65], [169, 94, 65], [173, 95, 65]];
const SKIN_D = [[204, 135, 95], [210, 143, 104], [213, 148, 109], [230, 174, 135], [233, 178, 140], [236, 182, 144], [239, 186, 148]];
const WHITE = [[226, 228, 234], [236, 238, 243], [244, 245, 249], [250, 250, 252]];
const SHORTS_A = [[91, 102, 196], [93, 108, 199], [97, 125, 207], [98, 130, 209]];
const SHIRT = [[58, 163, 120], [90, 196, 135], [32, 137, 107], [40, 145, 111], [81, 187, 131]];
const REMAP = [...SKIN_A.map((c, i) => [c, SKIN_D[i]]), ...SHORTS_A.map((c, i) => [c, WHITE[i]]), [[235, 146, 104], [236, 238, 243]], [[179, 99, 67], [226, 228, 234]]];
const HAIR_BLACK = c => { const l = (.299 * c[0] + .587 * c[1] + .114 * c[2]) / 150, v = Math.round(30 + 28 * Math.min(1.2, l)); return [v, v, v + 6]; };

/* 組一個男生：隊伍色、持拍手、背號 */
function buildMan(teamHex, hand, label) {
  const m = SkeletonUtils.clone(G['character-male-a'].scene);
  const tHead = m.getObjectByName('head-mesh'), skel = tHead.skeleton, bm = tHead.bindMatrix, parent = tHead.parent;
  const pick = (name, roles) => { const src = G[name].scene.getObjectByName('head-mesh'); return subMesh(src, headParts(src).filter(p => roles.includes(p.role)).flatMap(p => p.tris), skel, bm); };
  parent.remove(tHead);
  const hair = pick('character-male-e', ['hair']); recolor(hair, [], null, HAIR_BLACK);
  parent.add(pick('character-male-d', ['head', 'ear'])); parent.add(pick('character-male-d', ['eye', 'mouth'])); parent.add(hair);
  const b = m.getObjectByName('body-mesh');
  b.geometry = b.geometry.clone();   // 每個人自己一份，不然換色會互相覆蓋（複製出來的人物共用同一份模型資料）
  recolor(b, SHIRT, teamHex, REMAP);
  const mixer = new THREE.AnimationMixer(m); mixer.clipAction(G['character-male-a'].animations.find(a => a.name === 'idle')).play(); mixer.update(.01);
  // 持拍手舉起＋球拍（全長＝身高）
  const sd = hand === 'R' ? -1 : 1, armName = hand === 'R' ? 'arm-right' : 'arm-left', arm = m.getObjectByName(armName);
  arm.rotation.z += sd * 1.05; arm.rotation.x -= .35;
  const bi = b.skeleton.bones.findIndex(x => x.name === armName), inv = b.skeleton.boneInverses[bi];
  const P = b.geometry.attributes.position, si = b.geometry.attributes.skinIndex, sw = b.geometry.attributes.skinWeight;
  let tip = new THREE.Vector3(), best = -1;
  for (let i = 0; i < P.count; i++) {
    let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === bi) w += sw.getComponent(i, k);
    if (w > .9) { const v = new THREE.Vector3().fromBufferAttribute(P, i).applyMatrix4(inv); if (v.length() > best) { best = v.length(); tip.copy(v); } }
  }
  m.updateMatrixWorld(true);
  const rk = racket(MODEL_H); rk.position.copy(tip).multiplyScalar(.85);
  const want = new THREE.Quaternion().setFromEuler(new THREE.Euler(.1, 0, -sd * .3)), aq = new THREE.Quaternion();
  arm.getWorldQuaternion(aq); rk.quaternion.copy(aq.invert().multiply(want)); arm.add(rk);
  // 背號
  const ti = b.skeleton.bones.findIndex(x => x.name === 'torso'), tinv = b.skeleton.boneInverses[ti], box = new THREE.Box3();
  for (let i = 0; i < P.count; i++) {
    let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === ti) w += sw.getComponent(i, k);
    if (w > .9) box.expandByPoint(new THREE.Vector3().fromBufferAttribute(P, i).applyMatrix4(tinv));
  }
  const c = box.getCenter(new THREE.Vector3()), np = numberPlate(label); np.scale.setScalar(.85);
  np.position.set(c.x, box.max.y - (box.max.y - box.min.y) * .58, box.min.z - .002); np.rotation.y = Math.PI;
  m.getObjectByName('torso').add(np);
  m.scale.setScalar(SCALE);
  return m;
}

/* ---------- 場地：地板用和俯瞰同一套 SVG 畫成貼圖 ---------- */
const FLOOR_BOX = [-0.6, -0.6, W + 1.2, L + 1.2];
function svgTexture(svgInner, tex) {
  const [x, y, w, h] = FLOOR_BOX, PX = 2048, PY = Math.round(PX * h / w);
  const src = `<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PY}" viewBox="${x} ${y} ${w} ${h}">${svgInner}</svg>`;
  return new Promise(ok => {
    const img = new Image();
    img.onload = () => {
      const cv = tex.image; cv.width = PX; cv.height = PY;
      const g = cv.getContext('2d');
      g.fillStyle = css('--surround'); g.fillRect(0, 0, PX, PY);   // 先塗場外深綠：圓角外面不會變黑
      g.drawImage(img, 0, 0, PX, PY);
      tex.needsUpdate = true; ok();
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  });
}

/* 球網：網柱 1.55m、網子上緣 1.524m、網面高 0.76m（白色上緣帶） */
function buildNet() {
  const g = new THREE.Group(), span = W + 0.6, top = 1.55, depth = 0.76;
  const c = document.createElement('canvas'); c.width = 512; c.height = 64; const x = c.getContext('2d');
  x.strokeStyle = 'rgba(20,30,25,.55)'; x.lineWidth = 1.5;
  for (let k = 0; k <= 512; k += 6) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k, 64); x.stroke(); }
  for (let k = 0; k <= 64; k += 6) { x.beginPath(); x.moveTo(0, k); x.lineTo(512, k); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.x = 6;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(span, depth), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  mesh.position.set(0, top - depth / 2, 0); g.add(mesh);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(span, .06, .02), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .8 }));
  tape.position.set(0, top - .03, 0); g.add(tape);
  const postMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(css('--net')), roughness: .6 });
  [-span / 2, span / 2].forEach(px => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, top, 12), postMat); post.position.set(px, top / 2, 0); g.add(post);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(.12, .14, .05, 16), postMat); foot.position.set(px, .025, 0); g.add(foot);
  });
  g.position.z = NET_Y - L / 2;
  return g;
}

/* ---------- 羽球（白色羽毛裙＋軟木球頭），球頭朝 +Z ---------- */
function buildShuttle() {
  const g = new THREE.Group(), k = 4.2;   // 放大到約 0.3 公尺長，手機上才看得到（和俯瞰一樣比真實大）
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(.034 * k, .013 * k, .07 * k, 16, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .7, side: THREE.DoubleSide }));
  skirt.rotation.x = Math.PI / 2; skirt.position.z = -.035 * k; g.add(skirt);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.034 * k, .003 * k, 6, 24), new THREE.MeshStandardMaterial({ color: 0x9a9a9a }));
  rim.position.z = -.07 * k; g.add(rim);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(.0135 * k, .0135 * k, .008 * k, 16), new THREE.MeshStandardMaterial({ color: 0x3a3a3a }));
  band.rotation.x = Math.PI / 2; band.position.z = .002 * k; g.add(band);
  const cork = new THREE.Mesh(new THREE.SphereGeometry(.0135 * k, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe9dcc6, roughness: .9 }));
  cork.rotation.x = Math.PI / 2; cork.position.z = .006 * k; g.add(cork);
  return g;
}
const HIT_H = () => PERSON_H * 1.2;   // 羽球、球路起點的高度：大約在球拍的位置

/* 球路：空中弧線（起點、終點在球拍高度，最高點高過人頭）
   尖端是「面向鏡頭的三角形」：球路往遠處往下掉時，圓錐從上面看只剩一顆點，三角形才看得出方向 */
function shotArc(m, color, camera) {
  const g = new THREE.Group(), s = toWorld(...m.s), e = toWorld(...m.e), len = s.distanceTo(e), h = HIT_H();
  s.y = h; e.y = h;
  const top = h + .35 + .06 * len;   // 最高點：越長的球路飛越高，但不會陡到看不出方向
  const mid = s.clone().lerp(e, .5);
  const curve = new THREE.QuadraticBezierCurve3(s, new THREE.Vector3(mid.x, 2 * top - h, mid.z), e);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide });
  const HEAD = .5, HW = .38, tEnd = 1 - Math.min(.35, HEAD / Math.max(len, .01) * .8);
  const pts = []; for (let i = 0; i <= 40; i++) pts.push(curve.getPoint(i / 40 * tEnd));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, .045, 8, false), mat));
  // 尖端三角形：沿著曲線前進方向，平面盡量面向鏡頭
  const tip = curve.getPoint(1), base = curve.getPoint(tEnd), fwd = tip.clone().sub(base).normalize();
  const toCam = camera.position.clone().sub(tip).normalize();
  const side = new THREE.Vector3().crossVectors(fwd, toCam).normalize().multiplyScalar(HW / 2);
  const back = tip.clone().addScaledVector(fwd, -HEAD);
  const tri = new THREE.BufferGeometry().setFromPoints([tip, back.clone().add(side), back.clone().sub(side)]);
  g.add(new THREE.Mesh(tri, mat));
  // 地上的淡影子：看得出球路落在哪裡
  const flat = []; for (let i = 0; i <= 20; i++) { const p = curve.getPoint(i / 20); flat.push(new THREE.Vector3(p.x, .01, p.z)); }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(flat), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: .25 })));
  return g;
}

/* ---------- 對外：建立斜角畫面 ---------- */
export function setPersonHeight(h) { PERSON_H = h; SCALE = h / MODEL_H; }

export async function createView3D(stage) {
  await loadModels();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement; canvas.className = 'view3d';
  stage.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa99, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2, 8, 6); scene.add(sun);

  // 地板（場外深綠＋球場＋場線；之後螢光筆、跑位線也畫在這張）
  const floorTex = new THREE.CanvasTexture(document.createElement('canvas'));
  floorTex.colorSpace = THREE.SRGBColorSpace; floorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_BOX[2], FLOOR_BOX[3]), new THREE.MeshBasicMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(FLOOR_BOX[0] + FLOOR_BOX[2] / 2 - W / 2, 0, FLOOR_BOX[1] + FLOOR_BOX[3] / 2 - L / 2);
  scene.add(floor);
  // 場外深綠延伸到整個畫面（球場四周不留灰色空白）
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: new THREE.Color(css('--surround')) }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.002; scene.add(ground);
  scene.add(buildNet());

  const shuttle = buildShuttle(); scene.add(shuttle);
  const shuttleShadow = new THREE.Mesh(new THREE.CircleGeometry(.14, 24), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .22, depthWrite: false }));
  shuttleShadow.rotation.x = -Math.PI / 2; scene.add(shuttleShadow);
  const shots = new THREE.Group(); scene.add(shots);
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
  const shuttleHit = new THREE.Mesh(new THREE.SphereGeometry(.4, 12, 8), hitMat); shuttleHit.userData = { kind: 'shuttle' }; scene.add(shuttleHit);

  const camera = new THREE.PerspectiveCamera(30, 1, .1, 200);
  const people = new Map();   // key → { obj, shadow, badge, sig }
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .22, depthWrite: false });

  /* 鏡頭：從我方底線後上方斜看，仰角 ELEV；距離自動調到整個球場剛好放得進畫面 */
  const ELEV = 52 * Math.PI / 180, AIM = new THREE.Vector3(0, 0.4, 0.3);
  function fitCamera(w, h) {
    camera.aspect = w / h;
    const corners = [[-0.5, -0.6], [W + 0.5, -0.6], [-0.5, L + 0.6], [W + 0.5, L + 0.6]].map(([x, y]) => toWorld(x, y));
    corners.push(toWorld(0, 0).setY(2.4), toWorld(W, 0).setY(2.4));   // 遠端人物的頭也要放得進
    const dir = new THREE.Vector3(0, Math.sin(ELEV), Math.cos(ELEV));
    let lo = 5, hi = 80;
    for (let k = 0; k < 30; k++) {
      const d = (lo + hi) / 2;
      camera.position.copy(AIM).addScaledVector(dir, d); camera.lookAt(AIM); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      const fits = corners.every(p => { const v = p.clone().project(camera); return Math.abs(v.x) <= .98 && Math.abs(v.y) <= .98; });
      if (fits) hi = d; else lo = d;
    }
    camera.position.copy(AIM).addScaledVector(dir, hi); camera.lookAt(AIM); camera.updateProjectionMatrix();
  }

  function resize() {
    const r = stage.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
    fitCamera(r.width, r.height);
  }

  let floorSig = '';
  async function update(state, sceneData, floorSvg) {
    // 地板只在內容有變時重畫
    if (floorSvg !== floorSig) { floorSig = floorSvg; await svgTexture(floorSvg, floorTex); }
    const seen = new Set();
    sceneData.players.forEach(p => {
      const team = p.team === 'A' ? css('--team-a') : css('--team-b'), dark = p.team === 'A' ? css('--team-a-dark') : css('--team-b-dark');
      const key = p.id, sig = team + p.hand;
      let e = people.get(key);
      if (!e || e.sig !== sig) {
        if (e) { scene.remove(e.obj, e.shadow, e.badge, e.hit); }
        e = { obj: buildMan(team, p.hand, p.id), sig, badge: badge(p.id, dark) };
        e.shadow = new THREE.Mesh(new THREE.CircleGeometry(.24 * PERSON_H, 32), shadowMat); e.shadow.rotation.x = -Math.PI / 2;
        // 手指可按範圍：看不見的圓柱（比人稍大，手指比較好按到）
        e.hit = new THREE.Mesh(new THREE.CylinderGeometry(.45 * PERSON_H, .45 * PERSON_H, PERSON_H * 1.4, 12), hitMat);
        e.hit.userData = { kind: 'player', id: p.id };
        scene.add(e.obj, e.shadow, e.badge, e.hit); people.set(key, e);
      }
      const at = toWorld(p.x, p.y);
      e.obj.position.copy(at); e.obj.rotation.y = Math.PI - p.angle * Math.PI / 180;
      e.shadow.position.copy(at).setY(.005);
      e.badge.position.copy(at).setY(PERSON_H + .32);
      e.hit.position.copy(at).setY(PERSON_H * .7);
      seen.add(key);
    });
    for (const [k, e] of people) if (!seen.has(k)) { scene.remove(e.obj, e.shadow, e.badge, e.hit); people.delete(k); }
    // 羽球：浮在球拍高度，球頭朝俯瞰的方向
    const sh = sceneData.shuttle, sp = toWorld(sh.x, sh.y);
    shuttle.position.copy(sp).setY(HIT_H());
    shuttle.rotation.set(0, Math.PI - sh.heading * Math.PI / 180, 0);
    shuttleShadow.position.copy(sp).setY(.006);
    shuttleHit.position.copy(sp).setY(HIT_H());
    // 球路：空中弧線（螢光筆、跑位線畫在地板貼圖裡）
    shots.children.forEach(c => c.traverse(o => { if (o.geometry) o.geometry.dispose(); }));
    shots.clear();
    sceneData.marks.filter(m => m.type === 'arrow' && m.kind === 'shot').forEach(m => shots.add(shotArc(m, css('--arrow-shot'), camera)));
    renderer.render(scene, camera);
  }

  /* 手指位置 → 射線 */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function aim(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  /* 按到誰：羽球優先（比較小），再來是人 */
  function pick(e) {
    aim(e);
    const targets = [shuttleHit, ...[...people.values()].map(p => p.hit)];
    const hits = ray.intersectObjects(targets, false);
    const sh = hits.find(h => h.object === shuttleHit);
    return (sh || hits[0] || {}).object?.userData || null;
  }
  /* 手指指到的地面位置（公尺座標）；height＝在這個高度的水平面上（拖羽球時用球拍高度，手指才會黏在球上） */
  function groundAt(e, height = 0) {
    aim(e);
    const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), p)) return null;
    return { x: p.x + W / 2, y: p.z + L / 2 };
  }
  /* 截圖：寬 w 重畫一張，上下裁到只剩球場（留一點邊），畫完恢復原本大小
     回傳的圖多帶 courtTop＝遠端底線在圖上的高度（名字要置中在它上面） */
  function snapshot(w) {
    const old = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio(), h = w * 2;
    renderer.setPixelRatio(1); renderer.setSize(w, h, false); fitCamera(w, h);
    renderer.render(scene, camera);
    const py = p => (1 - p.clone().project(camera).y) / 2 * h;
    const farLine = py(toWorld(0, 0)), heads = py(toWorld(0, 0).setY(PERSON_H + .6)), near = py(toWorld(0, L + 0.6));
    const pad = w * .06, top = Math.max(0, Math.min(farLine, heads) - pad), bottom = Math.min(h, near + pad);
    const out = document.createElement('canvas'); out.width = w; out.height = Math.round(bottom - top);
    out.getContext('2d').drawImage(canvas, 0, top, w, out.height, 0, 0, w, out.height);
    out.courtTop = farLine - top;
    renderer.setPixelRatio(pr); renderer.setSize(old.x, old.y, false); fitCamera(old.x, old.y);
    renderer.render(scene, camera);
    return out;
  }

  return { canvas, resize, update, pick, groundAt, snapshot, hitHeight: HIT_H, render: () => renderer.render(scene, camera) };
}
