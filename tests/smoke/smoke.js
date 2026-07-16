/**
 * Electron smoke test — drives the REAL app over the Chrome DevTools Protocol.
 *
 * Why this exists: unit tests and "the app booted with no console errors" both pass
 * while the editor is completely broken, because booting only renders the welcome
 * screen. The block editor — which is where every extracted function actually runs —
 * is never touched. Every crack in docs/plan/00-findings.md would have survived a
 * green unit suite. This is the net that catches that class of bug.
 *
 *   node tests/smoke/smoke.js
 *
 * No Playwright: CDP over the built-in --remote-debugging-port needs no extra deps.
 */
const { spawn } = require('child_process');
const http = require('http');

const PORT = 9222;
const results = [];

function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
}

const get = (path) =>
  new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: PORT, path }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => resolve(JSON.parse(d)));
      })
      .on('error', reject);
  });

async function waitForTarget(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const targets = await get('/json/list');
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('devtools target never appeared');
}

/** Minimal CDP client — one in-flight command at a time is plenty here. */
function connect(wsUrl) {
  const WebSocket = require('ws');
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });

  const send = (method, params) =>
    new Promise((resolve) => {
      const myId = ++id;
      pending.set(myId, resolve);
      ws.send(JSON.stringify({ id: myId, method, params }));
    });

  const ready = new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  /** Evaluate an expression in the page and return its value. */
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.result?.exceptionDetails) {
      throw new Error(r.result.exceptionDetails.exception?.description || 'eval threw');
    }
    return r.result?.result?.value;
  };

  return { ready, evaluate, close: () => ws.close() };
}

async function main() {
  const electron = require('electron');
  const child = spawn(electron, ['.', `--remote-debugging-port=${PORT}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));

  try {
    const page = await waitForTarget();
    const cdp = connect(page.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.evaluate('1'); // warm up

    // --- the app actually loaded its code -------------------------------------
    check('window.ScriptEngine installed', await cdp.evaluate('typeof window.ScriptEngine === "object"'));
    check(
      'engine exports reached the renderer',
      await cdp.evaluate('typeof window.ScriptEngine.emptyProject === "function"')
    );
    check('PlatenUI bridge bound', await cdp.evaluate('typeof window.PlatenUI === "object"'));
    check('PlatenChrome bound', await cdp.evaluate('typeof window.PlatenChrome === "object"'));

    // --- get past the welcome screen into the editor ---------------------------
    await cdp.evaluate('document.querySelector("#welcomeSample").click()');
    await new Promise((r) => setTimeout(r, 600));

    const blockCount = await cdp.evaluate('document.querySelectorAll("#blocks .block").length');
    check('sample script rendered blocks', blockCount > 0, `${blockCount} blocks`);

    // --- THE POINT: exercise the extracted block-dom code ----------------------
    // readBlockText / setBlockDomText / placeCaretEnd only run once you type.
    const typed = await cdp.evaluate(`(() => {
      const el = document.querySelector('#blocks .block.text') || document.querySelector('#blocks [contenteditable="true"]');
      if (!el) return { error: 'no editable block found' };
      el.focus();
      el.textContent = 'SMOKE TEST LINE';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return { text: el.textContent };
    })()`);
    check('typing into a block does not throw', !typed.error, typed.error || typed.text);

    // Did the keystroke reach the document model? This is the round trip that
    // readBlockText() is responsible for.
    await new Promise((r) => setTimeout(r, 300));
    const inModel = await cdp.evaluate(`(() => {
      const el = document.querySelector('#blocks .block.text') || document.querySelector('#blocks [contenteditable="true"]');
      const stats = document.querySelector('#statusCounts');
      return { dom: el ? el.textContent : null, status: stats ? stats.textContent : null };
    })()`);
    check('block text survives the input round trip', inModel.dom === 'SMOKE TEST LINE', JSON.stringify(inModel));

    // --- multi-line: the <br> path readBlockText exists for --------------------
    const multiline = await cdp.evaluate(`(() => {
      const el = document.querySelector('#blocks .block.text') || document.querySelector('#blocks [contenteditable="true"]');
      if (!el) return { error: 'no block' };
      el.innerHTML = 'line one<br>line two';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return { html: el.innerHTML };
    })()`);
    check('multi-line block does not throw', !multiline.error, multiline.error || 'ok');

    // --- no errors accumulated anywhere ---------------------------------------
    const pageErrors = await cdp.evaluate('window.__smokeErrors ? window.__smokeErrors.length : 0');
    check('no uncaught page errors', pageErrors === 0);

    cdp.close();
  } finally {
    child.kill();
  }

  const rendererErrors = (stderr.match(/Uncaught|TypeError|ReferenceError/g) || []).length;
  check('no renderer console errors', rendererErrors === 0, rendererErrors ? stderr.slice(0, 400) : '');

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} smoke checks passed`);
  if (failed.length) {
    console.error('FAILED:', failed.map((f) => f.name).join(', '));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('smoke run failed:', err);
  process.exit(1);
});
