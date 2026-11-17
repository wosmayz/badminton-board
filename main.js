/* 羽球戰術板：畫面狀態與操作 */

/* ---------- 預設站位 ---------- */
function defaultScene(mode) {
  const players = mode === 'single'
    ? [
        { id: 'A1', team: 'A', x: 3.05, y: 10.4, angle: 0, hand: 'R' },
        { id: 'B1', team: 'B', x: 3.05, y: 3.0, angle: 180, hand: 'R' },
      ]
    : [
        { id: 'A1', team: 'A', x: 1.6, y: 10.3, angle: 0, hand: 'R' },
        { id: 'A2', team: 'A', x: 4.5, y: 10.3, angle: 0, hand: 'R' },
        { id: 'B1', team: 'B', x: 1.6, y: 3.1, angle: 180, hand: 'R' },
        { id: 'B2', team: 'B', x: 4.5, y: 3.1, angle: 180, hand: 'R' },
      ];
  const shuttle = mode === 'single' ? { x: 2.5, y: 9.4, heading: 20 } : { x: 2.1, y: 8.9, heading: 20 };
  return { players, shuttle, marks: [] };
}

/* 單打、雙打各自保留一份畫面：切回去時原封不動 */
const state = {
  mode: 'double',
  view: 'top',           // top＝俯瞰、3d＝斜角
  tool: 'move',
  pop: null,             // 打開中的工具選單：'pen'｜'arrow'｜null
  penColor: 'hl-1',
  autoFill: true,        // 畫圈自動填滿
  arrowKind: 'shot',     // shot＝球路（實線）、run＝跑位（虛線）
  scenes: { double: defaultScene('double'), single: defaultScene('single') },
};
const scene = () => state.scenes[state.mode];

/* ---------- 上一步／下一步（單打、雙打各自一份） ---------- */
const history = { double: { past: [], future: [] }, single: { past: [], future: [] } };
const hist = () => history[state.mode];
const snap = () => JSON.stringify(scene());
const HIST_MAX = 100;
// before＝改之前的樣子；有真的改到才記一步
function commit(before) {
  if (before == null || before === snap()) return;
  const h = hist(); h.past.push(before); h.future = [];
  if (h.past.length > HIST_MAX) h.past.shift();
}
function stepHistory(from, to) {
  if (!from.length) return;
  to.push(snap());
  state.scenes[state.mode] = JSON.parse(from.pop());
  sel = null; render();
}
let dragBefore = null;

/* ---------- 選取與拖曳狀態 ---------- */
// sel：{ kind:'player', id } 或 { kind:'shuttle' } 或 null
// drag：正在進行中的手指動作
let sel = null, drag = null;
const TAP_PX = 6;          // 手指移動超過這麼多像素才算「拖」，不然算「點」
const TAP_HIT_PX = 14;     // 其他工具下點人物／羽球：手指晃動在這範圍內、又放得快，仍算「點」（手機手指會晃）
const TAP_HIT_MS = 400;
const ROT_PER_PX = 1.1;     // 俯瞰／斜角：左右拖 1 像素轉幾度（拖約半個螢幕寬＝轉半圈）

const target = () => !sel ? null : sel.kind === 'shuttle' ? scene().shuttle : scene().players.find(p => p.id === sel.id);

/* ---------- 畫出來 ---------- */
const svg = document.getElementById('board');
const menu = document.getElementById('pmenu');
const angleTag = document.getElementById('angle');
const stage = svg.parentElement;

/* 畫出球場上的所有東西；clean＝截圖用（不畫選取光圈、旋轉輔助線） */
function boardSvg(clean) {
  const s = scene(), on = !clean;
  let g = Board.defs + Board.court(state.mode);
  // 圖層：地板（螢光筆、跑位線）→ 人物 → 羽球 → 空中（球路線）
  const markSvg = (m, i) => m.type === 'hl' ? Board.highlight(m, i) : Board.arrow(m, i);
  s.marks.forEach((m, i) => { if (m.type === 'hl' || m.kind === 'run') g += markSvg(m, i); });
  s.players.forEach(p => g += Board.player(p, on && sel && sel.kind === 'player' && sel.id === p.id));
  g += Board.shuttle(s.shuttle, on && sel && sel.kind === 'shuttle');
  s.marks.forEach((m, i) => { if (m.type === 'arrow' && m.kind === 'shot') g += markSvg(m, i); });
  if (on && drag && ((drag.type === 'arrow' && drag.fromShuttle) || (drag.type === 'shuttle' && drag.armed))) g += Board.glow(s.shuttle.x, s.shuttle.y);
  if (on && drag && drag.type === 'rotate' && drag.started) {
    const t = target(), ang = sel.kind === 'shuttle' ? t.heading : t.angle;
    g += Board.rotateGuide(t.x, t.y, ang, Board.PLAYER_R * 2.4);
  }
  return g;
}

