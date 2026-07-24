/* Словокруг — прогресс в localStorage. */
(function () {
  'use strict';

  const KEY = 'slovokrug.v1';

  const DEFAULTS = {
    coins: 100,
    sound: true,
    levels: {}, // { [idx]: { found: [], bonus: [], done: false } }
  };

  let state = null;

  function load() {
    if (state) return state;
    try {
      const raw = localStorage.getItem(KEY);
      state = raw ? Object.assign({}, DEFAULTS, JSON.parse(raw)) : Object.assign({}, DEFAULTS);
      if (!state.levels || typeof state.levels !== 'object') state.levels = {};
    } catch (e) {
      state = Object.assign({}, DEFAULTS);
    }
    return state;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  function level(idx) {
    const s = load();
    if (!s.levels[idx]) s.levels[idx] = { found: [], bonus: [], hinted: [], done: false };
    if (!s.levels[idx].hinted) s.levels[idx].hinted = []; // миграция старых сохранений
    return s.levels[idx];
  }

  window.Store = {
    get state() { return load(); },
    save,
    level,
    addCoins(n) { load().coins = Math.max(0, load().coins + n); save(); },
    setSound(v) { load().sound = !!v; save(); },
  };
})();
