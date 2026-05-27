// Run with: node scripts/generate-icons.js
// Generates simple pixel-art galaxy icons for the PWA manifest
const fs = require('fs');
const path = require('path');

function createSvgIcon(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#00000f"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size * 0.38}" fill="none" stroke="#00ffff" stroke-width="${size * 0.015}" opacity="0.3"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size * 0.22}" fill="none" stroke="#00ffff" stroke-width="${size * 0.01}" opacity="0.2"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size * 0.08}" fill="#ffe066"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size * 0.12}" fill="#ff8800" opacity="0.4"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size * 0.18}" fill="#ff440044"/>
  <!-- Stars -->
  <rect x="${size*0.2}" y="${size*0.18}" width="${size*0.012}" height="${size*0.012}" fill="#ffffff" opacity="0.9"/>
  <rect x="${size*0.75}" y="${size*0.22}" width="${size*0.012}" height="${size*0.012}" fill="#ffffff" opacity="0.7"/>
  <rect x="${size*0.15}" y="${size*0.65}" width="${size*0.008}" height="${size*0.008}" fill="#ffffff" opacity="0.8"/>
  <rect x="${size*0.80}" y="${size*0.70}" width="${size*0.01}" height="${size*0.01}" fill="#ffffff" opacity="0.6"/>
  <rect x="${size*0.55}" y="${size*0.12}" width="${size*0.008}" height="${size*0.008}" fill="#8888ff" opacity="0.9"/>
  <rect x="${size*0.88}" y="${size*0.42}" width="${size*0.008}" height="${size*0.008}" fill="#ff8844" opacity="0.8"/>
  <!-- Spiral arm hints -->
  <path d="M ${size*0.5} ${size*0.5} Q ${size*0.7} ${size*0.3} ${size*0.85} ${size*0.5}" stroke="#00ffff" stroke-width="${size*0.005}" fill="none" opacity="0.2"/>
  <path d="M ${size*0.5} ${size*0.5} Q ${size*0.3} ${size*0.7} ${size*0.15} ${size*0.5}" stroke="#00ffff" stroke-width="${size*0.005}" fill="none" opacity="0.2"/>
</svg>`;
}

const publicDir = path.join(__dirname, '..', 'public');
fs.mkdirSync(publicDir, { recursive: true });

// Write SVG icons (browsers accept SVG as icons)
fs.writeFileSync(path.join(publicDir, 'icon-192.svg'), createSvgIcon(192));
fs.writeFileSync(path.join(publicDir, 'icon-512.svg'), createSvgIcon(512));

// Create minimal PNG placeholders (1x1 pixel - just so manifest doesn't 404)
// In production, replace these with real PNGs using sharp or similar
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
if (!fs.existsSync(path.join(publicDir, 'icon-192.png'))) {
  fs.writeFileSync(path.join(publicDir, 'icon-192.png'), PNG_1PX);
}
if (!fs.existsSync(path.join(publicDir, 'icon-512.png'))) {
  fs.writeFileSync(path.join(publicDir, 'icon-512.png'), PNG_1PX);
}

console.log('Icons generated in /public');
