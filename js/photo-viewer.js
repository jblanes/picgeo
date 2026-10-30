// Full-screen photo viewer: pinch to zoom on touch, wheel to zoom with a mouse, drag to pan,
// double-tap / double-click to toggle 2.5x, tap the backdrop, the × or Esc to close.
(function () {
  const MIN = 1, MAX = 8, DOUBLE_TAP_MS = 300;

  function create() {
    const root = document.createElement('div');
    root.id = 'viewer';
    root.hidden = true;
    root.innerHTML = `
      <img id="viewer-img" alt="">
      <button id="viewer-close" aria-label="Close">×</button>
      <div id="viewer-caption"></div>`;
    document.body.appendChild(root);
    const img = root.querySelector('#viewer-img');
    const caption = root.querySelector('#viewer-caption');
    const closeBtn = root.querySelector('#viewer-close');

    let scale = 1, tx = 0, ty = 0;
    const pointers = new Map(); // pointerId -> {x, y}
    let pinch = null;           // {dist, scale, mid, tx, ty} at the start of a two-finger gesture
    let drag = null;            // {x, y, tx, ty, moved} for one-finger / mouse panning
    let lastTap = 0;

    const apply = () => { img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; };
    const reset = () => { scale = 1; tx = 0; ty = 0; apply(); };
    const centre = () => { const r = root.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

    /** Zoom so that the image point under (px, py) (viewport coords) stays put. */
    function zoomAt(px, py, next) {
      next = Math.min(MAX, Math.max(MIN, next));
      const c = centre();
      const x = px - c.x, y = py - c.y; // relative to the image's centre (its transform origin)
      const k = next / scale;
      tx = x + (tx - x) * k;
      ty = y + (ty - y) * k;
      scale = next;
      if (scale === 1) { tx = 0; ty = 0; }
      apply();
    }

    function open(src, captionHtml) {
      img.src = src;
      caption.innerHTML = captionHtml || '';
      reset();
      root.hidden = false;
      document.body.classList.add('viewer-open');
    }
    function close() {
      root.hidden = true;
      document.body.classList.remove('viewer-open');
      pointers.clear(); pinch = null; drag = null;
    }

    root.addEventListener('pointerdown', e => {
      if (e.target === closeBtn) return;
      e.preventDefault();
      root.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, tx, ty };
        drag = null;
      } else if (pointers.size === 1) {
        drag = { x: e.clientX, y: e.clientY, tx, ty, moved: false };
      }
    });
    root.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        // scale about the initial midpoint, then follow the fingers as they move
        scale = pinch.scale; tx = pinch.tx; ty = pinch.ty;
        zoomAt(pinch.mid.x, pinch.mid.y, pinch.scale * dist / pinch.dist);
        tx += mid.x - pinch.mid.x; ty += mid.y - pinch.mid.y;
        apply();
      } else if (drag && pointers.size === 1) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.hypot(dx, dy) > 4) drag.moved = true;
        if (scale > 1) { tx = drag.tx + dx; ty = drag.ty + dy; apply(); }
      }
    });
    function endPointer(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 1) { // a finger lifted mid-pinch: continue as a pan with the other one
        const [p] = [...pointers.values()];
        drag = { x: p.x, y: p.y, tx, ty, moved: true };
      }
      if (pointers.size === 0 && drag) {
        const tapped = !drag.moved && e.type === 'pointerup';
        drag = null;
        if (tapped) {
          const now = Date.now();
          if (now - lastTap < DOUBLE_TAP_MS) { // double tap: toggle zoom at the point
            lastTap = 0;
            zoomAt(e.clientX, e.clientY, scale > 1 ? 1 : 2.5);
          } else {
            lastTap = now;
            if (e.target !== img) setTimeout(() => { if (lastTap === now) close(); }, DOUBLE_TAP_MS); // backdrop tap closes
          }
        }
      }
    }
    root.addEventListener('pointerup', endPointer);
    root.addEventListener('pointercancel', endPointer);
    root.addEventListener('wheel', e => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2));
    }, { passive: false });
    img.addEventListener('dragstart', e => e.preventDefault());
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !root.hidden) close(); });

    return { open, close, isOpen: () => !root.hidden };
  }

  window.PhotoViewer = { create };
})();
