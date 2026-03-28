use axum::response::Html;

/// GET /dashboard — Live metrics dashboard (pure HTML+CSS+JS, no deps).
pub async fn dashboard() -> Html<&'static str> {
    Html(DASHBOARD_HTML)
}

const DASHBOARD_HTML: &str = r##"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CloudStore Dashboard</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --bg: #0f1117;
    --surface: rgba(255,255,255,0.04);
    --surface-hover: rgba(255,255,255,0.07);
    --border: rgba(255,255,255,0.08);
    --text: #e4e4e7;
    --text-dim: #71717a;
    --accent: #818cf8;
    --accent-glow: rgba(129,140,248,0.15);
    --green: #4ade80;
    --yellow: #facc15;
    --red: #f87171;
    --blue: #60a5fa;
    --cyan: #22d3ee;
    --radius: 16px;
  }

  body {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    padding: 24px;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 32px;
    padding-bottom: 20px;
    border-bottom: 1px solid var(--border);
  }

  header h1 {
    font-size: 24px;
    font-weight: 700;
    background: linear-gradient(135deg, var(--accent), var(--cyan));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .status-dot {
    display: inline-block;
    width: 8px; height: 8px;
    border-radius: 50%;
    margin-right: 8px;
    animation: pulse 2s ease-in-out infinite;
  }
  .status-dot.ok { background: var(--green); box-shadow: 0 0 8px var(--green); }
  .status-dot.err { background: var(--red); box-shadow: 0 0 8px var(--red); }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 13px;
    color: var(--text-dim);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px;
    transition: all 0.3s ease;
    animation: fadeIn 0.5s ease;
  }

  .card:hover {
    background: var(--surface-hover);
    border-color: rgba(255,255,255,0.12);
    transform: translateY(-2px);
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .card-title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dim);
    margin-bottom: 12px;
  }

  .metric-value {
    font-size: 36px;
    font-weight: 700;
    line-height: 1;
    margin-bottom: 4px;
    font-variant-numeric: tabular-nums;
    transition: all 0.4s ease;
  }

  .metric-sub {
    font-size: 13px;
    color: var(--text-dim);
  }

  .accent { color: var(--accent); }
  .green { color: var(--green); }
  .yellow { color: var(--yellow); }
  .red { color: var(--red); }
  .blue { color: var(--blue); }
  .cyan { color: var(--cyan); }

  .section-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-dim);
    margin: 28px 0 12px 4px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  /* Sync status bar */
  .sync-bar {
    display: flex;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
    margin: 16px 0 12px;
    background: rgba(255,255,255,0.05);
  }
  .sync-bar div { transition: width 0.6s ease; min-width: 0; }
  .sync-bar .bar-synced { background: var(--green); }
  .sync-bar .bar-cached { background: var(--yellow); }
  .sync-bar .bar-syncing { background: var(--blue); }
  .sync-bar .bar-failed { background: var(--red); }

  .sync-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    font-size: 13px;
  }
  .sync-legend span {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .legend-dot {
    width: 10px; height: 10px;
    border-radius: 3px;
    display: inline-block;
  }

  /* GDrive status */
  .gdrive-status {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 20px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 500;
  }
  .gdrive-ok { background: rgba(74,222,128,0.08); border: 1px solid rgba(74,222,128,0.2); }
  .gdrive-err { background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.2); }

  /* Footer */
  footer {
    margin-top: 40px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
    text-align: center;
    font-size: 12px;
    color: var(--text-dim);
  }
</style>
</head>
<body>

<header>
  <h1>☁ CloudStore Dashboard</h1>
  <div class="header-right">
    <span id="conn-status"><span class="status-dot ok"></span> Connected</span>
    <span>Auto-refresh: 5s</span>
    <span id="last-update"></span>
  </div>
</header>

<!-- System overview -->
<div class="section-title">System Overview</div>
<div class="grid">
  <div class="card">
    <div class="card-title">Total Files</div>
    <div class="metric-value accent" id="total-files">—</div>
    <div class="metric-sub" id="total-size">—</div>
  </div>
  <div class="card">
    <div class="card-title">Uploads</div>
    <div class="metric-value cyan" id="m-uploads">—</div>
    <div class="metric-sub" id="m-bytes-up">—</div>
  </div>
  <div class="card">
    <div class="card-title">Downloads (cache)</div>
    <div class="metric-value green" id="m-dl-cache">—</div>
    <div class="metric-sub" id="m-bytes-down">—</div>
  </div>
  <div class="card">
    <div class="card-title">Downloads (cloud)</div>
    <div class="metric-value blue" id="m-dl-cloud">—</div>
    <div class="metric-sub">fetched from GDrive</div>
  </div>
  <div class="card">
    <div class="card-title">Deletes</div>
    <div class="metric-value red" id="m-deletes">—</div>
  </div>
</div>

