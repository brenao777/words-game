#!/usr/bin/env node
/*
 * Словокруг — генератор уровней.
 *
 * Берёт словарь (tools/dictionary.ru.js), строит 50 уровней растущей сложности
 * и валидирует каждый:
 *   - каждое слово собирается из букв колеса (мультимножество букв базового слова);
 *   - все слова связаны в одну фигуру, пересечения согласованы;
 *   - каждая непрерывная цепочка >=2 букв в сетке — ровно одно из слов уровня
 *     (никаких случайных «не-слов»);
 *   - ширина сетки <=7, высота <=8, без дубликатов.
 *
 * Пишет js/levels.data.js и js/dictionary.js. Детерминирован (seed фиксирован).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DICT = require('./dictionary.ru.js');

const MAX_W = 7;
const MAX_H = 8;
const SEED = 20260724;

/* План сложности: 50 уровней. */
const PLAN = [];
function plan(n, len, words) { for (let i = 0; i < n; i++) PLAN.push({ len, words }); }
plan(4, 5, 4);   // 1–4
plan(8, 5, 5);   // 5–12
plan(8, 6, 5);   // 13–20
plan(8, 6, 6);   // 21–28
plan(8, 6, 7);   // 29–36
plan(7, 7, 7);   // 37–43
plan(4, 7, 8);   // 44–47
plan(3, 7, 9);   // 48–50

/* ---------- утилиты ---------- */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function counts(word) {
  const m = new Map();
  for (const ch of word) m.set(ch, (m.get(ch) || 0) + 1);
  return m;
}

function canForm(word, baseCounts) {
  const need = counts(word);
  for (const [ch, n] of need) if ((baseCounts.get(ch) || 0) < n) return false;
  return true;
}

/* ---------- раскладка кроссворда ---------- */

const key = (x, y) => x + ',' + y;

/* Классические правила: совпадение на пересечениях, пустые клетки до/после слова,
 * пустые перпендикулярные соседи у некроссовых клеток. Возвращает число пересечений или -1. */
function fits(grid, w, x, y, d) {
  const dx = d === 0 ? 1 : 0, dy = d === 0 ? 0 : 1;
  if (grid.has(key(x - dx, y - dy))) return -1;
  if (grid.has(key(x + dx * w.length, y + dy * w.length))) return -1;
  let crosses = 0;
  for (let i = 0; i < w.length; i++) {
    const cx = x + dx * i, cy = y + dy * i;
    const ex = grid.get(key(cx, cy));
    if (ex !== undefined) {
      if (ex !== w[i]) return -1;
      crosses++;
    } else {
      const n1 = d === 0 ? key(cx, cy - 1) : key(cx - 1, cy);
      const n2 = d === 0 ? key(cx, cy + 1) : key(cx + 1, cy);
      if (grid.has(n1) || grid.has(n2)) return -1;
    }
  }
  if (crosses === w.length) return -1; // слово целиком поверх существующих клеток
  return crosses;
}

function bbox(placements) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of placements) {
    const ex = p.d === 0 ? p.x + p.w.length - 1 : p.x;
    const ey = p.d === 1 ? p.y + p.w.length - 1 : p.y;
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, ex); y1 = Math.max(y1, ey);
  }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/* Пытается уложить набор слов (words[0] — базовое). Возвращает placements или null. */
function tryLayout(words, rng, baseDir) {
  const grid = new Map();
  const placements = [];

  function put(w, x, y, d) {
    const dx = d === 0 ? 1 : 0, dy = d === 0 ? 0 : 1;
    for (let i = 0; i < w.length; i++) grid.set(key(x + dx * i, y + dy * i), w[i]);
    placements.push({ w, x, y, d });
  }

  const base = words[0];
  if (baseDir === 0 && base.length > MAX_W) baseDir = 1;
  if (baseDir === 1 && base.length > MAX_H) baseDir = 0;
  put(base, 0, 0, baseDir);

  let rest = words.slice(1);
  // немного перетасуем порядок укладки, длинные — раньше
  rest = shuffled(rest, rng).sort((a, b) => b.length - a.length + (rng() - 0.5));

  const deferred = [];
  const queue = rest.slice();
  let deferAllowed = queue.length; // каждый может быть отложен один раз

  while (queue.length) {
    const w = queue.shift();
    const options = [];
    for (const p of placements) {
      const pdx = p.d === 0 ? 1 : 0, pdy = p.d === 0 ? 0 : 1;
      for (let pi = 0; pi < p.w.length; pi++) {
        const cx = p.x + pdx * pi, cy = p.y + pdy * pi;
        const ch = p.w[pi];
        for (let wi = 0; wi < w.length; wi++) {
          if (w[wi] !== ch) continue;
          for (const d of [0, 1]) {
            const x = d === 0 ? cx - wi : cx;
            const y = d === 1 ? cy - wi : cy;
            const crosses = fits(grid, w, x, y, d);
            if (crosses < 1) continue;
            const nb = bbox(placements.concat([{ w, x, y, d }]));
            if (nb.w > MAX_W || nb.h > MAX_H) continue;
            options.push({ x, y, d, score: crosses * 10 - nb.w * nb.h + rng() * 3 });
          }
        }
      }
    }
    if (!options.length) {
      if (deferAllowed-- > 0 && queue.length) { queue.push(w); continue; }
      return null;
    }
    options.sort((a, b) => b.score - a.score);
    const pick = options[Math.floor(rng() * Math.min(3, options.length))];
    put(w, pick.x, pick.y, pick.d);
  }

  const b = bbox(placements);
  return placements.map(p => ({ w: p.w, x: p.x - b.x0, y: p.y - b.y0, d: p.d }));
}

