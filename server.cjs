// Tiny dev server — serves static files + handles POST /save for the spawn/level editor
// Usage: node server.js
// Then open http://localhost:3000

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

// Only these files can be written by the editor
const ALLOWED_SAVES = [
  'config/waves.js',
  'config/enemies.js',
  'config/arena.js',
];

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const ARENAS_DIR = path.join(ROOT, 'config', 'arenas');
const ARENAS_INDEX = path.join(ARENAS_DIR, '_index.json');

function readArenaIndex() {
  try { return JSON.parse(fs.readFileSync(ARENAS_INDEX, 'utf-8')); }
  catch { return []; }
}

function writeArenaIndex(list) {
  fs.writeFileSync(ARENAS_INDEX, JSON.stringify(list, null, 2) + '\n', 'utf-8');
}

// Sanitize preset name: lowercase alphanumeric + underscores/hyphens only
function sanitizeName(name) {
  return name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase().slice(0, 40);
}

function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => resolve(body));
  });
}

const server = http.createServer(async (req, res) => {
  const json = (code, data) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  // ─── Arena Preset Endpoints ───

  // GET /arenas — list preset names
  if (req.method === 'GET' && req.url === '/arenas') {
    json(200, readArenaIndex());
    return;
  }

  // GET /arenas/load?name=xxx — load a preset
  if (req.method === 'GET' && req.url.startsWith('/arenas/load?')) {
    const params = new URLSearchParams(req.url.split('?')[1]);
    const name = sanitizeName(params.get('name') || '');
    const filePath = path.join(ARENAS_DIR, name + '.json');
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      json(200, data);
      console.log(`[arena] loaded preset: ${name}`);
    } catch (e) {
      json(404, { error: 'Preset not found' });
    }
    return;
  }

  // POST /arenas/save — save a preset { name, obstacles, pits }
  if (req.method === 'POST' && req.url === '/arenas/save') {
    try {
      const { name: rawName, obstacles, pits } = JSON.parse(await readBody(req));
      const name = sanitizeName(rawName || '');
      if (!name) { json(400, { error: 'Invalid name' }); return; }
      const filePath = path.join(ARENAS_DIR, name + '.json');
      fs.writeFileSync(filePath, JSON.stringify({ obstacles, pits }, null, 2) + '\n', 'utf-8');
      // Update index
      const index = readArenaIndex();
      if (!index.includes(name)) { index.push(name); writeArenaIndex(index); }
      console.log(`[arena] saved preset: ${name}`);
      json(200, { ok: true });
    } catch (e) {
      console.error('[arena] save error:', e.message);
      json(500, { error: e.message });
    }
    return;
  }

  // POST /arenas/delete — delete a preset { name }
  if (req.method === 'POST' && req.url === '/arenas/delete') {
    try {
      const { name: rawName } = JSON.parse(await readBody(req));
      const name = sanitizeName(rawName || '');
      if (!name) { json(400, { error: 'Invalid name' }); return; }
      const filePath = path.join(ARENAS_DIR, name + '.json');
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      const index = readArenaIndex().filter(n => n !== name);
      writeArenaIndex(index);
      console.log(`[arena] deleted preset: ${name}`);
      json(200, { ok: true });
    } catch (e) {
      console.error('[arena] delete error:', e.message);
      json(500, { error: e.message });
    }
    return;
  }

  // ─── Config File Save ───

  // POST /save — write a config file to disk
  if (req.method === 'POST' && req.url === '/save') {
    try {
      const { file, content } = JSON.parse(await readBody(req));
      if (!ALLOWED_SAVES.includes(file)) { json(403, { error: 'File not in whitelist' }); return; }
      fs.writeFileSync(path.join(ROOT, file), content, 'utf-8');
      console.log(`[save] ${file} (${content.length} bytes)`);
      json(200, { ok: true });
    } catch (e) {
      console.error('[save] Error:', e.message);
      json(500, { error: e.message });
    }
    return;
  }

  // Static file serving
  const urlPath = req.url.split('?')[0]; // strip query strings (?v=2 cache busters)
  let filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n  ⚔️  Iso Battler dev server`);
  console.log(`  http://localhost:${PORT}\n`);
});