function render() {
  svg.innerHTML = boardSvg(false);
  stage.classList.toggle('is-3d', state.view === '3d');
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-checked', b.dataset.view === state.view));
  if (state.view === '3d') render3d();

  document.querySelectorAll('.tool[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === state.tool));
  document.querySelectorAll('.seg [data-mode]').forEach(b => b.setAttribute('aria-checked', b.dataset.mode === state.mode));
  document.getElementById('undo').disabled = !hist().past.length;
  document.getElementById('redo').disabled = !hist().future.length;
  placeOverlays();
  placePops();
}

/* 公尺座標 → 舞台上的像素座標 */
function toStage(x, y) {
  const m = svg.getScreenCTM(), r = stage.getBoundingClientRect();
  return { x: m.a * x + m.c * y + m.e - r.left, y: m.b * x + m.d * y + m.f - r.top, scale: m.a };
}
/* 手指位置 → 公尺座標 */
function toBoard(e) {
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  return { x: p.x, y: p.y };
}

/* 球員選單、旋轉角度的位置 */
function placeOverlays() {
  if (state.view === '3d') return placeOverlays3d();
  const t = target(), rotating = drag && drag.type === 'rotate' && drag.started;
  // 選單：選到球員、而且不在旋轉中才出現
  if (t && sel.kind === 'player' && !rotating) {
    menu.hidden = false;
    menu.querySelectorAll('[data-hand]').forEach(b => b.setAttribute('aria-checked', b.dataset.hand === t.hand));
    const c = toStage(t.x, t.y), ring = Board.PLAYER_R * 2.4 * c.scale, w = menu.offsetWidth, h = menu.offsetHeight;
    const sw = stage.clientWidth, sh = stage.clientHeight;
    let top = c.y - ring - h - 8;
    if (top < 4) top = Math.min(c.y + ring + 8, sh - h - 4);   // 上面放不下就放下面
    menu.style.left = Math.min(Math.max(c.x - w / 2, 4), sw - w - 4) + 'px';
    menu.style.top = top + 'px';
  } else menu.hidden = true;
  // 角度：旋轉中顯示在人物下方
  if (t && rotating) {
    const c = toStage(t.x, t.y), ring = (sel.kind === 'shuttle' ? Board.PLAYER_R * 1.1 : Board.PLAYER_R * 2.4) * c.scale;
    const deg = Math.round(sel.kind === 'shuttle' ? t.heading : t.angle);
    angleTag.hidden = false;
    angleTag.textContent = ((deg % 360) + 360) % 360 + '°';
    angleTag.style.left = c.x + 'px';
    angleTag.style.top = (c.y + ring + 8) + 'px';
  } else angleTag.hidden = true;
}

/* 斜角畫面：選單放在頭頂上方、角度標籤放在腳下（用 3D 位置換算到畫面） */
function placeOverlays3d() {
  const t = target(), rotating = drag3d && drag3d.type === 'rotate' && drag3d.started;
  if (!v3 || !t) { menu.hidden = true; angleTag.hidden = true; return; }
  const H = sel.kind === 'shuttle' ? v3.hitHeight() : v3.personHeight() + .6;
  const head = v3.screenOf(t.x, t.y, H), feet = v3.screenOf(t.x, t.y, 0);
  if (sel.kind === 'player' && !rotating) {
    menu.hidden = false;
    menu.querySelectorAll('[data-hand]').forEach(b => b.setAttribute('aria-checked', b.dataset.hand === t.hand));
    const w = menu.offsetWidth, h = menu.offsetHeight, sw = stage.clientWidth, sh = stage.clientHeight;
    let top = head.y - h - 10;
    if (top < 4) top = Math.min(feet.y + 24, sh - h - 4);   // 上面放不下就放腳下
    menu.style.left = Math.min(Math.max(head.x - w / 2, 4), sw - w - 4) + 'px';
    menu.style.top = top + 'px';
  } else menu.hidden = true;
  if (rotating) {
    const deg = Math.round(sel.kind === 'shuttle' ? t.heading : t.angle);
    angleTag.hidden = false;
    angleTag.textContent = ((deg % 360) + 360) % 360 + '°';
    angleTag.style.left = feet.x + 'px';
    angleTag.style.top = (feet.y + 26) + 'px';
  } else angleTag.hidden = true;
}

/* ---------- 手指操作（只在「移動」工具時） ----------
   沒選取時拖＝移動；點一下＝選取；選取後拖＝轉向手指方向；點空白處＝取消選取 */
function hitTest(e) {
  // 球路線畫在人和球上面；用 elementsFromPoint 穿過線，找到底下的人或球
  for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
    const pl = el.closest && el.closest('.player');
    if (pl) return { kind: 'player', id: pl.dataset.id };
    if (el.closest && el.closest('.shuttle')) return { kind: 'shuttle' };
  }
  return null;
}
const same = (a, b) => a && b && a.kind === b.kind && a.id === b.id;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/* ---------- 螢光筆、箭頭、橡皮擦 ---------- */
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const LOOP_GAP = 0.6;      // 頭尾距離小於這個（公尺）就當作畫了一圈
const LOOP_MIN = 2.0;      // 太短的線不算圈
const ARROW_MIN = 0.4;     // 箭頭太短就當作手滑，不留
const SHUTTLE_GAP = 0.4;   // 球路從羽球中心往外這麼遠才開始畫（羽球半徑約 0.3）
const PEN_FOLLOW = 0.45;   // 螢光筆防手抖：越小越平滑、越跟不上手指
const HOLD_MS = 450;       // 在羽球上按住這麼久（亮黃圈）再拉＝拉出球路