/* ---------- валидация уровня ---------- */

function validateLevel(level, dictSet) {
  const errors = [];
  const wheelCounts = counts(level.l.join(''));
  const words = level.w;

  if (new Set(words.map(p => p.w)).size !== words.length) errors.push('дубликаты слов');

  const grid = new Map();
  for (const p of words) {
    if (!dictSet.has(p.w)) errors.push('нет в словаре: ' + p.w);
    if (!canForm(p.w, wheelCounts)) errors.push('не собирается из колеса: ' + p.w);
    const dx = p.d === 0 ? 1 : 0, dy = p.d === 0 ? 0 : 1;
    for (let i = 0; i < p.w.length; i++) {
      const k = key(p.x + dx * i, p.y + dy * i);
      const ex = grid.get(k);
      if (ex !== undefined && ex !== p.w[i]) errors.push('конфликт пересечения у ' + p.w);
      grid.set(k, p.w[i]);
      if (p.x + dx * i < 0 || p.y + dy * i < 0) errors.push('отрицательные координаты у ' + p.w);
    }
  }

  const cells = [...grid.keys()].map(k => k.split(',').map(Number));
  const maxX = Math.max(...cells.map(c => c[0]));
  const maxY = Math.max(...cells.map(c => c[1]));
  if (maxX + 1 > MAX_W) errors.push('ширина ' + (maxX + 1) + ' > ' + MAX_W);
  if (maxY + 1 > MAX_H) errors.push('высота ' + (maxY + 1) + ' > ' + MAX_H);

  // связность
  const seen = new Set();
  const stack = [cells[0].join(',')];
  while (stack.length) {
    const k = stack.pop();
    if (seen.has(k) || !grid.has(k)) continue;
    seen.add(k);
    const [x, y] = k.split(',').map(Number);
    stack.push(key(x + 1, y), key(x - 1, y), key(x, y + 1), key(x, y - 1));
  }
  if (seen.size !== grid.size) errors.push('фигура не связна');

  // каждая максимальная цепочка >=2 букв должна быть ровно одним словом уровня
  const placedAt = new Map(words.map(p => [p.x + ',' + p.y + ',' + p.d, p.w]));
  let runsFound = 0;
  for (const dir of [0, 1]) {
    const dx = dir === 0 ? 1 : 0, dy = dir === 0 ? 0 : 1;
    for (const [x, y] of cells) {
      if (grid.has(key(x - dx, y - dy))) continue; // не начало цепочки
      let s = '', cx = x, cy = y;
      while (grid.has(key(cx, cy))) { s += grid.get(key(cx, cy)); cx += dx; cy += dy; }
      if (s.length < 2) continue;
      runsFound++;
      if (placedAt.get(x + ',' + y + ',' + dir) !== s) errors.push('случайная цепочка «' + s + '» (' + x + ',' + y + ')');
    }
  }
  if (runsFound !== words.length) errors.push('число цепочек ' + runsFound + ' != числу слов ' + words.length);

  return errors;
}

/* ---------- сборка уровня ---------- */

function buildLevel(spec, dict, dictSet, usedBases, globalUse, rng) {
  const bases = dict.filter(w => w.length === spec.len && !usedBases.has(w));
  // ранжируем базовые слова по богатству подслов
  const scored = bases.map(b => {
    const bc = counts(b);
    const subs = dict.filter(w => w !== b && w.length >= 3 && w.length < b.length && canForm(w, bc));
    return { b, subs };
  }).filter(s => s.subs.length >= spec.words + 1);

  if (!scored.length) return null;
  const order = shuffled(scored, rng).sort((a, b) => b.subs.length - a.subs.length + (rng() - 0.5) * 6);

  for (const cand of order.slice(0, 60)) {
    for (let attempt = 0; attempt < 40; attempt++) {
      // выбираем подслова: предпочитаем реже использованные, длину — вперемешку
      const pool = shuffled(cand.subs, rng)
        .sort((a, b) => ((globalUse.get(a) || 0) - (globalUse.get(b) || 0)) + (rng() - 0.5) * 2)
        .slice(0, Math.min(cand.subs.length, spec.words * 3));
      const chosen = shuffled(pool, rng).slice(0, spec.words - 1);
      if (chosen.length < spec.words - 1) continue;

      const placements = tryLayout([cand.b, ...chosen], rng, attempt % 2);
      if (!placements) continue;

      const letters = shuffled(cand.b.split(''), rng);
      const level = { l: letters, w: placements.map(p => [p.w, p.x, p.y, p.d]) };
      const errs = validateLevel(
        { l: letters, w: placements },
        dictSet
      );
      if (errs.length) continue;

      usedBases.add(cand.b);
      for (const p of placements) globalUse.set(p.w, (globalUse.get(p.w) || 0) + 1);
      return level;
    }
  }
  return null;
}

