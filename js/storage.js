/* Словокруг — прогресс в localStorage. */
(function () {
  'use strict';

  const KEY = 'slovokrug.v1';
  const DEFAULT_COINS = 100;

  let state = null;

  function defaults() {
    return {
      coins: DEFAULT_COINS,
      sound: true,
      levels: {}, // { [idx]: { found: [], bonus: [], hinted: [], done: false } }
    };
  }

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function uniqueStrings(value, accept) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.filter(item => {
      if (typeof item !== 'string' || item.length === 0 || (accept && !accept(item)) || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
  }

  function normalizeLevel(value) {
    const raw = isRecord(value) ? value : {};
    return {
      found: uniqueStrings(raw.found),
      bonus: uniqueStrings(raw.bonus),
      hinted: uniqueStrings(raw.hinted, item => /^\d+,\d+$/.test(item)),
      done: raw.done === true,
    };
  }

  function normalizeState(value) {
    const next = defaults();
    if (!isRecord(value)) return next;

    if (Number.isFinite(value.coins) && value.coins >= 0) next.coins = Math.floor(value.coins);
    if (typeof value.sound === 'boolean') next.sound = value.sound;

    if (isRecord(value.levels)) {
      for (const [idx, levelState] of Object.entries(value.levels)) {
        if (/^(0|[1-9]\d*)$/.test(idx)) next.levels[idx] = normalizeLevel(levelState);
      }
    }
    return next;
  }

  function load() {
    if (state) return state;
    try {
      const raw = localStorage.getItem(KEY);
      state = normalizeState(raw ? JSON.parse(raw) : null);
    } catch (e) {
      state = defaults();
    }
    return state;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(load())); } catch (e) {}
  }

  function level(idx) {
    const s = load();
    if (!s.levels[idx]) s.levels[idx] = normalizeLevel(null);
    return s.levels[idx];
  }

  window.Store = {
    get state() { return load(); },
    save,
    level,
    addCoins(n) {
      if (!Number.isFinite(n)) return;
      const s = load();
      s.coins = Math.max(0, Math.floor(s.coins + n));
      save();
    },
    setSound(v) { load().sound = !!v; save(); },
  };
})();
