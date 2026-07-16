/* ============================================================
   NoStress — главная · motion.js  (кинематографичный scroll-driven)
   КЛАССИЧЕСКИЙ скрипт (НЕ module) — чтобы работал и с file:// при
   открытии двойным кликом. Motion и Lenis грузятся UMD-глобалами
   <script> перед этим файлом (см. index.html).
   Engine: Motion (motion.dev) + Lenis. Пиннинг — CSS position:sticky.
   Всё гаснет при prefers-reduced-motion. Нет Motion → контент виден.
   ============================================================ */

/* Фолбэк: без Motion или при reduced-motion горизонтальные галереи
   должны листаться нативно (overflow-x), иначе контент недостижим */
(function () {
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!window.Motion || reduce) document.documentElement.classList.add("hg-static");
  else document.documentElement.classList.remove("hg-static");   // ретрай: Motion догрузился
})();

(function () {
  var M = window.Motion;
  if (!M || !M.animate || !M.scroll) {        // CDN не загрузился — оставляем статику видимой
    console.warn("[motion] Motion не загружен — анимации выключены, контент виден.");
    return;
  }
  if (window.__motionInited) return;          // защита от повторного прогона (ретрай загрузки)
  window.__motionInited = true;
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
    if (matchMedia('(max-width:900px)').matches) return; // мобилка: главы статичны, без скролл-сцен
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
      if (REDUCE) {            // reduce-motion: спокойный фейд заголовка без движения слов
        el.style.opacity = 0;
        inView(el, function () {
          animate(el, { opacity: [0, 1] }, { duration: 0.6, ease: "easeOut" });
        }, { margin: "0px 0px 8% 0px" });
        return;
      }
      var inners = $$(".line__inner", el);
      inView(el, function () {
        animate(inners, { y: ["115%", "0%"] }, { duration: 0.8, delay: stagger(0.06), ease: EXPO });
      }, { margin: "0px 0px 8% 0px" });
    });
  }

  /* ---- 7. REVEAL (разовый по входу в кадр) ---- */
  function initReveal() {
    $$("[data-reveal]").forEach(function (el) {
      var kind = el.getAttribute("data-reveal");
      var to = REDUCE           ? { opacity: [0, 1] }   /* reduce-motion: фейд без сдвига/зума */
            : kind === "fade"  ? { opacity: [0, 1] }
            : kind === "scale" ? { opacity: [0, 1], scale: [0.92, 1] }
            :                    { opacity: [0, 1], y: [60, 0] };
      inView(el, function () { animate(el, to, { duration: 0.8, ease: EXPO }); },
        { margin: "0px 0px 8% 0px" });
    });
  }

  /* ---- 8. STAGGER (разовый, каскад) ---- */
  function initStagger() {
    $$("[data-stagger]").forEach(function (box) {
      var kids = Array.prototype.slice.call(box.children);
      var to = REDUCE ? { opacity: [0, 1] } : { opacity: [0, 1], y: [60, 0] };
      inView(box, function () {
        animate(kids, to, { duration: 0.7, delay: stagger(0.08), ease: EXPO });
      }, { margin: "0px 0px 8% 0px" });
    });
  }

  /* ---- 8b. CLIP-REVEAL рамок (разовый) ---- */
  function initClip() {
    $$("[data-clip]").forEach(function (wrap) {
      if (REDUCE) {            // reduce-motion: фейд рамки вместо шторы с зумом
        wrap.style.opacity = 0;
        inView(wrap, function () {
          animate(wrap, { opacity: [0, 1] }, { duration: 0.7, ease: "easeOut" });
        }, { margin: "0px 0px 8% 0px" });
        return;
      }
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
    var MOBILE_BA = matchMedia("(max-width:760px)").matches;   // на мобиле скролл-привязка выключена
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
      //    Мобилка (≤760px): блок не закреплён — скролл-привязку не запускаем, шов 50/50, drag остаётся.
      if (REDUCE || MOBILE_BA) {
        apply(50);                                   // статичный шов 50/50, drag работает
        if (!MOBILE_BA) sec.style.height = "auto";   // десктоп: не держать 235vh мёртвого скролла
      }
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
      if (REDUCE || matchMedia('(max-width:900px)').matches) { el.textContent = end + suf; return; } // мобилка: цифры сразу финальные
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


/* ==== МОБИЛЬНОЕ БУРГЕР-МЕНЮ: строится из ссылок .nav (см. tokens.css) ==== */
(function(){
  if(document.querySelector('.burger')) return;
  var bar=document.querySelector('header .bar'), nav=bar&&bar.querySelector('.nav');
  if(!bar||!nav) return;
  var btn=document.createElement('button');
  btn.className='burger'; btn.type='button';
  btn.setAttribute('aria-label','Меню'); btn.setAttribute('aria-expanded','false');
  btn.innerHTML='<span></span><span></span>';
  bar.appendChild(btn);
  var panel=document.createElement('div'); panel.className='mnav';
  var links=document.createElement('nav'); links.className='mnav__links';
  Array.prototype.forEach.call(nav.children, function(el){
    if(el.classList&&el.classList.contains('has-sub')){
      var top=el.querySelector('a'), a=document.createElement('a');
      a.href=top.getAttribute('href'); a.textContent='Услуги'; links.appendChild(a);
      var sub=document.createElement('div'); sub.className='mnav__sub';
      el.querySelectorAll('.sub__panel a').forEach(function(s){
        var c=document.createElement('a'); c.href=s.getAttribute('href'); c.textContent=s.textContent; sub.appendChild(c);
      });
      links.appendChild(sub);
    }else if(el.tagName==='A'){
      var n=document.createElement('a'); n.href=el.getAttribute('href'); n.textContent=el.textContent; links.appendChild(n);
    }
  });
  var cta=bar.querySelector('.cta');
  if(cta){var b=document.createElement('a'); b.href=cta.getAttribute('href'); b.textContent=cta.textContent; b.className='cta mnav__cta'; links.appendChild(b);}
  panel.appendChild(links); document.body.appendChild(panel);
  function close(){document.documentElement.classList.remove('menu-open');btn.setAttribute('aria-expanded','false');}
  btn.addEventListener('click',function(){
    var open=document.documentElement.classList.toggle('menu-open');
    btn.setAttribute('aria-expanded',open?'true':'false');
  });
  panel.addEventListener('click',function(e){ if(e.target.closest('a')) close(); });
  window.addEventListener('keydown',function(e){ if(e.key==='Escape') close(); });
})();


/* ==== МОБИЛЬНЫЕ ФИКСЫ: solid-шапка после hero + sticky-CTA (см. tokens.css) ==== */
(function(){
  var mq = matchMedia('(max-width:900px)');
  var html = document.documentElement;
  var sticky = document.querySelector('.sticky-cta');
  var hideZone = false, ticking = false;

  function update(){
    ticking = false;
    if(!mq.matches){ html.classList.remove('hdr-solid'); html.classList.remove('sticky-hidden'); return; }
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    /* шапка: после hero (~0.8 экрана) — белая подложка, тёмный логотип */
    html.classList.toggle('hdr-solid', y > window.innerHeight * 0.8);
    /* sticky-CTA: показать после hero (0.7 экрана), спрятать у контакта/футера */
    if(sticky) html.classList.toggle('sticky-hidden', !(y > window.innerHeight * 0.7) || hideZone);
  }
  function onScroll(){ if(!ticking){ ticking = true; requestAnimationFrame(update); } }

  if(mq.matches && sticky) html.classList.add('sticky-hidden');   // начальное состояние — скрыт
  window.addEventListener('scroll', onScroll, {passive:true});
  window.addEventListener('resize', onScroll, {passive:true});
  if(mq.addEventListener) mq.addEventListener('change', onScroll);
  else if(mq.addListener) mq.addListener(onScroll);

  /* контакт/футер во вьюпорте → sticky-CTA прячется */
  if(sticky && 'IntersectionObserver' in window){
    var zones = [];
    var c = document.getElementById('contact'); if(c) zones.push(c);
    var f = document.querySelector('footer');   if(f) zones.push(f);
    if(zones.length){
      var io = new IntersectionObserver(function(es){
        es.forEach(function(e){ e.target.__stkVis = e.isIntersecting; });
        hideZone = zones.some(function(z){ return z.__stkVis; });
        onScroll();
      });
      zones.forEach(function(z){ io.observe(z); });
    }
  }
  update();
})();

/* ==== СТРЕЛКИ КАРУСЕЛИ «НАША ИСТОРИЯ» (десктоп) ====
   Работают в обоих режимах: scroll-driven (двигаем страницу — трек
   едет сам) и статичный фолбэк (скроллим трек). */
(function () {
  document.querySelectorAll('.hgallery--story').forEach(function (sec) {
    var track = sec.querySelector('.hgallery__track');
    var head = sec.querySelector('.hgallery__head');
    if (!track || !head) return;
    var nav = document.createElement('div');
    nav.className = 'hg-nav';
    [['prev', '←', -1], ['next', '→', 1]].forEach(function (cfg) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'hg-nav__btn hg-nav__btn--' + cfg[0];
      b.setAttribute('aria-label', cfg[0] === 'prev' ? 'Предыдущие главы' : 'Следующие главы');
      b.textContent = cfg[1];
      b.addEventListener('click', function () {
        var card = track.querySelector('.hcard');
        if (!card) return;
        var st = getComputedStyle(track);
        var gap = parseFloat(st.columnGap || st.gap) || 24;
        var dx = (card.getBoundingClientRect().width + gap) * cfg[2];
        if (st.overflowX === 'auto' || st.overflowX === 'scroll') {
          track.scrollBy({ left: dx, behavior: 'smooth' });
        } else {
          window.scrollBy({ top: dx, behavior: 'smooth' });
        }
      });
      nav.appendChild(b);
    });
    head.appendChild(nav);
  });
})();

/* ==== ПОПАП ЗАЯВКИ: все CTA открывают форму на месте, без прыжка вниз ====
   (кроме навигации «Контакты» и финального блока с Алёной — фидбэк 11.07.26) */
(function () {
  var TG_CONTACT = "https://t.me/NoStress_Design";
  var modal = document.createElement('div');
  modal.className = 'lead-modal';
  modal.innerHTML =
    '<div class="lead-modal__veil"></div>' +
    '<div class="lead-modal__panel" role="dialog" aria-modal="true" aria-label="Заявка на консультацию">' +
      '<button type="button" class="lead-modal__close" aria-label="Закрыть">✕</button>' +
      '<div class="eyebrow lead-modal__eyebrow">Консультация</div>' +
      '<h3 class="lead-modal__h">Поговорим о вашей квартире</h3>' +
      '<p class="lead-modal__p lead-modal__lead">Оставьте контакты — арт-директор изучит вашу планировку и покажет, что с&nbsp;ней можно сделать.</p>' +
      '<form class="lead-modal__form" novalidate>' +
        '<input class="field" name="name" placeholder="Как к вам обращаться" autocomplete="name">' +
        '<input class="field" name="phone" type="tel" placeholder="+7 ___ ___-__-__" autocomplete="tel">' +
        '<button class="btn" type="submit">Отправить</button>' +
      '</form>' +
      '<div class="lead-modal__thanks" hidden>' +
        '<h3 class="lead-modal__h">Спасибо за заявку!</h3>' +
        '<p class="lead-modal__p">Наш менеджер свяжется с вами в рабочее время.</p>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  function openModal() {
    document.documentElement.classList.remove('menu-open'); // если открыт бургер
    var b = document.querySelector('.burger'); if (b) b.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.add('lead-open');
  }
  function closeModal() { document.documentElement.classList.remove('lead-open'); }
  modal.querySelector('.lead-modal__veil').addEventListener('click', closeModal);
  modal.querySelector('.lead-modal__close').addEventListener('click', closeModal);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  modal.querySelector('.lead-modal__form').addEventListener('submit', function (e) {
    e.preventDefault();
    modal.querySelector('.lead-modal__panel').classList.add('is-done');
    modal.querySelector('.lead-modal__thanks').hidden = false;
  });

  // Кнопки-CTA, ведущие на #contact → попап (простые ссылки навигации не трогаем)
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a.btn[href$="#contact"], a.cta[href$="#contact"], a.rv__cta[href$="#contact"], a.mnav__cta[href$="#contact"], a.tf-cta[href$="#contact"]');
    if (!a) return;
    e.preventDefault();
    openModal();
  });

  // Финальная форма с Алёной остаётся на странице: после отправки — «Спасибо»
  Array.prototype.forEach.call(document.querySelectorAll('form.cap-form'), function (f) {
    f.removeAttribute('onsubmit');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      f.innerHTML = '<p class="cap-thanks"><b>Спасибо за заявку!</b><br>Наш менеджер свяжется с вами в рабочее время.</p>';
    });
  });

  // Живые ссылки в строке мессенджеров (замена заглушек href="#")
  var MAX_CONTACT = "https://max.ru/u/f9LHodD0cOJiFGlH1WY4KBPUxMxyyLweOX0eTCgGrosyt5wMZ8gfYy5IEQ4";
  Array.prototype.forEach.call(document.querySelectorAll('.messengers a'), function (a) {
    if (a.getAttribute('href') === '#') {
      var t = a.textContent.trim();
      if (t === 'Telegram') a.href = TG_CONTACT;
      if (t === 'MAX') a.href = MAX_CONTACT;
    }
    // мессенджеры — в новой вкладке, чтобы не уводить пользователя с сайта
    if (/^https?:/.test(a.href)) { a.target = '_blank'; a.rel = 'noopener'; }
  });
})();

