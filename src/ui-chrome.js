/**
 * DreamWrite chrome: expandable rails, focus modes, radial marking menu (MMB).
 * Radial rings: views/chrome/radial-rings.js (ADR-0005 / Phase 2).
 * No typing / UI sound effects (removed by product choice).
 */
import {
  activeRingItems,
  angleToIndex,
  markIndexFromVector,
  ringRadiusForCount,
  RADIAL_DEAD_ZONE_PX,
  MARK_MIN_PX,
  PAN_SLOP_PX,
  RADIAL_HOLD_MS,
} from './views/chrome/radial-rings.js';

(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const state = {
    topExpanded: true,
    leftExpanded: true,
    focus: 'desk', // desk | paper
    radialOpen: false,
    /** -1 = dead-zone / no selection — never default to Scene (Crack 4) */
    radialIndex: -1,
    /** Current ring items (root or submenu) */
    radialItems: [],
    /** null | submenu key e.g. 'timeOfDay' */
    submenuKey: null,
    mmbHeld: false,
    mmbOrigin: null,
    mmbPanning: false,
    holdTimer: null,
  };

  // --- Rails ---
  function applyRails() {
    app.classList.toggle('top-expanded', state.topExpanded);
    app.classList.toggle('top-collapsed', !state.topExpanded);
    app.classList.toggle('left-expanded', state.leftExpanded);
    app.classList.toggle('left-collapsed', !state.leftExpanded);
    const topBtn = document.getElementById('btnToggleTop');
    const leftBtn = document.getElementById('btnToggleLeft');
    if (topBtn) topBtn.textContent = state.topExpanded ? '▴' : '▾';
    if (leftBtn) leftBtn.textContent = state.leftExpanded ? '‹' : '›';
  }

  function setFocusMode(mode, { silent = false } = {}) {
    // typewriter focus removed — map legacy value to desk
    const raw = mode === 'typewriter' ? 'desk' : mode;
    const next = ['desk', 'paper'].includes(raw) ? raw : 'desk';
    if (next === state.focus && !silent) return;
    state.focus = next;
    app.classList.remove('focus-desk', 'focus-paper', 'focus-typewriter');
    app.classList.add(`focus-${next}`);
    document.querySelectorAll('.mode-pill').forEach((b) => {
      b.classList.toggle('active', b.dataset.focus === next);
    });

    if (next === 'paper') {
      state.topExpanded = false;
      state.leftExpanded = false;
      applyRails();
    } else if (next === 'desk') {
      state.topExpanded = true;
      state.leftExpanded = true;
      applyRails();
    }
    window.dispatchEvent(new CustomEvent('platen:focus', { detail: { mode: next } }));
  }

  function cycleFocus() {
    const order = ['desk', 'paper'];
    const i = order.indexOf(state.focus);
    setFocusMode(order[(i + 1) % order.length]);
  }

  // --- Radial marking menu ---

  function radialContext() {
    return (
      window.PlatenUI?.getRadialContext?.() || {
        view: 'script',
        elementType: 'action',
      }
    );
  }

  function loadRingItems() {
    state.radialItems = activeRingItems(radialContext(), state.submenuKey);
    return state.radialItems;
  }

  function buildRadial() {
    const ring = document.getElementById('radialRing');
    if (!ring) return;
    const items = loadRingItems();
    ring.innerHTML = '';
    const n = items.length;
    // Wider orbit when fuller — avoids 8 wedges stuck on top of each other
    const R = ringRadiusForCount(n);
    items.forEach((item, i) => {
      const ang = n ? (i / n) * Math.PI * 2 - Math.PI / 2 : 0;
      const x = Math.cos(ang) * R;
      const y = Math.sin(ang) * R;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'radial-item';
      btn.dataset.index = String(i);
      btn.dataset.id = item.id;
      btn.style.transform = `translate(${x}px, ${y}px)`;
      btn.innerHTML = `<span>${item.label}</span>`;
      btn.addEventListener('pointerup', (e) => {
        e.preventDefault();
        e.stopPropagation();
        activateRadialItem(item);
        // Submenus keep the wheel open; everything else closes
        if (item.action !== 'submenu' && item.action !== 'submenu-back') {
          closeRadial({ apply: false });
        }
      });
      btn.addEventListener('pointerenter', () => highlightRadial(i));
      ring.appendChild(btn);
    });
  }

  function clearRadialHighlight() {
    state.radialIndex = -1;
    document.querySelectorAll('.radial-item').forEach((el) => {
      el.classList.remove('hot');
    });
    const center = document.getElementById('radialCenter');
    if (center) {
      center.textContent = state.submenuKey ? '◂' : '·';
    }
  }

  function highlightRadial(i) {
    const items = state.radialItems;
    if (i < 0 || i >= items.length) {
      clearRadialHighlight();
      return;
    }
    state.radialIndex = i;
    document.querySelectorAll('.radial-item').forEach((el, idx) => {
      el.classList.toggle('hot', idx === i);
    });
    const center = document.getElementById('radialCenter');
    if (center && items[i]) center.textContent = items[i].label;
  }

  function openRadial(clientX, clientY) {
    const radial = document.getElementById('radial');
    if (!radial) return;
    state.submenuKey = null;
    buildRadial();
    state.radialOpen = true;
    radial.classList.add('open');
    radial.setAttribute('aria-hidden', 'false');
    radial.style.left = `${clientX}px`;
    radial.style.top = `${clientY}px`;
    clearRadialHighlight();
  }

  function openSubmenu(key) {
    state.submenuKey = key;
    buildRadial();
    clearRadialHighlight();
  }

  function closeRadial({ apply = false } = {}) {
    const radial = document.getElementById('radial');
    if (!radial) return;
    if (apply && state.radialIndex >= 0) {
      const item = state.radialItems[state.radialIndex];
      if (item) activateRadialItem(item);
    }
    state.radialOpen = false;
    state.submenuKey = null;
    radial.classList.remove('open');
    radial.setAttribute('aria-hidden', 'true');
    clearRadialHighlight();
  }

  function activateRadialItem(item) {
    if (!item) return;
    if (item.action === 'submenu' && item.value) {
      openSubmenu(item.value);
      return;
    }
    if (item.action === 'submenu-back') {
      state.submenuKey = null;
      buildRadial();
      clearRadialHighlight();
      return;
    }
    if (item.action === 'noop') return;

    const api = window.PlatenUI;
    if (item.action === 'element' && api?.applyElement) {
      api.applyElement(item.value);
    } else if (item.action === 'snip' && api?.insertSnippet) {
      api.insertSnippet(item.value, {
        forceScene: !!item.forceScene || /INT\.|EXT\./.test(item.value || ''),
      });
    } else if (item.action === 'line' && api?.insertLine) {
      api.insertLine(item.value, item.type || 'transition');
    } else if (item.action === 'focus') {
      setFocusMode(item.value);
    } else if (item.action === 'view' && api?.setView) {
      api.setView(item.value);
    } else if (item.action === 'board' && api?.boardAction) {
      api.boardAction(item.value);
    } else if (item.action === 'timeline' && api?.timelineAction) {
      api.timelineAction(item.value);
    }
  }

  /** Expert mark: flick without drawing the wheel */
  function tryExpertMark(clientX, clientY) {
    if (!state.mmbOrigin) return false;
    const dx = clientX - state.mmbOrigin.x;
    const dy = clientY - state.mmbOrigin.y;
    const items = activeRingItems(radialContext(), null);
    const idx = markIndexFromVector(dx, dy, items.length, MARK_MIN_PX);
    if (idx < 0) return false;
    const item = items[idx];
    if (!item || item.action === 'submenu' || item.action === 'submenu-back') {
      // Expert marks skip submenu entries (ambiguous without UI)
      return false;
    }
    activateRadialItem(item);
    return true;
  }

  function updateHint() {
    const hint = document.getElementById('ribbonHint');
    if (hint) {
      hint.textContent = 'MMB: hold for wheel · flick to mark · drag to pan';
    }
    const mmb = document.getElementById('mmbHint');
    if (mmb) mmb.textContent = 'MMB · mark / wheel / pan';
  }

  // --- Wire ---
  function init() {
    applyRails();
    setFocusMode('desk', { silent: true });
    updateHint();

    document.getElementById('btnToggleTop')?.addEventListener('click', () => {
      state.topExpanded = !state.topExpanded;
      applyRails();
    });
    document.getElementById('btnToggleLeft')?.addEventListener('click', () => {
      state.leftExpanded = !state.leftExpanded;
      applyRails();
    });

    document.querySelectorAll('.mode-pill').forEach((btn) => {
      btn.addEventListener('click', () => setFocusMode(btn.dataset.focus));
    });

    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'F11') {
          e.preventDefault();
          cycleFocus();
        }
      },
      true
    );

    // MMB: mark (flick) · wheel (hold) · pan (drag) — ADR-0005
    document.addEventListener('pointerdown', (e) => {
      if (e.button !== 1) return;
      e.preventDefault();
      state.mmbHeld = true;
      state.mmbPanning = false;
      state.mmbOrigin = { x: e.clientX, y: e.clientY };
      const ox = e.clientX;
      const oy = e.clientY;
      clearTimeout(state.holdTimer);
      state.holdTimer = setTimeout(() => {
        if (state.mmbHeld && !state.mmbPanning) openRadial(ox, oy);
      }, RADIAL_HOLD_MS);
    });

    document.addEventListener('pointerup', (e) => {
      if (e.button !== 1 && !state.mmbHeld) return;
      const wasHeld = state.mmbHeld;
      const wasPanning = state.mmbPanning;
      const origin = state.mmbOrigin;
      const radialWasOpen = state.radialOpen;
      state.mmbHeld = false;
      clearTimeout(state.holdTimer);

      if (radialWasOpen) {
        // Release-to-select: apply only if aimed outside dead-zone
        closeRadial({ apply: state.radialIndex >= 0 });
      } else if (wasHeld && !wasPanning && origin) {
        // Expert mark: released before hold timer, long enough flick
        tryExpertMark(e.clientX, e.clientY);
      }

      state.mmbOrigin = null;
      state.mmbPanning = false;
    });

    document.addEventListener('pointermove', (e) => {
      if (state.mmbHeld && !state.radialOpen && state.mmbOrigin && !state.mmbPanning) {
        const dx0 = e.clientX - state.mmbOrigin.x;
        const dy0 = e.clientY - state.mmbOrigin.y;
        if (Math.hypot(dx0, dy0) > PAN_SLOP_PX) {
          state.mmbPanning = true;
          clearTimeout(state.holdTimer);
        }
      }
      if (!state.radialOpen) return;
      const radial = document.getElementById('radial');
      if (!radial) return;
      const rect = radial.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < RADIAL_DEAD_ZONE_PX) {
        clearRadialHighlight();
        return;
      }
      const n = state.radialItems.length;
      highlightRadial(angleToIndex(dx, dy, n));
    });

    document.addEventListener('auxclick', (e) => {
      if (e.button === 1) e.preventDefault();
    });

    document.addEventListener('click', (e) => {
      if (!state.radialOpen) return;
      const radial = document.getElementById('radial');
      if (radial && !radial.contains(e.target)) {
        closeRadial({ apply: false });
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.radialOpen) {
        if (state.submenuKey) {
          state.submenuKey = null;
          buildRadial();
          clearRadialHighlight();
        } else {
          closeRadial({ apply: false });
        }
        e.preventDefault();
      }
    });

    window.PlatenChrome = {
      setFocusMode,
      cycleFocus,
      getFocus: () => state.focus,
      rebuildRadial: () => {
        if (state.radialOpen) buildRadial();
      },
      expandChrome: () => {
        state.topExpanded = true;
        state.leftExpanded = true;
        applyRails();
        setFocusMode('desk', { silent: true });
      },
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