/* 畫圈自動填滿：這一筆自己頭尾接起來，或和同顏色的其他筆（最多 4 筆）頭尾相接成一圈 */
const pathLen = pts => { let l = 0; for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]); return l; };
const isLoop = pts => pts.length > 3 && pathLen(pts) > LOOP_MIN && dist(pts[0], pts[pts.length - 1]) < LOOP_GAP;
function closeLoop(mark) {
  const marks = scene().marks;
  const others = marks.filter(m => m !== mark && m.type === 'hl' && !m.closed && m.color === mark.color);
  // 新的這一筆正著、反著各試一次
  for (const start of [mark.pts, mark.pts.slice().reverse()]) {
    let chain = start.slice(); const used = [];
    for (let k = 0; k < 4; k++) {
      if (isLoop(chain)) break;
      const end = chain[chain.length - 1];
      const next = others.find(m => !used.includes(m) && (dist(m.pts[0], end) < LOOP_GAP || dist(m.pts[m.pts.length - 1], end) < LOOP_GAP));
      if (!next) break;
      used.push(next);
      chain = chain.concat(dist(next.pts[0], end) < LOOP_GAP ? next.pts : next.pts.slice().reverse());
    }
    if (isLoop(chain)) {
      used.forEach(m => marks.splice(marks.indexOf(m), 1));   // 合併成一塊
      mark.pts = chain; mark.closed = true;
      return;
    }
  }
}

/* 箭頭＝起點到手指現在位置的直線（手指拖回來就跟著縮短） */
const straight = (s, e) => ({ s, c: [(s[0] + e[0]) / 2, (s[1] + e[1]) / 2], e });

/* 橡皮擦：手指下面那一筆標示刪掉（人物蓋在上面也擦得到底下的線） */
function eraseAt(e) {
  const el = document.elementsFromPoint(e.clientX, e.clientY).map(n => n.closest && n.closest('.mark')).find(Boolean);
  if (!el) return false;
  scene().marks.splice(+el.dataset.i, 1);
  render();
  return true;
}

/* 點一下人物或羽球＝切回「移動」並選取它（不管原本是哪個工具） */
function goMove(hit) {
  // 其他工具下點人物／羽球＝切回移動，但不選取（接著就能直接拖去移動）
  state.tool = 'move'; state.pop = null; sel = null;
}
const moved = (d, e) => Math.hypot(e.clientX - d.sx, e.clientY - d.sy) >= TAP_PX;

/* 從羽球拉球路：球頭對準箭頭方向 */
function startShotFromShuttle(d) {
  const sh = scene().shuttle, center = [sh.x, sh.y];
  const mark = { type: 'arrow', kind: 'shot', s: center, c: center, e: center };
  scene().marks.push(mark);
  return { type: 'arrow', id: d.id, mark, fromShuttle: true, center, started: true, sx: d.sx, sy: d.sy };
}