/* ==== МОБИЛКА: иконка Telegram в шапке + контакты в бургер-меню ==== */
(function () {
  var TG_CHANNEL = "https://t.me/design_bez_stressa";
  var bar = document.querySelector('header .bar');
  if (bar && !bar.querySelector('.bar-tg')) {
    var tg = document.createElement('a');
    tg.className = 'bar-tg';
    tg.href = TG_CHANNEL;
    tg.target = '_blank'; tg.rel = 'noopener';
    tg.setAttribute('aria-label', 'Наш Telegram-канал');
    tg.innerHTML = '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>';
    bar.insertBefore(tg, bar.firstChild);
  }
  var links = document.querySelector('.mnav__links');
  if (links && !links.querySelector('.mnav__contacts')) {
    var box = document.createElement('div');
    box.className = 'mnav__contacts';
    box.innerHTML =
      '<a class="mnav-tel" href="tel:+79856741267">+7 985 67-412-67</a>' +
      '<a href="https://t.me/NoStress_Design" target="_blank" rel="noopener">Telegram</a>' +
      '<a href="https://max.ru/u/f9LHodD0cOJiFGlH1WY4KBPUxMxyyLweOX0eTCgGrosyt5wMZ8gfYy5IEQ4" target="_blank" rel="noopener">MAX</a>';
    links.appendChild(box);
  }
})();

