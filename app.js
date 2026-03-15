const POST_LIMIT = 15;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// --- State ---
let currentSubreddit = 'explainlikeimfive';
let currentSort = 'hot';
let currentPostAuthor = null;

// --- DOM ---
const listView = document.getElementById('list-view');
const detailView = document.getElementById('detail-view');
const postsContainer = document.getElementById('posts-container');
const detailContent = document.getElementById('detail-content');
const commentsContainer = document.getElementById('comments-container');
const backBtn = document.getElementById('back-btn');

// --- Reddit API ---

function redditPostsUrl(sort) {
  const base = `https://www.reddit.com/r/${currentSubreddit}/${sort}.json?limit=${POST_LIMIT}&raw_json=1`;
  if (sort === 'top') return base + '&t=day';
  return base;
}

function redditCommentsUrl(postId) {
  return `https://www.reddit.com/r/${currentSubreddit}/comments/${postId}.json?limit=30&depth=3&sort=top&raw_json=1`;
}

async function redditFetch(url) {
  // Use our own proxy to avoid CORS issues with Reddit
  const proxyUrl = `/api/reddit?url=${encodeURIComponent(url)}`;
  const resp = await fetch(proxyUrl);
  if (!resp.ok) throw new Error(`API error: ${resp.status}`);
  return resp.json();
}

// --- Cache ---

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.ts > CACHE_TTL) return null;
    return cached;
  } catch {
    return null;
  }
}

function cacheSet(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // Storage full - clear old caches
    localStorage.clear();
  }
}

// --- Fetch Posts ---

async function loadPosts() {
  postsContainer.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  const cacheKey = `posts_${currentSubreddit}_${currentSort}`;
  const cached = cacheGet(cacheKey);

  if (cached) {
    renderPosts(cached.data);
    // Refresh in background
    fetchAndCachePosts(cacheKey).catch(() => {});
    return;
  }

  try {
    const posts = await fetchAndCachePosts(cacheKey);
    renderPosts(posts);
  } catch (err) {
    postsContainer.innerHTML = `
      <div class="state-message">
        Failed to load posts.<br>Check your connection.
        <br><button onclick="loadPosts()">Try Again</button>
      </div>`;
  }
}

async function fetchAndCachePosts(cacheKey) {
  const json = await redditFetch(redditPostsUrl(currentSort));
  const posts = json.data.children
    .map(c => c.data)
    .filter(p => !p.stickied);
  cacheSet(cacheKey, posts);
  return posts;
}

// --- Fetch Comments ---

async function loadComments(postId) {
  commentsContainer.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  try {
    const json = await redditFetch(redditCommentsUrl(postId));
    // json[0] = post data, json[1] = comments
    const comments = json[1].data.children.filter(c => c.kind === 't1');
    renderComments(comments);
  } catch (err) {
    commentsContainer.innerHTML = `
      <div class="state-message">
        Failed to load comments.
        <br><button onclick="loadComments('${postId}')">Try Again</button>
      </div>`;
  }
}

// --- Render Posts ---

function renderPosts(posts) {
  if (!posts.length) {
    postsContainer.innerHTML = '<div class="state-message">No posts found.</div>';
    return;
  }

  postsContainer.innerHTML = posts.map(post => `
    <div class="post-card" data-id="${esc(post.id)}" data-author="${esc(post.author)}">
      <div class="post-score">${formatNum(post.score)}</div>
      <div class="post-title">${esc(post.title)}</div>
      <div class="post-meta">
        <span>u/${esc(post.author)}</span>
        <span class="post-comments-count">${post.num_comments}</span>
        <span>${timeAgo(post.created_utc)}</span>
      </div>
    </div>
  `).join('');

  // Attach click handlers
  postsContainer.querySelectorAll('.post-card').forEach(card => {
    card.addEventListener('click', () => openPost(card.dataset.id, card.dataset.author, posts));
  });
}

// --- Render Comments ---

function renderComments(comments) {
  if (!comments.length) {
    commentsContainer.innerHTML = '<div class="state-message">No comments yet.</div>';
    return;
  }

  let html = '<div class="comments-heading">Top Answers</div>';
  html += comments.map(c => renderComment(c.data, 0)).join('');
  commentsContainer.innerHTML = html;
}

