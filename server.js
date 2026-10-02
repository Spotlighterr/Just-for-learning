const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 8787);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const SEED_FILE = path.join(ROOT, 'seed.json');
const MAX_BODY_BYTES = 2 * 1024 * 1024;

fs.mkdirSync(DATA_DIR, { recursive: true });

function now() {
  return new Date().toISOString();
}

function writeAtomic(file, data) {
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, data, 'utf8');
  fs.renameSync(temp, file);
}

function ensureState() {
  if (fs.existsSync(STATE_FILE)) return;
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  writeAtomic(STATE_FILE, JSON.stringify({ revision: 1, updatedAt: now(), state: seed }, null, 2));
}

function readState() {
  ensureState();
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function saveState(state, revision) {
  const payload = { revision, updatedAt: now(), state };
  writeAtomic(STATE_FILE, JSON.stringify(payload, null, 2));
  return payload;
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function serveStatic(reqPath, res) {
  const requested = reqPath === '/' ? '/index.html' : reqPath;
  const safePath = path.normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/api/health' && req.method === 'GET') {
    return json(res, 200, { ok: true, time: now() });
  }

  if (url.pathname === '/api/state' && req.method === 'GET') {
    return json(res, 200, readState());
  }

  if (url.pathname === '/api/state' && req.method === 'PUT') {
    try {
      const body = await readJsonBody(req);
      if (!body.state || typeof body.state !== 'object') {
        return json(res, 400, { error: 'state must be an object' });
      }

      const current = readState();
      const force = body.force === true;
      const baseRevision = Number(body.baseRevision || 0);

      if (!force && baseRevision !== current.revision) {
        return json(res, 409, { error: 'revision_conflict', current });
      }

      const saved = saveState(body.state, current.revision + 1);
      return json(res, 200, saved);
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  }

  serveStatic(url.pathname, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`BuilderOS running on http://0.0.0.0:${PORT}`);
  console.log(`State file: ${STATE_FILE}`);
});
