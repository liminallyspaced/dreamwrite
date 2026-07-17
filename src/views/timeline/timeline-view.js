/**
 * Timeline surface — ink axis, instant pills (up), span bars (down).
 * Phase 9: span authoring (+Period, drag-create, end handles, colors).
 */
import { createCamera, worldToScreenX, screenToWorldX, zoomAt, panBy, fitX } from '../../core/geom/camera.js';
import { packLanes, estimateLabelWidth } from '../../core/geom/pack.js';
import { formatTick, axisTicks } from '../../core/timeline/calendar.js';
import { ensureProjectTimeline, createItem } from '../../core/timeline/model.js';
import {
  moveSpan,
  resizeSpanEnd,
  spanFromDrag,
  TIMELINE_COLORS,
} from '../../core/timeline/spans.js';

/**
 * @param {HTMLElement} root
 * @param {{
 *   getProject: () => object,
 *   exec: (type: string, payload: object, opts?: object) => object,
 *   onJumpToScene: (blockId: string) => void,
 * }} api
 */
export function mountTimelineView(root, api) {
  // Singleton: remount must return the same controller (not a broken closure).
  if (root && root.__platenTimeline) {
    root.__platenTimeline.setApi(api);
    return root.__platenTimeline;
  }
  if (!root) return { render() {}, destroy() {}, setApi() {} };

  root.innerHTML = `
    <div class="tl-toolbar">
      <strong class="section-kicker">Timeline</strong>
      <span class="muted tl-sub">Ticks are absolute · calendar is labels only</span>
      <div class="tl-spacer"></div>
      <button type="button" class="ghost" data-tl="sync" title="Create events from scene headings">Sync scenes</button>
      <button type="button" class="ghost" data-tl="demo" title="Seed BBY/ABY demo eras">Demo eras</button>
      <button type="button" class="primary-soft" data-tl="add">+ Event</button>
      <button type="button" class="ghost" data-tl="period" title="Add a span / era (or drag on the axis)">+ Period</button>
      <button type="button" class="ghost" data-tl="fit">Fit</button>
    </div>
    <div class="tl-stage" tabindex="0" role="application" aria-label="Story timeline">
      <canvas class="tl-axis" aria-hidden="true"></canvas>
      <div class="tl-layer tl-spans"></div>
      <div class="tl-layer tl-instants"></div>
      <div class="tl-rubber" hidden aria-hidden="true"></div>
      <div class="tl-empty" hidden>
        <p><strong>No events yet</strong></p>
        <p class="muted">Sync scenes · + Event · + Period · drag on axis for a span · Demo eras (BBY/ABY).</p>
      </div>
    </div>
    <div class="tl-detail" hidden>
      <div class="tl-detail-inner">
        <header class="tl-detail-head">
          <input class="tl-detail-title" aria-label="Event title" />
          <span class="tl-detail-date"></span>
          <button type="button" class="ghost" data-tl="goto">Open scene</button>
          <button type="button" class="ghost danger-del" data-tl="del">Delete</button>
          <button type="button" class="ghost" data-tl="close" aria-label="Close">✕</button>
        </header>
        <div class="tl-detail-meta">
          <label class="tl-meta-field">
            <span>Kind</span>
            <select class="tl-detail-kind" aria-label="Event kind">
              <option value="instant">Event (instant)</option>
              <option value="span">Period (span)</option>
            </select>
          </label>
          <label class="tl-meta-field">
            <span>Lane</span>
            <input type="number" class="tl-detail-lane" min="0" max="24" step="1" placeholder="auto" aria-label="Lane" />
          </label>
          <div class="tl-color-strip" aria-label="Color">
            ${TIMELINE_COLORS.map(
              (c) =>
                `<button type="button" class="tl-color-swatch" data-color="${c.value}" title="${c.label}" style="background:${c.value}"></button>`
            ).join('')}
          </div>
        </div>
        <textarea class="tl-detail-body" rows="3" placeholder="Description"></textarea>
      </div>
    </div>
  `;

  const stage = root.querySelector('.tl-stage');
  const canvas = root.querySelector('.tl-axis');
  const spanLayer = root.querySelector('.tl-spans');
  const instantLayer = root.querySelector('.tl-instants');
  const rubber = root.querySelector('.tl-rubber');
  const detail = root.querySelector('.tl-detail');
  const emptyEl = root.querySelector('.tl-empty');
  let cam = createCamera({ scale: 0.15, lockY: true, minScale: 0.02, maxScale: 8, panX: 80 });
  let selectedId = null;
  /**
   * @type {null | {
   *   id: string,
   *   mode: 'instant'|'span-move'|'span-start'|'span-end',
   *   startX: number,
   *   t0: number,
   *   t1?: number,
   * }}
   */
  let dragging = null;
  /** @type {null | { startX: number, t0: number }} */
  let spanDraw = null;
  let apiRef = api;

  function setApi(next) {
    apiRef = next;
  }

  function project() {
    return ensureProjectTimeline(apiRef.getProject());
  }

  function timeline() {
    return project().timeline;
  }

  function render() {
    const tl = timeline();
    const cal = tl.calendar;
    const items = tl.items || [];
    if (emptyEl) emptyEl.hidden = items.length > 0;
    const rect = stage.getBoundingClientRect();
    const w = Math.max(320, rect.width);
    const h = Math.max(280, rect.height);
    canvas.width = w * devicePixelRatio;
    canvas.height = h * devicePixelRatio;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const axisY = Math.round(h * 0.55);
    const tMin = screenToWorldX(cam, 0);
    const tMax = screenToWorldX(cam, w);

    // Axis line
    ctx.strokeStyle = 'rgba(40,35,30,0.55)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(0, axisY);
    ctx.lineTo(w, axisY);
    ctx.stroke();

    const ticks = axisTicks(tMin, tMax, cal, 14);
    ctx.fillStyle = 'rgba(40,35,30,0.7)';
    ctx.font = '11px "Courier Prime", Courier, monospace';
    ctx.textAlign = 'center';
    for (const tick of ticks) {
      const x = worldToScreenX(cam, tick.t);
      if (x < -20 || x > w + 20) continue;
      ctx.beginPath();
      ctx.moveTo(x, axisY - 5);
      ctx.lineTo(x, axisY + 5);
      ctx.stroke();
      ctx.fillText(tick.label, x, axisY + 18);
    }

    const xOf = (t) => worldToScreenX(cam, t);
    const instants = items.filter((i) => i.kind !== 'span');
    const spans = items.filter((i) => i.kind === 'span');

    const packedUp = packLanes(
      instants.map((i) => ({
        id: i.id,
        kind: 'instant',
        t0: i.t0,
        labelWidth: estimateLabelWidth(i.title),
        lane: i.lane,
      })),
      xOf,
      { gap: 10 }
    );
    const packedDown = packLanes(
      spans.map((i) => ({
        id: i.id,
        kind: 'span',
        t0: i.t0,
        t1: i.t1,
        labelWidth: estimateLabelWidth(i.title),
        lane: i.lane,
      })),
      xOf,
      { gap: 8 }
    );

    const laneH = 28;
    const byIdUp = new Map(packedUp.map((p) => [p.id, p]));
    const byIdDown = new Map(packedDown.map((p) => [p.id, p]));

    // Leader dots for instants
    for (const it of instants) {
      const p = byIdUp.get(it.id);
      if (!p) continue;
      const x = xOf(it.t0);
      const y = axisY - 14 - p.lane * laneH;
      ctx.strokeStyle = 'rgba(40,35,30,0.35)';
      ctx.beginPath();
      ctx.moveTo(x, axisY);
      ctx.lineTo(x, y + 10);
      ctx.stroke();
      ctx.fillStyle = it.color || '#222';
      ctx.beginPath();
      ctx.arc(x, axisY, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    instantLayer.innerHTML = '';
    for (const it of instants) {
      const p = byIdUp.get(it.id);
      if (!p) continue;
      const x = (p.left + p.right) / 2;
      const y = axisY - 22 - p.lane * laneH;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'tl-pill' + (selectedId === it.id ? ' selected' : '');
      el.dataset.id = it.id;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.borderColor = it.color || '#333';
      el.textContent = it.title;
      el.title = `${it.title} · ${formatTick(it.t0, cal)}`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        select(it.id);
      });
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        dragging = { id: it.id, mode: 'instant', startX: e.clientX, t0: it.t0 };
        el.setPointerCapture(e.pointerId);
      });
      instantLayer.appendChild(el);
    }

    spanLayer.innerHTML = '';
    for (const it of spans) {
      const p = byIdDown.get(it.id);
      if (!p) continue;
      const y = axisY + 28 + p.lane * (laneH + 6);
      const el = document.createElement('div');
      el.className = 'tl-span' + (selectedId === it.id ? ' selected' : '');
      el.dataset.id = it.id;
      el.style.left = `${p.left}px`;
      el.style.width = `${Math.max(12, p.right - p.left)}px`;
      el.style.top = `${y}px`;
      el.style.background = it.color || '#444';
      el.innerHTML = `<span class="tl-span-label">${escapeHtml(it.title || '')}</span>
        <div class="tl-span-handle tl-span-handle-start" data-end="start" title="Drag start"></div>
        <div class="tl-span-handle tl-span-handle-end" data-end="end" title="Drag end"></div>`;
      el.title = `${it.title} · ${formatTick(it.t0, cal)} – ${formatTick(it.t1, cal)}`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        select(it.id);
      });
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.tl-span-handle')) return;
        e.stopPropagation();
        dragging = {
          id: it.id,
          mode: 'span-move',
          startX: e.clientX,
          t0: it.t0,
          t1: it.t1,
        };
        el.setPointerCapture(e.pointerId);
      });
      el.querySelectorAll('.tl-span-handle').forEach((h) => {
        h.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          e.preventDefault();
          const end = h.dataset.end === 'start' ? 'start' : 'end';
          dragging = {
            id: it.id,
            mode: end === 'start' ? 'span-start' : 'span-end',
            startX: e.clientX,
            t0: it.t0,
            t1: it.t1,
          };
          h.setPointerCapture(e.pointerId);
        });
      });
      spanLayer.appendChild(el);
    }
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function select(id) {
    selectedId = id;
    const it = (timeline().items || []).find((x) => x.id === id);
    if (!it) {
      detail.hidden = true;
      render();
      return;
    }
    detail.hidden = false;
    detail.querySelector('.tl-detail-title').value = it.title || '';
    const cal = timeline().calendar;
    detail.querySelector('.tl-detail-date').textContent =
      it.kind === 'span'
        ? `${formatTick(it.t0, cal)} – ${formatTick(it.t1, cal)}`
        : formatTick(it.t0, cal);
    detail.querySelector('.tl-detail-body').value = it.description || '';
    const kindSel = detail.querySelector('.tl-detail-kind');
    if (kindSel) kindSel.value = it.kind === 'span' ? 'span' : 'instant';
    const laneIn = detail.querySelector('.tl-detail-lane');
    if (laneIn) laneIn.value = it.lane != null ? String(it.lane) : '';
    const goto = detail.querySelector('[data-tl="goto"]');
    goto.hidden = !it.entityId;
    render();
  }

  function clientToTick(clientX) {
    const rect = stage.getBoundingClientRect();
    return Math.round(screenToWorldX(cam, clientX - rect.left));
  }

  root.querySelector('[data-tl="sync"]').onclick = () => {
    apiRef.exec('timeline.syncScenes', {}, { label: 'Sync timeline from scenes' });
    render();
  };
  root.querySelector('[data-tl="demo"]').onclick = () => {
    apiRef.exec('timeline.seedDemo', {}, { label: 'Seed demo timeline' });
    render();
  };
  root.querySelector('[data-tl="add"]').onclick = () => {
    const t0 = Math.round(screenToWorldX(cam, stage.clientWidth / 2));
    const item = createItem({
      kind: 'instant',
      t0,
      title: 'New event',
      color: '#333',
    });
    apiRef.exec('timeline.addItem', { item }, { label: 'Add event' });
    select(item.id);
    render();
  };
  root.querySelector('[data-tl="period"]').onclick = () => {
    const mid = Math.round(screenToWorldX(cam, stage.clientWidth / 2));
    const half = Math.round(Math.max(30, (stage.clientWidth * 0.15) / cam.scale));
    const fields = spanFromDrag(mid - half, mid + half, {
      title: 'Period',
      color: '#3d3830',
    });
    const item = createItem(fields);
    apiRef.exec('timeline.addItem', { item }, { label: 'Add period' });
    select(item.id);
    render();
  };
  root.querySelector('[data-tl="fit"]').onclick = () => {
    const items = timeline().items || [];
    if (!items.length) return;
    let lo = Infinity;
    let hi = -Infinity;
    for (const it of items) {
      lo = Math.min(lo, it.t0);
      hi = Math.max(hi, it.t1 != null ? it.t1 : it.t0);
    }
    cam = fitX(cam, lo, hi, stage.clientWidth || 800, 64);
    render();
  };
  detail.querySelector('[data-tl="close"]').onclick = () => {
    selectedId = null;
    detail.hidden = true;
    render();
  };
  detail.querySelector('[data-tl="del"]').onclick = () => {
    if (!selectedId) return;
    apiRef.exec('timeline.removeItem', { id: selectedId }, { label: 'Delete event' });
    selectedId = null;
    detail.hidden = true;
    render();
  };
  detail.querySelector('[data-tl="goto"]').onclick = () => {
    const it = (timeline().items || []).find((x) => x.id === selectedId);
    if (it?.entityId) apiRef.onJumpToScene(it.entityId);
  };
  detail.querySelector('.tl-detail-title').addEventListener('change', (e) => {
    if (!selectedId) return;
    apiRef.exec(
      'timeline.updateItem',
      { id: selectedId, patch: { title: e.target.value } },
      { mergeKey: `tl:${selectedId}:title` }
    );
    render();
  });
  detail.querySelector('.tl-detail-body').addEventListener('change', (e) => {
    if (!selectedId) return;
    apiRef.exec(
      'timeline.updateItem',
      { id: selectedId, patch: { description: e.target.value } },
      { mergeKey: `tl:${selectedId}:desc` }
    );
  });
  detail.querySelector('.tl-detail-kind')?.addEventListener('change', (e) => {
    if (!selectedId) return;
    const kind = e.target.value === 'span' ? 'span' : 'instant';
    const it = (timeline().items || []).find((x) => x.id === selectedId);
    if (!it) return;
    const patch = { kind };
    if (kind === 'span' && it.t1 == null) {
      patch.t1 = it.t0 + 365;
    }
    if (kind === 'instant') {
      patch.t1 = undefined;
    }
    // For instant, strip t1 via replace-style: store as null and UI treats as instant
    apiRef.exec(
      'timeline.updateItem',
      {
        id: selectedId,
        patch: kind === 'span' ? { kind: 'span', t1: patch.t1 ?? it.t0 + 365 } : { kind: 'instant', t1: null },
      },
      { label: 'Change event kind' }
    );
    select(selectedId);
  });
  detail.querySelector('.tl-detail-lane')?.addEventListener('change', (e) => {
    if (!selectedId) return;
    const raw = e.target.value;
    const lane = raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0);
    apiRef.exec(
      'timeline.updateItem',
      { id: selectedId, patch: { lane } },
      { mergeKey: `tl:${selectedId}:lane` }
    );
    render();
  });
  detail.querySelectorAll('.tl-color-swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!selectedId) return;
      apiRef.exec(
        'timeline.updateItem',
        { id: selectedId, patch: { color: btn.dataset.color } },
        { label: 'Set event color' }
      );
      render();
    });
  });

  // Pan / zoom
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const mult = e.ctrlKey ? factor * factor : factor;
      cam = zoomAt(cam, mult, sx, 0);
      render();
    },
    { passive: false }
  );

  let panning = null;
  stage.addEventListener('pointerdown', (e) => {
    const onAxis =
      e.target === stage || e.target === canvas || e.target === rubber;
    if (e.button === 1) {
      panning = { x: e.clientX, y: e.clientY };
      stage.setPointerCapture(e.pointerId);
      return;
    }
    // Shift+drag on empty/axis → draw a new span
    if (e.button === 0 && onAxis && e.shiftKey) {
      const t0 = clientToTick(e.clientX);
      spanDraw = { startX: e.clientX, t0 };
      if (rubber) {
        rubber.hidden = false;
        const rect = stage.getBoundingClientRect();
        const x = e.clientX - rect.left;
        rubber.style.left = `${x}px`;
        rubber.style.width = '2px';
      }
      stage.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button === 0 && onAxis) {
      panning = { x: e.clientX, y: e.clientY };
      stage.setPointerCapture(e.pointerId);
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (spanDraw) {
      const rect = stage.getBoundingClientRect();
      const x0 = spanDraw.startX - rect.left;
      const x1 = e.clientX - rect.left;
      const left = Math.min(x0, x1);
      const width = Math.max(2, Math.abs(x1 - x0));
      if (rubber) {
        rubber.hidden = false;
        rubber.style.left = `${left}px`;
        rubber.style.width = `${width}px`;
      }
      return;
    }
    if (dragging) {
      const dx = e.clientX - dragging.startX;
      const dt = dx / cam.scale;
      if (dragging.mode === 'instant') {
        const t0 = Math.round(dragging.t0 + dt);
        apiRef.exec(
          'timeline.updateItem',
          { id: dragging.id, patch: { t0 } },
          { mergeKey: `tl:${dragging.id}:drag` }
        );
        dragging = { ...dragging, startX: e.clientX, t0 };
      } else if (dragging.mode === 'span-move') {
        const patch = moveSpan({ t0: dragging.t0, t1: dragging.t1 }, dt);
        apiRef.exec(
          'timeline.updateItem',
          { id: dragging.id, patch },
          { mergeKey: `tl:${dragging.id}:drag` }
        );
        dragging = { ...dragging, startX: e.clientX, t0: patch.t0, t1: patch.t1 };
      } else if (dragging.mode === 'span-start' || dragging.mode === 'span-end') {
        const newT = Math.round(
          (dragging.mode === 'span-start' ? dragging.t0 : dragging.t1) + dt
        );
        const patch = resizeSpanEnd(
          { t0: dragging.t0, t1: dragging.t1 },
          dragging.mode === 'span-start' ? 'start' : 'end',
          newT
        );
        apiRef.exec(
          'timeline.updateItem',
          { id: dragging.id, patch },
          { mergeKey: `tl:${dragging.id}:resize` }
        );
        dragging = {
          ...dragging,
          startX: e.clientX,
          t0: patch.t0,
          t1: patch.t1,
        };
      }
      render();
      return;
    }
    if (!panning) return;
    cam = panBy(cam, e.clientX - panning.x, 0);
    panning = { x: e.clientX, y: e.clientY };
    render();
  });
  stage.addEventListener('pointerup', (e) => {
    if (spanDraw) {
      const t1 = clientToTick(e.clientX);
      const dist = Math.abs(e.clientX - spanDraw.startX);
      if (dist > 8) {
        const fields = spanFromDrag(spanDraw.t0, t1, { title: 'Period' });
        const item = createItem(fields);
        apiRef.exec('timeline.addItem', { item }, { label: 'Add period' });
        select(item.id);
      }
      spanDraw = null;
      if (rubber) rubber.hidden = true;
      render();
    }
    panning = null;
    dragging = null;
  });

  // Instant drag already set mode-less; fix older instant path
  // (pointerdown on pills sets mode: 'instant' below — already uses kind: 'instant')
  // Normalize: rewrite pill drag init was { kind: 'instant' } — pointermove checks mode
  // Fix pill pointerdown to use mode: 'instant'

  const ro = new ResizeObserver(() => render());
  ro.observe(stage);

  function destroy() {
    ro.disconnect();
    root.innerHTML = '';
    delete root.__platenTimeline;
  }

  const controller = { render, destroy, setApi };
  root.__platenTimeline = controller;
  return controller;
}
