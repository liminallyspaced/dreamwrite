/**
 * Platen chrome: expandable rails, focus modes, radial wheel (MMB), typing sounds
 */
(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const state = {
    topExpanded: true,
    leftExpanded: true,
    focus: 'desk', // desk | paper | typewriter
    sound: true,
    radialOpen: false,
    radialTimer: null,
    radialIndex: 0,
    mmbHeld: false,
  };

  const RADIAL_ITEMS = [
    { id: 'scene', label: 'Scene', action: 'element', value: 'scene' },
    { id: 'action', label: 'Action', action: 'element', value: 'action' },
    { id: 'character', label: 'Char', action: 'element', value: 'character' },
    { id: 'dialogue', label: 'Dial', action: 'element', value: 'dialogue' },
    { id: 'parens', label: '( )', action: 'element', value: 'parenthetical' },
    { id: 'trans', label: 'Trans', action: 'element', value: 'transition' },
    { id: 'int', label: 'INT.', action: 'snip', value: 'INT. ' },
    { id: 'ext', label: 'EXT.', action: 'snip', value: 'EXT. ' },
    { id: 'day', label: 'DAY', action: 'snip', value: ' - DAY' },
    { id: 'night', label: 'NIGHT', action: 'snip', value: ' - NIGHT' },
    { id: 'cut', label: 'CUT TO', action: 'line', value: 'CUT TO:', type: 'transition' },
    { id: 'paper', label: 'Paper', action: 'focus', value: 'paper' },
    { id: 'type', label: 'Type', action: 'focus', value: 'typewriter' },
    { id: 'desk', label: 'Desk', action: 'focus', value: 'desk' },
  ];

  // --- Sounds ---
  const audioCache = {};
  function soundUrl(name) {
    return `../assets/sounds/${name}`;
  }
  function playSound(name, volume = 0.35) {
    if (!state.sound) return;
    try {
      const key = name;
      let a = audioCache[key];
      if (!a) {
        a = new Audio(soundUrl(name));
        audioCache[key] = a;
      }
      const clone = a.cloneNode();
      clone.volume = Math.min(1, volume);
      clone.play().catch(() => {});
    } catch {
      /* ignore */
    }
  }

  function playKey(e) {
    if (!state.sound) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') {
      playSound('enter.wav', 0.4);
      return;
    }
    if (e.key === ' ') {
      playSound('space.wav', 0.22);
      return;
    }
    if (e.key.length === 1) {
      const n = 1 + Math.floor(Math.random() * 5);
      playSound(`key${n}.wav`, 0.22 + Math.random() * 0.12);
    }
  }

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
    const next = ['desk', 'paper', 'typewriter'].includes(mode) ? mode : 'desk';
    if (next === state.focus && !silent) return;
    state.focus = next;
    app.classList.remove('focus-desk', 'focus-paper', 'focus-typewriter');
    app.classList.add(`focus-${next}`);
    document.querySelectorAll('.mode-pill').forEach((b) => {
      b.classList.toggle('active', b.dataset.focus === next);
    });
    const stage = document.getElementById('typewriterStage');
    if (stage) stage.setAttribute('aria-hidden', next === 'typewriter' ? 'false' : 'true');

    // In paper/typewriter, collapse chrome for immersion (keep slim bar)
    if (next === 'paper' || next === 'typewriter') {
      state.topExpanded = false;
      state.leftExpanded = false;
      applyRails();
    } else if (next === 'desk') {
      state.topExpanded = true;
      state.leftExpanded = true;
      applyRails();
    }
    if (!silent) playSound('mode.wav', 0.28);
    // After layout settles, keep writing area usable
    requestAnimationFrame(() => {
      const scroll = document.getElementById('editorScroll');
      if (scroll && next === 'typewriter') {
        // show lower page near platen (where typing feels "in the machine")
        scroll.scrollTop = Math.max(0, scroll.scrollHeight * 0.15);
      }
    });
    window.dispatchEvent(new CustomEvent('platen:focus', { detail: { mode: next } }));
  }

  function cycleFocus() {
    const order = ['desk', 'paper', 'typewriter'];
    const i = order.indexOf(state.focus);
    setFocusMode(order[(i + 1) % order.length]);
  }

  // --- Radial ---
  function buildRadial() {
    const ring = document.getElementById('radialRing');
    if (!ring) return;
    ring.innerHTML = '';
    const n = RADIAL_ITEMS.length;
    const R = 118;
    RADIAL_ITEMS.forEach((item, i) => {
      const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(ang) * R;
      const y = Math.sin(ang) * R;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'radial-item';
      btn.dataset.index = String(i);
      btn.style.transform = `translate(${x}px, ${y}px)`;
      btn.innerHTML = `<span>${item.label}</span>`;
      btn.addEventListener('pointerup', (e) => {
        e.preventDefault();
        e.stopPropagation();
        activateRadial(i);
        closeRadial();
      });
      btn.addEventListener('pointerenter', () => highlightRadial(i));
      ring.appendChild(btn);
    });
  }

  function highlightRadial(i) {
    state.radialIndex = i;
    document.querySelectorAll('.radial-item').forEach((el, idx) => {
      el.classList.toggle('hot', idx === i);
    });
    const center = document.getElementById('radialCenter');
    if (center && RADIAL_ITEMS[i]) center.textContent = RADIAL_ITEMS[i].label;
  }

  function openRadial(clientX, clientY) {
    const radial = document.getElementById('radial');
    if (!radial) return;
    state.radialOpen = true;
    radial.classList.add('open');
    radial.setAttribute('aria-hidden', 'false');
    radial.style.left = `${clientX}px`;
    radial.style.top = `${clientY}px`;
    highlightRadial(0);
    playSound('radial.wav', 0.3);
  }

  function closeRadial() {
    const radial = document.getElementById('radial');
    if (!radial) return;
    state.radialOpen = false;
    radial.classList.remove('open');
    radial.setAttribute('aria-hidden', 'true');
  }

  function activateRadial(i) {
    const item = RADIAL_ITEMS[i];
    if (!item) return;
    const api = window.PlatenUI;
    if (item.action === 'element' && api?.applyElement) api.applyElement(item.value);
    else if (item.action === 'snip' && api?.insertSnippet) api.insertSnippet(item.value, { forceScene: /INT\.|EXT\./.test(item.value) });
    else if (item.action === 'line' && api?.insertLine) api.insertLine(item.value, item.type || 'transition');
    else if (item.action === 'focus') setFocusMode(item.value);
  }

  // --- Wire ---
  function init() {
    buildRadial();
    applyRails();
    setFocusMode('desk', { silent: true });

    document.getElementById('btnToggleTop')?.addEventListener('click', () => {
      state.topExpanded = !state.topExpanded;
      applyRails();
      playSound('radial.wav', 0.15);
    });
    document.getElementById('btnToggleLeft')?.addEventListener('click', () => {
      state.leftExpanded = !state.leftExpanded;
      applyRails();
      playSound('radial.wav', 0.15);
    });

    document.querySelectorAll('.mode-pill').forEach((btn) => {
      btn.addEventListener('click', () => setFocusMode(btn.dataset.focus));
    });

    const soundBtn = document.getElementById('btnSound');
    if (soundBtn) {
      soundBtn.classList.toggle('active', state.sound);
      soundBtn.addEventListener('click', () => {
        state.sound = !state.sound;
        soundBtn.classList.toggle('active', state.sound);
        soundBtn.textContent = state.sound ? 'Sound' : 'Muted';
        if (state.sound) playSound('key3.wav', 0.3);
      });
    }

    // Typing sounds on editor
    document.addEventListener(
      'keydown',
      (e) => {
        const t = e.target;
        if (t && t.classList && t.classList.contains('block')) playKey(e);
        if (e.key === 'F11') {
          e.preventDefault();
          cycleFocus();
        }
      },
      true
    );

    // Middle mouse radial
    let holdTimer = null;
    document.addEventListener('pointerdown', (e) => {
      if (e.button !== 1) return; // middle
      e.preventDefault();
      state.mmbHeld = true;
      const x = e.clientX;
      const y = e.clientY;
      holdTimer = setTimeout(() => {
        if (state.mmbHeld) openRadial(x, y);
      }, 140);
    });
    document.addEventListener('pointerup', (e) => {
      if (e.button === 1 || state.mmbHeld) {
        state.mmbHeld = false;
        clearTimeout(holdTimer);
        // keep radial open until click outside or select
      }
    });
    document.addEventListener('pointermove', (e) => {
      if (!state.radialOpen) return;
      const radial = document.getElementById('radial');
      if (!radial) return;
      const rect = radial.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < 36) return;
      let ang = Math.atan2(dy, dx) + Math.PI / 2;
      if (ang < 0) ang += Math.PI * 2;
      const n = RADIAL_ITEMS.length;
      const idx = Math.round((ang / (Math.PI * 2)) * n) % n;
      highlightRadial(idx);
    });
    document.addEventListener('auxclick', (e) => {
      if (e.button === 1) e.preventDefault(); // stop auto-scroll
    });
    document.addEventListener('click', (e) => {
      if (!state.radialOpen) return;
      const radial = document.getElementById('radial');
      if (radial && !radial.contains(e.target)) {
        // if hot item, activate
        if (state.radialIndex >= 0) activateRadial(state.radialIndex);
        closeRadial();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.radialOpen) {
        closeRadial();
        e.preventDefault();
      }
    });

    // Expose for app.js
    window.PlatenChrome = {
      setFocusMode,
      cycleFocus,
      playSound,
      isSoundOn: () => state.sound,
      getFocus: () => state.focus,
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
