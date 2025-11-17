// Simple dependency-free server that serves the site, lists songs, and handles uploads.
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
const songsDir = path.join(__dirname, 'songs');

if (!fs.existsSync(songsDir)) {
  fs.mkdirSync(songsDir, { recursive: true });
}

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function safeJoin(base, target) {
  const resolvedPath = path.normalize(path.join(base, target));
  if (!resolvedPath.startsWith(base)) {
    return null;
  }
  return resolvedPath;
}

function bufferSplit(buf, delimiter) {
  const out = [];
  let start = 0;
  let index;
  while ((index = buf.indexOf(delimiter, start)) !== -1) {
    out.push(buf.slice(start, index));
    start = index + delimiter.length;
  }
  out.push(buf.slice(start));
  return out;
}

function handleUpload(req, res, boundary) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('error', reject);
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);
        const boundaryBuf = Buffer.from(`--${boundary}`);
        const parts = bufferSplit(body, boundaryBuf);
        let saved = false;

        for (let part of parts) {
          if (!part.length || part.equals(Buffer.from('--\r\n'))) continue;
          // Trim leading CRLF
          if (part.slice(0, 2).equals(Buffer.from('\r\n'))) {
            part = part.slice(2);
          }
          const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
          if (headerEnd === -1) continue;
          const headerText = part.slice(0, headerEnd).toString('utf8');
          const bodyContent = part.slice(headerEnd + 4, part.length - 2); // drop trailing CRLF

          const disposition = /name="([^"]+)"(?:;\s*filename="([^"]*)")?/i.exec(headerText);
          if (!disposition) continue;
          const fieldName = disposition[1];
          const filename = disposition[2];
          if (fieldName !== 'song' || !filename) continue;

          const destPath = safeJoin(songsDir, filename);
          if (!destPath) continue;
          fs.writeFileSync(destPath, bodyContent);
          saved = true;
        }

        if (saved) {
          sendJson(res, 200, { ok: true });
        } else {
          sendJson(res, 400, { error: 'No file data found' });
        }
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url);
  const pathname = decodeURIComponent(parsedUrl.pathname || '/');

  if (req.method === 'GET' && pathname === '/api/songs') {
    fs.readdir(songsDir, (err, files) => {
      if (err) {
        console.error('List songs error', err);
        return sendJson(res, 500, { error: 'Unable to list songs' });
      }
      const songs = files.filter(name => name.toLowerCase().endsWith('.mp3'));
      return sendJson(res, 200, songs);
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/upload') {
    const contentType = req.headers['content-type'] || '';
    const match = contentType.match(/boundary=(.+)$/);
    if (!match) {
      sendJson(res, 400, { error: 'Missing boundary' });
      return;
    }
    try {
      await handleUpload(req, res, match[1]);
    } catch (err) {
      console.error('Upload error', err);
      sendJson(res, 500, { error: 'Upload failed' });
    }
    return;
  }

  // Serve static assets
  const isSong = pathname.startsWith('/songs/');
  const baseDir = isSong ? songsDir : publicDir;
  const relativePath = isSong ? pathname.replace('/songs', '') : pathname;
  let filePath = safeJoin(baseDir, relativePath);
  if (!filePath) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    // fallback to SPA index
    filePath = path.join(publicDir, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500);
      res.end('Server error');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`Roll With It running on http://localhost:${PORT}`);
});
