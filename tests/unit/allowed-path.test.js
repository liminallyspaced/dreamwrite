import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { assertPathAllowed } = require('../../lib/allowed-path.js');

const resolve = path.resolve;
const sep = path.sep;

describe('assertPathAllowed (fs gate)', () => {
  const roots = [resolve('/safe/docs'), resolve('/safe/app')];

  it('allows paths under an allowed root', () => {
    const p = resolve('/safe/docs/DreamWrite/foo.platen');
    expect(assertPathAllowed(p, roots, resolve, sep)).toBe(p);
  });

  it('allows the root itself', () => {
    const p = resolve('/safe/docs');
    expect(assertPathAllowed(p, roots, resolve, sep)).toBe(p);
  });

  it('rejects paths outside allowed roots', () => {
    expect(() =>
      assertPathAllowed(resolve('/etc/passwd'), roots, resolve, sep)
    ).toThrow(/outside allowed/i);
  });

  it('rejects empty path', () => {
    expect(() => assertPathAllowed('', roots, resolve, sep)).toThrow(/required/i);
  });

  it('rejects prefix tricks that are not under the root', () => {
    // /safe/docs-evil is not under /safe/docs
    expect(() =>
      assertPathAllowed(resolve('/safe/docs-evil/x'), roots, resolve, sep)
    ).toThrow(/outside allowed/i);
  });
});
