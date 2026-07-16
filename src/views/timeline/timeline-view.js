/**
 * Timeline surface — ink axis, instant pills (up), span bars (down).
 * DOM + CSS; axis ticks; lane pack on zoom.
 */
import { createCamera, worldToScreenX, screenToWorldX, zoomAt, panBy, fitX } from '../../core/geom/camera.js';
import { packLanes, estimateLabelWidth } from '../../core/geom/pack.js';
import { formatTick, axisTicks } from '../../core/timeline/calendar.js';
import { ensureProjectTimeline } from '../../core/timeline/model.js';

/**
 * @param {HTMLElement} root
 * @param {{
 *   getProject: () => object,
 *   exec: (type: string, payload: object, opts?: object) => object,
 *   onJumpToScene: (blockId: string) => void,
 * }} api
 */
export function mountTimelineView(root, api) {
  if (!root || root.dataset.mounted === '1') {
    return { render: () => render(), destroy: () => {} };
  }
  root.dataset.mounted = '1';
  root.innerHTML = `
    <div class="tl-toolbar">
      <strong class="section-kicker">Timeline</strong>
      <span class="muted">Integer ticks · calendars are display-only</span>
      <div style="flex:1"></div>
      <button type="button" class="ghost" data-tl="sync">Sync scenes</button>
      <button type="button" class="ghost" data-tl="demo">Demo eras</button>
      <button type="button" class="ghost" data-tl="add">+ Instant</button>
      <button type="button" class="ghost" data-tl="fit">Fit</button>
    </div>
    <div class="tl-stage" tabindex="0">
      <canvas class="tl-axis" aria-hidden="true"></canvas>
      <div class="tl-layer tl-spans"></div>
      <div class="tl-layer tl-instants"></div>
    </div>
    <div class="tl-detail" hidden>
      <div class="tl-detail-inner">
        <header class="tl-detail-head">
          <input class="tl-detail-title" />
          <span class="tl-detail-date"></span>
          <button type="button" class="ghost" data-tl="goto">Open scene</button>
          <button type="button" class="ghost danger-del" data-tl="del">Delete</button>
          <button type="button" class="ghost" data-tl="close">✕</button>
        </header>
        <textarea class="tl-detail-body" rows="4" placeholder="Description"></textarea>
      </div>
    </div>
  `;

  const stage = root.querySelector('.tl-stage');
  const canvas = root.querySelector('.tl-axis');
  const spanLayer = root.querySelector('.tl-spans');
  const instantLayer = root.querySelector('.tl-instants');
  const detail = root.querySelector('.tl-detail');
  let cam = createCamera({ scale: 0.15, lockY: true, minScale: 0.02, maxScale: 8, panX: 80 });
  let selectedId = null;
  let dragging = null;

  function project() {
    return ensureProjectTimeline(api.getProject());
  }

  function timeline() {
    return project().timeline;
  }

  function render() {
    const tl = timeline();
    const cal = tl.calendar;
    const items = tl.items || [];
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
        dragging = { id: it.id, kind: 'instant', startX: e.clientX, t0: it.t0 };
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
      el.textContent = it.title;
      el.title = `${it.title} · ${formatTick(it.t0, cal)} – ${formatTick(it.t1, cal)}`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        select(it.id);
      });
      spanLayer.appendChild(el);
    }
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
    detail.querySelector('.tl-detail-date').textContent = formatTick(it.t0, timeline().calendar);
    detail.querySelector('.tl-detail-body').value = it.description || '';
    const goto = detail.querySelector('[data-tl="goto"]');
    goto.hidden = !it.entityId;
    render();
  }

  root.querySelector('[data-tl="sync"]').onclick = () => {
    api.exec('timeline.syncScenes', {}, { label: 'Sync timeline from scenes' });
    render();
  };
  root.querySelector('[data-tl="demo"]').onclick = () => {
    api.exec('timeline.seedDemo', {}, { label: 'Seed demo timeline' });
    render();
  };
  root.querySelector('[data-tl="add"]').onclick = () => {
    const t0 = Math.round(screenToWorldX(cam, stage.clientWidth / 2));
    const item = {
      id: `item_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      kind: 'instant',
      t0,
      title: 'New event',
      color: '#333',
    };
    api.exec('timeline.addItem', { item }, { label: 'Add event' });
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
    api.exec('timeline.removeItem', { id: selectedId }, { label: 'Delete event' });
    selectedId = null;
    detail.hidden = true;
    render();
  };
  detail.querySelector('[data-tl="goto"]').onclick = () => {
    const it = (timeline().items || []).find((x) => x.id === selectedId);
    if (it?.entityId) api.onJumpToScene(it.entityId);
  };
  detail.querySelector('.tl-detail-title').addEventListener('change', (e) => {
    if (!selectedId) return;
    api.exec(
      'timeline.updateItem',
      { id: selectedId, patch: { title: e.target.value } },
      { mergeKey: `tl:${selectedId}:title` }
    );
    render();
  });
  detail.querySelector('.tl-detail-body').addEventListener('change', (e) => {
    if (!selectedId) return;
    api.exec(
      'timeline.updateItem',
      { id: selectedId, patch: { description: e.target.value } },
      { mergeKey: `tl:${selectedId}:desc` }
    );
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
    if (e.button === 1 || (e.button === 0 && e.target === stage) || e.target === canvas) {
      panning = { x: e.clientX, y: e.clientY };
      stage.setPointerCapture(e.pointerId);
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (dragging) {
      const dx = e.clientX - dragging.startX;
      const dt = dx / cam.scale;
      const t0 = Math.round(dragging.t0 + dt);
      api.exec(
        'timeline.updateItem',
        { id: dragging.id, patch: { t0 } },
        { mergeKey: `tl:${dragging.id}:drag` }
      );
      dragging = { ...dragging, startX: e.clientX, t0 };
      render();
      return;
    }
    if (!panning) return;
    cam = panBy(cam, e.clientX - panning.x, 0);
    panning = { x: e.clientX, y: e.clientY };
    render();
  });
  stage.addEventListener('pointerup', () => {
    panning = null;
    dragging = null;
  });

  const ro = new ResizeObserver(() => render());
  ro.observe(stage);

  function destroy() {
    ro.disconnect();
    root.dataset.mounted = '0';
    root.innerHTML = '';
  }

  return { render, destroy };
}