<!-- Sync status -->
<div class="section-title">Sync Status</div>
<div class="card">
  <div class="sync-bar" id="sync-bar">
    <div class="bar-synced" style="width:0%"></div>
    <div class="bar-cached" style="width:0%"></div>
    <div class="bar-syncing" style="width:0%"></div>
    <div class="bar-failed" style="width:0%"></div>
  </div>
  <div class="sync-legend">
    <span><span class="legend-dot" style="background:var(--green)"></span> Synced: <b id="s-synced">0</b></span>
    <span><span class="legend-dot" style="background:var(--yellow)"></span> Cached: <b id="s-cached">0</b></span>
    <span><span class="legend-dot" style="background:var(--blue)"></span> Syncing: <b id="s-syncing">0</b></span>
    <span><span class="legend-dot" style="background:var(--red)"></span> Failed: <b id="s-failed">0</b></span>
  </div>
</div>

<div class="grid" style="margin-top: 16px;">
  <div class="card">
    <div class="card-title">Sync Success</div>
    <div class="metric-value green" id="m-sync-ok">—</div>
  </div>
  <div class="card">
    <div class="card-title">Sync Failures</div>
    <div class="metric-value red" id="m-sync-fail">—</div>
  </div>
</div>

<!-- GDrive auth -->
<div class="section-title">Google Drive</div>
<div id="gdrive-card" class="gdrive-status gdrive-err">
  <span id="gdrive-text">Checking...</span>
</div>

<footer>CloudStore — Built with Rust + Axum</footer>

<script>
function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return n.toLocaleString();
}

function fmtBytes(b) {
  if (!b || b === 0) return '0 B';
  const u = ['B','KB','MB','GB','TB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
  return (b / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i];
}

function parsePrometheus(text) {
  const m = {};
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    const [key, val] = line.trim().split(/\s+/);
    if (key && val) m[key] = parseFloat(val);
  }
  return m;
}

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

async function refresh() {
  try {
    // Fetch all data in parallel
    const [health, stats, metricsText, gdrive] = await Promise.all([
      fetchJSON('/api/health'),
      fetchJSON('/api/stats'),
      fetch('/metrics').then(r => r.text()),
      fetchJSON('/api/auth/gdrive/status').catch(() => null),
    ]);

    const m = parsePrometheus(metricsText);

    // System
    document.getElementById('total-files').textContent = fmt(health.total_files);
    document.getElementById('total-size').textContent = fmtBytes(health.total_size_bytes);

    // Traffic
    document.getElementById('m-uploads').textContent = fmt(m.cloudstore_uploads_total);
    document.getElementById('m-dl-cache').textContent = fmt(m.cloudstore_downloads_cache_total);
    document.getElementById('m-dl-cloud').textContent = fmt(m.cloudstore_downloads_cloud_total);
    document.getElementById('m-deletes').textContent = fmt(m.cloudstore_deletes_total);
    document.getElementById('m-bytes-up').textContent = fmtBytes(m.cloudstore_bytes_uploaded_total) + ' uploaded';
    document.getElementById('m-bytes-down').textContent = fmtBytes(m.cloudstore_bytes_downloaded_total) + ' downloaded';

    // Sync
    const bs = stats.by_status;
    const total = stats.total_files || 1;
    document.getElementById('s-synced').textContent = fmt(bs.synced);
    document.getElementById('s-cached').textContent = fmt(bs.cached);
    document.getElementById('s-syncing').textContent = fmt(bs.syncing);
    document.getElementById('s-failed').textContent = fmt(bs.sync_failed);

    const bar = document.getElementById('sync-bar');
    bar.children[0].style.width = (bs.synced / total * 100) + '%';
    bar.children[1].style.width = (bs.cached / total * 100) + '%';
    bar.children[2].style.width = (bs.syncing / total * 100) + '%';
    bar.children[3].style.width = (bs.sync_failed / total * 100) + '%';

    document.getElementById('m-sync-ok').textContent = fmt(m.cloudstore_sync_success_total);
    document.getElementById('m-sync-fail').textContent = fmt(m.cloudstore_sync_failure_total);

    // GDrive
    if (gdrive) {
      const el = document.getElementById('gdrive-card');
      const txt = document.getElementById('gdrive-text');
      if (gdrive.token_cache_exists) {
        el.className = 'gdrive-status gdrive-ok';
        txt.innerHTML = '✅ Token cache found — GDrive connected';
      } else if (gdrive.credentials_configured) {
        el.className = 'gdrive-status gdrive-err';
        txt.innerHTML = '⚠️ Credentials configured but no token — <a href="/api/auth/gdrive" style="color:var(--accent)">Authorize now</a>';
      } else {
        el.className = 'gdrive-status gdrive-err';
        txt.innerHTML = '❌ GDRIVE_CREDENTIALS_PATH not set';
      }
    }

    // Status
    const dot = document.querySelector('.status-dot');
    dot.className = 'status-dot ok';
    document.getElementById('last-update').textContent = new Date().toLocaleTimeString();

  } catch (err) {
    const dot = document.querySelector('.status-dot');
    dot.className = 'status-dot err';
    console.error('Refresh failed:', err);
  }
}

// Initial fetch + auto-refresh
refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>
"##;
