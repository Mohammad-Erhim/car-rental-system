/* Shared DOM helpers for every store asset. Plain browser JS, no build step. */
(function () {
  const SHOT_W = 1344,
    SHOT_H = 2992; // native capture size

  function el(tag, cls, parent, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    if (parent) parent.appendChild(n);
    return n;
  }

  function icon(name, { stroke = 2.2 } = {}) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${window.ICONS[name]}</svg>`;
  }

  /** A framed phone showing capture `src`. x/y = top-left of the frame. Returns { node, k, screenX, screenY }. */
  function phone(parent, { src, x, y, w, theme = 'day', transform = '', z = 5 }) {
    const n = el('div', `phone ${theme}`, parent);
    n.style.setProperty('--pw', w + 'px');
    n.style.left = x + 'px';
    n.style.top = y + 'px';
    n.style.zIndex = z;
    if (transform) n.style.transform = transform;
    const scr = el('div', 'screen', n);
    const img = el('img', '', scr);
    img.src = src;
    el('div', 'btn p', n);
    el('div', 'btn v', n);
    const bezel = w * 0.026;
    const k = (w - 2 * bezel) / SHOT_W;
    return { node: n, k, screenX: x + bezel, screenY: y + bezel, h: SHOT_H * k + 2 * bezel };
  }

  /** Crop of a capture (rect in native px) shown at scale `s`, placed with its top-left at x/y. */
  function callout(
    parent,
    { src, rect, s, x, y, theme = 'day', rot = 0, z = 20, fadeRight = false, radius },
  ) {
    const [x0, y0, x1, y1] = rect;
    const n = el('div', `callout ${theme}${fadeRight ? ' fade-r' : ''}`, parent);
    Object.assign(n.style, {
      left: x + 'px',
      top: y + 'px',
      width: (x1 - x0) * s + 'px',
      height: (y1 - y0) * s + 'px',
      backgroundImage: `url(${src})`,
      backgroundSize: `${SHOT_W * s}px ${SHOT_H * s}px`,
      backgroundPosition: `${-x0 * s}px ${-y0 * s}px`,
      transform: rot ? `rotate(${rot}deg)` : '',
      zIndex: z,
    });
    if (radius != null) n.style.borderRadius = radius + 'px';
    return n;
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Stylised city-map texture (streets + a couple of arterials) as SVG markup. */
  function mapSVG(
    W,
    H,
    { seed = 7, color = '#0c7951', minor = 0.07, major = 0.12, angle = -14 } = {},
  ) {
    const rnd = mulberry32(seed);
    const pad = Math.max(W, H);
    let s = '';
    // minor grid: jittered, rotated
    let x = -pad;
    while (x < W + pad) {
      x += 150 + rnd() * 170;
      s += `<line x1="${x}" y1="${-pad}" x2="${x + (rnd() - 0.5) * 120}" y2="${H + pad}" stroke-width="${rnd() < 0.18 ? 9 : 4}"/>`;
    }
    let y = -pad;
    while (y < H + pad) {
      y += 150 + rnd() * 190;
      s += `<line x1="${-pad}" y1="${y}" x2="${W + pad}" y2="${y + (rnd() - 0.5) * 160}" stroke-width="${rnd() < 0.18 ? 9 : 4}"/>`;
    }
    const cx = W / 2,
      cy = H / 2;
    let majors = '';
    for (let i = 0; i < Math.ceil(W / 1400); i++) {
      const sx = i * 1400 + rnd() * 600;
      majors += `<path d="M${sx} ${-200} C ${sx + 500} ${H * 0.3}, ${sx - 300} ${H * 0.7}, ${sx + 400} ${H + 200}" stroke-width="22" fill="none"/>`;
    }
    majors += `<path d="M-200 ${H * 0.42} C ${W * 0.25} ${H * 0.3}, ${W * 0.55} ${H * 0.62}, ${W + 200} ${H * 0.36}" stroke-width="26" fill="none"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;left:0;top:0">
      <g stroke="${color}" stroke-opacity="${minor}" transform="rotate(${angle} ${cx} ${cy})">${s}</g>
      <g stroke="${color}" stroke-opacity="${major}" stroke-linecap="round">${majors}</g></svg>`;
  }

  /** Smooth path through points (Catmull-Rom -> cubic Bézier). */
  function smoothPath(pts, t = 0.5) {
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i],
        p1 = pts[i],
        p2 = pts[i + 1],
        p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * t * 2, p1[1] + ((p2[1] - p0[1]) / 6) * t * 2];
      const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * t * 2, p2[1] - ((p3[1] - p1[1]) / 6) * t * 2];
      d += ` C${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  }

  function lockup(parent, { x, y, size = 104, theme = 'day', text = 'Car Rental', font = 54 }) {
    const n = el(
      'div',
      `lockup ${theme}`,
      parent,
      `<img src="../../assets/icon.png" width="${size}" height="${size}"><span style="font-size:${font}px">${text}</span>`,
    );
    n.style.left = x + 'px';
    n.style.top = y + 'px';
    return n;
  }

  function place(n, x, y, z) {
    n.style.left = x + 'px';
    n.style.top = y + 'px';
    if (z != null) n.style.zIndex = z;
    return n;
  }

  window.Kit = {
    el,
    icon,
    phone,
    callout,
    mapSVG,
    smoothPath,
    lockup,
    place,
    mulberry32,
    SHOT_W,
    SHOT_H,
  };
})();