svg.addEventListener('pointerdown', e => {
  if (drag) return;
  if (state.pop) { state.pop = null; placePops(); }
  dragBefore = snap();
  const pt = toBoard(e), P = [pt.x, pt.y], hit = hitTest(e);
  const base = { id: e.pointerId, sx: e.clientX, sy: e.clientY, hit, t0: performance.now(), far: 0 };
  svg.setPointerCapture(e.pointerId);

  // ---- 羽球：每個工具都一樣 ----
  // 直接拖＝搬；長按 HOLD_MS（亮黃圈）再拉＝拉出球路；點一下＝回到移動並選取
  // （移動工具下已選取的羽球，拖＝旋轉，交給下面的移動工具處理）
  if (hit && hit.kind === 'shuttle' && !(state.tool === 'move' && same(hit, sel))) {
    const sh = scene().shuttle, d = { ...base, type: 'shuttle', started: false, armed: false, ox: sh.x - P[0], oy: sh.y - P[1] };
    d.timer = setTimeout(() => {
      if (drag !== d || d.started) return;
      d.armed = true;
      if (navigator.vibrate) navigator.vibrate(10);
      render();
    }, HOLD_MS);
    drag = d; return;
  }

  if (state.tool === 'pen') {
    const mark = { type: 'hl', color: state.penColor, pts: [P, [P[0] + .001, P[1]]], closed: false };
    scene().marks.push(mark);
    drag = { ...base, type: 'pen', mark, started: false };
    render(); return;
  }
  if (state.tool === 'arrow') {
    // 箭頭等手指真的移動了才建立（只是點一下人物＝回到移動）
    drag = { ...base, type: 'arrow', mark: null, start: P, fromShuttle: false, started: false };
    return;
  }
  if (state.tool === 'erase') {
    drag = { ...base, type: 'erase', started: false, erased: eraseAt(e) };
    return;
  }

  // ---- 移動工具 ----
  if (sel && (!hit || same(hit, sel))) {
    // 已選取：在空白處或在它身上拖＝旋轉
    drag = { ...base, type: 'rotate', started: false };
  } else if (hit) {
    // 沒選取（或按到別人）：拖＝移動、點＝選取
    const obj = scene().players.find(p => p.id === hit.id);
    drag = { ...base, type: 'move', started: false, obj, ox: obj.x - pt.x, oy: obj.y - pt.y };
  } else {
    drag = { ...base, type: 'none', started: false };
  }
});

svg.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  drag.far = Math.max(drag.far || 0, Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy));
  const pt = toBoard(e), P = [pt.x, pt.y];

  if (drag.type === 'shuttle') {
    if (drag.far < (drag.armed ? TAP_PX : TAP_HIT_PX)) return;
    clearTimeout(drag.timer);
    const sh = scene().shuttle;
    if (drag.armed) drag = startShotFromShuttle(drag);
    else { sel = null; drag = { ...drag, type: 'move', started: true, obj: sh }; }
  }

  if (drag.type === 'pen') {
    if (moved(drag, e)) drag.started = true;
    // 防手抖：筆尖只往手指方向追一部分（像用線拉著筆），小抖動會被吸收
    drag.sm = drag.sm ? [drag.sm[0] + (P[0] - drag.sm[0]) * PEN_FOLLOW, drag.sm[1] + (P[1] - drag.sm[1]) * PEN_FOLLOW] : P;
    const pts = drag.mark.pts;
    if (dist(pts[pts.length - 1], drag.sm) > 0.06) { pts.push(drag.sm); render(); }
    return;
  }
  if (drag.type === 'arrow') {
    if (!drag.mark) {
      if (!moved(drag, e)) return;
      drag.started = true;
      drag.mark = { type: 'arrow', kind: state.arrowKind, s: drag.start, c: drag.start, e: drag.start };
      scene().marks.push(drag.mark);
    }
    if (drag.fromShuttle) {
      // 從羽球拉：箭頭從球的邊緣出發（不壓在球上），球頭對準箭頭方向
      const [cx, cy] = drag.center, dx = P[0] - cx, dy = P[1] - cy, L = Math.hypot(dx, dy);
      if (L > SHUTTLE_GAP) {
        Object.assign(drag.mark, straight([cx + dx / L * SHUTTLE_GAP, cy + dy / L * SHUTTLE_GAP], P));
        scene().shuttle.heading = Math.atan2(dx, -dy) * 180 / Math.PI;
      } else Object.assign(drag.mark, straight(drag.center, drag.center));
    } else Object.assign(drag.mark, straight(drag.mark.s, P));
    render(); return;
  }
  if (drag.type === 'erase') {
    if (moved(drag, e)) drag.started = true;
    if (eraseAt(e)) drag.erased = true;
    return;
  }

  if (!drag.started) {
    if (!moved(drag, e)) return;
    drag.started = true;
    if (drag.type === 'move') sel = null;   // 拖別人時，原本選的取消
  }
  if (drag.type === 'move') {
    drag.obj.x = clamp(pt.x + drag.ox, -0.2, Board.W + 0.2);   // 不拖出畫面（球場已滿版）
    drag.obj.y = clamp(pt.y + drag.oy, -0.3, Board.L + 0.3);
    render();
  } else if (drag.type === 'rotate') {
    // 轉向：以原本的方向為準，跟著手指左右拖來轉（往右拖＝往右轉），和斜角一致
    const t = target(), key = sel.kind === 'shuttle' ? 'heading' : 'angle';
    if (drag.a0 == null) drag.a0 = t[key];
    t[key] = drag.a0 + (e.clientX - drag.sx) * ROT_PER_PX;
    render();
  }
});

