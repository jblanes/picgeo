// GeoClick game flow: 10 rounds over difficulty 1..5 (two rounds per level), score = km (lower is better),
// four one-shot hints and a one-shot 1,000 km cap, a daily game shared by everyone and free play,
// English or Spanish interface.
(function () {
  const ROUNDS = 10;
  const LEVELS = 5;
  const CAP_KM = 1000;
  const levelFor = round => Math.ceil(round / 2); // rounds 1-2 → level 1, 3-4 → 2 … 9-10 → 5
  const S = window.GeoStorage;
  const POOL = (window.LANDMARKS || []).filter(l => l && l.img && typeof l.lat === 'number' && l.difficulty > 0); // 0 = not yet levelled in the curator
  const photoUrl = l => l.img + (l.rev ? '?v=' + l.rev : ''); // replaced photos keep their file name; the stamp defeats the cache

  // ---- languages ---------------------------------------------------------------
  const I18N = {
    en: {
      intro1: 'A picture of a place somewhere on Earth. Press and hold on the globe where you think it is. Every kilometre you are off is added to your score. Ten rounds, from easy to very hard. <strong>Lowest score wins.</strong>',
      intro2: 'Four hints per game, each usable once: zoom to the country, the name of the place, the flag, or the exact spot. Once per game, after a bad round, you can cap it at 1,000 km.',
      modeDaily: 'Daily game', modeFree: 'Free play',
      modeHelp: 'Daily: everyone gets the same ten places today, so totals can be compared. Free play: random places you have not seen yet.',
      dailyDone: "Today's daily game is done: {km} km. Come back tomorrow.",
      satellite: 'Satellite globe', political: 'Political globe',
      tiles: 'Map tiles stream from the internet and stay sharp when you zoom in.',
      language: 'Language', play: 'Play',
      statsNone: 'No games played yet.',
      statsGames: '{n} games · average {avg} km · best {best} km',
      statsLevels: 'Best round per level: {list}',
      statsSeen: '{seen} of {total} pictures seen on this device',
      round: 'Round {r} / {n} · level {d}',
      hintCountry: '🌍 Country', hintName: '🏷️ Name', hintFlag: '🚩 Flag', hintExact: '📍 Exact', cap: '🛡️ Cap this round at 1,000 km',
      hintCountryT: 'Zoom the globe to the country', hintNameT: 'Show the name of the place', hintFlagT: "Show the country's flag", hintExactT: 'Mark the exact location',
      capT: 'Once per game',
      instructions: 'Press and <strong>hold for a second</strong> on the globe to place your guess. Drag to rotate, pinch or scroll to zoom.',
      countryOut: 'The country is highlighted on the globe.',
      noFlag: 'No flag for this one. Country: {c}',
      exactOut: 'The exact spot is marked. Hold on it to finish the round.',
      capped: 'capped from {km} km',
      totalSoFar: 'Total so far:', seeIt: '👁 See it', next: 'Next round', results: 'See results',
      resultsTitle: 'Results', thPlace: 'Place', total: 'Total',
      newBest: 'New best score!', bestIs: 'Best: {km} km',
      dailyOf: 'Daily game of {date}', freePlay: 'Free play',
      share: 'Share result', shared: 'Copied to the clipboard.',
      again: 'Play again', menu: 'Menu',
      whereIsThis: 'Where is this?', findIt: 'Find it on the globe',
      photoAlt: 'Where is this?', photo: 'Photo:', photoTitle: 'Tap to see the picture full screen again; pinch or scroll to zoom',
      noPictures: 'No pictures yet: run tools/build_candidates.py first.',
      km: 'km',
    },
    es: {
      intro1: 'Una foto de un lugar del mundo. Mantén pulsado el globo donde creas que está. Cada kilómetro de error se suma a tu puntuación. Diez rondas, de fácil a muy difícil. <strong>Gana la puntuación más baja.</strong>',
      intro2: 'Cuatro pistas por partida, cada una una sola vez: acercar al país, el nombre del lugar, la bandera o el punto exacto. Una vez por partida, tras una ronda mala, puedes limitarla a 1.000 km.',
      modeDaily: 'Partida del día', modeFree: 'Partida libre',
      modeHelp: 'Del día: hoy todos reciben los mismos diez lugares, así se comparan los totales. Libre: lugares al azar que aún no has visto.',
      dailyDone: 'La partida de hoy ya está hecha: {km} km. Vuelve mañana.',
      satellite: 'Globo satélite', political: 'Globo político',
      tiles: 'Los mapas se descargan de internet y siguen nítidos al acercar.',
      language: 'Idioma', play: 'Jugar',
      statsNone: 'Aún no hay partidas.',
      statsGames: '{n} partidas · media {avg} km · mejor {best} km',
      statsLevels: 'Mejor ronda por nivel: {list}',
      statsSeen: '{seen} de {total} fotos vistas en este dispositivo',
      round: 'Ronda {r} / {n} · nivel {d}',
      hintCountry: '🌍 País', hintName: '🏷️ Nombre', hintFlag: '🚩 Bandera', hintExact: '📍 Exacto', cap: '🛡️ Limitar esta ronda a 1.000 km',
      hintCountryT: 'Acercar el globo al país', hintNameT: 'Mostrar el nombre del lugar', hintFlagT: 'Mostrar la bandera del país', hintExactT: 'Marcar el punto exacto',
      capT: 'Una vez por partida',
      instructions: '<strong>Mantén pulsado un segundo</strong> el globo para situar tu respuesta. Arrastra para girar, pellizca o usa la rueda para acercar.',
      countryOut: 'El país está resaltado en el globo.',
      noFlag: 'No hay bandera para este. País: {c}',
      exactOut: 'El punto exacto está marcado. Mantén pulsado sobre él para terminar la ronda.',
      capped: 'limitado desde {km} km',
      totalSoFar: 'Total hasta ahora:', seeIt: '👁 Verlo', next: 'Siguiente ronda', results: 'Ver resultados',
      resultsTitle: 'Resultados', thPlace: 'Lugar', total: 'Total',
      newBest: '¡Nueva mejor puntuación!', bestIs: 'Mejor: {km} km',
      dailyOf: 'Partida del día {date}', freePlay: 'Partida libre',
      share: 'Compartir resultado', shared: 'Copiado al portapapeles.',
      again: 'Jugar otra vez', menu: 'Menú',
      whereIsThis: '¿Dónde es esto?', findIt: 'Buscarlo en el globo',
      photoAlt: '¿Dónde es esto?', photo: 'Foto:', photoTitle: 'Toca para ver la foto a pantalla completa; pellizca o usa la rueda para acercar',
      noPictures: 'Aún no hay fotos: ejecuta tools/build_candidates.py.',
      km: 'km',
    },
  };
  let lang = S.getLang();
  const t = (key, vars) => (I18N[lang][key] || I18N.en[key] || key).replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] !== undefined ? vars[k] : ''));
  const nameOf = l => (lang === 'es' && l.name_es) || l.name;
  const descOf = l => (lang === 'es' && l.desc_es) || l.desc || '';
  const fmtKm = km => Math.round(km).toLocaleString(lang === 'es' ? 'es-ES' : 'en-GB');

  function applyLanguage() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(n => { n.textContent = t(n.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach(n => { n.innerHTML = t(n.dataset.i18nHtml); });
    document.querySelectorAll('[data-i18n-title]').forEach(n => { n.title = t(n.dataset.i18nTitle); });
    el.photo.alt = t('photoAlt');
  }

  const $ = sel => document.querySelector(sel);
  const el = {
    overlay: $('#overlay'), summary: $('#summary'), play: $('#play-btn'), stats: $('#stats'),
    styleRadios: document.querySelectorAll('input[name="mapstyle"]'),
    modeRadios: document.querySelectorAll('input[name="mode"]'), dailyDone: $('#daily-done'), langSelect: $('#lang'),
    roundLabel: $('#round-label'), scoreLabel: $('#score-label'),
    photo: $('#photo'), credit: $('#credit'), photoBox: $('#photo-box'),
    hints: document.querySelectorAll('button.hint'), cap: $('#cap-btn'), hintOut: $('#hint-output'),
    result: $('#result'), resultKm: $('#result-km'), resultCap: $('#result-cap'), resultName: $('#result-name'), resultPlace: $('#result-place'),
    resultDesc: $('#result-desc'), resultTotal: $('#result-total'), see: $('#see-btn'),
    next: $('#next-btn'), instructions: $('#instructions'),
    styleButtons: document.querySelectorAll('#map-style button'),
    summaryMode: $('#summary-mode'), summaryRows: $('#summary-rows'), summaryTotal: $('#summary-total'), summaryNote: $('#summary-note'),
    share: $('#share-btn'), shareMsg: $('#share-msg'), again: $('#again-btn'), menu: $('#menu-btn'), poolNote: $('#pool-note'),
  };

  let view = null;
  let viewer = null; // full-screen photo viewer
  let game = null;   // { mode, dateKey, round, score, rounds: [], hints: {}, capUsed, current, next, guessed }

  // ---- helpers --------------------------------------------------------------
  function haversineKm(a, b) {
    const R = 6371, toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  const rnd = arr => arr[Math.floor(Math.random() * arr.length)];
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const prettyDate = key => new Date(key + 'T12:00:00').toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  /** Deterministic PRNG from a string, so every device draws the same daily game. */
  function seeded(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  }
  /** The ten places of the daily game: two per level, drawn from the pool sorted by id with the date as seed. */
  function dailyPicks(dateKey) {
    const rand = seeded('geoclick-' + dateKey);
    const picks = [];
    for (let lvl = 1; lvl <= LEVELS; lvl++) {
      const atLevel = POOL.filter(l => l.difficulty === lvl).sort((a, b) => a.id.localeCompare(b.id));
      if (!atLevel.length) continue;
      const i = Math.floor(rand() * atLevel.length);
      let j = Math.floor(rand() * Math.max(1, atLevel.length - 1));
      if (j >= i) j += 1;
      picks.push(atLevel[i], atLevel[j % atLevel.length]);
    }
    return picks;
  }

  /** Free play: random unseen picture for a difficulty; resets that level's memory when exhausted; borrows neighbours when empty. */
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
    return rnd(cands);
  }
  /** The picture for a round: the daily list or a fresh free-play pick. Either way it counts as seen on this device. */
  function pictureFor(round) {
    const pick = game.mode === 'daily' && game.daily[round - 1] ? game.daily[round - 1] : pickFor(levelFor(round));
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
    applyLanguage();
    el.langSelect.value = lang;
    const st = S.getStats();
    const best = S.getBest();
    const lines = [];
    if (!st.games) lines.push(t('statsNone'));
    else {
      lines.push(t('statsGames', { n: st.games, avg: fmtKm(st.sum / st.games), best: fmtKm(best === null ? st.sum / st.games : best) }));
      const list = Object.keys(st.bestByLevel).sort().map(l => `${l}: ${fmtKm(st.bestByLevel[l])}`).join(' · ');
      if (list) lines.push(t('statsLevels', { list }));
    }
    lines.push(t('statsSeen', { seen: S.getSeen().length, total: POOL.length }));
    el.stats.innerHTML = lines.map(x => `<div>${x}</div>`).join('');
    el.poolNote.textContent = POOL.length ? '' : t('noPictures');
    const style = S.getMapStyle();
    el.styleRadios.forEach(r => { r.checked = r.value === style; });
    const done = S.getDaily(todayKey());
    el.dailyDone.hidden = done === null;
    el.dailyDone.textContent = done === null ? '' : t('dailyDone', { km: fmtKm(done) });
    el.modeRadios.forEach(r => {
      if (r.value === 'daily') r.disabled = done !== null;
      r.checked = done === null ? r.value === 'daily' : r.value === 'free';
    });
  }

  function startGame() {
    const style = Array.from(el.styleRadios).find(r => r.checked)?.value || 'satellite';
    S.setMapStyle(style);
    view.setStyle(style);
    syncStyleButtons();
    el.overlay.hidden = true;
    el.summary.hidden = true;
    let mode = Array.from(el.modeRadios).find(r => r.checked)?.value || 'free';
    const dateKey = todayKey();
    if (mode === 'daily' && S.getDaily(dateKey) !== null) mode = 'free';
    game = { mode, dateKey, round: 0, score: 0, rounds: [], hints: {}, capUsed: false,
             current: null, next: null, guessed: false, daily: mode === 'daily' ? dailyPicks(dateKey) : [] };
    game.next = pictureFor(1);
    el.hints.forEach(b => { b.disabled = false; b.classList.remove('used'); });
    nextRound();
  }

  function nextRound() {
    game.round += 1;
    game.guessed = false;
    game.current = game.next || pictureFor(game.round);
    game.next = null;
    const cur = game.current;
    view.clearResult();
    view.setLocked(false);
    view.resetView();

    el.roundLabel.textContent = t('round', { r: game.round, n: ROUNDS, d: cur.difficulty });
    el.scoreLabel.textContent = `${fmtKm(game.score)} km`;
    el.photo.src = photoUrl(cur);
    el.photo.alt = t('photoAlt');
    el.credit.innerHTML = t('photo') + ' ' + creditHtml(cur);
    // every round starts with the picture full screen and a Continue button; afterwards the small copy in the panel reopens it
    viewer.open(photoUrl(cur), el.credit.innerHTML, { prompt: { title: t('round', { r: game.round, n: ROUNDS, d: cur.difficulty }), question: t('whereIsThis'), button: t('findIt') } });
    el.hintOut.innerHTML = '';
    el.result.hidden = true;
    el.instructions.hidden = false;
    el.hints.forEach(b => { b.disabled = !!game.hints[b.dataset.hint]; });
    el.cap.hidden = true;
  }

  function onPick(guess) {
    if (!game || game.guessed) return;
    game.guessed = true;
    if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) { /* ignore */ } }
    view.setLocked(true);
    const cur = game.current;
    const truth = { lat: cur.lat, lng: cur.lng };
    const km = haversineKm(guess, truth);
    game.score += km;
    game.rounds.push({ landmark: cur, km, rawKm: km, guess, level: cur.difficulty, capped: false });

    view.showResult(guess, truth, nameOf(cur), km);
    el.resultKm.textContent = fmtKm(km);
    el.resultCap.textContent = '';
    el.resultCap.hidden = true;
    el.cap.hidden = game.capUsed || km <= CAP_KM; // offered once per game, after a bad round
    el.resultName.textContent = nameOf(cur);
    el.resultPlace.textContent = cur.place;
    const desc = descOf(cur);
    el.resultDesc.textContent = desc;
    el.resultDesc.hidden = !desc;
    el.resultTotal.textContent = `${fmtKm(game.score)} km`;
    el.scoreLabel.textContent = `${fmtKm(game.score)} km`;
    el.result.hidden = false;
    el.instructions.hidden = true;
    el.hints.forEach(b => { b.disabled = true; });
    el.next.textContent = game.round >= ROUNDS ? t('results') : t('next');
    el.next.focus();

    if (game.round < ROUNDS) {
      game.next = pictureFor(game.round + 1);
      const pre = new Image();
      pre.src = photoUrl(game.next);
    }
  }

  function endGame() {
    view.setLocked(true);
    const total = game.score;
    const isBest = S.submitScore(total);
    S.finishGame();
    S.recordGame(game.rounds, total);
    if (game.mode === 'daily') S.setDaily(game.dateKey, total);
    el.summaryMode.textContent = game.mode === 'daily' ? t('dailyOf', { date: prettyDate(game.dateKey) }) : t('freePlay');
    el.summaryRows.innerHTML = game.rounds.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${nameOf(r.landmark)}</strong><br><small>${r.landmark.place}</small></td>
        <td class="num">${fmtKm(r.km)}${r.capped ? ' 🛡️' : ''}</td>
      </tr>`).join('');
    el.summaryTotal.textContent = `${fmtKm(total)} km`;
    const notes = [];
    if (isBest) notes.push(t('newBest'));
    const best = S.getBest();
    if (!isBest && best !== null) notes.push(t('bestIs', { km: fmtKm(best) }));
    el.summaryNote.textContent = notes.join(' ');
    el.shareMsg.textContent = '';
    el.summary.hidden = false;
  }

  /** Short text of the game for messages: mode, total and one line per round. */
  function shareText() {
    const head = game.mode === 'daily' ? t('dailyOf', { date: prettyDate(game.dateKey) }) : t('freePlay');
    const rounds = game.rounds.map((r, i) => `${i + 1}. ${fmtKm(r.km)} km${r.capped ? ' 🛡️' : ''}`).join('\n');
    return `GeoClick · ${head} · ${fmtKm(game.score)} km\n${rounds}\nhttps://jblanes.github.io/picgeo/`;
  }
  async function share() {
    const text = shareText();
    try {
      if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) { await navigator.share({ text }); return; }
    } catch (e) { /* cancelled: fall back to the clipboard */ }
    try { await navigator.clipboard.writeText(text); el.shareMsg.textContent = t('shared'); }
    catch (e) { el.shareMsg.textContent = text; }
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
      line.textContent = t('countryOut');
    } else if (kind === 'name') {
      line.innerHTML = `<strong>${cur.place || meta.name || '?'}</strong>`;
    } else if (kind === 'flag') {
      const flag = flagFor(cur);
      line.innerHTML = flag
        ? `<img class="flag" src="${flag}" alt="flag">`
        : `<em>${t('noFlag', { c: meta.name || cur.iso3 })}</em>`;
    } else if (kind === 'exact') {
      view.showTruth({ lat: cur.lat, lng: cur.lng }, nameOf(cur));
      view.flyTo(cur.lat, cur.lng, 0.35, 1200);
      line.textContent = t('exactOut');
    }
    el.hintOut.appendChild(line);
  }

  /** Once per game, after the guess: the round just played counts at most CAP_KM. */
  function useCap() {
    if (!game || !game.guessed || game.capUsed) return;
    const r = game.rounds[game.rounds.length - 1];
    if (!r || r.km <= CAP_KM) return;
    game.capUsed = true;
    game.score -= r.km - CAP_KM;
    r.km = CAP_KM;
    r.capped = true;
    el.resultKm.textContent = fmtKm(CAP_KM);
    el.resultCap.textContent = t('capped', { km: fmtKm(r.rawKm) });
    el.resultCap.hidden = false;
    el.resultTotal.textContent = `${fmtKm(game.score)} km`;
    el.scoreLabel.textContent = `${fmtKm(game.score)} km`;
    el.cap.hidden = true;
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
    el.cap.addEventListener('click', useCap);
    el.see.addEventListener('click', () => { const c = game && game.current; if (c) view.flyTo(c.lat, c.lng, 0.0015, 2200); }); // down to the place itself; the satellite tiles go to level 18
    el.share.addEventListener('click', share);
    el.langSelect.addEventListener('change', () => { lang = el.langSelect.value === 'es' ? 'es' : 'en'; S.setLang(lang); showOverlay(); });
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
    window.GeoDebug = { view: () => view, game: () => game, dailyPicks, pick: onPick }; // console helpers, also used by the test runs
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
