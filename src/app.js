/* global scriptdesk */
import {
  setBlockDomText,
  readBlockText,
  placeCaretEnd,
  placeCaretStart,
  isCaretAtEnd,
  placeholderFor,
} from './views/script/block-dom.js';
import { writeAutosave, readAutosave } from './core/persist/autosave.js';

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
    suppressDirty: false,
  };

  const MONO_CARD = ['#111', '#333', '#555', '#777', '#222', '#444', '#666', '#000'];

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const els = {
    welcome: $('#welcome'),
    blocks: $('#blocks'),
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
    pageNumber: $('#pageNumber'),
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
      state.project.cards = E.autoCardsFromScenes(state.project);
      markDirty();
      renderCards();
    };
    $('#btnAddCard').onclick = () => {
      const n = (state.project.cards || []).length + 1;
      state.project.cards.push({
        id: E.uid(),
        sceneId: null,
        number: n,
        title: `Beat ${n}`,
        summary: '',
        color: MONO_CARD[n % MONO_CARD.length],
        beat: '',
      });
      markDirty();
      renderCards();
    };
    $('#btnScanChars').onclick = () => {
      state.project.characters = E.extractCharacters(state.project);
      markDirty();
      renderCharacters();
      refreshStats();
    };
    $('#btnAddChar').onclick = () => {
      state.project.characters.push({
        id: E.uid(),
        name: 'NEW CHARACTER',
        role: '',
        description: '',
        notes: '',
      });
      markDirty();
      renderCharacters();
    };
    $('#btnScanLocs').onclick = () => {
      state.project.locations = E.extractLocations(state.project);
      markDirty();
      renderLocations();
    };
    $('#btnAddLoc').onclick = () => {
      state.project.locations.push({
        id: E.uid(),
        name: 'NEW LOCATION',
        intExt: 'INT',
        times: [],
        notes: '',
      });
      markDirty();
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
      state.project.notes = els.notesArea.value;
      markDirty();
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
      state.project = sanitizeProject(normalizeProject(data.project));
      state.filePath = data.filePath || null;
      state.dirty = !!data.dirty;
      hideWelcome();
      fullRender();
      return;
    }
    showWelcome();
  }

  /** Strip gutter labels that used to leak into text when gutter was inside contentEditable */
  function sanitizeProject(project) {
    const labels = Object.values(E.ELEMENT_LABELS || {}).map((s) => s.toUpperCase());
    labels.push('ACTION', 'SCENE HEADING', 'CHARACTER', 'PARENTHETICAL', 'DIALOGUE', 'TRANSITION', 'SHOT', 'GENERAL');
    (project.blocks || []).forEach((b) => {
      if (typeof b.text !== 'string') b.text = '';
      // remove accidental trailing/leading type labels
      let t = b.text.replace(/\r\n/g, '\n');
      labels.forEach((lab) => {
        const reEnd = new RegExp(`\\s*${lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
        const reStart = new RegExp(`^\\s*${lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i');
        // only strip if the whole field is basically the label or label glued on
        if (t.trim().toUpperCase() === lab) t = '';
        else if (reEnd.test(t) && t.trim().length <= lab.length + 2) t = t.replace(reEnd, '');
      });
      b.text = t;
      b.type = E.normalizeType(b.type);
      if (!b.id) b.id = E.uid();
    });
    if (!project.blocks || !project.blocks.length) {
      project.blocks = E.emptyProject().blocks;
    }
    return project;
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
    state.project = E.emptyProject('Untitled Screenplay');
    state.filePath = null;
    state.dirty = false;
    hideWelcome();
    fullRender();
    focusFirstBlock();
  }

  function loadSample() {
    const fountain = `Title: THE LAST SIGNAL
Author: You
Draft date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

===

FADE IN:

INT. RADIO TOWER - NIGHT

Rain hammers the windows. Banks of antique equipment glow green in the dark.

MAYA (30s), headphones half-on, scribbles on a legal pad. Static hisses.

MAYA
(whispering)
Come on. One more time.

She twists a dial. For a second — a voice, clear as glass.

VOICE (V.O.)
If you can hear this... don't answer.

Maya freezes. The static swallows the words.

MAYA
Who is this?

She hits RECORD. The reels spin.

EXT. TOWER BASE - CONTINUOUS

A black sedan idles in the mud. Headlights die.

CUT TO:

INT. RADIO TOWER - NIGHT

Maya pulls the headphones off. Something thuds on the stairs.

MAYA
(into mic)
I'm not leaving. Talk.

BLACKOUT.
`;
    state.project = E.fromFountain(fountain, 'THE LAST SIGNAL');
    state.filePath = null;
    state.dirty = true;
    hideWelcome();
    fullRender();
    focusFirstBlock();
  }

  async function openProject() {
    if (!api) {
      alert('File dialogs require the desktop app.');
      return;
    }
    const res = await api.openProject();
    if (!res) return;
    const { filePath, content } = res;
    if (filePath.toLowerCase().endsWith('.fountain') || filePath.toLowerCase().endsWith('.spmd')) {
      state.project = E.fromFountain(content, baseName(filePath));
    } else {
      try {
        const data = JSON.parse(content);
        state.project = normalizeProject(data);
      } catch {
        // maybe fountain without extension
        state.project = E.fromFountain(content, baseName(filePath));
      }
    }
    state.filePath =
      filePath.toLowerCase().endsWith('.sdesk') ||
      filePath.toLowerCase().endsWith('.platen') ||
      filePath.toLowerCase().endsWith('.json')
        ? filePath
        : null;
    state.dirty = false;
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
    clearSaveAlert('file');
    updateChrome();
    persistLocal();
  }

  async function importFountain() {
    if (!api) return;
    const res = await api.importFountain();
    if (!res) return;
    state.project = E.fromFountain(res.content, baseName(res.filePath));
    state.filePath = null;
    state.dirty = true;
    hideWelcome();
    fullRender();
  }

  function exportReadyProject() {
    // Full industry pass before export: normalize elements + CONT'D
    return E.normalizeProject(JSON.parse(JSON.stringify(state.project)), { contd: true });
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
    const base = E.emptyProject();
    return {
      ...base,
      ...data,
      titlePage: { ...base.titlePage, ...(data.titlePage || {}) },
      blocks: Array.isArray(data.blocks) && data.blocks.length ? data.blocks : base.blocks,
      characters: data.characters || [],
      locations: data.locations || [],
      cards: data.cards || [],
      notes: data.notes || '',
      settings: { ...base.settings, ...(data.settings || {}) },
      history: data.history || [],
    };
  }

  function markDirty() {
    if (state.suppressDirty) return;
    state.dirty = true;
    state.project.updatedAt = new Date().toISOString();
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
    E.pushHistory(state.project, label);
    markDirty();
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
    const root = els.blocks;
    // Preserve focus only if still present after rebuild
    const keepId = state.activeBlockId;
    root.innerHTML = '';
    for (const block of state.project.blocks) {
      root.appendChild(createBlockRow(block));
    }
    // Do not auto-refocus here — callers that need focus call focusBlock
    void keepId;
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
      b.text = readBlockText(text);
      // Industry normalize (sluglines, cues, transitions, parens)
      const norm = E.normalizeBlock(b);
      b.type = norm.type;
      b.text = norm.text;
      setBlockDomText(text, b.text);
      // refresh gutter/classes if type unchanged (text may have changed casing)
      const row = blockRow(block.id);
      if (row) {
        const gutter = row.querySelector('.block-gutter');
        if (gutter) gutter.textContent = E.ELEMENT_LABELS[b.type] || b.type;
      }
      text.className = `block ${b.type}`;
      if (b.type === 'scene') renderScenes();
      markDirty();
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
          // new scene with LOCATION placeholder + time
          const nb = E.createBlock('scene', (`INT. LOCATION${snip}`).toUpperCase());
          const idx = indexOfBlock(id);
          state.project.blocks.splice(idx + 1, 0, nb);
          markDirty();
          renderBlocks();
          renderScenes();
          focusBlock(nb.id, true);
          return;
        }
        setBlockType(id, 'scene');
        const el0 = blockEl(id);
        const block0 = getBlock(id);
        block0.text = (`INT. LOCATION${snip}`).toUpperCase();
        setBlockDomText(el0, block0.text);
        // select LOCATION
        try {
          const tn = el0.firstChild;
          const range = document.createRange();
          const sel = window.getSelection();
          const start = block0.text.indexOf('LOCATION');
          range.setStart(tn, start);
          range.setEnd(tn, start + 8);
          sel.removeAllRanges();
          sel.addRange(range);
        } catch {
          placeCaretEnd(el0);
        }
        markDirty();
        renderScenes();
        onBlockFocus(id);
        return;
      }
    }

    if ((forceScene || isIntExtPrefix) && b.type !== 'scene') {
      if ((b.text || '').trim()) {
        const nb = E.createBlock('scene', snip.toUpperCase().replace(/\s+$/, ' '));
        const idx = indexOfBlock(id);
        state.project.blocks.splice(idx + 1, 0, nb);
        markDirty();
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

    if (isTimeSuffix) {
      cur = cur.replace(/\s*-\s*(DAY|NIGHT|DAWN|DUSK|MORNING|EVENING|CONTINUOUS|LATER|SAME|AFTERNOON)\s*$/i, '');
      block.text = (cur.trimEnd() + snip).toUpperCase();
    } else if (isIntExtPrefix || forceScene) {
      const rest = cur.replace(/^(INT\.?\/EXT\.?|I\/E\.?|E\/I\.?|INT\.?|EXT\.?|EST\.?)\s*/i, '');
      block.text = (snip + rest).toUpperCase();
    } else {
      block.text = cur + snip;
    }

    if (block.type === 'scene' || block.type === 'transition' || block.type === 'shot' || block.type === 'character') {
      block.text = block.text.toUpperCase();
    }
    setBlockDomText(el, block.text);
    placeCaretEnd(el);
    markDirty();
    if (block.type === 'scene') renderScenes();
    refreshStats();
    onBlockFocus(id);
  }

  function insertFullSceneSlug(slug) {
    ensureActiveBlock();
    const id = state.activeBlockId;
    const b = getBlock(id);
    if (!b) return;
    if ((b.text || '').trim() && b.type === 'scene') {
      // new scene after
      const nb = E.createBlock('scene', slug);
      const action = E.createBlock('action', '');
      const idx = indexOfBlock(id);
      state.project.blocks.splice(idx + 1, 0, nb, action);
      markDirty();
      renderBlocks();
      renderScenes();
      focusBlock(nb.id, true);
      return;
    }
    if ((b.text || '').trim() && b.type !== 'scene') {
      const nb = E.createBlock('scene', slug);
      const action = E.createBlock('action', '');
      const idx = indexOfBlock(id);
      state.project.blocks.splice(idx + 1, 0, nb, action);
      markDirty();
      renderBlocks();
      renderScenes();
      focusBlock(nb.id, true);
      return;
    }
    setBlockType(id, 'scene');
    const el = blockEl(id);
    const block = getBlock(id);
    block.text = slug;
    setBlockDomText(el, slug);
    // select LOCATION for easy replace
    el.focus();
    try {
      const range = document.createRange();
      const sel = window.getSelection();
      const textNode = el.firstChild;
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        const start = slug.indexOf('LOCATION');
        if (start >= 0) {
          range.setStart(textNode, start);
          range.setEnd(textNode, start + 'LOCATION'.length);
          sel.removeAllRanges();
          sel.addRange(range);
        } else {
          placeCaretEnd(el);
        }
      }
    } catch {
      placeCaretEnd(el);
    }
    markDirty();
    renderScenes();
    refreshStats();
    onBlockFocus(id);
  }

  function insertLineSnippet(line, type) {
    ensureActiveBlock();
    const id = state.activeBlockId;
    const b = getBlock(id);
    if (!b) return;

    if (type === 'character-suffix') {
      // apply to character line
      if (b.type !== 'character') {
        // previous character?
        const idx = indexOfBlock(id);
        let target = b;
        let tid = id;
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
        const el = blockEl(tid);
        let name = (target.text || '').replace(/\s*\((V\.O\.|O\.S\.|O\.C\.|CONT'D|CONT’D)\)\s*$/i, '').trim();
        target.text = `${name} ${line}`.toUpperCase();
        if (el) {
          setBlockDomText(el, target.text);
          focusBlock(tid);
        }
        markDirty();
        return;
      }
      const el = blockEl(id);
      let name = (b.text || '').replace(/\s*\((V\.O\.|O\.S\.|O\.C\.|CONT'D|CONT’D)\)\s*$/i, '').trim();
      b.text = `${name} ${line}`.toUpperCase();
      setBlockDomText(el, b.text);
      placeCaretEnd(el);
      markDirty();
      return;
    }

    // transition / new line
    if ((b.text || '').trim()) {
      const nb = E.createBlock(type === 'transition' ? 'transition' : type, line);
      const idx = indexOfBlock(id);
      state.project.blocks.splice(idx + 1, 0, nb);
      markDirty();
      renderBlocks();
      focusBlock(nb.id);
    } else {
      setBlockType(id, type === 'transition' ? 'transition' : type);
      const el = blockEl(id);
      const block = getBlock(id);
      block.text = line;
      setBlockDomText(el, line);
      placeCaretEnd(el);
      markDirty();
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
    state.project.blocks.splice(idx + 1, 0, block);
    markDirty();
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
    if ((b.text || '').trim() && b.type === 'character') {
      const nb = E.createBlock('character', name);
      const dlg = E.createBlock('dialogue', '');
      const idx = indexOfBlock(id);
      state.project.blocks.splice(idx + 1, 0, nb, dlg);
      markDirty();
      renderBlocks();
      focusBlock(dlg.id);
      return;
    }
    if ((b.text || '').trim() && b.type !== 'character') {
      const nb = E.createBlock('character', name);
      const dlg = E.createBlock('dialogue', '');
      const idx = indexOfBlock(id);
      state.project.blocks.splice(idx + 1, 0, nb, dlg);
      markDirty();
      renderBlocks();
      focusBlock(dlg.id);
      return;
    }
    setBlockType(id, 'character');
    const el = blockEl(id);
    const block = getBlock(id);
    block.text = name;
    setBlockDomText(el, name);
    // jump to dialogue
    insertAfter(id);
    markDirty();
    refreshStats();
  }

  function onBlockInput(id, textEl) {
    const b = getBlock(id);
    if (!b) return;
    b.text = readBlockText(textEl);
    // Keep DOM as plain text after every input so Chromium doesn't nest <div>s
    // Only flatten when HTML elements appear (not on every keystroke of pure text)
    if (textEl.querySelector && textEl.querySelector('div, p, span, font, br')) {
      const caretAtEnd = isCaretAtEnd(textEl);
      setBlockDomText(textEl, b.text);
      if (caretAtEnd) placeCaretEnd(textEl);
    }
    markDirty();
    if (b.type === 'scene') renderScenes();
    if (b.type === 'character') maybeShowAc(textEl, b);
    refreshStats();
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
      if (!text || atStart && !text) {
        const idx = indexOfBlock(id);
        if (idx > 0 && !text) {
          e.preventDefault();
          state.project.blocks.splice(idx, 1);
          markDirty();
          renderBlocks();
          renderScenes();
          focusBlock(state.project.blocks[idx - 1].id);
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
    if (textEl) b.text = readBlockText(textEl);

    b.type = type === 'note' ? 'note' : E.normalizeType(type);
    const norm = E.normalizeBlock(b);
    b.type = norm.type;
    b.text = norm.text;
    markDirty();

    const row = blockRow(id);
    if (row) {
      row.className = `block-row type-${b.type}`;
      const gutter = row.querySelector('.block-gutter');
      if (gutter) gutter.textContent = E.ELEMENT_LABELS[b.type] || b.type;
    }
    if (textEl) {
      textEl.className = `block ${b.type}`;
      textEl.dataset.type = b.type;
      textEl.dataset.placeholder = placeholderFor(b.type);
      setBlockDomText(textEl, b.text || '');
      placeCaretEnd(textEl);
    }
    if (els.elementSelect) {
      els.elementSelect.value = ['scene','action','character','parenthetical','dialogue','transition','shot','general'].includes(b.type)
        ? b.type
        : 'general';
    }
    els.statusElement.textContent = E.ELEMENT_LABELS[b.type] || b.type;
    els.badgeType.textContent = E.ELEMENT_LABELS[b.type] || b.type;
    syncElementRibbon(b.type);
    if (b.type === 'scene') renderScenes();
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
    // sync + normalize current line first
    const curEl = blockEl(id);
    if (curEl) {
      b.text = readBlockText(curEl);
      const norm = E.normalizeBlock(b);
      b.type = norm.type;
      b.text = norm.text;
    }

    let type = E.ENTER_NEXT[b.type] || 'action';
    if (b.type === 'dialogue') type = 'character';
    // Empty character cue → drop to action (leave dialogue sequence)
    if (b.type === 'character' && !(b.text || '').trim()) type = 'action';
    // Empty dialogue → stay in character flow as new character
    if (b.type === 'dialogue' && !(b.text || '').trim()) type = 'character';

    let seed = '';
    // After dialogue, if user presses Enter twice pattern handled above;
    // Soft CONT'D: if next character will be same as previous after action — applied on export

    const nb = E.createBlock(type, seed);
    const idx = indexOfBlock(id);
    state.project.blocks.splice(idx + 1, 0, nb);
    markDirty();
    renderBlocks();
    if (type === 'scene') renderScenes();
    requestAnimationFrame(() => focusBlock(nb.id));
    refreshStats();
  }

  function insertSceneAtEnd() {
    const nb = E.createBlock('scene', 'INT. LOCATION - DAY');
    const action = E.createBlock('action', '');
    state.project.blocks.push(nb, action);
    markDirty();
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
    // The contentEditable text node only
    return els.blocks.querySelector(`.block[data-id="${String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`);
  }
  function blockRow(id) {
    return els.blocks.querySelector(`.block-row[data-id="${String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`);
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
      el.className = 'card';
      el.innerHTML = `
        <div class="card-top">
          <span class="card-swatch" style="background:${card.color || '#6ea8ff'}"></span>
          <span class="card-num">#${card.number || i + 1}</span>
        </div>
        <input class="card-title-input" value="${escapeAttr(card.title || '')}" />
        <textarea class="card-summary" placeholder="What happens / emotional beat…">${escapeHtml(card.summary || '')}</textarea>
        <input class="card-beat" placeholder="Story beat (setup, turn, climax…)" value="${escapeAttr(card.beat || '')}" />
      `;
      el.querySelector('.card-title-input').oninput = (e) => {
        card.title = e.target.value;
        markDirty();
      };
      el.querySelector('.card-summary').oninput = (e) => {
        card.summary = e.target.value;
        markDirty();
      };
      el.querySelector('.card-beat').oninput = (e) => {
        card.beat = e.target.value;
        markDirty();
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
          c[input.dataset.f] = input.value;
          if (input.dataset.f === 'name') {
            el.querySelector('strong').textContent = input.value || 'Unnamed';
          }
          markDirty();
        });
      });
      el.querySelector('.danger-del').onclick = () => {
        state.project.characters = state.project.characters.filter((x) => x.id !== c.id);
        markDirty();
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
          if (input.dataset.f === 'times') {
            loc.times = input.value.split(',').map((s) => s.trim()).filter(Boolean);
          } else {
            loc[input.dataset.f] = input.value;
          }
          if (input.dataset.f === 'name') el.querySelector('strong').textContent = input.value || 'Unnamed';
          markDirty();
        });
      });
      el.querySelector('.danger-del').onclick = () => {
        state.project.locations = state.project.locations.filter((x) => x.id !== loc.id);
        markDirty();
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
    state.project.titlePage = state.project.titlePage || {};
    state.project.titlePage.title = $('#tpTitle').value;
    state.project.titlePage.writtenBy = $('#tpAuthor').value;
    state.project.titlePage.basedOn = $('#tpBased').value;
    state.project.titlePage.draftDate = $('#tpDate').value;
    state.project.titlePage.contact = $('#tpContact').value;
    markDirty();
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
        if (!confirm('Restore this snapshot? Current script blocks will be replaced.')) return;
        state.project.blocks = JSON.parse(JSON.stringify(h.blocks));
        markDirty();
        renderBlocks();
        renderScenes();
        refreshStats();
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
    els.pageNumber.textContent = `${Math.max(1, Math.round(s.pages))}.`;
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
    state.project.settings = state.project.settings || {};
    state.project.settings.theme = next;
    markDirty();
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
    b.text = (b.text || '').replace(re, r);
    markDirty();
    renderBlocks();
    focusBlock(b.id);
    refreshStats();
  }

  function replaceAll() {
    const q = els.findInput.value;
    const r = els.replaceInput.value;
    if (!q) return;
    const re = new RegExp(escapeRegExp(q), 'gi');
    let count = 0;
    state.project.blocks.forEach((b) => {
      const next = (b.text || '').replace(re, () => {
        count += 1;
        return r;
      });
      b.text = next;
    });
    markDirty();
    renderBlocks();
    refreshStats();
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
    block.text = name;
    setBlockDomText(textEl, name);
    placeCaretEnd(textEl);
    hideAc();
    markDirty();
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

  /* ---------- utils ---------- */

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }
  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  function slugify(s) {
    return String(s || 'script')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'script';
  }
  function baseName(p) {
    return String(p || 'Imported')
      .split(/[/\\]/)
      .pop()
      .replace(/\.[^.]+$/, '');
  }
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