function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag; drag = null;
  clearTimeout(d.timer);
  const marks = scene().marks;
  // 在其他工具下點人物／羽球：手指稍微晃到也算點（不留下短線，直接回到移動，不選取）
  const hitTap = d.hit && d.far < TAP_HIT_PX && performance.now() - d.t0 < TAP_HIT_MS;
  if (d.type === 'shuttle') {
    // 沒拖動就放開：點一下或長按後放開都當作「點」
    if (state.tool === 'move') sel = d.hit; else goMove(d.hit);   // 移動工具下點羽球＝選取
  } else if (d.type === 'pen') {
    if ((!d.started && d.hit) || hitTap) { marks.splice(marks.indexOf(d.mark), 1); goMove(d.hit); }
    else {
      const end = toBoard(e); d.mark.pts.push([end.x, end.y]);   // 筆尖補到手指放開的位置
      if (state.autoFill) closeLoop(d.mark);
    }
  } else if (d.type === 'arrow') {
    if ((!d.mark && d.hit) || hitTap) { if (d.mark) marks.splice(marks.indexOf(d.mark), 1); goMove(d.hit); }
    else if (d.mark && dist(d.mark.s, d.mark.e) < ARROW_MIN) marks.splice(marks.indexOf(d.mark), 1);
  } else if (d.type === 'erase') {
    if ((!d.started || hitTap) && !d.erased && d.hit) goMove(d.hit);   // 人物腳下沒有線可擦＝回到移動
  } else if (!d.started) {
    // 移動工具的「點」
    if (d.type === 'move') sel = d.hit;                       // 點人＝選取
    else if (d.type === 'rotate') sel = d.hit ? sel : null;   // 點自己＝維持；點空白＝取消
    else sel = null;
  }
  commit(dragBefore); dragBefore = null;
  render();
}
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);

/* ---------- 工具選單（螢光筆顏色、箭頭種類） ---------- */
const pops = { pen: document.getElementById('pop-pen'), arrow: document.getElementById('pop-arrow'), more: document.getElementById('pop-more') };
function placePops() {
  document.getElementById('more').setAttribute('aria-pressed', state.pop === 'more');   // 選單外點一下關掉時也要同步
  const app = document.querySelector('.app').getBoundingClientRect(), rail = document.querySelector('.rail').getBoundingClientRect();
  Object.entries(pops).forEach(([k, el]) => {
    el.hidden = state.pop !== k;
    if (el.hidden) return;
    const btn = (k === 'more' ? document.getElementById('more') : document.querySelector(`.tool[data-tool="${k}"]`)).getBoundingClientRect();
    el.style.left = (rail.left - app.left - el.offsetWidth - 8) + 'px';
    // 「更多」在工具列最下面：選單底部對齊按鈕底部
    el.style.top = (k === 'more' ? btn.bottom - app.top - el.offsetHeight : btn.top - app.top) + 'px';
  });
  pops.pen.querySelectorAll('[data-color]').forEach(b => b.setAttribute('aria-checked', b.dataset.color === state.penColor));
  document.getElementById('autofill').setAttribute('aria-checked', state.autoFill);
  pops.arrow.querySelectorAll('[data-kind]').forEach(b => b.setAttribute('aria-checked', b.dataset.kind === state.arrowKind));
}
// 選好顏色／種類就收起選單（選單蓋在球場上，不收會擋到畫的地方）
pops.pen.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => { state.penColor = b.dataset.color; state.pop = null; placePops(); }));
document.getElementById('autofill').addEventListener('click', () => { state.autoFill = !state.autoFill; placePops(); });
pops.arrow.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => { state.arrowKind = b.dataset.kind; state.pop = null; placePops(); }));
// 點選單和工具列以外的地方＝收起選單
document.addEventListener('pointerdown', e => {
  if (state.pop && !e.target.closest('.pop, .rail')) { state.pop = null; placePops(); }
}, true);

