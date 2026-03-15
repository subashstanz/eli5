export default async function handler(req, res) {
  const redditUrl = req.query.url;

  if (!redditUrl || !redditUrl.startsWith('https://www.reddit.com/')) {
    return res.status(400).json({ error: 'Invalid Reddit URL' });
  }

  try {
    const response = await fetch(redditUrl, {
      headers: { 'User-Agent': 'ELI5-PWA/1.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Reddit returned ${response.status}` });
    }

    const data = await response.text();
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.setHeader('Content-Type', 'application/json');
    return res.send(data);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
