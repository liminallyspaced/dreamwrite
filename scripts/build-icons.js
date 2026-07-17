/**
 * Build Windows .ico + macOS .icns from the transparent master PNG.
 * Prefers ICON-DreamWrite.png (true alpha), falls back to icon-256.png.
 */
const fs = require('fs');
const path = require('path');
const png2icons = require('png2icons');

const root = path.join(__dirname, '..');
const assets = path.join(root, 'assets');
const buildDir = path.join(root, 'build');

const candidates = [
  path.join(root, 'ICON-DreamWrite.png'),
  path.join(assets, 'ICON-DreamWrite.png'),
  path.join(assets, 'icon-256.png'),
];

const srcPng = candidates.find((p) => fs.existsSync(p));
if (!srcPng) {
  console.error('Missing ICON-DreamWrite.png or assets/icon-256.png');
  process.exit(1);
}

const input = fs.readFileSync(srcPng);
fs.mkdirSync(buildDir, { recursive: true });

// PNG-in-ICO preserves transparency better
const ico = png2icons.createICO(input, png2icons.BILINEAR, 0, true);
const icns = png2icons.createICNS(input, png2icons.BILINEAR, 0);

fs.writeFileSync(path.join(assets, 'icon.ico'), ico);
fs.writeFileSync(path.join(assets, 'icon.icns'), icns);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);
fs.writeFileSync(path.join(buildDir, 'icon.icns'), icns);

// Keep website logo in sync
const websiteImg = path.join(root, 'website', 'images');
if (fs.existsSync(websiteImg)) {
  fs.copyFileSync(srcPng, path.join(websiteImg, 'dreamwrite-icon-full.png'));
}

console.log(`[icons] source  ${path.relative(root, srcPng)}`);
console.log(`[icons] icon.ico  ${ico.length} bytes (PNG mode, alpha)`);
console.log(`[icons] icon.icns ${icns.length} bytes`);
