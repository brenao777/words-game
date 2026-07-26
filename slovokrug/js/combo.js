/* Словокруг — комбо-система: множитель монет за серию правильных слов. */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);

  // streak: 0 1 2 3+
  const MULTIPLIERS = [1, 2, 3, 5];

  const Combo = {
    streak: 0,
    multiplier: 1,
    el: null,
    popTimer: null,

    /** Привязать DOM-элемент (вызывается из Game.init). */
    init(el) {
      this.el = el;
    },

    /** Игрок нашёл слово — увеличиваем серию. */
    grow() {
      this.streak++;
      const prev = this.multiplier;
      this.multiplier = MULTIPLIERS[Math.min(this.streak, MULTIPLIERS.length - 1)];
      this._render(prev !== this.multiplier);
    },

    /** Невалидное слово — сброс серии. */
    reset() {
      if (this.streak === 0) return;
      const wasActive = this.multiplier > 1;
      this.streak = 0;
      this.multiplier = 1;
      this._render(false);
      if (wasActive && window.Particles) {
        window.Particles.comboBreak();
      }
    },

    /** Сброс при уходе с уровня / открытии нового. */
    levelReset() {
      this.streak = 0;
      this.multiplier = 1;
      this._render(false);
    },

    /* ---- внутреннее ---- */

    _render(grew) {
      if (!this.el) return;
      if (this.multiplier <= 1) {
        this.el.hidden = true;
        return;
      }
      this.el.hidden = false;
      this.el.innerHTML = '\u00D7<b>' + this.multiplier + '</b> \u041A\u041E\u041C\u0411\u041E';

      if (grew) {
        clearTimeout(this.popTimer);
        this.el.classList.remove('combo-pop');
        // force reflow для перезапуска анимации
        void this.el.offsetWidth;
        this.el.classList.add('combo-pop');
        this.popTimer = setTimeout(function () {
          Combo.el.classList.remove('combo-pop');
        }, 520);
      }
    },
  };

  window.Combo = Combo;
})();
