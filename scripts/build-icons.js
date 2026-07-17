/**
 * Build Windows .ico + macOS .icns from assets/icon-256.png
 * Usage: node scripts/build-icons.js
 */
const fs = require('fs');
const path = require('path');
const png2icons = require('png2icons');

const root = path.join(__dirname, '..');
const assets = path.join(root, 'assets');
const buildDir = path.join(root, 'build');
const srcPng = path.join(assets, 'icon-256.png');

if (!fs.existsSync(srcPng)) {
  console.error('Missing assets/icon-256.png — restore Gemini icon first.');
  process.exit(1);
}

const input = fs.readFileSync(srcPng);
fs.mkdirSync(buildDir, { recursive: true });

const ico = png2icons.createICO(input, png2icons.BILINEAR, 0, false);
const icns = png2icons.createICNS(input, png2icons.BILINEAR, 0);

fs.writeFileSync(path.join(assets, 'icon.ico'), ico);
fs.writeFileSync(path.join(assets, 'icon.icns'), icns);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);
fs.writeFileSync(path.join(buildDir, 'icon.icns'), icns);

console.log(`[icons] icon.ico  ${ico.length} bytes`);
console.log(`[icons] icon.icns ${icns.length} bytes`);
console.log('[icons] wrote assets/ + build/');
