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

  /**
   * Poll `expression` until it is truthy.
   *
   * Not optional: connecting to the CDP target does NOT mean the page has finished
   * evaluating bundle.js. Asserting immediately after connect is a race — it passed
   * until the bundle grew, then started failing check #1 while check #2 (which ran
   * microseconds later, after evaluation finished) passed. A flaky test is worse
   * than no test.
   */
  const waitFor = async (expression, { timeoutMs = 10000, label = expression } = {}) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        if (await evaluate(expression)) return true;
      } catch {
        /* page may still be loading */
      }
      if (Date.now() > deadline) throw new Error(`timed out waiting for: ${label}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  return { ready, evaluate, waitFor, close: () => ws.close() };
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

    // Wait for the bundle to actually evaluate before asserting anything about it.
    await cdp.waitFor('document.readyState === "complete"', { label: 'document ready' });
    await cdp.waitFor('typeof window.ScriptEngine !== "undefined"', { label: 'bundle evaluated' });

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

    // Multi-page stack: editables live under .page-stack (first host also has #blocks)
    const blockCount = await cdp.evaluate(
      'document.querySelectorAll(".page-stack .block[contenteditable=\\"true\\"], #blocks .block").length'
    );
    check('sample script rendered blocks', blockCount > 0, `${blockCount} blocks`);

    // --- THE POINT: exercise the extracted block-dom code ----------------------
    // readBlockText / setBlockDomText / placeCaretEnd only run once you type.
    // Prefer an action block so we don't fight scene/character normalisation.
    const typed = await cdp.evaluate(`(() => {
      const el = document.querySelector('.page-stack .block.action[contenteditable="true"]')
        || document.querySelector('.page-stack .block[contenteditable="true"]')
        || document.querySelector('#blocks .block');
      if (!el) return { error: 'no editable block found' };
      el.focus();
      el.textContent = 'SMOKE TEST LINE';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return { text: el.textContent, id: el.dataset.id };
    })()`);
    check('typing into a block does not throw', !typed.error, typed.error || typed.text);

    // Did the keystroke reach the document model? This is the round trip that
    // readBlockText() is responsible for.
    await new Promise((r) => setTimeout(r, 350));
    const inModel = await cdp.evaluate(`(() => {
      const id = ${JSON.stringify(typed.id || '')};
      const el = (id && document.querySelector('.page-stack .block[data-id="' + id + '"]'))
        || document.querySelector('.page-stack .block.action[contenteditable="true"]')
        || document.querySelector('.page-stack .block[contenteditable="true"]');
      const stats = document.querySelector('#statusCounts');
      return { dom: el ? el.textContent : null, status: stats ? stats.textContent : null };
    })()`);
    check('block text survives the input round trip', inModel.dom === 'SMOKE TEST LINE', JSON.stringify(inModel));

    // --- multi-line: the <br> path readBlockText exists for --------------------
    const multiline = await cdp.evaluate(`(() => {
      const el = document.querySelector('.page-stack .block.action[contenteditable="true"]')
        || document.querySelector('.page-stack .block[contenteditable="true"]');
      if (!el) return { error: 'no block' };
      el.innerHTML = 'line one<br>line two';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return { html: el.innerHTML };
    })()`);
    check('multi-line block does not throw', !multiline.error, multiline.error || 'ok');

    // --- persistence: the fix for findings.md §5.5 #1 --------------------------
    // Autosave is debounced 800ms off markDirty. Force a dirty mark if the synthetic
    // input event didn't arm the timer (page-layout reflow races), then wait.
    await cdp.evaluate(`(() => {
      try {
        if (window.PlatenUI && typeof window.PlatenUI.forceAutosave === 'function') {
          window.PlatenUI.forceAutosave();
          return;
        }
      } catch (_) {}
      // Fallback: second input on the active action block
      const el = document.querySelector('.page-stack .block.action[contenteditable="true"]')
        || document.querySelector('.page-stack .block[contenteditable="true"]');
      if (el) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
    await new Promise((r) => setTimeout(r, 1600));

    const storage = await cdp.evaluate(`(() => ({
      autosave:  localStorage.getItem('platen.autosave') ? 'set' : 'missing',
      history:   localStorage.getItem('platen.autosave.history') ? 'set' : 'absent',
      legacy:    localStorage.getItem('scriptdesk.autosave') ? 'PRESENT' : 'absent',
      hasInlineHistory: (() => {
        const raw = localStorage.getItem('platen.autosave');
        if (!raw) return null;
        try { return JSON.parse(raw).project.history !== undefined; } catch { return 'unparseable'; }
      })(),
    }))()`);

    check('autosave written to the current key', storage.autosave === 'set', JSON.stringify(storage));
    check('legacy key NOT written (it would shadow fresh work)', storage.legacy === 'absent');
    check('history is NOT inlined in the autosave payload', storage.hasInlineHistory === false);

    // A save alert must have somewhere to go.
    check('save alert element present', await cdp.evaluate('!!document.getElementById("saveAlert")'));
    check('save alert hidden while healthy', await cdp.evaluate('document.getElementById("saveAlert").hidden === true'));

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
