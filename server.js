const http = require('http');
const fs = require('fs');
const path = require('path');
const { previewGameByName, addGameByRawgId, getConfig, validateConfig } = require('./js/add-game-service');

const ROOT_DIR = path.resolve(__dirname);
const ADMIN_DIR = path.join(ROOT_DIR, 'admin');
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');

function sendJson(res, status, data) {
  const payload = JSON.stringify(data, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
  };
  return map[ext] || 'application/octet-stream';
}

function serveStaticFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    sendText(res, 404, 'Recurso no encontrado');
    return;
  }

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    const indexFile = path.join(filePath, 'index.html');
    if (fs.existsSync(indexFile) && fs.statSync(indexFile).isFile()) {
      serveStaticFile(res, indexFile);
      return;
    }
    sendText(res, 404, 'Recurso no encontrado');
    return;
  }

  if (!stat.isFile()) {
    sendText(res, 404, 'Recurso no encontrado');
    return;
  }

  const content = fs.readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': getContentType(filePath) });
  res.end(content);
}

function resolvePublicPath(requestPath) {
  const normalizedPath = requestPath === '/' ? '/index.html' : requestPath;
  const relativePath = normalizedPath.replace(/^\/+/, '');
  const absolutePath = path.resolve(ROOT_DIR, relativePath || 'index.html');
  const allowedRoot = path.resolve(ROOT_DIR);

  if (!absolutePath.startsWith(allowedRoot + path.sep) && absolutePath !== allowedRoot) {
    return null;
  }

  return absolutePath;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (error) {
        reject(new Error('JSON inválido en el cuerpo de la petición'));
      }
    });
    req.on('error', reject);
  });
}

// ✅ Handler principal extraído para Vercel
const handler = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  if (req.method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (req.method === 'GET' && pathname === '/admin') {
    res.writeHead(301, { Location: '/admin/' });
    res.end();
    return;
  }

  if (req.method === 'GET' && (pathname === '/admin/' || pathname.startsWith('/admin/'))) {
    serveStaticFile(res, path.join(ADMIN_DIR, pathname === '/admin/' ? 'index.html' : pathname.slice('/admin/'.length)));
    return;
  }

  if (req.method === 'GET') {
    const resolvedPath = resolvePublicPath(pathname);
    if (resolvedPath) {
      serveStaticFile(res, resolvedPath);
      return;
    }
  }

  if (req.method === 'POST' && pathname === '/api/preview') {
    try {
      const body = await parseJsonBody(req);
      const preview = await previewGameByName(body.name);
      sendJson(res, 200, preview);
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Error al obtener preview' });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/add') {
    try {
      validateConfig(getConfig());
      const body = await parseJsonBody(req);
      if (!body.rawg_id) {
        throw new Error('Falta rawg_id en la petición');
      }
      const overrides = body.overrides || undefined;
      const game = await addGameByRawgId(body.rawg_id, overrides);
      sendJson(res, 200, game);
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Error al añadir el juego' });
    }
    return;
  }

  sendText(res, 404, 'Ruta no encontrada');
};

// ✅ Exportar para Vercel (serverless)
module.exports = handler;

// ✅ Solo iniciar servidor en local (npm start)
if (require.main === module) {
  const server = http.createServer(handler);
  server.listen(PORT, HOST, () => {
    console.log(`Servidor listo en http://${HOST}:${PORT}`);
    console.log(`Panel admin: http://${HOST}:${PORT}/admin`);
  });
}