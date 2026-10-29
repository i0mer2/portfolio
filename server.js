'use strict';

// Local preview of the static site in docs/. The live site is served by
// GitHub Pages, and the dashboard saves straight to GitHub.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 4400;
const ROOT = path.join(__dirname, 'docs');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

function send(req, res, file) {
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('غير موجود');
    }
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' };
    // Range support so videos can be seeked.
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Number(range[2]) : stat.size - 1;
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.normalize(path.join(ROOT, url));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end();
  }
  if (url.endsWith('/')) file = path.join(file, 'index.html');
  else if (!path.extname(file) && fs.existsSync(path.join(file, 'index.html'))) {
    res.writeHead(301, { Location: `${url}/` });
    return res.end();
  }
  send(req, res, file);
});

// Use the next free port when the default one is taken by another app.
function start(port) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && !process.env.PORT && port < PORT + 20) return start(port + 1);
    throw err;
  });
  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`\n  معاينة الموقع:   ${url}`);
    console.log(`  لوحة التحكم:     ${url}/admin/\n`);
    if (process.env.OPEN_BROWSER && process.platform === 'win32') {
      require('child_process').exec(`start "" "${url}"`);
    }
  });
}
start(PORT);
