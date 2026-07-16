/**
 * Compatibility shim — TEMPORARY (Phase 0).
 *
 * `app.js` and `ui-chrome.js` are still IIFEs that read `window.ScriptEngine` at
 * execution time (app.js:3 grabs it, app.js:7 immediately calls E.emptyProject()).
 * Until they become real modules, they need the global in place before they run.
 *
 * ES module imports are hoisted and evaluated depth-first in source order, so this
 * MUST live in its own module imported before them — doing the assignment inline in
 * renderer.js would run *after* app.js was already evaluated, and break.
 *
 * Delete this once app.js imports the engine directly. See docs/plan/01-roadmap.md Phase 0.
 */
import * as Engine from './engine.js';

window.ScriptEngine = Engine;
