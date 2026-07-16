/**
 * Renderer entry point — bundled by esbuild into src/bundle.js.
 *
 * Import ORDER IS LOAD-BEARING. Do not reorder or merge these:
 *   1. engine-global — installs window.ScriptEngine
 *   2. ui-chrome     — IIFE; rails, focus modes, radial wheel
 *   3. app           — IIFE; reads window.ScriptEngine at line 3
 *
 * (2) and (3) are still IIFEs that expect the global to exist already.
 * As each becomes a real module this file shrinks. See docs/plan/01-roadmap.md Phase 0.
 */
import './engine-global.js';
import './ui-chrome.js';
import './app.js';
