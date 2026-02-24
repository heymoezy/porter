#!/usr/bin/env python3
"""Porter v0.4.2 — self-hosted file manager"""

import email
import hashlib
import io
import json
import mimetypes
import os
import re
import secrets
import shutil
import time
import zipfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

PORT = 8877
HOST = "76.13.190.52"

SERVE_DIRS = {
    "vps-home": Path("/home/lobster/documents"),
    "uploads":  Path("/home/lobster/uploads"),
    "websites": Path("/home/websites"),
}

CONFIG_PATH  = Path("/home/lobster/documents/porter/porter_config.json")
AVATAR_DIR   = Path("/home/lobster/documents/porter")
AVATAR_EXTS  = {"jpg", "jpeg", "png", "webp", "gif"}
SESSION_TTL  = 30 * 24 * 3600   # 30 days
_sessions: dict = {}             # token -> {username, expires}

# ── config helpers ────────────────────────────────────────────────────────

def _hash_password(password: str, salt: str) -> str:
    return hashlib.sha256((salt + password).encode()).hexdigest()

def load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text())
        except Exception:
            pass
    salt = secrets.token_hex(16)
    cfg = {
        "username": "admin",
        "display_name": "Admin",
        "email": "",
        "salt": salt,
        "password_hash": _hash_password("porter", salt),
    }
    save_config(cfg)
    print("  [porter] First run — default login: admin / porter")
    print("  [porter] Change your password immediately in Settings.")
    return cfg

def save_config(cfg: dict) -> None:
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2))

_config: dict = {}   # loaded at startup

# ── session helpers ───────────────────────────────────────────────────────

def create_session(username: str) -> str:
    token = secrets.token_hex(32)
    _sessions[token] = {"username": username, "expires": time.time() + SESSION_TTL}
    return token

def get_session(token: str) -> dict | None:
    s = _sessions.get(token)
    if not s:
        return None
    if time.time() > s["expires"]:
        del _sessions[token]
        return None
    return s

def delete_session(token: str) -> None:
    _sessions.pop(token, None)

# ── helpers ───────────────────────────────────────────────────────────────

def safe_resolve(root_key, rel=""):
    root = SERVE_DIRS.get(root_key)
    if root is None:
        return None
    try:
        target = (root / unquote(rel)).resolve() if rel else root.resolve()
        target.relative_to(root.resolve())
        return target
    except Exception:
        return None

def is_writable(path: Path) -> bool:
    return path.exists() and path.stat().st_uid == Path("/home/lobster").stat().st_uid

