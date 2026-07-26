/* Словокруг — игровой экран: сетка, проверка слов, бонусы, подсказки. */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);

  const COST_LAMP = 25;
  const COST_TARGET = 50;
  const WORD_REWARD = 3;
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
      el.setAttribute('aria-label', 'Баланс: ' + c + ' монет');
      if (bumpIt) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    });
  }

  /* Монета летит по дуге из точки (x,y) в счётчик монет. */
  function flyCoin(x, y, delay, onFinish) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (onFinish) onFinish();
      return;
    }
    const fx = $('#fx');
    const layer = fx.getBoundingClientRect();
    const pill = $('#game-coins').getBoundingClientRect();
    const sx = x - layer.left;
    const sy = y - layer.top;
    const tx = pill.left + pill.width / 2 - layer.left - 8;
    const ty = pill.top + pill.height / 2 - layer.top - 8;
    const coin = document.createElement('div');
    coin.className = 'fly-coin';
    coin.style.left = (sx - 8) + 'px';
    coin.style.top = (sy - 8) + 'px';
    fx.appendChild(coin);
    const dx = tx - (sx - 8), dy = ty - (sy - 8);
    const anim = coin.animate([
      { transform: 'translate(0,0) rotate(0deg) scale(.7)', opacity: 0 },
      { transform: `translate(${dx * 0.18}px, ${dy * 0.08 - 34}px) rotate(80deg) scale(1.15)`, opacity: 1, offset: 0.22 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.28 - 64}px) rotate(220deg) scale(1.3)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) rotate(540deg) scale(.45)`, opacity: 0.92 },
    ], { duration: 650, delay: delay || 0, easing: 'cubic-bezier(.22,.72,.32,1)', fill: 'backwards' });
    anim.onfinish = () => {
      coin.remove();
      if (onFinish) onFinish();
    };
  }

  function animateCoinReward(x, y, amount, particleCount, startDelay) {
    const generation = Game.gen;
    const fx = $('#fx');
    const count = Math.max(1, Math.min(particleCount || 3, amount));
    const label = document.createElement('div');
    label.className = 'coin-reward';
    label.setAttribute('aria-hidden', 'true');
    label.textContent = '+' + amount;
    const layer = fx.getBoundingClientRect();
    label.style.left = (x - layer.left) + 'px';
    label.style.top = (y - layer.top) + 'px';
    fx.appendChild(label);
    setTimeout(() => label.remove(), 1000 + (startDelay || 0));

    let arrived = 0;
    const pill = $('#game-coins');
    pill.classList.add('rewarding');
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const spread = count === 1 ? 0 : 10;
      flyCoin(
        x + Math.cos(angle) * spread,
        y + Math.sin(angle) * spread,
        (startDelay || 0) + i * 85,
        () => {
          if (generation !== Game.gen) return;
          arrived++;
          window.SFX.coin();
          if (arrived === count) {
            pill.classList.remove('rewarding');
            refreshCoins(true);
            updateHintButtons();
          }
        },
      );
    }
  }

  window.UIH = { toast, refreshCoins, animateCoinReward };

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
    coachAnim: null,   // анимация обучающего «пальца» (первый запуск)
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
        if (!window.Store.state.seenIntro) hideCoach(true); // тронул букву — понял, как играть
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

    window.Particles.init($('#particles-canvas'));
    window.Combo.init($('#combo-indicator'));

    $('#btn-shuffle').addEventListener('click', () => {
      window.SFX.click();
      Game.wheel.shuffle();
      if (!window.Store.state.seenIntro) maybeShowCoach(); // пересобрать путь «пальца» под новую раскладку
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
      if (e.target === e.currentTarget) {
        e.currentTarget.hidden = true; // посмотреть решённую сетку
        $('#btn-back').focus();
      }
    });
    $('#grid').addEventListener('click', onGridTap);
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || $('#game').hidden) return;
      const overlay = $('#overlay');
      if (!overlay.hidden) {
        overlay.hidden = true;
        $('#btn-back').focus();
        e.preventDefault();
      } else if (Game.targetMode) {
        setTargetMode(false);
        $('#hint-target').focus();
        e.preventDefault();
      }
    });
    window.addEventListener('resize', () => {
      if (!Game.level || $('#game').hidden) return;
      layoutGrid();
      Game.wheel.refresh();
      if (!window.Store.state.seenIntro) maybeShowCoach();
    });
  };

  Game.open = function (idx) {
    Game.gen++;
    Game.idx = idx;
    Game.level = window.SK_LEVELS[idx];
    Game.saved = window.Store.level(idx);
    Game.finished = false;
    Game.targetMode = false;
    window.Combo.levelReset();
    $('#hint-target').classList.remove('armed');
    $('#hint-target').setAttribute('aria-pressed', 'false');

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
    updateLevelProgress(false);
    updateBonusChip(false);
    updateHintButtons();
    renderPreview('');

    if (Game.saved.done && allFound()) {
      // пройденный уровень: показываем решённую сетку и сразу оверлей
      later(() => showOverlay(true), 350);
    } else {
      maybeShowCoach();
    }
  };

  /* Выход с игрового экрана: гасим все отложенные таймеры уровня. */
  Game.close = function () {
    Game.gen++;
    setTargetMode(false);
    hideCoach(false); // подсказку не «засчитываем», если игрок ушёл, не тронув буквы
    window.Combo.levelReset();
    $('#fx').replaceChildren();
    $('#game-coins').classList.remove('rewarding');
    refreshCoins();
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

  function updateLevelProgress(bumpIt) {
    const found = Game.words.filter(w => w.found).length;
    const total = Game.words.length;
    const progress = $('#lvl-progress');
    const row = progress.parentElement;
    progress.textContent = found + ' / ' + total + ' слов';
    progress.setAttribute('aria-label', 'Найдено ' + found + ' из ' + total + ' слов');
    $('#lvl-progress-fill').style.width = (total ? found / total * 100 : 0) + '%';
    if (bumpIt) {
      row.classList.remove('bump');
      void row.offsetWidth;
      row.classList.add('bump');
    }
  }

  let pvTimer = null;

  function renderPreview(word) {
    clearTimeout(pvTimer);
    const pv = $('#preview');
    pv.className = 'preview' + (word.length >= 7 ? ' long' : '');
    pv.innerHTML = '';
    pv.setAttribute('aria-label', word ? 'Собрано: ' + word.toUpperCase() : 'Слово не набрано');
    for (const ch of word) {
      const t = document.createElement('div');
      t.className = 'pv-tile';
      t.textContent = ch.toUpperCase();
      t.setAttribute('aria-hidden', 'true');
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

  /* ---------- обучающая подсказка (только при самом первом запуске) ---------- */

  function maybeShowCoach() {
    if (window.Store.state.seenIntro) return;
    const ls = Game.wheel && Game.wheel.letters;
    const order = Game.wheel && Game.wheel.order;
    if (!ls || !ls.length || !order) return;

    $('#coach-tip').hidden = false;

    // при системной «меньше движения» показываем только подпись, без бегающего пальца
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hand = $('#coach-hand');
    if (reduce) {
      if (Game.coachAnim) { Game.coachAnim.cancel(); Game.coachAnim = null; }
      hand.hidden = true;
      return;
    }

    // короткий путь по трём соседним буквам на окружности — демонстрация жеста
    const slots = [0, 1, 2].slice(0, Math.min(3, ls.length));
    const pts = slots.map(s => ls[order[s]]);
    const at = p => `translate(${p.x}px, ${p.y}px)`;
    const frames = [{ transform: at(pts[0]) + ' scale(.5)', opacity: 0 }];
    frames.push({ transform: at(pts[0]) + ' scale(1)', opacity: 1, offset: 0.10 });
    for (let i = 1; i < pts.length; i++) {
      frames.push({ transform: at(pts[i]) + ' scale(1)', opacity: 1, offset: 0.10 + 0.70 * (i / (pts.length - 1)) });
    }
    frames.push({ transform: at(pts[pts.length - 1]) + ' scale(1)', opacity: 1, offset: 0.90 });
    frames.push({ transform: at(pts[pts.length - 1]) + ' scale(.5)', opacity: 0 });

    hand.hidden = false;
    if (Game.coachAnim) Game.coachAnim.cancel();
    Game.coachAnim = hand.animate(frames, { duration: 2200, iterations: Infinity, easing: 'cubic-bezier(.4,.1,.3,1)' });
  }

  function hideCoach(markSeen) {
    if (Game.coachAnim) { Game.coachAnim.cancel(); Game.coachAnim = null; }
    $('#coach-tip').hidden = true;
    $('#coach-hand').hidden = true;
    if (markSeen && !window.Store.state.seenIntro) window.Store.setIntroSeen();
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
        window.Combo.grow();
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
        window.Combo.grow();
        const reward = BONUS_REWARD * window.Combo.multiplier;
        window.Store.addCoins(reward);
        window.SFX.bonus();
        window.HAPTIC.ok();
        const comboLabel = window.Combo.multiplier > 1 ? ' ×' + window.Combo.multiplier : '';
        toast('✦ ' + word.toUpperCase() + '  +' + reward + comboLabel, true);
        updateBonusChip(true);
        updateHintButtons();
        const pv = $('#preview').getBoundingClientRect();
        animateCoinReward(pv.left + pv.width / 2, pv.top + pv.height / 2, reward, 4, 100);
        previewOut('absorb');
      }
      return;
    }

    // Невалидное слово — сброс комбо
    window.Combo.reset();
    window.SFX.invalid();
    window.HAPTIC.no();
    previewOut('shake');
  }

  function foundWord(gridWord) {
    gridWord.found = true;
    Game.saved.found.push(gridWord.w);
    const reward = WORD_REWARD * window.Combo.multiplier;
    window.Store.addCoins(reward);
    updateLevelProgress(true);
    updateHintButtons();
    window.SFX.word(gridWord.w.length);
    window.HAPTIC.ok();
    const boxes = gridWord.cells.map(c => c.el.getBoundingClientRect());
    const origin = boxes.reduce(
      (point, box) => ({ x: point.x + box.left + box.width / 2, y: point.y + box.top + box.height / 2 }),
      { x: 0, y: 0 },
    );
    origin.x /= boxes.length;
    origin.y /= boxes.length;
    // взрыв частиц из центра слова
    window.Particles.burst(origin.x, origin.y, 14);
    gridWord.cells.forEach((c, i) => {
      later(() => {
        if (c.open) glowCell(c); else openCell(c);
      }, i * 45);
    });
    animateCoinReward(origin.x, origin.y, reward, 3, gridWord.cells.length * 45 + 80);
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
    if (extra) {
      updateLevelProgress(true);
      window.Store.save();
      window.SFX.word(3);
    }
    updateHintButtons();
    if (allFound() && !Game.finished) {
      Game.finished = true;
      later(levelComplete, 1050);
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
    $('#ov-next').focus();
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
    const lampDisabled = empty || c < COST_LAMP;
    const targetDisabled = empty || c < COST_TARGET;
    $('#hint-lamp').classList.toggle('disabled', lampDisabled);
    $('#hint-lamp').setAttribute('aria-disabled', String(lampDisabled));
    $('#hint-target').classList.toggle('disabled', targetDisabled);
    $('#hint-target').setAttribute('aria-disabled', String(targetDisabled));
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
    $('#hint-target').setAttribute('aria-pressed', String(on));
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
    chip.setAttribute('aria-label', 'Бонусных слов: ' + n);
    if (bump) { chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump'); }
    window.Store.save();
  }

  window.Game = Game;
})();
