const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

function fetchReddit(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'ELI5-PWA/1.0' } }, (res) => {
      if (res.statusCode === 429) {
        reject(new Error('Rate limited by Reddit'));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);

  // Reddit proxy endpoint
  if (parsedUrl.pathname === '/api/reddit') {
    const redditUrl = parsedUrl.searchParams.get('url');

    if (!redditUrl || !redditUrl.startsWith('https://www.reddit.com/')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid Reddit URL' }));
      return;
    }

    try {
      const data = await fetchReddit(redditUrl);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      });
      res.end(data);
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Static file serving
  let filePath = parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname;
  filePath = path.join(__dirname, filePath);

  // Prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end();
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`ELI5 PWA running at http://localhost:${PORT}`);
});
