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
const MIN_ROT = 0.25;      // 手指離中心太近（公尺）時不轉，避免亂跳

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
    g += Board.rotateGuide(t.x, t.y, ang, Math.max(drag.dist, Board.PLAYER_R * 2.4));
  }
  return g;
}

function render() {
  svg.innerHTML = boardSvg(false);

  document.querySelectorAll('.tool[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === state.tool));
  document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-checked', b.dataset.mode === state.mode));
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
  state.tool = 'move'; state.pop = null; sel = hit;
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
  const base = { id: e.pointerId, sx: e.clientX, sy: e.clientY, hit };
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
    drag = { ...base, type: 'rotate', started: false, dist: 0 };
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
  const pt = toBoard(e), P = [pt.x, pt.y];

  if (drag.type === 'shuttle') {
    if (!moved(drag, e)) return;
    clearTimeout(drag.timer);
    const sh = scene().shuttle;
    if (drag.armed) drag = startShotFromShuttle(drag);
    else { sel = null; drag = { ...drag, type: 'move', started: true, obj: sh }; }
  }

  if (drag.type === 'pen') {
    if (moved(drag, e)) drag.started = true;
    const pts = drag.mark.pts;
    if (dist(pts[pts.length - 1], P) > 0.05) { pts.push(P); render(); }
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
    const t = target(), dx = pt.x - t.x, dy = pt.y - t.y, d = Math.hypot(dx, dy);
    drag.dist = d;
    if (d >= MIN_ROT) {
      const ang = Math.atan2(dx, -dy) * 180 / Math.PI;   // 0＝朝上，順時針
      if (sel.kind === 'shuttle') t.heading = ang; else t.angle = ang;
    }
    render();
  }
});

function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag; drag = null;
  clearTimeout(d.timer);
  const marks = scene().marks;
  if (d.type === 'shuttle') {
    // 沒拖動就放開：點一下或長按後放開都當作「點」
    goMove(d.hit);
  } else if (d.type === 'pen') {
    if (!d.started && d.hit) { marks.splice(marks.indexOf(d.mark), 1); goMove(d.hit); }
    else {
      if (state.autoFill) closeLoop(d.mark);
    }
  } else if (d.type === 'arrow') {
    if (!d.mark && d.hit) goMove(d.hit);
    else if (d.mark && dist(d.mark.s, d.mark.e) < ARROW_MIN) marks.splice(marks.indexOf(d.mark), 1);
  } else if (d.type === 'erase') {
    if (!d.started && !d.erased && d.hit) goMove(d.hit);   // 人物腳下沒有線可擦＝回到移動
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
  // 換到螢光筆／箭頭時打開選單；已經是這個工具時再按一次＝開關選單
  state.pop = !hasPop ? null : state.tool === t ? (state.pop === t ? null : t) : t;
  state.tool = t; sel = null; render();
}));
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { state.mode = b.dataset.mode; sel = null; render(); }));
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
  const src = `<svg xmlns="http://www.w3.org/2000/svg" width="${SHOT_W}" height="${H}" viewBox="${x} ${y} ${w} ${h}">${boardSvg(true)}</svg>`;
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = SHOT_W; cv.height = SHOT_HEAD + H;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surround').trim();
      ctx.fillRect(0, 0, SHOT_W, SHOT_HEAD + H);   // 整張底色＝場外深綠，名字放在上面這條
      ctx.drawImage(img, 0, SHOT_HEAD, SHOT_W, H);   // 先貼球場，名字最後寫才不會被蓋住
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 48px -apple-system, "PingFang TC", "Noto Sans TC", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      // 名字放在「圖片頂端」到「球場底線（上方白線）」中間；用字的實際上下緣置中
      const lineTop = SHOT_HEAD + (0 - y) * SHOT_W / w, m = ctx.measureText(APP_NAME);
      ctx.fillText(APP_NAME, SHOT_W / 2, lineTop / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
      cv.toBlob(b => b ? ok(b) : fail(new Error('toBlob')), 'image/png');
    };
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

window.addEventListener('resize', () => { placeOverlays(); placePops(); });

render();
