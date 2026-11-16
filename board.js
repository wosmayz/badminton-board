/* 羽球戰術板：畫球場、人物、羽球（全部用「公尺」當單位，螢幕大小由 SVG 自動縮放） */
const Board = (() => {
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const C = () => ({
    court: css('--court'), surround: css('--surround'), net: css('--net'), line: css('--court-line'),
    A: { main: css('--team-a'), dark: css('--team-a-dark') },
    B: { main: css('--team-b'), dark: css('--team-b-dark') },
  });

  /* 場地尺寸（公尺） */
  const W = 6.1, L = 13.4, NET = 6.7, SHORT = 1.98, SIDE = 0.46, LONG_D = 0.76, LW = 0.04;
  const PLAYER_R = 0.44;    // 人物大小（11/17 她手機試覺得手指一按就看不到 → 由 0.385 放大約 15%；羽球跟著放大）
  const SKIN = '#F2C9A6', HAIR = '#3A2E29';

  const line = (x1, y1, x2, y2, color, w = LW, extra = '') =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" ${extra}/>`;

  function court(mode, noNet) {
    const c = C(), dl = '';   // 單打、雙打場地畫法一樣（她 11/17 決定單打不暗掉兩側）
    let g = `<rect x="-0.6" y="-0.6" width="${W + 1.2}" height="${L + 1.2}" rx="0.18" fill="${c.surround}"/>`;
    g += `<rect x="0" y="0" width="${W}" height="${L}" fill="${c.court}"/>`;
    // 雙打專用：外側邊線、雙打發球後界線
    g += line(0, 0, 0, L, c.line, LW, dl) + line(W, 0, W, L, c.line, LW, dl);
    g += line(0, LONG_D, W, LONG_D, c.line, LW, dl) + line(0, L - LONG_D, W, L - LONG_D, c.line, LW, dl);
    // 共用：底線、單打邊線、前發球線、中線
    g += line(0, 0, W, 0, c.line) + line(0, L, W, L, c.line);
    g += line(SIDE, 0, SIDE, L, c.line) + line(W - SIDE, 0, W - SIDE, L, c.line);
    g += line(0, NET - SHORT, W, NET - SHORT, c.line) + line(0, NET + SHORT, W, NET + SHORT, c.line);
    g += line(W / 2, 0, W / 2, NET - SHORT, c.line) + line(W / 2, NET + SHORT, W / 2, L, c.line);
    // 球網＋網柱（斜角畫面有立體球網，地板上就不畫）
    if (noNet) return g;
    g += line(-0.3, NET, W + 0.3, NET, c.net, 0.07);
    g += `<circle cx="-0.3" cy="${NET}" r="0.07" fill="${c.net}"/><circle cx="${W + 0.3}" cy="${NET}" r="0.07" fill="${c.net}"/>`;
    return g;
  }

  /* ---------- 球拍（局部座標：握把在原點、朝上） ---------- */
  function racket(r) {
    const col = '#2b2b2b', Lr = r * 2.05, cy = -Lr * .72, rx = Lr * .17, ry = Lr * .23;
    let s = `<line x1="0" y1="${Lr * .04}" x2="0" y2="${-Lr * .27}" stroke="${col}" stroke-width="${r * .2}" stroke-linecap="round"/>`;
    s += `<line x1="0" y1="${-Lr * .27}" x2="0" y2="${cy + ry}" stroke="${col}" stroke-width="${r * .08}"/>`;
    s += `<ellipse cx="0" cy="${cy}" rx="${rx}" ry="${ry}" fill="rgba(255,255,255,.4)"/>`;
    [-.5, 0, .5].forEach(k => {
      const x = rx * k, hl = ry * Math.sqrt(1 - k * k);
      s += `<line x1="${x}" y1="${cy - hl}" x2="${x}" y2="${cy + hl}" stroke="${col}" stroke-opacity=".35" stroke-width="${r * .035}"/>`;
      const y = cy + ry * k, hw = rx * Math.sqrt(1 - k * k);
      s += `<line x1="${-hw}" y1="${y}" x2="${hw}" y2="${y}" stroke="${col}" stroke-opacity=".35" stroke-width="${r * .035}"/>`;
    });
    s += `<ellipse cx="0" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${col}" stroke-width="${r * .11}"/>`;
    return s;
  }

  /* ---------- Q 版人物（俯瞰，面向上方） ---------- */
  function qPlayer(r, c, sd) {
    const hx = sd * r * 1.0, hy = -r * .82;
    let s = `<g transform="translate(${hx},${hy}) rotate(${sd * 20})">${racket(r)}</g>`;
    s += `<path d="M${sd * r * .7},${-r * .1} Q${sd * r * 1.15},${-r * .25} ${hx},${hy}" fill="none" stroke="${c.main}" stroke-width="${r * .3}" stroke-linecap="round"/>`;
    s += `<path d="M${-sd * r * .7},${-r * .1} Q${-sd * r * 1.0},${-r * .45} ${-sd * r * .6},${-r * .7}" fill="none" stroke="${c.main}" stroke-width="${r * .3}" stroke-linecap="round"/>`;
    s += `<ellipse rx="${r * .95}" ry="${r * .5}" fill="${c.main}"/>`;
    s += `<circle cx="${hx}" cy="${hy}" r="${r * .18}" fill="${SKIN}"/><circle cx="${-sd * r * .6}" cy="${-r * .72}" r="${r * .18}" fill="${SKIN}"/>`;
    s += `<circle cx="${-r * .6}" cy="${-r * .06}" r="${r * .13}" fill="${SKIN}"/><circle cx="${r * .6}" cy="${-r * .06}" r="${r * .13}" fill="${SKIN}"/>`;
    s += `<circle cx="0" cy="${-r * .16}" r="${r * .6}" fill="${SKIN}"/><circle cx="0" cy="${-r * .02}" r="${r * .6}" fill="${HAIR}"/>`;
    s += `<path d="M0,${r * .2} q${r * .2},${-r * .12} ${r * .02},${-r * .26} q${-r * .14},${-r * .06} ${-r * .12},${r * .1}" fill="none" stroke="#6b5a50" stroke-width="${r * .06}" stroke-linecap="round"/>`;
    return s;
  }

  /* p = { id, team:'A'|'B', x, y, angle, hand:'R'|'L' } */
  function player(p, sel) {
    const c = C()[p.team], r = PLAYER_R, sd = p.hand === 'R' ? 1 : -1;
    let g = `<g class="player" data-id="${p.id}">`;
    if (sel) g += selRing(p.x, p.y, r * 2.4);
    g += `<circle cx="${p.x}" cy="${p.y}" r="${r * 1.6}" fill="transparent"/>`;   // 手指可按範圍（比人大）
    g += `<g transform="translate(${p.x},${p.y}) rotate(${p.angle})">${qPlayer(r, c, sd)}</g>`;
    const a = p.angle * Math.PI / 180, bx = p.x - Math.sin(a) * r, by = p.y + Math.cos(a) * r, br = r * .42;
    g += `<circle cx="${bx}" cy="${by}" r="${br}" fill="${c.dark}" stroke="#fff" stroke-width="${r * .08}"/>`;
    g += `<text x="${bx}" y="${by}" font-size="${br * .95}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-weight="800" font-family="-apple-system,'PingFang TC',sans-serif">${p.id}</text>`;
    return g + '</g>';
  }

  /* ---------- 羽球（斜側面）；heading＝球頭方向（0＝朝上，順時針） ---------- */
  function shuttle(s, sel) {
    const u = PLAYER_R * 1.3, fw = u * .36, top = -u * .5, nb = u * .13;
    let g = `<g class="shuttle">${sel ? selRing(s.x, s.y, u * .85) : ''}<circle cx="${s.x}" cy="${s.y}" r="${u * .9}" fill="transparent"/>`;
    // 陰影：不用 SVG filter（Safari 會讓整顆羽球消失），改畫半透明橢圓
    g += `<g transform="translate(${s.x},${s.y}) rotate(${s.heading + 180})">`;
    g += `<ellipse cx="0" cy="${u * .02}" rx="${fw * .9}" ry="${u * .3}" fill="rgba(0,0,0,.18)" transform="translate(0,${u * .05})"/>`;
    g += `<path d="M${-nb},${u * .2} L${-fw},${top} Q${-fw * .66},${top - u * .07} ${-fw * .5},${top} Q${-fw * .33},${top - u * .07} ${-fw * .17},${top} Q0,${top - u * .07} ${fw * .17},${top} Q${fw * .33},${top - u * .07} ${fw * .5},${top} Q${fw * .66},${top - u * .07} ${fw},${top} L${nb},${u * .2}Z" fill="#fff" stroke="#555" stroke-width="${u * .03}" stroke-linejoin="round"/>`;
    [-1, -.6, -.2, .2, .6, 1].forEach(k => g += `<line x1="${k * nb * .8}" y1="${u * .2}" x2="${k * fw * .84}" y2="${top + u * .02}" stroke="#999" stroke-width="${u * .018}"/>`);
    [-.08, -.28].forEach(y => { const yy = u * y, half = nb + (fw - nb) * ((u * .2 - yy) / (u * .2 - top)); g += `<line x1="${-half}" y1="${yy}" x2="${half}" y2="${yy}" stroke="#777" stroke-width="${u * .03}"/>`; });
    g += `<rect x="${-nb * 1.08}" y="${u * .17}" width="${nb * 2.16}" height="${u * .07}" rx="${u * .02}" fill="#3a3a3a"/>`;
    g += `<path d="M${-nb * 1.05},${u * .24} L${-nb * 1.05},${u * .3} A${nb * 1.05},${nb * 1.05} 0 0 0 ${nb * 1.05},${u * .3} L${nb * 1.05},${u * .24}Z" fill="#E9DCC6" stroke="#8a7a62" stroke-width="${u * .025}"/>`;
    return g + '</g></g>';
  }

  /* 選取光圈（設計系統：白圈＋淡白底） */
  function selRing(x, y, R) {
    return `<circle cx="${x}" cy="${y}" r="${R}" fill="rgba(255,255,255,.16)" stroke="${css('--sel-ring')}" stroke-width="0.05"/>`;
  }

  /* 旋轉中：中心到手指的虛線＋手指位置的圓 */
  function rotateGuide(x, y, angle, len) {
    const a = angle * Math.PI / 180, fx = x + Math.sin(a) * len, fy = y - Math.cos(a) * len;
    return `<g pointer-events="none"><line x1="${x}" y1="${y}" x2="${fx}" y2="${fy}" stroke="#fff" stroke-width="0.05" stroke-dasharray="0.12 0.14"/>`
      + `<circle cx="${fx}" cy="${fy}" r="0.3" fill="rgba(255,255,255,.35)" stroke="#fff" stroke-width="0.05"/></g>`;
  }

  /* ---------- 標示 ----------
     螢光筆 { type:'hl', color:'hl-1', pts:[[x,y]...], closed }
     箭頭   { type:'arrow', kind:'shot'|'run', s:[x,y], c:[x,y], e:[x,y] }（二次曲線：起點、彎度控制點、終點） */
  const HL_W = 0.4, ARROW_W = 0.07, HEAD_L = 0.3, HEAD_W = 0.26;

  function highlight(m, i) {
    const col = css('--' + m.color), d = m.pts.map((p, k) => (k ? 'L' : 'M') + p[0].toFixed(3) + ',' + p[1].toFixed(3)).join(' ') + (m.closed ? 'Z' : '');
    // 整筆一起半透明：同一筆自己交疊的地方不會變深
    return `<g class="mark" data-i="${i}" opacity=".65"><path d="${d}" fill="${m.closed ? col : 'none'}" stroke="${col}" stroke-width="${HL_W}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }

  function arrow(m, i) {
    const col = css(m.kind === 'shot' ? '--arrow-shot' : '--arrow'), [sx, sy] = m.s, [cx, cy] = m.c, [ex, ey] = m.e;
    // 箭頭尖端方向＝曲線在終點的切線
    let tx = ex - cx, ty = ey - cy, tl = Math.hypot(tx, ty);
    if (tl < 1e-6) { tx = ex - sx; ty = ey - sy; tl = Math.hypot(tx, ty) || 1; }
    tx /= tl; ty /= tl;
    const bx = ex - tx * HEAD_L, by = ey - ty * HEAD_L, nx = -ty * HEAD_W / 2, ny = tx * HEAD_W / 2;
    const d = `M${sx},${sy} Q${cx},${cy} ${bx + tx * .02},${by + ty * .02}`;
    let g = `<g class="mark" data-i="${i}">`;
    g += `<path d="${d}" fill="none" stroke="transparent" stroke-width="0.5"/>`;   // 橡皮擦好點的範圍
    g += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${ARROW_W}" stroke-linecap="round" ${m.kind === 'run' ? 'stroke-dasharray="0.2 0.16"' : ''}/>`;
    g += `<path d="M${ex},${ey} L${bx + nx},${by + ny} L${bx - nx},${by - ny}Z" fill="${col}" stroke="${col}" stroke-width="0.03" stroke-linejoin="round"/>`;
    return g + '</g>';
  }

  /* 從羽球拉箭頭時，羽球亮一圈黃光 */
  function glow(x, y) {
    return `<circle cx="${x}" cy="${y}" r="${PLAYER_R * 1.1}" fill="none" stroke="${css('--hl-1')}" stroke-width="0.08" pointer-events="none"/>`;
  }

  const defs = '';

  return { court, player, shuttle, rotateGuide, highlight, arrow, glow, defs, W, L, PLAYER_R };
})();

/* ---------- 圖示（24×24 線條） ---------- */
const ICONS = {
  move: '<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
  pen: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
  arrow: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
  erase: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
};
