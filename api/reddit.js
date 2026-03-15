const https = require('https');

function fetchReddit(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'ELI5-PWA/1.0' } }, (res) => {
      if (res.statusCode === 429) {
        reject(new Error('Rate limited'));
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

module.exports = async (req, res) => {
  const redditUrl = req.query.url;

  if (!redditUrl || !redditUrl.startsWith('https://www.reddit.com/')) {
    res.status(400).json({ error: 'Invalid Reddit URL' });
    return;
  }

  try {
    const data = await fetchReddit(redditUrl);
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
};
