/* KINETIC PIXEL：スクロールで現れる表示と、ヒーローの「エコー・グリッド」 */
(function () {
  "use strict";

  document.documentElement.classList.add("js");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // ---------- スクロールで現れる（1 回だけ） ----------
  function setupReveal() {
    var items = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    items.forEach(function (el) { io.observe(el); });
  }

  // ---------- ヒーローのエコー・グリッド ----------
  // 20px おきのドットの上を、白い四角（いまの自分）が 1 マスずつ動き、
  // 紫・ピンク・黄緑のエコーが同じ道を少し遅れてなぞる（ECHO LAB のしくみ）。
  // パソコンではマウスについてくる。マウスがないとき・止まったときは、代表作のまわりを回る。
  function setupEchoGrid() {
    var hero = document.querySelector(".hero");
    var canvas = hero && hero.querySelector(".hero-grid");
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var feature = hero.querySelector(".hero-feature");

    var GAP = 20;          // ドットの間隔（px）
    var RADIUS = 150;      // ドットが明るくなる範囲（px）
    var STEP_MS = 1000 / 60; // 動きは 1/60 秒きざみで進める（画面の速さが 120Hz でも同じ速さ）
    var DELAY = 12;        // エコー 1 人ぶんの遅れ（きざみの数）＝ 回るときの 2 マスぶん
    var STEP_FRAMES = 6;   // 自動で回るとき、1 マス進むのにかけるきざみの数（約 200px/秒）
    var IDLE_MS = 2500;    // マウスが止まってから自動に戻るまで（ミリ秒）
    var BASE = [48, 54, 80];
    var SOURCES = [
      { color: [243, 243, 250], weight: 1, size: 12 },   // いまの自分
      { color: [156, 124, 255], weight: .8, size: 10 },  // エコー 1
      { color: [255, 94, 174], weight: .6, size: 10 },   // エコー 2
      { color: [199, 243, 107], weight: .45, size: 10 }  // エコー 3
    ];
    var HISTORY = DELAY * (SOURCES.length - 1) + 1;

    var w = 0, h = 0, ox = 0, oy = 0, cols = 0, rows = 0;
    var orbit = [], orbitIndex = 0, stepCount = 0;
    var head = null, history = [];
    var pointer = null, pointerTime = 0;
    var mode = "orbit";    // orbit：自動で回る / follow：マウスについてくる / return：回る道へ戻る
    var visible = true, raf = 0, resizeQueued = false, last = 0, acc = 0;

    function rgb(c) { return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; }
    function mix(a, b, t) {
      return [a[0] + (b[0] - a[0]) * t | 0, a[1] + (b[1] - a[1]) * t | 0, a[2] + (b[2] - a[2]) * t | 0];
    }
    function clampCell(c) {
      return { i: Math.max(0, Math.min(cols - 1, c.i)), j: Math.max(0, Math.min(rows - 1, c.j)) };
    }

    // 代表作のカードを 1 マスあけて囲む道（時計回り）
    // カードの横に 1 マスのすきまがない幅（スマホ）では、左右の辺をカードの後ろに通し、上と下だけを見せる
    function buildOrbit() {
      var hr = hero.getBoundingClientRect();
      var fr = feature ? feature.getBoundingClientRect() : null;
      var x0, y0, x1, y1;
      if (fr && fr.width) {
        var narrow = fr.left - hr.left < GAP * 2;
        var side = narrow ? -GAP : GAP / 2;
        x0 = fr.left - hr.left - side; y0 = fr.top - hr.top - GAP / 2;
        x1 = fr.right - hr.left + side; y1 = fr.bottom - hr.top + GAP / 2;
      } else {
        x0 = w * .6; y0 = h * .2; x1 = w * .9; y1 = h * .8;
      }
      var a = clampCell({ i: Math.floor((x0 - ox) / GAP), j: Math.floor((y0 - oy) / GAP) });
      var b = clampCell({ i: Math.ceil((x1 - ox) / GAP), j: Math.ceil((y1 - oy) / GAP) });
      var i, j;
      orbit = [];
      for (i = a.i; i < b.i; i++) orbit.push({ i: i, j: a.j });
      for (j = a.j; j < b.j; j++) orbit.push({ i: b.i, j: j });
      for (i = b.i; i > a.i; i--) orbit.push({ i: i, j: b.j });
      for (j = b.j; j > a.j; j--) orbit.push({ i: a.i, j: j });
      if (!orbit.length) orbit.push(a);
    }

    function nearestOrbitIndex(c) {
      var best = 0, bestD = Infinity;
      for (var n = 0; n < orbit.length; n++) {
        var d = Math.abs(orbit[n].i - c.i) + Math.abs(orbit[n].j - c.j);
        if (d < bestD) { bestD = d; best = n; }
      }
      return best;
    }

    function update(now) {
      if (mode === "follow") {
        if (!pointer || now - pointerTime > IDLE_MS) {
          mode = "return";
          orbitIndex = nearestOrbitIndex(head);
        } else {
          head = clampCell({ i: Math.round((pointer.x - ox) / GAP), j: Math.round((pointer.y - oy) / GAP) });
        }
      }
      if (mode === "return") {
        var t = orbit[orbitIndex];
        if (++stepCount >= 2) {  // 横か縦のどちらか一方だけ、1 マスずつ
          stepCount = 0;
          if (head.i !== t.i) head = { i: head.i + Math.sign(t.i - head.i), j: head.j };
          else head = { i: head.i, j: head.j + Math.sign(t.j - head.j) };
        }
        if (head.i === t.i && head.j === t.j) mode = "orbit";
      }
      if (mode === "orbit") {
        if (++stepCount >= STEP_FRAMES) {
          stepCount = 0;
          orbitIndex = (orbitIndex + 1) % orbit.length;
        }
        head = orbit[orbitIndex];
      }
      history.push(head);
      if (history.length > HISTORY) history.shift();
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      var pts = [];
      for (var k = 0; k < SOURCES.length; k++) {
        var p = history[Math.max(0, history.length - 1 - k * DELAY)];
        if (p) pts.push({ x: ox + p.i * GAP, y: oy + p.j * GAP, s: SOURCES[k] });
      }
      // ドット：いちばん近い四角の色に、近いほど明るく大きく
      ctx.fillStyle = rgb(BASE);
      for (var j = 0; j < rows; j++) {
        var y = oy + j * GAP;
        for (var i = 0; i < cols; i++) {
          var x = ox + i * GAP, best = 0, color = null;
          for (var n = 0; n < pts.length; n++) {
            var dx = x - pts[n].x, dy = y - pts[n].y;
            if (dx > RADIUS || dx < -RADIUS || dy > RADIUS || dy < -RADIUS) continue;
            var a = (1 - Math.sqrt(dx * dx + dy * dy) / RADIUS) * pts[n].s.weight;
            if (a > best) { best = a; color = pts[n].s.color; }
          }
          if (best > 0) {
            var size = 2 + 2 * best;
            ctx.fillStyle = rgb(mix(BASE, color, best));
            ctx.fillRect(x - size / 2, y - size / 2, size, size);
            ctx.fillStyle = rgb(BASE);
          } else {
            ctx.fillRect(x - 1, y - 1, 2, 2);
          }
        }
      }
      // 四角：古いエコーから順に、最後にいまの自分
      for (var m = pts.length - 1; m >= 0; m--) {
        var q = pts[m], s = q.s.size;
        ctx.shadowColor = "rgba(" + q.s.color.join(",") + ",.75)";
        ctx.shadowBlur = 14;
        ctx.fillStyle = rgb(q.s.color);
        ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
      }
      ctx.shadowBlur = 0;
    }

    function resize() {
      resizeQueued = false;
      var rect = hero.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width; h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.floor(w / GAP) + 1;
      rows = Math.floor(h / GAP) + 1;
      ox = (w - (cols - 1) * GAP) / 2;
      oy = (h - (rows - 1) * GAP) / 2;
      buildOrbit();
      // 最初から 3 人のエコーが並んだ形にしておく（動きを減らす設定では、この形で止める）
      mode = "orbit"; pointer = null; stepCount = 0;
      orbitIndex = orbitIndex % orbit.length;
      head = orbit[orbitIndex];
      history = [];
      for (var n = 0; n < HISTORY * STEP_FRAMES; n++) update(0);
      draw();
      start();
    }

    function frame(now) {
      raf = 0;
      if (!visible || document.hidden || reduceMotion.matches) return;
      acc += last ? Math.min(now - last, 250) : STEP_MS;
      last = now;
      var stepped = false;
      while (acc >= STEP_MS) {
        update(now);
        acc -= STEP_MS;
        stepped = true;
      }
      if (stepped) draw();
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (!raf && visible && !document.hidden && !reduceMotion.matches) {
        last = 0;  // 止まっていた間のぶんを、まとめて進めない
        acc = 0;
        raf = requestAnimationFrame(frame);
      }
    }
    function queueResize() {
      if (!resizeQueued) { resizeQueued = true; requestAnimationFrame(resize); }
    }

    hero.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse" || reduceMotion.matches) return;
      var r = hero.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
      pointerTime = performance.now();
      mode = "follow";
    });
    hero.addEventListener("pointerleave", function () { pointer = null; });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        start();
      }).observe(hero);
    }
    document.addEventListener("visibilitychange", start);
    if (reduceMotion.addEventListener) reduceMotion.addEventListener("change", queueResize);
    if ("ResizeObserver" in window) new ResizeObserver(queueResize).observe(hero);
    else window.addEventListener("resize", queueResize);

    canvas.style.backgroundImage = "none";  // CSS の代わりの模様は消して、canvas で描く
    resize();
  }

  // ---------- 相談のメール ----------
  // アドレスは html に書かず、ここで組み立てて出す（自動でアドレスを集めるプログラムに、拾われにくくするため）。
  // 完全には防げない（スクリプトを動かすプログラムには読まれる）。スクリプトが動かないときは、html の案内の文が残る。
  function setupContact() {
    var box = document.querySelector("[data-contact]");
    if (!box) return;
    var link = box.querySelector("[data-contact-link]");
    var addrEl = box.querySelector("[data-contact-addr]");
    var copyBtn = box.querySelector("[data-contact-copy]");
    var statusEl = box.querySelector("[data-contact-status]");
    var fallback = document.querySelector("[data-contact-fallback]");
    if (!link || !addrEl || !copyBtn || !statusEl) return;

    var local = ["kinetic", "pixel", "studio"].join(".");
    var host = ["gmail", "com"].join(".");
    var addr = local + "@" + host;
    var subject = "制作のご相談（KINETIC PIXEL）";
    var body = [
      "【ご相談の内容】",
      "（Webサイト／動画／ゲーム・アプリなど、作りたいものを書いてください）",
      "",
      "【希望の時期】",
      "",
      "【参考にしたい作品・サイト】",
      ""
    ].join("\r\n");
    link.href = "mailto:" + addr + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    // 狭い画面では「@」の前で折り返す（<wbr> は文字を増やさないので、コピーしても同じアドレスになる）
    addrEl.textContent = "";
    addrEl.appendChild(document.createTextNode(local));
    addrEl.appendChild(document.createElement("wbr"));
    addrEl.appendChild(document.createTextNode("@" + host));

    var timer = 0;
    function say(message) {
      statusEl.textContent = message;
      clearTimeout(timer);
      timer = setTimeout(function () { statusEl.textContent = ""; }, 5000);
    }
    function copyBySelection() {  // clipboard API が使えないとき（ファイルを直接開いたときなど）
      var range = document.createRange();
      range.selectNodeContents(addrEl);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      say(ok ? "コピーしました" : "アドレスを選びました。コピーしてお使いください（Ctrl+C／スマホは長押し）");
    }
    copyBtn.addEventListener("click", function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(addr).then(function () { say("コピーしました"); }, copyBySelection);
      } else {
        copyBySelection();
      }
    });

    box.hidden = false;
    if (fallback) fallback.hidden = true;
  }

  setupReveal();
  setupEchoGrid();
  setupContact();
})();
