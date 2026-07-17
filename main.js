const { app, BrowserWindow, Menu, dialog, ipcMain, shell, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');

/**
 * Write a file so a crash mid-write cannot destroy the previous contents.
 *
 * The inherited code used fs.writeFileSync straight onto the target, which is both
 * blocking (autosave fires 800ms after every keystroke — that stall lands on the
 * writer's typing) and non-atomic: an interruption between truncate and write
 * leaves a truncated project. See docs/plan/00-findings.md §4 / ADR-0004.
 *
 * Write to a temp file in the SAME directory (rename is only atomic within a
 * filesystem), fsync it, then rename over the target.
 * content may be utf8 string or Buffer / Uint8Array (binary assets).
 */
async function writeFileAtomic(target, content) {
  const dir = path.dirname(target);
  await fsp.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(target)}.${process.pid}.tmp`);

  let handle;
  try {
    handle = await fsp.open(tmp, 'w');
    if (Buffer.isBuffer(content) || content instanceof Uint8Array) {
      await handle.writeFile(content);
    } else {
      await handle.writeFile(content, 'utf8');
    }
    await handle.sync(); // durable before the rename, or the atomicity is a lie
  } finally {
    await handle?.close();
  }

  try {
    await fsp.rename(tmp, target);
  } catch (err) {
    // Don't leave litter behind if the rename failed.
    await fsp.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

// Must run before app ready — privileges for platen:// asset loads in <img>.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'platen',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false,
      corsEnabled: true,
    },
  },
]);

let mainWindow = null;
const isDev = !app.isPackaged;

/** Absolute path of open v2 project folder, or null for v1 / unsaved. */
let activeProjectRoot = null;
/** Content-addressed bytes not yet on disk (unsaved project or import before save). */
const pendingAssets = new Map();

function extForMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m === 'image/png') return '.png';
  if (m === 'image/jpeg' || m === 'image/jpg') return '.jpg';
  if (m === 'image/webp') return '.webp';
  if (m === 'image/gif') return '.gif';
  if (m === 'image/svg+xml') return '.svg';
  return '';
}

function mimeForExt(ext) {
  const e = String(ext || '').toLowerCase();
  if (e === '.png') return 'image/png';
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
  if (e === '.webp') return 'image/webp';
  if (e === '.gif') return 'image/gif';
  if (e === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

/** assets/ab/cd/<hash><ext> under project root */
function assetDiskPath(root, hash, ext = '') {
  const h = String(hash || '').toLowerCase().replace(/[^a-f0-9]/g, '');
  if (h.length < 8) throw new Error('Invalid asset hash');
  const e = ext && ext.startsWith('.') ? ext : ext ? `.${ext}` : '';
  return path.join(root, 'assets', h.slice(0, 2), h.slice(2, 4), `${h}${e}`);
}

function setActiveProjectRoot(root) {
  activeProjectRoot = root ? path.resolve(root) : null;
}

/**
 * Resolve asset bytes: pending map first, then on-disk under activeProjectRoot.
 * @returns {{ buffer: Buffer, mime: string, ext: string } | null}
 */
async function resolveAsset(hash, preferredExt = '') {
  const h = String(hash || '').toLowerCase().replace(/[^a-f0-9]/g, '');
  if (!h) return null;
  if (pendingAssets.has(h)) {
    const p = pendingAssets.get(h);
    return { buffer: p.buffer, mime: p.mime, ext: p.ext || preferredExt };
  }
  if (!activeProjectRoot) return null;
  const tryExts = preferredExt
    ? [preferredExt.startsWith('.') ? preferredExt : `.${preferredExt}`]
    : ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', ''];
  for (const ext of tryExts) {
    const full = assetDiskPath(activeProjectRoot, h, ext);
    try {
      const buffer = await fsp.readFile(full);
      return { buffer, mime: mimeForExt(ext) || 'application/octet-stream', ext };
    } catch {
      /* try next */
    }
  }
  // Fanout walk if extension unknown
  const dir = path.join(activeProjectRoot, 'assets', h.slice(0, 2), h.slice(2, 4));
  try {
    const names = await fsp.readdir(dir);
    const match = names.find((n) => n.startsWith(h));
    if (match) {
      const buffer = await fsp.readFile(path.join(dir, match));
      const ext = path.extname(match);
      return { buffer, mime: mimeForExt(ext), ext };
    }
  } catch {
    /* missing */
  }
  return null;
}

async function flushPendingAssets(root) {
  if (!root || pendingAssets.size === 0) return;
  for (const [hash, info] of pendingAssets) {
    const full = assetDiskPath(root, hash, info.ext || '');
    await fsp.mkdir(path.dirname(full), { recursive: true });
    try {
      await fsp.access(full);
    } catch {
      await writeFileAtomic(full, info.buffer);
    }
  }
  pendingAssets.clear();
}

/**
 * Load a v2 folder package (or project.json inside one).
 * @returns {{ filePath: string, content: string, kind: string, projectRoot: string }}
 */
async function loadV2Folder(folderPath) {
  const root = path.resolve(folderPath);
  const projectJson = path.join(root, 'project.json');
  const content = await fsp.readFile(projectJson, 'utf8');
  setActiveProjectRoot(root);
  // Optional history file merge is renderer-side; main only returns document text.
  return {
    filePath: root,
    content,
    kind: 'v2-folder',
    projectRoot: root,
  };
}

/**
 * Save project as format-v2 folder. Never overwrites a v1 flat file in place.
 * content is the full project JSON string from the renderer.
 */
async function saveV2Folder(folderPath, content) {
  const root = path.resolve(folderPath);
  await fsp.mkdir(root, { recursive: true });
  await fsp.mkdir(path.join(root, 'assets'), { recursive: true });
  await fsp.mkdir(path.join(root, 'revisions'), { recursive: true });

  let document;
  try {
    document = JSON.parse(content);
  } catch {
    throw new Error('Invalid project JSON');
  }
  const history = Array.isArray(document.history) ? document.history : [];
  const forDisk = { ...document };
  delete forDisk.history;
  forDisk.version = 2;
  forDisk.format = 'platen';
  forDisk.updatedAt = forDisk.updatedAt || new Date().toISOString();

  await writeFileAtomic(path.join(root, 'project.json'), JSON.stringify(forDisk, null, 2));

  if (history.length) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await writeFileAtomic(
      path.join(root, 'revisions', `${stamp}.json`),
      JSON.stringify(history, null, 2)
    );
  }

  await flushPendingAssets(root);
  setActiveProjectRoot(root);
  return { filePath: root, kind: 'v2-folder', projectRoot: root };
}

function resolveAppIcon() {
  // Packaged extraResources + dev assets. Mac prefers .icns; Windows .ico.
  const isMac = process.platform === 'darwin';
  const names = isMac
    ? ['icon.icns', 'icon.png', 'icon.ico']
    : ['icon.ico', 'icon.icns', 'icon.png'];
  const roots = [
    process.resourcesPath || '',
    path.join(__dirname, 'assets'),
    path.join(__dirname, 'build'),
    __dirname,
  ];
  for (const root of roots) {
    if (!root) continue;
    for (const name of names) {
      const p = path.join(root, name);
      if (fs.existsSync(p)) return p;
    }
  }
  // Dev fallbacks for multi-size PNGs
  for (const name of ['icon-512.png', 'icon-256.png', 'icon-128.png']) {
    const p = path.join(__dirname, 'assets', name);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function createWindow() {
  const iconPath = resolveAppIcon();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0a0a0a',
    title: 'DreamWrite',
    icon: iconPath,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  buildMenu();
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [];

  // macOS app menu (required for proper Cmd+Q / About placement)
  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        {
          label: 'About DreamWrite',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About DreamWrite',
              message: 'DreamWrite 1.2.1',
              detail:
                'Offline screenwriting on a carbon-black ink/paper desk.\n' +
                'Paper grain · Fountain · PDF · board · timeline · no accounts.\n' +
                'Not affiliated with WriterDuet, Celtx, or Final Draft.',
            });
          },
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  template.push(
    {
      label: 'File',
      submenu: [
        { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: () => send('menu:new') },
        { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: () => send('menu:open') },
        { label: 'Open Project Folder…', click: () => send('menu:openFolder') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('menu:save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('menu:saveAs') },
        { type: 'separator' },
        { label: 'Import Fountain…', click: () => send('menu:importFountain') },
        { label: 'Export Fountain…', click: () => send('menu:exportFountain') },
        { label: 'Export PDF…', accelerator: 'CmdOrCtrl+P', click: () => send('menu:exportPdf') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        // Own the stack — Chromium {role:undo} only covers one contenteditable
        // and is wiped whenever renderBlocks clears innerHTML (Enter, etc.).
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => send('menu:undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => send('menu:redo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Y', visible: false, click: () => send('menu:redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find / Replace', accelerator: 'CmdOrCtrl+F', click: () => send('menu:find') },
      ],
    },
    {
      label: 'Format',
      submenu: [
        { label: 'Scene Heading', accelerator: 'CmdOrCtrl+1', click: () => send('menu:element', 'scene') },
        { label: 'Action', accelerator: 'CmdOrCtrl+2', click: () => send('menu:element', 'action') },
        { label: 'Character', accelerator: 'CmdOrCtrl+3', click: () => send('menu:element', 'character') },
        { label: 'Parenthetical', accelerator: 'CmdOrCtrl+4', click: () => send('menu:element', 'parenthetical') },
        { label: 'Dialogue', accelerator: 'CmdOrCtrl+5', click: () => send('menu:element', 'dialogue') },
        { label: 'Transition', accelerator: 'CmdOrCtrl+6', click: () => send('menu:element', 'transition') },
        { label: 'Shot', accelerator: 'CmdOrCtrl+7', click: () => send('menu:element', 'shot') },
        { type: 'separator' },
        { label: 'Cycle Element (Tab)', click: () => send('menu:cycle') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Script', accelerator: 'CmdOrCtrl+Shift+1', click: () => send('menu:view', 'script') },
        { label: 'Outline Cards', accelerator: 'CmdOrCtrl+Shift+2', click: () => send('menu:view', 'cards') },
        { label: 'Board', accelerator: 'CmdOrCtrl+Shift+3', click: () => send('menu:view', 'board') },
        { label: 'Timeline', accelerator: 'CmdOrCtrl+Shift+4', click: () => send('menu:view', 'timeline') },
        { label: 'Characters', accelerator: 'CmdOrCtrl+Shift+5', click: () => send('menu:view', 'characters') },
        { label: 'Locations', accelerator: 'CmdOrCtrl+Shift+6', click: () => send('menu:view', 'locations') },
        { label: 'Title Page', accelerator: 'CmdOrCtrl+Shift+7', click: () => send('menu:view', 'title') },
        { label: 'Notes', accelerator: 'CmdOrCtrl+Shift+8', click: () => send('menu:view', 'notes') },
        { label: 'Search', accelerator: 'CmdOrCtrl+Shift+9', click: () => send('menu:view', 'search') },
        { type: 'separator' },
        { label: 'Toggle Theme', accelerator: 'CmdOrCtrl+T', click: () => send('menu:theme') },
        { label: 'Cycle Focus Mode', accelerator: 'F11', click: () => send('menu:focus') },
        { label: 'Paper Focus', accelerator: 'CmdOrCtrl+Shift+P', click: () => send('menu:paper') },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { role: 'reload' },
      ],
    },
    {
      label: 'Window',
      submenu: isMac
        ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
        : [{ role: 'minimize' }, { role: 'close' }],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Keyboard Shortcuts', click: () => send('menu:help') },
        ...(!isMac
          ? [
              {
                label: 'About DreamWrite',
                click: () => {
                  dialog.showMessageBox(mainWindow, {
                    type: 'info',
                    title: 'About DreamWrite',
                    message: 'DreamWrite 1.2.1',
                    detail:
                      'Offline screenwriting on a carbon-black ink/paper desk.\n' +
                      'Paper grain · Fountain · PDF · board · timeline · no accounts.\n' +
                      'Not affiliated with WriterDuet, Celtx, or Final Draft.',
                  });
                },
              },
            ]
          : []),
      ],
    },
  );
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function defaultProjectsDir() {
  const dir = path.join(app.getPath('documents'), 'DreamWrite');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

ipcMain.handle('dialog:openProject', async () => {
  // Windows cannot mix openFile + openDirectory. macOS/Linux can.
  // Prefer file open; if user picks project.json, treat parent as v2 folder.
  const properties =
    process.platform === 'darwin' || process.platform === 'linux'
      ? ['openFile', 'openDirectory']
      : ['openFile'];
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open DreamWrite Project',
    defaultPath: defaultProjectsDir(),
    filters: [
      { name: 'DreamWrite Project', extensions: ['platen', 'sdesk', 'json'] },
      { name: 'Fountain', extensions: ['fountain', 'spmd'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties,
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = path.resolve(result.filePaths[0]);
  const stat = await fsp.stat(filePath);

  if (stat.isDirectory()) {
    const pj = path.join(filePath, 'project.json');
    if (!fs.existsSync(pj)) throw new Error('Folder is not a DreamWrite Project (missing project.json)');
    return loadV2Folder(filePath);
  }

  const base = path.basename(filePath).toLowerCase();
  // project.json inside a format-v2 package
  if (base === 'project.json') {
    const root = path.dirname(filePath);
    if (fs.existsSync(path.join(root, 'assets')) || fs.existsSync(path.join(root, 'revisions'))) {
      return loadV2Folder(root);
    }
    // Bare project.json — still v2-shaped if version says so; no assets root required
    const content = await fsp.readFile(filePath, 'utf8');
    setActiveProjectRoot(root);
    return { filePath: root, content, kind: 'v2-folder', projectRoot: root };
  }

  // Flat file (v1 .platen / .json / fountain)
  setActiveProjectRoot(null);
  const content = await fsp.readFile(filePath, 'utf8');
  return { filePath, content, kind: 'v1-file', projectRoot: null };
});

/** Open a format-v2 project folder package (Windows-friendly directory picker). */
ipcMain.handle('dialog:openProjectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open DreamWrite Project Folder',
    defaultPath: defaultProjectsDir(),
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const folder = path.resolve(result.filePaths[0]);
  const pj = path.join(folder, 'project.json');
  if (!fs.existsSync(pj)) throw new Error('Folder is not a DreamWrite Project (missing project.json)');
  return loadV2Folder(folder);
});

/**
 * Save project.
 * - First save / Save As → format v2 folder (`Name.platen/`) by default
 * - Existing v1 flat file path → keep writing that file (never migrate in place)
 * - Existing v2 folder path → write into that folder
 * payload: { filePath, content, suggestedName, forceDialog?: boolean }
 */
ipcMain.handle('dialog:saveProject', async (_e, { filePath, content, suggestedName, forceDialog }) => {
  // Existing path (Save, not Save As)
  if (filePath && !forceDialog) {
    const resolved = path.resolve(filePath);
    let isDir = false;
    try {
      isDir = (await fsp.stat(resolved)).isDirectory();
    } catch {
      isDir = false;
    }

    if (isDir) {
      return saveV2Folder(resolved, content);
    }

    // Path points at project.json parent already stored as folder root
    const asFolderJson = path.join(resolved, 'project.json');
    try {
      await fsp.access(asFolderJson);
      return saveV2Folder(resolved, content);
    } catch {
      /* flat file */
    }

    // v1 flat file — never convert in place
    await writeFileAtomic(resolved, content);
    setActiveProjectRoot(null);
    return { filePath: resolved, kind: 'v1-file', projectRoot: null };
  }

  // Save As / first save — default v2 folder package
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save DreamWrite Project',
    defaultPath: path.join(defaultProjectsDir(), suggestedName || 'untitled.platen'),
    filters: [
      { name: 'DreamWrite Project Folder', extensions: ['platen'] },
      { name: 'Legacy single file', extensions: ['sdesk', 'json'] },
    ],
  });
  if (result.canceled || !result.filePath) return null;

  let target = result.filePath;
  const lower = target.toLowerCase();

  // Legacy single-file save when user picks .sdesk / .json
  if (lower.endsWith('.sdesk') || lower.endsWith('.json')) {
    await writeFileAtomic(target, content);
    setActiveProjectRoot(null);
    return { filePath: target, kind: 'v1-file', projectRoot: null };
  }

  // Folder package: Name.platen/
  if (!lower.endsWith('.platen')) target = `${target}.platen`;
  // If a flat .platen file already exists, save as folder with distinct name — never migrate in place
  try {
    const st = await fsp.stat(target);
    if (st.isFile()) {
      target = target.replace(/\.platen$/i, '') + '.pkg.platen';
    }
  } catch {
    /* does not exist — create folder */
  }

  return saveV2Folder(target, content);
});

/** Content-addressed asset import. bytes: number[] | Uint8Array | ArrayBuffer-like */
ipcMain.handle('asset:import', async (_e, { bytes, mime, originalName, ext: extIn }) => {
  if (bytes == null) throw new Error('bytes required');
  const buffer = Buffer.from(bytes);
  if (buffer.length === 0) throw new Error('Empty asset');
  if (buffer.length > 40 * 1024 * 1024) throw new Error('Asset too large (40MB max)');

  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  let ext = extIn || extForMime(mime) || path.extname(originalName || '') || '';
  if (ext && !ext.startsWith('.')) ext = `.${ext}`;
  const entry = { buffer, mime: mime || mimeForExt(ext) || 'application/octet-stream', ext };

  if (activeProjectRoot) {
    const full = assetDiskPath(activeProjectRoot, hash, ext);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    try {
      await fsp.access(full);
    } catch {
      await writeFileAtomic(full, buffer);
    }
  } else {
    pendingAssets.set(hash, entry);
  }

  return { id: hash, mime: entry.mime, ext, bytes: buffer.length };
});

ipcMain.handle('asset:read', async (_e, { id, ext }) => {
  const resolved = await resolveAsset(id, ext || '');
  if (!resolved) throw new Error('Asset not found');
  return {
    id: String(id).toLowerCase(),
    mime: resolved.mime,
    ext: resolved.ext,
    bytes: Array.from(resolved.buffer),
  };
});

ipcMain.handle('project:setRoot', async (_e, { projectRoot }) => {
  if (!projectRoot) {
    setActiveProjectRoot(null);
    return { projectRoot: null };
  }
  const safe = assertPathAllowed(projectRoot);
  setActiveProjectRoot(safe);
  await flushPendingAssets(safe);
  return { projectRoot: safe };
});

ipcMain.handle('project:getRoot', async () => ({ projectRoot: activeProjectRoot }));

/** Pick image file(s) and import as content-addressed assets. */
ipcMain.handle('dialog:importImage', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Image',
    defaultPath: app.getPath('pictures'),
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const buffer = await fsp.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = mimeForExt(ext);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const entry = { buffer, mime, ext };

  if (activeProjectRoot) {
    const full = assetDiskPath(activeProjectRoot, hash, ext);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    try {
      await fsp.access(full);
    } catch {
      await writeFileAtomic(full, buffer);
    }
  } else {
    pendingAssets.set(hash, entry);
  }

  return {
    id: hash,
    mime,
    ext,
    bytes: buffer.length,
    originalName: path.basename(filePath),
  };
});

ipcMain.handle('dialog:importFountain', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Fountain',
    defaultPath: defaultProjectsDir(),
    filters: [
      { name: 'Fountain', extensions: ['fountain', 'spmd', 'txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return { filePath: result.filePaths[0], content: await fsp.readFile(result.filePaths[0], 'utf8') };
});

ipcMain.handle('dialog:exportText', async (_e, { content, suggestedName, filters, defaultExt }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export',
    defaultPath: path.join(defaultProjectsDir(), suggestedName || `export.${defaultExt || 'txt'}`),
    filters: filters || [{ name: 'Text', extensions: [defaultExt || 'txt'] }],
  });
  if (result.canceled || !result.filePath) return null;
  let target = result.filePath;
  if (defaultExt && !target.toLowerCase().endsWith(`.${defaultExt}`)) {
    target = `${target}.${defaultExt}`;
  }
  await writeFileAtomic(target, content);
  return { filePath: target };
});

ipcMain.handle('export:pdf', async (_e, { html, suggestedName }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export PDF',
    defaultPath: path.join(defaultProjectsDir(), suggestedName || 'screenplay.pdf'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return null;
  const target = result.filePath.endsWith('.pdf') ? result.filePath : `${result.filePath}.pdf`;

  const pdfWin = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true },
  });
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  await pdfWin.loadURL(dataUrl);
  // Wait for embedded @font-face (Courier Prime) — not a magic setTimeout race.
  try {
    await pdfWin.webContents.executeJavaScript(
      `document.fonts.ready.then(function () { return true; })`,
    );
    // Extra ready ping if the print HTML sets the flag (toPdfHtml does).
    await pdfWin.webContents.executeJavaScript(
      `new Promise(function (resolve) {
        if (window.__platenFontsReady) return resolve(true);
        document.fonts.ready.then(function () { resolve(true); });
        setTimeout(function () { resolve(true); }, 2000);
      })`,
    );
  } catch {
    // Font wait failed — still attempt PDF (better than aborting export).
  }
  const pdf = await pdfWin.webContents.printToPDF({
    printBackground: true,
    pageSize: 'Letter',
    margins: { marginType: 'none' },
  });
  await fsp.writeFile(target, pdf);
  pdfWin.destroy();
  return { filePath: target };
});

/**
 * Phase 4 gate: renderer must not read/write arbitrary paths.
 * Allow only under userData, documents, app directory, or the open project root.
 */
function assertPathAllowed(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Path required');
  }
  const resolved = path.resolve(filePath);
  const allowedRoots = [
    path.resolve(app.getPath('userData')),
    path.resolve(app.getPath('documents')),
    path.resolve(__dirname),
  ];
  if (activeProjectRoot) allowedRoots.push(path.resolve(activeProjectRoot));
  const ok = allowedRoots.some(
    (root) => resolved === root || resolved.startsWith(root + path.sep)
  );
  if (!ok) {
    throw new Error('Path outside allowed directories');
  }
  return resolved;
}

ipcMain.handle('fs:readText', async (_e, filePath) => {
  const safe = assertPathAllowed(filePath);
  return fsp.readFile(safe, 'utf8');
});

ipcMain.handle('fs:writeText', async (_e, { filePath, content }) => {
  const safe = assertPathAllowed(filePath);
  await writeFileAtomic(safe, content);
  return true;
});

ipcMain.handle('app:getPaths', async () => ({
  documents: defaultProjectsDir(),
  userData: app.getPath('userData'),
}));

ipcMain.handle('shell:showItem', async (_e, filePath) => {
  shell.showItemInFolder(filePath);
});

function registerPlatenProtocol() {
  protocol.handle('platen', async (request) => {
    try {
      const u = new URL(request.url);
      // platen://asset/<hash>[.ext]  → host "asset", pathname "/hash.ext"
      let name = '';
      if (u.hostname === 'asset') {
        name = decodeURIComponent(u.pathname.replace(/^\//, ''));
      } else {
        name = decodeURIComponent((u.hostname + u.pathname).replace(/^\/?asset\/?/, ''));
      }
      const m = name.match(/^([a-f0-9]{16,})(\.[a-z0-9]+)?$/i);
      if (!m) {
        return new Response('Bad asset id', { status: 400 });
      }
      const hash = m[1].toLowerCase();
      const ext = m[2] || '';
      const resolved = await resolveAsset(hash, ext);
      if (!resolved) {
        return new Response('Not found', { status: 404 });
      }
      return new Response(resolved.buffer, {
        status: 200,
        headers: {
          'Content-Type': resolved.mime || 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    } catch (err) {
      return new Response(String(err?.message || err), { status: 500 });
    }
  });
}

app.whenReady().then(() => {
  registerPlatenProtocol();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
