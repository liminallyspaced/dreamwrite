/* global scriptdesk */
import {
  setBlockDomText,
  readBlockText,
  placeCaretEnd,
  placeCaretStart,
  isCaretAtEnd,
  placeholderFor,
} from './views/script/block-dom.js';
import {
  planPageStack,
  captureSelection,
  restoreSelection,
} from './views/script/page-layout.js';
import {
  escapeHtml,
  escapeAttr,
  safeColor,
  escapeRegExp,
  slugify,
  baseName,
} from './views/shared/text.js';
import { writeAutosave, readAutosave } from './core/persist/autosave.js';
import {
  normalizeProject as normalizeProjectData,
  sanitizeProject as sanitizeProjectData,
  exportReadyProject as exportReadyProjectData,
} from './core/project/document.js';
import { sampleFountain } from './core/project/sample.js';
import { createStore } from './core/store/index.js';

(() => {
  // Still the global rather than a direct import: engine-global.js installs it, and
  // this file is one big IIFE that other code reaches into. Becomes a real import
  // as the split continues. See docs/plan/01-roadmap.md Phase 0.
  const E = window.ScriptEngine;
  const api = window.scriptdesk;

  const state = {
    project: E.emptyProject(),
    filePath: null,
    dirty: false,
    activeBlockId: null,
    view: 'script',
    focusMode: false,
    typewriterMode: false,
    findIndex: -1,
    acIndex: 0,
    acItems: [],
    autosaveTimer: null,
    pageLayoutTimer: null,
    /** Last laid-out page count — typing only reflows when this changes */
    laidOutPageCount: 0,
    suppressDirty: false,
  };

  // Document mutations go through the store (docs/architecture/store-design.md).
  // Session fields (view, activeBlockId) still live on `state` until the full split.
  const store = createStore({
    project: state.project,
    session: {
      filePath: null,
      dirty: false,
      activeBlockId: null,
      view: 'script',
    },
  });

  function pullFromStore() {
    const s = store.getState();
    state.project = s.project;
    state.dirty = s.session.dirty;
    state.filePath = s.session.filePath;
  }

  /**
   * Execute a document command. Updates state.project from the store.
   * Does not re-render — callers decide.
   */
  function exec(type, payload, opts = {}) {
    const r = store.execute({
      type,
      payload,
      label: opts.label,
      mergeKey: opts.mergeKey,
    });
    if (r.ok && !r.noop) {
      pullFromStore();
      if (!state.suppressDirty) {
        updateChrome();
        scheduleAutosave();
      }
    }
    return r;
  }

  function flushBlockText(id, textEl) {
    const el = textEl || blockEl(id);
    if (!el) return;
    const text = readBlockText(el);
    const b = getBlock(id);
    if (!b || b.text === text) return;
    exec('blocks.setText', { id, text }, { mergeKey: `block:${id}` });
  }

  function performUndo() {
    const r = store.undo();
    if (!r.ok) return;
    pullFromStore();
    // Active block may have been removed
    if (state.activeBlockId && !getBlock(state.activeBlockId)) {
      state.activeBlockId = state.project.blocks[0]?.id || null;
    }
    renderBlocks();
    renderScenes();
    refreshStats();
    renderHistory();
    updateChrome();
    scheduleAutosave();
    if (state.activeBlockId) focusBlock(state.activeBlockId);
  }

  function performRedo() {
    const r = store.redo();
    if (!r.ok) return;
    pullFromStore();
    renderBlocks();
    renderScenes();
    refreshStats();
    renderHistory();
    updateChrome();
    scheduleAutosave();
    if (state.activeBlockId) focusBlock(state.activeBlockId);
  }

  const MONO_CARD = ['#111', '#333', '#555', '#777', '#222', '#444', '#666', '#000'];

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const els = {
    welcome: $('#welcome'),
    sceneList: $('#sceneList'),
    projectTitleLabel: $('#projectTitleLabel'),
    dirtyDot: $('#dirtyDot'),
    statusPath: $('#statusPath'),
    statusElement: $('#statusElement'),
    statusCounts: $('#statusCounts'),
    elementSelect: $('#elementSelect'),
    badge: $('#elementBadge'),
    badgeType: $('#badgeType'),
    findBar: $('#findBar'),
    findInput: $('#findInput'),
    replaceInput: $('#replaceInput'),
    ac: $('#ac'),
    workspace: $('#workspace'),
    pageStack: $('#pageStack'),
    /** First page .blocks host — refreshed after each layout (legacy alias) */
    blocks: null,
    cardsBoard: $('#cardsBoard'),
    charList: $('#charList'),
    locList: $('#locList'),
    notesArea: $('#notesArea'),
    historyList: $('#historyList'),
    helpModal: $('#helpModal'),
  };

  /* ---------- bootstrap ---------- */

  function init() {
    buildTypebars();
    bindUi();
    bindMenu();
    loadAutosaveOrWelcome();
    window.addEventListener('beforeunload', () => {
      if (state.dirty) persistLocal();
    });
  }

  function buildTypebars() {
    /* typewriter is now a photoreal stage image — no CSS bars */
  }

  function strikeTypebar() {
    /* key sounds handled in ui-chrome */
  }

  function bindUi() {
    // Radial + chrome bridge
    window.PlatenUI = {
      applyElement: (type) => applyElementFromRibbon(type),
      insertSnippet: (snip, opts) => insertSnippet(snip, opts || {}),
      insertLine: (line, type) => insertLineSnippet(line, type || 'transition'),
    };

    $('#btnNew').onclick = () => newProject();
    $('#btnOpen').onclick = () => openProject();
    $('#btnSave').onclick = () => saveProject(false);
    const btnImport = $('#btnImport');
    if (btnImport) btnImport.onclick = () => importFountain();
    $('#btnFind').onclick = () => toggleFind(true);
    $('#btnTheme').onclick = () => toggleTheme();
    const bf = $('#btnFocus');
    if (bf) bf.onclick = () => window.PlatenChrome?.cycleFocus?.();
    const bt = $('#btnTypewriter');
    if (bt) bt.onclick = () => window.PlatenChrome?.setFocusMode?.('typewriter');
    const exitTw = $('#btnExitTypewriter');
    if (exitTw) exitTw.onclick = () => window.PlatenChrome?.setFocusMode?.('desk');
    $('#btnHelp').onclick = () => showHelp(true);
    $('#helpClose').onclick = () => showHelp(false);
    $('#helpModal').onclick = (e) => {
      if (e.target === els.helpModal) showHelp(false);
    };
    $('#btnExportPdf').onclick = () => exportPdf();
    const pdf2 = $('#btnExportPdf2');
    if (pdf2) pdf2.onclick = () => exportPdf();
    const f1 = $('#btnExportFountain');
    const f2 = $('#btnExportFountain2');
    if (f1) f1.onclick = () => exportFountain();
    if (f2) f2.onclick = () => exportFountain();
    $('#btnSnapshot').onclick = () => snapshot('manual');
    $('#btnAddScene').onclick = () => insertSceneAtEnd();

    // Format ribbon — element styles
    $$('.el-btn[data-element]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        applyElementFromRibbon(btn.dataset.element);
      });
    });
    // Structure inserts
    $$('.el-btn[data-insert-block]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        insertStructureBlock(btn.dataset.insertBlock);
      });
    });
    // Snippet strip
    $$('.snip-btn[data-snip]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        insertSnippet(btn.dataset.snip, { forceScene: /INT\.|EXT\.|I\/E\.|EST\./i.test(btn.dataset.snip) && !btn.dataset.snip.includes(' -') });
      });
    });
    $$('.snip-btn[data-snip-scene]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        insertFullSceneSlug(btn.dataset.snipScene);
      });
    });
    $$('.snip-btn[data-snip-line]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        insertLineSnippet(btn.dataset.snipLine, btn.dataset.type || 'transition');
      });
    });
    $$('.doc-link').forEach((btn) => {
      btn.onclick = () => setView(btn.dataset.view);
    });
    $('#btnSyncCards').onclick = () => {
      // Was: cards = autoCardsFromScenes(project) — overwrite destroyed summaries.
      // findings.md §5.5 #4. Now an undoable store command using merge-sync.
      const before = (state.project.cards || []).length;
      exec('cards.syncFromScenes', {}, { label: 'Sync cards' });
      const after = state.project.cards || [];
      const orphaned = after.filter((c) => c.orphaned).length;
      renderCards();
      showSaveAlert(
        `Cards synced — ${after.length} on board` +
          (orphaned ? `, ${orphaned} orphaned` : '') +
          (before !== after.length ? ` (was ${before})` : '') +
          '.',
        'warn'
      );
    };
    $('#btnAddCard').onclick = () => {
      const n = (state.project.cards || []).length + 1;
      exec(
        'cards.add',
        {
          card: {
            id: E.uid(),
            sceneId: null,
            number: n,
            title: `Beat ${n}`,
            summary: '',
            color: MONO_CARD[n % MONO_CARD.length],
            beat: '',
          },
        },
        { label: 'Add card' }
      );
      renderCards();
    };
    $('#btnScanChars').onclick = () => {
      exec(
        'bible.setCharacters',
        { characters: E.extractCharacters(state.project), label: 'Scan characters' },
        { label: 'Scan characters' }
      );
      renderCharacters();
      refreshStats();
    };
    $('#btnAddChar').onclick = () => {
      exec(
        'bible.addCharacter',
        {
          character: {
            id: E.uid(),
            name: 'NEW CHARACTER',
            role: '',
            description: '',
            notes: '',
          },
        },
        { label: 'Add character' }
      );
      renderCharacters();
    };
    $('#btnScanLocs').onclick = () => {
      exec(
        'bible.setLocations',
        { locations: E.extractLocations(state.project), label: 'Scan locations' },
        { label: 'Scan locations' }
      );
      renderLocations();
    };
    $('#btnAddLoc').onclick = () => {
      exec(
        'bible.addLocation',
        {
          location: {
            id: E.uid(),
            name: 'NEW LOCATION',
            intExt: 'INT',
            times: [],
            notes: '',
          },
        },
        { label: 'Add location' }
      );
      renderLocations();
    };

    $('#welcomeNew').onclick = () => {
      newProject(true);
    };
    $('#welcomeOpen').onclick = () => openProject();
    $('#welcomeImport').onclick = () => importFountain();
    $('#welcomeSample').onclick = () => loadSample();

    $$('.view-btn').forEach((btn) => {
      btn.onclick = () => setView(btn.dataset.view);
    });

    els.elementSelect.onchange = () => {
      if (state.activeBlockId) setBlockType(state.activeBlockId, els.elementSelect.value);
    };

    // Title page bindings
    ['tpTitle', 'tpAuthor', 'tpBased', 'tpDate', 'tpContact'].forEach((id) => {
      $(`#${id}`).addEventListener('input', syncTitleFromForm);
    });
    els.notesArea.addEventListener('input', () => {
      exec(
        'meta.setNotes',
        { notes: els.notesArea.value },
        { mergeKey: 'meta:notes', label: 'Notes' }
      );
    });

    $('#btnFindNext').onclick = () => findNext();
    $('#btnReplace').onclick = () => replaceOne();
    $('#btnReplaceAll').onclick = () => replaceAll();
    $('#btnFindClose').onclick = () => toggleFind(false);
    els.findInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        findNext();
      }
      if (e.key === 'Escape') toggleFind(false);
    });

    document.addEventListener('keydown', onGlobalKeydown);
    document.addEventListener('click', (e) => {
      if (!els.ac.contains(e.target)) hideAc();
    });
  }

  function bindMenu() {
    if (!api || !api.onMenu) return;
    api.onMenu((channel, payload) => {
      switch (channel) {
        case 'menu:new':
          newProject();
          break;
        case 'menu:open':
          openProject();
          break;
        case 'menu:save':
          saveProject(false);
          break;
        case 'menu:saveAs':
          saveProject(true);
          break;
        case 'menu:importFountain':
          importFountain();
          break;
        case 'menu:exportFountain':
          exportFountain();
          break;
        case 'menu:exportPdf':
          exportPdf();
          break;
        case 'menu:find':
          toggleFind(true);
          break;
        case 'menu:undo':
          performUndo();
          break;
        case 'menu:redo':
          performRedo();
          break;
        case 'menu:element':
          if (state.activeBlockId) setBlockType(state.activeBlockId, payload);
          break;
        case 'menu:cycle':
          if (state.activeBlockId) cycleType(state.activeBlockId);
          break;
        case 'menu:view':
          setView(payload);
          break;
        case 'menu:theme':
          toggleTheme();
          break;
        case 'menu:focus':
          window.PlatenChrome?.cycleFocus?.();
          break;
        case 'menu:typewriter':
          toggleTypewriter();
          break;
        case 'menu:paper':
          window.PlatenChrome?.setFocusMode?.('paper');
          break;
        case 'menu:help':
          showHelp(true);
          break;
        default:
          break;
      }
    });
  }

  /* ---------- project lifecycle ---------- */

  function loadAutosaveOrWelcome() {
    // readAutosave prefers the current key over the legacy one and recombines
    // history from its separate key. It returns null (never throws) on corrupt
    // data, so a bad autosave costs you the restore, not the app.
    const data = readAutosave(window.localStorage);
    if (data && data.project) {
      adoptDocument(sanitizeProject(normalizeProject(data.project)), {
        filePath: data.filePath || null,
        dirty: !!data.dirty,
      });
      hideWelcome();
      fullRender();
      return;
    }
    showWelcome();
  }

  /** Strip gutter-label leaks — pure core/project/document.js */
  function sanitizeProject(project) {
    return sanitizeProjectData(project, {
      normalizeType: E.normalizeType,
      uid: E.uid,
      elementLabels: E.ELEMENT_LABELS,
      emptyProject: () => E.emptyProject(),
    });
  }

  function showWelcome() {
    els.welcome.classList.remove('hidden');
  }
  function hideWelcome() {
    els.welcome.classList.add('hidden');
  }

  function newProject(fromWelcome = false) {
    if (state.dirty && !fromWelcome) {
      if (!confirm('Discard unsaved changes and start a new project?')) return;
    }
    store.resetDocument(E.emptyProject('Untitled Screenplay'), {
      filePath: null,
      dirty: false,
      activeBlockId: null,
    });
    pullFromStore();
    hideWelcome();
    fullRender();
    focusFirstBlock();
  }

  function loadSample() {
    adoptDocument(E.fromFountain(sampleFountain(), 'THE LAST SIGNAL'), {
      filePath: null,
      dirty: true,
    });
    hideWelcome();
    fullRender();
    focusFirstBlock();
  }

  /** Load a new document identity into the store (clears undo). */
  function adoptDocument(project, sessionPatch = {}) {
    store.resetDocument(project, {
      filePath: null,
      dirty: false,
      activeBlockId: null,
      ...sessionPatch,
    });
    pullFromStore();
  }

  async function openProject() {
    if (!api) {
      alert('File dialogs require the desktop app.');
      return;
    }
    const res = await api.openProject();
    if (!res) return;
    const { filePath, content } = res;
    let project;
    if (filePath.toLowerCase().endsWith('.fountain') || filePath.toLowerCase().endsWith('.spmd')) {
      project = E.fromFountain(content, baseName(filePath));
    } else {
      try {
        const data = JSON.parse(content);
        project = normalizeProject(data);
      } catch {
        project = E.fromFountain(content, baseName(filePath));
      }
    }
    const keepPath =
      filePath.toLowerCase().endsWith('.sdesk') ||
      filePath.toLowerCase().endsWith('.platen') ||
      filePath.toLowerCase().endsWith('.json')
        ? filePath
        : null;
    adoptDocument(project, { filePath: keepPath, dirty: false });
    hideWelcome();
    fullRender();
  }

  async function saveProject(saveAs) {
    if (!api) {
      persistLocal();
      alert('Saved to local autosave. Use the Platen desktop app for real files.');
      return;
    }
    const payload = {
      filePath: saveAs ? null : state.filePath,
      content: JSON.stringify(state.project, null, 2),
      suggestedName: slugify(state.project.titlePage?.title || 'untitled') + '.platen',
    };

    let res;
    try {
      res = await api.saveProject(payload);
    } catch (err) {
      // This had NO try/catch, and the callers are `onclick = () => saveProject()`,
      // so a rejected IPC became an unhandled rejection: you press Save, nothing
      // happens, and nothing tells you. findings.md §5.5 #2.
      reportSaveProblem('file', 'Save failed — your changes are NOT on disk.', err);
      alert(`Could not save the project.\n\n${err?.message || err}\n\nYour work is still in the editor. Try Save As to a different location.`);
      return;
    }

    if (!res) return; // user cancelled the dialog — not an error

    state.filePath = res.filePath;
    state.dirty = false;
    state.project.updatedAt = new Date().toISOString();
    store.setSession({ filePath: res.filePath, dirty: false });
    store.markClean();
    pullFromStore();
    clearSaveAlert('file');
    updateChrome();
    persistLocal();
  }

  async function importFountain() {
    if (!api) return;
    const res = await api.importFountain();
    if (!res) return;
    adoptDocument(E.fromFountain(res.content, baseName(res.filePath)), {
      filePath: null,
      dirty: true,
    });
    hideWelcome();
    fullRender();
  }

  function exportReadyProject() {
    return exportReadyProjectData(
      state.project,
      { normalizeProject: E.normalizeProject },
      { contd: true }
    );
  }

  async function exportFountain() {
    const proj = exportReadyProject();
    const fountain = E.toFountain(proj);
    if (!api) {
      downloadBlob(fountain, `${slugify(proj.titlePage?.title || 'script')}.fountain`, 'text/plain');
      return;
    }
    await api.exportText({
      content: fountain,
      suggestedName: `${slugify(proj.titlePage?.title || 'script')}.fountain`,
      filters: [{ name: 'Fountain', extensions: ['fountain'] }],
      defaultExt: 'fountain',
    });
  }

  async function exportPdf() {
    const proj = exportReadyProject();
    const html = E.toPdfHtml(proj);
    if (!api) {
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(html);
        w.document.close();
        w.focus();
        w.print();
      }
      return;
    }
    const res = await api.exportPdf({
      html,
      suggestedName: `${slugify(proj.titlePage?.title || 'script')}.pdf`,
    });
    if (res?.filePath && api.showItem) api.showItem(res.filePath);
  }

  function normalizeProject(data) {
    return normalizeProjectData(data, { emptyProject: () => E.emptyProject() });
  }

  /**
   * Escape hatch only — all document paths should use exec().
   * Rebases the store if state.project diverged (clears undo).
   */
  function markDirty() {
    if (state.suppressDirty) return;
    state.dirty = true;
    state.project.updatedAt = new Date().toISOString();
    if (store.getProject() !== state.project) {
      store.resetDocument(state.project, {
        filePath: state.filePath,
        dirty: true,
        activeBlockId: state.activeBlockId,
      });
      pullFromStore();
      state.dirty = true;
    } else {
      store.setSession({ dirty: true, filePath: state.filePath });
    }
    updateChrome();
    scheduleAutosave();
  }

  function scheduleAutosave() {
    clearTimeout(state.autosaveTimer);
    state.autosaveTimer = setTimeout(() => {
      persistLocal();
      if (state.filePath && api?.writeText) {
        api.writeText({
          filePath: state.filePath,
          content: JSON.stringify(state.project, null, 2),
        })
          .then(() => {
            state.dirty = false;
            clearSaveAlert('file');
            updateChrome();
          })
          .catch((err) => {
            // Previously `.catch(() => {})`. A failing write to the user's real
            // file is exactly the thing they must be told about — silence here
            // meant the draft on disk silently stopped tracking the editor.
            // findings.md §5.5 #2.
            reportSaveProblem('file', `Could not save to ${state.filePath}`, err);
          });
      }
    }, 800);
  }

  /**
   * Mirror the project into localStorage.
   *
   * All the real work — payload construction, quota handling, history eviction —
   * lives in core/persist/autosave.js and is unit-tested. This function's only job
   * is to hand it the storage and SURFACE what comes back.
   */
  function persistLocal() {
    const result = writeAutosave(window.localStorage, {
      project: state.project,
      filePath: state.filePath,
      dirty: state.dirty,
      savedAt: new Date().toISOString(),
    });

    if (!result.ok) {
      const detail =
        result.reason === 'quota'
          ? 'Local autosave is full. Save to a file (Ctrl+S) — your work is not being backed up.'
          : 'Local autosave is unavailable. Save to a file (Ctrl+S) — your work is not being backed up.';
      reportSaveProblem('local', detail, result.error);
      return;
    }

    clearSaveAlert('local');

    if (result.evictedHistory) {
      // Not a failure: the draft was prioritised over old snapshots, by design.
      // Still worth saying out loud, because revisions did just disappear.
      showSaveAlert('Old revision snapshots dropped to make room — the script itself is saved.', 'warn');
    }
  }

  /* ---------- save status surfacing ---------- */

  // Which subsystems are currently unhappy. Keyed so a local-storage problem and a
  // file-write problem can't clobber each other's message.
  const saveProblems = new Map();

  function reportSaveProblem(kind, message, err) {
    saveProblems.set(kind, message);
    // Keep the detail in the console for diagnosis — but never ONLY in the console.
    console.error(`[platen] save failed (${kind}):`, err);
    renderSaveAlert();
  }

  function clearSaveAlert(kind) {
    if (saveProblems.delete(kind)) renderSaveAlert();
  }

  function renderSaveAlert() {
    const el = document.getElementById('saveAlert');
    if (!el) return;
    if (!saveProblems.size) {
      el.hidden = true;
      return;
    }
    const messages = [...saveProblems.values()];
    el.hidden = false;
    el.classList.remove('warn');
    el.textContent = 'Not saving';
    el.title = messages.join('\n');
  }

  /** Transient, non-blocking notice. Distinct from a persistent failure. */
  function showSaveAlert(message, kind = 'warn') {
    const el = document.getElementById('saveAlert');
    if (!el || saveProblems.size) return; // a real failure outranks a notice
    el.hidden = false;
    el.classList.toggle('warn', kind === 'warn');
    el.textContent = message.length > 60 ? `${message.slice(0, 57)}…` : message;
    el.title = message;
    clearTimeout(state.saveAlertTimer);
    state.saveAlertTimer = setTimeout(() => {
      if (!saveProblems.size) el.hidden = true;
    }, 6000);
  }

  function snapshot(label) {
    exec(
      'meta.pushRevision',
      {
        id: E.uid(),
        label: label || 'edit',
        blocks: state.project.blocks,
        at: new Date().toISOString(),
      },
      { label: 'Snapshot' }
    );
    renderHistory();
  }

  /* ---------- rendering ---------- */

  function fullRender() {
    state.suppressDirty = true;
    applyTheme(state.project.settings?.theme || 'dark');
    renderBlocks();
    renderScenes();
    renderCards();
    renderCharacters();
    renderLocations();
    renderTitleForm();
    els.notesArea.value = state.project.notes || '';
    renderHistory();
    refreshStats();
    updateChrome();
    setView(state.view);
    state.suppressDirty = false;
  }

  function renderBlocks() {
    // Rebuild all editable rows, then distribute across paper pages from Page[].
    const snap = captureSelection(els.pageStack);
    /** @type {Map<string, HTMLElement>} */
    const rowMap = new Map();
    for (const block of state.project.blocks) {
      rowMap.set(block.id, createBlockRow(block));
    }
    applyPageStack(rowMap);
    restoreSelection(els.pageStack, snap);
  }

  /**
   * Debounced re-layout after typing — only when page count changes so we
   * never move the caret/DOM on ordinary keystrokes (ADR-0006).
   * Structural edits use renderBlocks() which layouts immediately.
   */
  function schedulePageLayout() {
    clearTimeout(state.pageLayoutTimer);
    state.pageLayoutTimer = setTimeout(() => {
      const n = E.pageCount(state.project.blocks || []);
      if (n !== state.laidOutPageCount) {
        reflowPageStack();
      } else {
        paintPageNumbers(n);
      }
    }, 280);
  }

  function reflowPageStack() {
    if (!els.pageStack) return;
    const snap = captureSelection(els.pageStack);
    /** @type {Map<string, HTMLElement>} */
    const rowMap = new Map();
    els.pageStack.querySelectorAll('.block-row:not(.synthetic)').forEach((row) => {
      if (row.dataset.id) rowMap.set(row.dataset.id, row);
    });
    // Ensure every model block has a row (new inserts may not be in DOM yet)
    for (const block of state.project.blocks) {
      if (!rowMap.has(block.id)) {
        rowMap.set(block.id, createBlockRow(block));
      }
    }
    // Drop rows for deleted blocks
    for (const id of [...rowMap.keys()]) {
      if (!getBlock(id)) rowMap.delete(id);
    }
    applyPageStack(rowMap);
    restoreSelection(els.pageStack, snap);
    paintPageNumbers(E.pageCount(state.project.blocks));
  }

  /**
   * Build multi-page paper stack from planPageStack(paginate()).
   * Moves (does not clone) editable block-row nodes into page .blocks hosts.
   * @param {Map<string, HTMLElement>} rowMap
   */
  function applyPageStack(rowMap) {
    const stack = els.pageStack;
    if (!stack) return;

    const pages = E.paginate(state.project.blocks || []);
    const plan = planPageStack(pages);
    const assigned = new Set();

    // Detach rows before clearing so we can re-parent them
    for (const row of rowMap.values()) {
      row.remove();
    }
    stack.innerHTML = '';

    for (const p of plan) {
      const pageEl = createPageElement(p.number);
      const host = pageEl.querySelector('.blocks');
      if (p.showContd && p.contdText) {
        host.appendChild(createSyntheticRow('character', p.contdText));
      }
      for (const id of p.blockIds) {
        const row = rowMap.get(id);
        if (row) {
          host.appendChild(row);
          assigned.add(id);
        }
      }
      if (p.showMore) {
        host.appendChild(createSyntheticRow('more', '(MORE)'));
      }
      stack.appendChild(pageEl);
    }

    // Unassigned model blocks (e.g. empty plan edge cases) → last page
    let lastHost = stack.querySelector('.page:last-child .blocks');
    if (!lastHost) {
      const pageEl = createPageElement(1);
      stack.appendChild(pageEl);
      lastHost = pageEl.querySelector('.blocks');
    }
    for (const block of state.project.blocks || []) {
      if (!assigned.has(block.id)) {
        const row = rowMap.get(block.id);
        if (row) lastHost.appendChild(row);
      }
    }

    // Keep #blocks on the first host so smoke tests and legacy selectors work
    const hosts = stack.querySelectorAll('.blocks');
    hosts.forEach((h, i) => {
      if (i === 0) h.id = 'blocks';
      else h.removeAttribute('id');
    });
    els.blocks = stack.querySelector('#blocks') || stack.querySelector('.blocks');
    state.laidOutPageCount = pages.length || 1;
    paintPageNumbers(state.laidOutPageCount);
  }

  function createPageElement(number) {
    const page = document.createElement('div');
    page.className = 'page';
    page.dataset.page = String(number);

    const edge = document.createElement('div');
    edge.className = 'page-edge';
    edge.setAttribute('aria-hidden', 'true');

    const ink = document.createElement('div');
    ink.className = 'page-ink';
    ink.setAttribute('aria-hidden', 'true');

    const num = document.createElement('div');
    num.className = 'page-number';
    if (number < 2) {
      num.hidden = true;
      num.textContent = '';
    } else {
      num.textContent = `${number}.`;
    }

    const blocks = document.createElement('div');
    blocks.className = 'blocks';

    page.appendChild(edge);
    page.appendChild(ink);
    page.appendChild(num);
    page.appendChild(blocks);
    return page;
  }

  function createSyntheticRow(type, text) {
    const row = document.createElement('div');
    row.className = `block-row type-${type} synthetic`;
    row.setAttribute('aria-hidden', 'true');
    const gutter = document.createElement('div');
    gutter.className = 'block-gutter';
    gutter.contentEditable = 'false';
    gutter.textContent = type === 'more' ? 'MORE' : 'CONT\'D';
    const body = document.createElement('div');
    body.className = `block ${type}`;
    body.contentEditable = 'false';
    body.textContent = text;
    row.appendChild(gutter);
    row.appendChild(body);
    return row;
  }

  function paintPageNumbers(total) {
    const pages = els.pageStack?.querySelectorAll('.page') || [];
    pages.forEach((pageEl) => {
      const n = Number(pageEl.dataset.page) || 1;
      const numEl = pageEl.querySelector('.page-number');
      if (!numEl) return;
      if (n < 2) {
        numEl.hidden = true;
        numEl.textContent = '';
      } else {
        numEl.hidden = false;
        numEl.textContent = `${n}.`;
      }
    });
    void total;
  }

  /**
   * Structure (critical for typing):
   *   .block-row
   *     .block-gutter   (NOT contentEditable — was corrupting action text)
   *     .block.text     (contentEditable only)
   */
  function createBlockRow(block) {
    const row = document.createElement('div');
    row.className = `block-row type-${block.type}`;
    row.dataset.id = block.id;

    const gutter = document.createElement('div');
    gutter.className = 'block-gutter';
    gutter.contentEditable = 'false';
    gutter.setAttribute('aria-hidden', 'true');
    gutter.textContent = E.ELEMENT_LABELS[block.type] || block.type;

    const text = document.createElement('div');
    text.className = `block ${block.type}`;
    text.dataset.id = block.id;
    text.dataset.type = block.type;
    text.dataset.placeholder = placeholderFor(block.type);
    text.contentEditable = 'true';
    text.spellcheck = true;
    text.setAttribute('role', 'textbox');
    text.setAttribute('aria-multiline', 'true');
    // Plain text only — avoids nested <div>/<br> chaos
    text.setAttribute('plain-text', 'true');
    setBlockDomText(text, block.text || '');

    text.addEventListener('focus', () => onBlockFocus(block.id));
    text.addEventListener('input', () => onBlockInput(block.id, text));
    text.addEventListener('keydown', (e) => onBlockKeydown(e, block.id, text));
    text.addEventListener('paste', (e) => onBlockPaste(e, block.id, text));
    text.addEventListener('blur', () => {
      const b = getBlock(block.id);
      if (!b) return;
      const raw = readBlockText(text);
      const norm = E.normalizeBlock({ ...b, text: raw });
      if (norm.type !== b.type) {
        exec('blocks.setType', { id: block.id, type: norm.type, text: norm.text });
      } else if (norm.text !== b.text) {
        exec('blocks.setText', { id: block.id, text: norm.text }, { mergeKey: `block:${block.id}` });
      }
      const latest = getBlock(block.id);
      if (!latest) return;
      setBlockDomText(text, latest.text);
      const row = blockRow(block.id);
      if (row) {
        row.className = `block-row type-${latest.type}`;
        const gutterEl = row.querySelector('.block-gutter');
        if (gutterEl) gutterEl.textContent = E.ELEMENT_LABELS[latest.type] || latest.type;
      }
      text.className = `block ${latest.type}`;
      text.dataset.type = latest.type;
      if (latest.type === 'scene') renderScenes();
      refreshStats();
    });

    row.appendChild(gutter);
    row.appendChild(text);
    return row;
  }

  // setBlockDomText / readBlockText / placeCaret* / isCaretAtEnd / placeholderFor
  // now live in ./views/script/block-dom.js (Phase 0 extraction).

  function onBlockPaste(e, id, textEl) {
    e.preventDefault();
    const paste = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
    const b = getBlock(id);
    if (!b) return;
    // insert plain text at caret
    const sel = window.getSelection();
    if (!sel.rangeCount) {
      b.text = (b.text || '') + paste;
      setBlockDomText(textEl, b.text);
      onBlockInput(id, textEl);
      return;
    }
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(paste);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    b.text = readBlockText(textEl);
    // flatten any accidental markup after paste
    setBlockDomText(textEl, b.text);
    placeCaretEnd(textEl);
    onBlockInput(id, textEl);
  }

  function onBlockFocus(id) {
    state.activeBlockId = id;
    const b = getBlock(id);
    if (!b) return;
    if (els.elementSelect) els.elementSelect.value = b.type === 'note' ? 'general' : b.type;
    els.statusElement.textContent = E.ELEMENT_LABELS[b.type] || b.type;
    els.badgeType.textContent = E.ELEMENT_LABELS[b.type] || b.type;
    els.badge.classList.add('show');
    clearTimeout(onBlockFocus._t);
    onBlockFocus._t = setTimeout(() => els.badge.classList.remove('show'), 1800);
    highlightSceneForBlock(id);
    syncElementRibbon(b.type);
    const hint = $('#ribbonHint');
    if (hint) hint.textContent = E.ELEMENT_LABELS[b.type] || b.type;
  }

  function syncElementRibbon(type) {
    const t = type === 'note' ? 'note' : type;
    $$('.el-btn[data-element]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.element === t);
    });
  }

  /** One-click style from ribbon (WriterDuet pattern) */
  function applyElementFromRibbon(type) {
    ensureActiveBlock();
    if (!state.activeBlockId) return;
    setBlockType(state.activeBlockId, type);
    const textEl = blockEl(state.activeBlockId);
    if (textEl) textEl.focus();
  }

  function ensureActiveBlock() {
    if (state.activeBlockId && getBlock(state.activeBlockId)) return;
    if (!state.project.blocks.length) {
      state.project.blocks.push(E.createBlock('action', ''));
      renderBlocks();
    }
    state.activeBlockId = state.project.blocks[state.project.blocks.length - 1].id;
  }

  /**
   * Insert text snippet at current line.
   * INT./EXT. prefixes auto-switch to Scene Heading.
   */
  function insertSnippet(snip, { forceScene = false } = {}) {
    ensureActiveBlock();
    const id = state.activeBlockId;
    const b = getBlock(id);
    const textEl = blockEl(id);
    if (!b || !textEl) return;

    const isIntExtPrefix = /^(INT\.|EXT\.|I\/E\.|EST\.)\s*/i.test(snip) && !/^\s*-\s+/.test(snip);
    const isTimeSuffix = /^\s*-\s+/i.test(snip);

    // Time-of-day buttons only decorate scene headings
    if (isTimeSuffix) {
      if (b.type !== 'scene') {
        if ((b.text || '').trim()) {
          const nb = E.createBlock('scene', (`INT. LOCATION${snip}`).toUpperCase());
          const idx = indexOfBlock(id);
          exec('blocks.insert', { index: idx + 1, block: nb }, { label: 'Insert scene' });
          renderBlocks();
          renderScenes();
          focusBlock(nb.id, true);
          return;
        }
        const text = (`INT. LOCATION${snip}`).toUpperCase();
        exec('blocks.setType', { id, type: 'scene', text }, { label: 'Change to scene' });
        renderBlocks();
        renderScenes();
        selectWordInBlock(id, 'LOCATION');
        onBlockFocus(id);
        return;
      }
    }

    if ((forceScene || isIntExtPrefix) && b.type !== 'scene') {
      if ((b.text || '').trim()) {
        const nb = E.createBlock('scene', snip.toUpperCase().replace(/\s+$/, ' '));
        const idx = indexOfBlock(id);
        exec('blocks.insert', { index: idx + 1, block: nb }, { label: 'Insert scene' });
        renderBlocks();
        renderScenes();
        focusBlock(nb.id);
        placeCaretEnd(blockEl(nb.id));
        return;
      }
      setBlockType(id, 'scene');
    }

    // Re-fetch after possible type change
    const block = getBlock(id);
    const el = blockEl(id);
    let cur = readBlockText(el);
    let nextText;

    if (isTimeSuffix) {
      cur = cur.replace(/\s*-\s*(DAY|NIGHT|DAWN|DUSK|MORNING|EVENING|CONTINUOUS|LATER|SAME|AFTERNOON)\s*$/i, '');
      nextText = (cur.trimEnd() + snip).toUpperCase();
    } else if (isIntExtPrefix || forceScene) {
      const rest = cur.replace(/^(INT\.?\/EXT\.?|I\/E\.?|E\/I\.?|INT\.?|EXT\.?|EST\.?)\s*/i, '');
      nextText = (snip + rest).toUpperCase();
    } else {
      nextText = cur + snip;
    }

    if (block.type === 'scene' || block.type === 'transition' || block.type === 'shot' || block.type === 'character') {
      nextText = nextText.toUpperCase();
    }
    exec('blocks.setText', { id, text: nextText }, { mergeKey: `block:${id}`, label: 'Insert snippet' });
    setBlockDomText(el, nextText);
    placeCaretEnd(el);
    if (block.type === 'scene') renderScenes();
    refreshStats();
    onBlockFocus(id);
  }

  function selectWordInBlock(id, word) {
    const el = blockEl(id);
    if (!el) return;
    el.focus();
    try {
      const tn = el.firstChild;
      const text = readBlockText(el);
      const start = text.indexOf(word);
      if (tn && start >= 0) {
        const range = document.createRange();
        const sel = window.getSelection();
        range.setStart(tn, start);
        range.setEnd(tn, start + word.length);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
    } catch {
      /* fall through */
    }
    placeCaretEnd(el);
  }

  function insertFullSceneSlug(slug) {
    ensureActiveBlock();
    const id = state.activeBlockId;
    const b = getBlock(id);
    if (!b) return;
    if ((b.text || '').trim()) {
      const nb = E.createBlock('scene', slug);
      const action = E.createBlock('action', '');
      const idx = indexOfBlock(id);
      exec(
        'blocks.insertMany',
        { index: idx + 1, blocks: [nb, action], label: 'Insert scene' },
        { label: 'Insert scene' }
      );
      renderBlocks();
      renderScenes();
      focusBlock(nb.id, true);
      return;
    }
    exec('blocks.setType', { id, type: 'scene', text: slug }, { label: 'Change to scene' });
    renderBlocks();
    renderScenes();
    refreshStats();
    selectWordInBlock(id, 'LOCATION');
    onBlockFocus(id);
  }

  function insertLineSnippet(line, type) {
    ensureActiveBlock();
    const id = state.activeBlockId;
    const b = getBlock(id);
    if (!b) return;

    if (type === 'character-suffix') {
      let tid = id;
      let target = b;
      if (b.type !== 'character') {
        const idx = indexOfBlock(id);
        for (let i = idx; i >= 0; i--) {
          if (state.project.blocks[i].type === 'character') {
            target = state.project.blocks[i];
            tid = target.id;
            break;
          }
        }
        if (target.type !== 'character') {
          setBlockType(id, 'character');
          target = getBlock(id);
          tid = id;
        }
      }
      const name = (target.text || '').replace(/\s*\((V\.O\.|O\.S\.|O\.C\.|CONT'D|CONT’D)\)\s*$/i, '').trim();
      const nextText = `${name} ${line}`.toUpperCase();
      exec('blocks.setText', { id: tid, text: nextText }, { mergeKey: `block:${tid}` });
      const el = blockEl(tid);
      if (el) {
        setBlockDomText(el, nextText);
        focusBlock(tid);
        placeCaretEnd(el);
      }
      return;
    }

    // transition / new line
    if ((b.text || '').trim()) {
      const nb = E.createBlock(type === 'transition' ? 'transition' : type, line);
      const idx = indexOfBlock(id);
      exec('blocks.insert', { index: idx + 1, block: nb }, { label: 'Insert line' });
      renderBlocks();
      focusBlock(nb.id);
    } else {
      const t = type === 'transition' ? 'transition' : type;
      exec('blocks.setType', { id, type: t, text: line }, { label: `Change to ${t}` });
      renderBlocks();
      placeCaretEnd(blockEl(id));
      onBlockFocus(id);
    }
    refreshStats();
  }

  function insertStructureBlock(kind) {
    ensureActiveBlock();
    const id = state.activeBlockId;
    const idx = indexOfBlock(id);
    let block;
    if (kind === 'act-start') {
      block = E.createBlock('general', 'ACT ONE');
    } else if (kind === 'act-end') {
      block = E.createBlock('general', 'END OF ACT');
    } else if (kind === 'dual') {
      block = E.createBlock('general', '== DUAL DIALOGUE ==');
    } else {
      return;
    }
    exec('blocks.insert', { index: idx + 1, block }, { label: 'Insert structure' });
    renderBlocks();
    focusBlock(block.id);
  }

  function refreshCastSnippets() {
    const root = $('#snipCast');
    if (!root) return;
    const names = new Set();
    (state.project.characters || []).forEach((c) => {
      if (c.name) names.add(c.name.replace(/\s*\(.*\)\s*$/, '').trim().toUpperCase());
    });
    state.project.blocks.forEach((b) => {
      if (b.type === 'character' && b.text) {
        names.add(b.text.replace(/\s*\(.*\)\s*$/, '').trim().toUpperCase());
      }
    });
    const list = Array.from(names).filter(Boolean).sort().slice(0, 12);
    root.innerHTML = list
      .map((n) => `<button type="button" class="snip-btn cast-chip" data-cast="${escapeAttr(n)}" title="Insert ${escapeAttr(n)}">${escapeHtml(n)}</button>`)
      .join('');
    root.querySelectorAll('.cast-chip').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        insertCharacterChip(btn.dataset.cast);
      };
    });
  }

  function insertCharacterChip(name) {
    ensureActiveBlock();
    const id = state.activeBlockId;
    const b = getBlock(id);
    if (!b) return;
    if ((b.text || '').trim()) {
      const nb = E.createBlock('character', name);
      const dlg = E.createBlock('dialogue', '');
      const idx = indexOfBlock(id);
      exec(
        'blocks.insertMany',
        { index: idx + 1, blocks: [nb, dlg], label: 'Insert character' },
        { label: 'Insert character' }
      );
      renderBlocks();
      focusBlock(dlg.id);
      return;
    }
    exec('blocks.setType', { id, type: 'character', text: name }, { label: 'Change to character' });
    renderBlocks();
    insertAfter(id);
    refreshStats();
  }

  function onBlockInput(id, textEl) {
    const b = getBlock(id);
    if (!b) return;
    let text = readBlockText(textEl);
    // Keep DOM as plain text after every input so Chromium doesn't nest <div>s
    if (textEl.querySelector && textEl.querySelector('div, p, span, font, br')) {
      const caretAtEnd = isCaretAtEnd(textEl);
      setBlockDomText(textEl, text);
      if (caretAtEnd) placeCaretEnd(textEl);
      text = readBlockText(textEl);
    }
    // Undoable typing — merges into one stack entry per block within 1s
    exec('blocks.setText', { id, text }, { mergeKey: `block:${id}` });
    if (b.type === 'scene') renderScenes();
    if (b.type === 'character') {
      // b may be stale; use store block for autocomplete query
      maybeShowAc(textEl, getBlock(id));
    }
    refreshStats();
    // Paginate off the hot path; reflow pages without destroying the caret
    schedulePageLayout();
    strikeTypebar();
  }

  function onBlockKeydown(e, id, textEl) {
    const b = getBlock(id);
    if (!b) return;

    // Allow normal typing — never preventDefault on printable keys
    if (els.ac.classList.contains('show')) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.acIndex = Math.min(state.acIndex + 1, state.acItems.length - 1);
        paintAc();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.acIndex = Math.max(state.acIndex - 1, 0);
        paintAc();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (state.acItems[state.acIndex]) {
          e.preventDefault();
          applyAc(state.acItems[state.acIndex], textEl, b);
          return;
        }
      }
      if (e.key === 'Escape') {
        hideAc();
        return;
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      // sync text before type change
      b.text = readBlockText(textEl);
      cycleType(id, e.shiftKey);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      hideAc();
      b.text = readBlockText(textEl);
      insertAfter(id);
      return;
    }

    if (e.key === 'Backspace') {
      const text = readBlockText(textEl);
      const sel = window.getSelection();
      const atStart =
        sel &&
        sel.rangeCount &&
        sel.getRangeAt(0).collapsed &&
        (() => {
          const r = sel.getRangeAt(0);
          const pre = document.createRange();
          pre.selectNodeContents(textEl);
          pre.setEnd(r.startContainer, r.startOffset);
          return pre.toString().length === 0;
        })();
      if (!text || (atStart && !text)) {
        const idx = indexOfBlock(id);
        if (idx > 0 && !text) {
          e.preventDefault();
          const prevId = state.project.blocks[idx - 1].id;
          exec('blocks.remove', { id }, { label: 'Delete block' });
          renderBlocks();
          renderScenes();
          focusBlock(prevId);
          refreshStats();
        }
      }
    }

    // Arrow up/down between blocks at edges
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const idx = indexOfBlock(id);
      if (e.key === 'ArrowUp' && idx > 0) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const r = sel.getRangeAt(0);
          const pre = document.createRange();
          pre.selectNodeContents(textEl);
          pre.setEnd(r.startContainer, r.startOffset);
          if (pre.toString().length === 0 && r.collapsed) {
            e.preventDefault();
            b.text = readBlockText(textEl);
            focusBlock(state.project.blocks[idx - 1].id);
          }
        }
      }
      if (e.key === 'ArrowDown' && idx < state.project.blocks.length - 1) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const r = sel.getRangeAt(0);
          const post = document.createRange();
          post.selectNodeContents(textEl);
          post.setStart(r.endContainer, r.endOffset);
          if (post.toString().length === 0 && r.collapsed) {
            e.preventDefault();
            b.text = readBlockText(textEl);
            focusBlock(state.project.blocks[idx + 1].id);
          }
        }
      }
    }
  }

  function cycleType(id, reverse = false) {
    const b = getBlock(id);
    if (!b) return;
    if (reverse) {
      const keys = Object.keys(E.TAB_CYCLE);
      const prev = keys.find((k) => E.TAB_CYCLE[k] === b.type) || 'action';
      setBlockType(id, prev);
    } else {
      setBlockType(id, E.TAB_CYCLE[b.type] || 'action');
    }
  }

  function setBlockType(id, type) {
    const b = getBlock(id);
    if (!b) return;
    const textEl = blockEl(id);
    const rawText = textEl ? readBlockText(textEl) : b.text;
    const nextType = type === 'note' ? 'note' : E.normalizeType(type);
    const norm = E.normalizeBlock({ ...b, type: nextType, text: rawText });
    exec('blocks.setType', {
      id,
      type: norm.type,
      text: norm.text,
    }, { label: `Change to ${E.ELEMENT_LABELS[norm.type] || norm.type}` });

    const latest = getBlock(id);
    if (!latest) return;
    const row = blockRow(id);
    if (row) {
      row.className = `block-row type-${latest.type}`;
      const gutter = row.querySelector('.block-gutter');
      if (gutter) gutter.textContent = E.ELEMENT_LABELS[latest.type] || latest.type;
    }
    if (textEl) {
      textEl.className = `block ${latest.type}`;
      textEl.dataset.type = latest.type;
      textEl.dataset.placeholder = placeholderFor(latest.type);
      setBlockDomText(textEl, latest.text || '');
      placeCaretEnd(textEl);
    }
    if (els.elementSelect) {
      els.elementSelect.value = ['scene','action','character','parenthetical','dialogue','transition','shot','general'].includes(latest.type)
        ? latest.type
        : 'general';
    }
    els.statusElement.textContent = E.ELEMENT_LABELS[latest.type] || latest.type;
    els.badgeType.textContent = E.ELEMENT_LABELS[latest.type] || latest.type;
    syncElementRibbon(latest.type);
    if (latest.type === 'scene') renderScenes();
    refreshStats();
  }

  /**
   * Industry Enter flow (Final Draft defaults):
   *   Scene → Action
   *   Action → Action
   *   Character → Dialogue
   *   Parenthetical → Dialogue
   *   Dialogue → Character (next speaker)
   *   Empty Character → Action (escape dialogue block)
   *   Transition → Scene
   */
  function insertAfter(id) {
    const b = getBlock(id);
    if (!b) return;
    const curEl = blockEl(id);
    // Flush + normalize current line into the store first
    if (curEl) {
      const raw = readBlockText(curEl);
      const norm = E.normalizeBlock({ ...b, text: raw });
      if (norm.type !== b.type) {
        exec('blocks.setType', { id, type: norm.type, text: norm.text });
      } else if (norm.text !== b.text) {
        exec('blocks.setText', { id, text: norm.text }, { mergeKey: `block:${id}` });
      }
    }
    const cur = getBlock(id);
    if (!cur) return;

    let type = E.ENTER_NEXT[cur.type] || 'action';
    if (cur.type === 'dialogue') type = 'character';
    if (cur.type === 'character' && !(cur.text || '').trim()) type = 'action';
    if (cur.type === 'dialogue' && !(cur.text || '').trim()) type = 'character';

    const nb = E.createBlock(type, '');
    const idx = indexOfBlock(id);
    exec('blocks.insert', { index: idx + 1, block: nb }, { label: 'Insert block' });
    renderBlocks();
    if (type === 'scene') renderScenes();
    requestAnimationFrame(() => focusBlock(nb.id));
    refreshStats();
  }

  function insertSceneAtEnd() {
    const nb = E.createBlock('scene', 'INT. LOCATION - DAY');
    const action = E.createBlock('action', '');
    const index = (state.project.blocks || []).length;
    exec(
      'blocks.insertMany',
      { index, blocks: [nb, action], label: 'Insert scene' },
      { label: 'Insert scene' }
    );
    renderBlocks();
    renderScenes();
    setView('script');
    focusBlock(nb.id, true);
    refreshStats();
  }

  function focusBlock(id, selectAll = false) {
    requestAnimationFrame(() => {
      const textEl = blockEl(id);
      if (!textEl) return;
      textEl.focus();
      try {
        if (selectAll && (textEl.textContent || '').length) {
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(textEl);
          sel.removeAllRanges();
          sel.addRange(range);
        } else {
          placeCaretEnd(textEl);
        }
      } catch {
        placeCaretEnd(textEl);
      }
      onBlockFocus(id);
    });
  }

  function focusFirstBlock() {
    // Prefer first empty action, else first block
    const blocks = state.project.blocks;
    if (!blocks.length) return;
    const emptyAction = blocks.find((b) => b.type === 'action' && !(b.text || '').trim());
    focusBlock((emptyAction || blocks[0]).id);
  }

  function getBlock(id) {
    return state.project.blocks.find((b) => b.id === id);
  }
  function indexOfBlock(id) {
    return state.project.blocks.findIndex((b) => b.id === id);
  }
  function blockEl(id) {
    // Search the whole paper stack (blocks live on multiple pages)
    if (!id || !els.pageStack) return null;
    const safe = String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return els.pageStack.querySelector(`.block[data-id="${safe}"]`);
  }
  function blockRow(id) {
    if (!id || !els.pageStack) return null;
    const safe = String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return els.pageStack.querySelector(`.block-row[data-id="${safe}"]`);
  }

  /* ---------- scenes sidebar ---------- */

  function renderScenes() {
    const list = els.sceneList;
    list.innerHTML = '';
    let n = 0;
    state.project.blocks.forEach((b) => {
      if (b.type !== 'scene') return;
      n += 1;
      const item = document.createElement('div');
      item.className = 'scene-item';
      item.dataset.blockId = b.id;
      item.innerHTML = `<div class="scene-num">SCENE ${n}</div><div class="scene-title">${escapeHtml(b.text || 'Untitled scene')}</div>`;
      item.onclick = () => {
        setView('script');
        focusBlock(b.id, true);
        item.scrollIntoView({ block: 'nearest' });
      };
      list.appendChild(item);
    });
    if (!n) {
      list.innerHTML = `<div style="padding:12px;color:var(--text-faint);font-size:12px">No scenes yet. Add a Scene Heading (Ctrl+1) or press +.</div>`;
    }
  }

  function highlightSceneForBlock(blockId) {
    const idx = indexOfBlock(blockId);
    let sceneId = null;
    for (let i = idx; i >= 0; i--) {
      if (state.project.blocks[i].type === 'scene') {
        sceneId = state.project.blocks[i].id;
        break;
      }
    }
    $$('.scene-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.blockId === sceneId);
    });
  }

  /* ---------- cards / cast / locations ---------- */

  function renderCards() {
    const board = els.cardsBoard;
    board.innerHTML = '';
    const cards = state.project.cards || [];
    if (!cards.length) {
      board.innerHTML = `<div style="grid-column:1/-1;color:var(--text-faint);padding:24px">No cards yet. Click “Sync from scenes” or add a beat card.</div>`;
      return;
    }
    cards.forEach((card, i) => {
      const el = document.createElement('div');
      el.className = card.orphaned ? 'card orphaned' : 'card';
      // card.color came from project JSON straight into a style attribute
      // unescaped (findings.md §5.5). CSP blocks script execution so it was not
      // full XSS, but it is still an attribute-injection hole. Whitelist instead.
      const swatch = safeColor(card.color);
      el.innerHTML = `
        <div class="card-top">
          <span class="card-swatch" style="background:${swatch}"></span>
          <span class="card-num">#${card.number || i + 1}</span>
          ${card.orphaned ? '<span class="card-orphan-tag" title="This card&#39;s scene is no longer in the script. Your notes were kept.">no scene</span>' : ''}
        </div>
        <input class="card-title-input" value="${escapeAttr(card.title || '')}" />
        <textarea class="card-summary" placeholder="What happens / emotional beat…">${escapeHtml(card.summary || '')}</textarea>
        <input class="card-beat" placeholder="Story beat (setup, turn, climax…)" value="${escapeAttr(card.beat || '')}" />
      `;
      el.querySelector('.card-title-input').oninput = (e) => {
        exec(
          'cards.update',
          { id: card.id, patch: { title: e.target.value } },
          { mergeKey: `card:${card.id}:title`, label: 'Edit card' }
        );
      };
      el.querySelector('.card-summary').oninput = (e) => {
        exec(
          'cards.update',
          { id: card.id, patch: { summary: e.target.value } },
          { mergeKey: `card:${card.id}:summary`, label: 'Edit card' }
        );
      };
      el.querySelector('.card-beat').oninput = (e) => {
        exec(
          'cards.update',
          { id: card.id, patch: { beat: e.target.value } },
          { mergeKey: `card:${card.id}:beat`, label: 'Edit card' }
        );
      };
      board.appendChild(el);
    });
  }

  function renderCharacters() {
    const root = els.charList;
    root.innerHTML = '';
    const list = state.project.characters || [];
    if (!list.length) {
      root.innerHTML = `<div style="color:var(--text-faint);font-size:13px">No characters yet. Write dialogue or click Scan script.</div>`;
      return;
    }
    list.forEach((c) => {
      const el = document.createElement('div');
      el.className = 'entity';
      el.innerHTML = `
        <div class="entity-head">
          <strong>${escapeHtml(c.name || 'Unnamed')}</strong>
          <button class="ghost danger-del">Delete</button>
        </div>
        <div class="fields">
          <input data-f="name" value="${escapeAttr(c.name || '')}" placeholder="NAME" />
          <input data-f="role" value="${escapeAttr(c.role || '')}" placeholder="Role (protagonist, foil…)" />
          <textarea data-f="description" placeholder="Description / look / want">${escapeHtml(c.description || '')}</textarea>
          <textarea data-f="notes" placeholder="Notes">${escapeHtml(c.notes || '')}</textarea>
        </div>
      `;
      el.querySelectorAll('[data-f]').forEach((input) => {
        input.addEventListener('input', () => {
          const field = input.dataset.f;
          exec(
            'bible.updateCharacter',
            { id: c.id, patch: { [field]: input.value } },
            { mergeKey: `char:${c.id}:${field}`, label: 'Edit character' }
          );
          if (field === 'name') {
            el.querySelector('strong').textContent = input.value || 'Unnamed';
          }
        });
      });
      el.querySelector('.danger-del').onclick = () => {
        exec('bible.removeCharacter', { id: c.id }, { label: 'Delete character' });
        renderCharacters();
      };
      root.appendChild(el);
    });
  }

  function renderLocations() {
    const root = els.locList;
    root.innerHTML = '';
    const list = state.project.locations || [];
    if (!list.length) {
      root.innerHTML = `<div style="color:var(--text-faint);font-size:13px">No locations yet. Add scene headings or click Scan script.</div>`;
      return;
    }
    list.forEach((loc) => {
      const el = document.createElement('div');
      el.className = 'entity';
      el.innerHTML = `
        <div class="entity-head">
          <strong>${escapeHtml(loc.name || 'Unnamed')}</strong>
          <button class="ghost danger-del">Delete</button>
        </div>
        <div class="fields">
          <input data-f="name" value="${escapeAttr(loc.name || '')}" placeholder="Location name" />
          <input data-f="intExt" value="${escapeAttr(loc.intExt || '')}" placeholder="INT / EXT / I-E" />
          <input data-f="times" value="${escapeAttr((loc.times || []).join(', '))}" placeholder="Times of day" />
          <textarea data-f="notes" placeholder="Notes / production">${escapeHtml(loc.notes || '')}</textarea>
        </div>
      `;
      el.querySelectorAll('[data-f]').forEach((input) => {
        input.addEventListener('input', () => {
          const field = input.dataset.f;
          const patch =
            field === 'times'
              ? { times: input.value.split(',').map((s) => s.trim()).filter(Boolean) }
              : { [field]: input.value };
          exec(
            'bible.updateLocation',
            { id: loc.id, patch },
            { mergeKey: `loc:${loc.id}:${field}`, label: 'Edit location' }
          );
          if (field === 'name') el.querySelector('strong').textContent = input.value || 'Unnamed';
        });
      });
      el.querySelector('.danger-del').onclick = () => {
        exec('bible.removeLocation', { id: loc.id }, { label: 'Delete location' });
        renderLocations();
      };
      root.appendChild(el);
    });
  }

  function renderTitleForm() {
    const tp = state.project.titlePage || {};
    $('#tpTitle').value = tp.title || '';
    $('#tpAuthor').value = tp.writtenBy || '';
    $('#tpBased').value = tp.basedOn || '';
    $('#tpDate').value = tp.draftDate || '';
    $('#tpContact').value = tp.contact || '';
  }

  function syncTitleFromForm() {
    exec(
      'meta.setTitlePage',
      {
        titlePage: {
          ...(state.project.titlePage || {}),
          title: $('#tpTitle').value,
          writtenBy: $('#tpAuthor').value,
          basedOn: $('#tpBased').value,
          draftDate: $('#tpDate').value,
          contact: $('#tpContact').value,
        },
      },
      { mergeKey: 'meta:title', label: 'Title page' }
    );
    updateChrome();
  }

  function renderHistory() {
    const list = state.project.history || [];
    if (!list.length) {
      els.historyList.innerHTML = '<div style="color:var(--text-faint)">No snapshots yet.</div>';
      return;
    }
    els.historyList.innerHTML = list
      .slice()
      .reverse()
      .slice(0, 12)
      .map(
        (h) =>
          `<div style="padding:6px 0;border-bottom:1px solid var(--border-soft);display:flex;justify-content:space-between;gap:8px">
            <span>${escapeHtml(h.label || 'edit')}<br><span style="color:var(--text-faint)">${new Date(h.at).toLocaleString()}</span></span>
            <button class="ghost" data-hid="${h.id}">Restore</button>
          </div>`
      )
      .join('');
    els.historyList.querySelectorAll('button[data-hid]').forEach((btn) => {
      btn.onclick = () => {
        const h = list.find((x) => x.id === btn.dataset.hid);
        if (!h) return;

        const when = h.at ? new Date(h.at).toLocaleString() : 'this snapshot';
        if (
          !confirm(
            `Restore "${h.label || 'edit'}" from ${when}?\n\n` +
              'Your current script will be replaced — but it gets snapshotted first, ' +
              'so you can restore back to it.'
          )
        ) {
          return;
        }

        // One undoable command (store design § catalogue project.restoreRevision).
        // Inverse restores the live blocks — no separate "before restore" snapshot needed.
        exec(
          'project.restoreRevision',
          {
            blocks: JSON.parse(JSON.stringify(h.blocks)),
            label: `Restore “${h.label || 'edit'}”`,
          },
          { label: `Restore “${h.label || 'edit'}”` }
        );
        renderBlocks();
        renderScenes();
        refreshStats();
        renderHistory();
      };
    });
  }

  function refreshStats() {
    const s = E.computeStats(state.project);
    $('#stPages').textContent = s.pages;
    $('#stRuntime').textContent = `${s.runtimeMin}m`;
    $('#stScenes').textContent = s.scenes;
    $('#stWords').textContent = s.words;
    $('#stChars').textContent = s.characters;
    $('#stDlg').textContent = `${s.dialoguePct}%`;
    paintPageNumbers(s.pages);
    const lint = E.lintScript(state.project);
    const warns = lint.issues.filter((i) => i.level === 'warn').length;
    const lintBit = warns ? ` · ${warns} format flag${warns > 1 ? 's' : ''}` : '';
    els.statusCounts.textContent = `${s.pages}p · ~${s.runtimeMin} min · ${s.scenes} sc · ${s.words}w${lintBit}`;
    els.statusCounts.title = lint.issues
      .slice(0, 12)
      .map((i) => `${i.level.toUpperCase()}${i.line ? ` L${i.line}` : ''}: ${i.msg}`)
      .join('\n') || 'Industry format OK';
    refreshCastSnippets();
    renderLintPanel(lint);
  }

  function renderLintPanel(lint) {
    let box = $('#lintList');
    if (!box) return;
    const issues = (lint && lint.issues) || [];
    if (!issues.length) {
      box.innerHTML = '<div style="color:var(--text-faint);font-size:12px">Format looks clean.</div>';
      return;
    }
    box.innerHTML = issues
      .slice(0, 20)
      .map(
        (i) =>
          `<div class="lint-item lint-${i.level}" data-line="${i.line || 0}">
            <span class="lint-lvl">${i.level}</span>
            ${i.line ? `<span class="lint-ln">#${i.line}</span>` : ''}
            <span class="lint-msg">${escapeHtml(i.msg)}</span>
          </div>`
      )
      .join('');
    box.querySelectorAll('.lint-item').forEach((el) => {
      el.onclick = () => {
        const line = +el.dataset.line;
        if (!line) return;
        const b = state.project.blocks[line - 1];
        if (b) {
          setView('script');
          focusBlock(b.id, true);
        }
      };
    });
  }

  function updateChrome() {
    const title = state.project.titlePage?.title || 'Untitled Screenplay';
    els.projectTitleLabel.textContent = title;
    document.title = `${state.dirty ? '• ' : ''}${title} — Platen`;
    els.dirtyDot.classList.toggle('on', state.dirty);
    els.statusPath.textContent = state.filePath
      ? state.filePath
      : 'Unsaved project · autosave on';
  }

  /* ---------- views / theme / focus ---------- */

  function setView(name) {
    state.view = name || 'script';
    $$('.view').forEach((v) => v.classList.remove('active'));
    const target = $(`#view-${state.view}`);
    if (target) target.classList.add('active');
    $$('.view-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
    if (state.view === 'cards' && !(state.project.cards || []).length) {
      state.project.cards = E.autoCardsFromScenes(state.project);
      renderCards();
    }
    if (state.view === 'characters') renderCharacters();
    if (state.view === 'locations') renderLocations();
    if (state.view === 'title') renderTitleForm();
  }

  function toggleTheme() {
    const next = document.documentElement.classList.contains('theme-light') ? 'dark' : 'light';
    applyTheme(next);
    exec(
      'meta.setSettings',
      { settings: { ...(state.project.settings || {}), theme: next } },
      { mergeKey: 'meta:settings', label: 'Theme' }
    );
  }

  function applyTheme(theme) {
    document.documentElement.classList.toggle('theme-light', theme === 'light');
    document.documentElement.classList.toggle('theme-dark', theme !== 'light');
  }

  function toggleFocus() {
    window.PlatenChrome?.cycleFocus?.();
  }

  function toggleTypewriter() {
    const cur = window.PlatenChrome?.getFocus?.() || 'desk';
    window.PlatenChrome?.setFocusMode?.(cur === 'typewriter' ? 'desk' : 'typewriter');
  }

  function setTypewriter(on) {
    window.PlatenChrome?.setFocusMode?.(on ? 'typewriter' : 'desk');
  }

  window.addEventListener('platen:focus', (e) => {
    const mode = e.detail?.mode;
    state.typewriterMode = mode === 'typewriter';
    state.focusMode = mode === 'paper' || mode === 'typewriter';
    if (mode !== 'desk') setView('script');
  });

  function showHelp(show) {
    els.helpModal.classList.toggle('show', !!show);
  }

  function toggleFind(show) {
    els.findBar.classList.toggle('show', show);
    document.getElementById('app')?.classList.toggle('find-open', !!show);
    if (show) {
      els.findInput.focus();
      els.findInput.select();
    }
  }

  /* ---------- find / replace ---------- */

  function findNext() {
    const q = els.findInput.value;
    if (!q) return;
    const blocks = state.project.blocks;
    const start = state.findIndex + 1;
    for (let i = 0; i < blocks.length; i++) {
      const idx = (start + i) % blocks.length;
      if ((blocks[idx].text || '').toLowerCase().includes(q.toLowerCase())) {
        state.findIndex = idx;
        setView('script');
        focusBlock(blocks[idx].id, true);
        return;
      }
    }
  }

  function replaceOne() {
    const q = els.findInput.value;
    const r = els.replaceInput.value;
    if (!q || state.findIndex < 0) {
      findNext();
      return;
    }
    const b = state.project.blocks[state.findIndex];
    if (!b) return;
    const re = new RegExp(escapeRegExp(q), 'i');
    const nextText = (b.text || '').replace(re, r);
    if (nextText === b.text) {
      findNext();
      return;
    }
    exec('blocks.setText', { id: b.id, text: nextText }, { label: 'Replace' });
    renderBlocks();
    focusBlock(b.id);
    refreshStats();
  }

  function replaceAll() {
    const q = els.findInput.value;
    const r = els.replaceInput.value;
    if (!q) return;
    // Count first (before mutation) so the alert is accurate
    const re = new RegExp(escapeRegExp(q), 'gi');
    let count = 0;
    for (const b of state.project.blocks || []) {
      const m = (b.text || '').match(re);
      if (m) count += m.length;
      re.lastIndex = 0;
    }
    if (!count) {
      alert('No matches.');
      return;
    }
    const result = exec(
      'blocks.replaceAll',
      { find: q, replace: r, caseSensitive: false },
      { label: `Replace all (${count})` }
    );
    if (result.ok && !result.noop) {
      renderBlocks();
      refreshStats();
    }
    alert(`Replaced ${count} occurrence(s).`);
  }

  /* ---------- autocomplete ---------- */

  function maybeShowAc(div, block) {
    if (block.type !== 'character') {
      hideAc();
      return;
    }
    const q = (block.text || '').trim().toUpperCase();
    const names = new Set();
    (state.project.characters || []).forEach((c) => c.name && names.add(c.name.toUpperCase()));
    state.project.blocks.forEach((b) => {
      if (b.type === 'character' && b.text) {
        names.add(b.text.replace(/\s*\(.*\)\s*$/, '').trim().toUpperCase());
      }
    });
    const items = Array.from(names)
      .filter((n) => n && n.includes(q) && n !== q)
      .sort()
      .slice(0, 8);
    if (!items.length || !q) {
      hideAc();
      return;
    }
    state.acItems = items;
    state.acIndex = 0;
    const rect = div.getBoundingClientRect();
    els.ac.style.left = `${rect.left}px`;
    els.ac.style.top = `${rect.bottom + 4}px`;
    paintAc();
    els.ac.classList.add('show');
  }

  function paintAc() {
    els.ac.innerHTML = state.acItems
      .map((n, i) => `<div class="${i === state.acIndex ? 'active' : ''}" data-i="${i}">${escapeHtml(n)}</div>`)
      .join('');
    els.ac.querySelectorAll('div').forEach((d) => {
      d.onmousedown = (e) => {
        e.preventDefault();
        const b = getBlock(state.activeBlockId);
        const div = blockEl(state.activeBlockId);
        applyAc(state.acItems[+d.dataset.i], div, b);
      };
    });
  }

  function applyAc(name, textEl, block) {
    if (!block || !textEl) return;
    exec('blocks.setText', { id: block.id, text: name }, { mergeKey: `block:${block.id}` });
    setBlockDomText(textEl, name);
    placeCaretEnd(textEl);
    hideAc();
  }

  function hideAc() {
    els.ac.classList.remove('show');
    state.acItems = [];
  }

  /* ---------- global keys ---------- */

  function onGlobalKeydown(e) {
    const mod = e.ctrlKey || e.metaKey;
    // Never hijack plain character keys — only shortcuts
    if (!mod && e.key !== 'F11') return;

    // Own undo/redo (Chromium CE undo is wiped by renderBlocks)
    if (mod && !e.altKey && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      performUndo();
      return;
    }
    if (mod && !e.altKey && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
      e.preventDefault();
      performRedo();
      return;
    }

    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveProject(e.shiftKey);
    }
    if (mod && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      openProject();
    }
    if (mod && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      newProject();
    }
    if (mod && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      toggleFind(true);
    }
    if (mod && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      exportPdf();
    }
    if (mod && e.key.toLowerCase() === 't' && !e.shiftKey) {
      e.preventDefault();
      toggleTheme();
    }
    // F11 handled in ui-chrome for focus cycle
    if (mod && e.shiftKey && e.key.toLowerCase() === 'w') {
      e.preventDefault();
      toggleTypewriter();
    }
    if (mod && !e.shiftKey && e.key >= '1' && e.key <= '7') {
      const map = ['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot'];
      if (state.activeBlockId) {
        e.preventDefault();
        setBlockType(state.activeBlockId, map[+e.key - 1]);
      }
    }
    if (mod && e.shiftKey && e.key >= '1' && e.key <= '6') {
      const views = ['script', 'cards', 'characters', 'locations', 'title', 'notes'];
      e.preventDefault();
      setView(views[+e.key - 1]);
    }
  }

  /* ---------- utils (pure helpers live in views/shared/text.js) ---------- */

  function downloadBlob(text, name, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  init();
})();
