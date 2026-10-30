// localStorage wrapper. Every read is guarded: a blocked store just means no memory.
window.GeoStorage = (function () {
  const KEYS = {
    seen: 'geoclick.seen',       // ids already shown to this player
    plays: 'geoclick.plays',     // games finished on this device
    best: 'geoclick.best',       // lowest total km
    mapStyle: 'geoclick.mapStyle',
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
  };
})();
