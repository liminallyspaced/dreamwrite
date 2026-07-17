/**
 * Capture real DreamWrite UI screenshots via Electron CDP.
 * Writes PNG product shots into website/images/ for README + site.
 *
 *   node scripts/capture-screenshots.js
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 9333;
const outDir = path.join(ROOT, 'website', 'images');

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: PORT, path: urlPath }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

async function waitTarget(timeoutMs = 30000) {
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
  throw new Error('no CDP target');
}

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
  const ready = new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const myId = ++id;
      pending.set(myId, resolve);
      ws.send(JSON.stringify({ id: myId, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) {
      throw new Error(r.result.exceptionDetails.exception?.description || 'eval failed');
    }
    return r.result?.result?.value;
  };
  const waitFor = async (expression, timeoutMs = 20000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        if (await evaluate(expression)) return true;
      } catch {
        /* loading */
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error('timeout: ' + expression);
  };
  const screenshot = async (file) => {
    const r = await send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    if (!r.result?.data) throw new Error('screenshot empty for ' + file);
    const buf = Buffer.from(r.result.data, 'base64');
    fs.writeFileSync(file, buf);
    console.log('wrote', path.relative(ROOT, file), buf.length, 'bytes');
  };
  return { ready, evaluate, waitFor, screenshot, send, close: () => ws.close() };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const electron = require('electron');
  console.log('spawning', electron, 'cwd=', ROOT);
  const child = spawn(electron, ['.', `--remote-debugging-port=${PORT}`], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
  });
  let stderr = '';
  let stdout = '';
  child.stderr.on('data', (d) => {
    stderr += d;
    process.stderr.write(d);
  });
  child.stdout.on('data', (d) => {
    stdout += d;
    process.stdout.write(d);
  });

  try {
    const page = await waitTarget();
    console.log('CDP target:', page.title || page.url);
    const cdp = connect(page.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.waitFor('document.readyState === "complete"');
    await cdp.waitFor('typeof window.ScriptEngine !== "undefined"');

    // Load sample so screenshots show real script content
    await cdp.evaluate(`(() => {
      const b = document.querySelector('#welcomeSample');
      if (b) b.click();
      return !!b;
    })()`);
    await new Promise((r) => setTimeout(r, 1400));

    // Desk chrome (full UI)
    await cdp.evaluate(`(() => {
      if (window.PlatenChrome?.setFocusMode) window.PlatenChrome.setFocusMode('desk');
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 400));

    // Script view
    await cdp.evaluate(`(() => {
      window.PlatenUI?.setView?.('script');
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 800));
    await cdp.screenshot(path.join(outDir, 'screenshot-script.png'));

    // Board + sync scene cards via public UI bridge
    await cdp.evaluate(`(() => {
      window.PlatenUI?.boardAction?.('sync');
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 1200));
    await cdp.screenshot(path.join(outDir, 'screenshot-board.png'));

    // Timeline + sync events from scenes
    await cdp.evaluate(`(() => {
      window.PlatenUI?.timelineAction?.('sync');
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 1200));
    await cdp.evaluate(`(() => {
      window.PlatenUI?.timelineAction?.('fit');
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 500));
    await cdp.screenshot(path.join(outDir, 'screenshot-timeline.png'));

    // Hero = full desk script view again
    await cdp.evaluate(`(() => {
      window.PlatenUI?.setView?.('script');
      if (window.PlatenChrome?.setFocusMode) window.PlatenChrome.setFocusMode('desk');
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 800));
    await cdp.screenshot(path.join(outDir, 'screenshot-hero.png'));

    // Canonical names used by README / website (PNG, not fake JPG art)
    fs.copyFileSync(path.join(outDir, 'screenshot-hero.png'), path.join(outDir, 'hero.png'));
    fs.copyFileSync(path.join(outDir, 'screenshot-script.png'), path.join(outDir, 'app-shot.png'));
    console.log('copied hero.png + app-shot.png');

    cdp.close();
  } catch (e) {
    console.error('capture failed. stderr tail:\n', stderr.slice(-2000));
    throw e;
  } finally {
    try {
      child.kill();
    } catch {}
    // Force-kill tree on Windows if still around
    setTimeout(() => {
      try {
        process.kill(child.pid);
      } catch {}
    }, 500);
  }
  console.log('done — real app screenshots in website/images/');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