/* 換持拍手 */
menu.querySelectorAll('[data-hand]').forEach(b => b.addEventListener('click', () => {
  const t = target(); if (t && sel.kind === 'player') { const before = snap(); t.hand = b.dataset.hand; commit(before); render(); }
}));

/* ---------- 工具列 ---------- */
document.querySelectorAll('[data-icon]').forEach(el => {
  el.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[el.dataset.icon]}</svg>`);
});
document.querySelectorAll('.tool[data-tool]').forEach(b => b.addEventListener('click', () => {
  const t = b.dataset.tool, hasPop = t === 'pen' || t === 'arrow';
  if (t !== 'move' && state.view === '3d') state.view = 'top';   // 畫線、擦線回俯瞰做
  // 換到螢光筆／箭頭時不跳選單；已經是這個工具時再按一次＝開關選單
  state.pop = hasPop && state.tool === t && state.pop !== t ? t : null;
  state.tool = t; sel = null; render();
}));
document.querySelectorAll('.seg [data-mode]').forEach(b => b.addEventListener('click', () => { state.mode = b.dataset.mode; sel = null; render(); }));
document.getElementById('undo').addEventListener('click', () => stepHistory(hist().past, hist().future));
document.getElementById('redo').addEventListener('click', () => stepHistory(hist().future, hist().past));
document.getElementById('more').addEventListener('click', () => { state.pop = state.pop === 'more' ? null : 'more'; sel = null; render(); });

/* ---------- 清除、重置（先確認） ---------- */
const dialog = document.getElementById('dialog');
let dialogOk = null;
function confirmBox(title, body, okLabel, fn) {
  state.pop = null; placePops();
  document.getElementById('dlg-title').textContent = title;
  document.getElementById('dlg-body').textContent = body;
  document.getElementById('dlg-ok').textContent = okLabel;
  dialogOk = fn; dialog.hidden = false;
}
document.getElementById('dlg-cancel').addEventListener('click', () => { dialog.hidden = true; });
document.getElementById('dlg-ok').addEventListener('click', () => {
  dialog.hidden = true;
  const before = snap(); dialogOk(); commit(before); sel = null; render();
});
document.getElementById('clear-marks').addEventListener('click', () =>
  confirmBox('清除所有標示？', '螢光筆和箭頭會清掉，球員和羽球不動', '清除', () => { scene().marks = []; }));
document.getElementById('reset-pos').addEventListener('click', () =>
  confirmBox('重置球員站位？', '球員和羽球回到一開始的位置，標示不動', '重置', () => {
    // 持拍手是球員本身的習慣，重置站位時保留
    const d = defaultScene(state.mode), hands = Object.fromEntries(scene().players.map(p => [p.id, p.hand]));
    d.players.forEach(p => { if (hands[p.id]) p.hand = hands[p.id]; });
    scene().players = d.players; scene().shuttle = d.shuttle;
  }));

/* ---------- 截圖：上方名字＋球場（含場外深綠邊），1080 寬 ---------- */
const APP_NAME = 'Team YE 羽球戰術板';
const SHOT_W = 1080, SHOT_BOX = [-0.6, -0.6, Board.W + 1.2, Board.L + 1.2];   // 公尺：剛好是場外深綠那一塊
const SHOT_HEAD = 100;   // 上方名字那一條多加的高度（像素）
function makeShot() {
  const [x, y, w, h] = SHOT_BOX, H = Math.round(SHOT_W * h / w);
  // 把球場圖（俯瞰的 SVG 或斜角的 3D）貼到名字條下面；courtTop＝球場最上面那條白線在圖上的高度
  const compose = (pic, H = pic.height, courtTop = (0 - y) * SHOT_W / w) => new Promise((ok, fail) => {
    const cv = document.createElement('canvas'); cv.width = SHOT_W; cv.height = SHOT_HEAD + H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surround').trim();
    ctx.fillRect(0, 0, SHOT_W, SHOT_HEAD + H);   // 整張底色＝場外深綠，名字放在上面這條
    ctx.drawImage(pic, 0, SHOT_HEAD, SHOT_W, H);   // 先貼球場，名字最後寫才不會被蓋住
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 48px -apple-system, "PingFang TC", "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    // 名字放在「圖片頂端」到「球場底線（上方白線）」中間；用字的實際上下緣置中
    const lineTop = SHOT_HEAD + courtTop, m = ctx.measureText(APP_NAME);
    ctx.fillText(APP_NAME, SHOT_W / 2, lineTop / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
    cv.toBlob(b => b ? ok(b) : fail(new Error('toBlob')), 'image/png');
  });
  // 斜角畫面：用 3D 重畫一張同樣大小的圖
  if (state.view === '3d' && v3) { const pic = v3.snapshot(SHOT_W); return compose(pic, pic.height, pic.courtTop); }
  const src = `<svg xmlns="http://www.w3.org/2000/svg" width="${SHOT_W}" height="${H}" viewBox="${x} ${y} ${w} ${h}">${boardSvg(true)}</svg>`;
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => compose(img, H).then(ok, fail);
    img.onerror = fail;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  });
}
const shotName = () => { const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${APP_NAME}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.png`; };

