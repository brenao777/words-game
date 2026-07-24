/* Словокруг — колесо букв: pointer events, светящаяся линия, перемешивание. */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  function Wheel(box, trace, callbacks) {
    this.box = box;
    this.trace = trace;
    this.cb = callbacks; // { onPick(i, word), onUnpick(i, word), onSubmit(word) }
    this.letters = [];   // { ch, el, x, y }
    this.picked = [];    // индексы
    this.pointerId = null;
    this.pos = null;

    box.addEventListener('pointerdown', e => this._down(e));
    box.addEventListener('pointermove', e => this._move(e));
    box.addEventListener('pointerup', e => this._up(e));
    box.addEventListener('pointercancel', e => this._up(e));
  }

  Wheel.prototype.setLetters = function (chars) {
    this.reset();
    this.letters.forEach(l => l.el.remove());
    this.letters = chars.map(ch => {
      const el = document.createElement('div');
      el.className = 'letter';
      el.textContent = ch.toUpperCase();
      this.box.appendChild(el);
      return { ch, el, x: 0, y: 0 };
    });
    this.order = this.letters.map((_, i) => i);
    this._size();
    this.layout(this.order);
  };

  Wheel.prototype._size = function () {
    const n = this.letters.length;
    const size = n >= 7 ? 0.185 : n === 6 ? 0.2 : 0.215;
    this.box.style.setProperty('--lsize', Math.round(this.box.clientWidth * size) + 'px');
  };

  /* Пересчитать размеры и позиции (после resize/поворота). */
  Wheel.prototype.refresh = function () {
    if (!this.letters.length) return;
    this._size();
    this.layout(this.order);
  };

  /* Расставить буквы по окружности (order — перестановка индексов). */
  Wheel.prototype.layout = function (order) {
    const n = this.letters.length;
    if (!order) order = this.letters.map((_, i) => i);
    this.order = order;
    const W = this.box.clientWidth;
    const R = W * 0.375;
    order.forEach((li, slot) => {
      const a = -Math.PI / 2 + slot * (2 * Math.PI / n);
      const l = this.letters[li];
      l.x = W / 2 + R * Math.cos(a);
      l.y = W / 2 + R * Math.sin(a);
      l.el.style.left = l.x + 'px';
      l.el.style.top = l.y + 'px';
    });
  };

  Wheel.prototype.shuffle = function () {
    const n = this.letters.length;
    const order = this.letters.map((_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    this.layout(order);
  };

  Wheel.prototype.word = function () {
    return this.picked.map(i => this.letters[i].ch).join('');
  };

  Wheel.prototype.reset = function () {
    this.picked.forEach(i => this.letters[i].el.classList.remove('picked'));
    this.picked = [];
    this.pointerId = null;
    this.pos = null;
    this._draw();
  };

  Wheel.prototype._hit = function (e) {
    const r = this.box.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    this.pos = { x, y };
    const size = this.letters.length ? this.letters[0].el.offsetWidth : 60;
    let best = -1, bestD = size * 0.62; // радиус захвата
    this.letters.forEach((l, i) => {
      const d = Math.hypot(l.x - x, l.y - y);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };

  Wheel.prototype._down = function (e) {
    if (this.pointerId !== null) return;
    if (e.target.closest && e.target.closest('.shuffle')) return;
    this.pointerId = e.pointerId;
    try { this.box.setPointerCapture(e.pointerId); } catch (err) {}
    const i = this._hit(e);
    if (i >= 0) this._pick(i);
    this._draw();
  };

  Wheel.prototype._move = function (e) {
    if (e.pointerId !== this.pointerId) return;
    const i = this._hit(e);
    if (i >= 0) {
      const pos = this.picked.indexOf(i);
      if (pos === -1) {
        this._pick(i);
      } else if (pos === this.picked.length - 2) {
        this._unpick(); // вернулись на предыдущую — отменяем последнюю
      }
    }
    this._draw();
  };

  Wheel.prototype._up = function (e) {
    if (e.pointerId !== this.pointerId) return;
    const word = this.word();
    const count = this.picked.length;
    this.reset();
    if (count > 0) this.cb.onSubmit(word);
  };

  Wheel.prototype._pick = function (i) {
    this.picked.push(i);
    this.letters[i].el.classList.add('picked');
    this.cb.onPick(this.picked.length - 1, this.word());
  };

  Wheel.prototype._unpick = function () {
    const i = this.picked.pop();
    this.letters[i].el.classList.remove('picked');
    this.cb.onUnpick(this.picked.length, this.word());
  };

  Wheel.prototype._draw = function () {
    const svg = this.trace;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!this.picked.length) return;
    const pts = this.picked.map(i => this.letters[i].x + ',' + this.letters[i].y);
    if (this.pointerId !== null && this.pos) pts.push(this.pos.x + ',' + this.pos.y);
    const mk = (w, o) => {
      const p = document.createElementNS(NS, 'polyline');
      p.setAttribute('points', pts.join(' '));
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', '#f2b64b');
      p.setAttribute('stroke-width', w);
      p.setAttribute('stroke-opacity', o);
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(p);
    };
    mk(16, 0.18); // свечение
    mk(7, 0.85);  // ядро линии
  };

  window.Wheel = Wheel;
})();
