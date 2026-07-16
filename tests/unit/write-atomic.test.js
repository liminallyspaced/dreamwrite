/**
 * Atomic file write.
 *
 * The property under test: an interrupted or failed write must never destroy what
 * was already on disk. The inherited code used fs.writeFileSync straight onto the
 * target, so a crash between truncate and write left a truncated project
 * (docs/plan/00-findings.md §4).
 *
 * writeFileAtomic lives in main.js (CommonJS, Electron main process). Rather than
 * importing Electron here, the implementation is duplicated below and kept in sync
 * by a test that reads main.js and asserts the real one still has the properties
 * that matter. Imperfect, but it beats leaving durability entirely unverified.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// --- mirror of main.js writeFileAtomic ---------------------------------------
async function writeFileAtomic(target, content) {
  const dir = path.dirname(target);
  const tmp = path.join(dir, `.${path.basename(target)}.${process.pid}.tmp`);

  let handle;
  try {
    handle = await fsp.open(tmp, 'w');
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle?.close();
  }

  try {
    await fsp.rename(tmp, target);
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}
// -----------------------------------------------------------------------------

let dir;

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'platen-atomic-'));
});

afterEach(async () => {
  await fsp.rm(dir, { recursive: true, force: true });
});

describe('writeFileAtomic', () => {
  it('writes a new file', async () => {
    const f = path.join(dir, 'a.platen');
    await writeFileAtomic(f, '{"version":1}');
    expect(await fsp.readFile(f, 'utf8')).toBe('{"version":1}');
  });

  it('replaces existing content', async () => {
    const f = path.join(dir, 'a.platen');
    await fsp.writeFile(f, 'old');
    await writeFileAtomic(f, 'new');
    expect(await fsp.readFile(f, 'utf8')).toBe('new');
  });

  it('leaves no temp files behind on success', async () => {
    const f = path.join(dir, 'a.platen');
    await writeFileAtomic(f, 'x');
    expect((await fsp.readdir(dir)).filter((n) => n.includes('.tmp'))).toEqual([]);
  });

  it('PRESERVES the old file when the write fails', async () => {
    // The whole point. A failed save must not cost you the previous save.
    const f = path.join(dir, 'a.platen');
    await fsp.writeFile(f, 'PRECIOUS DRAFT');

    // A directory where the temp file wants to go => open() fails.
    const tmpName = `.${path.basename(f)}.${process.pid}.tmp`;
    await fsp.mkdir(path.join(dir, tmpName));

    await expect(writeFileAtomic(f, 'garbage')).rejects.toThrow();
    expect(await fsp.readFile(f, 'utf8')).toBe('PRECIOUS DRAFT'); // survived
  });

  it('writes the temp file into the SAME directory as the target', async () => {
    // rename() is only atomic within one filesystem. A temp in os.tmpdir() could
    // land on a different volume, silently degrading rename to copy+delete — which
    // is not atomic and reintroduces the bug.
    const f = path.join(dir, 'a.platen');
    let sawTmpInDir = false;

    const realRename = fsp.rename;
    fsp.rename = async (from, to) => {
      sawTmpInDir = path.dirname(from) === path.dirname(to);
      return realRename(from, to);
    };
    try {
      await writeFileAtomic(f, 'x');
    } finally {
      fsp.rename = realRename;
    }
    expect(sawTmpInDir).toBe(true);
  });

  it('handles content with newlines and unicode intact', async () => {
    const f = path.join(dir, 'a.platen');
    const content = 'INT. CAFÉ — DAY\nSarah enters.\n trailing nbsp';
    await writeFileAtomic(f, content);
    expect(await fsp.readFile(f, 'utf8')).toBe(content);
  });
});

describe('main.js writeFileAtomic stays honest', () => {
  // Guards the mirror above against drifting from the real implementation.
  const source = fs.readFileSync(new URL('../../main.js', import.meta.url), 'utf8');

  it('still exists in main.js', () => {
    expect(source).toContain('async function writeFileAtomic(');
  });

  it('still fsyncs before renaming — otherwise the atomicity is a lie', () => {
    expect(source).toContain('handle.sync()');
  });

  it('still builds the temp path from path.dirname(target)', () => {
    expect(source).toMatch(/const dir = path\.dirname\(target\)/);
    expect(source).toMatch(/const tmp = path\.join\(dir,/);
  });

  it('no fs.writeFileSync / fs.readFileSync remains in main.js', () => {
    // Autosave fires 800ms after every keystroke; a sync write stalls typing.
    const offenders = source
      .split('\n')
      .filter((l) => /fs\.(write|read)FileSync\(/.test(l) && !l.trim().startsWith('*'));
    expect(offenders).toEqual([]);
  });

  it('project + text writes go through writeFileAtomic', () => {
    expect(source).toContain('await writeFileAtomic(target, content)');
    expect(source).toContain('await writeFileAtomic(filePath, content)');
  });
});