/* ==== БЕГУЩАЯ СТРОКА: rAF-фолбэк, если браузер заглушил CSS-анимацию
   (энергосбережение и т.п.). Работает и без Motion — чистый rAF. ==== */
(function () {
  if (window.__mqWatch) return; window.__mqWatch = 1;   // не дублировать при ретрае скрипта
  function watch() {
    Array.prototype.forEach.call(document.querySelectorAll('.marquee__inner'), function (el) {
      var m1 = getComputedStyle(el).transform;
      setTimeout(function () {
        if (document.hidden) return;                 // вкладка в фоне — не судим
        var m2 = getComputedStyle(el).transform;
        if (m1 !== m2) return;                       // CSS-анимация едет — всё ок
        el.style.animation = 'none';                 // заглушенную CSS-анимацию выключаем
        var half = el.scrollWidth / 2 || 1;
        var speed = half / 28000;                    // тот же темп: половина ленты за 28 с
        var prev = null, x = 0;
        function step(t) {
          if (prev != null) {
            x = (x + (t - prev) * speed) % half;
            el.style.transform = 'translateX(' + (-x) + 'px)';
          }
          prev = t;
          requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      }, 1500);
    });
  }
  if (document.readyState === 'complete') setTimeout(watch, 800);
  else window.addEventListener('load', function () { setTimeout(watch, 800); });
})();
