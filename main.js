const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { pathToFileURL } = require('url');

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
 */
async function writeFileAtomic(target, content) {
  const dir = path.dirname(target);
  const tmp = path.join(dir, `.${path.basename(target)}.${process.pid}.tmp`);

  let handle;
  try {
    handle = await fsp.open(tmp, 'w');
    await handle.writeFile(content, 'utf8');
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

let mainWindow = null;
const isDev = !app.isPackaged;

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0a0a0a',
    title: 'Platen',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
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
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: () => send('menu:new') },
        { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: () => send('menu:open') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('menu:save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('menu:saveAs') },
        { type: 'separator' },
        { label: 'Import Fountain…', click: () => send('menu:importFountain') },
        { label: 'Export Fountain…', click: () => send('menu:exportFountain') },
        { label: 'Export PDF…', accelerator: 'CmdOrCtrl+P', click: () => send('menu:exportPdf') },
        { type: 'separator' },
        { role: 'quit' },
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
        { label: 'Characters', accelerator: 'CmdOrCtrl+Shift+3', click: () => send('menu:view', 'characters') },
        { label: 'Locations', accelerator: 'CmdOrCtrl+Shift+4', click: () => send('menu:view', 'locations') },
        { label: 'Title Page', accelerator: 'CmdOrCtrl+Shift+5', click: () => send('menu:view', 'title') },
        { label: 'Notes', accelerator: 'CmdOrCtrl+Shift+6', click: () => send('menu:view', 'notes') },
        { type: 'separator' },
        { label: 'Toggle Theme', accelerator: 'CmdOrCtrl+T', click: () => send('menu:theme') },
        { label: 'Cycle Focus Mode', accelerator: 'F11', click: () => send('menu:focus') },
        { label: 'Typewriter Focus', accelerator: 'CmdOrCtrl+Shift+W', click: () => send('menu:typewriter') },
        { label: 'Paper Focus', accelerator: 'CmdOrCtrl+Shift+P', click: () => send('menu:paper') },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { role: 'reload' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Keyboard Shortcuts', click: () => send('menu:help') },
        {
          label: 'About Platen',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Platen',
              message: 'Platen 1.1',
              detail:
                'Offline screenwriting on a carbon-black 1960s typewriter desk.\n' +
                'Paper grain · ink-edge smudge · Fountain · PDF · no accounts.\n' +
                'Not affiliated with WriterDuet, Celtx, or Final Draft.',
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function defaultProjectsDir() {
  const dir = path.join(app.getPath('documents'), 'Platen');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

ipcMain.handle('dialog:openProject', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Platen Project',
    defaultPath: defaultProjectsDir(),
    filters: [
      { name: 'Platen Project', extensions: ['platen', 'sdesk', 'json'] },
      { name: 'Fountain', extensions: ['fountain', 'spmd'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  // Errors propagate to the renderer as a rejected invoke — deliberately. The
  // renderer surfaces them; it must never be left guessing whether a read worked.
  const content = await fsp.readFile(filePath, 'utf8');
  return { filePath, content };
});

ipcMain.handle('dialog:saveProject', async (_e, { filePath, content, suggestedName }) => {
  let target = filePath;
  if (!target) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Platen Project',
      defaultPath: path.join(defaultProjectsDir(), suggestedName || 'untitled.platen'),
      filters: [{ name: 'Platen Project', extensions: ['platen', 'sdesk'] }],
    });
    if (result.canceled || !result.filePath) return null;
    target =
      result.filePath.endsWith('.platen') || result.filePath.endsWith('.sdesk')
        ? result.filePath
        : `${result.filePath}.platen`;
  }
  await writeFileAtomic(target, content);
  return { filePath: target };
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
 * Allow only under userData, documents/Platen projects, or the app directory.
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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
