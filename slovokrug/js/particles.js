/* Словокруг — система частиц: шлейф, взрывы, красная вспышка.
 * Лёгкий canvas-движок на requestAnimationFrame, ≤ 30 частиц одновременно. */
(function () {
  'use strict';

  var MAX_PARTICLES = 30;
  var GRAVITY = 0.18;

  var Particles = {
    canvas: null,
    ctx: null,
    pool: [],
    raf: 0,
    running: false,
    reducedMotion: false,

    /* ---- инициализация ---- */

    init: function (canvas) {
      if (!canvas) return;
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      this._fit();
      var self = this;
      window.addEventListener('resize', function () { self._fit(); });
      this._start();
    },

    _fit: function () {
      if (!this.canvas) return;
      var app = document.querySelector('#app');
      if (!app) return;
      var w = app.clientWidth;
      var h = app.clientHeight;
      if (this.canvas.width !== w) this.canvas.width = w;
      if (this.canvas.height !== h) this.canvas.height = h;
    },

    /* ---- цикл ---- */

    _start: function () {
      if (this.running) return;
      this.running = true;
      var self = this;
      (function tick() {
        if (!self.running) return;
        self._update();
        self._draw();
        self.raf = requestAnimationFrame(tick);
      })();
    },

    _update: function () {
      var pool = this.pool;
      for (var i = pool.length - 1; i >= 0; i--) {
        var p = pool[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += GRAVITY;
        p.life--;
        p.size *= 0.982;
        if (p.life <= 0) pool.splice(i, 1);
      }
    },

    _draw: function () {
      var ctx = this.ctx;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      var pool = this.pool;
      for (var i = 0; i < pool.length; i++) {
        var p = pool[i];
        var alpha = Math.max(0, p.life / (p.maxLife || 30)) * p.alpha;
        if (alpha <= 0.01) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        if (p.glow) {
          ctx.shadowColor = p.color;
          ctx.shadowBlur = p.glow * alpha;
          ctx.fill();
        }
        ctx.restore();
      }
    },

    /* ---- фабрика частиц ---- */

    _emit: function (p) {
      while (this.pool.length >= MAX_PARTICLES) {
        this.pool.shift();
      }
      this.pool.push(p);
    },

    /* ---- публичные эффекты ---- */

    /**
     * Золотой шлейф за пальцем при ведении по колесу.
     * Вызывается из Wheel._down / Wheel._move с координатами относительно #app.
     */
    trail: function (x, y) {
      if (this.reducedMotion) return;
      this._emit({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 0.9,
        vy: (Math.random() - 0.5) * 0.9 - 0.3,
        size: 1.2 + Math.random() * 2.0,
        life: 18 + Math.floor(Math.random() * 10),
        maxLife: 28,
        alpha: 0.7,
        color: '#f2b64b',
        glow: 3,
      });
    },

    /**
     * Взрыв золотых частиц из центра найденного слова.
     * count — количество частиц (обрежется до лимита).
     */
    burst: function (x, y, count) {
      if (this.reducedMotion) return;
      var n = Math.min(count || 10, MAX_PARTICLES - this.pool.length);
      if (n <= 0) return;
      for (var i = 0; i < n; i++) {
        var angle = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        var speed = 2.2 + Math.random() * 3.5;
        this._emit({
          x: x, y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.5,
          size: 2.0 + Math.random() * 3.2,
          life: 22 + Math.floor(Math.random() * 16),
          maxLife: 38,
          alpha: 0.85,
          color: '#f2b64b',
          glow: 5,
        });
      }
    },

    /**
     * Красная вспышка при сбросе комбо.
     * Частицы разлетаются из центра экрана.
     */
    comboBreak: function () {
      if (this.reducedMotion) return;
      var cx = this.canvas.width / 2;
      var cy = this.canvas.height * 0.4;
      var n = Math.min(22, MAX_PARTICLES - this.pool.length);
      if (n <= 0) return;
      for (var i = 0; i < n; i++) {
        var angle = Math.random() * Math.PI * 2;
        var speed = 3.5 + Math.random() * 5.5;
        this._emit({
          x: cx + (Math.random() - 0.5) * 140,
          y: cy + (Math.random() - 0.5) * 70,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2.5,
          size: 1.6 + Math.random() * 3.8,
          life: 16 + Math.floor(Math.random() * 14),
          maxLife: 30,
          alpha: 0.82,
          color: Math.random() > 0.35 ? '#ff3b30' : '#ff6b4a',
          glow: 5,
        });
      }
    },
  };

  window.Particles = Particles;
})();