function renderComment(comment, depth) {
  if (!comment || !comment.body_html) return '';

  const depthClass = depth > 0 ? ` comment-depth comment-depth-${Math.min(depth, 2)}` : '';
  const isOP = comment.author === currentPostAuthor;
  const authorClass = isOP ? 'comment-author op' : 'comment-author';

  let html = `
    <div class="comment${depthClass}">
      <div class="comment-header">
        <span class="${authorClass}">u/${esc(comment.author)}${isOP ? ' (OP)' : ''}</span>
        <span class="comment-score">${formatNum(comment.score)} pts</span>
        <span class="comment-time">${timeAgo(comment.created_utc)}</span>
      </div>
      <div class="comment-body">${sanitizeHtml(comment.body_html)}</div>
    </div>
  `;

  // Render replies (up to depth 2)
  if (depth < 2 && comment.replies && comment.replies.data) {
    const replies = comment.replies.data.children.filter(c => c.kind === 't1');
    html += replies.map(r => renderComment(r.data, depth + 1)).join('');

    // Show "more replies" indicator
    const moreCount = comment.replies.data.children.filter(c => c.kind === 'more').length;
    if (moreCount > 0) {
      const permalink = `https://www.reddit.com/r/${currentSubreddit}/comments/${comment.link_id?.replace('t3_', '')}`;
      html += `<a class="more-replies comment-depth comment-depth-${Math.min(depth + 1, 2)}" href="${permalink}" target="_blank">View more replies on Reddit &rarr;</a>`;
    }
  }

  return html;
}

// --- Navigation ---

function openPost(postId, author, posts) {
  currentPostAuthor = author;
  const post = posts.find(p => p.id === postId);
  if (!post) return;

  // Render post detail
  const selftext = post.selftext ? `<div class="detail-selftext">${esc(post.selftext)}</div>` : '';

  detailContent.innerHTML = `
    <div class="detail-score">${formatNum(post.score)}</div>
    <div class="detail-author">u/${esc(post.author)} &middot; ${timeAgo(post.created_utc)}</div>
    <h2 class="detail-title">${esc(post.title)}</h2>
    ${selftext}
  `;

  // Switch views
  listView.classList.remove('active');
  detailView.classList.add('active');

  // Scroll to top
  commentsContainer.scrollTop = 0;

  // Load comments
  loadComments(postId);

  // Update history so back button works
  history.pushState({ view: 'detail', postId }, '');
}

function goBack() {
  detailView.classList.remove('active');
  listView.classList.add('active');
}

backBtn.addEventListener('click', () => {
  goBack();
  if (history.state && history.state.view === 'detail') {
    history.back();
  }
});

window.addEventListener('popstate', (e) => {
  if (!e.state || e.state.view !== 'detail') {
    goBack();
  }
});

// --- Subreddit Tabs ---

document.querySelectorAll('.sub-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelector('.sub-tab.active').classList.remove('active');
    tab.classList.add('active');
    currentSubreddit = tab.dataset.sub;
    document.getElementById('subreddit-title').textContent = tab.dataset.label;
    document.getElementById('tagline').textContent = tab.dataset.tagline;
    loadPosts();
  });
});

// --- Sort Tabs ---

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelector('.tab.active').classList.remove('active');
    tab.classList.add('active');
    currentSort = tab.dataset.sort;
    loadPosts();
  });
});

// --- Utilities ---

function esc(str) {
  if (!str) return '';
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function sanitizeHtml(html) {
  if (!html) return '';
  // Reddit's body_html contains HTML entities when raw_json=1 is not used
  // With raw_json=1, it's actual HTML. We allow safe tags only.
  const allowed = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '');
  return allowed;
}

function timeAgo(utc) {
  const diff = Math.floor(Date.now() / 1000 - utc);
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function formatNum(n) {
  if (n >= 10000) return (n / 1000).toFixed(0) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

// --- Theme / Appearance ---

const THEME_COLORS = {
  light: '#FAFAFA',
  sepia: '#F8F1E3',
  dim: '#4A4A4C',
  dark: '#121212'
};

const themePanel = document.getElementById('theme-panel');
const themeOverlay = document.getElementById('theme-overlay');
const themeToggle = document.getElementById('theme-toggle');
const fontSizeSlider = document.getElementById('font-size-slider');

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  document.getElementById('meta-theme').setAttribute('content', THEME_COLORS[theme]);

  // Update active button
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`.theme-btn[data-theme="${theme}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  localStorage.setItem('eli5_theme', theme);
}

function applyFontSize(size) {
  document.documentElement.style.setProperty('--font-size', size + 'px');
  localStorage.setItem('eli5_font_size', size);
}

function openThemePanel() {
  themePanel.classList.add('open');
  themeOverlay.classList.add('open');
}

function closeThemePanel() {
  themePanel.classList.remove('open');
  themeOverlay.classList.remove('open');
}

themeToggle.addEventListener('click', openThemePanel);
themeOverlay.addEventListener('click', closeThemePanel);
document.getElementById('theme-panel-close').addEventListener('click', closeThemePanel);

document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
});

fontSizeSlider.addEventListener('input', (e) => applyFontSize(e.target.value));

// Restore saved preferences
const savedTheme = localStorage.getItem('eli5_theme') || 'dark';
const savedFontSize = localStorage.getItem('eli5_font_size') || '16';
applyTheme(savedTheme);
applyFontSize(savedFontSize);
fontSizeSlider.value = savedFontSize;

// --- Service Worker Registration ---

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// --- Init ---

// Push initial state
history.replaceState({ view: 'list' }, '');
loadPosts();
