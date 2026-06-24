/* ============================================================
   NoStress — главная · motion.js  (кинематографичный scroll-driven)
   КЛАССИЧЕСКИЙ скрипт (НЕ module) — чтобы работал и с file:// при
   открытии двойным кликом. Motion и Lenis грузятся UMD-глобалами
   <script> перед этим файлом (см. index.html).
   Engine: Motion (motion.dev) + Lenis. Пиннинг — CSS position:sticky.
   Всё гаснет при prefers-reduced-motion. Нет Motion → контент виден.
   ============================================================ */
(function () {
  var M = window.Motion;
  if (!M || !M.animate || !M.scroll) {        // CDN не загрузился — оставляем статику видимой
    console.warn("[motion] Motion не загружен — анимации выключены, контент виден.");
    return;
  }
  var animate = M.animate, scroll = M.scroll, stagger = M.stagger, inView = M.inView;
  var EXPO = [0.22, 1, 0.36, 1];

  var REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var FINE   = matchMedia("(pointer: fine)").matches;
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };

  document.documentElement.classList.add("js-motion");

  /* ---- 1. ИНЕРЦИОННЫЙ СКРОЛЛ (Lenis) ---- */
  function initSmoothScroll() {
    if (REDUCE || typeof Lenis === "undefined") return;
    // легче и отзывчивее: меньше «вязкости», обычная скорость колеса
    var lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 1, smoothWheel: true });
    function raf(t) { lenis.raf(t); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
  }

  /* ---- 2. ПРОГРЕСС-БАР ---- */
  function initProgress() {
    var bar = $(".progress");
    if (!bar || REDUCE) return;
    scroll(animate(bar, { scaleX: [0, 1] }, { ease: "linear" }));
  }

  /* ---- 3. HERO: закреплён, уезжает ---- */
  function initHero() {
    if (REDUCE) return;
    var hero = $(".hero"), video = $(".hero-video"), inn = $(".hero-in"), cue = $(".scrollcue");
    if (!hero) return;
    if (video) scroll(animate(video, { scale: [1, 1.24] }, { ease: "linear" }),
                      { target: hero, offset: ["start start", "end start"] });
    // текст hero уходит вверх и гаснет РАНЬШЕ — до того, как наплывёт второй экран
    if (inn)   scroll(animate(inn, { y: [0, -180], opacity: [1, 0] }, { ease: "linear" }),
                      { target: hero, offset: ["start start", "42% start"] });
    if (cue)   scroll(animate(cue, { opacity: [1, 0] }, { ease: "linear" }),
                      { target: hero, offset: ["start start", "18% start"] });
  }

  /* ---- 4. ГЛАВЫ: full-bleed зум фона + плывущий текст ---- */
  function initChapters() {
    if (REDUCE) return;
    $$(".chapter").forEach(function (ch) {
      var img = $(".chapter__img", ch), veil = $(".chapter__veil", ch), copy = $(".chapter__copy", ch);
      var T = { target: ch, offset: ["start start", "end start"] };
      if (img && !ch.classList.contains("chapter--closing"))  scroll(animate(img,  { scale: [1.18, 1.04] }, { ease: "linear" }), T);
      // тёмную вуаль скрабим; для светлой и видео-главы вуаль статична (задана в CSS)
      if (veil && !ch.classList.contains("chapter--light") && !ch.classList.contains("chapter--reel"))
        scroll(animate(veil, { opacity: [0.62, 0.5, 0.66] }, { ease: "linear" }), T);
      // текст проявляется ВО ВРЕМЯ наплыва главы (раньше), плавно перетекая с предыдущего экрана
      if (copy) scroll(animate(copy, { y: [120, -120], opacity: [0, 1, 1, 0] }, { ease: "linear" }),
                       { target: ch, offset: ["start end", "end start"] });
    });
  }

  /* ---- 5. STICKY-СТОПКА ---- */
  function initStack() {
    if (REDUCE) return;
    $$(".stack").forEach(function (sec) {
      var cards = $$(".stack__card", sec), n = cards.length;
      cards.forEach(function (card) {
        var im = $("img", card);
        if (im) scroll(animate(im, { scale: [1.2, 1] }, { ease: "linear" }),
          { target: card, offset: ["start end", "start start"] });
      });
      // карточка, которую накрывают, реагирует: сжимается, темнеет, чуть уезжает
      scroll(function (p) {
        cards.forEach(function (card, i) {
          var coverStart = (i + 1) / n;                 // когда следующая начинает накрывать
          var t = clamp01((p - coverStart) / (1 / n));  // окно «накрытия»
          var scale = lerp(1, 0.9, t);
          var ty = lerp(0, -34, t);
          card.style.transform = "translateY(" + ty + "px) scale(" + scale + ")";
          var dim = $(".stack__dim", card);
          if (dim) dim.style.opacity = lerp(0, 0.5, t);
        });
      }, { target: sec, offset: ["start start", "end end"] });
    });
  }

  /* ---- 5b. ГОРИЗОНТАЛЬНАЯ ГАЛЕРЕЯ: секция закреплена, проекты едут вбок ---- */
  function initHGallery() {
    $$(".hgallery").forEach(function (sec) {
      var sticky = $(".hgallery__sticky", sec), track = $(".hgallery__track", sec);
      if (!sticky || !track) return;
      if (REDUCE || window.innerWidth <= 900) { sec.style.height = "auto"; return; }
      var pad = parseFloat(getComputedStyle(track).paddingLeft) || 0;
      var dist = Math.max(0, track.scrollWidth - sticky.clientWidth + pad);
      sec.style.height = (window.innerHeight + dist) + "px";
      scroll(function (p) { track.style.transform = "translateX(" + (-dist * p) + "px)"; },
        { target: sec, offset: ["start start", "end end"] });
    });
  }

  /* ---- 6. MASKED TEXT (волна по словам, разовый триггер) ---- */
  function initSplit() {
    $$("[data-split]").forEach(function (el) {
      var words = el.textContent.trim().split(/\s+/);
      el.innerHTML = words.map(function (w) {
        return '<span class="line"><span class="line__inner">' + w + '&nbsp;</span></span>';
      }).join("");
      el.style.display = "inline-block";
      if (REDUCE) return;
      var inners = $$(".line__inner", el);
      inView(el, function () {
        animate(inners, { y: ["115%", "0%"] }, { duration: 0.8, delay: stagger(0.06), ease: EXPO });
      }, { margin: "0px 0px 8% 0px" });
    });
  }

  /* ---- 7. REVEAL (разовый по входу в кадр) ---- */
  function initReveal() {
    if (REDUCE) return;
    $$("[data-reveal]").forEach(function (el) {
      var kind = el.getAttribute("data-reveal");
      var to = kind === "fade"  ? { opacity: [0, 1] }
            : kind === "scale" ? { opacity: [0, 1], scale: [0.92, 1] }
            :                    { opacity: [0, 1], y: [60, 0] };
      inView(el, function () { animate(el, to, { duration: 0.8, ease: EXPO }); },
        { margin: "0px 0px 8% 0px" });
    });
  }

  /* ---- 8. STAGGER (разовый, каскад) ---- */
  function initStagger() {
    if (REDUCE) return;
    $$("[data-stagger]").forEach(function (box) {
      var kids = Array.prototype.slice.call(box.children);
      inView(box, function () {
        animate(kids, { opacity: [0, 1], y: [60, 0] }, { duration: 0.7, delay: stagger(0.08), ease: EXPO });
      }, { margin: "0px 0px 8% 0px" });
    });
  }

  /* ---- 8b. CLIP-REVEAL рамок (разовый) ---- */
  function initClip() {
    if (REDUCE) return;
    $$("[data-clip]").forEach(function (wrap) {
      inView(wrap, function () {
        animate(wrap, { clipPath: ["inset(0 0 100% 0)", "inset(0 0 0% 0)"], scale: [1.04, 1] },
          { duration: 1.0, ease: EXPO });
      }, { margin: "0px 0px 8% 0px" });
    });
  }

  /* ---- 8c. РЕНДЕР → ФОТО: верхний слой-рендер «сходит» по скроллу ---- */
  function initBA() {
    if (REDUCE) { $$(".ba__render").forEach(function (r) { r.style.display = "none"; }); return; }
    $$("[data-ba]").forEach(function (ba) {
      var render = $(".ba__render", ba), tp = $(".ba__tag--p", ba), tr = $(".ba__tag--r", ba);
      if (render) scroll(animate(render, { clipPath: ["inset(0 0 0 0)", "inset(0 0 100% 0)"] }, { ease: "linear" }),
        { target: ba, offset: ["start 0.82", "start 0.32"] });
      if (tp) scroll(animate(tp, { opacity: [0, 0, 1] }, { ease: "linear" }), { target: ba, offset: ["start 0.82", "start 0.35"] });
      if (tr) scroll(animate(tr, { opacity: [1, 0] }, { ease: "linear" }), { target: ba, offset: ["start 0.72", "start 0.45"] });
    });
  }

  /* ---- 8d. ШИРОКИЙ КАДР: рендер «сходит» по скроллу, проступает фото ---- */
  function initRevealSwap() {
    $$("[data-reveal-photo]").forEach(function (fig) {
      var sec = fig.closest(".reveal-sec") || fig;
      var render = $(".rv__render", fig), divider = $(".rv__divider", fig);
      var dragging = false;
      // x — позиция шва, %: 100 = весь рендер, 0 = вся реализация
      function apply(x) {
        x = Math.max(0, Math.min(100, x));
        if (render)  render.style.clipPath = "inset(0 " + (100 - x) + "% 0 0)";
        if (divider) { divider.style.left = x + "%"; divider.style.opacity = (x <= 1.2 ? 0 : 1); }
      }
      apply(100);
      // 1) СКРОЛЛ ведёт слайдер 100%→0% и доходит до САМОГО конца, пока блок ещё закреплён;
      //    затем готовый кадр «держится» на экране (раскрепление при 235vh — около 57%).
      if (REDUCE) { apply(50); }
      else scroll(function (p) {
        if (dragging) return;
        apply(lerp(100, 0, clamp01((p - 0.10) / (0.46 - 0.10))));
      }, { target: sec, offset: ["start start", "end start"] });
      // 2) РУЧНОЕ перетаскивание мышью / пальцем
      function pos(e) { var r = fig.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * 100; }
      fig.addEventListener("pointerdown", function (e) {
        if (e.target.closest(".rv__cta")) return;     // по кнопке — клик, не перетаскивание
        dragging = true; fig.classList.add("is-drag");
        try { fig.setPointerCapture(e.pointerId); } catch (_) {}
        apply(pos(e));
      });
      fig.addEventListener("pointermove", function (e) { if (dragging) apply(pos(e)); });
      function stop() { dragging = false; fig.classList.remove("is-drag"); }
      fig.addEventListener("pointerup", stop);
      fig.addEventListener("pointercancel", stop);
    });
  }

  /* ---- 9. ПАРАЛЛАКС ---- */
  function initParallax() {
    if (REDUCE) return;
    $$(".shot img").forEach(function (img) {
      scroll(animate(img, { y: ["-14%", "14%"] }, { ease: "linear" }),
        { target: img.closest(".shot") || img, offset: ["start end", "end start"] });
    });
    $$("[data-parallax]").forEach(function (el) {
      var depth = parseFloat(el.getAttribute("data-parallax")) || 0.2;
      var shift = 220 * depth;
      scroll(animate(el, { y: [shift, -shift] }, { ease: "linear" }),
        { target: el, offset: ["start end", "end start"] });
    });
  }

  /* ---- 10. СЧЁТЧИК 0→N по прогрессу главы (нативный scroll) ---- */
  function initCounter() {
    $$("[data-count]").forEach(function (el) {
      var end = parseInt(el.getAttribute("data-count"), 10) || 0;
      var suf = el.getAttribute("data-count-suffix") || "";
      if (REDUCE) { el.textContent = end + suf; return; }
      var host = el.closest(".chapter") || el;
      var upd = function () {
        var r = host.getBoundingClientRect();
        var travel = host.offsetHeight * 0.42;
        var p = clamp01((-r.top) / (travel || 1));
        el.textContent = Math.round(end * p) + suf;
      };
      addEventListener("scroll", upd, { passive: true });
      upd();
    });
  }

  /* ---- 11. MAGNETIC кнопки (обычный курсор, без кольца) ---- */
  function initCursor() {
    if (REDUCE || !FINE) return;
    $$("[data-magnetic]").forEach(function (el) {
      var power = parseFloat(el.getAttribute("data-magnetic")) || 0.4;
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        animate(el, { x: (e.clientX - (r.left + r.width / 2)) * power, y: (e.clientY - (r.top + r.height / 2)) * power },
          { type: "spring", stiffness: 300, damping: 22 });
      });
      el.addEventListener("pointerleave", function () {
        animate(el, { x: 0, y: 0 }, { type: "spring", stiffness: 250, damping: 18 });
      });
    });
  }

  /* ---- 12. МИКРО-ХОВЕР кнопок ---- */
  function initButtonHover() {
    if (REDUCE) return;
    $$(".btn:not([data-magnetic])").forEach(function (btn) {
      btn.addEventListener("pointerenter", function () { animate(btn, { scale: 1.03 }, { type: "spring", stiffness: 400, damping: 26 }); });
      btn.addEventListener("pointerleave", function () { animate(btn, { scale: 1 },    { type: "spring", stiffness: 400, damping: 26 }); });
    });
  }

  /* ---- BOOT (изолируем сбои; Lenis отключён — нативный скролл надёжнее) ---- */
  [initProgress, initHero, initChapters, initStack, initHGallery, initSplit,
   initReveal, initStagger, initClip, initRevealSwap, initParallax, initCounter]
    .forEach(function (fn) { try { fn(); } catch (e) { console.error("[motion]", fn.name, e); } });
})();
