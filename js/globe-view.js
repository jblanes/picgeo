// Globe.gl wrapper: map styles, hold-to-pick, markers, arc, fly-to.
window.GlobeView = (function () {
  const ISO_ALIAS = { XKS: 'KOS' }; // Wikidata iso3 -> Natural Earth code
  const HOLD_MS = 1200; // José, 2026-10-30: two seconds felt long
  const MOVE_TOLERANCE = 6; // px of drift before a hold is cancelled

  function hashHue(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h % 360;
  }

  function countryFeature(iso3) {
    const code = ISO_ALIAS[iso3] || iso3;
    const feats = (window.COUNTRIES && window.COUNTRIES.features) || [];
    return feats.find(f => f.properties.iso3 === code) || null;
  }

  /** Centre + angular span of the largest ring of a (Multi)Polygon. */
  function featureExtent(feature) {
    const g = feature.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    let best = null;
    for (const poly of polys) {
      const ring = poly[0];
      let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180, sx = 0, sy = 0, sz = 0;
      for (const [lng, lat] of ring) {
        minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
        minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
        const la = lat * Math.PI / 180, lo = lng * Math.PI / 180;
        sx += Math.cos(la) * Math.cos(lo); sy += Math.cos(la) * Math.sin(lo); sz += Math.sin(la);
      }
      const span = Math.max(maxLat - minLat, Math.min(maxLng - minLng, 180));
      const approxArea = (maxLat - minLat) * Math.min(maxLng - minLng, 180);
      if (!best || approxArea > best.area) {
        const lat = Math.atan2(sz, Math.hypot(sx, sy)) * 180 / Math.PI;
        const lng = Math.atan2(sy, sx) * 180 / Math.PI;
        best = { lat, lng, span, area: approxArea };
      }
    }
    return best;
  }

  function midpoint(a, b) {
    const toV = p => {
      const la = p.lat * Math.PI / 180, lo = p.lng * Math.PI / 180;
      return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
    };
    const va = toV(a), vb = toV(b);
    const m = [va[0] + vb[0], va[1] + vb[1], va[2] + vb[2]];
    const len = Math.hypot(...m) || 1;
    return {
      lat: Math.asin(m[2] / len) * 180 / Math.PI,
      lng: Math.atan2(m[1], m[0]) * 180 / Math.PI,
    };
  }

  function create(container, ringEl, opts) {
    const onPick = opts.onPick;
    let style = 'physical';
    let highlightIso = null;
    let locked = false;

    const globe = new Globe(container, { animateIn: false, rendererConfig: { antialias: true, alpha: false } })
      .width(container.clientWidth)
      .height(container.clientHeight)
      .backgroundImageUrl('vendor/night-sky.png')
      .showAtmosphere(true)
      .atmosphereColor('#7fb2ff')
      .atmosphereAltitude(0.18)
      .polygonsTransitionDuration(0)
      .polygonSideColor(() => 'rgba(0,0,0,0.18)')
      .polygonAltitude(0.006)
      .arcsData([])
      .arcColor(() => '#ffd166')
      .arcStroke(0.55)
      .arcAltitudeAutoScale(0.35)
      .arcDashLength(0.9)
      .arcDashGap(0.15)
      .arcDashAnimateTime(1400)
      .htmlElementsData([])
      .htmlAltitude(0.004)
      .htmlElement(d => {
        const el = document.createElement('div');
        el.className = 'marker marker-' + d.type;
        el.innerHTML = '<span class="pin"></span><span class="tag">' + d.label + '</span>';
        return el;
      });

    const controls = globe.controls();
    controls.autoRotate = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 0.8;
    controls.minDistance = 100.15; // altitude 0.0015: about 10 km above the ground, close enough to see the place itself (See it)

    function applyPolygons() {
      if (style === 'political') {
        // translucent country fills over the label-free street tiles, so roads/cities stay visible when zoomed in
        globe
          .polygonsData(window.COUNTRIES.features)
          .polygonCapColor(f => f.properties.iso3 === highlightIso
            ? 'rgba(255, 224, 102, 0.55)'
            : `hsla(${hashHue(f.properties.iso3 || f.properties.name)}, 60%, 50%, 0.33)`)
          .polygonStrokeColor(f => f.properties.iso3 === highlightIso ? '#fff' : '#223')
          .polygonAltitude(f => f.properties.iso3 === highlightIso ? 0.004 : 0.002);
      } else {
        const feat = highlightIso ? countryFeature(highlightIso) : null;
        globe
          .polygonsData(feat ? [feat] : [])
          .polygonCapColor(() => 'rgba(255, 224, 102, 0.28)')
          .polygonStrokeColor(() => '#ffe066')
          .polygonAltitude(() => 0.004);
      }
    }

    // Tile sources (web-mercator XYZ, no place names on any of them).
    const TILES = {
      satellite: {
        url: (x, y, l) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${l}/${y}/${x}`,
        maxLevel: 18,
        credit: 'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      },
      // NB: Esri's "Canvas" bases print region names, which would give the answer away; the terrain base has no text.
      political: {
        url: (x, y, l) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/${l}/${y}/${x}`,
        maxLevel: 13,
        credit: 'Terrain © Esri, USGS, NOAA · borders: Natural Earth',
      },
    };
    const STYLES = ['satellite', 'political'];

    function setStyle(s) {
      style = STYLES.includes(s) ? s : 'satellite';
      const tiles = TILES[style];
      globe.globeTileEngineMaxLevel(tiles.maxLevel).globeTileEngineUrl(tiles.url);
      if (opts.creditEl) opts.creditEl.textContent = tiles.credit;
      applyPolygons();
    }

    // ---- hold-to-pick -------------------------------------------------------
    let hold = null; // {x, y, timer, pointerId}
    function ringAt(x, y) {
      ringEl.style.left = x + 'px';
      ringEl.style.top = y + 'px';
    }
    function cancelHold() {
      if (!hold) return;
      clearTimeout(hold.timer);
      hold = null;
      ringEl.classList.remove('active');
    }
    function startHold(e) {
      if (locked || e.button > 0 || !e.isPrimary) return;
      cancelHold();
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      if (!globe.toGlobeCoords(x, y)) return; // pointing at space
      hold = { x, y, pointerId: e.pointerId, timer: null };
      ringAt(x, y);
      // restart the CSS animation
      ringEl.classList.remove('active');
      void ringEl.offsetWidth;
      ringEl.classList.add('active');
      hold.timer = setTimeout(() => {
        const coords = globe.toGlobeCoords(x, y);
        cancelHold();
        if (coords && !locked) onPick({ lat: coords.lat, lng: coords.lng });
      }, HOLD_MS);
    }
    container.addEventListener('pointerdown', startHold);
    container.addEventListener('pointermove', e => {
      if (!hold || e.pointerId !== hold.pointerId) return;
      const rect = container.getBoundingClientRect();
      const dx = e.clientX - rect.left - hold.x, dy = e.clientY - rect.top - hold.y;
      if (Math.hypot(dx, dy) > MOVE_TOLERANCE) cancelHold();
    });
    ['pointerup', 'pointercancel', 'pointerleave', 'wheel'].forEach(ev => container.addEventListener(ev, cancelHold));
    container.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('blur', cancelHold);

    // ---- resize ---------------------------------------------------------------
    const ro = new ResizeObserver(() => {
      globe.width(container.clientWidth).height(container.clientHeight);
    });
    ro.observe(container);

    setStyle(opts.style || 'satellite');

    return {
      globe,
      STYLES,
      setStyle,
      getStyle: () => style,
      setLocked(v) { locked = v; if (v) cancelHold(); },
      flyTo(lat, lng, altitude, ms) { globe.pointOfView({ lat, lng, altitude }, ms == null ? 1000 : ms); },
      /** Zoom to a country; falls back to a regional view around (lat,lng) when the border set lacks it. */
      flyToCountry(iso3, fallback) {
        highlightIso = ISO_ALIAS[iso3] || iso3;
        applyPolygons();
        const feat = countryFeature(iso3);
        if (feat) {
          const ext = featureExtent(feat);
          const alt = Math.min(2.5, Math.max(0.25, ext.span * 0.03 + 0.15));
          globe.pointOfView({ lat: ext.lat, lng: ext.lng, altitude: alt }, 1200);
          return true;
        }
        if (fallback) globe.pointOfView({ lat: fallback.lat, lng: fallback.lng, altitude: 0.6 }, 1200);
        return false;
      },
      clearHighlight() { highlightIso = null; applyPolygons(); },
      showTruth(truth, label) {
        globe.htmlElementsData([{ ...truth, type: 'truth', label }]);
      },
      showResult(guess, truth, label, km) {
        globe.htmlElementsData([
          { ...guess, type: 'guess', label: 'Your guess' },
          { ...truth, type: 'truth', label },
        ]);
        globe.arcsData([{ startLat: guess.lat, startLng: guess.lng, endLat: truth.lat, endLng: truth.lng, km }]);
        const mid = midpoint(guess, truth);
        const alt = Math.min(2.5, Math.max(0.3, km / 8000 * 2.5 + 0.2));
        globe.pointOfView({ lat: mid.lat, lng: mid.lng, altitude: alt }, 1200);
      },
      clearResult() {
        globe.htmlElementsData([]).arcsData([]);
        highlightIso = null;
        applyPolygons();
      },
      resetView() { globe.pointOfView({ lat: 20, lng: 10, altitude: 2.5 }, 1000); },
    };
  }

  return { create };
})();
