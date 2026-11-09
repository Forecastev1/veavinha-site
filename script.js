/* Vêavinha — tudo o que aqui se desenha vem de dados/vinha-da-encosta.js e dados/diario.js */
(function () {
  "use strict";

  var V = window.VEAVINHA_VINHA;
  var D = window.VEAVINHA_DIARIO;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function parseD(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +(p[2] || 1)); }
  function fmtD(s) { var p = s.split("-"); return (+p[2]) + " " + MESES[+p[1] - 1] + " " + p[0]; }
  function fmtM(s) { var p = s.split("-"); return MESES[+p[1] - 1] + " " + p[0]; }

  var y = document.getElementById("ano");
  if (y) y.textContent = new Date().getFullYear();

  /* ---------- rampa NDVI ---------- */
  var STOPS = [
    [0.10, [0x78, 0x48, 0x28]],
    [0.30, [0xD6, 0xAA, 0x50]],
    [0.45, [0xAA, 0xC8, 0x50]],
    [0.60, [0x3C, 0xA0, 0x46]],
    [0.75, [0x14, 0x64, 0x32]]
  ];
  function ramp(v) {
    if (v <= STOPS[0][0]) return rgb(STOPS[0][1]);
    for (var i = 1; i < STOPS.length; i++) {
      if (v <= STOPS[i][0]) {
        var a = STOPS[i - 1], b = STOPS[i], t = (v - a[0]) / (b[0] - a[0]);
        return rgb([0, 1, 2].map(function (k) { return a[1][k] + (b[1][k] - a[1][k]) * t; }));
      }
    }
    return rgb(STOPS[STOPS.length - 1][1]);
  }
  function rgb(c) { return "rgb(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + ")"; }

  var rb = document.getElementById("ramp-bar");
  if (rb) for (var i = 0; i < 14; i++) {
    var sw = el("i"); sw.style.background = ramp(0.10 + i * 0.05); rb.appendChild(sw);
  }

  if (!V) return; // sem dados: fica o HTML estático

  /* ---------- coordenadas reais ---------- */
  var b = V.grelha.bounds;
  var lat = (b.north + b.south) / 2, lon = (b.east + b.west) / 2;
  var coordTxt = lat.toFixed(4) + "° " + (lat >= 0 ? "N" : "S") + " · " + Math.abs(lon).toFixed(4) + "° " + (lon >= 0 ? "E" : "W");
  $$(".js-coords").forEach(function (n) { n.textContent = coordTxt; });

  /* ---------- desenho de grelha em píxeis nítidos ---------- */
  var GW = V.grelha.width, GH = V.grelha.height;
  var RING = V.contorno_px;

  function drawRaster(canvas, colorAt) {
    var r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    var ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);

    var cell = Math.floor(Math.min(W / GW, H / GH));
    var ox = Math.floor((W - cell * GW) / 2), oy = Math.floor((H - cell * GH) / 2);
    var gap = cell >= 10 ? Math.max(1, Math.round(dpr)) : 0;

    for (var row = 0; row < GH; row++) {
      for (var col = 0; col < GW; col++) {
        var c = colorAt(row, col);
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(ox + col * cell, oy + row * cell, cell - gap, cell - gap);
      }
    }
    // contorno da parcela, branco tracejado
    ctx.strokeStyle = cssVar("--chalk");
    ctx.lineWidth = Math.max(1, 1.5 * dpr);
    ctx.setLineDash([5 * dpr, 4 * dpr]);
    ctx.lineJoin = "round";
    RING.forEach(function (ring) {
      ctx.beginPath();
      ring.forEach(function (p, k) {
        var x = ox + p[0] * cell, yy = oy + p[1] * cell;
        if (k) ctx.lineTo(x, yy); else ctx.moveTo(x, yy);
      });
      ctx.closePath();
      ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  /* ---------- 01 hero: a vinha a respirar ---------- */
  var months = V.ndvi_mensal;
  var means = months.map(function (m) {
    var s = 0, n = 0;
    m.ndvi.forEach(function (row) { row.forEach(function (v) { if (v != null) { s += v; n++; } }); });
    return n ? s / n : null;
  });

  var hc = document.getElementById("hero-canvas");
  var hMonth = document.getElementById("hero-month");
  var hNdvi = document.getElementById("hero-ndvi");
  var hDate = document.getElementById("hero-date");
  var strip = document.getElementById("hero-months");
  var toggle = document.getElementById("hero-toggle");
  var cur = months.length - 1, playing = !reduce, visible = true, timer = null;

  if (strip) months.forEach(function (m, k) {
    var s = el("span"); s.style.background = ramp(means[k]); strip.appendChild(s);
  });

  function drawHero() {
    if (!hc) return;
    var grid = months[cur].ndvi;
    drawRaster(hc, function (r, c) {
      var v = grid[r] && grid[r][c];
      return v == null ? cssVar("--cell-empty") : ramp(v);
    });
    hMonth.textContent = fmtM(months[cur].month);
    hNdvi.textContent = means[cur].toFixed(2);
    hDate.textContent = fmtD(months[cur].date);
    if (strip) $$("span", strip).forEach(function (s, k) { s.classList.toggle("is-on", k === cur); });
  }

  function tick() { cur = (cur + 1) % months.length; drawHero(); }
  function sync() {
    var run = playing && visible && !document.hidden;
    if (run && !timer) timer = setInterval(tick, 500);
    if (!run && timer) { clearInterval(timer); timer = null; }
  }

  if (reduce) {
    if (toggle) toggle.hidden = true;
  } else {
    cur = 0;
    if (toggle) toggle.addEventListener("click", function () {
      playing = !playing;
      toggle.textContent = playing ? "Pausa" : "Continuar";
      toggle.setAttribute("aria-pressed", String(!playing));
      sync();
    });
    if ("IntersectionObserver" in window && hc) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; sync(); }).observe(hc);
    }
    document.addEventListener("visibilitychange", sync);
  }
  drawHero();
  sync();

  /* ---------- 02 zonas que acendem ---------- */
  var Z = V.zonas;
  var zc = document.getElementById("zones-canvas");
  var zLegend = document.getElementById("zones-legend");
  var lit = reduce ? 4 : 0, litTimers = [];
  var counts = { 1: 0, 2: 0, 3: 0, 4: 0 }, total = 0;
  Z.grelha.forEach(function (row) { row.forEach(function (v) { if (v != null) { counts[v]++; total++; } }); });

  if (zLegend) [1, 2, 3, 4].forEach(function (z) {
    var li = el("li"); li.dataset.z = z;
    var sw = el("i"); sw.style.background = Z.cores[z];
    li.appendChild(sw);
    li.appendChild(el("span", null, Z.legenda[z]));
    li.appendChild(el("b", null, counts[z] + " PX · " + (counts[z] / 100).toFixed(2) + " ha"));
    zLegend.appendChild(li);
  });

  function drawZones() {
    if (!zc) return;
    drawRaster(zc, function (r, c) {
      var v = Z.grelha[r] && Z.grelha[r][c];
      if (v == null) return cssVar("--cell-empty");
      return v <= lit ? Z.cores[v] : cssVar("--cell-off");
    });
    if (zLegend) $$("li", zLegend).forEach(function (li) { li.classList.toggle("is-on", +li.dataset.z <= lit); });
  }
  function lightZones() {
    litTimers.forEach(clearTimeout); litTimers = [];
    if (reduce) { lit = 4; drawZones(); return; }
    lit = 0; drawZones();
    [1, 2, 3, 4].forEach(function (z, k) {
      litTimers.push(setTimeout(function () { lit = z; drawZones(); }, 250 + k * 550));
    });
  }

  /* ---------- 02 scrollytelling ---------- */
  var steps = $$(".step"), layers = $$(".layer"), active = 1;
  function setStep(n) {
    if (n === active) return;
    active = n;
    steps.forEach(function (s) { s.classList.toggle("is-active", +s.dataset.step === n); });
    layers.forEach(function (l) {
      var on = +l.dataset.layer === n;
      l.classList.toggle("is-active", on);
      l.setAttribute("aria-hidden", on ? "false" : "true");
    });
    if (n === 3) lightZones();
  }
  layers.forEach(function (l) { l.setAttribute("aria-hidden", l.classList.contains("is-active") ? "false" : "true"); });
  if ("IntersectionObserver" in window && steps.length) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) setStep(+e.target.dataset.step); });
    }, { rootMargin: "-55% 0px -40% 0px" });
    steps.forEach(function (s) { io.observe(s); });
  }
  drawZones();

  /* ---------- 03 separadores ---------- */
  var tabs = $$('[role="tab"]');
  function selectTab(t, focus) {
    tabs.forEach(function (x) {
      var on = x === t;
      x.setAttribute("aria-selected", on ? "true" : "false");
      x.tabIndex = on ? 0 : -1;
      var p = document.getElementById(x.getAttribute("aria-controls"));
      p.hidden = !on;
      if (on && !reduce) { p.classList.remove("is-entering"); void p.offsetWidth; p.classList.add("is-entering"); }
    });
    if (focus) t.focus();
  }
  tabs.forEach(function (t, k) {
    t.addEventListener("click", function () { selectTab(t); });
    t.addEventListener("keydown", function (e) {
      var n = null;
      if (e.key === "ArrowRight") n = (k + 1) % tabs.length;
      else if (e.key === "ArrowLeft") n = (k - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") n = 0;
      else if (e.key === "End") n = tabs.length - 1;
      if (n != null) { e.preventDefault(); selectTab(tabs[n], true); }
    });
  });

  /* ---------- 04 a curva ---------- */
  var S = V.serie_ndvi;
  var svg = document.getElementById("chart");
  var read = document.getElementById("chart-read");
  var NS = "http://www.w3.org/2000/svg";
  var sel = S.length - 1, X = [], Y = [], hair, ring;
  var nEl = document.getElementById("chart-n"); if (nEl) nEl.textContent = S.length;

  function sv(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function drawChart() {
    if (!svg) return;
    var r = svg.getBoundingClientRect();
    var W = Math.round(r.width), H = Math.round(r.height);
    if (!W || !H) return;
    while (svg.lastChild && svg.lastChild.nodeName !== "desc") svg.removeChild(svg.lastChild);
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);

    var m = { l: 34, r: 10, t: 10, b: 30 };
    var t0 = parseD(S[0].data).getTime(), t1 = parseD(S[S.length - 1].data).getTime();
    var y0 = 0.1, y1 = 0.8;
    function fx(t) { return m.l + (t - t0) / (t1 - t0) * (W - m.l - m.r); }
    function fy(v) { return m.t + (1 - (v - y0) / (y1 - y0)) * (H - m.t - m.b); }

    var g = sv("g", { "class": "grid", "aria-hidden": "true" }, svg);
    [0.2, 0.4, 0.6, 0.8].forEach(function (v) {
      sv("line", { x1: m.l, x2: W - m.r, y1: fy(v), y2: fy(v) }, g);
      sv("text", { x: 0, y: fy(v) + 3 }, g).textContent = v.toFixed(1);
    });
    var narrow = W < 640;
    var d = parseD(S[0].data); d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    for (; d.getTime() <= t1; d.setMonth(d.getMonth() + 1)) {
      var mo = d.getMonth();
      if (mo % (narrow ? 6 : 3) !== 0) continue;
      var x = fx(d.getTime());
      sv("line", { x1: x, x2: x, y1: H - m.b, y2: H - m.b + 5 }, g);
      sv("text", { x: x - 2, y: H - 8 }, g).textContent = mo === 0 ? "JAN " + d.getFullYear() : MESES[mo];
    }

    X = []; Y = [];
    var segs = [[]];
    S.forEach(function (p, k) {
      var t = parseD(p.data).getTime();
      if (k && (t - parseD(S[k - 1].data).getTime()) / 864e5 > 60) segs.push([]);
      X.push(fx(t)); Y.push(fy(p.ndvi));
      segs[segs.length - 1].push(k);
    });
    segs.forEach(function (s) {
      if (s.length < 2) return;
      sv("path", { "class": "line", d: s.map(function (k, j) { return (j ? "L" : "M") + X[k].toFixed(1) + " " + Y[k].toFixed(1); }).join("") }, svg);
    });
    hair = sv("line", { "class": "hair", y1: m.t, y2: H - m.b }, svg);
    var pts = sv("g", { "aria-hidden": "true" }, svg);
    S.forEach(function (p, k) { sv("circle", { cx: X[k], cy: Y[k], r: 3, fill: ramp(p.ndvi) }, pts); });
    ring = sv("circle", { "class": "ring", r: 7 }, svg);
    showPoint(sel);
  }

  function showPoint(k) {
    sel = k;
    var p = S[k];
    if (read) read.textContent = fmtD(p.data) + " · NDVI " + p.ndvi.toFixed(3) + " · NUVENS " + p.nuvens + "%";
    if (hair) { hair.setAttribute("x1", X[k]); hair.setAttribute("x2", X[k]); }
    if (ring) { ring.setAttribute("cx", X[k]); ring.setAttribute("cy", Y[k]); }
  }
  function nearest(px) {
    var lo = 0, hi = X.length - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (X[mid] < px) lo = mid; else hi = mid; }
    return px - X[lo] < X[hi] - px ? lo : hi;
  }
  if (svg) {
    svg.addEventListener("pointermove", function (e) {
      var r = svg.getBoundingClientRect();
      showPoint(nearest(e.clientX - r.left));
    });
    svg.addEventListener("pointerdown", function (e) {
      var r = svg.getBoundingClientRect();
      showPoint(nearest(e.clientX - r.left));
    });
    svg.addEventListener("keydown", function (e) {
      var n = null;
      if (e.key === "ArrowRight") n = Math.min(S.length - 1, sel + 1);
      else if (e.key === "ArrowLeft") n = Math.max(0, sel - 1);
      else if (e.key === "Home") n = 0;
      else if (e.key === "End") n = S.length - 1;
      if (n != null) { e.preventDefault(); showPoint(n); }
    });
  }
  drawChart();

  /* ---------- 06 em estudo ---------- */
  if (D) {
    var nl = document.getElementById("next-list");
    if (nl) D.a_seguir.forEach(function (x) {
      var li = el("li");
      li.appendChild(el("span", "q", "EM ESTUDO"));
      li.appendChild(el("span", "r"));
      li.appendChild(el("p", null, x));
      nl.appendChild(li);
    });
  }

  /* ---------- entradas e redimensionamento ---------- */
  if ("IntersectionObserver" in window && !reduce) {
    var rio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("is-in"); rio.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -10% 0px" });
    $$(".reveal").forEach(function (n) { rio.observe(n); });
  } else {
    $$(".reveal").forEach(function (n) { n.classList.add("is-in"); });
  }

  var rt;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(function () { drawHero(); drawZones(); drawChart(); }, 120);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { drawHero(); drawZones(); drawChart(); });
})();