def human_size(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"

def fmt_date(ts: float) -> str:
    from datetime import datetime
    return datetime.fromtimestamp(ts).strftime("%-d %b %Y")

def safe_name(name: str) -> str:
    return re.sub(r'[^\w.\- ]', '_', name).strip()

def parse_multipart(headers, body):
    ctype = headers.get("Content-Type", "")
    msg = email.message_from_bytes(
        b"Content-Type: " + ctype.encode() + b"\r\n\r\n" + body
    )
    fields = {}
    file_data = None
    file_name = None
    for part in msg.walk():
        cd = part.get("Content-Disposition", "")
        if not cd:
            continue
        nm = re.search(r'name="([^"]+)"', cd)
        if not nm:
            continue
        key = nm.group(1)
        fn = re.search(r'filename="([^"]+)"', cd)
        if fn:
            file_name = fn.group(1)
            file_data = part.get_payload(decode=True)
        else:
            fields[key] = part.get_payload(decode=True).decode("utf-8", errors="replace")
    return fields, file_name, file_data

def list_dir(root_key, rel):
    target = safe_resolve(root_key, rel)
    if target is None or not target.is_dir():
        return None
    entries = []
    try:
        items = sorted(target.iterdir(),
                       key=lambda p: (not p.is_dir(), p.name.lower()))
    except PermissionError:
        return {"entries": [], "writable": False}
    for item in items:
        try:
            st = item.stat()
            entries.append({
                "name":       item.name,
                "type":       "dir" if item.is_dir() else "file",
                "size":       human_size(st.st_size) if item.is_file() else "",
                "size_bytes": st.st_size if item.is_file() else -1,
                "modified":   fmt_date(st.st_mtime),
                "mtime":      st.st_mtime,
                "writable":   is_writable(item),
            })
        except Exception:
            continue
    return {
        "entries":  entries,
        "writable": is_writable(target),
    }

def walk_search(root_key, q):
    root = SERVE_DIRS.get(root_key)
    if root is None:
        return []
    q = q.lower()
    results = []
    try:
        for dirpath, dirnames, filenames in os.walk(str(root)):
            dp = Path(dirpath)
            for name in dirnames + filenames:
                if q in name.lower():
                    fp = dp / name
                    try:
                        st = fp.stat()
                        is_dir = fp.is_dir()
                        rel_path = str(fp.relative_to(root))
                        results.append({
                            "name":       name,
                            "path":       rel_path,
                            "type":       "dir" if is_dir else "file",
                            "size":       human_size(st.st_size) if not is_dir else "",
                            "size_bytes": st.st_size if not is_dir else -1,
                            "modified":   fmt_date(st.st_mtime),
                            "mtime":      st.st_mtime,
                            "writable":   is_writable(fp),
                        })
                    except Exception:
                        continue
            if len(results) >= 200:
                break
    except Exception:
        pass
    return results

def disk_info(root_key):
    root = SERVE_DIRS.get(root_key)
    if root is None:
        return None
    try:
        usage = shutil.disk_usage(str(root))
        return {
            "total":   usage.total,
            "used":    usage.used,
            "free":    usage.free,
            "total_h": human_size(usage.total),
            "used_h":  human_size(usage.used),
            "free_h":  human_size(usage.free),
        }
    except Exception:
        return None

# ── login page ────────────────────────────────────────────────────────────

LOGIN_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0F0F0F">
<title>Porter — Sign in</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%23F7931A'/><rect x='9' y='8' width='4' height='16' rx='1.5' fill='white'/><rect x='9' y='8' width='10' height='4' rx='1.5' fill='white'/><rect x='9' y='15' width='10' height='4' rx='1.5' fill='white'/><rect x='19' y='8' width='4' height='11' rx='1.5' fill='white'/></svg>">
<style>
:root {
  --bg: #0F0F0F; --surface: #1A1A1A; --raised: #242424;
  --border: #2E2E2E; --border2: #363636;
  --accent: #f7931a; --accent-d: #d97706;
  --text: #F0F0F0; --text2: #C0C0C0; --text3: #909090;
  --danger: #dc2626; --radius: 8px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg); color: var(--text); font-size: 14px;
  display: flex; align-items: center; justify-content: center;
  height: 100vh;
}
.login-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 14px; padding: 40px; width: 360px;
  box-shadow: 0 20px 60px rgba(0,0,0,.5);
}
.login-logo {
  display: flex; align-items: center; gap: 12px; margin-bottom: 32px;
}
.login-logo-name { font-size: 20px; font-weight: 700; color: #fff; letter-spacing: -.4px; }
.login-logo-sub { font-size: 10px; color: var(--text3); font-weight: 600;
  letter-spacing: 1.2px; text-transform: uppercase; margin-top: 3px; }
.login-field { margin-bottom: 16px; }
.login-field label { display: block; font-size: 12px; font-weight: 500;
  color: var(--text2); margin-bottom: 6px; }
.login-input {
  width: 100%; background: var(--raised); border: 1px solid var(--border2);
  border-radius: var(--radius); padding: 10px 12px; font-size: 14px;
  color: var(--text); font-family: inherit; outline: none; transition: .15s;
}
.login-input:focus { border-color: var(--accent); }
.login-btn {
  width: 100%; padding: 11px; border-radius: var(--radius);
  background: var(--accent); color: #000; border: none;
  font-size: 14px; font-weight: 700; font-family: inherit;
  cursor: pointer; transition: .12s; margin-top: 8px;
}
.login-btn:hover { background: var(--accent-d); }
.login-error {
  margin-top: 14px; padding: 10px 14px; border-radius: var(--radius);
  background: rgba(220,38,38,.1); border: 1px solid #441111;
  color: #f87171; font-size: 13px; display: none;
}
</style>
</head>
<body>
<div class="login-card">
  <div class="login-logo">
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
      <rect width="34" height="34" rx="8" fill="#F7931A"/>
      <rect x="10" y="9" width="4" height="16" rx="1.5" fill="white"/>
      <rect x="10" y="9" width="10" height="4" rx="1.5" fill="white"/>
      <rect x="10" y="16" width="10" height="4" rx="1.5" fill="white"/>
      <rect x="20" y="9" width="4" height="11" rx="1.5" fill="white"/>
    </svg>
    <div>
      <div class="login-logo-name">porter</div>
      <div class="login-logo-sub">File Manager</div>
    </div>
  </div>
  <div class="login-field">
    <label>Username</label>
    <input type="text" class="login-input" id="uname" autocomplete="username" autofocus>
  </div>
  <div class="login-field">
    <label>Password</label>
    <input type="password" class="login-input" id="pw" autocomplete="current-password">
  </div>
  <button class="login-btn" onclick="doLogin()">Sign in</button>
  <div class="login-error" id="loginErr"></div>
</div>
<script>
document.getElementById('pw').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});
document.getElementById('uname').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('pw').focus();
});
async function doLogin() {
  const username = document.getElementById('uname').value.trim();
  const password = document.getElementById('pw').value;
  const errEl = document.getElementById('loginErr');
  errEl.style.display = 'none';
  try {
    const res = await fetch('/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username, password})
    });
    const data = await res.json();
    if (data.ok) {
      window.location.href = '/';
    } else {
      errEl.textContent = data.error || 'Invalid username or password';
      errEl.style.display = 'block';
    }
  } catch(e) {
    errEl.textContent = 'Network error — try again';
    errEl.style.display = 'block';
  }
}
</script>
</body>
</html>
"""

# ── page ──────────────────────────────────────────────────────────────────

PAGE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0F0F0F">
<title>Porter</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%23F7931A'/><rect x='9' y='8' width='4' height='16' rx='1.5' fill='white'/><rect x='9' y='8' width='10' height='4' rx='1.5' fill='white'/><rect x='9' y='15' width='10' height='4' rx='1.5' fill='white'/><rect x='19' y='8' width='4' height='11' rx='1.5' fill='white'/></svg>">
<style>
:root {
  --bg:       #0F0F0F;
  --surface:  #1A1A1A;
  --raised:   #242424;
  --border:   #2E2E2E;
  --border2:  #363636;
  --accent:   #f7931a;
  --accent-d: #d97706;
  --text:     #F0F0F0;
  --text2:    #C0C0C0;
  --text3:    #909090;
  --danger:   #dc2626;
  --success:  #16a34a;
  --radius:   8px;
  --sidebar:  220px;
  --preview:  460px;
  --editor-font-size: 12px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg); color: var(--text);
  height: 100vh; display: flex; overflow: hidden;
  font-size: 14px;
}

/* ── sidebar ── */
.sidebar {
  width: var(--sidebar); min-width: var(--sidebar);
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex; flex-direction: column;
  padding: 20px 0;
}
.logo {
  padding: 0 20px 28px;
  display: flex; align-items: center; gap: 11px;
}
.logo-mark { flex-shrink: 0; }
.logo-name {
  font-size: 17px; font-weight: 700; color: #fff;
  letter-spacing: -0.4px; display: block; line-height: 1;
}
.logo-sub {
  font-size: 9px; font-weight: 600; letter-spacing: 1.2px;
  color: var(--text3); text-transform: uppercase; display: block;
  margin-top: 4px;
}
.nav-label {
  padding: 0 20px 8px;
  font-size: 10px; font-weight: 600; letter-spacing: 1px;
  color: var(--text3); text-transform: uppercase;
}
.loc {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 20px; cursor: pointer; color: var(--text2);
  transition: .12s; border-left: 2px solid transparent;
  user-select: none;
}
.loc:hover { background: var(--raised); color: var(--text); }
.loc.active { color: var(--accent); border-left-color: var(--accent);
              background: rgba(247,147,26,.06); }
.loc svg { flex-shrink: 0; opacity: .7; }
.loc.active svg { opacity: 1; }
.loc-name { font-size: 13px; font-weight: 500; }
.sidebar-footer {
  padding: 16px 20px 0;
  border-top: 1px solid var(--border);
  font-size: 12px; color: var(--text3);
}
.disk-bar-wrap { margin-bottom: 8px; }
.disk-bar-labels {
  display: flex; justify-content: space-between;
  font-size: 11px; margin-bottom: 5px;
}
.disk-bar-track {
  height: 4px; background: var(--border2);
  border-radius: 2px; overflow: hidden;
}
.disk-bar-fill {
  height: 100%; background: var(--accent); border-radius: 2px;
  transition: width .4s ease;
}
.ver-link {
  display:block; margin-top:10px; padding-bottom:2px;
  font-size:10px; font-weight:600; letter-spacing:.8px;
  text-transform:uppercase; color:var(--text3);
  cursor:pointer; transition:color .15s; border:none; background:none;
  text-align:left; font-family:inherit;
}
.ver-link:hover { color:var(--accent); }

/* ── main ── */
.main {
  flex: 1; display: flex; flex-direction: column; min-width: 0;
  overflow: hidden; transition: padding-right .2s ease;
}
.main.preview-open { padding-right: var(--preview); }

/* toolbar */
.toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  flex-shrink: 0;
}
.breadcrumb {
  flex: 1; display: flex; align-items: center;
  gap: 4px; flex-wrap: wrap; min-width: 0;
}
.crumb {
  background: none; border: none; font-family: inherit;
  font-size: 14px; color: var(--text2); cursor: pointer; padding: 2px 4px;
  border-radius: 4px; transition: .1s;
}
.crumb:hover { color: var(--text); background: var(--raised); }
.crumb.current { color: var(--text); cursor: default; font-weight: 500; }
.crumb.current:hover { background: none; }
.crumb-sep { color: var(--text3); font-size: 13px; user-select: none; }
.toolbar-actions { display: flex; gap: 6px; flex-shrink: 0; align-items: center; }

/* search */
.search-wrap { position: relative; display: flex; align-items: center; }
.search-icon {
  position: absolute; left: 9px; pointer-events: none;
  color: var(--text3); display: flex; align-items: center;
  transition: color .15s;
}
.search-wrap:focus-within .search-icon { color: var(--accent); }
#searchInput {
  width: 180px;
  background: var(--surface); border: 1px solid var(--border2);
  border-radius: var(--radius); padding: 6px 28px 6px 30px;
  font-size: 13px; color: var(--text); font-family: inherit; outline: none;
  transition: border-color .15s, width .2s;
}
#searchInput:focus { border-color: var(--accent); width: 220px; }
#clearSearch {
  display: none; position: absolute; right: 6px;
  background: none; border: none; color: var(--text3); cursor: pointer;
  padding: 2px; line-height: 1;
}
#clearSearch.visible { display: block; }

.btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: var(--radius);
  font-size: 13px; font-weight: 500; font-family: inherit;
  cursor: pointer; transition: .12s; border: 1px solid transparent;
  white-space: nowrap;
}
.btn-ghost {
  background: none; color: var(--text2); border-color: var(--border2);
}
.btn-ghost:hover { background: var(--raised); color: var(--text); border-color: #333; }
.btn-primary {
  background: var(--accent); color: #000; border-color: var(--accent);
  font-weight: 600;
}
.btn-primary:hover { background: var(--accent-d); border-color: var(--accent-d); }
.btn-danger {
  background: none; color: var(--danger); border-color: #441111;
}
.btn-danger:hover { background: rgba(220,38,38,.1); }
.btn-icon {
  padding: 7px 8px; background: none; color: var(--text3);
  border-color: var(--border2);
}
.btn-icon:hover { background: var(--raised); color: var(--text); border-color: #333; }
.btn[disabled] { opacity: .35; pointer-events: none; }

/* selection toolbar */
.selection-toolbar {
  display: none; align-items: center; gap: 10px;
  padding: 8px 24px; background: rgba(247,147,26,.06);
  border-bottom: 1px solid #2a1800; flex-shrink: 0;
  font-size: 13px;
}
.sel-count { color: var(--accent); font-weight: 600; flex: 1; }

/* file list */
.file-area {
  flex: 1; overflow-y: auto; position: relative;
}
.file-area.drag-over::after {
  content: 'Drop to upload'; position: absolute; inset: 0;
  background: rgba(247,147,26,.08);
  border: 2px dashed var(--accent);
  border-radius: var(--radius); margin: 16px;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 600; color: var(--accent);
  pointer-events: none; z-index: 10;
  display: flex;
}
.list-header {
  display: grid; grid-template-columns: 32px 1fr 90px 110px 40px;
  padding: 8px 24px; gap: 12px;
  border-bottom: 1px solid var(--border);
  position: sticky; top: 0; background: var(--bg); z-index: 1;
}
.sort-btn {
  background: none; border: none; font-family: inherit;
  font-size: 11px; font-weight: 600; letter-spacing: .6px;
  text-transform: uppercase; color: var(--text3);
  cursor: pointer; padding: 0; text-align: left;
  display: flex; align-items: center; gap: 4px;
  transition: color .1s;
}
.sort-btn:hover { color: var(--text2); }
.sort-btn.active { color: var(--accent); }
.sort-ind { font-size: 10px; }
.cb-col {
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity .1s;
}
.file-row:hover .cb-col,
.file-area.has-selection .cb-col { opacity: 1; }
.list-header .cb-col { opacity: 1; }
.row-cb {
  width: 14px; height: 14px; cursor: pointer;
  accent-color: var(--accent);
}
.file-row {
  display: grid; grid-template-columns: 32px 1fr 90px 110px 40px;
  align-items: center; gap: 12px;
  padding: 0 24px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  cursor: pointer; position: relative; transition: background .1s;
}
.file-row:hover { background: var(--raised); }
.file-row:hover .file-label { color: var(--text); }
.file-row.is-dir .file-label { color: var(--text); font-weight: 500; }
.file-row:last-child { border-bottom: none; }
.file-name {
  display: flex; align-items: center; gap: 10px;
  min-width: 0; padding: 11px 0;
}
.file-icon { flex-shrink: 0; }
.file-label {
  font-size: 13px; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis;
}
.file-size { font-size: 12px; color: var(--text3); }
.file-date { font-size: 12px; color: var(--text3); }
.lock { font-size: 11px; color: var(--text3); margin-left: 4px;
        opacity: .5; flex-shrink: 0; }
.file-path {
  font-size: 11px; color: var(--text3); margin-top: 2px;
}

/* skeleton */
@keyframes shimmer {
  0%   { opacity: .4; }
  50%  { opacity: .8; }
  100% { opacity: .4; }
}
.skel {
  background: var(--border2); border-radius: 3px;
  animation: shimmer 1.4s ease infinite;
}

/* row menu */
.row-menu-btn {
  background: none; border: none; color: var(--text3); cursor: pointer;
  padding: 4px; border-radius: 4px; transition: .1s;
  display: flex; align-items: center; justify-content: center;
  opacity: 0;
}
.file-row:hover .row-menu-btn { opacity: 1; }
.row-menu-btn:hover { background: var(--raised); color: var(--text); }

.dropdown {
  position: fixed; background: var(--raised);
  border: 1px solid var(--border2); border-radius: var(--radius);
  box-shadow: 0 8px 32px rgba(0,0,0,.5);
  min-width: 170px; z-index: 100; overflow: hidden;
}
.dropdown-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 14px; font-size: 13px; cursor: pointer;
  transition: .1s; color: var(--text);
}
.dropdown-item:hover { background: #222; }
.dropdown-item.danger { color: var(--danger); }
.dropdown-item.danger:hover { background: rgba(220,38,38,.1); }
.dropdown-item svg { opacity: .7; flex-shrink: 0; }
.dropdown-sep {
  height: 1px; background: var(--border);
  margin: 4px 0;
}

/* empty state */
.empty-state {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 80px 20px;
  color: var(--text3); gap: 12px; text-align: center;
}
.empty-state svg { opacity: .25; }
.empty-state p { font-size: 14px; }

/* read-only banner */
.banner {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 24px; font-size: 12px; color: #c07020;
  background: rgba(247,147,26,.05); border-bottom: 1px solid #2a1a00;
  flex-shrink: 0;
}

/* upload progress bar */
.upload-bar {
  position: fixed; bottom: 24px; right: 24px;
  background: var(--raised); border: 1px solid var(--border2);
  border-radius: var(--radius); padding: 14px 18px;
  min-width: 280px; box-shadow: 0 8px 32px rgba(0,0,0,.5);
  z-index: 200; display: none;
}
.upload-bar.visible { display: block; }
.upload-bar-name { font-size: 13px; color: var(--text); margin-bottom: 10px; }
progress.ubar {
  width: 100%; height: 3px; border: none; border-radius: 2px;
  appearance: none; overflow: hidden; background: var(--border2);
}
progress.ubar::-webkit-progress-bar { background: var(--border2); }
progress.ubar::-webkit-progress-value { background: var(--accent); }

/* toasts */
#toasts {
  position: fixed; bottom: 24px; left: 50%;
  transform: translateX(-50%);
  display: flex; flex-direction: column; gap: 8px;
  align-items: center; z-index: 300; pointer-events: none;
}
.toast {
  background: var(--raised); border: 1px solid var(--border2);
  border-radius: 100px; padding: 8px 18px;
  font-size: 13px; color: var(--text);
  box-shadow: 0 4px 20px rgba(0,0,0,.5);
  animation: slideup .2s ease;
}
.toast.ok { border-color: #1a3a1a; color: #4ade80; }
.toast.err { border-color: #3a1a1a; color: #f87171; }
@keyframes slideup { from { opacity:0; transform:translateY(8px); } }

/* modal */
.overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.65);
  display: flex; align-items: center; justify-content: center;
  z-index: 200; backdrop-filter: blur(2px);
}
.modal {
  background: var(--raised); border: 1px solid var(--border2);
  border-radius: 12px; padding: 28px; width: 380px;
  box-shadow: 0 20px 60px rgba(0,0,0,.6);
}
.modal h3 { font-size: 16px; font-weight: 600; margin-bottom: 6px; }
.modal p { font-size: 13px; color: var(--text2); margin-bottom: 20px; line-height: 1.5; overflow-wrap: break-word; word-break: break-all; }
.modal input {
  width: 100%; background: var(--surface); border: 1px solid var(--border2);
  border-radius: var(--radius); padding: 9px 12px;
  font-size: 14px; color: var(--text); font-family: inherit;
  margin-bottom: 20px; outline: none; transition: .15s;
}
.modal input:focus { border-color: var(--accent); }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; }

/* preview panel */
.preview-panel {
  position: fixed; top: 0; right: calc(-1 * var(--preview));
  width: var(--preview); height: 100vh;
  background: var(--surface); border-left: 1px solid var(--border);
  display: flex; flex-direction: column;
  z-index: 50; transition: right .2s ease;
}
.preview-panel.open { right: 0; }
.preview-header {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px; border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.preview-filename {
  flex: 1; font-size: 13px; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.preview-actions { display: flex; gap: 6px; }
.preview-body {
  flex: 1; overflow: auto; position: relative;
}
.preview-pre {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: var(--editor-font-size); line-height: 1.6; padding: 16px;
  color: var(--text);
  tab-size: 2;
}
.preview-img {
  display: flex; align-items: center; justify-content: center;
  padding: 16px; min-height: 200px;
}
.preview-img img { max-width: 100%; max-height: calc(100vh - 120px); object-fit: contain; }
.preview-na {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 60px 24px; gap: 12px;
  color: var(--text3); text-align: center;
}
.preview-na p { font-size: 13px; }
.editor-ta {
  width: 100%; height: 100%; min-height: 400px;
  background: var(--bg); border: none; outline: none;
  color: var(--text); font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: var(--editor-font-size); line-height: 1.6; padding: 16px;
  resize: none; tab-size: 2;
}

/* folder picker */
.fp-modal {
  background: var(--raised); border: 1px solid var(--border2);
  border-radius: 12px; padding: 0; width: 380px;
  box-shadow: 0 20px 60px rgba(0,0,0,.6); overflow: hidden;
}
.fp-modal-header {
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--border);
}
.fp-modal-header h3 { font-size: 15px; font-weight: 600; }
.fp-modal-header p { font-size: 12px; color: var(--text3); margin-top: 4px; }
.fp-list {
  max-height: 300px; overflow-y: auto;
  padding: 8px 0;
}
.fp-current {
  padding: 8px 16px; font-size: 11px; color: var(--accent);
  font-weight: 600; letter-spacing: .4px; background: rgba(247,147,26,.05);
}
.fp-item {
  padding: 9px 16px; font-size: 13px; cursor: pointer;
  color: var(--text2); transition: .1s; display: flex; align-items: center; gap: 8px;
}
.fp-item:hover { background: var(--border); color: var(--text); }
.fp-up { color: var(--text3); font-size: 12px; }
.fp-modal-footer {
  padding: 12px 16px; border-top: 1px solid var(--border);
  display: flex; gap: 8px; justify-content: flex-end;
}

/* shortcuts overlay */
.shortcuts-modal {
  background: var(--raised); border: 1px solid var(--border2);
  border-radius: 12px; padding: 24px; width: 380px;
  box-shadow: 0 20px 60px rgba(0,0,0,.6);
}
.shortcuts-modal h3 { font-size: 15px; font-weight: 600; margin-bottom: 16px; }
.shortcuts-grid {
  display: grid; grid-template-columns: auto 1fr;
  gap: 8px 16px; align-items: center;
}
kbd {
  background: var(--surface); border: 1px solid var(--border2);
  border-radius: 4px; padding: 2px 8px;
  font-size: 12px; font-family: monospace; color: var(--text);
  white-space: nowrap;
}
.shortcut-desc { font-size: 13px; color: var(--text2); }

/* changelog modal */
.changelog-modal {
  background:var(--raised); border:1px solid var(--border2);
  border-radius:12px; width:460px; max-height:70vh;
  display:flex; flex-direction:column; overflow:hidden;
  box-shadow:0 20px 60px rgba(0,0,0,.6);
}
.changelog-header {
  display:flex; align-items:center; justify-content:space-between;
  padding:18px 24px; border-bottom:1px solid var(--border); flex-shrink:0;
}
.changelog-body { overflow-y:auto; padding:16px 24px 24px; }
.cl-ver-row {
  display:flex; align-items:baseline; gap:10px;
  margin-top:20px; padding-bottom:8px; border-bottom:1px solid var(--border);
}
.cl-ver-row:first-child { margin-top:0; }
.cl-vtag { font-size:13px; font-weight:700; color:var(--accent); }
.cl-vdate { font-size:11px; color:var(--text3); }
.cl-notes { list-style:none; padding:0; margin:10px 0 0; }
.cl-notes li {
  font-size:13px; color:var(--text2); line-height:1.65;
  padding:2px 0 2px 14px; position:relative;
}
.cl-notes li::before { content:'–'; position:absolute; left:0; color:var(--text3); }

/* search group headers */
.search-group-hdr {
  padding:7px 24px; font-size:11px; font-weight:600; letter-spacing:.4px;
  color:var(--accent); background:var(--bg); position:sticky; top:0; z-index:1;
  border-bottom:1px solid var(--border); cursor:pointer; display:flex; align-items:center; gap:6px;
}
.search-group-hdr:hover { color:var(--text); }

/* search count bar */
.search-count-bar {
  padding:5px 24px; font-size:12px; color:var(--text3);
  background:var(--surface); border-bottom:1px solid var(--border); flex-shrink:0;
}
.search-count-bar span { color:var(--text2); font-weight:600; }

/* settings toggle (shared component) */
.settings-toggle { position: relative; display: inline-block; width: 32px; height: 18px; flex-shrink: 0; }
.settings-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
.slider {
  position: absolute; inset: 0; background: var(--border2);
  border-radius: 9px; cursor: pointer; transition: .2s;
}
.slider::before {
  content: ''; position: absolute;
  width: 12px; height: 12px; left: 3px; top: 3px;
  background: var(--text3); border-radius: 50%; transition: .2s;
}
.settings-toggle input:checked + .slider { background: var(--accent); }
.settings-toggle input:checked + .slider::before { transform: translateX(14px); background: #000; }
body.density-compact .file-name { padding: 6px 0; }

/* user card */
.user-card { margin-top: auto; border-top: 1px solid var(--border); padding: 12px 16px;
  display: flex; align-items: center; gap: 10px; cursor: pointer; transition: background .12s; }
.user-card:hover { background: var(--raised); }
.user-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--accent); color: #000;
  font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; overflow: hidden; }
.user-avatar img { width: 100%; height: 100%; object-fit: cover; }
.user-name { font-size: 13px; font-weight: 600; color: var(--text); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
.user-sub { font-size: 11px; color: var(--text3); margin-top: 1px; }

/* settings overlay */
.settings-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.75);
  backdrop-filter: blur(4px); z-index: 400; display: none; align-items: center; justify-content: center; }
.settings-overlay.open { display: flex; }
.settings-dialog { background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
  width: 700px; height: 500px; display: flex; overflow: hidden; position: relative;
  box-shadow: 0 30px 80px rgba(0,0,0,.7); }
.settings-nav { width: 180px; background: var(--bg); border-right: 1px solid var(--border);
  padding: 20px 0; display: flex; flex-direction: column; }
.settings-nav-title { padding: 0 16px 16px; font-size: 11px; font-weight: 600;
  letter-spacing: .8px; color: var(--text3); text-transform: uppercase; }
.settings-nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 16px;
  cursor: pointer; font-size: 13px; color: var(--text2); transition: .1s;
  border-left: 2px solid transparent; background: none; border-top: none; border-right: none;
  border-bottom: none; font-family: inherit; width: 100%; text-align: left; }
.settings-nav-item:hover { background: var(--raised); color: var(--text); }
.settings-nav-item.active { color: var(--accent); border-left-color: var(--accent);
  background: rgba(247,147,26,.06); }
.settings-content { flex: 1; overflow-y: auto; padding: 28px 32px; position: relative; }
.settings-page { display: none; }
.settings-page.active { display: block; }
.settings-page-title { font-size: 18px; font-weight: 700; color: var(--text);
  margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
.settings-field { margin-bottom: 18px; }
.settings-field label { display: block; font-size: 12px; font-weight: 500;
  color: var(--text2); margin-bottom: 6px; }
.settings-input { width: 100%; background: var(--raised); border: 1px solid var(--border2);
  border-radius: var(--radius); padding: 9px 12px; font-size: 14px; color: var(--text);
  font-family: inherit; outline: none; transition: .15s; }
.settings-input:focus { border-color: var(--accent); }
.avatar-section { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.avatar-large { width: 64px; height: 64px; border-radius: 50%; background: var(--accent); color: #000;
  font-size: 24px; font-weight: 700; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; overflow: hidden; cursor: pointer; transition: opacity .15s; }
.avatar-large:hover { opacity: .85; }
.avatar-large img { width: 100%; height: 100%; object-fit: cover; }
.avatar-hint { font-size: 12px; color: var(--text3); margin-top: 4px; }
.settings-save-row { display: flex; justify-content: flex-end; margin-top: 16px; }
.settings-row { display: flex; align-items: center; justify-content: space-between;
  padding: 14px 0; border-bottom: 1px solid var(--border); }
.settings-row:last-child { border-bottom: none; }
.settings-row-label { font-size: 13px; color: var(--text2); }
.settings-row-desc { font-size: 11px; color: var(--text3); margin-top: 2px; }
.seg-ctrl { display: flex; gap: 2px; background: var(--bg); border: 1px solid var(--border2);
  border-radius: 6px; padding: 2px; }
.seg-ctrl button { background: none; border: none; font-family: inherit; font-size: 11px;
  color: var(--text3); cursor: pointer; padding: 3px 8px; border-radius: 4px; transition: .1s; }
.seg-ctrl button.active { background: var(--raised); color: var(--text); font-weight: 600; }
.pw-section { margin-top: 28px; border-top: 1px solid var(--border); padding-top: 20px; }
.pw-section-title { font-size: 12px; font-weight: 600; color: var(--text3);
  text-transform: uppercase; letter-spacing: .6px; margin-bottom: 16px; }

/* scrollbar */
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 3px; }
</style>
</head>
<body>

<!-- sidebar -->
<aside class="sidebar">
  <div class="logo">
    <svg class="logo-mark" width="34" height="34" viewBox="0 0 34 34" fill="none">
      <rect width="34" height="34" rx="8" fill="#F7931A"/>
      <!-- stem -->
      <rect x="10" y="9" width="4" height="16" rx="1.5" fill="white"/>
      <!-- bowl top bar -->
      <rect x="10" y="9" width="10" height="4" rx="1.5" fill="white"/>
      <!-- bowl bottom bar -->
      <rect x="10" y="16" width="10" height="4" rx="1.5" fill="white"/>
      <!-- bowl right vertical -->
      <rect x="20" y="9" width="4" height="11" rx="1.5" fill="white"/>
    </svg>
    <div>
      <span class="logo-name">porter</span>
      <span class="logo-sub">File Manager</span>
    </div>
  </div>
  <div class="nav-label">Locations</div>
  <div id="locations"></div>
  <div class="sidebar-footer" id="sfooter"></div>
  <div class="user-card" id="userCard" onclick="openSettings('account')">
    <div class="user-avatar" id="ucAvatar"></div>
    <div style="min-width:0;flex:1">
      <div class="user-name" id="ucName">—</div>
      <div class="user-sub">Administrator</div>
    </div>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" style="opacity:.4;flex-shrink:0">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  </div>
</aside>

<!-- main -->
<main class="main" id="mainEl">
  <div class="toolbar">
    <div class="breadcrumb" id="breadcrumb"></div>
    <div class="toolbar-actions">
      <!-- search -->
      <div class="search-wrap">
        <span class="search-icon">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </span>
        <input type="text" id="searchInput" placeholder="Search…"
               oninput="onSearchInput(this.value)"
               onkeydown="if(event.key==='Escape'){clearSearch();event.preventDefault()}">
        <button id="clearSearch" onclick="clearSearch()" title="Clear search">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <!-- refresh -->
      <button class="btn btn-icon" onclick="navigate(curRoot,curPath)" title="Refresh (r)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
      </button>
      <!-- shortcuts -->
      <button class="btn btn-icon" onclick="toggleShortcuts()" title="Keyboard shortcuts (?)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="6" cy="12" r=".5" fill="currentColor"/><circle cx="10" cy="12" r=".5" fill="currentColor"/><circle cx="14" cy="12" r=".5" fill="currentColor"/><circle cx="18" cy="12" r=".5" fill="currentColor"/><line x1="8" y1="15" x2="16" y2="15"/></svg>
      </button>
      <button class="btn btn-ghost" id="btnMkdir" onclick="openMkdir()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
        New folder
      </button>
      <button class="btn btn-primary" id="btnUpload" onclick="triggerUpload()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>
        Upload
      </button>
    </div>
  </div>

  <div id="banner" style="display:none" class="banner">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
    This folder is read-only — you can browse and download but not modify files.
  </div>

  <div id="searchCountBar" style="display:none" class="search-count-bar">
    <span id="searchCountText"></span>
  </div>

  <!-- selection toolbar -->
  <div class="selection-toolbar" id="selectionToolbar">
    <span class="sel-count" id="selCount"></span>
    <button class="btn btn-ghost" onclick="downloadZip()" style="padding:5px 12px;font-size:12px">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
      Download ZIP
    </button>
    <button class="btn btn-danger" onclick="bulkDelete()" style="padding:5px 12px;font-size:12px">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
      Delete
    </button>
    <button class="btn btn-ghost" onclick="clearSelection()" style="padding:5px 12px;font-size:12px">Clear</button>
  </div>

  <div class="file-area" id="fileArea">
    <div class="list-header">
      <div class="cb-col">
        <input type="checkbox" class="row-cb" id="selectAll" onchange="toggleSelectAll(this.checked)">
      </div>
      <button class="sort-btn" id="sh-name" onclick="setSort('name')">Name <span class="sort-ind" id="si-name"></span></button>
      <button class="sort-btn" id="sh-size" onclick="setSort('size')">Size <span class="sort-ind" id="si-size"></span></button>
      <button class="sort-btn" id="sh-modified" onclick="setSort('modified')">Modified <span class="sort-ind" id="si-modified"></span></button>
      <div></div>
    </div>
    <div id="listing"></div>
  </div>
</main>

<!-- preview panel -->
<div class="preview-panel" id="previewPanel">
  <div class="preview-header">
    <span class="preview-filename" id="previewFilename">—</span>
    <div class="preview-actions">
      <button class="btn btn-ghost" id="btnEdit" onclick="openEditor()" style="display:none;padding:5px 10px;font-size:12px">Edit</button>
      <button class="btn btn-primary" id="btnSave" onclick="saveFile()" style="display:none;padding:5px 10px;font-size:12px">Save</button>
      <button class="btn btn-icon" onclick="closePreview()" title="Close (Esc)" style="padding:6px 7px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  </div>
  <div class="preview-body" id="previewBody"></div>
</div>

<!-- hidden file input -->
<input type="file" id="fileInput" style="display:none" multiple>

<!-- upload progress -->
<div class="upload-bar" id="uploadBar">
  <div class="upload-bar-name" id="uploadName">Uploading…</div>
  <progress class="ubar" id="uploadProgress"></progress>
</div>

<!-- toast container -->
<div id="toasts"></div>

<!-- dropdown (shared, moved via JS) -->
<div class="dropdown" id="dropdown" style="display:none"></div>

<!-- main modal -->
<div class="overlay" id="overlay" style="display:none" onclick="if(event.target===this)closeModal()">
  <div class="modal" id="modal">
    <h3 id="modalTitle"></h3>
    <p id="modalDesc"></p>
    <input type="text" id="modalInput" style="display:none">
    <div class="modal-actions" id="modalActions"></div>
  </div>
</div>

<!-- folder picker overlay -->
<div class="overlay" id="fpOverlay" style="display:none" onclick="if(event.target===this)closeFolderPicker()">
  <div class="fp-modal">
    <div class="fp-modal-header">
      <h3>Move to…</h3>
      <p>Select a destination folder</p>
    </div>
    <div class="fp-list" id="fpList"></div>
    <div class="fp-modal-footer">
      <button class="btn btn-ghost" onclick="closeFolderPicker()">Cancel</button>
      <button class="btn btn-primary" onclick="confirmFolderPicker()">Move here</button>
    </div>
  </div>
</div>

<!-- shortcuts overlay -->
<div class="overlay" id="shortcutsOverlay" style="display:none" onclick="if(event.target===this)toggleShortcuts()">
  <div class="shortcuts-modal">
    <h3>Keyboard Shortcuts</h3>
    <div class="shortcuts-grid">
      <kbd>/</kbd><span class="shortcut-desc">Search files</span>
      <kbd>r</kbd><span class="shortcut-desc">Refresh listing</span>
      <kbd>n</kbd><span class="shortcut-desc">New folder</span>
      <kbd>u</kbd><span class="shortcut-desc">Upload files</span>
      <kbd>Backspace</kbd><span class="shortcut-desc">Go up one level</span>
      <kbd>Esc</kbd><span class="shortcut-desc">Close / cancel</span>
      <kbd>?</kbd><span class="shortcut-desc">Toggle this overlay</span>
    </div>
  </div>
</div>

<!-- changelog overlay -->
<div class="overlay" id="changelogOverlay" style="display:none"
     onclick="if(event.target===this)closeChangelog()">
  <div class="changelog-modal">
    <div class="changelog-header">
      <span style="font-size:15px;font-weight:600;">Release Notes</span>
      <button class="btn btn-icon" onclick="closeChangelog()">✕</button>
    </div>
    <div class="changelog-body" id="changelogBody"></div>
  </div>
</div>

<!-- settings overlay -->
<div class="settings-overlay" id="settingsOverlay" onclick="if(event.target===this)closeSettings()">
  <div class="settings-dialog">

    <!-- left nav -->
    <div class="settings-nav">
      <div class="settings-nav-title">Settings</div>
      <button class="settings-nav-item active" id="snav-account" onclick="switchSettingsTab('account')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        Account
      </button>
      <button class="settings-nav-item" id="snav-appearance" onclick="switchSettingsTab('appearance')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
        Appearance
      </button>
      <!-- spacer pushes logout to bottom -->
      <div style="flex:1"></div>
      <div style="padding:12px 16px;border-top:1px solid var(--border)">
        <button class="btn btn-ghost" onclick="doLogout()" style="width:100%;justify-content:flex-start;gap:8px;font-size:13px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign out
        </button>
      </div>
    </div>

    <!-- right content -->
    <div class="settings-content">

      <!-- close button -->
      <button class="btn btn-icon" onclick="closeSettings()"
              style="position:absolute;top:14px;right:14px;padding:6px 7px;border:none">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      <!-- Account page -->
      <div class="settings-page active" id="spage-account">
        <div class="settings-page-title">Account</div>
        <div class="avatar-section">
          <div class="avatar-large" id="saAvatar" onclick="triggerAvatarUpload()" title="Click to change photo"></div>
          <div>
            <div style="font-size:13px;color:var(--text2)">Profile photo</div>
            <div class="avatar-hint">Click to upload · JPG, PNG, WebP, GIF</div>
          </div>
        </div>
        <div class="settings-field">
          <label>Display name</label>
          <input type="text" class="settings-input" id="sa-name" placeholder="Your name">
        </div>
        <div class="settings-field">
          <label>Email</label>
          <input type="email" class="settings-input" id="sa-email" placeholder="you@example.com">
        </div>
        <div class="settings-save-row">
          <button class="btn btn-primary" onclick="saveAccount()">Save changes</button>
        </div>
        <div class="pw-section">
          <div class="pw-section-title">Change password</div>
          <div class="settings-field">
            <label>Current password</label>
            <input type="password" class="settings-input" id="sa-pwCurrent" autocomplete="current-password">
          </div>
          <div class="settings-field">
            <label>New password <span style="color:var(--text3);font-weight:400">(min 8 characters)</span></label>
            <input type="password" class="settings-input" id="sa-pwNew" autocomplete="new-password">
          </div>
          <div class="settings-save-row">
            <button class="btn btn-ghost" onclick="changePassword()">Update password</button>
          </div>
        </div>
      </div>

      <!-- Appearance page -->
      <div class="settings-page" id="spage-appearance">
        <div class="settings-page-title">Appearance</div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Row density</div>
          </div>
          <div class="seg-ctrl" id="seg-density">
            <button onclick="setSetting('density','comfortable')" data-val="comfortable">Cosy</button>
            <button onclick="setSetting('density','compact')" data-val="compact">Compact</button>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Show hidden files</div>
            <div class="settings-row-desc">Files and folders starting with .</div>
          </div>
          <label class="settings-toggle">
            <input type="checkbox" id="tog-showHidden" onchange="setSetting('showHidden',this.checked)">
            <span class="slider"></span>
          </label>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Editor font size</div>
          </div>
          <div class="seg-ctrl" id="seg-fontSize">
            <button onclick="setSetting('fontSize',11)" data-val="11">11</button>
            <button onclick="setSetting('fontSize',12)" data-val="12">12</button>
            <button onclick="setSetting('fontSize',13)" data-val="13">13</button>
            <button onclick="setSetting('fontSize',14)" data-val="14">14</button>
          </div>
        </div>
        <div style="margin-top:24px;padding-top:20px;border-top:1px solid var(--border)">
          <div style="font-size:12px;color:var(--text3)">Porter v0.4.2</div>
          <button class="btn" style="margin-top:8px;padding:5px 10px;font-size:12px;background:none;border-color:var(--border2);color:var(--text2)" onclick="closeSettings();openChangelog()">Release notes →</button>
        </div>
      </div>

    </div><!-- /settings-content -->
  </div><!-- /settings-dialog -->
</div>

<!-- hidden avatar file input -->
<input type="file" id="avatarInput" style="display:none" accept="image/jpeg,image/png,image/webp,image/gif">

<script>
// ── state ──
let curRoot = '', curPath = '', curWritable = true;
let activeDropdown = null;
let sortCol = 'name', sortDir = 'asc';
let searchActive = false;
let searchTimer = null;
let selectedItems = new Set();
let previewOpen = false, previewName = null, previewDirty = false, previewContent = '';
let curEntries = [];
let diskInfo = null, diskInfoRoot = '';
let lastSearchQ = '';

// ── upload queue ──
let uploadQueue = [];
let isUploading = false;
let uploadBatchTotal = 0;
let uploadFailed = [];

function enqueueFiles(files) {
  const arr = [...files];
  if (!arr.length) return;
  if (!isUploading && !uploadQueue.length) {
    uploadBatchTotal = 0;
    uploadFailed = [];
  }
  uploadBatchTotal += arr.length;
  uploadQueue.push(...arr);
  if (!isUploading) processQueue();
}

async function processQueue() {
  if (!uploadQueue.length) {
    isUploading = false;
    const total = uploadBatchTotal;
    uploadBatchTotal = 0;
    if (uploadFailed.length) {
      toast(`${uploadFailed.length} of ${total} failed: ${uploadFailed.slice(0,2).join(', ')}${uploadFailed.length>2?' …':''}`, 'err');
    } else if (total > 1) {
      toast(`Uploaded ${total} files`, 'ok');
    }
    uploadFailed = [];
    navigate(curRoot, curPath);
    return;
  }
  isUploading = true;
  const file = uploadQueue[0];
  const idx = uploadBatchTotal - uploadQueue.length + 1;
  setUploadLabel(`Uploading ${idx} of ${uploadBatchTotal}: ${file.name}`);
  const ok = await uploadOne(file);
  if (!ok) uploadFailed.push(file.name);
  uploadQueue.shift();
  processQueue();
}

function setUploadLabel(text) {
  document.getElementById('uploadName').textContent = text;
}

// ── icons ──
const I = {
  folder: `<svg width="18" height="18" viewBox="0 0 24 24" fill="#f7931a" stroke="#f7931a" stroke-width="1" opacity=".9"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>`,
  file:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  code:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b8cff" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="10 13 8 15 10 17"/><polyline points="14 13 16 15 14 17"/></svg>`,
  image:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  pdf:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>`,
  data:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>`,
  archive:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c084fc" stroke-width="1.5"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`,
  dl:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  rename: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  trash:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>`,
  lock:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`,
  dots:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>`,
  empty:  `<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>`,
  copy:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`,
  move:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 9l-3 3 3 3"/><path d="M19 9l3 3-3 3"/><line x1="2" y1="12" x2="22" y2="12"/></svg>`,
  eye:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
};

function fileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (['py','js','ts','sh','bash','json','yaml','yml','toml','html','css','md','txt','log','env','ini','conf','xml'].includes(ext)) return I.code;
  if (['png','jpg','jpeg','gif','svg','webp','ico'].includes(ext)) return I.image;
  if (ext === 'pdf') return I.pdf;
  if (['csv','tsv','xlsx','xls'].includes(ext)) return I.data;
  if (['zip','gz','tar','bz2','xz','rar','7z'].includes(ext)) return I.archive;
  return I.file;
}

const TEXT_EXTS = new Set(['py','js','ts','sh','bash','json','yaml','yml','toml','md','txt','log','env','csv','html','css','xml','ini','conf','rs','go','java','c','cpp','h','rb','php']);
const IMG_EXTS  = new Set(['png','jpg','jpeg','gif','svg','webp']);

// ── settings (localStorage) ──
const SETTINGS_KEY = 'porter_settings';
const SETTINGS_DEFAULTS = { density: 'comfortable', showHidden: false, fontSize: 12 };
let settings = { ...SETTINGS_DEFAULTS };

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      settings = { ...SETTINGS_DEFAULTS, ...p };
      delete settings.tabWidth; delete settings.wordWrap;  // migrate old keys
    }
  } catch(e) { settings = { ...SETTINGS_DEFAULTS }; }
  applySettings(); syncSettingsUI();
}
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
function setSetting(key, val) {
  settings[key] = val; saveSettings(); applySettings(); syncSettingsUI();
  if (key === 'showHidden' || key === 'density') renderListing(curEntries);
}
function applySettings() {
  document.body.classList.toggle('density-compact', settings.density === 'compact');
  document.documentElement.style.setProperty('--editor-font-size', settings.fontSize + 'px');
}
function syncSettingsUI() {
  document.querySelectorAll('#seg-density button').forEach(b =>
    b.classList.toggle('active', b.dataset.val === settings.density));
  document.querySelectorAll('#seg-fontSize button').forEach(b =>
    b.classList.toggle('active', +b.dataset.val === settings.fontSize));
  const th = document.getElementById('tog-showHidden');
  if (th) th.checked = settings.showHidden;
}

// ── settings overlay ──
function openSettings(tab = 'account') {
  switchSettingsTab(tab); syncSettingsUI();
  document.getElementById('settingsOverlay').classList.add('open');
}
function closeSettings() {
  document.getElementById('settingsOverlay').classList.remove('open');
  document.getElementById('sa-pwCurrent').value = '';
  document.getElementById('sa-pwNew').value = '';
}
function switchSettingsTab(tab) {
  document.querySelectorAll('.settings-nav-item').forEach(el =>
    el.classList.toggle('active', el.id === 'snav-' + tab));
  document.querySelectorAll('.settings-page').forEach(el =>
    el.classList.toggle('active', el.id === 'spage-' + tab));
}

// ── user profile ──
let currentUser = null;

function avatarInitials(name) {
  if (!name) return '?';
  const w = name.trim().split(/\s+/);
  return (w.length >= 2 ? w[0][0] + w[w.length-1][0] : name.substring(0,2)).toUpperCase();
}

function renderAvatar(el, user) {
  if (!el) return;
  if (user.has_avatar) {
    el.innerHTML = `<img src="/api/avatar?_=${Date.now()}" alt="avatar">`;
  } else {
    el.textContent = avatarInitials(user.display_name || user.username);
  }
}

async function loadMe() {
  const data = await api('/api/me');
  if (!data) return;
  currentUser = data;
  document.getElementById('ucName').textContent = data.display_name || data.username;
  renderAvatar(document.getElementById('ucAvatar'), data);
  renderAvatar(document.getElementById('saAvatar'), data);
  document.getElementById('sa-name').value = data.display_name || '';
  document.getElementById('sa-email').value = data.email || '';
}

async function saveAccount() {
  const display_name = document.getElementById('sa-name').value.trim();
  const email = document.getElementById('sa-email').value.trim();
  if (!display_name) { toast('Display name cannot be empty', 'err'); return; }
  const res = await api('/api/profile/update', { display_name, email });
  if (res && res.ok) {
    currentUser.display_name = res.display_name;
    currentUser.email = res.email;
    document.getElementById('ucName').textContent = res.display_name;
    renderAvatar(document.getElementById('ucAvatar'), currentUser);
    renderAvatar(document.getElementById('saAvatar'), currentUser);
    toast('Profile saved', 'ok');
  } else {
    toast((res && res.error) || 'Save failed', 'err');
  }
}

async function changePassword() {
  const current = document.getElementById('sa-pwCurrent').value;
  const newPw   = document.getElementById('sa-pwNew').value;
  if (!current || !newPw) { toast('Fill in both password fields', 'err'); return; }
  if (newPw.length < 8) { toast('New password must be at least 8 characters', 'err'); return; }
  const res = await api('/api/password/change', { current, new: newPw });
  if (res && res.ok) {
    document.getElementById('sa-pwCurrent').value = '';
    document.getElementById('sa-pwNew').value = '';
    toast('Password changed', 'ok');
  } else {
    toast((res && res.error) || 'Password change failed', 'err');
  }
}

function triggerAvatarUpload() { document.getElementById('avatarInput').click(); }

document.getElementById('avatarInput').onchange = async function() {
  const file = this.files[0]; if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  try {
    const res = await fetch('/api/avatar/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.ok) {
      currentUser.has_avatar = true;
      renderAvatar(document.getElementById('ucAvatar'), currentUser);
      renderAvatar(document.getElementById('saAvatar'), currentUser);
      toast('Photo updated', 'ok');
    } else { toast(data.error || 'Upload failed', 'err'); }
  } catch(e) { toast('Upload error', 'err'); }
  this.value = '';
};

async function doLogout() {
  await fetch('/logout', { method: 'POST' });
  window.location.href = '/login';
}

// ── init ──
async function init() {
  loadSettings();
  await loadMe();
  const res = await api('/api/roots');
  const roots = (res && res.roots) || [];
  const locs = document.getElementById('locations');
  locs.innerHTML = '';
  roots.forEach(r => {
    const el = document.createElement('div');
    el.className = 'loc'; el.dataset.root = r;
    el.innerHTML = `<span class="file-icon">${I.folder}</span><span class="loc-name">${r}</span>`;
    el.onclick = () => navigate(r, '');
    locs.appendChild(el);
  });
  if (roots.length) navigate(roots[0], '');
}

// ── navigation ──
async function navigate(root, path) {
  curRoot = root; curPath = path;
  document.title = path ? `Porter · ${root}/${path}` : `Porter · ${root}`;
  // close preview if open
  if (previewOpen) {
    previewOpen = false; previewDirty = false; previewName = null;
    document.getElementById('previewPanel').classList.remove('open');
    document.getElementById('mainEl').classList.remove('preview-open');
  }
  // reset selection
  selectedItems.clear();
  updateSelectionUI();
  // reset search UI
  searchActive = false;
  document.getElementById('searchInput').value = '';
  document.getElementById('clearSearch').classList.remove('visible');
  document.getElementById('searchCountBar').style.display = 'none';

  document.querySelectorAll('.loc').forEach(l =>
    l.classList.toggle('active', l.dataset.root === root));
  renderBreadcrumb(root, path);
  showSkeleton();

  const data = await api(`/api/list?root=${enc(root)}&path=${enc(path)}`);
  if (!data) return;
  curEntries = data.entries;
  curWritable = data.writable;
  document.getElementById('banner').style.display = curWritable ? 'none' : 'flex';
  document.getElementById('btnUpload').disabled = !curWritable;
  document.getElementById('btnMkdir').disabled = !curWritable;
  renderListing(curEntries);
  updateFooter(curEntries.length);
  loadDiskInfo(root);
}

async function loadDiskInfo(root) {
  if (diskInfoRoot === root && diskInfo) { updateFooter(curEntries.length); return; }
  const data = await api(`/api/diskinfo?root=${enc(root)}`);
  if (!data || data.error) return;
  diskInfo = data;
  diskInfoRoot = root;
  updateFooter(curEntries.length);
}

// ── breadcrumb ──
function renderBreadcrumb(root, path) {
  const el = document.getElementById('breadcrumb');
  const parts = path ? path.split('/').filter(Boolean) : [];
  let h = `<button class="crumb" onclick="navigate('${esc(root)}','')">~/${esc(root)}</button>`;
  let so_far = '';
  parts.forEach((p, i) => {
    so_far += (so_far ? '/' : '') + p;
    const snap = so_far;
    h += `<span class="crumb-sep">›</span>`;
    if (i < parts.length - 1)
      h += `<button class="crumb" onclick="navigate('${esc(root)}','${esc(snap)}')">${escHtml(p)}</button>`;
    else
      h += `<span class="crumb current">${escHtml(p)}</span>`;
  });
  el.innerHTML = h;
}

// ── skeleton ──
function showSkeleton() {
  const widths = [180, 140, 220, 160, 200, 170];
  document.getElementById('listing').innerHTML = widths.map(w => `
    <div class="file-row">
      <div class="cb-col"></div>
      <div class="file-name">
        <div class="skel" style="width:18px;height:18px;border-radius:4px;flex-shrink:0"></div>
        <div class="skel" style="width:${w}px;height:13px"></div>
      </div>
      <div class="skel" style="width:44px;height:12px"></div>
      <div class="skel" style="width:66px;height:12px"></div>
      <div></div>
    </div>`).join('');
}

// ── listing render ──
function sortedEntries(entries) {
  return [...entries].sort((a, b) => {
    if (sortCol === 'name') {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      const av = a.name.toLowerCase(), bv = b.name.toLowerCase();
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    if (sortCol === 'size') {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return sortDir === 'asc' ? a.size_bytes - b.size_bytes : b.size_bytes - a.size_bytes;
    }
    if (sortCol === 'modified') {
      return sortDir === 'asc' ? a.mtime - b.mtime : b.mtime - a.mtime;
    }
    return 0;
  });
}

function updateSortHeaders() {
  ['name','size','modified'].forEach(col => {
    const btn = document.getElementById('sh-' + col);
    const ind = document.getElementById('si-' + col);
    if (!btn || !ind) return;
    if (col === sortCol) {
      btn.classList.add('active');
      ind.textContent = sortDir === 'asc' ? '▲' : '▼';
    } else {
      btn.classList.remove('active');
      ind.textContent = '';
    }
  });
}

function setSort(col) {
  if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else { sortCol = col; sortDir = 'asc'; }
  updateSortHeaders();
  renderListing(curEntries);
}

function renderListing(entries) {
  updateSortHeaders();
  const el = document.getElementById('listing');
  const visible = settings.showHidden ? entries : entries.filter(e => !e.name.startsWith('.'));
  const sorted = sortedEntries(visible);
  if (!sorted.length) {
    el.innerHTML = `<div class="empty-state">${I.empty}<p>This folder is empty</p><p style="font-size:12px;color:var(--text3);margin-top:-4px">Upload files or create a new folder to get started</p></div>`;
    return;
  }
  el.innerHTML = sorted.map(e => rowHTML(e)).join('');
}

function rowHTML(e) {
  const icon = e.type === 'dir' ? I.folder : fileIcon(e.name);
  const lockBadge = e.writable ? '' : `<span class="lock">${I.lock}</span>`;
  const rowClick = e.type === 'dir'
    ? `onclick="navigate('${esc(curRoot)}','${esc(curPath ? curPath+'/'+e.name : e.name)}')" `
    : `onclick="openPreview('${esc(e.name)}')" `;
  const checked = selectedItems.has(e.name) ? 'checked' : '';
  return `<div class="file-row${e.type==='dir'?' is-dir':''}" ${rowClick}>
    <div class="cb-col" onclick="event.stopPropagation()">
      <input type="checkbox" class="row-cb" ${checked}
             onchange="toggleSelect('${esc(e.name)}',this.checked)">
    </div>
    <div class="file-name">
      <span class="file-icon">${icon}</span>
      <span class="file-label" title="${escHtml(e.name)}">${escHtml(e.name)}</span>
      ${lockBadge}
    </div>
    <div class="file-size">${e.size}</div>
    <div class="file-date">${e.modified}</div>
    <button class="row-menu-btn" onclick="event.stopPropagation();openMenu(event,'${esc(e.name)}','${e.type}',${e.writable})">${I.dots}</button>
  </div>`;
}

function updateFooter(count) {
  const el = document.getElementById('sfooter');
  let html = '';
  if (diskInfo) {
    const pct = Math.min(100, Math.round(diskInfo.used / diskInfo.total * 100));
    html += `<div class="disk-bar-wrap">
      <div class="disk-bar-labels">
        <span>${diskInfo.free_h} free</span>
        <span>${diskInfo.total_h}</span>
      </div>
      <div class="disk-bar-track">
        <div class="disk-bar-fill" style="width:${pct}%"></div>
      </div>
    </div>`;
  }
  html += `<div>${count === 0 ? 'Empty folder' : count + ' item' + (count !== 1 ? 's' : '')}</div>`;
  el.innerHTML = html;
}

// ── sort ──
// setSort defined above

// ── search ──
function onSearchInput(val) {
  clearTimeout(searchTimer);
  if (!val.trim()) { clearSearch(); return; }
  searchTimer = setTimeout(() => runSearch(val.trim()), 300);
}

function openSearch() {
  document.getElementById('searchInput').focus();
}

async function runSearch(q) {
  searchActive = true;
  lastSearchQ = q;
  document.getElementById('clearSearch').classList.add('visible');
  showSkeleton();
  const data = await api(`/api/search?root=${enc(curRoot)}&q=${enc(q)}`);
  if (!data) return;
  renderSearchResults(data.results || [], q);
}

function highlightMatch(name, q) {
  if (!q) return escHtml(name);
  const i = name.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return escHtml(name);
  return escHtml(name.slice(0, i))
    + `<strong style="color:var(--text)">${escHtml(name.slice(i, i + q.length))}</strong>`
    + escHtml(name.slice(i + q.length));
}

function renderSearchResults(results, q) {
  const el = document.getElementById('listing');
  const countBar = document.getElementById('searchCountBar');
  const countText = document.getElementById('searchCountText');

  if (!results.length) {
    countBar.style.display = 'none';
    el.innerHTML = `<div class="empty-state">${I.empty}<p>No results for "${escHtml(q || lastSearchQ)}"</p></div>`;
    return;
  }

  // show count
  countText.textContent = `${results.length} result${results.length !== 1 ? 's' : ''}`;
  countBar.style.display = 'block';

  // group by parent dir
  const groups = {};
  results.forEach(e => {
    const parts = e.path.split('/');
    parts.pop();
    const dir = parts.join('/') || '/';
    if (!groups[dir]) groups[dir] = [];
    groups[dir].push({ ...e, navPath: e.type === 'dir' ? e.path : parts.join('/') });
  });

  let html = '';
  Object.entries(groups).forEach(([dir, items]) => {
    const dirDisplay = dir === '/' ? '/' : dir;
    const navPath = dir === '/' ? '' : dir;
    html += `<div class="search-group-hdr" onclick="clearSearch();navigate('${esc(curRoot)}','${esc(navPath)}')">
      ${I.folder} ${escHtml(dirDisplay)}
    </div>`;
    items.forEach(e => {
      const icon = e.type === 'dir' ? I.folder : fileIcon(e.name);
      html += `<div class="file-row" onclick="clearSearch();navigate('${esc(curRoot)}','${esc(e.navPath)}')">
        <div class="cb-col"></div>
        <div class="file-name" style="flex-direction:column;align-items:flex-start;gap:2px;padding:9px 0">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="file-icon">${icon}</span>
            <span class="file-label">${highlightMatch(e.name, q || lastSearchQ)}</span>
          </div>
        </div>
        <div class="file-size">${e.size}</div>
        <div class="file-date">${e.modified}</div>
        <div></div>
      </div>`;
    });
  });
  el.innerHTML = html;
}

function clearSearch() {
  searchActive = false;
  lastSearchQ = '';
  clearTimeout(searchTimer);
  document.getElementById('searchInput').value = '';
  document.getElementById('clearSearch').classList.remove('visible');
  document.getElementById('searchCountBar').style.display = 'none';
  renderListing(curEntries);
}

// ── dropdown menu ──
function openMenu(evt, name, type, writable) {
  evt.stopPropagation();
  closeDropdown();
  const dd = document.getElementById('dropdown');
  const items = [];
  if (type === 'file') {
    items.push({ label:'Preview', icon: I.eye, action: () => openPreview(name) });
    items.push({ label:'Download', icon: I.dl, action: () => download(name) });
  }
  if (writable) {
    if (items.length) items.push({ sep: true });
    items.push({ label:'Rename', icon: I.rename, action: () => openRename(name, type) });
    items.push({ label:'Duplicate', icon: I.copy, action: () => duplicate(name) });
    items.push({ label:'Move to…', icon: I.move, action: () => openMove(name) });
    items.push({ sep: true });
    items.push({ label:'Delete', icon: I.trash, action: () => openDelete(name, type), cls:'danger' });
  }
  if (!items.length) {
    items.push({ label:'Read-only', icon: I.lock, action: ()=>{} });
  }
  dd.innerHTML = items.map((it, i) =>
    it.sep
      ? `<div class="dropdown-sep"></div>`
      : `<div class="dropdown-item ${it.cls||''}" data-i="${i}">
           ${it.icon}<span>${it.label}</span>
         </div>`
  ).join('');
  dd.querySelectorAll('[data-i]').forEach(el => {
    const i = +el.dataset.i;
    el.onclick = () => { items[i].action(); closeDropdown(); };
  });

  const btn = evt.currentTarget;
  const rect = btn.getBoundingClientRect();
  dd.style.display = 'block';
  let left = rect.right - dd.offsetWidth;
  let top  = rect.bottom + 4;
  if (left < 8) left = 8;
  if (top + dd.offsetHeight > window.innerHeight - 8) top = rect.top - dd.offsetHeight - 4;
  dd.style.left = left + 'px';
  dd.style.top  = top + 'px';
  activeDropdown = dd;
}

function closeDropdown() {
  const dd = document.getElementById('dropdown');
  dd.style.display = 'none';
  dd.innerHTML = '';
  activeDropdown = null;
}
document.addEventListener('click', () => closeDropdown());

// ── download ──
function download(name) {
  const fp = curPath ? curPath + '/' + name : name;
  const a = document.createElement('a');
  a.href = `/download?root=${enc(curRoot)}&path=${enc(fp)}`;
  a.download = name;
  a.click();
}

// ── upload ──
function triggerUpload() {
  document.getElementById('fileInput').click();
}
document.getElementById('fileInput').onchange = function() {
  enqueueFiles(this.files);
  this.value = '';
};

async function uploadOne(file) {
  const bar = document.getElementById('uploadBar');
  const pg  = document.getElementById('uploadProgress');
  bar.classList.add('visible');
  pg.removeAttribute('value');

  return new Promise(resolve => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('root', curRoot);
    fd.append('path', curPath);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/upload');
    xhr.upload.onprogress = ev => {
      if (ev.lengthComputable) { pg.max = ev.total; pg.value = ev.loaded; }
    };
    xhr.onload = () => {
      bar.classList.remove('visible');
      if (xhr.status === 200) {
        if (uploadQueue.length <= 1) toast(`Uploaded ${file.name}`, 'ok');
        resolve(true);
      } else {
        toast(`Failed: ${file.name}`, 'err');
        resolve(false);
      }
    };
    xhr.onerror = () => { bar.classList.remove('visible'); resolve(false); };
    xhr.send(fd);
  });
}

// drag and drop
const fa = document.getElementById('fileArea');
fa.addEventListener('dragover', e => {
  if (curWritable) { e.preventDefault(); fa.classList.add('drag-over'); }
});
fa.addEventListener('dragleave', () => fa.classList.remove('drag-over'));
fa.addEventListener('drop', e => {
  e.preventDefault(); fa.classList.remove('drag-over');
  if (!curWritable) { toast('This folder is read-only', 'err'); return; }
  enqueueFiles(e.dataTransfer.files);
});

// ── preview panel ──
async function openPreview(name) {
  if (previewOpen && previewDirty) {
    if (!confirm('Discard unsaved changes?')) return;
  }
  previewDirty = false;
  previewContent = '';
  previewOpen = true;
  previewName = name;

  document.getElementById('previewFilename').textContent = name;
  document.getElementById('previewBody').innerHTML = '<div style="padding:40px 16px;color:var(--text3);font-size:13px;text-align:center">Loading…</div>';
  document.getElementById('btnEdit').style.display = 'none';
  document.getElementById('btnSave').style.display = 'none';
  document.getElementById('previewPanel').classList.add('open');
  document.getElementById('mainEl').classList.add('preview-open');

  const fp = curPath ? curPath + '/' + name : name;
  const previewUrl = `/download?root=${enc(curRoot)}&path=${enc(fp)}&inline=1`;
  const ext = (name.split('.').pop() || '').toLowerCase();

  if (IMG_EXTS.has(ext)) {
    document.getElementById('previewBody').innerHTML =
      `<div class="preview-img"><img src="${previewUrl}" alt="${escHtml(name)}"></div>`;
  } else if (ext === 'pdf') {
    document.getElementById('previewBody').innerHTML =
      `<iframe src="${previewUrl}" style="width:100%;height:calc(100vh - 57px);border:none"></iframe>`;
  } else if (TEXT_EXTS.has(ext)) {
    try {
      const r = await fetch(previewUrl);
      const text = await r.text();
      previewContent = text;
      document.getElementById('previewBody').innerHTML =
        `<pre class="preview-pre" id="previewCode">${escHtml(text)}</pre>`;
      if (curWritable) {
        document.getElementById('btnEdit').style.display = '';
      }
    } catch(e) {
      document.getElementById('previewBody').innerHTML =
        '<div class="preview-na"><p>Failed to load file</p></div>';
    }
  } else {
    const dlUrl = `/download?root=${enc(curRoot)}&path=${enc(fp)}`;
    document.getElementById('previewBody').innerHTML =
      `<div class="preview-na">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity=".3"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <p>Preview not available</p>
        <a href="${dlUrl}" download="${escHtml(name)}" class="btn btn-ghost" style="margin-top:8px;font-size:12px">Download</a>
      </div>`;
  }
}

function closePreview() {
  if (previewDirty) {
    if (!confirm('Discard unsaved changes?')) return;
  }
  previewOpen = false; previewDirty = false; previewName = null; previewContent = '';
  document.getElementById('previewPanel').classList.remove('open');
  document.getElementById('mainEl').classList.remove('preview-open');
  document.getElementById('btnEdit').style.display = 'none';
  document.getElementById('btnSave').style.display = 'none';
}

// ── inline editor ──
function openEditor() {
  const body = document.getElementById('previewBody');
  const ta = document.createElement('textarea');
  ta.className = 'editor-ta';
  ta.id = 'editorTa';
  ta.value = previewContent;
  ta.addEventListener('input', () => { previewDirty = true; });
  ta.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveFile();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = ta.selectionStart, end = ta.selectionEnd;
      ta.value = ta.value.substring(0,s) + '  ' + ta.value.substring(end);
      ta.selectionStart = ta.selectionEnd = s + 2;
    }
  });
  body.innerHTML = '';
  body.appendChild(ta);
  ta.focus();
  document.getElementById('btnEdit').style.display = 'none';
  document.getElementById('btnSave').style.display = '';
}

async function saveFile() {
  const ta = document.getElementById('editorTa');
  if (!ta || !previewName) return;
  const content = ta.value;
  const fp = curPath ? curPath + '/' + previewName : previewName;
  const res = await api('/api/write', { root: curRoot, path: fp, content });
  if (res && res.ok) {
    previewContent = content;
    previewDirty = false;
    toast(`Saved ${previewName}`, 'ok');
    navigate(curRoot, curPath);
  } else {
    toast((res && res.error) || 'Save failed', 'err');
  }
}

// ── selection ──
function toggleSelect(name, checked) {
  if (checked) selectedItems.add(name);
  else selectedItems.delete(name);
  updateSelectionUI();
}

function toggleSelectAll(checked) {
  if (checked) curEntries.forEach(e => selectedItems.add(e.name));
  else selectedItems.clear();
  document.querySelectorAll('.row-cb:not(#selectAll)').forEach(cb => cb.checked = checked);
  updateSelectionUI();
}

function clearSelection() {
  selectedItems.clear();
  document.querySelectorAll('.row-cb').forEach(cb => cb.checked = false);
  updateSelectionUI();
}

function updateSelectionUI() {
  const count = selectedItems.size;
  const toolbar = document.getElementById('selectionToolbar');
  const fa = document.getElementById('fileArea');
  if (count > 0) {
    fa.classList.add('has-selection');
    toolbar.style.display = 'flex';
    document.getElementById('selCount').textContent = `${count} selected`;
  } else {
    fa.classList.remove('has-selection');
    toolbar.style.display = 'none';
  }
}

// ── ZIP download ──
async function downloadZip() {
  if (!selectedItems.size) return;
  const items = [...selectedItems].map(name => ({
    path: curPath ? curPath + '/' + name : name
  }));
  toast('Preparing ZIP…', '');
  try {
    const res = await fetch('/api/zip', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ root: curRoot, items })
    });
    if (!res.ok) { toast('ZIP failed', 'err'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'porter-export.zip'; a.click();
    URL.revokeObjectURL(url);
    toast('ZIP downloaded', 'ok');
  } catch(e) {
    toast('ZIP error', 'err');
  }
}

// ── bulk delete ──
function bulkDelete() {
  const names = [...selectedItems];
  if (!names.length) return;
  showModal({
    title: `Delete ${names.length} item${names.length>1?'s':''}`,
    desc: `Delete <strong>${names.length} selected item${names.length>1?'s':''}</strong>? This cannot be undone.`,
    actions: [
      { label: 'Cancel', action: closeModal },
      { label: `Delete ${names.length}`, cls: 'btn-danger', action: async () => {
        closeModal();
        let failed = 0;
        for (const name of names) {
          const r = await api('/api/delete', { root: curRoot, path: curPath, name });
          if (!r || !r.ok) failed++;
        }
        clearSelection();
        if (failed) toast(`${failed} deletion(s) failed`, 'err');
        else toast(`Deleted ${names.length} items`, 'ok');
        navigate(curRoot, curPath);
      }},
    ],
  });
}

// ── move ──
function openMove(name) {
  openFolderPicker(async (destPath) => {
    const res = await api('/api/move', {
      root: curRoot, path: curPath, name, destPath
    });
    if (res && res.ok) {
      toast(`Moved ${name}`, 'ok');
      navigate(curRoot, curPath);
    } else {
      toast((res && res.error) || 'Move failed', 'err');
    }
  });
}

// ── duplicate ──
async function duplicate(name) {
  const res = await api('/api/copy', {
    root: curRoot, path: curPath, name, destPath: curPath
  });
  if (res && res.ok) {
    toast(`Duplicated as ${res.newName}`, 'ok');
    navigate(curRoot, curPath);
  } else {
    toast((res && res.error) || 'Duplicate failed', 'err');
  }
}

// ── folder picker ──
let fpCallback = null;
let fpCurrentPath = '';

function openFolderPicker(onConfirm) {
  fpCallback = onConfirm;
  fpCurrentPath = curPath;
  document.getElementById('fpOverlay').style.display = 'flex';
  loadFpDir(fpCurrentPath);
}

async function loadFpDir(path) {
  fpCurrentPath = path;
  const data = await api(`/api/list?root=${enc(curRoot)}&path=${enc(path)}`);
  if (!data) return;
  const dirs = data.entries.filter(e => e.type === 'dir');
  const el = document.getElementById('fpList');
  const displayPath = '/' + curRoot + (path ? '/' + path : '');
  let html = `<div class="fp-current">${escHtml(displayPath)}</div>`;
  if (path) {
    const parts = path.split('/'); parts.pop();
    const parent = parts.join('/');
    html += `<div class="fp-item fp-up" onclick="loadFpDir('${esc(parent)}')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      Up a level
    </div>`;
  }
  if (!dirs.length) {
    html += `<div style="padding:12px 16px;color:var(--text3);font-size:12px">No subdirectories here</div>`;
  }
  dirs.forEach(d => {
    const childPath = path ? path + '/' + d.name : d.name;
    html += `<div class="fp-item" onclick="loadFpDir('${esc(childPath)}')">
      ${I.folder} <span>${escHtml(d.name)}</span>
    </div>`;
  });
  el.innerHTML = html;
}

function confirmFolderPicker() {
  if (fpCallback) fpCallback(fpCurrentPath);
  closeFolderPicker();
}

function closeFolderPicker() {
  document.getElementById('fpOverlay').style.display = 'none';
  fpCallback = null;
}

// ── keyboard shortcuts ──
function toggleShortcuts() {
  const el = document.getElementById('shortcutsOverlay');
  el.style.display = el.style.display === 'none' ? 'flex' : 'none';
}

// ── changelog ──
const CHANGELOG = [
  { ver:'v0.4.2', date:'2026-02-23', notes:[
    'File row separators made nearly invisible — removes spreadsheet grid feel',
    'Folder names now bold and bright — primary navigation items stand out',
    'File name brightens on row hover — hover state feels more responsive',
    'Search input now shows a magnifying glass icon (turns orange on focus)',
    'Disk usage bar height increased from 3px to 4px for better readability',
    'Empty folder state includes a helpful subtitle prompt',
  ]},
  { ver:'v0.4.1', date:'2026-02-23', notes:[
    'Fixed Cancel button not closing modals (closeModal event guard bug)',
    'Fixed long filenames overflowing delete confirmation dialog',
    'Text contrast lifted — secondary and muted text now clearly readable',
    'Favicon updated to geometric P mark — matches sidebar logo',
    'Browser tab title now reflects current location (Porter · root/path)',
    'Delete key shortcut triggers bulk delete when items are selected',
    'Browser theme-color set to match Porter dark background',
    'Search empty state shows the searched query, not a generic message',
  ]},
  { ver:'v0.4', date:'2026-02-23', notes:[
    'Warm dark theme — improved contrast throughout',
    'New geometric logo mark',
    '"File Manager" subtitle restored in sidebar',
    'Version badge in lower-left footer with release notes link',
    'Search always visible — no toggle required',
    'Search results show count, grouped by folder, with match highlighting',
    'Folder path in search results navigates on click',
    'Release notes changelog accessible from footer',
  ]},
  { ver:'v0.3', date:'2026-02-10', notes:[
    'Cache-Control: no-store on all responses — prevents stale listings',
    'Version display added to sidebar',
  ]},
  { ver:'v0.2', date:'2026-01-20', notes:[
    'Copy file/folder operation',
    'ZIP bulk download of selected items',
    'Full-root search via /api/search',
    'Folder picker modal for Move operation',
    'Selection toolbar with bulk actions (delete, move, zip)',
  ]},
  { ver:'v0.1', date:'2026-01-01', notes:[
    'Multi-root file browser (documents, uploads, websites)',
    'Directory listing with sort by name, size, modified date',
    'File upload with progress bar and batch queue',
    'New folder, rename, delete (files and folders)',
    'File preview: text, images, PDF',
    'Inline text editor with save',
    'Bulk select, delete, move',
    'Drag-and-drop upload to current folder',
    'Keyboard shortcuts (/, r, n, u, Backspace, Esc, ?)',
    'Dark theme with CSS custom properties',
  ]},
];

function openChangelog() {
  document.getElementById('changelogBody').innerHTML = CHANGELOG.map(v =>
    `<div class="cl-ver-row">
       <span class="cl-vtag">${v.ver}</span>
       <span class="cl-vdate">${v.date}</span>
     </div>
     <ul class="cl-notes">${v.notes.map(n=>`<li>${escHtml(n)}</li>`).join('')}</ul>`
  ).join('');
  document.getElementById('changelogOverlay').style.display = 'flex';
}
function closeChangelog() {
  document.getElementById('changelogOverlay').style.display = 'none';
}

document.addEventListener('keydown', function(e) {
  const tag = (document.activeElement.tagName || '').toLowerCase();
  const inInput = tag === 'input' || tag === 'textarea' || document.activeElement.isContentEditable;

  if (e.key === 'Escape') {
    if (document.getElementById('settingsOverlay').classList.contains('open')) { closeSettings(); return; }
    if (document.getElementById('changelogOverlay').style.display !== 'none') { closeChangelog(); return; }
    if (document.getElementById('shortcutsOverlay').style.display !== 'none') { toggleShortcuts(); return; }
    if (document.getElementById('fpOverlay').style.display !== 'none') { closeFolderPicker(); return; }
    if (document.getElementById('overlay').style.display !== 'none') { closeModal(); return; }
    if (searchActive) { clearSearch(); return; }
    if (previewOpen) { closePreview(); return; }
    closeDropdown();
    return;
  }

  if (inInput) return;

  switch(e.key) {
    case '?': toggleShortcuts(); break;
    case '/': e.preventDefault(); openSearch(); break;
    case 'n': if (curWritable) openMkdir(); break;
    case 'u': if (curWritable) triggerUpload(); break;
    case 'r': navigate(curRoot, curPath); break;
    case 'Delete': if (selectedItems.size) bulkDelete(); break;
    case 'Backspace':
      e.preventDefault();
      if (curPath) {
        const parts = curPath.split('/'); parts.pop();
        navigate(curRoot, parts.join('/'));
      }
      break;
  }
});

// ── modals ──
function showModal({ title, desc, input, inputVal='', actions }) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalDesc').innerHTML = desc || '';
  const inp = document.getElementById('modalInput');
  if (input) {
    inp.style.display = 'block';
    inp.value = inputVal;
    setTimeout(() => { inp.focus(); inp.select(); }, 60);
  } else {
    inp.style.display = 'none';
  }
  const act = document.getElementById('modalActions');
  act.innerHTML = '';
  actions.forEach(a => {
    const b = document.createElement('button');
    b.className = `btn ${a.cls || 'btn-ghost'}`;
    b.textContent = a.label;
    b.onclick = a.action;
    act.appendChild(b);
  });
  document.getElementById('overlay').style.display = 'flex';
}

function closeModal() {
  document.getElementById('overlay').style.display = 'none';
}

document.getElementById('modalInput').addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Enter') {
    const btn = document.querySelector('#modalActions .btn-primary');
    if (btn) btn.click();
  }
});

// ── rename ──
function openRename(name, type) {
  showModal({
    title: `Rename ${type}`,
    desc: `Enter a new name for <strong>${escHtml(name)}</strong>`,
    input: true, inputVal: name,
    actions: [
      { label: 'Cancel', action: closeModal },
      { label: 'Rename', cls: 'btn-primary', action: async () => {
        const newName = document.getElementById('modalInput').value.trim();
        if (!newName || newName === name) { closeModal(); return; }
        closeModal();
        const res = await api('/api/rename', { root: curRoot, path: curPath, name, newName });
        if (res && res.ok) { toast(`Renamed to ${newName}`, 'ok'); navigate(curRoot, curPath); }
        else toast((res && res.error) || 'Rename failed', 'err');
      }},
    ],
  });
}

// ── delete ──
function openDelete(name, type) {
  showModal({
    title: `Delete ${type}`,
    desc: `Delete <strong>${escHtml(name)}</strong>?${type==='dir'?'<br><br>All contents will be deleted.' : ''}`,
    actions: [
      { label: 'Cancel', action: closeModal },
      { label: 'Delete', cls: 'btn-danger', action: async () => {
        closeModal();
        const res = await api('/api/delete', { root: curRoot, path: curPath, name });
        if (res && res.ok) { toast(`Deleted ${name}`, 'ok'); navigate(curRoot, curPath); }
        else toast((res && res.error) || 'Delete failed', 'err');
      }},
    ],
  });
}

// ── mkdir ──
function openMkdir() {
  showModal({
    title: 'New folder',
    input: true, inputVal: 'untitled folder',
    actions: [
      { label: 'Cancel', action: closeModal },
      { label: 'Create', cls: 'btn-primary', action: async () => {
        const name = document.getElementById('modalInput').value.trim();
        if (!name) { closeModal(); return; }
        closeModal();
        const res = await api('/api/mkdir', { root: curRoot, path: curPath, name });
        if (res && res.ok) { toast(`Created ${name}`, 'ok'); navigate(curRoot, curPath); }
        else toast((res && res.error) || 'Failed', 'err');
      }},
    ],
  });
}

// ── toasts ──
function toast(msg, type='') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  const c = document.getElementById('toasts');
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2800);
  setTimeout(() => el.remove(), 3100);
}

// ── api helpers ──
async function api(url, body) {
  try {
    const opts = body
      ? { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }
      : { cache: 'no-store' };
    const res = await fetch(url, opts);
    if (res.redirected || res.status === 401) { window.location.href = '/login'; return null; }
    return await res.json();
  } catch(e) { toast('Network error', 'err'); return null; }
}

function enc(s) { return encodeURIComponent(s); }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function esc(s) { return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

init();
</script>
</body>
</html>
"""

