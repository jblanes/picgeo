// GeoClick game flow: 10 rounds over difficulty 1..5 (two rounds per level), score = km (lower is better), four one-shot hints.
(function () {
  const ROUNDS = 10;
  const LEVELS = 5;
  const levelFor = round => Math.ceil(round / 2); // rounds 1-2 → level 1, 3-4 → 2 … 9-10 → 5
  const S = window.GeoStorage;
  const POOL = (window.LANDMARKS || []).filter(l => l && l.img && typeof l.lat === 'number' && l.difficulty > 0); // 0 = not yet levelled in the curator
  const photoUrl = l => l.img + (l.rev ? '?v=' + l.rev : ''); // replaced photos keep their file name; the stamp defeats the cache

  const $ = sel => document.querySelector(sel);
  const el = {
    overlay: $('#overlay'), summary: $('#summary'), play: $('#play-btn'), best: $('#best'),
    styleRadios: document.querySelectorAll('input[name="mapstyle"]'),
    roundLabel: $('#round-label'), scoreLabel: $('#score-label'),
    photo: $('#photo'), credit: $('#credit'), photoBox: $('#photo-box'),
    hints: document.querySelectorAll('button.hint'), hintOut: $('#hint-output'),
    result: $('#result'), resultKm: $('#result-km'), resultName: $('#result-name'), resultPlace: $('#result-place'),
    next: $('#next-btn'), instructions: $('#instructions'),
    styleButtons: document.querySelectorAll('#map-style button'),
    summaryRows: $('#summary-rows'), summaryTotal: $('#summary-total'), summaryNote: $('#summary-note'),
    again: $('#again-btn'), menu: $('#menu-btn'), poolNote: $('#pool-note'),
  };

  let view = null;
  let viewer = null; // full-screen photo viewer
  let game = null; // { round, score, rounds: [], hints: {}, current, next, guessed }

  // ---- helpers --------------------------------------------------------------
  function haversineKm(a, b) {
    const R = 6371, toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  const fmtKm = km => Math.round(km).toLocaleString();
  const rnd = arr => arr[Math.floor(Math.random() * arr.length)];

  /** Random unseen picture for a difficulty; resets that level's memory when exhausted; borrows neighbours when empty. */
  function pickFor(level) {
    let seen = S.getSeen();
    const atLevel = POOL.filter(l => l.difficulty === level);
    let cands = atLevel.filter(l => !seen.includes(l.id));
    if (!cands.length && atLevel.length) {
      const ids = new Set(atLevel.map(l => l.id));
      seen = seen.filter(id => !ids.has(id));
      S.setSeen(seen);
      cands = atLevel;
    }
    for (let d = 1; !cands.length && d < LEVELS; d++) {
      cands = POOL.filter(l => (l.difficulty === level - d || l.difficulty === level + d) && !seen.includes(l.id));
    }
    if (!cands.length) cands = POOL;
    const pick = rnd(cands);
    S.addSeen(pick.id);
    return pick;
  }

  function creditHtml(l) {
    const c = l.credit || {};
    let author = (c.author || '').replace(/No machine-readable author provided\.?/i, '').trim();
    if (author.length > 40) author = author.slice(0, 38) + '…';
    const parts = [];
    if (author) parts.push(author);
    if (c.license) parts.push(c.license);
    const text = parts.length ? parts.join(' · ') : 'Wikimedia Commons';
    return c.page ? `<a href="${c.page}" target="_blank" rel="noopener">${text}</a>` : text;
  }

  function flagFor(l) {
    const m = window.COUNTRY_META && window.COUNTRY_META[l.iso3];
    return m && m.flag ? m.flag : null;
  }

  // ---- screens ----------------------------------------------------------------
  function showOverlay() {
    el.overlay.hidden = false;
    el.summary.hidden = true;
    const best = S.getBest();
    el.best.textContent = best === null ? 'No games played yet.' : `Best score: ${fmtKm(best)} km`;
    const byLevel = {};
    POOL.forEach(l => { byLevel[l.difficulty] = (byLevel[l.difficulty] || 0) + 1; });
    el.poolNote.textContent = POOL.length
      ? `${POOL.length} pictures in the pool · ${S.getSeen().length} already seen on this device (a level repeats only once all of it has been shown)`
      : 'No pictures yet: run tools/build_candidates.py first.';
    const style = S.getMapStyle();
    el.styleRadios.forEach(r => { r.checked = r.value === style; });
  }

  function startGame() {
    const style = Array.from(el.styleRadios).find(r => r.checked)?.value || 'satellite';
    S.setMapStyle(style);
    view.setStyle(style);
    syncStyleButtons();
    el.overlay.hidden = true;
    el.summary.hidden = true;
    game = { round: 0, score: 0, rounds: [], hints: {}, current: null, next: pickFor(1), guessed: false };
    el.hints.forEach(b => { b.disabled = false; b.classList.remove('used'); });
    nextRound();
  }

  function nextRound() {
    game.round += 1;
    game.guessed = false;
    game.current = game.next || pickFor(levelFor(game.round));
    game.next = null;
    const cur = game.current;
    view.clearResult();
    view.setLocked(false);
    view.resetView();

    el.roundLabel.textContent = `Round ${game.round} / ${ROUNDS} · difficulty ${cur.difficulty}`;
    el.scoreLabel.textContent = `${fmtKm(game.score)} km`;
    el.photo.src = photoUrl(cur);
    el.photo.alt = 'Where is this?';
    el.credit.innerHTML = 'Photo: ' + creditHtml(cur);
    viewer.open(photoUrl(cur), el.credit.innerHTML); // every round starts with the picture full screen; closing it leaves the small copy in the panel
    el.hintOut.innerHTML = '';
    el.result.hidden = true;
    el.instructions.hidden = false;
    el.hints.forEach(b => { b.disabled = !!game.hints[b.dataset.hint]; });
  }

  function onPick(guess) {
    if (!game || game.guessed) return;
    game.guessed = true;
    view.setLocked(true);
    const cur = game.current;
    const truth = { lat: cur.lat, lng: cur.lng };
    const km = haversineKm(guess, truth);
    game.score += km;
    game.rounds.push({ landmark: cur, km, guess });

    view.showResult(guess, truth, cur.name, km);
    el.resultKm.textContent = fmtKm(km);
    el.resultName.textContent = cur.name;
    el.resultPlace.textContent = cur.place;
    el.scoreLabel.textContent = `${fmtKm(game.score)} km`;
    el.result.hidden = false;
    el.instructions.hidden = true;
    el.hints.forEach(b => { b.disabled = true; });
    el.next.textContent = game.round >= ROUNDS ? 'See results' : 'Next round';
    el.next.focus();

    if (game.round < ROUNDS) {
      game.next = pickFor(levelFor(game.round + 1));
      const pre = new Image();
      pre.src = photoUrl(game.next);
    }
  }

  function endGame() {
    view.setLocked(true);
    const total = game.score;
    const isBest = S.submitScore(total);
    S.finishGame();
    el.summaryRows.innerHTML = game.rounds.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${r.landmark.name}</strong><br><small>${r.landmark.place}</small></td>
        <td class="num">${fmtKm(r.km)}</td>
      </tr>`).join('');
    el.summaryTotal.textContent = `${fmtKm(total)} km`;
    const notes = [];
    if (isBest) notes.push('New best score!');
    const best = S.getBest();
    if (!isBest && best !== null) notes.push(`Best: ${fmtKm(best)} km`);
    el.summaryNote.textContent = notes.join(' ');
    el.summary.hidden = false;
  }

  // ---- hints ------------------------------------------------------------------
  function useHint(kind) {
    if (!game || game.guessed || game.hints[kind]) return;
    game.hints[kind] = true;
    const cur = game.current;
    const btn = Array.from(el.hints).find(b => b.dataset.hint === kind);
    if (btn) { btn.disabled = true; btn.classList.add('used'); }
    const meta = (window.COUNTRY_META && window.COUNTRY_META[cur.iso3]) || {};
    const line = document.createElement('div');
    line.className = 'hint-line hint-' + kind;
    if (kind === 'country') {
      view.flyToCountry(cur.iso3, { lat: cur.lat, lng: cur.lng });
      line.textContent = 'The country is highlighted on the globe.';
    } else if (kind === 'name') {
      line.innerHTML = `<strong>${cur.place || meta.name || '?'}</strong>`;
    } else if (kind === 'flag') {
      const flag = flagFor(cur);
      line.innerHTML = flag
        ? `<img class="flag" src="${flag}" alt="flag">`
        : `<em>No flag available for this one. Country: ${meta.name || cur.iso3}</em>`;
    } else if (kind === 'exact') {
      view.showTruth({ lat: cur.lat, lng: cur.lng }, cur.name);
      view.flyTo(cur.lat, cur.lng, 0.35, 1200);
      line.textContent = 'The exact spot is marked. Hold on it to finish the round.';
    }
    el.hintOut.appendChild(line);
  }

  function syncStyleButtons() {
    const s = view.getStyle();
    el.styleButtons.forEach(b => b.classList.toggle('on', b.dataset.style === s));
  }

  // ---- wiring -------------------------------------------------------------------
  function init() {
    view = window.GlobeView.create($('#globe'), $('#hold-ring'), { onPick, style: S.getMapStyle(), creditEl: $('#map-credit') });
    syncStyleButtons();
    el.play.addEventListener('click', startGame);
    el.again.addEventListener('click', startGame);
    el.menu.addEventListener('click', showOverlay);
    el.next.addEventListener('click', () => { if (game.round >= ROUNDS) endGame(); else nextRound(); });
    el.hints.forEach(b => b.addEventListener('click', () => useHint(b.dataset.hint)));
    el.styleButtons.forEach(b => b.addEventListener('click', () => {
      view.setStyle(b.dataset.style);
      S.setMapStyle(b.dataset.style);
      syncStyleButtons();
    }));
    viewer = window.PhotoViewer.create();
    el.photo.addEventListener('click', () => viewer.open(el.photo.src, el.credit.innerHTML));
    document.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && game && game.guessed && !el.result.hidden && el.summary.hidden && !viewer.isOpen()) {
        e.preventDefault();
        el.next.click();
      }
    });
    showOverlay();
    window.GeoDebug = { view: () => view, game: () => game };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
