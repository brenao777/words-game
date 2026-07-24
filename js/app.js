/* Словокруг — экраны, выбор уровня, звук, блокировка жестов. */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);

  const ICON_ON = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const ICON_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  function renderSound() {
    const on = window.Store.state.sound;
    ['#home-sound', '#btn-sound'].forEach(sel => {
      const b = $(sel);
      b.innerHTML = on ? ICON_ON : ICON_OFF;
      b.classList.toggle('on', on);
    });
    window.SFX.setEnabled(on);
  }

  function toggleSound() {
    window.Store.setSound(!window.Store.state.sound);
    renderSound();
    window.SFX.click();
  }

  function show(id) {
    ['#home', '#game'].forEach(sel => {
      const el = $(sel);
      const on = sel === id;
      if (on === !el.hidden) return;
      el.hidden = !on;
      if (on) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }
    });
  }

  function renderHome() {
    window.UIH.refreshCoins();
    const box = $('#levels');
    box.innerHTML = '';
    window.SK_LEVELS.forEach((_, i) => {
      const st = window.Store.state.levels[i];
      const b = document.createElement('button');
      b.className = 'lvl' + (st && st.done ? ' done' : (st && st.found && st.found.length ? ' started' : ''));
      b.textContent = i + 1;
      b.addEventListener('click', () => {
        window.SFX.click();
        openLevel(i);
      });
      box.appendChild(b);
    });
  }

  function openLevel(i) {
    show('#game');
    window.Game.open(i);
  }

  function goHome() {
    $('#overlay').hidden = true;
    renderHome();
    show('#home');
  }

  function init() {
    renderSound();
    renderHome();
    window.Game.init();

    $('#home-sound').addEventListener('click', toggleSound);
    $('#btn-sound').addEventListener('click', toggleSound);
    $('#btn-back').addEventListener('click', () => { window.SFX.click(); goHome(); });

    $('#ov-home').addEventListener('click', () => { window.SFX.click(); goHome(); });
    $('#ov-next').addEventListener('click', () => {
      window.SFX.click();
      $('#overlay').hidden = true;
      const next = window.Game.idx + 1;
      if (next < window.SK_LEVELS.length) openLevel(next);
      else goHome();
    });

    // разблокировка аудио первым касанием
    const unlock = () => window.SFX.unlock();
    document.addEventListener('pointerdown', unlock, { once: false });

    // никакого скролла, зума и контекстных меню
    document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('dblclick', e => e.preventDefault());
    document.addEventListener('contextmenu', e => e.preventDefault());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