# ── HTTP handler ──────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        print(f"  [{self.address_string()}] {fmt % args}")

    def reply_json(self, data, code=200):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def reply_html(self, body_str, code=200):
        body = body_str.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length))

    def get_session_token(self) -> str:
        cookie_hdr = self.headers.get("Cookie", "")
        for part in cookie_hdr.split(";"):
            part = part.strip()
            if part.startswith("porter_session="):
                return part[len("porter_session="):]
        return ""

    def auth_check(self, redirect=True) -> bool:
        token = self.get_session_token()
        if token and get_session(token):
            return True
        if redirect:
            self.send_response(302)
            self.send_header("Location", "/login")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
        else:
            self.reply_json({"error": "unauthorized"}, 401)
        return False

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)

        if parsed.path == "/login":
            self.reply_html(LOGIN_PAGE)

        elif parsed.path == "/":
            if not self.auth_check(redirect=True):
                return
            self.reply_html(PAGE)

        elif parsed.path == "/api/me":
            if not self.auth_check(redirect=False):
                return
            cfg = _config
            has_avatar = any(
                (AVATAR_DIR / f"porter_avatar.{ext}").exists()
                for ext in AVATAR_EXTS
            )
            self.reply_json({
                "username":     cfg.get("username", ""),
                "display_name": cfg.get("display_name", ""),
                "email":        cfg.get("email", ""),
                "has_avatar":   has_avatar,
            })

        elif parsed.path == "/api/avatar":
            if not self.auth_check(redirect=False):
                return
            for ext in AVATAR_EXTS:
                candidate = AVATAR_DIR / f"porter_avatar.{ext}"
                if candidate.exists():
                    ctype, _ = mimetypes.guess_type(candidate.name)
                    ctype = ctype or "image/jpeg"
                    data = candidate.read_bytes()
                    self.send_response(200)
                    self.send_header("Content-Type", ctype)
                    self.send_header("Content-Length", str(len(data)))
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    self.wfile.write(data)
                    return
            self.reply_html("<h1>Not found</h1>", 404)

        elif parsed.path == "/api/roots":
            if not self.auth_check(redirect=False):
                return
            self.reply_json({"roots": list(SERVE_DIRS.keys())})

        elif parsed.path == "/api/list":
            if not self.auth_check(redirect=False): return
            root = qs.get("root", [""])[0]
            path = qs.get("path", [""])[0]
            data = list_dir(root, path)
            if data is None:
                self.reply_json({"error": "not found"}, 404)
            else:
                self.reply_json(data)

        elif parsed.path == "/api/diskinfo":
            if not self.auth_check(redirect=False): return
            root = qs.get("root", [""])[0]
            info = disk_info(root)
            if info is None:
                self.reply_json({"error": "not found"}, 404)
            else:
                self.reply_json(info)

        elif parsed.path == "/api/search":
            if not self.auth_check(redirect=False): return
            root = qs.get("root", [""])[0]
            q    = qs.get("q", [""])[0]
            if not q or not root:
                self.reply_json({"results": []})
            else:
                self.reply_json({"results": walk_search(root, q)})

        elif parsed.path == "/download":
            if not self.auth_check(redirect=False): return
            root   = qs.get("root", [""])[0]
            path   = qs.get("path", [""])[0]
            inline = qs.get("inline", [""])[0] == "1"
            target = safe_resolve(root, path)
            if target is None or not target.is_file():
                self.reply_html("<h1>Not found</h1>", 404); return
            ctype, _ = mimetypes.guess_type(target.name)
            ctype = ctype or "application/octet-stream"
            fname = re.sub(r'[^\w.\-]', '_', target.name)
            disposition = "inline" if inline else "attachment"
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(target.stat().st_size))
            self.send_header("Content-Disposition", f'{disposition}; filename="{fname}"')
            self.end_headers()
            with open(target, "rb") as f:
                while chunk := f.read(65536):
                    self.wfile.write(chunk)

        else:
            self.reply_html("<h1>Not found</h1>", 404)

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == "/login":
            data = self.read_json_body()
            username = data.get("username", "").strip()
            password = data.get("password", "")
            cfg = _config
            expected = _hash_password(password, cfg.get("salt", ""))
            if username == cfg.get("username") and expected == cfg.get("password_hash"):
                token = create_session(username)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                ttl = SESSION_TTL
                self.send_header(
                    "Set-Cookie",
                    f"porter_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age={ttl}"
                )
                self.send_header("Cache-Control", "no-store")
                body = json.dumps({"ok": True}).encode()
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                self.reply_json({"ok": False, "error": "Invalid username or password"}, 401)

        elif parsed.path == "/logout":
            token = self.get_session_token()
            if token:
                delete_session(token)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header(
                "Set-Cookie",
                "porter_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"
            )
            self.send_header("Cache-Control", "no-store")
            body = json.dumps({"ok": True}).encode()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        elif parsed.path == "/api/profile/update":
            if not self.auth_check(redirect=False): return
            data = self.read_json_body()
            display_name = data.get("display_name", "").strip()
            email = data.get("email", "").strip()
            if not display_name:
                self.reply_json({"ok": False, "error": "Display name cannot be empty"}, 400); return
            _config["display_name"] = display_name
            _config["email"] = email
            save_config(_config)
            self.reply_json({"ok": True, "display_name": display_name, "email": email})

        elif parsed.path == "/api/password/change":
            if not self.auth_check(redirect=False): return
            data = self.read_json_body()
            current_pw = data.get("current", "")
            new_pw     = data.get("new", "")
            cfg = _config
            if _hash_password(current_pw, cfg.get("salt", "")) != cfg.get("password_hash"):
                self.reply_json({"ok": False, "error": "Current password is incorrect"}, 401); return
            if len(new_pw) < 8:
                self.reply_json({"ok": False, "error": "New password must be at least 8 characters"}, 400); return
            new_salt = secrets.token_hex(16)
            _config["salt"] = new_salt
            _config["password_hash"] = _hash_password(new_pw, new_salt)
            save_config(_config)
            self.reply_json({"ok": True})

        elif parsed.path == "/api/avatar/upload":
            if not self.auth_check(redirect=False): return
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            _, fname, fdata = parse_multipart(self.headers, body)
            if not fname or fdata is None:
                self.reply_json({"ok": False, "error": "No file"}, 400); return
            ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
            if ext not in AVATAR_EXTS:
                self.reply_json({"ok": False, "error": "Unsupported file type"}, 400); return
            # Remove old avatar files
            for old_ext in AVATAR_EXTS:
                old = AVATAR_DIR / f"porter_avatar.{old_ext}"
                if old.exists():
                    old.unlink()
            dest = AVATAR_DIR / f"porter_avatar.{ext}"
            dest.write_bytes(fdata)
            self.reply_json({"ok": True})

        elif parsed.path == "/upload":
            if not self.auth_check(redirect=False): return
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            fields, fname, fdata = parse_multipart(self.headers, body)
            if not fname or fdata is None:
                self.reply_json({"ok": False, "error": "No file"}, 400); return
            root = fields.get("root", "documents")
            path = fields.get("path", "")
            target_dir = safe_resolve(root, path)
            if target_dir is None or not target_dir.is_dir():
                self.reply_json({"ok": False, "error": "Invalid path"}, 400); return
            if not is_writable(target_dir):
                self.reply_json({"ok": False, "error": "Read-only"}, 403); return
            dest = target_dir / safe_name(fname)
            try:
                dest.write_bytes(fdata)
                print(f"  Saved: {dest}  ({len(fdata)/1024:.1f} KB)")
                self.reply_json({"ok": True})
            except PermissionError:
                self.reply_json({"ok": False, "error": "Permission denied"}, 403)

        elif parsed.path == "/api/delete":
            if not self.auth_check(redirect=False): return
            data = self.read_json_body()
            rel = (data.get("path","") + "/" + data.get("name","")).strip("/")
            target = safe_resolve(data.get("root",""), rel)
            if target is None or not target.exists():
                self.reply_json({"ok": False, "error": "Not found"}, 404); return
            if not is_writable(target):
                self.reply_json({"ok": False, "error": "Read-only"}); return
            try:
                if target.is_dir():
                    shutil.rmtree(target)
                else:
                    target.unlink()
                self.reply_json({"ok": True})
            except Exception as e:
                self.reply_json({"ok": False, "error": str(e)})

        elif parsed.path == "/api/rename":
            if not self.auth_check(redirect=False): return
            data = self.read_json_body()
            rel = (data.get("path","") + "/" + data.get("name","")).strip("/")
            target = safe_resolve(data.get("root",""), rel)
            if target is None or not target.exists():
                self.reply_json({"ok": False, "error": "Not found"}, 404); return
            if not is_writable(target):
                self.reply_json({"ok": False, "error": "Read-only"}); return
            new_name = safe_name(data.get("newName",""))
            if not new_name:
                self.reply_json({"ok": False, "error": "Invalid name"}); return
            dest = target.parent / new_name
            if dest.exists():
                self.reply_json({"ok": False, "error": "Name already exists"}); return
            try:
                target.rename(dest)
                self.reply_json({"ok": True})
            except Exception as e:
                self.reply_json({"ok": False, "error": str(e)})

        elif parsed.path == "/api/mkdir":
            if not self.auth_check(redirect=False): return
            data = self.read_json_body()
            parent = safe_resolve(data.get("root",""), data.get("path",""))
            if parent is None or not parent.is_dir():
                self.reply_json({"ok": False, "error": "Not found"}, 404); return
            if not is_writable(parent):
                self.reply_json({"ok": False, "error": "Read-only"}); return
            name = safe_name(data.get("name",""))
            if not name:
                self.reply_json({"ok": False, "error": "Invalid name"}); return
            dest = parent / name
            if dest.exists():
                self.reply_json({"ok": False, "error": "Already exists"}); return
            try:
                dest.mkdir()
                self.reply_json({"ok": True})
            except Exception as e:
                self.reply_json({"ok": False, "error": str(e)})

        elif parsed.path == "/api/move":
            if not self.auth_check(redirect=False): return
            data = self.read_json_body()
            root      = data.get("root", "")
            src_rel   = (data.get("path","") + "/" + data.get("name","")).strip("/")
            dest_path = data.get("destPath", "")
            src = safe_resolve(root, src_rel)
            if src is None or not src.exists():
                self.reply_json({"ok": False, "error": "Not found"}, 404); return
            if not is_writable(src):
                self.reply_json({"ok": False, "error": "Read-only"}); return
            dest_dir = safe_resolve(root, dest_path)
            if dest_dir is None or not dest_dir.is_dir():
                self.reply_json({"ok": False, "error": "Invalid destination"}); return
            if not is_writable(dest_dir):
                self.reply_json({"ok": False, "error": "Destination is read-only"}); return
            dest = dest_dir / src.name
            if dest.exists():
                self.reply_json({"ok": False, "error": "Name already exists at destination"}); return
            try:
                shutil.move(str(src), str(dest))
                self.reply_json({"ok": True})
            except Exception as e:
                self.reply_json({"ok": False, "error": str(e)})

        elif parsed.path == "/api/copy":
            if not self.auth_check(redirect=False): return
            data = self.read_json_body()
            root      = data.get("root", "")
            src_rel   = (data.get("path","") + "/" + data.get("name","")).strip("/")
            dest_path = data.get("destPath", "")
            src = safe_resolve(root, src_rel)
            if src is None or not src.exists():
                self.reply_json({"ok": False, "error": "Not found"}, 404); return
            dest_dir = safe_resolve(root, dest_path)
            if dest_dir is None or not dest_dir.is_dir():
                self.reply_json({"ok": False, "error": "Invalid destination"}); return
            if not is_writable(dest_dir):
                self.reply_json({"ok": False, "error": "Destination is read-only"}); return
            # Generate unique "(copy)" name
            if src.is_dir():
                new_name = src.name + " (copy)"
            else:
                new_name = src.stem + " (copy)" + src.suffix
            dest = dest_dir / new_name
            n = 2
            while dest.exists():
                tag = f" (copy {n})"
                new_name = (src.name + tag) if src.is_dir() else (src.stem + tag + src.suffix)
                dest = dest_dir / new_name
                n += 1
            try:
                if src.is_dir():
                    shutil.copytree(str(src), str(dest))
                else:
                    shutil.copy2(str(src), str(dest))
                self.reply_json({"ok": True, "newName": new_name})
            except Exception as e:
                self.reply_json({"ok": False, "error": str(e)})

        elif parsed.path == "/api/write":
            if not self.auth_check(redirect=False): return
            data = self.read_json_body()
            target = safe_resolve(data.get("root",""), data.get("path",""))
            if target is None:
                self.reply_json({"ok": False, "error": "Invalid path"}, 400); return
            if not target.is_file():
                self.reply_json({"ok": False, "error": "Not a file"}, 400); return
            if not is_writable(target):
                self.reply_json({"ok": False, "error": "Read-only"}, 403); return
            try:
                target.write_text(data.get("content",""), encoding="utf-8")
                self.reply_json({"ok": True})
            except Exception as e:
                self.reply_json({"ok": False, "error": str(e)})

        elif parsed.path == "/api/zip":
            if not self.auth_check(redirect=False): return
            data = self.read_json_body()
            root  = data.get("root", "")
            items = data.get("items", [])
            buf = io.BytesIO()
            try:
                with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
                    for item in items:
                        rel_path = item.get("path","")
                        target = safe_resolve(root, rel_path)
                        if target is None:
                            continue
                        if target.is_file():
                            zf.write(str(target), target.name)
                        elif target.is_dir():
                            for fp in target.rglob("*"):
                                if fp.is_file():
                                    zf.write(str(fp), str(fp.relative_to(target.parent)))
            except Exception as e:
                self.reply_json({"ok": False, "error": str(e)}); return
            body = buf.getvalue()
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Content-Disposition", 'attachment; filename="porter-export.zip"')
            self.end_headers()
            self.wfile.write(body)

        else:
            self.reply_html("<h1>Not found</h1>", 404)

# ── main ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    _config.update(load_config())
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"\n  Porter v0.4.2 ready (localhost only)")
    print(f"  SSH tunnel:  ssh -L {PORT}:localhost:{PORT} lobster@{HOST}")
    print(f"  Then open:   http://localhost:{PORT}\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")