/* ---------- main ---------- */

function main() {
  const dict = [...new Set(DICT.map(w => w.toLowerCase().replace(/ё/g, 'е')))]
    .filter(w => /^[а-я]{3,7}$/.test(w))
    .sort();
  const dictSet = new Set(dict);
  console.log('Словарь: ' + dict.length + ' слов');

  const rng = mulberry32(SEED);
  const usedBases = new Set();
  const globalUse = new Map();
  const levels = [];
  const stats = [];

  for (let i = 0; i < PLAN.length; i++) {
    let spec = { ...PLAN[i] };
    let lvl = buildLevel(spec, dict, dictSet, usedBases, globalUse, rng);
    // мягкая деградация: чуть меньше слов, если не вышло
    while (!lvl && spec.words > 3) {
      spec.words--;
      lvl = buildLevel(spec, dict, dictSet, usedBases, globalUse, rng);
    }
    if (!lvl) {
      console.error('Не удалось построить уровень ' + (i + 1) + ' (' + PLAN[i].len + ' букв, ' + PLAN[i].words + ' слов)');
      process.exit(1);
    }
    levels.push(lvl);
    const cellsSet = new Set();
    for (const [w, x, y, d] of lvl.w) {
      for (let k = 0; k < w.length; k++) cellsSet.add((x + (d === 0 ? k : 0)) + ',' + (y + (d === 1 ? k : 0)));
    }
    const maxX = Math.max(...[...cellsSet].map(s => +s.split(',')[0])) + 1;
    const maxY = Math.max(...[...cellsSet].map(s => +s.split(',')[1])) + 1;
    const wc = counts(lvl.l.join(''));
    const bonusPool = dict.filter(w => canForm(w, wc) && !lvl.w.some(p => p[0] === w)).length;
    stats.push({ i: i + 1, base: lvl.w[0][0], letters: lvl.l.length, words: lvl.w.length, size: maxX + 'x' + maxY, bonus: bonusPool, planWords: PLAN[i].words });
  }

  // финальная сквозная валидация
  let bad = 0;
  levels.forEach((lvl, i) => {
    const errs = validateLevel({ l: lvl.l, w: lvl.w.map(([w, x, y, d]) => ({ w, x, y, d })) }, dictSet);
    if (errs.length) { bad++; console.error('УРОВЕНЬ ' + (i + 1) + ': ' + errs.join('; ')); }
  });
  if (bad) process.exit(1);

  for (const s of stats) {
    const drop = s.words < s.planWords ? '  (план был ' + s.planWords + ')' : '';
    console.log(
      'Ур.' + String(s.i).padStart(2) + '  ' + s.base.padEnd(8) + s.letters + ' букв  ' +
      s.words + ' слов  ' + s.size.padEnd(5) + ' бонус-пул ' + s.bonus + drop
    );
  }

  const short = stats.filter(s => s.words < s.planWords).length;
  console.log('Все 50 уровней валидны.' + (short ? ' Уровней с урезанным планом: ' + short : ''));

  // запись данных
  const levelsJs = '/* Сгенерировано tools/generate.js — не редактировать вручную. */\n' +
    'window.SK_LEVELS = [\n' +
    levels.map(l =>
      '{l:' + JSON.stringify(l.l) + ',w:[' +
      l.w.map(w => JSON.stringify(w)).join(',') + ']}'
    ).join(',\n') +
    '\n];\n';
  fs.writeFileSync(path.join(__dirname, '..', 'js', 'levels.data.js'), levelsJs);

  const dictJs = '/* Сгенерировано tools/generate.js — не редактировать вручную. */\n' +
    'window.SK_DICT = new Set(' + JSON.stringify(dict.join(' ')) + '.split(" "));\n';
  fs.writeFileSync(path.join(__dirname, '..', 'js', 'dictionary.js'), dictJs);

  console.log('Записано: js/levels.data.js (' + levels.length + ' уровней), js/dictionary.js (' + dict.length + ' слов)');
}

main();