/* 按截圖：先出預覽，看過再決定存相簿或傳 LINE */
const preview = document.getElementById('preview'), previewImg = document.getElementById('preview-img');
let shotFile = null;
const canShareFile = f => !!(navigator.canShare && navigator.canShare({ files: [f] }));
document.getElementById('shot').addEventListener('click', async () => {
  state.pop = null; sel = null; render();
  try {
    shotFile = new File([await makeShot()], shotName(), { type: 'image/png' });
    if (previewImg.src) URL.revokeObjectURL(previewImg.src);
    previewImg.src = URL.createObjectURL(shotFile);
    const share = canShareFile(shotFile);
    // 能分享（iPhone／iPad）：分享面板裡有「儲存影像」和 LINE；不能分享（電腦）：直接下載
    document.getElementById('preview-share').textContent = share ? '存相簿／傳 LINE' : '下載圖片';
    document.getElementById('preview-hint').hidden = !share;
    preview.hidden = false;
  } catch (err) {
    alert('截圖失敗，請再試一次');
    console.error(err);
  }
});
document.getElementById('preview-close').addEventListener('click', () => { preview.hidden = true; });
document.getElementById('preview-share').addEventListener('click', async () => {
  const file = shotFile; if (!file) return;
  if (canShareFile(file)) {
    try { await navigator.share({ files: [file] }); }
    catch (err) { if (err.name !== 'AbortError') alert('分享失敗：可以長按圖片存到相簿'); }   // 自己關掉分享面板不算錯
  } else {
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
});

/* 整頁不讓手指捲動或縮放（預覽圖片除外，要能長按存相簿） */
document.addEventListener('touchmove', e => { if (!e.target.closest('#preview-img')) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());

/* ---------- 斜角 3D 視角（第一次切換時才載入） ---------- */
let v3 = null, v3Loading = null;
// 地板：球場＋螢光筆＋跑位線（球路在 3D 裡畫成空中弧線）
const floorSvg = () => Board.defs + Board.court(state.mode, true) + scene().marks.map((m, i) =>
  m.type === 'hl' ? Board.highlight(m, i) : m.kind === 'run' ? Board.arrow(m, i) : '').join('');
function render3d() {
  if (!v3) return;
  v3.update(state, scene(), floorSvg(), sel);
}
async function ensure3d() {
  if (v3) return v3;
  if (!v3Loading) {
    const tag = document.getElementById('loading3d'); tag.hidden = false;
    v3Loading = import('./view3d.js?v=17').then(m => m.createView3D(stage)).then(v => { v3 = v; bind3d(v); v.resize(); tag.hidden = true; return v; })
      .catch(err => { tag.hidden = true; v3Loading = null; console.error(err); alert('3D 畫面載入失敗，請檢查網路後再試一次'); state.view = 'top'; render(); });
  }
  return v3Loading;
}
/* 斜角畫面：單指拖人物、羽球；兩指捏＝放大縮小、兩指拖＝移動畫面；點兩下空白處＝回原尺寸
   （轉方向、畫線回俯瞰做） */
let drag3d = null;
function bind3d(v) {
  const cv = v.canvas, fingers = new Map();
  let pinch = null, lastTap = 0;
  const two = () => { const [a, b] = [...fingers.values()]; return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), mid: { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 } }; };
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    // 第一根手指放下（isPrimary）時，畫面上不可能還有別的手指：清掉殘留紀錄，免得被誤判成兩指縮放
    if (e.isPrimary) { fingers.clear(); pinch = null; }
    fingers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    if (fingers.size === 2) {
      // 第二根手指放下：改成縮放／移動，正在拖的人放回原位
      if (drag3d) { state.scenes[state.mode] = JSON.parse(drag3d.before); drag3d = null; render(); }
      pinch = two(); return;
    }
    if (fingers.size > 2) return;
    const hit = v.pick(e), base = { id: e.pointerId, sx: e.clientX, sy: e.clientY, hit, started: false, before: snap() };
    // 按在場地（球場邊線）以外的地方拖＝轉鏡頭角度（點兩下＝回原本角度）
    const g0 = v.groundAt(e);
    if (!hit && (!g0 || g0.x < 0 || g0.x > Board.W || g0.y < 0 || g0.y > Board.L)) {
      const now = Date.now(); if (now - lastTap < 320) { v.resetView(); render(); lastTap = 0; return; }
      lastTap = now;
      drag3d = { ...base, type: 'orbit', lx: e.clientX, ly: e.clientY }; return;
    }
    // 已選取：在空白處或在它身上拖＝轉向手指方向（和俯瞰一樣）
    if (sel && (!hit || same(hit, sel))) { drag3d = { ...base, type: 'rotate' }; return; }
    if (!hit) {
      // 點兩下空白處：回原尺寸
      const now = Date.now(); if (now - lastTap < 320) { v.resetView(); placeOverlays(); lastTap = 0; } else lastTap = now;
      return;
    }
    // 沒選取（或按到別人）：拖＝移動、點＝選取
    const obj = hit.kind === 'shuttle' ? scene().shuttle : scene().players.find(p => p.id === hit.id);
    const h = hit.kind === 'shuttle' ? v.hitHeight() : 0, g = v.groundAt(e, h); if (!g) return;
    drag3d = { ...base, type: 'move', obj, h, ox: obj.x - g.x, oy: obj.y - g.y };
  });
  cv.addEventListener('pointermove', e => {
    if (!fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    if (pinch && fingers.size === 2) {
      const now = two();
      v.panBy(pinch.mid, now.mid);
      if (pinch.d > 0) v.zoomAt(now.d / pinch.d, now.mid);
      pinch = now; placeOverlays(); return;
    }
    if (!drag3d || e.pointerId !== drag3d.id) return;
    if (!drag3d.started) {
      if (Math.hypot(e.clientX - drag3d.sx, e.clientY - drag3d.sy) < TAP_PX) return;
      drag3d.started = true;
      if (drag3d.type === 'move') sel = null;   // 拖別人時，原本選的取消
    }
    if (drag3d.type === 'orbit') {
      v.orbitBy(e.clientX - drag3d.lx, e.clientY - drag3d.ly);
      drag3d.lx = e.clientX; drag3d.ly = e.clientY;
      render(); return;   // 球路箭頭的尖端要重新面向鏡頭，所以整個重畫
    } else if (drag3d.type === 'move') {
      const g = v.groundAt(e, drag3d.h); if (!g) return;
      drag3d.obj.x = clamp(g.x + drag3d.ox, -0.2, Board.W + 0.2);
      drag3d.obj.y = clamp(g.y + drag3d.oy, -0.3, Board.L + 0.3);
    } else {
      // 轉向：以原本的方向為準，跟著手指左右拖來轉（往右拖＝往右轉）；11/17 她覺得「轉向手指指的方向」在斜角不好控制
      const t = target(); if (!t) return;
      const key = sel.kind === 'shuttle' ? 'heading' : 'angle';
      if (drag3d.a0 == null) drag3d.a0 = t[key];
      t[key] = drag3d.a0 + (e.clientX - drag3d.sx) * ROT_PER_PX;
    }
    render();
  });
  const end = e => {
    fingers.delete(e.pointerId);
    if (fingers.size < 2) pinch = null;
    if (!drag3d || e.pointerId !== drag3d.id) return;
    const d = drag3d; drag3d = null;
    if (d.type === 'orbit') { if (!d.started) sel = null; render(); return; }   // 轉鏡頭不記入上一步
    if (!d.started) {
      // 這是一次「點」：點人／球＝選取；點自己＝維持；點空白＝取消（點兩下空白＝回原尺寸，在按下時處理）
      if (d.type === 'move') sel = d.hit;
      else if (!d.hit) { sel = null; const now = Date.now(); if (now - lastTap < 320) { v.resetView(); placeOverlays(); lastTap = 0; } else lastTap = now; }
    }
    commit(d.before); render();
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('lostpointercapture', e => fingers.delete(e.pointerId));
  // 電腦：滑鼠滾輪縮放
  cv.addEventListener('wheel', e => { e.preventDefault(); v.zoomAt(Math.exp(-e.deltaY * .002), e); placeOverlays(); }, { passive: false });
}

document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', async () => {
  state.view = b.dataset.view; sel = null; state.pop = null;
  if (state.view === '3d') state.tool = 'move';
  render();
  if (state.view === '3d') { await ensure3d(); render(); }
}));

window.addEventListener('resize', () => { placeOverlays(); placePops(); if (v3 && state.view === '3d') { v3.resize(); render3d(); } });

render();
