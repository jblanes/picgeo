// localStorage wrapper. Every read is guarded: a blocked store just means no memory.
window.GeoStorage = (function () {
  const KEYS = {
    seen: 'geoclick.seen',       // ids already shown to this player
    plays: 'geoclick.plays',     // games finished on this device
    best: 'geoclick.best',       // lowest total km
    mapStyle: 'geoclick.mapStyle',
    lang: 'geoclick.lang',       // 'en' | 'es'
    stats: 'geoclick.stats',     // { games, sum, bestByLevel: {1..5: km} }
    daily: 'geoclick.daily2',    // { 'YYYY-MM-DD': total km }; '2' = the daily series that started 2026-10-31 (earlier plays do not count)
  };
  // José's rule (2026-10-30): on one device a picture is never shown again until its whole level has been seen,
  // however many games are played or how often the browser is closed. Only pickFor() in game.js clears a level.

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }

  return {
    getSeen() { const s = read(KEYS.seen, []); return Array.isArray(s) ? s : []; },
    setSeen(ids) { write(KEYS.seen, ids); },
    addSeen(id) { const s = this.getSeen(); if (!s.includes(id)) { s.push(id); this.setSeen(s); } },
    getPlays() { return Number(read(KEYS.plays, 0)) || 0; },
    /** Count a finished game. The seen list is never wiped here. */
    finishGame() { write(KEYS.plays, this.getPlays() + 1); },
    getBest() { const b = read(KEYS.best, null); return typeof b === 'number' ? b : null; },
    /** Returns true when `total` is a new best. */
    submitScore(total) {
      const best = this.getBest();
      if (best === null || total < best) { write(KEYS.best, total); return true; }
      return false;
    },
    getMapStyle() {
      const s = read(KEYS.mapStyle, 'satellite');
      return s === 'political' ? 'political' : 'satellite';
    },
    setMapStyle(s) { write(KEYS.mapStyle, s); },

    getLang() {
      const l = read(KEYS.lang, null);
      if (l === 'en' || l === 'es') return l;
      return (navigator.language || '').toLowerCase().startsWith('es') ? 'es' : 'en';
    },
    setLang(l) { write(KEYS.lang, l); },

    /** Lifetime statistics: games, sum of totals, best (lowest) round per level. */
    getStats() {
      const s = read(KEYS.stats, null);
      return s && typeof s === 'object' ? { games: s.games || 0, sum: s.sum || 0, bestByLevel: s.bestByLevel || {} } : { games: 0, sum: 0, bestByLevel: {} };
    },
    recordGame(rounds, total) {
      const s = this.getStats();
      s.games += 1;
      s.sum += total;
      rounds.forEach(r => {
        const lvl = r.level;
        if (s.bestByLevel[lvl] === undefined || r.km < s.bestByLevel[lvl]) s.bestByLevel[lvl] = Math.round(r.km);
      });
      write(KEYS.stats, s);
    },

    /** Daily game: one result per local date. */
    getDaily(dateKey) { const d = read(KEYS.daily, {}); return d && typeof d[dateKey] === 'number' ? d[dateKey] : null; },
    setDaily(dateKey, total) { const d = read(KEYS.daily, {}) || {}; d[dateKey] = total; write(KEYS.daily, d); },
  };
})();
