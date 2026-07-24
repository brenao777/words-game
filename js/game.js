/* Словокруг — игровой экран: сетка, проверка слов, бонусы, подсказки. */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);

  const COST_LAMP = 25;
  const COST_TARGET = 50;
  const BONUS_REWARD = 5;
  const WIN_REWARD = 20;

  /* ---------- общие UI-хелперы ---------- */

  let toastTimer = null;
  function toast(msg, gold) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = gold ? 'gold' : '';
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.add('out');
      toastTimer = setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, 240);
    }, 1400);
  }

  function refreshCoins(bumpIt) {
    const c = window.Store.state.coins;
    ['#home-coins', '#game-coins'].forEach(sel => {
      const el = $(sel);
      if (!el) return;
      el.querySelector('b').textContent = c;
      if (bumpIt) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    });
  }

  /* Монета летит по дуге из точки (x,y) в счётчик монет. */
  function flyCoin(x, y, delay) {
    const fx = $('#fx');
    const pill = $('#game-coins').getBoundingClientRect();
    const tx = pill.left + pill.width / 2 - 8;
    const ty = pill.top + pill.height / 2 - 8;
    const coin = document.createElement('div');
    coin.className = 'fly-coin';
    coin.style.left = (x - 8) + 'px';
    coin.style.top = (y - 8) + 'px';
    fx.appendChild(coin);
    const dx = tx - (x - 8), dy = ty - (y - 8);
    const anim = coin.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.4}px, ${dy * 0.25 - 60}px) scale(1.25)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(.5)`, opacity: 0.9 },
    ], { duration: 620, delay: delay || 0, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'backwards' });
    anim.onfinish = () => {
      coin.remove();
      window.SFX.coin();
      refreshCoins(true);
    };
  }

  window.UIH = { toast, refreshCoins, flyCoin };

  /* ---------- игра ---------- */

  const Game = {
    idx: 0,
    gen: 0,             // поколение уровня: инвалидирует отложенные таймеры при смене уровня
    level: null,
    saved: null,
    cells: new Map(),   // "x,y" -> { x, y, ch, el, open }
    words: [],          // { w, x, y, d, cells[], found }
    wheelCounts: null,
    wheel: null,
    targetMode: false,
    finished: false,
  };

  function key(x, y) { return x + ',' + y; }

  /* setTimeout, который молча не срабатывает, если уровень уже сменился. */
  function later(fn, ms) {
    const g = Game.gen;
    return setTimeout(() => { if (g === Game.gen) fn(); }, ms);
  }

  function counts(word) {
    const m = {};
    for (const ch of word) m[ch] = (m[ch] || 0) + 1;
    return m;
  }

  function canFormFromWheel(word) {
    const need = counts(word);
    for (const ch in need) if (!Game.wheelCounts[ch] || Game.wheelCounts[ch] < need[ch]) return false;
    return true;
  }

  Game.init = function () {
    Game.wheel = new window.Wheel($('#wheel-box'), $('#trace'), {
      onPick(i, word) {
        window.SFX.pick(i);
        window.HAPTIC.tap();
        renderPreview(word);
      },
      onUnpick(i, word) {
        window.SFX.unpick(i);
        renderPreview(word);
      },
      onSubmit(word) { submit(word); },
    });

    $('#btn-shuffle').addEventListener('click', () => {
      window.SFX.click();
      Game.wheel.shuffle();
    });
    $('#hint-lamp').addEventListener('click', () => hintLamp());
    $('#hint-target').addEventListener('click', () => hintTargetToggle());
    $('#bonus-chip').addEventListener('click', () => {
      const list = Game.saved.bonus;
      if (!list.length) return;
      const shown = list.slice(-5).map(w => w.toUpperCase()).join(' · ');
      toast('✦ ' + shown + (list.length > 5 ? ' …' : ''), true);
    });
    $('#overlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) e.currentTarget.hidden = true; // посмотреть решённую сетку
    });
    $('#grid').addEventListener('click', onGridTap);
    window.addEventListener('resize', () => {
      if (!Game.level) return;
      layoutGrid();
      Game.wheel.refresh();
    });
  };

  Game.open = function (idx) {
    Game.gen++;
    Game.idx = idx;
    Game.level = window.SK_LEVELS[idx];
    Game.saved = window.Store.level(idx);
    Game.finished = false;
    Game.targetMode = false;
    $('#hint-target').classList.remove('armed');

    $('#lvl-title').textContent = 'Уровень ' + (idx + 1);
    refreshCoins();

    // сетка
    const grid = $('#grid');
    grid.innerHTML = '';
    Game.cells = new Map();
    Game.words = Game.level.w.map(entry => {
      const [w, x, y, d] = entry;
      const wordCells = [];
      for (let i = 0; i < w.length; i++) {
        const cx = x + (d === 0 ? i : 0);
        const cy = y + (d === 1 ? i : 0);
        const k = key(cx, cy);
        let cell = Game.cells.get(k);
        if (!cell) {
          const el = document.createElement('div');
          el.className = 'cell';
          grid.appendChild(el);
          cell = { x: cx, y: cy, ch: w[i], el, open: false };
          Game.cells.set(k, cell);
        }
        wordCells.push(cell);
      }
      return { w, x, y, d, cells: wordCells, found: false };
    });

    layoutGrid();

    // колесо
    Game.wheelCounts = counts(Game.level.l.join(''));
    Game.wheel.setLetters(Game.level.l);

    // восстановление прогресса: найденные слова и купленные подсказкой буквы
    for (const fw of Game.saved.found) {
      const word = Game.words.find(x => x.w === fw && !x.found);
      if (word) { word.found = true; word.cells.forEach(c => openCell(c, true)); }
    }
    for (const hk of Game.saved.hinted) {
      const cell = Game.cells.get(hk);
      if (cell) openCell(cell, true, true);
    }
    updateBonusChip(false);
    updateHintButtons();
    renderPreview('');

    if (Game.saved.done && allFound()) {
      // пройденный уровень: показываем решённую сетку и сразу оверлей
      later(() => showOverlay(true), 350);
    }
  };

  /* Выход с игрового экрана: гасим все отложенные таймеры уровня. */
  Game.close = function () {
    Game.gen++;
    setTargetMode(false);
  };

  function layoutGrid() {
    const wrap = $('#grid-wrap');
    const grid = $('#grid');
    const cellsArr = [...Game.cells.values()];
    if (!cellsArr.length) return;
    const cols = Math.max(...cellsArr.map(c => c.x)) + 1;
    const rows = Math.max(...cellsArr.map(c => c.y)) + 1;
    const gap = 4;
    const availW = wrap.clientWidth - 8;
    const availH = wrap.clientHeight - 8;
    const cell = Math.max(14, Math.min(
      cols <= 5 && rows <= 5 ? 58 : 52,
      Math.floor((availW - (cols - 1) * gap) / cols),
      Math.floor((availH - (rows - 1) * gap) / rows)
    ));
    grid.style.setProperty('--cell', cell + 'px');
    grid.style.width = (cols * cell + (cols - 1) * gap) + 'px';
    grid.style.height = (rows * cell + (rows - 1) * gap) + 'px';
    for (const c of cellsArr) {
      c.el.style.left = (c.x * (cell + gap)) + 'px';
      c.el.style.top = (c.y * (cell + gap)) + 'px';
    }
  }

  function openCell(cell, instant, hinted) {
    if (cell.open) return;
    cell.open = true;
    cell.el.textContent = cell.ch.toUpperCase();
    cell.el.classList.remove('target-mode');
    if (hinted) cell.el.classList.add('hinted');
    if (instant) {
      cell.el.style.animation = 'none';
      cell.el.classList.add('open');
    } else {
      cell.el.classList.add('open');
    }
  }

  function glowCell(cell) {
    cell.el.classList.remove('glow');
    void cell.el.offsetWidth;
    cell.el.classList.add('glow');
  }

  function allFound() { return Game.words.every(w => w.found); }

  let pvTimer = null;

  function renderPreview(word) {
    clearTimeout(pvTimer);
    const pv = $('#preview');
    pv.className = 'preview' + (word.length >= 7 ? ' long' : '');
    pv.innerHTML = '';
    for (const ch of word) {
      const t = document.createElement('div');
      t.className = 'pv-tile';
      t.textContent = ch.toUpperCase();
      pv.appendChild(t);
    }
    // во время набора слова прячем бонус-фишку, чтобы не наезжала на плитки
    $('#bonus-chip').classList.toggle('faded', word.length > 0);
  }

  function previewOut(cls) {
    const pv = $('#preview');
    pv.classList.add(cls);
    clearTimeout(pvTimer);
    pvTimer = setTimeout(() => renderPreview(''), cls === 'shake' ? 420 : 320);
  }

  /* ---------- проверка собранного слова ---------- */

  function submit(word) {
    if (word.length < 2) { renderPreview(''); return; }

    const gridWord = Game.words.find(x => x.w === word);
    if (gridWord) {
      if (gridWord.found) {
        window.SFX.dup();
        toast('Уже найдено');
        previewOut('dissolve');
      } else {
        foundWord(gridWord);
        previewOut('absorb');
      }
      return;
    }

    if (word.length >= 3 && window.SK_DICT.has(word) && canFormFromWheel(word)) {
      if (Game.saved.bonus.includes(word)) {
        window.SFX.dup();
        toast('Бонус уже найден');
        previewOut('dissolve');
      } else {
        Game.saved.bonus.push(word);
        window.Store.addCoins(BONUS_REWARD);
        window.SFX.bonus();
        window.HAPTIC.ok();
        toast('✦ ' + word.toUpperCase() + '  +' + BONUS_REWARD, true);
        updateBonusChip(true);
        updateHintButtons();
        const pv = $('#preview').getBoundingClientRect();
        flyCoin(pv.left + pv.width / 2, pv.top + pv.height / 2, 120);
        previewOut('absorb');
      }
      return;
    }

    window.SFX.invalid();
    window.HAPTIC.no();
    previewOut('shake');
  }

  function foundWord(gridWord) {
    gridWord.found = true;
    Game.saved.found.push(gridWord.w);
    window.Store.save();
    window.SFX.word(gridWord.w.length);
    window.HAPTIC.ok();
    gridWord.cells.forEach((c, i) => {
      setTimeout(() => {
        if (c.open) glowCell(c); else openCell(c);
      }, i * 45);
    });
    // открытая буква могла достроить другие слова
    later(() => checkAutoComplete(), gridWord.cells.length * 45 + 60);
  }

  /* Слова, у которых открылись все клетки (через пересечения или подсказки), считаются найденными. */
  function checkAutoComplete() {
    let extra = 0;
    for (const w of Game.words) {
      if (!w.found && w.cells.every(c => c.open)) {
        w.found = true;
        Game.saved.found.push(w.w);
        w.cells.forEach(glowCell);
        extra++;
      }
    }
    if (extra) { window.Store.save(); window.SFX.word(3); }
    updateHintButtons();
    if (allFound() && !Game.finished) {
      Game.finished = true;
      later(levelComplete, 650);
    }
  }

  function levelComplete() {
    const first = !Game.saved.done;
    Game.saved.done = true;
    if (first) window.Store.addCoins(WIN_REWARD);
    window.Store.save();
    window.SFX.win();
    window.HAPTIC.ok();
    refreshCoins(true);
    showOverlay(false, first);
  }

  function showOverlay(replay, rewarded) {
    const ov = $('#overlay');
    const last = Game.idx + 1 >= window.SK_LEVELS.length;
    $('#ov-kicker').textContent = last ? 'игра пройдена' : replay ? 'уровень пройден ранее' : 'уровень пройден';
    $('#ov-title').textContent = last ? 'Триумф!' : ['Отлично!', 'Блестяще!', 'Превосходно!', 'Мастерски!'][Game.idx % 4];
    const bonus = Game.saved.bonus.length;
    $('#ov-stats').innerHTML =
      'Слов: <b>' + Game.words.length + '</b>' +
      (bonus ? ' &nbsp;·&nbsp; бонусных: <b>' + bonus + '</b>' : '') +
      (rewarded ? ' &nbsp;·&nbsp; награда: <b>+' + WIN_REWARD + '</b>' : '');
    $('#ov-next').textContent = last ? 'К уровням' : 'Дальше';
    $('#ov-home').hidden = last;
    ov.hidden = false;
    // перезапуск золотой волны
    const pulse = ov.querySelector('.overlay-pulse');
    pulse.style.animation = 'none';
    void pulse.offsetWidth;
    pulse.style.animation = '';
  }

  /* ---------- подсказки ---------- */

  function closedCells() {
    return [...Game.cells.values()].filter(c => !c.open);
  }

  function updateHintButtons() {
    const empty = closedCells().length === 0;
    const c = window.Store.state.coins;
    $('#hint-lamp').classList.toggle('disabled', empty || c < COST_LAMP);
    $('#hint-target').classList.toggle('disabled', empty || c < COST_TARGET);
  }

  function hintLamp() {
    const pool = closedCells();
    if (!pool.length) return;
    if (window.Store.state.coins < COST_LAMP) { toast('Недостаточно монет'); window.SFX.invalid(); return; }
    window.Store.addCoins(-COST_LAMP);
    refreshCoins(true);
    const cell = pool[Math.floor(Math.random() * pool.length)];
    revealHint(cell);
  }

  function hintTargetToggle() {
    if (Game.targetMode) { setTargetMode(false); return; }
    const pool = closedCells();
    if (!pool.length) return;
    if (window.Store.state.coins < COST_TARGET) { toast('Недостаточно монет'); window.SFX.invalid(); return; }
    setTargetMode(true);
    toast('Выберите ячейку');
    window.SFX.click();
  }

  function setTargetMode(on) {
    Game.targetMode = on;
    $('#hint-target').classList.toggle('armed', on);
    closedCells().forEach(c => c.el.classList.toggle('target-mode', on));
    if (!on) [...Game.cells.values()].forEach(c => c.el.classList.remove('target-mode'));
  }

  /* Тап по сетке в режиме «мишень»: берём ближайшую закрытую клетку,
   * чтобы промах в 4-пиксельный зазор не открывал соседнюю. */
  function onGridTap(e) {
    if (!Game.targetMode) return;
    let best = null, bestD = Infinity;
    for (const c of closedCells()) {
      const r = c.el.getBoundingClientRect();
      const d = Math.hypot(r.left + r.width / 2 - e.clientX, r.top + r.height / 2 - e.clientY);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (!best) return;
    const size = best.el.offsetWidth || 40;
    if (bestD > size * 1.1) return; // слишком далеко — не считаем выбором
    if (window.Store.state.coins < COST_TARGET) { setTargetMode(false); toast('Недостаточно монет'); return; }
    window.Store.addCoins(-COST_TARGET);
    refreshCoins(true);
    setTargetMode(false);
    revealHint(best);
  }

  function revealHint(cell) {
    window.SFX.hint();
    openCell(cell, false, true);
    Game.saved.hinted.push(key(cell.x, cell.y));
    window.Store.save();
    later(() => checkAutoComplete(), 350);
  }

  function updateBonusChip(bump) {
    const chip = $('#bonus-chip');
    const n = Game.saved.bonus.length;
    chip.hidden = n === 0;
    chip.querySelector('b').textContent = n;
    if (bump) { chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump'); }
    window.Store.save();
  }

  window.Game = Game;
})();
