#!/usr/bin/env python3
"""Porter v0.12.70 — self-hosted file manager"""

import email
import hashlib
import io
import json
import mimetypes
import os
import re
import secrets
import shutil
import socket
import subprocess
import time
import zipfile
import calendar
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

PORT = 8877
HOST = "76.13.190.52"
AGENT_INSTALL_URL = os.environ.get("PORTER_AGENT_INSTALL_URL", "").strip()


def _public_ip_hint() -> str:
    """Best-effort public IP for UI display.
    Priority: explicit env override, configured HOST bind (if public-looking), else empty.
    """
    env_ip = os.environ.get("PORTER_PUBLIC_IP", "").strip()
    if env_ip:
        return env_ip
    h = (HOST or "").strip()
    if h and h not in {"0.0.0.0", "127.0.0.1", "localhost", "::1"}:
        return h
    return ""

SERVE_DIRS: dict = {}   # populated at startup from nodes; do not hardcode here

# Default mounts for the initial local node (used only on very first run)
DEFAULT_MOUNTS = [
    {"id": "vps-home", "label": "Documents", "path": "/home/lobster/documents", "visible": True},
    {"id": "websites",  "label": "Websites",  "path": "/home/websites",           "visible": True},
]
DEFAULT_PREFERENCES: dict = {
    "onboarding_complete": False,
    "default_location":    "vps-home",
    "checkpoint_interval": 30,
    "lease_ttl":           300,
    "auto_resume":         True,
    "show_hidden":         False,
    "density":             "normal",
    "editor_font_size":    12,
    "policy_preset":       "balanced",
}
DEFAULT_AGENT_FLEET: dict = {
    "channel": "stable",
    "current_version": "0.1.0",
    "min_compatible": "0.1.0",
    "auto_update": True,
    "rollout": 100,
    "devices": {},  # agent_id -> {os, arch, version, status, last_seen}
}

CONFIG_PATH  = Path("/home/lobster/documents/porter/porter_config.json")
AVATAR_DIR   = Path("/home/lobster/documents/porter")
AVATAR_EXTS  = {"jpg", "jpeg", "png", "webp", "gif"}
SESSION_TTL  = 30 * 24 * 3600   # 30 days
_sessions: dict = {}             # token -> {username, expires}

RUNTIME_DIR       = Path("/home/lobster/documents/porter/runtime")
MEMORY_DIR        = Path("/home/lobster/documents/porter/memory")
USAGE_DIR         = RUNTIME_DIR / "usage"
AUDIT_LOG         = RUNTIME_DIR / "audit.jsonl"

POLICY_PRESETS: list = [
    {
        "id":          "cost-sensitive",
        "label":       "Cost-Sensitive",
        "description": "Maximise local model use; cloud only as last resort. Best for high-volume or budget-constrained workloads.",
        "settings":    {"prefer_local": True,  "max_cloud_tokens_per_task": 2000,  "local_fallback": True},
    },
    {
        "id":          "balanced",
        "label":       "Balanced",
        "description": "Default strategy — local models handle classification and summaries; cloud handles complex tasks. Good all-rounder.",
        "settings":    {"prefer_local": True,  "max_cloud_tokens_per_task": 8000,  "local_fallback": True},
    },
    {
        "id":          "speed-first",
        "label":       "Speed-First",
        "description": "Route to the fastest available model regardless of cost. Local if fast enough, cloud otherwise.",
        "settings":    {"prefer_local": False, "max_cloud_tokens_per_task": 16000, "local_fallback": True},
    },
    {
        "id":          "quality-first",
        "label":       "Quality-First",
        "description": "Always route to the highest-capability model. Local models skipped except for trivial tasks.",
        "settings":    {"prefer_local": False, "max_cloud_tokens_per_task": 32000, "local_fallback": False},
    },
    {
        "id":          "local-first",
        "label":       "Local-First",
        "description": "Never use cloud models. All tasks stay on-device. Tasks may fail if local model is insufficient.",
        "settings":    {"prefer_local": True,  "max_cloud_tokens_per_task": 0,     "local_fallback": False},
    },
]

DEFAULT_TOOL_POLICY = {
    "mode": "auto",
    "strategy": "balanced",
    "allowed_providers": [],
    "denied_providers": [],
    "budget_guardrails": {"max_tokens_per_task": 8000, "max_tokens_per_day": 100000},
}

MEMORY_NAMESPACES = {"projects", "people", "decisions", "compliance",
                     "transcripts", "artifacts", "indexes", "pointers"}

HEARTBEAT_TTL_MIN = 30    # seconds
HEARTBEAT_TTL_MAX = 3600  # seconds
HEARTBEAT_TTL_DEF = 300   # seconds

def _cron_expand(field, lo, hi):
    result = set()
    for part in field.split(','):
        part = part.strip()
        if '/' in part:
            base, step = part.split('/', 1); step = int(step)
            if base == '*' or base == '':
                r_start, r_end = lo, hi
            elif '-' in base:
                r_start, r_end = map(int, base.split('-', 1))
            else:
                r_start = r_end = int(base)
            result.update(range(r_start, r_end + 1, step))
        elif '-' in part:
            a, b = part.split('-', 1); result.update(range(int(a), int(b) + 1))
        elif part == '*': result.update(range(lo, hi + 1))
        else: result.add(int(part))
    return sorted(v for v in result if lo <= v <= hi)

def _cron_next(expr):
    try:
        fields = expr.strip().split()
        if len(fields) != 5: return None
        mf, hf, df, mof, wf = fields
        minutes = _cron_expand(mf, 0, 59); hours = _cron_expand(hf, 0, 23)
        months = _cron_expand(mof, 1, 12); doms = _cron_expand(df, 1, 31)
        dows = _cron_expand(wf, 0, 6)
        if not minutes or not hours or not months: return None
        
        dom_star = df == '*'; dow_star = wf == '*'
        now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        t = now + timedelta(minutes=1)
        limit = now + timedelta(days=366 * 4)
        
        while t < limit:
            if t.month not in months:
                # jump to start of next valid month
                nxt_mo = next((m for m in months if m > t.month), months[0])
                if nxt_mo <= t.month: t = t.replace(year=t.year+1)
                t = t.replace(month=nxt_mo, day=1, hour=0, minute=0); continue
            
            _, max_day = calendar.monthrange(t.year, t.month)
            py_dow = (t.weekday() + 1) % 7 # 0=Sun
            
            if dom_star and dow_star: day_ok = True
            elif dom_star: day_ok = py_dow in dows
            elif dow_star: day_ok = t.day in doms and t.day <= max_day
            else: day_ok = (t.day in doms and t.day <= max_day) or (py_dow in dows)
            
            if not day_ok:
                t += timedelta(days=1); t = t.replace(hour=0, minute=0); continue
            
            if t.hour not in hours:
                nxt_h = next((h for h in hours if h > t.hour), None)
                if nxt_h is not None: t = t.replace(hour=nxt_h, minute=minutes[0])
                else: t += timedelta(days=1); t = t.replace(hour=0, minute=0)
                continue
                
            if t.minute not in minutes:
                nxt_m = next((m for m in minutes if m > t.minute), None)
                if nxt_m is not None: t = t.replace(minute=nxt_m)
                else:
                    t += timedelta(hours=1); t = t.replace(minute=minutes[0])
                continue
            
            return t
        return None
    except Exception: return None

def _cron_next_display(expr):
    nxt = _cron_next(expr)
    if not nxt: return 'invalid'
    secs = int((nxt - datetime.now(timezone.utc)).total_seconds())
    if secs < 3600: return f"in {secs//60}m"
    if secs < 86400: h=secs//3600; m=(secs%3600)//60; return f"in {h}h {m}m"
    d=secs//86400; h=(secs%86400)//3600; return f"in {d}d {h}h"

ROLE_CAPS: dict[str, set] = {
    "viewer":   {"read"},
    "writer":   {"read", "write", "checkpoint"},
    "operator": {"read", "write", "checkpoint", "finalize"},
    "admin":    {"read", "write", "checkpoint", "finalize", "admin"},
}

# ── config helpers ────────────────────────────────────────────────────────

def _hash_password(password: str, salt: str) -> str:
    return hashlib.sha256((salt + password).encode()).hexdigest()

def load_config() -> dict:
    cfg: dict = {}
    if CONFIG_PATH.exists():
        try:
            cfg = json.loads(CONFIG_PATH.read_text())
        except Exception:
            cfg = {}

    changed = False

    # ── auth defaults (first run) ──
    if "username" not in cfg:
        salt = secrets.token_hex(16)
        cfg.update({
            "username":      "admin",
            "full_name":     "",
            "display_name":  "Admin",
            "email":         "",
            "salt":          salt,
            "password_hash": _hash_password("porter", salt),
        })
        print("  [porter] First run — default login: admin / porter")
        print("  [porter] Change your password immediately in Settings.")
        changed = True

    # profile key migration
    if "full_name" not in cfg:
        cfg["full_name"] = ""
        changed = True

    # ── nodes migration (v0.8: node-first model replaces flat locations) ──
    if "nodes" not in cfg:
        hn = socket.gethostname()
        # migrate existing flat locations as mounts under the local node
        legacy = cfg.get("locations", [])
        if not legacy:
            legacy = [dict(m) for m in DEFAULT_MOUNTS]
        local_node = {
            "id":           hn,
            "label":        hn,
            "type":         "local",
            "hostname":     hn,
            "tailscale_ip": None,
            "mounts": [
                {"id": loc["id"], "label": loc.get("label", loc["id"]),
                 "path": loc.get("path", ""), "visible": True}
                for loc in legacy
            ],
        }
        cfg["nodes"] = [local_node]
        changed = True
    # keep legacy "locations" key only for external backward-compat reads;
    # all internal code now uses nodes[*].mounts

    # ── agents ──
    if "agents" not in cfg:
        cfg["agents"] = []
        changed = True

    # ── preferences (merge so new keys are always present) ──
    prefs = cfg.setdefault("preferences", {})
    for k, v in DEFAULT_PREFERENCES.items():
        if k not in prefs:
            prefs[k] = v
            changed = True

    # ── fleet lifecycle config ──
    fleet = cfg.setdefault("agent_fleet", {})
    for k, v in DEFAULT_AGENT_FLEET.items():
        if k not in fleet:
            fleet[k] = ({} if k == "devices" else v)
            changed = True
    if not isinstance(fleet.get("devices"), dict):
        fleet["devices"] = {}
        changed = True

    if changed:
        save_config(cfg)
    return cfg

def save_config(cfg: dict) -> None:
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2))

def _load_serve_dirs(cfg: dict) -> None:
    """Repopulate global SERVE_DIRS from nodes[*].mounts (local nodes only)."""
    SERVE_DIRS.clear()
    for node in cfg.get("nodes", []):
        if node.get("type") == "local":
            for mount in node.get("mounts", []):
                mid = mount.get("id"); mp = mount.get("path", "")
                if mid and mp:
                    SERVE_DIRS[mid] = Path(mp)
    # legacy fallback: flat locations array (pre-0.8 configs not yet migrated)
    if not SERVE_DIRS:
        for loc in cfg.get("locations", []):
            if loc.get("type") == "local" and loc.get("id") and loc.get("path"):
                SERVE_DIRS[loc["id"]] = Path(loc["path"])

def _hash_agent_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()

def _agent_by_id(agent_id: str) -> "dict | None":
    for a in _config.get("agents", []):
        if a.get("id") == agent_id:
            return a
    return None

def _agent_by_key(raw_key: str) -> "dict | None":
    h = _hash_agent_key(raw_key)
    for a in _config.get("agents", []):
        if a.get("key_hash") == h:
            return a
    return None

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

# ── runtime / memory helpers ───────────────────────────────────────────────

def porter_uri_to_path(uri: str) -> "Path | None":
    """Resolve a porter:// URI to an absolute Path, blocking traversal."""
    if not isinstance(uri, str) or not uri.startswith("porter://"):
        return None
    rest = uri[len("porter://"):]          # e.g. "runtime/checkpoints/foo" or "projects/bar.md"
    parts = rest.split("/", 1)
    ns = parts[0]
    tail = parts[1] if len(parts) > 1 else ""
    if ns == "runtime":
        base = RUNTIME_DIR
    elif ns in MEMORY_NAMESPACES:
        base = MEMORY_DIR / ns
    else:
        return None
    try:
        if tail:
            resolved = (base / tail).resolve()
        else:
            resolved = base.resolve()
        resolved.relative_to(base.resolve())   # raises ValueError on traversal
        return resolved
    except Exception:
        return None

def ensure_runtime_dirs():
    for d in ("checkpoints", "leases", "drafts", "tmp", "usage"):
        (RUNTIME_DIR / d).mkdir(parents=True, exist_ok=True)

def _append_audit(action: str, target: str, actor: str,
                  actor_type: str = "session", details: dict | None = None) -> None:
    from datetime import datetime, timezone
    entry = {
        "ts":         time.time(),
        "ts_iso":     datetime.now(timezone.utc).isoformat(),
        "actor":      actor,
        "actor_type": actor_type,
        "action":     action,
        "target":     target,
        "details":    details or {},
    }
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    try:
        with open(AUDIT_LOG, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass  # audit failures must never break callers

def _safe_lease_running(lease_file, agent_id: str, now: float) -> bool:
    try:
        l = json.loads(Path(lease_file).read_text())
        return (l.get("owner") == agent_id and
                l.get("state") == "running" and
                l.get("expires_at", 0) > now)
    except Exception:
        return False

def ensure_memory_dirs():
    for ns in MEMORY_NAMESPACES:
        (MEMORY_DIR / ns).mkdir(parents=True, exist_ok=True)

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
  transition: width .2s ease, min-width .2s ease;
  overflow: hidden;
}
.logo {
  padding: 0 14px 24px 20px;
  display: flex; align-items: center; gap: 11px;
}
.logo-mark { flex-shrink: 0; }
.logo-text { flex: 1; min-width: 0; }
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
.loc-name { font-size: 13px; font-weight: 500; display:block; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.loc-sub  { font-size: 10px; color: var(--text3); font-weight: 400; line-height: 1; }
/* node grouping in sidebar */
.node-hdr {
  position:relative;
  display:flex; flex-direction:column; align-items:stretch; gap:6px;
  min-width:0; padding:8px 10px; margin:4px 8px 2px;
  border-radius:8px; background:rgba(255,255,255,.02);
  border:1px solid var(--border);
  font-size:11px; font-weight:600; letter-spacing:.2px;
  color:var(--text2); text-transform:none;
}
.node-hdr .node-head { display:flex; align-items:center; gap:7px; min-width:0; }
.node-hdr .node-title { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; }
.node-hdr .node-meta { font-size:10px; color:var(--text3); }
.node-hdr .btn { position:absolute; top:6px; right:8px; flex-shrink:0; height:22px; padding:0 7px !important; border-radius:6px; }
.node-hdr.online { border-color: rgba(34,197,94,.45); background: rgba(34,197,94,.06); }
.node-hdr.relay { border-color: rgba(251,191,36,.45); background: rgba(251,191,36,.05); }
.node-hdr.offline { border-color: rgba(148,163,184,.35); background: rgba(148,163,184,.05); opacity:.86; }
.mount-item { padding-left: 18px; margin:0 12px 2px; border-radius:7px; }
.mount-item .loc-name { flex:1; min-width:0; }
#locations-secondary .node-hdr { margin:4px 4px 2px; padding:8px; }
#locations-secondary .mount-item { margin:0 6px 2px; padding-left:14px; }

body.sidebar-collapsed .node-hdr { display: none; }
body.sidebar-collapsed .mount-item { padding-left: 0; justify-content: center; }
#locations { flex: 1; overflow-y: auto; }
.module-nav { display:flex; flex-direction:column; gap:2px; padding:8px 10px; overflow-y:auto; }
.mnav-item { display:flex; align-items:center; gap:9px; padding:7px 10px; border-radius:6px;
  font-size:13px; color:var(--text2); cursor:pointer; background:transparent; border:none;
  width:100%; text-align:left; font-family:inherit; }
.mnav-item:hover { background:var(--raised); color:var(--text); }
.mnav-item.active { background:rgba(247,147,26,.10); color:var(--accent); font-weight:500; }
.mnav-sep { height:1px; background:var(--border); margin:6px 10px; }
body.sidebar-collapsed .mnav-label { display:none; }
body.sidebar-collapsed .mnav-item { justify-content:center; padding:8px; }
body.sidebar-collapsed .module-nav { padding:8px 4px; }
#loc-subnav { display:none; }
.files-secondary-nav {
  display:none; position:absolute; top:54px; left:0; bottom:0; width:260px;
  background:var(--surface); border-right:1px solid var(--border); overflow-y:auto;
  padding:10px 0; z-index:5;
}
.files-secondary-title {
  padding:0 14px 10px; font-size:11px; font-weight:600; letter-spacing:.7px;
  color:var(--text3); text-transform:uppercase;
}
#locations-secondary { padding:0 10px; }
#locations-secondary .node-hdr { padding-left:2px; }
#locations-secondary .mount-item { margin-left:0; }
#file-results-footer { padding:10px 12px; color:var(--text3); font-size:11px; border-top:1px solid var(--border); margin-top:8px; background:var(--panel); }
body.files-active .files-secondary-nav { display:block; }
body.files-active #banner,
body.files-active #searchCountBar,
body.files-active #selectionToolbar,
body.files-active #fileArea { margin-left:260px; }
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

/* hamburger toggle — icon-only button inside logo row */
.hbg-btn {
  display: flex; align-items: center; justify-content: center;
  margin-left: auto; flex-shrink: 0;
  padding: 5px 6px; cursor: pointer; background: none;
  border: none; color: var(--text3); border-radius: 5px;
  transition: color .15s, background .12s;
}
.hbg-btn:hover { color: var(--text); background: var(--raised); }

/* ── sidebar collapsed ── */
body.sidebar-collapsed { --sidebar: 52px; }
body.sidebar-collapsed .logo-text,
body.sidebar-collapsed .logo-mark,
body.sidebar-collapsed .mnav-label,
body.sidebar-collapsed .loc-name,

body.sidebar-collapsed .sidebar-footer,
body.sidebar-collapsed .user-name,
body.sidebar-collapsed .user-sub { display: none; }
body.sidebar-collapsed .logo { padding: 0 0 18px; justify-content: center; }
body.sidebar-collapsed .hbg-btn { margin-left: 0; width: 100%; justify-content: center; }
body.sidebar-collapsed .loc { padding: 9px 0; justify-content: center; }

/* ── main ── */
.main {
  flex: 1; display: flex; flex-direction: column; min-width: 0;
  overflow: hidden; transition: padding-right .2s ease;
  position: relative;
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
.modal p { font-size: 13px; color: var(--text2); margin-bottom: 20px; line-height: 1.5; overflow-wrap: anywhere; word-break: normal; }
.modal input {
  width: 100%; background: var(--surface); border: 1px solid var(--border2);
  border-radius: var(--radius); padding: 9px 12px;
  font-size: 14px; color: var(--text); font-family: inherit;
  margin-bottom: 20px; outline: none; transition: .15s;
}
.modal input:focus { border-color: var(--accent); }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
.modal-actions .btn { max-width: 100%; white-space: normal; }

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

/* light theme */
:root.light {
  --bg:      #F4F4F4;
  --surface: #FFFFFF;
  --raised:  #EBEBEB;
  --border:  #DEDEDE;
  --border2: #CECECE;
  --text:    #1A1A1A;
  --text2:   #555555;
  --text3:   #999999;
}
:root.light ::-webkit-scrollbar-thumb { background: #ccc; }
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
.user-card { border-top: 1px solid var(--border); padding: 12px 16px;
  display: flex; align-items: center; gap: 10px; cursor: pointer; transition: background .12s; }
.user-card:hover { background: var(--raised); }
.user-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--accent); color: #000;
  font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; overflow: hidden; }
.user-avatar img { width: 100%; height: 100%; object-fit: cover; }
.user-name { font-size: 13px; font-weight: 600; color: var(--text); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
.user-sub { font-size: 11px; color: var(--text3); margin-top: 1px; }

/* settings panel — full main-area, no backdrop */
#settingsPanel { display: none; position: absolute; inset: 0; z-index: 50;
  background: var(--bg); flex-direction: row; }
#settingsPanel.open { display: flex; }
.settings-nav { width: 200px; min-width: 200px; background: var(--surface);
  border-right: 1px solid var(--border);
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
.module-panel { display:none; position:relative; flex:1; flex-direction:column;
  overflow-y:auto; padding:24px 28px; background:var(--bg); }
.module-panel.active { display:flex; }
.module-hdr { display:flex; align-items:center; gap:12px; margin-bottom:20px; flex-shrink:0; }
.module-title { font-size:20px; font-weight:700; color:var(--text); flex:1; }
.module-section { background:var(--surface); border:1px solid var(--border);
  border-radius:10px; padding:16px; margin-bottom:16px; flex-shrink:0; }
.module-section-title { font-size:11px; font-weight:600; text-transform:uppercase;
  letter-spacing:.6px; color:var(--text3); margin-bottom:12px; }
.sched-card { background:var(--bg2); border:1px solid var(--border); border-radius:8px;
  padding:14px 16px; margin-bottom:10px; display:flex; align-items:center; gap:12px; }
.tool-card { background:var(--bg2); border:1px solid var(--border); border-radius:8px;
  padding:14px 16px; margin-bottom:10px; display:flex; align-items:center; gap:12px; }
.ov-metric { background:var(--bg2); border:1px solid var(--border); border-radius:10px;
  padding:14px 16px; display:flex; flex-direction:column; gap:4px; }
.ov-metric-val { font-size:28px; font-weight:700; color:var(--text); }
.ov-metric-label { font-size:11px; color:var(--text3); text-transform:uppercase; letter-spacing:.5px; }
.audit-row { padding:10px 0; border-bottom:1px solid var(--border); font-size:12px;
  display:flex; gap:10px; align-items:baseline; }
.agent-clarity { display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; }
.badge-production { background:#dcfce7; color:#15803d; font-size:10px; padding:2px 7px;
  border-radius:20px; font-weight:600; }
.badge-test { background:#fef9c3; color:#854d0e; font-size:10px; padding:2px 7px;
  border-radius:20px; font-weight:600; }
.badge-ephemeral { background:#f3e8ff; color:#7c3aed; font-size:10px; padding:2px 7px;
  border-radius:20px; font-weight:600; }
.badge-system { background:#e0f2fe; color:#0369a1; font-size:10px; padding:2px 7px;
  border-radius:20px; font-weight:600; }
.settings-page-title { font-size: 18px; font-weight: 700; color: var(--text);
  margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
.sp-header { display:flex; align-items:center; margin-bottom:14px; padding-bottom:10px;
  border-bottom:1px solid var(--border); }
.sp-header h2 { font-size:18px; font-weight:700; color:var(--text); margin:0; }
/* Task operation cards */
.task-card { background:var(--bg2); border:1px solid var(--border);
             border-radius:8px; padding:16px; margin-bottom:10px; }
.task-hdr  { display:flex; align-items:center; gap:10px; margin-bottom:6px; }
.task-id   { font-family:monospace; font-size:13px; color:var(--text1); flex:1;
             overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.task-meta { display:flex; gap:14px; flex-wrap:wrap; font-size:12px;
             color:var(--text2); margin-bottom:10px; }
.task-actions { display:flex; gap:8px; flex-wrap:wrap; }
.task-badge { font-size:11px; padding:2px 8px; border-radius:20px; font-weight:600; white-space:nowrap; }
.task-badge.badge-running   { background:#dcfce7; color:#15803d; }
.task-badge.badge-paused    { background:#fef9c3; color:#854d0e; }
.task-badge.badge-stalled   { background:#fee2e2; color:#b91c1c; }
.task-badge.badge-complete  { background:#e0f2fe; color:#0369a1; }
.task-badge.badge-cancelled { background:var(--bg3); color:var(--text2); }
/* Policy preset cards */
.policy-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:16px; }
@media(max-width:600px) { .policy-grid { grid-template-columns:1fr; } }
.policy-card { border:2px solid var(--border); border-radius:10px; padding:16px;
               cursor:pointer; transition:border-color .15s; }
.policy-card:hover  { border-color:var(--accent); background:var(--bg2); }
.policy-card.active { border-color:var(--accent); background:var(--bg2); }
.policy-name { font-weight:600; font-size:14px; margin-bottom:4px; }
.policy-desc { font-size:12px; color:var(--text2); line-height:1.5; }
.policy-active-pill { display:inline-block; margin-top:8px; font-size:11px;
                      background:var(--accent); color:#fff; padding:2px 8px;
                      border-radius:20px; font-weight:600; }
.settings-field { margin-bottom: 12px; }
.settings-field label { display: block; font-size: 12px; font-weight: 500;
  color: var(--text2); margin-bottom: 5px; }
.settings-fields-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.settings-input { width: 100%; background: var(--raised); border: 1px solid var(--border2);
  border-radius: var(--radius); padding: 9px 12px; font-size: 14px; color: var(--text);
  font-family: inherit; outline: none; transition: .15s; }
.settings-input:focus { border-color: var(--accent); }
.avatar-section { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.avatar-large { width: 48px; height: 48px; border-radius: 50%; background: var(--accent); color: #000;
  font-size: 16px; font-weight: 700; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; overflow: hidden; cursor: pointer; transition: opacity .15s; }
.avatar-large:hover { opacity: .85; }
.avatar-large img { width: 100%; height: 100%; object-fit: cover; }
.avatar-hint { font-size: 11px; color: var(--text3); margin-top: 3px; }
.settings-save-row { display: flex; justify-content: flex-end; margin-top: 12px; }
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
.pw-section { margin-top: 16px; border-top: 1px solid var(--border); padding-top: 14px; }
.pw-helper { font-size: 11px; color: var(--text3); margin-bottom: 12px; line-height: 1.5; }

/* tailscale / network status */
.ts-status-card { background: var(--raised); border: 1px solid var(--border2);
  border-radius: 8px; padding: 16px; margin-bottom: 14px; }
.ts-status-row { display: flex; align-items: center; justify-content: space-between;
  padding: 7px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.ts-status-row:last-child { border-bottom: none; }
.ts-stat-label { color: var(--text3); font-size: 12px; }
.ts-stat-val { color: var(--text); font-weight: 500; }
.ts-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 5px; }
.ts-dot--on  { background: #4caf50; box-shadow: 0 0 6px rgba(76,175,80,.4); }
.ts-dot--off { background: var(--text3); }
.ts-peer-row { display: flex; align-items: center; gap: 10px;
  padding: 7px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
.ts-peer-row:last-child { border-bottom: none; }
.ts-peer-name { font-weight: 500; color: var(--text); flex: 1; }
.ts-peer-ip { font-family: monospace; color: var(--text3); font-size: 11px; }
.ts-peer-os { color: var(--text3); font-size: 11px; }

/* location type picker */
.loc-type-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
.loc-type-card {
  display: flex; flex-direction: column; gap: 5px; padding: 14px 16px;
  background: var(--raised); border: 1px solid var(--border2); border-radius: 8px;
  cursor: pointer; text-align: left; font-family: inherit; width: 100%;
  transition: border-color .15s, background .15s;
}
.loc-type-card:not(:disabled):hover { border-color: var(--accent); background: rgba(247,147,26,.05); }
.loc-type-card:disabled { opacity: .45; cursor: default; }
.loc-card-title { font-size: 13px; font-weight: 600; color: var(--text); }
.loc-card-desc  { font-size: 11px; color: var(--text3); }
.loc-badge {
  display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px;
  border-radius: 4px; font-size: 10px; font-weight: 600; letter-spacing: .3px;
}
.loc-badge--local  { background: rgba(80,200,120,.12);  color: #5c9; }
.loc-badge--vps    { background: rgba(100,160,255,.12); color: #6af; }
.loc-badge--remote { background: rgba(100,140,255,.12); color: #89f; }
.loc-badge--rw { background: rgba(247,147,26,.10); color: var(--accent); }
.loc-badge--ro { background: rgba(150,150,150,.10); color: var(--text3); }
.loc-quickpicks { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.pw-section-title { font-size: 12px; font-weight: 600; color: var(--text3);
  text-transform: uppercase; letter-spacing: .6px; margin-bottom: 16px; }

/* scrollbar */
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 3px; }

/* ── onboarding wizard ── */
.wiz-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.85);
  backdrop-filter: blur(6px); z-index: 500; display: none; align-items: center;
  justify-content: center; }
.wiz-overlay.open { display: flex; }
.wiz-dialog { background: var(--surface); border: 1px solid var(--border);
  border-radius: 16px; width: 520px; padding: 40px 48px;
  box-shadow: 0 40px 100px rgba(0,0,0,.8); }
.wiz-step { display: none; }
.wiz-step.active { display: block; }
.wiz-step-badge { font-size: 11px; font-weight: 600; letter-spacing: .8px;
  color: var(--accent); text-transform: uppercase; margin-bottom: 12px; }
.wiz-title { font-size: 24px; font-weight: 700; color: var(--text); margin-bottom: 8px; }
.wiz-subtitle { font-size: 14px; color: var(--text2); margin-bottom: 28px; line-height: 1.5; }
.wiz-actions { display: flex; gap: 10px; margin-top: 28px; align-items: center; }
.wiz-actions .btn-skip { background: none; border: none; color: var(--text3);
  font-size: 13px; cursor: pointer; padding: 0; margin-left: auto; font-family: inherit; }
.wiz-actions .btn-skip:hover { color: var(--text2); }
.wiz-type-cards { display: flex; gap: 10px; margin-bottom: 20px; }
.wiz-type-card { flex: 1; padding: 12px 8px; border: 1px solid var(--border);
  border-radius: 10px; cursor: pointer; transition: .15s; background: var(--bg); text-align: center; }
.wiz-type-card:hover:not(.disabled) { border-color: var(--accent); }
.wiz-type-card.selected { border-color: var(--accent); background: rgba(247,147,26,.07); }
.wiz-type-card.disabled { opacity: .4; cursor: not-allowed; }
.wiz-card-icon { font-size: 20px; margin-bottom: 4px; }
.wiz-card-label { font-size: 12px; font-weight: 600; color: var(--text); }
.wiz-card-sub { font-size: 11px; color: var(--text3); margin-top: 2px; }
.wiz-checklist { list-style: none; padding: 0; margin: 0 0 8px; }
.wiz-checklist li { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0;
  border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text2); }
.wiz-checklist li:last-child { border-bottom: none; }
.wiz-check-icon { color: #4caf50; flex-shrink: 0; }
.wiz-check-skip { color: var(--text3); flex-shrink: 0; }
.wiz-progress { display: flex; gap: 6px; margin-bottom: 28px; }
.wiz-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--border); transition: .2s; }
.wiz-dot.done { background: var(--accent); }
.wiz-dot.active { background: var(--accent); box-shadow: 0 0 0 3px rgba(247,147,26,.25); }
.wiz-key-box { font-family: monospace; font-size: 12px; background: var(--bg);
  border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px;
  word-break: break-all; color: var(--text); margin-bottom: 8px; }
.wiz-key-note { font-size: 12px; color: var(--danger); margin-bottom: 16px; }
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
    <div class="logo-text">
      <span class="logo-name">porter</span>
      <span class="logo-sub">File Manager</span>
    </div>
    <button class="hbg-btn" id="hbgBtn" onclick="toggleSidebar()" title="Toggle sidebar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>
  </div>
  <nav class="module-nav">
    <button class="mnav-item active" id="mnav-overview" onclick="switchModule('overview')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
      <span class="mnav-label">Command Center</span>
    </button>
    <button class="mnav-item" id="mnav-locations" onclick="switchModule('locations')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
      <span class="mnav-label">Locations</span>
    </button>
    <button class="mnav-item" id="mnav-files" onclick="closeSettings(); switchModule('files')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
      <span class="mnav-label">Files</span>
    </button>
    <!-- locations moved to Files secondary navigation rail -->
    <button class="mnav-item" id="mnav-agents" onclick="switchModule('agents')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6" y2="6"/><line x1="6" y1="18" x2="6" y2="18"/></svg>
      <span class="mnav-label">Agents</span>
    </button>
    <button class="mnav-item" id="mnav-tasks" onclick="switchModule('tasks')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/><line x1="3" y1="8" x2="21" y2="8"/></svg>
      <span class="mnav-label">Tasks</span>
    </button>
    <button class="mnav-item" id="mnav-schedules" onclick="switchModule('schedules')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      <span class="mnav-label">Schedules</span>
    </button>
    <button class="mnav-item" id="mnav-policies" onclick="switchModule('policies')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="10" y2="18"/><circle cx="18" cy="14" r="4"/></svg>
      <span class="mnav-label">Policies</span>
    </button>
    <button class="mnav-item" id="mnav-tools" style="display:none" onclick="switchModule('tools')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
      <span class="mnav-label">Tools</span>
    </button>
    <button class="mnav-item" id="mnav-audit" style="display:none" onclick="switchModule('audit')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
      <span class="mnav-label">Activity</span>
    </button>
    <div class="mnav-sep"></div>
    <button class="mnav-item" id="mnav-settings" onclick="openSettings('profile')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
      <span class="mnav-label">Settings</span>
    </button>
  </nav>

  <div class="mnav-sep"></div>
  <div class="module-nav" style="padding-top:0">
    <button class="mnav-item" onclick="toggleTheme()" title="Toggle appearance">
      <svg id="sidebarThemeIcon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
      <span class="mnav-label">Appearance</span>
    </button>
    <!-- refresh removed: action caused confusing hangs when no active file location selected -->
    <!-- What's new entry removed from main nav by request; available under Settings footer -->
  </div>

  <div style="flex:1"></div>
  <div class="sidebar-footer">
    <div style="font-size:10px;color:var(--text3);margin-bottom:12px;letter-spacing:0.5px">PORTER v0.12.70</div>
  </div>
</aside>

<!-- main -->
<main class="main" id="mainEl">
  <div class="toolbar" id="mainToolbar">
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
      <button class="btn btn-icon" id="btnHidden" onclick="setSetting('showHidden',!settings.showHidden)" title="Show hidden files (. prefixed)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
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

  <aside class="files-secondary-nav" id="filesSecondaryNav">
    <div class="files-secondary-title">Locations</div>
    <div id="locations-secondary"></div>
    
  </aside>

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
    <div id="file-results-footer"></div>
  </div>

  <!-- module panels -->
  <div id="overview-module" class="module-panel">
    <div class="module-hdr">
      <span class="module-title">Command Center</span>
      <div style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;color:var(--text3)" id="ov-updated"></span><button class="btn btn-ghost" style="font-size:11px;padding:3px 8px" onclick="loadOverview(true)">Refresh</button></div>
    </div>
    <div id="ov-metrics" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:20px"></div>
  </div>

  <div id="tasks-module" class="module-panel">
    <div class="module-hdr">
      <span class="module-title">Tasks</span>
      <span style="font-size:12px;color:var(--text3);margin-left:auto;margin-right:8px">Act here: recover stalled, manage running, clear completed</span>
      <button class="btn btn-ghost" style="font-size:12px" onclick="clearCompletedTasks()">Clear completed</button>
    </div>
    <details class="task-legend" style="margin-bottom:14px;font-size:12px;color:var(--text2)">
      <summary style="cursor:pointer;font-weight:600;color:var(--text3);font-size:11px;text-transform:uppercase;letter-spacing:.5px;list-style:none">&#9658; Status reference</summary>
      <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="task-badge badge-running">running</span>
          <span>Heartbeat active &#8212; agent is processing normally</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="task-badge badge-paused">paused</span>
          <span>Manually paused by an operator &#8212; awaiting resume</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="task-badge badge-stalled">stalled</span>
          <span>Heartbeat expired &#8212; agent may have crashed or lost connection</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="task-badge badge-complete">complete</span>
          <span>Task finished successfully and finalized</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="task-badge badge-cancelled">cancelled</span>
          <span>Manually cancelled &#8212; no further work will be done</span>
        </div>
      </div>
    </details>
    <div id="tasks-guidance" style="margin-bottom:12px;background:var(--raised);border:1px solid var(--border);border-radius:8px;padding:10px 12px">
      <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:6px">How to use Tasks</div>
      <div style="font-size:12px;color:var(--text3);line-height:1.45">
        1) <strong>Needs action</strong>: resolve these first (Recover/Resume/Cancel).<br>
        2) <strong>In progress</strong>: monitor active work; pause only if needed.<br>
        3) <strong>Completed</strong>: clear finished items to keep the queue clean.
      </div>
    </div>
    <details id="tasks-decision-rubric" style="margin-bottom:12px;background:var(--raised);border:1px solid var(--border);border-radius:8px;padding:10px 12px">
      <summary style="cursor:pointer;font-size:12px;font-weight:600;color:var(--text)">Decision rules (cancel vs recover)</summary>
      <div style="font-size:12px;color:var(--text3);line-height:1.45;margin-top:8px">
        <div><strong>Recover</strong> when task just stalled (fresh heartbeat expiry) and work should continue.</div>
        <div><strong>Cancel</strong> when heartbeat is long stale, task exceeded TTL badly, or Recover already failed once.</div>
        <div><strong>Keep paused</strong> only if intentionally paused by operator.</div>
        <div><strong>Clear completed</strong> after verifying outputs, to keep queue actionable.</div>
      </div>
    </details>
    <div id="tasks-module-list"><div style="color:var(--text2);padding:20px 0">Loading&#8230;</div></div>
  </div>

  <div id="agents-module" class="module-panel">
    <div class="module-hdr">
      <span class="module-title">Agents</span>
      <button class="btn btn-primary" onclick="openCreateAgent()">+ Create agent</button>
    </div>
    <div style="font-size:13px;color:var(--text3);margin-bottom:12px">API clients that connect to Porter. Each agent gets a unique key.</div>
    <div id="agents-fleet-panel" style="margin-bottom:14px;background:var(--raised);border:1px solid var(--border);border-radius:8px;padding:10px 12px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">
        <div style="font-size:12px;font-weight:600;color:var(--text)">Agent Fleet Lifecycle</div>
        <button class="btn btn-ghost" style="font-size:11px;padding:3px 8px" onclick="loadAgentFleet()">Refresh</button>
      </div>
      <div id="agents-fleet-summary" style="font-size:12px;color:var(--text3);margin-bottom:8px">Loading lifecycle policy…</div>
      <div style="display:grid;grid-template-columns:120px 1fr 1fr 90px auto;gap:8px;align-items:end">
        <div><div style="font-size:10px;color:var(--text3);margin-bottom:4px">Channel</div><select id="fleet-channel" class="settings-input" style="height:30px"><option value="stable">stable</option><option value="beta">beta</option></select></div>
        <div><div style="font-size:10px;color:var(--text3);margin-bottom:4px">Current</div><input id="fleet-current" class="settings-input" style="height:30px" placeholder="0.1.0"></div>
        <div><div style="font-size:10px;color:var(--text3);margin-bottom:4px">Min compatible</div><input id="fleet-min" class="settings-input" style="height:30px" placeholder="0.1.0"></div>
        <div><div style="font-size:10px;color:var(--text3);margin-bottom:4px">Rollout %</div><input id="fleet-rollout" type="number" min="0" max="100" class="settings-input" style="height:30px" placeholder="100"></div>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);height:30px"><input id="fleet-auto" type="checkbox">Auto-update</label>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <button class="btn btn-primary" style="font-size:11px;padding:3px 8px" onclick="saveAgentFleetPolicy()">Save policy</button>
        <button class="btn btn-ghost" style="font-size:11px;padding:3px 8px" onclick="showBootstrapCmd('macos')">Bootstrap macOS</button>
        <button class="btn btn-ghost" style="font-size:11px;padding:3px 8px" onclick="showBootstrapCmd('linux')">Bootstrap Linux</button>
        <button class="btn btn-ghost" style="font-size:11px;padding:3px 8px" onclick="showBootstrapCmd('windows')">Bootstrap Windows</button>
      </div>
    </div>
    <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center">
      <label style="font-size:12px;color:var(--text2);display:flex;align-items:center;gap:6px;cursor:pointer">
        <input type="checkbox" id="agent-show-all" onchange="window._showAllAgentTypes=this.checked;renderAgents(window._lastAgents||[])">
        Show all types
      </label>
    </div>
    <div id="agents-module-list"></div>
    <div id="agents-module-create-form" style="display:none;margin-top:20px;padding:16px;background:var(--raised);border-radius:8px;border:1px solid var(--border)">
      <div class="settings-page-title" style="font-size:14px;margin-bottom:14px">New agent</div>
      <div class="settings-field">
        <label>Name</label>
        <input type="text" class="settings-input" id="af2-name" placeholder="Claude Code">
      </div>
      <div class="settings-field">
        <label>Type</label>
        <select class="settings-input" id="af2-type" style="cursor:pointer">
          <option value="claude-code">Claude Code</option>
          <option value="openclaw">OpenClaw</option>
          <option value="generic">Generic API client</option>
        </select>
      </div>
      <div class="settings-field">
        <label>Role</label>
        <select class="settings-input" id="af2-role" style="cursor:pointer">
          <option value="viewer">Viewer &#8212; read only</option>
          <option value="writer" selected>Writer &#8212; read + write + checkpoint</option>
          <option value="operator">Operator &#8212; writer + finalize</option>
          <option value="admin">Admin &#8212; full access</option>
        </select>
      </div>
      <div class="settings-fields-row">
        <div class="settings-field">
          <label>Runtime location</label>
          <select class="settings-input" id="af2-runtime" style="cursor:pointer">
            <option value="local">Local</option>
            <option value="remote">Remote</option>
            <option value="edge">Edge</option>
          </select>
        </div>
        <div class="settings-field">
          <label>Model source</label>
          <select class="settings-input" id="af2-model-source" style="cursor:pointer">
            <option value="cloud">Cloud API</option>
            <option value="local">Local model</option>
          </select>
        </div>
      </div>
      <div class="settings-field">
        <label>Model ID <span style="color:var(--text3);font-weight:400">(optional)</span></label>
        <input type="text" class="settings-input" id="af2-model-id" placeholder="claude-sonnet-4-6">
      </div>
      <div class="settings-field">
        <label>Agent type</label>
        <select class="settings-input" id="af2-agent-type" style="cursor:pointer">
          <option value="production">Production</option>
          <option value="test">Test</option>
          <option value="ephemeral">Ephemeral</option>
          <option value="system">System</option>
        </select>
      </div>
      <div class="settings-save-row" style="gap:8px">
        <button class="btn btn-primary" onclick="createAgent2()">Create &amp; copy key</button>
        <button class="btn btn-ghost" onclick="cancelAgentForm2()">Cancel</button>
      </div>
    </div>
    <div id="agents-module-key-box" style="display:none;margin-top:20px;padding:14px;background:rgba(247,147,26,.08);border:1px solid rgba(247,147,26,.3);border-radius:8px">
      <div style="font-size:12px;color:var(--accent);font-weight:600;margin-bottom:8px">&#9888; Copy this key now &#8212; it won't be shown again</div>
      <div style="display:flex;gap:8px;align-items:center">
        <code style="flex:1;font-size:12px;word-break:break-all;color:var(--text)" id="agents-module-key-val"></code>
        <button class="btn btn-ghost" style="flex-shrink:0;font-size:12px" onclick="copyAgentKey2()">Copy</button>
      </div>
    </div>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border)">
      <div class="settings-page-title" style="font-size:15px;margin-bottom:10px">Agent Usage</div>
      <div id="agents-module-usage"><div style="color:var(--text3);font-size:13px">Loading&#8230;</div></div>
    </div>
  </div>

  <div id="locations-module" class="module-panel">
    <div class="module-hdr">
      <span class="module-title">Locations</span>
    </div>
    <div class="module-section">
      <div class="module-section-title">Connectivity (Tailscale)</div>
      <div style="font-size:13px;color:var(--text3);margin-bottom:12px">Transport controls are disabled on this server to prevent lockouts. Status is still visible below.</div>
      <div id="ts-control-status" style="margin-bottom:10px;font-size:12px;color:var(--text3)">Connect/Disconnect is disabled by policy.</div>
      <div id="ts-panel-locations"><div style="color:var(--text3);font-size:13px">Loading connectivity&#8230;</div></div>
      <div id="ts-last-updated-locations" style="margin-top:8px;font-size:11px;color:var(--text3)"></div>
    </div>
    <div id="loc-list"></div>
    <div id="lm-mount-form" style="display:none;margin-top:14px;padding:14px;background:var(--raised);border-radius:8px;border:1px solid var(--border)">
      <div class="settings-field"><label>Path on server</label>
        <input class="settings-input" id="mf-path" placeholder="/home/user/project">
      </div>
      <div class="settings-field"><label>Label</label>
        <input class="settings-input" id="mf-label" placeholder="My Project">
      </div>
      <input type="hidden" id="mf-node-id">
      <div class="settings-save-row" style="gap:8px">
        <button class="btn btn-ghost" onclick="cancelMountForm()">Cancel</button>
        <button class="btn btn-primary" onclick="saveMountForm()">Add Path</button>
      </div>
    </div>
    <div id="lm-loc-form" style="display:none;margin-top:14px;padding:14px;background:var(--raised);border-radius:8px;border:1px solid var(--border)">
      <div class="settings-field"><label>Location name</label>
        <input class="settings-input" id="lf2-name" placeholder="My VPS">
      </div>
      <div class="settings-field"><label>Type</label>
        <select class="settings-input" id="lf2-type" style="cursor:pointer">
          <option value="local">Local machine</option>
          <option value="vps">VPS</option>
          <option value="tailscale">Tailscale</option>
        </select>
      </div>
      <div class="settings-save-row" style="gap:8px">
        <button class="btn btn-ghost" onclick="cancelLocationForm2()">Cancel</button>
        <button class="btn btn-primary" onclick="saveLocationForm2()">Add Location</button>
      </div>
    </div>
  </div>

  <div id="schedules-module" class="module-panel">
    <div class="module-hdr">
      <span class="module-title">Schedules</span>
      <button class="btn btn-primary" onclick="openAddSchedule()">+ Add Schedule</button>
    </div>
    <div style="font-size:13px;color:var(--text3);margin-bottom:16px">
      Recurring jobs and automation. Agents query /api/schedules to self-schedule tasks.
    </div>
    <div id="schedules-list"></div>
    <div id="schedule-form" style="display:none;margin-top:16px;padding:14px;background:var(--raised);border-radius:8px;border:1px solid var(--border)">
      <div style="font-size:13px;font-weight:600;margin-bottom:12px" id="sf-title">New Schedule</div>
      <input type="hidden" id="sf-id">
      <div class="settings-field"><label>Name</label><input class="settings-input" id="sf-name"></div>
      <div class="settings-field"><label>Schedule (cron expression)</label>
        <input class="settings-input" id="sf-schedule" placeholder="0 2 * * *" oninput="previewCron()">
        <div id="sf-cron-preview" style="font-size:11px;color:var(--text3);margin-top:4px"></div>
      </div>
      <div class="settings-field"><label>Target (agent name or ID)</label><input class="settings-input" id="sf-target" placeholder="claude-code"></div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <input type="checkbox" id="sf-enabled" checked>
        <label for="sf-enabled" style="font-size:13px;color:var(--text2)">Enabled</label>
      </div>
      <div class="settings-save-row" style="gap:8px">
        <button class="btn btn-ghost" onclick="cancelScheduleForm()">Cancel</button>
        <button class="btn btn-primary" onclick="saveSchedule()">Save</button>
      </div>
    </div>
  </div>

  <div id="policies-module" class="module-panel">
    <div class="module-hdr"><span class="module-title">Policies</span></div>
    <div class="module-section">
      <div class="module-section-title">Routing Strategy Preset</div>
      <div class="policy-grid" id="policy-presets-grid-main"></div>
    </div>
    <div class="module-section">
      <div class="module-section-title">Orchestration Controls</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="settings-field"><label>Context compression</label>
          <select class="settings-input" id="oc-compress">
            <option value="off">Off</option><option value="light">Light</option><option value="aggressive">Aggressive</option>
          </select>
        </div>
        <div class="settings-field"><label>Fallback chain</label>
          <select class="settings-input" id="oc-fallback">
            <option value="local_first">Local &#8594; Cloud</option>
            <option value="cloud_first">Cloud &#8594; Local</option>
            <option value="local_only">Local only</option>
            <option value="cloud_only">Cloud only</option>
          </select>
        </div>
        <div class="settings-field"><label>Checkpoint interval (s)</label>
          <input type="number" class="settings-input" id="oc-ckpt" min="10" max="600">
        </div>
        <div class="settings-field"><label>Lease TTL (s)</label>
          <input type="number" class="settings-input" id="oc-ttl" min="30" max="3600">
        </div>
      </div>
      <button class="btn btn-primary" style="margin-top:8px;font-size:12px" onclick="saveOrchestrationPolicy()">Save Controls</button>
    </div>
  </div>

  <div id="tools-module" class="module-panel">
    <div class="module-hdr">
      <span class="module-title">Tools</span>
      <button class="btn btn-primary" onclick="openAddTool()">+ Register Tool</button>
    </div>
    <div class="module-section">
      <div class="module-section-title">Tool Selection Policy</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px">
        <label style="font-size:13px;color:var(--text2)">Mode:
          <select class="settings-input" id="tp-mode" style="width:130px">
            <option value="auto">Auto (policy-driven)</option>
            <option value="guided">Guided (visible rationale)</option>
            <option value="manual">Manual (confirm each)</option>
          </select>
        </label>
        <label style="font-size:13px;color:var(--text2)">Strategy:
          <select class="settings-input" id="tp-strategy" style="width:140px">
            <option value="balanced">Balanced</option>
            <option value="cost-first">Cost-First</option>
            <option value="quality-first">Quality-First</option>
            <option value="speed-first">Speed-First</option>
            <option value="local-first">Local-First</option>
          </select>
        </label>
      </div>
      <div style="display:flex;gap:12px;margin-bottom:8px">
        <div class="settings-field" style="flex:1"><label>Max tokens/task</label>
          <input type="number" class="settings-input" id="tp-max-task" min="0">
        </div>
        <div class="settings-field" style="flex:1"><label>Max tokens/day</label>
          <input type="number" class="settings-input" id="tp-max-day" min="0">
        </div>
      </div>
      <button class="btn btn-primary" style="font-size:12px" onclick="saveToolPolicy()">Save Policy</button>
    </div>
    <div class="module-section-title" style="margin-top:4px">Tool Registry</div>
    <div id="tools-list"></div>
    <div id="tool-form" style="display:none;margin-top:14px;padding:14px;background:var(--raised);border-radius:8px;border:1px solid var(--border)">
      <input type="hidden" id="tf-id">
      <div class="settings-fields-row">
        <div class="settings-field"><label>Name</label><input class="settings-input" id="tf-name"></div>
        <div class="settings-field"><label>Provider</label><input class="settings-input" id="tf-provider"></div>
      </div>
      <div class="settings-field"><label>Capability tags (comma-separated)</label>
        <input class="settings-input" id="tf-caps" placeholder="code,search,storage">
      </div>
      <div style="display:flex;gap:12px">
        <div class="settings-field" style="flex:1"><label>Cost profile</label>
          <select class="settings-input" id="tf-cost">
            <option value="metered">Metered</option>
            <option value="unmetered">Unmetered</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
        <div class="settings-field" style="flex:1"><label>Trust tier</label>
          <select class="settings-input" id="tf-trust">
            <option value="trusted">Trusted</option>
            <option value="restricted">Restricted</option>
            <option value="experimental">Experimental</option>
          </select>
        </div>
      </div>
      <div class="settings-save-row" style="gap:8px">
        <button class="btn btn-ghost" onclick="cancelToolForm()">Cancel</button>
        <button class="btn btn-primary" onclick="saveTool()">Register</button>
      </div>
    </div>
  </div>

  <div id="audit-module" class="module-panel">
    <div class="module-hdr">
      <span class="module-title">Activity Feed</span>
      <button class="btn btn-ghost" style="font-size:12px" onclick="loadAudit()">&#8635; Refresh</button>
    </div>
    <div style="font-size:13px;color:var(--text3);margin-bottom:12px">
      Operational timeline of significant system and agent events.
    </div>
    <div id="audit-list"></div>
  </div>

  <!-- settings panel — module panel, shown when settings module active -->
  <div id="settingsPanel">

    <!-- left nav -->
    <div class="settings-nav">
      <div class="settings-nav-title">Settings</div>
      <div id="settings-user-hdr" style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);margin-bottom:8px">
        <div class="user-avatar" id="ucAvatar"></div>
        <div style="min-width:0;flex:1">
          <div class="user-name" id="ucName">—</div>
          <div class="user-sub">Administrator</div>
        </div>
      </div>
      <button class="settings-nav-item active" id="snav-profile" onclick="switchSettingsTab('profile')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        Profile
      </button>
      <button class="settings-nav-item" id="snav-password" onclick="switchSettingsTab('password')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
        Password
      </button>
      <button class="settings-nav-item" id="snav-billing" onclick="switchSettingsTab('billing')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
        Billing
      </button>
      <div style="flex:1"></div>
      <div style="padding:12px 16px;border-top:1px solid var(--border)">
        <button class="btn btn-ghost" onclick="switchSettingsTab('changelog')" style="width:100%;justify-content:flex-start;gap:8px;font-size:12px;color:var(--text3);margin-bottom:4px">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          v0.12.70 — What's new
        </button>
        <button class="btn btn-ghost" onclick="doLogout()" style="width:100%;justify-content:flex-start;gap:8px;font-size:13px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign out
        </button>
      </div>
    </div>

    <!-- right content -->
    <div class="settings-content">

      <!-- close / back button -->
      <button class="btn btn-icon" onclick="closeSettings()"
              style="position:absolute;top:14px;right:14px;padding:6px 7px;border:none"
              title="Close settings (Esc)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      <!-- Profile page -->
      <div class="settings-page active" id="spage-profile">
        <div class="settings-page-title">Profile</div>
        <div class="avatar-section">
          <div class="avatar-large" id="saAvatar" onclick="triggerAvatarUpload()" title="Click to change photo"></div>
          <div>
            <div style="font-size:12px;font-weight:600;color:var(--text)">Profile photo</div>
            <div class="avatar-hint">Click to upload · JPG, PNG, WebP, GIF</div>
          </div>
        </div>
        <div class="settings-field">
          <label>Full name</label>
          <input type="text" class="settings-input" id="sa-full-name" placeholder="Your full name">
        </div>
        <div class="settings-field">
          <label>What should Porter call you?</label>
          <input type="text" class="settings-input" id="sa-name" placeholder="Preferred name">
        </div>
        <div class="settings-field">
          <label>Email address</label>
          <input type="email" class="settings-input" id="sa-email" placeholder="you@example.com">
        </div>
        <div class="settings-save-row">
          <button class="btn btn-primary" onclick="saveAccount()">Save changes</button>
        </div>
        <!-- moved to Password tab -->
      </div>

      <!-- Locations page -->
      <div class="settings-page" id="spage-locations">
        <div class="settings-page-title">Locations</div>
        <div style="font-size:13px;color:var(--text3);margin-bottom:18px">Machines and paths Porter can browse. Add a location first, then add paths under it.</div>
        <div id="loc-list"></div>

        <!-- mount add/edit form -->
        <div id="mount-form" style="display:none;margin-top:16px;padding:14px;background:var(--raised);border-radius:8px;border:1px solid var(--border)">
          <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:12px">Mount path</div>
          <input type="hidden" id="nm-node-id">
          <input type="hidden" id="nm-mount-id">
          <div class="settings-field">
            <label>Label</label>
            <input type="text" class="settings-input" id="nm-label" placeholder="Documents">
          </div>
          <div class="settings-field">
            <label>Absolute path</label>
            <input type="text" class="settings-input" id="nm-path" placeholder="/home/user/files">
          </div>
          <div class="settings-save-row" style="gap:8px">
            <button class="btn btn-ghost" onclick="testMountPath()">Test path</button>
            <div style="flex:1"></div>
            <button class="btn btn-ghost" onclick="cancelMountForm()">Cancel</button>
            <button class="btn btn-primary" onclick="saveMountForm()">Save</button>
          </div>
          <div id="nm-status" style="font-size:12px;margin-top:6px;color:var(--text3)"></div>
        </div>

        <!-- add location form (Add Location button → type picker) -->
        <div id="loc-form" style="display:none;margin-top:16px;padding:14px;background:var(--raised);border-radius:8px;border:1px solid var(--border)">
          <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:12px">Add Location</div>
          <input type="hidden" id="lf-edit-id">
          <input type="hidden" id="lf-type">
          <div class="loc-type-grid">
            <button class="loc-type-card" onclick="addLocalNode()">
              <span class="loc-card-title">🖥 Local machine</span>
              <span class="loc-card-desc">Add another local node instance</span>
            </button>
            <button class="loc-type-card" onclick="addVpsNode()">
              <span class="loc-card-title">☁ VPS / Remote server</span>
              <span class="loc-card-desc">A cloud or hosted server accessed via SSH or direct mount</span>
            </button>
            <button class="loc-type-card" onclick="addTailscaleNode()">
              <span class="loc-card-title">🔗 Tailscale peer</span>
              <span class="loc-card-desc">Discover and add a peer from your tailnet</span>
            </button>
            <button class="loc-type-card" disabled>
              <span class="loc-card-title">🐙 GitHub repository</span>
              <span class="loc-card-desc">Coming soon</span>
            </button>
          </div>
          <!-- tailscale peer selector (hidden until tailscale chosen) -->
          <div id="lf-ts-picker" style="display:none;margin-top:12px">
            <div class="settings-field">
              <label>Select peer</label>
              <select class="settings-input" id="lf-ts-peer" onchange="onTsPeerSelect()" style="cursor:pointer">
                <option value="">Loading peers…</option>
              </select>
            </div>
            <div id="lf-ts-status" style="font-size:11px;color:var(--text3);margin-bottom:10px"></div>
            <div class="settings-save-row" style="gap:8px">
              <button class="btn btn-ghost" onclick="cancelLocationForm()">Cancel</button>
              <button class="btn btn-primary" id="lf-ts-add-btn" disabled onclick="addTailscaleNodeFromPeer()">Add Location</button>
            </div>
          </div>
          <div id="lf-status" style="font-size:12px;margin-top:8px;color:var(--text3)"></div>
        </div>

        <div style="margin-top:16px;display:flex;gap:8px">
          <button class="btn btn-primary" onclick="openAddLocation()">+ Add Location</button>
        </div>
      </div>

      <!-- Agents page -->
      <div class="settings-page" id="spage-agents">
        <div class="settings-page-title">Agents</div>
        <div style="font-size:13px;color:var(--text3);margin-bottom:18px">API clients that connect to Porter. Each agent gets a unique key.</div>
        <div id="agent-list"></div>
        <div style="margin-top:18px">
          <button class="btn btn-primary" onclick="openCreateAgent()">+ Create agent</button>
        </div>
        <!-- create form -->
        <div id="agent-form" style="display:none;margin-top:20px;padding:16px;background:var(--raised);border-radius:8px;border:1px solid var(--border)">
          <div class="settings-page-title" style="font-size:14px;margin-bottom:14px">New agent</div>
          <div class="settings-field">
            <label>Name</label>
            <input type="text" class="settings-input" id="af-name" placeholder="Claude Code">
          </div>
          <div class="settings-field">
            <label>Type</label>
            <select class="settings-input" id="af-type" style="cursor:pointer">
              <option value="claude-code">Claude Code</option>
              <option value="openclaw">OpenClaw</option>
              <option value="generic">Generic API client</option>
            </select>
          </div>
          <div class="settings-field">
            <label>Role</label>
            <select class="settings-input" id="af-role" style="cursor:pointer">
              <option value="viewer">Viewer — read only</option>
              <option value="writer" selected>Writer — read + write + checkpoint</option>
              <option value="operator">Operator — writer + finalize</option>
              <option value="admin">Admin — full access</option>
            </select>
          </div>
          <div class="settings-save-row" style="gap:8px">
            <button class="btn btn-primary" onclick="createAgent()">Create &amp; copy key</button>
            <button class="btn btn-ghost" onclick="cancelAgentForm()">Cancel</button>
          </div>
        </div>
        <!-- new key display -->
        <div id="agent-key-box" style="display:none;margin-top:20px;padding:14px;background:rgba(247,147,26,.08);border:1px solid rgba(247,147,26,.3);border-radius:8px">
          <div style="font-size:12px;color:var(--accent);font-weight:600;margin-bottom:8px">⚠ Copy this key now — it won't be shown again</div>
          <div style="display:flex;gap:8px;align-items:center">
            <code style="flex:1;font-size:12px;word-break:break-all;color:var(--text)" id="agent-key-val"></code>
            <button class="btn btn-ghost" style="flex-shrink:0;font-size:12px" onclick="copyAgentKey()">Copy</button>
          </div>
        </div>
        <!-- agent usage section (merged from former Usage tab) -->
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border)">
          <div class="settings-page-title" style="font-size:15px;margin-bottom:10px">Agent Usage</div>
          <div style="font-size:13px;color:var(--text3);margin-bottom:12px">
            Current availability and token usage windows for all registered agents.
          </div>
          <div id="usage-panel"><div style="color:var(--text3);font-size:13px">Loading…</div></div>
          <div style="margin-top:12px">
            <button class="btn btn-ghost" style="font-size:12px" onclick="openUsageSnapshot()">+ Report usage</button>
          </div>
        </div>
        <!-- manual snapshot form -->
        <div id="usage-snap-form" style="display:none;margin-top:14px;padding:14px;background:var(--raised);border-radius:8px;border:1px solid var(--border)">
          <div style="font-size:13px;font-weight:600;margin-bottom:12px">Report agent usage</div>
          <div class="settings-field">
            <label>Agent</label>
            <select class="settings-input" id="us-agent" style="cursor:pointer"></select>
          </div>
          <div class="settings-field">
            <label>Paste raw status output <span style="color:var(--text3);font-weight:400">(or fill fields manually)</span></label>
            <textarea class="settings-input" id="us-raw" rows="3" placeholder="Paste CLI output here…" style="font-family:monospace;font-size:11px;resize:vertical" oninput="parseUsageRaw()"></textarea>
          </div>
          <div style="display:flex;gap:12px">
            <div class="settings-field" style="flex:1">
              <label>Status</label>
              <select class="settings-input" id="us-status" style="cursor:pointer">
                <option value="available">Available</option>
                <option value="degraded">Degraded (&gt;75%)</option>
                <option value="rate_limited">Rate limited (&gt;90%)</option>
                <option value="exhausted">Exhausted (100%)</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
            <div class="settings-field" style="flex:1">
              <label>Usage %</label>
              <input type="number" class="settings-input" id="us-pct" min="0" max="100" placeholder="0–100">
            </div>
          </div>
          <div class="settings-field">
            <label>Resets at (UTC ISO, optional)</label>
            <input type="text" class="settings-input" id="us-resets" placeholder="2026-02-25T02:00:00Z">
          </div>
          <div class="settings-save-row" style="gap:8px">
            <button class="btn btn-ghost" onclick="cancelUsageSnapshot()">Cancel</button>
            <button class="btn btn-primary" onclick="submitUsageSnapshot()">Save snapshot</button>
          </div>
        </div>
      </div>

      <!-- Password page -->
      <div class="settings-page" id="spage-password">
        <div class="settings-page-title">Password</div>
        <div class="pw-helper">Owner mode — you're already authenticated. Enter and confirm your new password.</div>
        <div class="settings-field" style="margin-top:14px">
          <label>New password <span style="color:var(--text3);font-weight:400">(min 8 chars)</span></label>
          <input type="password" class="settings-input" id="sa-pwNew" autocomplete="new-password">
        </div>
        <div class="settings-field">
          <label>Confirm new password</label>
          <input type="password" class="settings-input" id="sa-pwConfirm" autocomplete="new-password">
        </div>
        <div class="settings-save-row">
          <button class="btn btn-primary" onclick="changePassword()">Update password</button>
        </div>
      </div>

      <!-- Billing page -->
      <div class="settings-page" id="spage-billing">
        <div class="settings-page-title">Billing</div>
        <div style="font-size:13px;color:var(--text2);margin-bottom:12px">Stripe integration placeholder.</div>
        <div style="background:var(--raised);border:1px solid var(--border);border-radius:8px;padding:14px">
          <div style="font-size:13px;font-weight:600;color:var(--text)">Coming soon</div>
          <div style="font-size:12px;color:var(--text3);margin-top:6px">Subscription, invoices, payment method management, and usage-based charges will appear here once Stripe is connected.</div>
        </div>
      </div>

      <!-- Task Operations page -->
      <div class="settings-page" id="spage-tasks">
        <div class="sp-header">
          <h2>Task Operations</h2>
          <button class="btn btn-sm btn-ghost" onclick="clearCompletedTasks()"
                  style="margin-left:auto">Clear completed</button>
        </div>
        <details class="task-legend" style="margin-bottom:14px;font-size:12px;color:var(--text2)">
          <summary style="cursor:pointer;font-weight:600;color:var(--text3);font-size:11px;text-transform:uppercase;letter-spacing:.5px;list-style:none">&#9658; Status reference</summary>
          <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">
            <div style="display:flex;align-items:center;gap:10px">
              <span class="task-badge badge-running">running</span>
              <span>Heartbeat active — agent is processing normally</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <span class="task-badge badge-paused">paused</span>
              <span>Manually paused by an operator — awaiting resume</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <span class="task-badge badge-stalled">stalled</span>
              <span>Heartbeat expired — agent may have crashed or lost connection</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <span class="task-badge badge-complete">complete</span>
              <span>Task finished successfully and finalized</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <span class="task-badge badge-cancelled">cancelled</span>
              <span>Manually cancelled — no further work will be done</span>
            </div>
          </div>
        </details>
        <div id="tasks-list"><div style="color:var(--text2);padding:20px 0">Loading…</div></div>
      </div>

      <!-- Policy Presets page -->
      <div class="settings-page" id="spage-policy">
        <div class="sp-header"><h2>Policy Presets</h2></div>
        <p style="color:var(--text2);margin:0 0 4px">
          Select a routing strategy. Agents use this preset for model selection and cost behaviour.
          Preset-based control only — no autonomous optimizer.
        </p>
        <div class="policy-grid" id="policy-presets-grid"></div>
      </div>

      <div class="settings-page" id="spage-changelog">
        <div class="settings-page-title">What's new</div>
        <div id="changelog-content">
          <div class="cl-ver-row"><span class="cl-vtag">Loading release notes…</span><span class="cl-vdate"></span></div>
          <ul class="cl-notes"><li>If this persists, refresh once. Porter will repopulate this panel automatically.</li></ul>
        </div>
      </div>

    </div><!-- /settings-content -->
  </div><!-- /settingsPanel -->

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


<!-- hidden avatar file input -->
<input type="file" id="avatarInput" style="display:none" accept="image/jpeg,image/png,image/webp,image/gif">

<script>
// ── helpers ──
function enc(s) { return encodeURIComponent(s); }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function esc(s) { return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
async function api(url, body, timeout_ms = 15000) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeout_ms);
  const opt = body
    ? { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:ctrl.signal }
    : { signal: ctrl.signal };
  try {
    const r = await fetch(url, opt);
    clearTimeout(tid);
    if (r.status === 401) { window.location.href = '/login'; return null; }
    const d = await r.json();
    if (!r.ok) {
      const errMsg = d.error && typeof d.error === 'object' ? (d.error.message || 'API error') : (d.error || 'API error');
      toast(errMsg, 'err');
      return null;
    }
    return d;
  } catch(e) {
    clearTimeout(tid);
    if (e.name === 'AbortError') { toast('Request timed out — check your connection', 'err'); return null; }
    toast('Network error', 'err');
    return null;
  }
}

const CHANGELOG = [
  { ver:'v0.12.70', date:'2026-02-26', notes:[
    'PEP/1 Phase 0: iPhone connect flow replaced with client-first browser access instructions (no SSH assumption)',
    'PEP/1 Phase 0: non-iOS connect modal reframed to capability-first language (what you get, not which protocol)',
    'PEP/1 Phase 0: SSH probe error envelope now structured (error.code, error.message, error.retryable)',
    'PEP/1 Phase 0: SSH failure modal shows error code, human message, and retry action when retryable',
    'PEP/1 Phase 0: node status upgraded to tri-state — online / relay / offline',
    'PEP/1 Phase 0: relay state shown in amber on node cards and Locations rows (DERP relay, not direct)',
    'PEP/1 Phase 0: Tailscale peer data now includes relay flag from tailscale status --json',
    'PEP/1 Phase 0: api() enforces 15s AbortController timeout — no more hanging spinners',
  ]},
  { ver:'v0.12.69', date:'2026-02-26', notes:[
    'Connect flow now adapts to iPhone/iOS targets with a dedicated preparation + SSH test wizard',
    'Added iPhone readiness checklist in-product (Tailscale + SSH server app + active foreground requirement)',
    'iPhone SSH probes now support custom ports (default 2222) and save verified endpoint metadata',
  ]},
  { ver:'v0.12.68', date:'2026-02-26', notes:[
    'Connect SSH mode now opens a real SSH test wizard (user/host/port) instead of a dead-end toast',
    'Added backend /api/ssh/probe endpoint for live SSH reachability checks with clear error messages',
    'Successful SSH tests are now persisted per device as saved SSH endpoint metadata',
  ]},
  { ver:'v0.12.67', date:'2026-02-26', notes:[
    'Connect action now opens a confirmation popup with endpoint strategy (SSH first, Agent fallback)',
    'Remote connect flow no longer hard-codes agent-only messaging',
    'Added guided branch: try SSH over Tailscale or bootstrap Porter Agent',
  ]},
  { ver:'v0.12.66', date:'2026-02-26', notes:[
    'Files secondary nav: moved Browse/Connect action button to top-right of each device card',
    'Added stronger online/offline visual distinction via color/shading at card level',
    'Improved TS status legibility with state-colored labels',
  ]},
  { ver:'v0.12.65', date:'2026-02-26', notes:[
    'Files secondary nav layout improved for long device names (less truncation)',
    'Device cards now use two-line structure (name + TS status) with action on separate line',
    'Secondary rail widened to 260px for cleaner readability',
  ]},
  { ver:'v0.12.64', date:'2026-02-26', notes:[
    'Moved free-space footer from secondary location rail into file results area bottom border',
    'Storage/item count context now appears where file results are shown (per user request)',
  ]},
  { ver:'v0.12.63', date:'2026-02-26', notes:[
    'Files sidebar behavior corrected: devices with no paths now show Connect (not Browse)',
    'Offline devices show disabled Off state and cannot be pressed',
    'Shortened empty-state copy and removed long placeholder messaging',
  ]},
  { ver:'v0.12.62', date:'2026-02-26', notes:[
    'Command Center cleanup: removed Recent events/Live Activity section',
    'Command Center now focuses only on current actionable state',
  ]},
  { ver:'v0.12.61', date:'2026-02-26', notes:[
    'Command Center cleanup: removed redundant Immediate Actions block',
    'Removed disk-space metric and pressure card from Command Center to avoid illogical signal noise',
    'Kept action-oriented incident flow focused on task/location/operator signals',
  ]},
  { ver:'v0.12.60', date:'2026-02-25', notes:[
    'Tasks decomplex pass: removed Task Wizard surface to reduce UI branching',
    'Kept context-first "Right now" guidance as the primary decision driver',
    'Simplified lane descriptions for faster operator scan',
  ]},
  { ver:'v0.12.59', date:'2026-02-25', notes:[
    'Files secondary nav ordering improved: self first, then online, then offline devices',
    'Action labels compacted for cleaner scan in narrow sidebar',
    'Reduced visual jitter by deterministic alphabetical ordering within status groups',
  ]},
  { ver:'v0.12.58', date:'2026-02-25', notes:[
    'Tasks decomplex pass: removed always-on rule block and made rules collapsible',
    'Primary guidance remains context-triggered via dynamic "Right now" instruction',
    'Reduced cognitive load in Tasks without removing operator clarity',
  ]},
  { ver:'v0.12.57', date:'2026-02-25', notes:[
    'Primary nav declutter: hid Tools and Activity from left rail while retaining module access internally',
    'Focuses default operator flow on Command Center, Locations, Files, Agents, Tasks',
  ]},
  { ver:'v0.12.56', date:'2026-02-25', notes:[
    'Decomplexify pass: removed dead nickname/connect helper code paths',
    'Removed remote connect pseudo-flow from Files sidebar (local browse only, remote clearly deferred)',
    'Simplified sidebar action logic to reduce state bugs and maintenance overhead',
  ]},
  { ver:'v0.12.55', date:'2026-02-25', notes:[
    'Added persistent in-UI decision rubric for cancel vs recover behavior in Tasks',
    'Task cards now flag stale tasks with explicit recommend-cancel guidance',
    'Operator instructions are now always visible (not hidden in transient wizard context)',
  ]},
  { ver:'v0.12.54', date:'2026-02-25', notes:[
    'Tasks now includes a guided Task Wizard for operator decision support',
    'Wizard generates step-by-step action plans by intent (unblock/stabilize/cleanup/start)',
    'Tasks header adds direct Task Wizard entry point',
  ]},
  { ver:'v0.12.53', date:'2026-02-25', notes:[
    'Tasks guidance panel added with explicit step-by-step operator instructions',
    'Dynamic "Right now" directive now tells user the top immediate action',
    'Tasks UX now combines status grouping with actionable guidance copy',
  ]},
  { ver:'v0.12.52', date:'2026-02-25', notes:[
    'Tasks UX overhaul: grouped into Needs action / In progress / Completed',
    'Added per-task next-step guidance and clearer primary action labels',
    'Tasks header now explicitly states operator purpose',
  ]},
  { ver:'v0.12.51', date:'2026-02-25', notes:[
    'Command Center v1.1: added live auto-refresh (15s) while active',
    'Added explicit refresh control and now-lane summary chips for faster scanning',
    'Improved operational visibility without adding dashboard clutter',
  ]},
  { ver:'v0.12.50', date:'2026-02-25', notes:[
    'Overview upgraded into Command Center with actionable incident cards',
    'Audit relabeled to Activity Feed for operational context',
    'Command Center now surfaces immediate actions instead of passive metrics-only view',
  ]},
  { ver:'v0.12.49', date:'2026-02-25', notes:[
    'Fix: restored remote device rendering in Files secondary nav after connect-state variable regression',
    'Stabilized action-state evaluation to prevent sidebar breakage when loading mixed device states',
  ]},
  { ver:'v0.12.48', date:'2026-02-25', notes:[
    'Simplified mode: remote attach/connect flows removed from Files secondary nav',
    'Files now supports path browse/attach only for local device; remote shows Coming next',
    'Reduced feature ambiguity to stabilize UX before remote agent rollout',
  ]},
  { ver:'v0.12.47', date:'2026-02-25', notes:[
    'Clarified Tailscale-first model in Files nav labels (TS online/offline)',
    'UI now distinguishes transport readiness from browser readiness (Agent required)',
    'Remote connect messaging updated to explicitly reference Porter Agent over Tailscale',
  ]},
  { ver:'v0.12.46', date:'2026-02-25', notes:[
    'Connect action no longer leaves iPhone/Android in false pending state',
    'Mobile devices now show explicit connector-not-shipped message for pairing',
    'Pending state auto-clears if remote agent does not come online',
  ]},
  { ver:'v0.12.45', date:'2026-02-25', notes:[
    'Files secondary nav cleaned up into clearer device cards with explicit Browse/Connect actions',
    'Removed ambiguous attach wording and dead-click behavior from remote rows',
    'Mount empty-state now clearly explains why browsing is unavailable for remote devices',
  ]},
  { ver:'v0.12.44', date:'2026-02-25', notes:[
    'Connect flow now shows pending state in Files secondary nav (no ambiguous no-op)',
    'After Connect, automatic refresh checks run to surface pass/fail status changes',
    'CTA labels update to Pending… while remote setup is in progress',
  ]},
  { ver:'v0.12.43', date:'2026-02-25', notes:[
    'Files secondary nav CTA clarified: remote rows now use Connect instead of ambiguous labels',
    'Connect action now provides target-specific bootstrap command to enable remote browsing',
    'Empty-state action text updated to Connect remote browser for clearer operator intent',
  ]},
  { ver:'v0.12.42', date:'2026-02-25', notes:[
    'Files secondary location nav redesigned with cleaner device cards and hierarchy',
    'Improved spacing/typography/chips for online status and path counts',
    'Refined action labeling and row density for a more polished visual flow',
  ]},
  { ver:'v0.12.41', date:'2026-02-25', notes:[
    'Attach path controls now disabled for offline devices in Files sidebar',
    'Removed manual path prompts for remote devices (no blind input)',
    'Attach path currently enabled only for local device until remote agent browser is wired',
  ]},
  { ver:'v0.12.40', date:'2026-02-25', notes:[
    'Agent Fleet Lifecycle panel upgraded with editable rollout policy controls',
    'Added in-UI save for channel/current/min-compatible/auto-update/rollout',
    'Bootstrap helpers retained for first-use install across macOS/Linux/Windows',
  ]},
  { ver:'v0.12.39', date:'2026-02-25', notes:[
    'Added Agent Fleet Lifecycle panel in Agents module (policy summary + refresh)',
    'Added bootstrap command helpers for macOS/Linux/Windows first-use installs',
    'Agents view now auto-loads fleet lifecycle state for operator visibility',
  ]},
  { ver:'v0.12.38', date:'2026-02-25', notes:[
    'Agent lifecycle foundation: added fleet policy API (channel/version/min-compatible/rollout)',
    'Added bootstrap API to support install-on-first-use commands per target OS/arch',
    'Added agent heartbeat/update reporting endpoint for auto-update observability',
  ]},
  { ver:'v0.12.37', date:'2026-02-25', notes:[
    'Files reliability fix: entering Files now always refreshes locations/devices list (timing bug resolved)',
    'CTA wording upgraded from Expose to Attach for a cleaner, more product-grade tone',
    'Secondary nav now uses Attach/Attach first path language consistently',
  ]},
  { ver:'v0.12.36', date:'2026-02-25', notes:[
    'Expose first path now opens local folder picker for this server (no blind path typing)',
    'Added self-device detection so path selection is idiot-proof on local VPS',
    'Remote peers temporarily keep manual path prompt with explicit context until remote browse adapter lands',
  ]},
  { ver:'v0.12.35', date:'2026-02-25', notes:[
    'Secondary Files nav wrapping fix: node headers now enforce single-line ellipsis',
    'Improved mount row truncation with stable action button alignment',
    'Added full-name hover title on device headers for readability without wrapping',
  ]},
  { ver:'v0.12.34', date:'2026-02-25', notes:[
    'Files sidebar polish: reduced line wrapping for device/path labels',
    'Applied truncation with ellipsis for cleaner location list rendering',
    'Added hover titles on path labels so full names remain accessible',
  ]},
  { ver:'v0.12.33', date:'2026-02-25', notes:[
    'Added persistent tooltips for network context fields (Transport, Tailnet, Devices online)',
    'Added informative tooltips for Locations table columns (Device, Nickname, OS/IP)',
  ]},
  { ver:'v0.12.32', date:'2026-02-25', notes:[
    'Locations tab restored device presence status (online/offline)',
    'Added status dot + label next to each device name for quick visibility',
  ]},
  { ver:'v0.12.31', date:'2026-02-25', notes:[
    'Files now reflects location nicknames in the sidebar device labels',
    'Self device label in Files uses nickname when set (e.g., Hostinger (this device))',
    'Name mapping normalized to avoid falling back to raw server id when nickname exists',
  ]},
  { ver:'v0.12.30', date:'2026-02-25', notes:[
    'Nickname UI compacted: removed inline text inputs to save space',
    'Set nickname now uses a popup flow from a button',
    'Added remove nickname action per device',
  ]},
  { ver:'v0.12.29', date:'2026-02-25', notes:[
    'Removed redundant Devices list from Connectivity panel (single source of truth)',
    'Locations now holds the only device table for naming: Device, Nickname, OS/IP + Set nickname',
    'Eliminated duplicate sections that caused circular UX',
  ]},
  { ver:'v0.12.28', date:'2026-02-25', notes:[
    'Locations nickname UX updated: action label changed to "Set nickname"',
    'Added explicit middle Nickname column with visible current nickname value',
    'Maintained clean 4-field row layout: Device, Nickname, OS/IP, Action',
  ]},
  { ver:'v0.12.27', date:'2026-02-25', notes:[
    'Moved nickname editing into the primary Locations window (inline input + save per device)',
    'Replaced clumsy label wording with cleaner action text (Edit name)',
    'Removed prompt-based nickname flow from primary workflow',
  ]},
  { ver:'v0.12.26', date:'2026-02-25', notes:[
    'Removed duplicate nickname/device section from Locations entirely',
    'Nickname action moved to Connectivity → Devices rows (single source of truth)',
    'Eliminated remaining Hostinger fallback naming in device actions',
  ]},
  { ver:'v0.12.25', date:'2026-02-25', notes:[
    'Removed remaining Hostinger fallback label from device rendering',
    'Locations list no longer shows extra Devices section header',
    'Nickname feature retained via Set/Edit action only',
  ]},
  { ver:'v0.12.24', date:'2026-02-25', notes:[
    'Locations cleanup: removed all visible "Nickname: ..." rows',
    'Self device no longer uses Hostinger-style label in device name rendering',
    'Nickname remains available only as an explicit Set/Edit action per device',
  ]},
  { ver:'v0.12.23', date:'2026-02-25', notes:[
    'Locations cleanup: removed the prior table section entirely',
    'Devices list now shows canonical name + optional nickname + OS/IP with a single Nickname action',
    'Nickname management remains in Locations without inline form clutter',
  ]},
  { ver:'v0.12.22', date:'2026-02-25', notes:[
    'Locations redesigned into a clean 3-column devices table: Device, Nickname, OS/IP',
    'Added inline nickname save per device (including discovered peers)',
    'Discovered devices can be promoted and nicknamed in one step',
  ]},
  { ver:'v0.12.21', date:'2026-02-25', notes:[
    'Locations list cleanup: removed redundant status text (configured/online/offline)',
    'Locations now shows only device nickname + rename action',
  ]},
  { ver:'v0.12.20', date:'2026-02-25', notes:[
    'Locations simplified to nickname management only (no extra management cards)',
    'All discovered/configured devices appear as a clean rename list',
    'Virtual peers can now be renamed directly (auto-promoted to saved location before rename)',
  ]},
  { ver:'v0.12.19', date:'2026-02-25', notes:[
    'Locations now shows all devices (configured + discovered peers), not just VPS',
    'Location naming cleaned: self shows server identity; rename action is in Locations',
    'Files keeps add/delete path controls per device while Locations handles labeling/governance',
  ]},
  { ver:'v0.12.18', date:'2026-02-25', notes:[
    'Files fix: all locations now render after Tailscale status refresh (not just VPS)',
    'Added clear +Path action per location and clear Delete action per exposed path in Files nav',
    'Path exposure/removal now explicit across every discovered/configured location',
  ]},
  { ver:'v0.12.17', date:'2026-02-25', notes:[
    'Files now includes discovered trusted Tailscale devices even before paths are configured',
    'Added Files-native "Expose first path…" flow per device (creates location if needed, then adds mount)',
    'Per-device path exposure is now user-driven and dynamic across trusted devices',
  ]},
  { ver:'v0.12.16', date:'2026-02-25', notes:[
    'Files location labels: self device now shows server identity (srv1379868 (this device)) instead of Hostinger label',
    'Files navigation now lists all configured locations (including empty/no-path locations)',
    'Added per-path remove action directly in Files navigation',
  ]},
  { ver:'v0.12.15', date:'2026-02-25', notes:[
    'Files visibility fix: locations now appear immediately in Files before first Tailscale status poll',
    'Prevents empty Files nav caused by strict early Tailscale cache gating',
  ]},
  { ver:'v0.12.14', date:'2026-02-25', notes:[
    'Locations cleanup: removed all +Path actions from Locations/Tailscale section',
    'Path exposure flow is now Files-first as intended',
  ]},
  { ver:'v0.12.13', date:'2026-02-25', notes:[
    'Files navigation now shows every connected location even when it has zero exposed paths',
    'Added inline "Expose first path…" action per location for quick path setup',
    'Location headers now show path count to clarify per-device exposure at a glance',
  ]},
  { ver:'v0.12.12', date:'2026-02-25', notes:[
    'Tailscale peer naming fix: when HostName is "localhost", Porter now uses DNS device label',
    'iPhone/iOS devices now display by device name instead of localhost',
  ]},
  { ver:'v0.12.11', date:'2026-02-25', notes:[
    'Locations header cleanup: removed top "+ Add Location" action for a cleaner flow',
    'Kept connectivity controls as the primary action area in Locations',
  ]},
  { ver:'v0.12.10', date:'2026-02-25', notes:[
    'Hostinger/VPS moved into the Tailscale Devices group (single device list)',
    'Removed duplicate self-device card from Locations list to avoid repeated Hostinger display',
    'Devices online counter now includes this device + peers',
  ]},
  { ver:'v0.12.9', date:'2026-02-25', notes:[
    'Removed duplicate Hostinger display from Tailscale Devices list',
    'Tailscale Devices now shows peer devices only (Hostinger remains represented in Locations)',
    'Devices online count adjusted to peer-only scope',
  ]},
  { ver:'v0.12.8', date:'2026-02-25', notes:[
    'Devices model corrected: Hostinger/VPS is included in the Tailscale Devices group',
    'Devices panel now shows this server as "(this device)" and keeps peers in the same unified list',
    'Connectivity count now reflects total devices (this device + peers)',
  ]},
  { ver:'v0.12.7', date:'2026-02-25', notes:[
    'Locations layout cleanup: removed separate "Location devices" section heading; all locations render in one unified list',
    'Connectivity panel corrected: removed VPS-specific identity/IP rows from Tailscale transport status',
    'Tailscale panel now focuses on transport + peer network status only',
  ]},
  { ver:'v0.12.6', date:'2026-02-25', notes:[
    'Locations model clarity: VPS/local device is now shown as its own location device, separate from tailnet peer concept',
    'Locations now shows device-level cards (without path management clutter) to keep topology clear',
    'Connectivity wording updated: peer count explicitly excludes the current VPS device',
  ]},
  { ver:'v0.12.5', date:'2026-02-25', notes:[
    'Locations UX cleanup: removed unnecessary "inventory moved to Files" explainer box',
    'Locations now stays strictly minimal (connectivity/setup only)',
  ]},
  { ver:'v0.12.4', date:'2026-02-25', notes:[
    'Locations UX simplification: removed bottom device/path management cards from Locations',
    'Location inventory is now represented in Files context; Locations stays focused on connectivity + setup',
    'Added summary card in Locations with direct Open Files action',
  ]},
  { ver:'v0.12.3', date:'2026-02-25', notes:[
    'Keyboard fix: Esc now closes Settings first instead of unexpectedly switching modules',
    'Settings UX: Esc behavior audited for overlays/modals/folder picker/preview priority',
  ]},
  { ver:'v0.12.2', date:'2026-02-25', notes:[
    'Settings IA cleanup: removed "Connectivity (moved to Locations)" from Settings navigation',
    'Settings split: Profile and Password are now separate tabs',
    'Settings added: Billing tab placeholder for upcoming Stripe integration',
    'Safety hardening: Tailscale connect/disconnect controls remain disabled to prevent VPS lockouts',
  ]},
  { ver:'v0.12.1', date:'2026-02-25', notes:[
    'Locations adds Connect/Disconnect/Test controls for Tailscale transport',
    'Tailscale nodes are now gated by connectivity state in Locations/Files navigation',
    'Connection-first flow: transport first, then expose mounted paths',
  ]},
  { ver:'v0.12.0', date:'2026-02-25', notes:[
    'Information architecture cleanup: Tailscale/Connectivity moved into Locations module',
    'Locations now acts as infrastructure hub (devices, networking context, mounts)',
    'Settings no longer acts as a network surface; legacy network entry redirects to Locations connectivity',
  ]},
  { ver:'v0.11.11', date:'2026-02-25', notes:[
    'Settings overlay behavior: clicking any primary nav module now closes Settings and navigates correctly',
    'Fix: non-Files main navigation buttons no longer appear unresponsive while Settings is open',
  ]},
  { ver:'v0.11.10', date:'2026-02-25', notes:[
    'Tailscale status: renamed "This device" to "VPS device" for clarity',
    'Tailscale status: now shows both Public IP and Tailscale IP for the VPS',
    'Public IP source: PORTER_PUBLIC_IP env override first, otherwise configured HOST when public',
  ]},
  { ver:'v0.11.9', date:'2026-02-25', notes:[
    'Navigation order updated for setup-first flow: Locations, Files, Agents, Tasks, Schedules, Policies',
    'Release notes policy fix: restored missing v0.11.2–v0.11.8 entries (append-only history)',
  ]},
  { ver:'v0.11.8', date:'2026-02-25', notes:[
    'Breadcrumbs: root crumb now shows full mounted VPS path (e.g., /home/lobster/documents) instead of ~/root-id',
  ]},
  { ver:'v0.11.7', date:'2026-02-25', notes:[
    'Files UX: locations moved out of primary sidebar into a dedicated secondary Files navigation rail',
    'Files UX: secondary rail now carries location tree + free space + item count in one contextual panel',
    'Files UX: selecting Files or navigating to a location force-closes Settings for cleaner transitions',
  ]},
  { ver:'v0.11.6', date:'2026-02-25', notes:[
    'Profile UI: split into Full name, "What should Porter call you?", and Email address (stacked layout)',
    'Profile data: full_name added to config + /api/me + /api/profile/update',
    'Password UI: New password and Confirm password moved to separate rows for small-window readability',
  ]},
  { ver:'v0.11.5', date:'2026-02-25', notes:[
    'Fix: removed broken main-nav What\'s new entry (use Settings footer entry)',
    'Changelog restored from earliest versions and made non-blank under Settings footer access path',
  ]},
  { ver:'v0.11.3', date:'2026-02-25', notes:[
    'UI: added early population call for changelog in init',
  ]},
  { ver:'v0.11.2', date:'2026-02-25', notes:[
    'Bugfix: fixed empty changelog section by hoisting constant in script',
  ]},
  { ver:'v0.11.1', date:'2026-02-25', notes:[
    'Bugfix: cron infinite loop and broken */step syntax resolved',
    'Bugfix: data loss in switchModule (passwords/preview preserved)',
    'UI: theme toggle and refresh moved to sidebar for global access',
    'UI: integrated agent usage and status inline in Agents module',
    'Agent: Gemini CLI registered as a writer agent',
  ]},
  { ver:'v0.10.0', date:'2026-02-24', notes:[
    'Information architecture reframe toward operations console modules',
    'Primary controls moved out of legacy Settings-only flow into top-level modules',
    'Version bump: v0.9.0 → v0.10.0',
  ]},
  { ver:'v0.9.0', date:'2026-02-24', notes:[
    'P2: GET /api/tasks — list all tasks with state, owner, step count, heartbeat age',
    'P2: POST /api/tasks — pause/resume/cancel/clear_completed/update_agent_concurrency',
    'P2: GET /api/audit — newest-first audit log of all privileged task+concurrency actions',
    'P2: Task Operations settings tab — task cards with status badges and action buttons',
    'P2: Concurrency enforcement on /runtime/checkpoint for bearer agents with max_concurrent set',
    'P2: Audit trail on all task state changes (actor, action, target, iso timestamp)',
    'P2: Agent cards in Agents tab now show concurrency input (0 = unlimited)',
    'P3: GET /api/policy/presets — 5 presets with descriptions, active marker, settings dict',
    'P3: Policy Presets settings tab — Cost-Sensitive/Balanced/Speed-First/Quality-First/Local-First',
    'P3: policy_preset persisted via POST /api/preferences; default = "balanced"',
    'P4: Regression tested all core flows; no regressions found',
    'P4: Dead code absence verified; backward compat preserved',
    'Version bump: v0.8.0 → v0.9.0',
  ]},
  { ver:'v0.8.0', date:'2026-02-24', notes:[
    'Nodes & Mounts model: locations renamed to a two-layer node→mount hierarchy (machine first, then paths)',
    'Auto-migration: existing flat locations migrated to local node on first start; node ID = hostname (srv1379868)',
    'GET /api/nodes: full node tree with per-mount exists/writable stats',
    'POST /api/nodes: add_node, delete_node, add_mount, update_mount, delete_mount actions',
    'GET /api/locations: backward-compatible flat view derived from nodes; existing integrations unaffected',
    'Sidebar: locations grouped under node headers; mount items indented; node headers hidden when collapsed',
    'Settings: Locations tab renamed to "Nodes & Mounts"; node cards with expandable mount rows',
    'Settings: add-location flow replaced with node-first form (Local Node / Tailscale Node)',
    'Tailscale peer discovery populates node form; mount paths configured manually per node',
    'Agent Usage Tracker: POST /agent-usage/snapshot stores per-agent usage state to runtime/usage/',
    'Agent Usage Tracker: GET /agent-usage/current returns latest snapshot per registered agent',
    'Agent Usage Tracker: POST /agent-usage/parse extracts usage % and reset time from raw CLI text',
    'Usage parser: supports claude_code and openclaw providers; auto-derives status from usage %',
    'Settings: Usage tab — agent status cards with countdown to reset and threshold indicators',
    'Usage tab: manual snapshot form with provider selector and raw-text paste parser',
    'All new endpoints auth-gated (401 JSON for unauthenticated requests)',
    'Mount path safety: all paths validated via existing safe_resolve on file operations',
    'USAGE_DIR = runtime/usage/ created at startup alongside existing runtime dirs',
    'Version bump: v0.7.0 → v0.8.0',
  ]},
  { ver:'v0.7.0', date:'2026-02-24', notes:[
    'Collapsible sidebar — hamburger toggle in logo row; icon-only 52px rail when collapsed; preference saved to localStorage',
    'Account: owner-mode password change no longer requires current password (single-user local)',
    'Account: compact 2-column layout; display settings moved to a separate subsection',
    'Locations: guided type picker (Local folder / VPS path / Tailscale device / GitHub — coming soon)',
    'Locations: Tailscale peer discovery via tailscale status --json with manual-entry fallback',
    'Locations: writability badges (rw / ro / not found) on each location row',
    'Locations: device hostname shown as subtitle under each local location label',
    'Locations: distinct icons — folder for Documents, globe for web roots, node graph for Tailscale',
    'Tailscale tab (renamed from Network): live status with 20 s polling, peer list, last-updated timestamp',
    'Tailscale tab: smart CTAs — "Install Tailscale" command block when not found; start instructions when not running',
    'Access Model tab (renamed from Permissions): simplified, links role assignment to Agents tab',
    'Show/hide hidden files moved from Account settings to main toolbar as eye-icon toggle',
    'Agent keys now stored and visible in the Agents tab — monospace box with one-click copy button',
    'Agents without a stored key show "Rotate key to reveal" prompt',
    'Settings tabs (Locations, Agents) now load data when clicked, not only when settings first opens',
    'Sidebar location click now closes settings panel — no need to close settings manually before navigating',
    'Version / What\'s new moved from sidebar to Settings footer (above Sign out)',
    'Sidebar labels now use /api/locations (proper labels) instead of raw root IDs',
    'Disk usage bar pinned to sidebar bottom via flex layout',
  ]},
  { ver:'v0.6.0', date:'2026-02-24', notes:[
    'Settings: Locations tab — list, add, edit, remove, test-path; replaces hardcoded SERVE_DIRS',
    'Settings: Agents tab — create agents, rotate key, revoke',
    'Settings: Access Model tab — role capability overview',
    'Onboarding wizard: 4-step first-run flow (Welcome → Location → Agent → Complete)',
    'Agent auth: Bearer token accepted on all runtime/memory endpoints',
    'Permission enforcement: viewer blocked from write/checkpoint/finalize (403)',
    'Config: locations/agents/preferences stored in porter_config.json with backward-compat migration',
  ]},
  { ver:'v0.5.0', date:'2026-02-24', notes:[
    'P0: Durable checkpoint runtime — agents survive API-limit interruptions with zero lost work',
    'P0: /runtime/checkpoint — write-ahead log, one JSON line per step',
    'P0: /runtime/heartbeat — lease ownership with configurable TTL (30–3600 s)',
    'P0: /runtime/recover — returns full step history, resumable flag, lease expiry status',
    'P0: /runtime/finalize — atomic os.replace() promotion from temp to final URI',
    'P1: Memory connector API — OpenClaw/Claude use Porter as long-term memory store',
    'P1: /memory/upsert — write any text file via porter:// URI',
    'P1: /memory/fetch — read back with optional line-range slicing',
    'P1: /memory/pointer — structured pointer JSON with confidence, tags, created_at preservation',
    'P1: /memory/search — full-walk scorer over .json/.md/.txt with tag filtering; total/returned counts',
    'Hardening: resume logic respects lease expiry and lease.state field',
    'Hardening: heartbeat TTL validated to 30–3600 s range',
    'Hardening: search response includes total (pre-limit) and returned (post-limit) counts',
    'Hardening: runtime/ and memory/ paths excluded from git; .gitkeep placeholders added',
    'docs/runtime.md: documents generated paths, lifecycle, resume semantics, atomic promotion',
  ]},
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
// ── state ──
let curRoot = '', curPath = '', curWritable = true;
let rootMeta = {}; // mount id -> {path,label,node}
let _lastNodes = [];
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
  applyTheme(localStorage.getItem('porter_theme') || 'dark');
  if (localStorage.getItem('porter_sidebar') === '1') document.body.classList.add('sidebar-collapsed');
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
  const bh = document.getElementById('btnHidden');
  if (bh) bh.style.opacity = settings.showHidden ? '1' : '.4';
  // Keep settings nav/page state consistent. If mismatch, force profile tab.
  const activeNav = document.querySelector('.settings-nav-item.active');
  const activePage = document.querySelector('.settings-page.active');
  if (!activeNav || !activePage) {
    switchSettingsTab('profile');
    return;
  }
  const navTab = activeNav.id.replace('snav-', '');
  const pageTab = activePage.id.replace('spage-', '');
  if (navTab !== pageTab) switchSettingsTab(navTab || 'profile');
}

// ── theme ──
function applyTheme(t) {
  const light = t === 'light';
  document.documentElement.classList.toggle('light', light);
  const icon = document.getElementById('themeIcon');
  const sIcon = document.getElementById('sidebarThemeIcon');
  const sun = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  const moon = '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
  if (icon) icon.innerHTML = light ? sun : moon;
  if (sIcon) sIcon.innerHTML = light ? sun : moon;
  try { localStorage.setItem('porter_theme', t); } catch(e) {}
}
function toggleTheme() {
  applyTheme(document.documentElement.classList.contains('light') ? 'dark' : 'light');
}
function toggleSidebar() {
  const collapsed = document.body.classList.toggle('sidebar-collapsed');
  try { localStorage.setItem('porter_sidebar', collapsed ? '1' : '0'); } catch(e) {}
}

// ── Tailscale network status ──
let _tsCache = null;
let _tsPollTimer = null;
let _overviewPollTimer = null;

function isTailscaleNodeConnected(node) {
  if (!node || node.type !== 'tailscale') return true;
  // Before first status poll, keep locations visible (avoid empty Files nav on load).
  if (!_tsCache || !_tsCache.data) return true;
  if (_tsCache.data.available === false) return false;
  const peers = _tsCache.data.peers || [];
  const nLabel = String(node.label || '').toLowerCase();
  const nHost = String(node.hostname || '').toLowerCase();
  const nIp = String(node.tailscale_ip || '').toLowerCase();
  return peers.some(p => {
    const names = [p.name, p.dns_name, p.ip].map(v => String(v || '').toLowerCase());
    const online = !!p.online;
    if (!online) return false;
    return names.includes(nIp) || names.includes(nHost) || names.includes(nLabel);
  });
}

// Returns 'online' | 'relay' | 'offline' for a node.
// 'relay' = reachable but routing via DERP relay (not direct peer-to-peer).
function getTailscaleNodeStatus(node) {
  if (!node || node.type !== 'tailscale') return 'online';
  if (!_tsCache || !_tsCache.data) return 'online'; // optimistic before first poll
  if (_tsCache.data.available === false) return 'offline';
  const peers = _tsCache.data.peers || [];
  const nIp    = String(node.tailscale_ip || '').toLowerCase();
  const nHost  = String(node.hostname || '').toLowerCase();
  const nLabel = String(node.label || '').toLowerCase();
  const peer = peers.find(p => {
    const names = [p.name, p.dns_name, p.ip].map(v => String(v || '').toLowerCase());
    return names.includes(nIp) || names.includes(nHost) || names.includes(nLabel);
  });
  if (!peer || !peer.online) return 'offline';
  if (peer.relay) return 'relay';
  return 'online';
}

async function tailscaleControl(action) {
  const st = document.getElementById('ts-control-status');
  if (st) st.textContent = action === 'up' ? 'Connecting…' : action === 'down' ? 'Disconnecting…' : 'Testing…';
  const res = await api('/api/tailscale/control', { action });
  if (!res || !res.ok) {
    if (st) st.textContent = (res && res.error) || 'Control action failed';
    return;
  }
  if (st) st.textContent = res.message || 'Done';
  await loadTailscaleStatus(true);
  await loadLocations();
}

async function loadTailscaleStatus(force = false) {
  const now = Date.now();
  if (!force && _tsCache && (now - _tsCache.ts < 20000)) {
    renderTailscaleStatus(_tsCache.data); updateTsLastUpdated(_tsCache.ts); return;
  }
  const btn = document.getElementById('ts-refresh-btn');
  if (btn) btn.textContent = '↻ Refreshing…';
  const data = await api('/api/tailscale/status');
  if (btn) btn.textContent = '↻ Refresh';
  if (!data) return;
  _tsCache = { data, ts: Date.now() };
  renderTailscaleStatus(data);
  updateTsLastUpdated(_tsCache.ts);
  if (_lastNodes && _lastNodes.length) { _renderSidebarNodes(_lastNodes, curRoot); renderNodes(_lastNodes); }
}

function updateTsLastUpdated(ts) {
  const d = new Date(ts);
  const text = 'Last checked: ' + d.toLocaleTimeString();
  ['ts-last-updated','ts-last-updated-locations'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
}

function renderTailscaleStatus(data) {
  const panels = ['ts-panel','ts-panel-locations'].map(id => document.getElementById(id)).filter(Boolean);
  if (!panels.length) return;
  const renderInto = (el) => {
    if (!data.available) {
      const notInstalled = (data.error || '').includes('not found');
      el.innerHTML = notInstalled ? `
      <div class="ts-status-card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <span class="ts-dot ts-dot--off"></span>
          <span style="font-weight:600;color:var(--text)">Tailscale not installed</span>
        </div>
        <div style="font-size:13px;color:var(--text2);margin-bottom:14px">
          Install Tailscale on this machine to connect remote devices and access files across your network.
        </div>
        <div style="font-size:12px;font-weight:600;color:var(--text3);margin-bottom:6px">Install on this server:</div>
        <code style="display:block;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--text2);margin-bottom:14px">curl -fsSL https://tailscale.com/install.sh | sh</code>
        <div style="font-size:12px;color:var(--text3)">Then run <code style="background:var(--raised);padding:1px 5px;border-radius:3px">sudo tailscale up</code> to authenticate and join your tailnet.</div>
      </div>` : `
      <div class="ts-status-card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <span class="ts-dot ts-dot--off"></span>
          <span style="font-weight:600;color:var(--text)">Tailscale not connected</span>
        </div>
        <div style="font-size:13px;color:var(--text2);margin-bottom:14px">
          Tailscale is installed but not currently running on this machine.
        </div>
        <div style="font-size:12px;color:var(--text3)">Start it with: <code style="background:var(--raised);padding:1px 5px;border-radius:3px">sudo tailscale up</code></div>
        <div style="font-size:12px;color:var(--text3);margin-top:6px">Or add locations manually via IP/hostname in the Locations tab.</div>
      </div>`;
    return;
  }
  const s = data.self || {};
  const onlinePeers  = (data.peers || []).filter(p => p.online);
  const offlinePeers = (data.peers || []).filter(p => !p.online);
  const selfDevice = {
    name: s.name || window._serverHostname || 'this-device',
    os: s.os || 'linux',
    ip: s.ip || '—',
    online: true,
    isSelf: true,
  };
  const allDevices = [selfDevice, ...onlinePeers, ...offlinePeers];

  el.innerHTML = `
    <div class="ts-status-card">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
        <span class="ts-dot ts-dot--on"></span>
        <span style="font-weight:600;color:var(--text)">Tailscale connected</span>
      </div>
      <div class="ts-status-row">
        <span class="ts-stat-label" title="Network layer Porter uses for secure device-to-device connectivity.">Transport</span>
        <span class="ts-stat-val">Tailscale</span>
      </div>
      <div class="ts-status-row">
        <span class="ts-stat-label" title="Your private Tailscale network name; useful for diagnostics and multi-tailnet setups.">Tailnet</span>
        <span class="ts-stat-val">${escHtml(s.tailnet || '—')}</span>
      </div>
      <div class="ts-status-row">
        <span class="ts-stat-label" title="Number of currently reachable devices in this trusted network.">Devices online</span>
        <span class="ts-stat-val" style="color:${(onlinePeers.length + 1) ? 'var(--accent)' : 'var(--text3)'}">${onlinePeers.length + 1} of ${data.peers_total + 1}</span>
      </div>
    </div>
    `;
  };
  panels.forEach(renderInto);
}

function startTsPolling() {
  stopTsPolling();
  loadTailscaleStatus();
  _tsPollTimer = setInterval(() => loadTailscaleStatus(), 20000);
}
function stopTsPolling() {
  if (_tsPollTimer) { clearInterval(_tsPollTimer); _tsPollTimer = null; }
}

// ── config summary ──
let _cfgCache = null;
async function loadConfigSummary(force = false) {
  if (!force && _cfgCache) { renderConfigSummary(_cfgCache); return; }
  const data = await api('/api/config/summary');
  if (!data) return;
  _cfgCache = data;
  renderConfigSummary(data);
}
function renderConfigSummary(d) {
  const el = document.getElementById('config-panel');
  if (!el) return;
  const row = (label, val) =>
    `<div class="ts-status-row"><span class="ts-stat-label">${label}</span><span class="ts-stat-val" style="text-align:right;max-width:65%">${val}</span></div>`;
  const section = (title, rows) =>
    `<div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">${title}</div>
      <div class="ts-status-card" style="padding:0 16px">${rows}</div>
    </div>`;
  const auth  = d.auth || {};
  const rt    = d.runtime || {};
  const prefs = d.preferences || {};
  const fmtTtl = s => s >= 86400 ? (s/86400|0)+'d' : s >= 3600 ? (s/3600|0)+'h' : s+'s';
  el.innerHTML =
    section('Auth', [
      row('Username',       escHtml(auth.username || '—')),
      row('Full name',      escHtml(auth.full_name || '—')),
      row('Preferred name', escHtml(auth.display_name || '—')),
      row('Mode',           escHtml(auth.mode || '—')),
      row('Session TTL',    fmtTtl(auth.session_ttl || 0)),
    ].join('')) +
    section(`Locations (${(d.locations||[]).length})`,
      (d.locations||[]).length
        ? d.locations.map(l => `
          <div class="ts-status-row">
            <span class="ts-stat-label">${escHtml(l.label)}</span>
            <span class="ts-stat-val" style="display:flex;align-items:center;gap:5px;font-size:11px">
              <span class="loc-badge ${l.type==='local'?'loc-badge--local':'loc-badge--remote'}">${escHtml(l.type)}</span>
              <span class="loc-badge ${l.writable?'loc-badge--rw':'loc-badge--ro'}">${l.writable?'rw':'ro'}</span>
              <span style="font-family:monospace;color:var(--text3)">${escHtml(l.path)}</span>
            </span>
          </div>`).join('')
        : row('—', 'No locations configured')) +
    section(`Agents (${(d.agents||[]).filter(a=>a.status!=='revoked').length} active)`,
      (d.agents||[]).filter(a=>a.status!=='revoked').length
        ? d.agents.filter(a=>a.status!=='revoked').map(a =>
            row(escHtml(a.name),
              `<span class="loc-badge loc-badge--ro">${escHtml(a.role)}</span>`)).join('')
        : row('—', 'No active agents')) +
    section('Preferences', [
      row('Default location',    escHtml(prefs.default_location || '—')),
      row('Checkpoint interval', (prefs.checkpoint_interval||30)+'s'),
      row('Lease TTL',           fmtTtl(prefs.lease_ttl||300)),
      row('Auto resume',         prefs.auto_resume ? 'yes' : 'no'),
    ].join('')) +
    section('Runtime', [
      row('Runtime dir',      `<span style="font-family:monospace;font-size:10px;word-break:break-all">${escHtml(rt.runtime_dir||'—')}</span>`),
      row('Memory dir',       `<span style="font-family:monospace;font-size:10px;word-break:break-all">${escHtml(rt.memory_dir||'—')}</span>`),
      row('Heartbeat TTL',    `${rt.heartbeat_ttl_min||30}s – ${rt.heartbeat_ttl_max||3600}s`),
      row('Namespaces',       escHtml((rt.namespaces||[]).join(' · '))),
    ].join(''));
}

// ── module system ──
let _currentModule = 'overview';
window._showAllAgentTypes = false;
window._lastAgents = [];
function switchModule(name) {
  if (name !== 'settings') closeSettings();
  const leavingFiles = _currentModule === 'files' && name !== 'files';
  if (leavingFiles && typeof closePreview === 'function') {
    const pp = document.getElementById('previewPanel');
    if (pp && pp.classList.contains('open') && !previewDirty) closePreview();
  }
  if (name === 'settings') {
    const pn = document.getElementById('sa-pwNew');
    const pc = document.getElementById('sa-pwConfirm');
    if (pn) pn.value = '';
    if (pc) pc.value = '';
  }
  _currentModule = name;
  document.querySelectorAll('.mnav-item').forEach(el =>
    el.classList.toggle('active', el.id === 'mnav-' + name));
  document.querySelectorAll('.module-panel').forEach(el =>
    el.classList.toggle('active', el.id === name + '-module' || (name === 'settings' && el.id === 'settingsPanel')));
  const isFiles = name === 'files';
  if (isFiles) closeSettings();
  document.body.classList.toggle('files-active', isFiles);
  if (_overviewPollTimer) { clearInterval(_overviewPollTimer); _overviewPollTimer = null; }
  if (name === 'overview') {
    _overviewPollTimer = setInterval(() => loadOverview(false), 15000);
  }
  ['mainToolbar','fileArea','banner','searchCountBar','selectionToolbar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isFiles ? '' : 'none';
  });
  const loaders = {
    overview: loadOverview, tasks: loadTasks, agents: loadAgents,
    files: loadLocations, locations: loadLocations, schedules: loadSchedules, policies: loadPolicy,
    tools: loadTools, audit: loadAudit, settings: syncSettingsUI,
  };
  if (loaders[name]) loaders[name]();
}
// Backward compat wrappers
function openSettings(tab = 'profile') {
  const moduleMap = { tasks:'tasks', agents:'agents', locations:'locations', policy:'policies', usage:'agents' };
  if (moduleMap[tab]) { switchModule(moduleMap[tab]); return; }
  switchSettingsTab(tab);
  syncSettingsUI();
  const panel = document.getElementById('settingsPanel');
  if (panel) panel.classList.add('open');
}
function closeSettings() {
  stopTsPolling();
  const panel = document.getElementById('settingsPanel');
  if (panel) panel.classList.remove('open');
  const pn = document.getElementById('sa-pwNew');
  const pc = document.getElementById('sa-pwConfirm');
  if (pn) pn.value = '';
  if (pc) pc.value = '';
}
function switchSettingsTab(tab) {
  if (tab === 'usage') tab = 'agents';
  const modules = ['tasks','agents','locations','policy','policies'];
  if (modules.includes(tab)) { switchModule(tab === 'policy' ? 'policies' : tab); return; }
  stopTsPolling();
  document.querySelectorAll('.settings-nav-item').forEach(el =>
    el.classList.toggle('active', el.id === 'snav-' + tab));
  document.querySelectorAll('.settings-page').forEach(el =>
    el.classList.toggle('active', el.id === 'spage-' + tab));
  if (tab === 'changelog') {
    populateChangelog();
    setTimeout(populateChangelog, 0);
  }
}
// ── Overview module ──
async function loadOverview(force=true) {
  const data = await api('/api/overview');
  if (!data) return;
  renderOverview(data);
}
function renderOverview(data) {
  const metrics = [
    { label: 'Active tasks', val: data.active_tasks ?? 0 },
    { label: 'Stalled tasks', val: data.stalled_tasks ?? 0 },
    { label: 'Agents', val: data.agent_count ?? 0 },
    { label: 'Locations', val: data.location_count ?? 0 },
  ];
  const mg = document.getElementById('ov-metrics');
  if (mg) mg.innerHTML = metrics.map(m =>
    `<div class="ov-metric"><div class="ov-metric-val">${escHtml(String(m.val))}</div><div class="ov-metric-label">${escHtml(m.label)}</div></div>`
  ).join('');

  const upd = document.getElementById('ov-updated');
  if (upd) upd.textContent = 'Updated ' + new Date().toLocaleTimeString();

  const issues = [];
  const stalled = Number(data.stalled_tasks || 0);
  const active = Number(data.active_tasks || 0);
  const locations = Number(data.location_count || 0);

  if (stalled > 0) {
    issues.push({
      sev: 'high',
      title: `${stalled} stalled task${stalled>1?'s':''}`,
      detail: 'These jobs likely need intervention.',
      action: 'Open Tasks',
      fn: "switchModule('tasks')",
    });
  }
  if (active === 0) {
    issues.push({
      sev: 'med',
      title: 'No active tasks',
      detail: 'Pipeline is idle. Queue or resume work.',
      action: 'Open Tasks',
      fn: "switchModule('tasks')",
    });
  }
  if (locations < 2) {
    issues.push({
      sev: 'med',
      title: 'Limited device coverage',
      detail: 'Add more locations/agents to unlock cross-device flows.',
      action: 'Open Locations',
      fn: "switchModule('locations')",
    });
  }
  const statusTone = issues.some(i=>i.sev==='high') ? 'var(--danger)' : (issues.length ? 'var(--accent)' : 'var(--ok,#22c55e)');
  const statusText = issues.some(i=>i.sev==='high') ? 'Needs attention now' : (issues.length ? 'Action recommended' : 'Healthy');

  const header = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;padding:10px 12px;background:var(--raised);border:1px solid var(--border);border-radius:8px">
    <div style="font-size:13px;color:var(--text);font-weight:600">${statusText}</div>
    <div style="font-size:12px;color:${statusTone};font-weight:600">${issues.length} issue${issues.length===1?'':'s'}</div>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
    <span style="font-size:11px;color:var(--text2);background:var(--raised);border:1px solid var(--border);border-radius:999px;padding:4px 8px">Tasks ${active}</span>
    <span style="font-size:11px;color:${stalled? 'var(--danger)' : 'var(--text2)'};background:var(--raised);border:1px solid var(--border);border-radius:999px;padding:4px 8px">Stalled ${stalled}</span>
    <span style="font-size:11px;color:var(--text2);background:var(--raised);border:1px solid var(--border);border-radius:999px;padding:4px 8px">Locations ${locations}</span>
    <span style="font-size:11px;color:${diskPct>=85?'var(--danger)':'var(--text2)'};background:var(--raised);border:1px solid var(--border);border-radius:999px;padding:4px 8px">Disk ${diskPct}%</span>
  </div>`;

  const cards = issues.length ? issues.map(i => {
    const border = i.sev === 'high' ? 'var(--danger)' : 'var(--border)';
    return `<div style="padding:10px 12px;background:var(--raised);border:1px solid ${border};border-radius:8px;margin-bottom:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text)">${escHtml(i.title)}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:3px">${escHtml(i.detail)}</div>
        </div>
        <button class="btn btn-ghost" style="font-size:11px;padding:4px 10px" onclick="${i.fn}">${escHtml(i.action)}</button>
      </div>
    </div>`;
  }).join('') : '<div style="color:var(--text3);font-size:13px;padding:8px 0">No urgent issues. System is stable.</div>';

  const cc = document.getElementById('ov-metrics');
  // keep metrics grid already rendered above; action cards now remain primary command-center content
  const anchor = document.getElementById('ov-updated');
  if (anchor) { /* no-op anchor to keep function side-effects explicit */ }
  const host = document.getElementById('overview-module');
  if (host) {
    let body = host.querySelector('.cc-body');
    if (!body) {
      body = document.createElement('div');
      body.className = 'cc-body';
      host.appendChild(body);
    }
    body.innerHTML = header + cards;
  }
}

// ── Schedules module ──
async function loadSchedules() {
  const data = await api('/api/schedules');
  if (!data) return;
  renderSchedules(data.schedules || []);
}
function renderSchedules(jobs) {
  const el = document.getElementById('schedules-list');
  if (!el) return;
  if (!jobs.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px 0">No schedules configured. Add one to get started.</div>';
    return;
  }
  el.innerHTML = jobs.map(j => {
    const enabled = j.enabled !== false;
    return `<div class="sched-card">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px;color:var(--text)">${escHtml(j.name)}</div>
        <div style="font-size:11px;color:var(--text3);font-family:monospace">${escHtml(j.schedule)}</div>
        ${j.target ? `<div style="font-size:11px;color:var(--text2)">&#8594; ${escHtml(j.target)}</div>` : ''}
      </div>
      <div style="font-size:11px;color:var(--text3);flex-shrink:0">${escHtml(j.next_run_display||'—')}</div>
      <span class="task-badge ${enabled ? 'badge-running' : 'badge-cancelled'}" style="flex-shrink:0">${enabled ? 'on' : 'off'}</span>
      <button class="btn btn-ghost" style="font-size:11px;padding:3px 8px;flex-shrink:0" onclick="toggleSchedule('${escHtml(j.id)}',${!enabled})">${enabled ? 'Disable' : 'Enable'}</button>
      <button class="btn btn-danger" style="font-size:11px;padding:3px 8px;flex-shrink:0" onclick="deleteSchedule('${escHtml(j.id)}')">Delete</button>
    </div>`;
  }).join('');
}
function openAddSchedule() {
  document.getElementById('sf-title').textContent = 'New Schedule';
  document.getElementById('sf-id').value = '';
  document.getElementById('sf-name').value = '';
  document.getElementById('sf-schedule').value = '';
  document.getElementById('sf-target').value = '';
  document.getElementById('sf-enabled').checked = true;
  document.getElementById('sf-cron-preview').textContent = '';
  document.getElementById('schedule-form').style.display = '';
}
function cancelScheduleForm() { document.getElementById('schedule-form').style.display = 'none'; }
function previewCron() {
  const expr = document.getElementById('sf-schedule').value.trim();
  const el = document.getElementById('sf-cron-preview');
  if (!el) return;
  if (!expr) { el.textContent = ''; return; }
  const parts = expr.split(/\s+/);
  if (parts.length !== 5) { el.textContent = 'Invalid: needs 5 fields (min hour dom month dow)'; return; }
  el.textContent = 'Valid cron expression';
}
async function saveSchedule() {
  const id = document.getElementById('sf-id').value;
  const body = {
    name: document.getElementById('sf-name').value.trim(),
    schedule: document.getElementById('sf-schedule').value.trim(),
    target: document.getElementById('sf-target').value.trim(),
    enabled: document.getElementById('sf-enabled').checked,
  };
  if (!body.name || !body.schedule) { toast('Name and schedule are required', 'err'); return; }
  const action = id ? 'update_schedule' : 'add_schedule';
  if (id) body.id = id;
  body.action = action;
  const r = await api('/api/schedules', { method: 'POST', body: JSON.stringify(body) });
  if (r && r.ok) { cancelScheduleForm(); loadSchedules(); toast(id ? 'Schedule updated' : 'Schedule added', 'ok'); }
  else toast((r && r.error) || 'Failed to save schedule', 'err');
}
async function deleteSchedule(id) {
  if (!confirm('Delete this schedule?')) return;
  const r = await api('/api/schedules', { method: 'POST', body: JSON.stringify({ action: 'delete_schedule', id }) });
  if (r && r.ok) { loadSchedules(); toast('Schedule deleted', 'ok'); }
  else toast((r && r.error) || 'Failed', 'err');
}
async function toggleSchedule(id, enabled) {
  const action = enabled ? 'enable_schedule' : 'disable_schedule';
  const r = await api('/api/schedules', { method: 'POST', body: JSON.stringify({ action, id }) });
  if (r && r.ok) loadSchedules();
  else toast((r && r.error) || 'Failed', 'err');
}

// ── Tools module ──
async function loadTools() {
  const data = await api('/api/tools');
  if (!data) return;
  renderTools(data.tools || []);
  const policy = data.policy || {};
  const mEl = document.getElementById('tp-mode');
  if (mEl) mEl.value = policy.mode || 'auto';
  const sEl = document.getElementById('tp-strategy');
  if (sEl) sEl.value = policy.strategy || 'balanced';
  const bg = policy.budget_guardrails || {};
  const mt = document.getElementById('tp-max-task');
  if (mt) mt.value = bg.max_tokens_per_task || 8000;
  const md = document.getElementById('tp-max-day');
  if (md) md.value = bg.max_tokens_per_day || 100000;
}
function renderTools(tools) {
  const el = document.getElementById('tools-list');
  if (!el) return;
  if (!tools.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px 0">No tools registered. Register one to get started.</div>';
    return;
  }
  el.innerHTML = tools.map(t => {
    const enabled = t.enabled !== false;
    const tags = (t.capability_tags || []).map(tag => `<span style="background:var(--raised);padding:1px 6px;border-radius:4px;font-size:10px">${escHtml(tag)}</span>`).join(' ');
    return `<div class="tool-card">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px;color:var(--text)">${escHtml(t.name)}${t.provider ? ` <span style="color:var(--text3);font-weight:400;font-size:11px">${escHtml(t.provider)}</span>` : ''}</div>
        <div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">${tags}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">Cost: ${escHtml(t.cost_profile||'unknown')} &middot; Trust: ${escHtml(t.trust_tier||'restricted')}</div>
      </div>
      <span class="task-badge ${enabled ? 'badge-running' : 'badge-cancelled'}" style="flex-shrink:0">${enabled ? 'enabled' : 'disabled'}</span>
      <button class="btn btn-danger" style="font-size:11px;padding:3px 8px;flex-shrink:0" onclick="deleteTool('${escHtml(t.id)}')">Remove</button>
    </div>`;
  }).join('');
}
function openAddTool() {
  document.getElementById('tf-id').value = '';
  document.getElementById('tf-name').value = '';
  document.getElementById('tf-provider').value = '';
  document.getElementById('tf-caps').value = '';
  document.getElementById('tf-cost').value = 'unknown';
  document.getElementById('tf-trust').value = 'restricted';
  document.getElementById('tool-form').style.display = '';
}
function cancelToolForm() { document.getElementById('tool-form').style.display = 'none'; }
async function saveTool() {
  const id = document.getElementById('tf-id').value;
  const name = document.getElementById('tf-name').value.trim();
  if (!name) { toast('Name is required', 'err'); return; }
  const body = {
    action: id ? 'update_tool' : 'add_tool',
    name,
    provider: document.getElementById('tf-provider').value.trim(),
    capability_tags: document.getElementById('tf-caps').value.split(',').map(s=>s.trim()).filter(Boolean),
    cost_profile: document.getElementById('tf-cost').value,
    trust_tier: document.getElementById('tf-trust').value,
  };
  if (id) body.id = id;
  const r = await api('/api/tools', { method: 'POST', body: JSON.stringify(body) });
  if (r && r.ok) { cancelToolForm(); loadTools(); toast(id ? 'Tool updated' : 'Tool registered', 'ok'); }
  else toast((r && r.error) || 'Failed', 'err');
}
async function deleteTool(id) {
  if (!confirm('Remove this tool?')) return;
  const r = await api('/api/tools', { method: 'POST', body: JSON.stringify({ action: 'delete_tool', id }) });
  if (r && r.ok) { loadTools(); toast('Tool removed', 'ok'); }
  else toast((r && r.error) || 'Failed', 'err');
}
async function saveToolPolicy() {
  const body = {
    action: 'update_policy',
    mode: document.getElementById('tp-mode').value,
    strategy: document.getElementById('tp-strategy').value,
    budget_guardrails: {
      max_tokens_per_task: parseInt(document.getElementById('tp-max-task').value) || 8000,
      max_tokens_per_day: parseInt(document.getElementById('tp-max-day').value) || 100000,
    },
  };
  const r = await api('/api/tools', { method: 'POST', body: JSON.stringify(body) });
  if (r && r.ok) toast('Policy saved', 'ok');
  else toast((r && r.error) || 'Failed', 'err');
}

// ── Audit module ──
async function loadAudit() {
  const data = await api('/api/audit?limit=100');
  if (!data) return;
  renderAudit(data.entries || []);
}
function renderAudit(entries) {
  const el = document.getElementById('audit-list');
  if (!el) return;
  if (!entries.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px 0">No audit entries yet.</div>';
    return;
  }
  el.innerHTML = entries.map(e => {
    const ts = e.ts ? new Date(e.ts * 1000).toLocaleString() : '—';
    return `<div class="audit-row">
      <span style="color:var(--text3);flex-shrink:0;min-width:140px">${ts}</span>
      <span style="color:var(--accent);font-weight:500;flex-shrink:0">${escHtml(e.action||'—')}</span>
      <span style="color:var(--text2);flex:1">${escHtml(e.actor||'')}</span>
      ${e.detail ? `<span style="color:var(--text3);font-size:11px">${escHtml(JSON.stringify(e.detail))}</span>` : ''}
    </div>`;
  }).join('');
}

// ── Agents module (module panel version) ──
function openCreateAgent() {
  const f = document.getElementById('agents-module-create-form');
  if (f) { f.style.display = ''; document.getElementById('agents-module-key-box').style.display = 'none'; }
  else { const sf = document.getElementById('agent-form'); if(sf) sf.style.display=''; }
}
function cancelAgentForm2() {
  const f = document.getElementById('agents-module-create-form');
  if (f) f.style.display = 'none';
}
async function createAgent2() {
  const name = document.getElementById('af2-name').value.trim();
  if (!name) { toast('Name required', 'err'); return; }
  const body = {
    action: 'create',
    name,
    type: document.getElementById('af2-type').value,
    role: document.getElementById('af2-role').value,
    runtime_location: document.getElementById('af2-runtime').value,
    model_source: document.getElementById('af2-model-source').value,
    model_id: document.getElementById('af2-model-id').value.trim(),
    agent_type: document.getElementById('af2-agent-type').value,
  };
  const r = await api('/api/agents', { method: 'POST', body: JSON.stringify(body) });
  if (r && r.ok) {
    cancelAgentForm2();
    document.getElementById('agents-module-key-val').textContent = r.key;
    document.getElementById('agents-module-key-box').style.display = '';
    loadAgents();
    toast('Agent created', 'ok');
  } else toast((r && r.error) || 'Failed to create agent', 'err');
}
function copyAgentKey2() {
  const v = document.getElementById('agents-module-key-val').textContent;
  navigator.clipboard.writeText(v).then(() => toast('Key copied', 'ok'));
}

// ── Policies module ──
function saveOrchestrationPolicy() {
  const body = {
    checkpoint_interval: parseInt(document.getElementById('oc-ckpt').value) || 30,
    lease_ttl: parseInt(document.getElementById('oc-ttl').value) || 300,
    context_compression: document.getElementById('oc-compress').value,
    fallback_chain: document.getElementById('oc-fallback').value,
  };
  api('/api/preferences', { method: 'POST', body: JSON.stringify(body) })
    .then(r => { if (r && r.ok) toast('Controls saved', 'ok'); else toast('Failed', 'err'); });
}

function populateChangelog() {
  const el = document.getElementById('changelog-content');
  if (!el) return;

  const fallback = [
    {
      ver: 'v0.12.70',
      date: '2026-02-25',
      notes: [
        "UI: changelog rendering hardening",
        "Fix: What's new panel fallback rendering",
      ],
    },
  ];

  const entries = (typeof CHANGELOG !== 'undefined' && Array.isArray(CHANGELOG) && CHANGELOG.length)
    ? CHANGELOG
    : fallback;

  el.innerHTML = '';
  for (const v of entries) {
    const row = document.createElement('div');
    row.className = 'cl-ver-row';

    const tag = document.createElement('span');
    tag.className = 'cl-vtag';
    tag.textContent = String((v && v.ver) || 'unknown');

    const date = document.createElement('span');
    date.className = 'cl-vdate';
    date.textContent = String((v && v.date) || '');

    row.appendChild(tag);
    row.appendChild(date);
    el.appendChild(row);

    const ul = document.createElement('ul');
    ul.className = 'cl-notes';
    const notes = Array.isArray(v && v.notes) ? v.notes : [];
    if (notes.length) {
      for (const n of notes) {
        const li = document.createElement('li');
        li.textContent = String(n);
        ul.appendChild(li);
      }
    } else {
      const li = document.createElement('li');
      li.textContent = 'No notes for this release.';
      ul.appendChild(li);
    }
    el.appendChild(ul);
  }
}

// ── nodes & mounts ─────────────────────────────────────────────────────────
let _editLocId = null;

async function loadLocations() {
  const data = await api('/api/nodes');
  if (!data) return;
  _lastNodes = data.nodes || [];
  renderNodes(_lastNodes);
  _renderSidebarNodes(_lastNodes, curRoot);
  loadTailscaleStatus();
}

function renderNodes(nodes) {
  const el = document.getElementById('loc-list');
  if (!el) return;

  const configured = Array.isArray(nodes) ? [...nodes] : [];
  const peers = ((_tsCache && _tsCache.data && _tsCache.data.peers) || []);
  const byKey = new Set(configured.map(n => String((n.hostname || n.id || '')).toLowerCase()));
  peers.forEach(p => {
    const host = String(p.name || '').trim();
    if (!host) return;
    const key = host.toLowerCase();
    if (byKey.has(key)) return;
    configured.push({
      id: `peer:${key.replace(/[^a-z0-9.-]+/g, '-')}`,
      label: '',
      type: 'tailscale',
      hostname: host,
      tailscale_ip: p.ip || '',
      mounts: [],
      _virtual: true,
      _peer: p,
    });
    byKey.add(key);
  });

  if (!configured.length) { el.innerHTML = ''; return; }

  const serverHost = String(window._serverHostname || '').toLowerCase();
  const selfTs = (_tsCache && _tsCache.data && _tsCache.data.self) || null;
  const peerByHost = new Map();
  const peerByIp = new Map();
  peers.forEach(p => {
    const h = String(p.name || '').toLowerCase();
    const ip = String(p.ip || '').toLowerCase();
    if (h) peerByHost.set(h, p);
    if (ip) peerByIp.set(ip, p);
  });

  el.innerHTML = `
    <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin:12px 0 8px">Devices</div>
    <div style="display:grid;grid-template-columns:1.3fr 1fr 1fr auto;gap:10px;padding:8px 12px;color:var(--text3);font-size:11px;text-transform:uppercase;letter-spacing:.6px">
      <div title="Canonical device identity discovered from your trusted network.">Device</div><div title="Human-friendly alias used across Porter views.">Nickname</div><div title="Device operating system and private network IP.">OS / IP</div><div></div>
    </div>
    <div style="background:var(--raised);border:1px solid var(--border);border-radius:8px;overflow:hidden">
      ${configured.map((node) => {
        const nType = String(node.type || '').toLowerCase();
        const nId = String(node.id || '').toLowerCase();
        const nHost = String(node.hostname || '').toLowerCase();
        const isSelf = (nType === 'local' || nType === 'vps') && (serverHost && (nId === serverHost || nHost === serverHost));
        const deviceName = isSelf ? `${node.hostname || node.id} (this device)` : (node.hostname || node.id || node.label || 'device');
        const rawLabel = (node.label || '').trim();
        const hostRef = String(node.hostname || node.id || '').trim();
        const nickname = (rawLabel && rawLabel !== hostRef) ? rawLabel : '';
        const peer = node._peer || peerByHost.get(String(node.hostname || '').toLowerCase()) || peerByIp.get(String(node.tailscale_ip || '').toLowerCase());
        const online = isSelf ? true : (!!(peer && peer.online));
        const isRelay = !isSelf && online && !!(peer && peer.relay);
        const nodeStatus = isSelf ? 'online' : (!online ? 'offline' : (isRelay ? 'relay' : 'online'));
        const statusColor = nodeStatus === 'online' ? 'var(--ok,#22c55e)' : (nodeStatus === 'relay' ? 'var(--warn,#f59e0b)' : 'var(--text3)');
        const statusLabel = nodeStatus === 'relay' ? 'relay' : nodeStatus;
        const statusDot   = nodeStatus === 'online' ? 'var(--ok,#22c55e)' : (nodeStatus === 'relay' ? 'var(--warn,#f59e0b)' : 'var(--text3)');
        const os = isSelf ? (selfTs && selfTs.os ? selfTs.os : 'linux') : (peer && peer.os ? peer.os : '—');
        const ip = isSelf ? (selfTs && selfTs.ip ? selfTs.ip : (node.tailscale_ip || '—')) : ((peer && peer.ip) || node.tailscale_ip || '—');
        const action = nickname ? 'Edit nickname' : 'Set nickname';
        return `
          <div style="display:grid;grid-template-columns:1.3fr 1fr 1fr auto;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--border)">
            <div style="min-width:0">
              <div style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${statusDot}" title="${nodeStatus === 'relay' ? 'Via DERP relay — not direct peer-to-peer' : ''}"></span>
                <span>${escHtml(deviceName)}</span>
                <span style="font-size:10px;color:${statusColor};font-weight:500">${statusLabel}</span>
              </div>
            </div>
            <div style="font-size:12px;color:${nickname ? 'var(--accent)' : 'var(--text3)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nickname || '—'}</div>
            <div style="font-size:12px;color:var(--text2);white-space:nowrap">${escHtml(String(os))} · <span style="font-family:monospace">${escHtml(String(ip))}</span></div>
            <div style="display:flex;gap:6px;justify-content:flex-end">
              <button class="btn btn-ghost" style="font-size:11px;padding:4px 9px" onclick="promptDeviceNickname('${escHtml(node.id)}','${escHtml(node.type || 'tailscale')}',${node._virtual ? 'true' : 'false'},'${escHtml(node.hostname || '')}','${escHtml(node.tailscale_ip || '')}','${escHtml(deviceName)}','${escHtml(nickname)}')">${action}</button>
              ${nickname ? `<button class="btn btn-ghost" style="font-size:11px;padding:4px 9px;color:var(--danger)" onclick="clearDeviceNickname('${escHtml(node.id)}','${escHtml(node.type || 'tailscale')}',${node._virtual ? 'true' : 'false'},'${escHtml(node.hostname || '')}','${escHtml(node.tailscale_ip || '')}','${escHtml(deviceName)}')">Remove</button>` : ''}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

async function promptDeviceNickname(nodeId, type, isVirtual, hostname, tailscaleIp, canonicalName, currentNickname) {
  const proposed = prompt(`Set nickname for ${canonicalName}:`, currentNickname || '');
  if (proposed === null) return;
  const nickname = proposed.trim();
  if (!nickname) {
    toast('Nickname unchanged (empty)', 'err');
    return;
  }
  await setDeviceNickname(nodeId, type, isVirtual, hostname, tailscaleIp, canonicalName, nickname);
}

async function clearDeviceNickname(nodeId, type, isVirtual, hostname, tailscaleIp, canonicalName) {
  if (!confirm(`Remove nickname for ${canonicalName}?`)) return;
  await setDeviceNickname(nodeId, type, isVirtual, hostname, tailscaleIp, canonicalName, '');
}

async function setDeviceNickname(nodeId, type, isVirtual, hostname, tailscaleIp, canonicalName, currentNickname) {
  const nickname = (currentNickname || '').trim();
  const hostRef = (hostname || nodeId || '').trim();

  if (isVirtual) {
    const created = await api('/api/nodes', {
      action: 'add_node',
      id: nodeId,
      label: nickname || hostRef,
      type: type || 'tailscale',
      hostname: hostname || '',
      tailscale_ip: tailscaleIp || '',
    });
    if (!created || !created.ok) {
      toast((created && created.error) || 'Failed to create location', 'err');
      return;
    }
    if (!nickname) { loadLocations(); return; }
  }

  const res = await api('/api/nodes', { action: 'update_node', node_id: nodeId, label: nickname || hostRef });
  if (res && res.ok) {
    toast(nickname ? 'Nickname saved' : 'Nickname removed', 'ok');
    loadLocations();
  } else {
    toast((res && res.error) || 'Failed to save nickname', 'err');
  }
}

// node / mount CRUD
async function deleteNode(nodeId, label) {
  if (!confirm(`Remove location "${label}" and all its paths?`)) return;
  const res = await api('/api/nodes', { action: 'delete_node', id: nodeId });
  if (res && res.ok) { toast('Location removed', 'ok'); loadLocations(); }
  else toast((res && res.error) || 'Remove failed', 'err');
}
async function deleteMount(nodeId, mountId, label) {
  if (!confirm(`Remove mount "${label}"?`)) return;
  const res = await api('/api/nodes', { action: 'delete_mount', node_id: nodeId, mount_id: mountId });
  if (res && res.ok) { toast('Mount removed', 'ok'); loadLocations(); }
  else toast((res && res.error) || 'Remove failed', 'err');
}
function openAddMount(nodeId) {
  document.getElementById('lf-edit-id').value = '';
  document.getElementById('nm-node-id').value = nodeId;
  document.getElementById('lf-label').value = '';
  document.getElementById('lf-path').value = '';
  document.getElementById('lf-status').textContent = '';
  document.getElementById('loc-form').style.display = 'none';
  document.getElementById('mount-form').style.display = 'block';
}
function openEditMount(nodeId, mountId, label, path) {
  document.getElementById('nm-node-id').value = nodeId;
  document.getElementById('nm-mount-id').value = mountId;
  document.getElementById('nm-label').value = label;
  document.getElementById('nm-path').value = path;
  document.getElementById('mount-form').style.display = 'block';
}
function cancelMountForm() { document.getElementById('mount-form').style.display = 'none'; }
async function saveMountForm() {
  const nodeId  = document.getElementById('nm-node-id').value;
  const mountId = document.getElementById('nm-mount-id').value;
  const label   = document.getElementById('nm-label').value.trim();
  const path    = document.getElementById('nm-path').value.trim();
  if (!label || !path) { toast('Label and path required', 'err'); return; }
  const action = mountId ? 'update_mount' : 'add_mount';
  const body   = mountId
    ? { action, node_id: nodeId, mount_id: mountId, updates: { label, path } }
    : { action, node_id: nodeId, mount: { label, path } };
  const res = await api('/api/nodes', body);
  if (res && res.ok) {
    cancelMountForm(); toast(mountId ? 'Mount updated' : 'Mount added', 'ok'); loadLocations();
  } else toast((res && res.error) || 'Save failed', 'err');
}
async function testMountPath() {
  const path = document.getElementById('nm-path').value.trim();
  if (!path) return;
  const res = await api('/api/locations/test', { path });
  const st  = document.getElementById('nm-status');
  if (!st) return;
  if (res && res.exists) st.textContent = res.writable ? '✓ Found, writable' : '✓ Found, read-only';
  else st.textContent = '✗ Path not found on server';
}

function openAddLocation() {
  document.getElementById('lf-status').textContent = '';
  document.getElementById('lf-ts-picker').style.display = 'none';
  document.getElementById('loc-form').style.display = 'block';
}

async function addLocalNode() {
  const hn = (window._serverHostname || 'local');
  const res = await api('/api/nodes', { action: 'add_node', id: hn, label: hn, type: 'local', hostname: hn });
  if (res && res.ok) {
    toast('Location added — now add paths', 'ok');
    cancelLocationForm(); loadLocations();
  } else toast((res && res.error) || 'Failed', 'err');
}

async function addVpsNode() {
  const hn = (window._serverHostname || 'vps');
  const label = `VPS (${hn})`;
  const res = await api('/api/nodes', { action: 'add_node', id: hn + '-vps', label, type: 'vps', hostname: hn });
  if (res && res.ok) {
    toast('VPS location added — now add paths', 'ok');
    cancelLocationForm(); loadLocations();
  } else toast((res && res.error) || 'Failed', 'err');
}

function addTailscaleNode() {
  document.getElementById('lf-ts-picker').style.display = 'block';
  loadTailscalePeers();
}

async function addTailscaleNodeFromPeer() {
  const sel = document.getElementById('lf-ts-peer');
  const ip  = sel.value;
  const opt = sel.selectedOptions[0];
  const name = opt ? (opt.getAttribute('data-name') || ip) : ip;
  if (!ip) { toast('Select a peer first', 'err'); return; }
  const res = await api('/api/nodes', { action: 'add_node', id: name, label: name, type: 'tailscale', hostname: name, tailscale_ip: ip });
  if (res && res.ok) {
    toast('Tailscale location added — now add paths', 'ok');
    cancelLocationForm(); loadLocations();
  } else toast((res && res.error) || 'Failed', 'err');
}

function quickPick(label, path) {
  document.getElementById('nm-label').value = label;
  document.getElementById('nm-path').value  = path;
}

async function loadTailscalePeers() {
  const sel = document.getElementById('lf-ts-peer');
  const st  = document.getElementById('lf-ts-status');
  sel.innerHTML = '<option value="">Loading…</option>';
  st.textContent = '';
  const data = await api('/api/tailscale/peers');
  if (!data || !data.available) {
    sel.innerHTML = '<option value="">No peers found — enter IP manually</option>';
    st.style.color = 'var(--text3)';
    st.textContent = data && data.error ? '⚠ ' + data.error + '. Enter the device IP/hostname manually below.' : '';
    return;
  }
  const peers = data.peers || [];
  if (!peers.length) {
    sel.innerHTML = '<option value="">No peers on tailnet — enter IP manually</option>';
    return;
  }
  sel.innerHTML = '<option value="">— Select device —</option>' +
    peers.map(p => {
      const online = p.online ? '● ' : '○ ';
      return `<option value="${escHtml(p.ip)}" data-name="${escHtml(p.name)}">${online}${escHtml(p.name || p.ip)} (${escHtml(p.ip)}) ${p.os ? '· ' + escHtml(p.os) : ''}</option>`;
    }).join('');
  st.style.color = 'var(--success)';
  st.textContent = `✓ ${peers.length} device${peers.length !== 1 ? 's' : ''} on tailnet`;
}

function onTsPeerSelect() {
  const sel = document.getElementById('lf-ts-peer');
  const btn = document.getElementById('lf-ts-add-btn');
  if (btn) btn.disabled = !sel.value;
}

function cancelLocationForm() {
  document.getElementById('loc-form').style.display = 'none';
}

// node rename (inline prompt)
function openEditNode(nodeId, currentLabel, currentType) {
  const newLabel = prompt('Rename location:', currentLabel);
  if (newLabel === null) return;  // cancelled
  const trimmed = newLabel.trim();
  if (!trimmed) { toast('Label cannot be empty', 'err'); return; }
  saveEditNode(nodeId, trimmed, currentType);
}
async function saveEditNode(nodeId, label, type) {
  const res = await api('/api/nodes', { action: 'update_node', node_id: nodeId, label, type });
  if (res && res.ok) { toast('Location updated', 'ok'); loadLocations(); }
  else toast((res && res.error) || 'Update failed', 'err');
}

// expose server hostname for addLocalNode
fetch('/api/nodes').then(r=>r.json()).then(d=>{
  if (d.nodes && d.nodes[0]) window._serverHostname = d.nodes[0].hostname || d.nodes[0].id;
}).catch(()=>{});

// ── agents ──────────────────────────────────────────────────────────────────

async function loadAgents() {
  const data = await api('/api/agents');
  if (!data) return;
  window._cachedAgents = data.agents || [];
  window._lastAgents = data.agents || [];
  renderAgents(data.agents || []);
  loadUsage();
  loadAgentFleet();
}


async function loadAgentFleet() {
  const data = await api('/api/agent-fleet');
  const el = document.getElementById('agents-fleet-summary');
  if (!el) return;
  if (!data) { el.textContent = 'Lifecycle policy unavailable'; return; }
  window._fleetState = data;
  const txt = `channel=${data.channel} · current=${data.current_version} · min=${data.min_compatible} · auto-update=${data.auto_update ? 'on' : 'off'} · rollout=${data.rollout}% · devices=${data.device_count}`;
  el.textContent = txt;
  const ch=document.getElementById('fleet-channel'); if (ch) ch.value = data.channel || 'stable';
  const cur=document.getElementById('fleet-current'); if (cur) cur.value = data.current_version || '';
  const mn=document.getElementById('fleet-min'); if (mn) mn.value = data.min_compatible || '';
  const ro=document.getElementById('fleet-rollout'); if (ro) ro.value = (data.rollout ?? 100);
  const au=document.getElementById('fleet-auto'); if (au) au.checked = !!data.auto_update;
}

async function saveAgentFleetPolicy() {
  const body = {
    action: 'set_policy',
    channel: document.getElementById('fleet-channel')?.value || 'stable',
    current_version: (document.getElementById('fleet-current')?.value || '').trim(),
    min_compatible: (document.getElementById('fleet-min')?.value || '').trim(),
    rollout: parseInt(document.getElementById('fleet-rollout')?.value || '100', 10),
    auto_update: !!document.getElementById('fleet-auto')?.checked,
  };
  const res = await api('/api/agent-fleet', body);
  if (res && res.ok) {
    toast('Fleet policy saved', 'ok');
    loadAgentFleet();
  } else {
    toast((res && res.error) || 'Failed to save fleet policy', 'err');
  }
}

async function showBootstrapCmd(osName) {
  const data = await api(`/api/agent/bootstrap?os=${enc(osName)}&arch=x64`);
  if (!data || !data.install_command) return;
  const cmd = data.install_command;
  const res = prompt(`${osName.toUpperCase()} bootstrap command (copy and run on target device):`, cmd);
  if (res !== null) {
    navigator.clipboard.writeText(cmd).then(() => toast('Bootstrap command copied', 'ok')).catch(()=>{});
  }
}

function renderAgents(agents) {
  const el = document.getElementById('agent-list');
  const el2 = document.getElementById('agents-module-list');
  const noAgents = '<div style="color:var(--text3);font-size:13px;padding:8px 0">No agents yet.</div>';
  if (!agents.length) {
    if (el) el.innerHTML = noAgents;
    if (el2) el2.innerHTML = noAgents;
    return;
  }
  const usageMap = {};
  if (window._currentUsage) {
    window._currentUsage.forEach(u => usageMap[u.agent_id] = u);
  }
  const roleColor = { viewer:'var(--text3)', writer:'var(--text2)', operator:'var(--accent)', admin:'var(--danger)' };
  const agentHtml = agents.map(a => {
    const u = usageMap[a.id];
    const uHtml = u ? ` &middot; <span style="color:${STATUS_COLOR[u.status]||'var(--text3)'};font-weight:600">${u.usage_percent}%</span>` : '';
    const keyRow = a.raw_key
      ? `<div style="display:flex;align-items:center;gap:6px;margin-top:6px">
           <code style="flex:1;font-size:11px;background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:4px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text2)">${escHtml(a.raw_key)}</code>
           <button class="btn btn-ghost" style="font-size:11px;padding:3px 8px;flex-shrink:0" onclick="copyText('${escHtml(a.raw_key)}',this)">Copy</button>
         </div>`
      : `<div style="font-size:11px;color:var(--text3);margin-top:5px;font-style:italic">Key hidden — rotate to reveal</div>`;
    const concurrencyRow = `
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
        <span style="font-size:12px;color:var(--text2);flex-shrink:0">Max concurrent:</span>
        <input id="conc-${a.id}" type="number" min="0" value="${a.max_concurrent||0}"
               style="width:50px;background:var(--bg);border:1px solid var(--border2);border-radius:5px;padding:3px 7px;font-size:12px;color:var(--text);font-family:inherit">
        <button class="btn btn-ghost" style="font-size:11px;padding:3px 8px" onclick="saveAgentConcurrency('${a.id}')">Save</button>
        <span style="font-size:11px;color:var(--text3)">(0=∞)</span>
      </div>`;
    return `
    <div style="padding:10px 12px;background:var(--raised);border-radius:8px;margin-bottom:8px;border:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:10px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6" y2="6"/><line x1="6" y1="18" x2="6" y2="18"/></svg>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--text)">${escHtml(a.name)}${uHtml}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${escHtml(a.type)} · <span style="color:${roleColor[a.role]||'var(--text3)'}">${a.role}</span> · <span style="font-family:monospace">${a.id}</span></div>
        </div>
        <button class="btn btn-ghost" style="font-size:12px;padding:4px 10px" onclick="doRotateKey('${a.id}','${escHtml(a.name)}')">Rotate key</button>
        <button class="btn btn-ghost" style="font-size:12px;padding:4px 10px;color:var(--danger)" onclick="doRevokeAgent('${a.id}','${escHtml(a.name)}')">Revoke</button>
      </div>
      ${keyRow}
      ${concurrencyRow}
    </div>`;
  }).join('');
  if (el) el.innerHTML = agentHtml;
  if (el2) el2.innerHTML = agentHtml;
}

function openCreateAgent() {
  document.getElementById('agent-key-box').style.display = 'none';
  document.getElementById('agent-form').style.display = 'block';
  document.getElementById('af-name').value = '';
}

function cancelAgentForm() {
  document.getElementById('agent-form').style.display = 'none';
}

async function createAgent() {
  const name = document.getElementById('af-name').value.trim();
  const type = document.getElementById('af-type').value;
  const role = document.getElementById('af-role').value;
  if (!name) { toast('Name is required', 'err'); return; }
  const res = await api('/api/agents', { action: 'create', name, type, role });
  if (res && res.ok) {
    cancelAgentForm();
    document.getElementById('agent-key-val').textContent = res.key;
    document.getElementById('agent-key-box').style.display = 'block';
    toast('Agent created', 'ok');
    loadAgents();
  } else {
    toast((res && res.error) || 'Create failed', 'err');
  }
}

function copyAgentKey() {
  const val = document.getElementById('agent-key-val').textContent;
  navigator.clipboard.writeText(val).then(() => toast('Key copied', 'ok'));
}

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
    toast('Key copied', 'ok');
  });
}

async function doRotateKey(id, name) {
  if (!confirm(`Rotate key for "${name}"? The old key will stop working immediately.`)) return;
  const res = await api('/api/agents/rotate-key', { id });
  if (res && res.ok) {
    document.getElementById('agent-key-val').textContent = res.key;
    document.getElementById('agent-key-box').style.display = 'block';
    toast('Key rotated — copy it now', 'ok');
  } else toast((res && res.error) || 'Rotate failed', 'err');
}

async function doRevokeAgent(id, name) {
  if (!confirm(`Revoke agent "${name}"? This cannot be undone.`)) return;
  const res = await api('/api/agents', { action: 'revoke', id });
  if (res && res.ok) { toast('Agent revoked', 'ok'); loadAgents(); }
  else toast((res && res.error) || 'Revoke failed', 'err');
}

async function saveAgentConcurrency(agentId) {
  const val = parseInt(document.getElementById('conc-' + agentId).value, 10);
  if (isNaN(val) || val < 0) { toast('Must be a number ≥ 0', 'err'); return; }
  const res = await api('/api/tasks', { action: 'update_agent_concurrency', agent_id: agentId, max_concurrent: val });
  if (res && res.ok) toast('Concurrency saved', 'ok');
  else toast((res && res.error) || 'Save failed', 'err');
}

// ── task operations ───────────────────────────────────────────────────────

function _tsAgo(unixTs) {
  if (!unixTs) return 'never';
  const secs = Math.floor(Date.now() / 1000 - unixTs);
  if (secs < 60)   return secs + 's ago';
  if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
  if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
  return Math.floor(secs / 86400) + 'd ago';
}

async function loadTasks() {
  const data = await api('/api/tasks');
  if (!data) return;
  renderTasks(data.tasks || []);
}

function renderTasks(tasks) {
  const el = document.getElementById('tasks-list');
  const el2 = document.getElementById('tasks-module-list');
  const noTasks = '<div style="color:var(--text2);padding:20px 0">No tasks found.</div>';
  if (!tasks.length) {
    if (el) el.innerHTML = noTasks;
    if (el2) el2.innerHTML = noTasks;
    return;
  }

  const card = (t) => {
    const state = t.state || 'unknown';
    const badgeCls = 'task-badge badge-' + state;
    const canPause  = state === 'running' || state === 'stalled';
    const canResume = state === 'paused';
    const canCancel = state !== 'complete' && state !== 'cancelled';
    const ownerDisplay = t.owner
      ? `<span style="font-weight:500">${escHtml(t.owner_name || t.owner)}</span>${t.owner_name && t.owner_name !== t.owner ? ` <span style="font-family:monospace;color:var(--text3);font-size:11px">(${escHtml(t.owner)})</span>` : ''}`
      : `<span style="color:var(--text3);font-style:italic">Unassigned</span>`;

    let primaryAction = '';
    if (state === 'stalled') primaryAction = `<button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="taskAction('resume','${t.task_id}')">Recover</button>`;
    else if (canResume) primaryAction = `<button class="btn btn-sm btn-ghost" onclick="taskAction('resume','${t.task_id}')">Resume</button>`;
    else if (canPause) primaryAction = `<button class="btn btn-sm btn-ghost" onclick="taskAction('pause','${t.task_id}')">Pause</button>`;

    const secondary = canCancel
      ? `<button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="taskAction('cancel','${t.task_id}')">Cancel</button>`
      : '';

    const hbAgoSecs = t.last_heartbeat ? Math.floor(Date.now()/1000 - t.last_heartbeat) : null;
    const recommendCancel = (state === 'running' || state === 'stalled') && hbAgoSecs !== null && hbAgoSecs > 600;
    const nextHint = recommendCancel
      ? 'Next: cancel stale task and relaunch clean'
      : (state === 'stalled'
          ? 'Next: click Recover'
          : (state === 'running' ? 'Next: monitor or pause' : (state === 'paused' ? 'Next: resume or cancel' : (state === 'complete' ? 'Next: clear completed' : 'Next: review'))));

    const stallInfo = (state === 'stalled' && t.stall_reason)
      ? `<div style="margin-top:6px;font-size:11px;color:#b91c1c;background:#fee2e2;border-radius:4px;padding:4px 8px">⚠ ${escHtml(t.stall_reason)}</div>`
      : '';

    return `<div class="task-card">
      <div class="task-hdr">
        <span class="task-id">${escHtml(t.task_id)}</span>
        <span class="${badgeCls}">${state}</span>
      </div>
      <div class="task-meta">
        <span>Owner: ${ownerDisplay}</span>
        <span>Steps: ${t.step_count || 0}</span>
        <span>Heartbeat: ${_tsAgo(t.last_heartbeat)}</span>
        ${t.started_at ? '<span>Started: ' + _tsAgo(t.started_at) + '</span>' : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px"><div style="font-size:11px;color:var(--text3)">${nextHint}</div>${recommendCancel ? '<span class="task-badge badge-stalled" title="Stale heartbeat detected">recommend cancel</span>' : ''}</div>
      ${stallInfo}
      ${(primaryAction || secondary) ? `<div class="task-actions">${primaryAction}${secondary}</div>` : ''}
    </div>`;
  };

  const needsAction = tasks.filter(t => ['stalled','paused'].includes(t.state));
  const inProgress = tasks.filter(t => t.state === 'running');
  const done = tasks.filter(t => ['complete','cancelled'].includes(t.state));

  const section = (title, items, subtitle='') => {
    if (!items.length) return '';
    return `<div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">${title}</div>
        <div style="font-size:11px;color:var(--text3)">${items.length}</div>
      </div>
      ${subtitle ? `<div style="font-size:12px;color:var(--text3);margin-bottom:6px">${subtitle}</div>` : ''}
      ${items.map(card).join('')}
    </div>`;
  };

  const html =
    section('Needs action', needsAction, 'Handle these first.') +
    section('In progress', inProgress, 'Active execution lane.') +
    section('Completed', done, 'Archive lane — clear periodically.');

  const g = document.getElementById('tasks-guidance');
  if (g) {
    const top = needsAction[0];
    const immediate = top
      ? (top.state === 'stalled'
          ? `Top priority: recover stalled task ${top.task_id}.`
          : `Top priority: resume or cancel paused task ${top.task_id}.`)
      : (inProgress.length ? 'No blockers. Monitor in-progress tasks.' : 'Queue is clear. Start new work when ready.');
    g.innerHTML = `
      <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:6px">How to use Tasks</div>
      <div style="font-size:12px;color:var(--text3);line-height:1.45">
        <div style="margin-bottom:6px"><strong>Right now:</strong> ${escHtml(immediate)}</div>
        1) <strong>Needs action</strong>: resolve these first (Recover/Resume/Cancel).<br>
        2) <strong>In progress</strong>: monitor active work; pause only if needed.<br>
        3) <strong>Completed</strong>: clear finished items to keep the queue clean.
      </div>`;
  }

  if (el) el.innerHTML = html || noTasks;
  if (el2) el2.innerHTML = html || noTasks;
}


async function taskAction(action, taskId) {
  const res = await api('/api/tasks', { action, task_id: taskId });
  if (res && res.ok) { loadTasks(); }
  else toast((res && res.error) || 'Action failed', 'err');
}

async function clearCompletedTasks() {
  const res = await api('/api/tasks', { action: 'clear_completed' });
  if (res && res.ok) { toast(`Cleared ${res.removed} task(s)`, 'ok'); loadTasks(); }
  else toast((res && res.error) || 'Clear failed', 'err');
}

// ── policy presets ────────────────────────────────────────────────────────

function _policyIcon(id) {
  const icons = {
    'cost-sensitive': '💰',
    'balanced':       '⚖️',
    'speed-first':    '⚡',
    'quality-first':  '🏆',
    'local-first':    '🖥️',
  };
  return icons[id] || '🔧';
}

async function loadPolicy() {
  const data = await api('/api/policy/presets');
  if (!data) return;
  renderPolicy(data.presets || []);
}

function renderPolicy(presets) {
  const html = presets.map(p => `
    <div class="policy-card ${p.active ? 'active' : ''}" onclick="setPolicy('${p.id}')">
      <div class="policy-name">${_policyIcon(p.id)} ${escHtml(p.label)}</div>
      <div class="policy-desc">${escHtml(p.description)}</div>
      ${p.active ? '<span class="policy-active-pill">Active</span>' : ''}
    </div>`).join('');
  const el = document.getElementById('policy-presets-grid');
  if (el) el.innerHTML = html;
  const el2 = document.getElementById('policy-presets-grid-main');
  if (el2) el2.innerHTML = html;
}

async function setPolicy(id) {
  const res = await api('/api/preferences', { policy_preset: id });
  if (res && res.ok) { toast('Policy updated', 'ok'); loadPolicy(); }
  else toast((res && res.error) || 'Update failed', 'err');
}

// ── agent usage tracker ──────────────────────────────────────────────────
const STATUS_COLOR = {
  available:'var(--accent)', degraded:'#f5a623', rate_limited:'#e55', exhausted:'#c00', unknown:'var(--text3)'
};
const STATUS_LABEL = {
  available:'Available', degraded:'Degraded', rate_limited:'Rate limited', exhausted:'Exhausted', unknown:'Unknown'
};

async function loadUsage() {
  const data = await api('/agent-usage/current');
  if (!data) return;
  window._currentUsage = data.agents || [];
  renderUsage(data.agents || []);
  if (window._lastAgents) renderAgents(window._lastAgents);
}

function renderUsage(agents) {
  const el = document.getElementById('usage-panel');
  const el2 = document.getElementById('agents-module-usage');
  const noUsage = '<div style="color:var(--text3);font-size:13px">No usage data reported yet.</div>';
  if (!agents.length) {
    if (el) el.innerHTML = noUsage;
    if (el2) el2.innerHTML = noUsage;
    return;
  }
  const html = agents.map(a => {
    const color  = STATUS_COLOR[a.status] || STATUS_COLOR.unknown;
    const label  = STATUS_LABEL[a.status] || 'Unknown';
    const pct    = a.usage_percent != null ? `${a.usage_percent}%` : '—';
    const resets = a.window_resets_at ? _usageCountdown(a.window_resets_at) : '';
    const snapped = a.captured_at ? _usageAgo(a.captured_at) : 'never';
    return `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--raised);border-radius:8px;margin-bottom:8px;border:1px solid var(--border)">
      <div style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:13px;font-weight:600">${escHtml(a.name)}</span>
          <span style="font-size:11px;font-weight:600;color:${color}">${label}</span>
          <span style="font-size:11px;color:var(--text3)">${pct}</span>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">
          ${resets ? `Resets ${resets} · ` : ''}Updated ${snapped}
        </div>
      </div>
    </div>`;
  }).join('');
  if (el) el.innerHTML = html;
  if (el2) el2.innerHTML = html;
}

function _usageCountdown(isoStr) {
  const ms = new Date(isoStr) - Date.now();
  if (isNaN(ms) || ms < 0) return 'soon';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}
function _usageAgo(isoStr) {
  const ms = Date.now() - new Date(isoStr);
  if (isNaN(ms) || ms < 0) return 'just now';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m/60)}h ago`;
}

async function parseUsageRaw() {
  const raw = document.getElementById('us-raw').value.trim();
  if (!raw) return;
  const agentEl = document.getElementById('us-agent');
  const provider = agentEl.options[agentEl.selectedIndex]?.dataset?.type || 'claude_code';
  const res = await api('/agent-usage/parse', { raw, provider });
  if (!res) return;
  if (res.status)        document.getElementById('us-status').value = res.status;
  if (res.usage_percent != null) document.getElementById('us-pct').value = res.usage_percent;
  if (res.window_resets_at) document.getElementById('us-resets').value = res.window_resets_at;
}

function openUsageSnapshot() {
  // populate agent dropdown
  const sel = document.getElementById('us-agent');
  sel.innerHTML = '';
  (window._cachedAgents || []).forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id; opt.textContent = a.name; opt.dataset.type = a.type;
    sel.appendChild(opt);
  });
  document.getElementById('us-raw').value = '';
  document.getElementById('us-status').value = 'unknown';
  document.getElementById('us-pct').value = '';
  document.getElementById('us-resets').value = '';
  document.getElementById('usage-snap-form').style.display = 'block';
}
function cancelUsageSnapshot() { document.getElementById('usage-snap-form').style.display = 'none'; }
async function submitUsageSnapshot() {
  const agentEl  = document.getElementById('us-agent');
  const agent_id = agentEl.value;
  if (!agent_id) { toast('Select an agent', 'err'); return; }
  const provider    = agentEl.options[agentEl.selectedIndex]?.dataset?.type || 'unknown';
  const status      = document.getElementById('us-status').value;
  const usage_pct   = document.getElementById('us-pct').value;
  const resets_at   = document.getElementById('us-resets').value.trim() || undefined;
  const res = await api('/agent-usage/snapshot', {
    agent_id, provider, status,
    usage_percent: usage_pct !== '' ? parseInt(usage_pct) : undefined,
    window_resets_at: resets_at,
    source_type: 'manual',
  });
  if (res && res.ok) {
    cancelUsageSnapshot(); toast('Snapshot saved', 'ok'); loadUsage();
  } else toast((res && res.error) || 'Save failed', 'err');
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
  document.getElementById('sa-full-name').value = data.full_name || '';
  document.getElementById('sa-name').value = data.display_name || '';
  document.getElementById('sa-email').value = data.email || '';
}

async function saveAccount() {
  const full_name = document.getElementById('sa-full-name').value.trim();
  const display_name = document.getElementById('sa-name').value.trim();
  const email = document.getElementById('sa-email').value.trim();
  if (!display_name) { toast('Preferred name cannot be empty', 'err'); return; }
  const res = await api('/api/profile/update', { full_name, display_name, email });
  if (res && res.ok) {
    currentUser.full_name = res.full_name;
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
  const newPw   = document.getElementById('sa-pwNew').value;
  const confirm = document.getElementById('sa-pwConfirm').value;
  if (!newPw || !confirm) { toast('Enter and confirm your new password', 'err'); return; }
  if (newPw.length < 8) { toast('New password must be at least 8 characters', 'err'); return; }
  if (newPw !== confirm) { toast('Passwords do not match', 'err'); return; }
  const res = await api('/api/password/change', { new: newPw });
  if (res && res.ok) {
    document.getElementById('sa-pwNew').value = '';
    document.getElementById('sa-pwConfirm').value = '';
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
function _locIcon(l) {
  const lbl = (l.label || '').toLowerCase();
  const type = l.type || 'local';
  if (type === 'tailscale' || type === 'remote') {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><line x1="12" y1="7" x2="5" y2="17"/><line x1="12" y1="7" x2="19" y2="17"/></svg>';
  }
  // vps falls through to folder icons below (same as local)
  if (lbl.includes('web') || lbl.includes('site') || lbl.includes('www')) {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>';
  }
  return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>';
}
function _renderSidebarNodes(nodes, activeRoot) {
  const targets = [document.getElementById('locations'), document.getElementById('locations-secondary')].filter(Boolean);
  if (!targets.length) return;
  const serverHost = String(window._serverHostname || '').toLowerCase();

  const configured = Array.isArray(nodes) ? [...nodes] : [];
  const peers = ((_tsCache && _tsCache.data && _tsCache.data.peers) || []);
  const byKey = new Set(configured.map(n => String((n.hostname || n.id || '')).toLowerCase()));
  peers.forEach(p => {
    const host = String(p.name || '').trim();
    if (!host) return;
    const key = host.toLowerCase();
    if (byKey.has(key)) return;
    configured.push({
      id: `peer:${key.replace(/[^a-z0-9.-]+/g, '-')}`,
      label: host,
      type: 'tailscale',
      hostname: host,
      tailscale_ip: p.ip || '',
      mounts: [],
      _virtual: true,
      _online: !!p.online,
      _peer: p,
    });
    byKey.add(key);
  });

  const sortedNodes = [...configured].sort((a,b) => {
    const aSelf = _isSelfNode(a) ? 0 : 1;
    const bSelf = _isSelfNode(b) ? 0 : 1;
    if (aSelf !== bSelf) return aSelf - bSelf;
    const aOn = (a._virtual ? (a._online !== false) : isTailscaleNodeConnected(a)) ? 0 : 1;
    const bOn = (b._virtual ? (b._online !== false) : isTailscaleNodeConnected(b)) ? 0 : 1;
    if (aOn !== bOn) return aOn - bOn;
    const an = String(a.label || a.hostname || a.id || '').toLowerCase();
    const bn = String(b.label || b.hostname || b.id || '').toLowerCase();
    return an.localeCompare(bn);
  });

  targets.forEach(el => {
    el.innerHTML = '';
    sortedNodes.forEach(node => {
      const mounts = (node.mounts || []).filter(m => m.visible !== false);
      const nType = String(node.type || '').toLowerCase();
      const nId = String(node.id || '').toLowerCase();
      const nHost = String(node.hostname || '').toLowerCase();
      const isSelf = (nType === 'local' || nType === 'vps') && (serverHost && (nId === serverHost || nHost === serverHost));
      const hostRef = String(node.hostname || node.id || '').trim();
      const rawLabel = String(node.label || '').trim();
      const nickname = (rawLabel && rawLabel !== hostRef) ? rawLabel : '';
      const displayName = isSelf
        ? `${nickname || (node.hostname || node.id)} (this device)`
        : (nickname || node.label || node.id);
      const tsStatus = node._virtual ? (node._online !== false ? 'online' : 'offline') : getTailscaleNodeStatus(node);
      const connected = tsStatus !== 'offline';
      const isRemote = !_isSelfNode(node);
      const hasPaths = mounts.length > 0;
      const canBrowse = connected && hasPaths;
      const canConnect = connected && !hasPaths;

      const tsStatusColor = tsStatus === 'online' ? 'var(--ok,#22c55e)' : (tsStatus === 'relay' ? 'var(--warn,#f59e0b)' : 'var(--text3)');
      const tsStatusLabel = tsStatus === 'online' ? 'TS online' : (tsStatus === 'relay' ? 'TS relay' : 'TS offline');
      const tsStatusTitle = tsStatus === 'relay'
        ? 'Tailscale connected via relay (DERP) — not direct. Connection works but may be slower.'
        : (tsStatus === 'online' ? 'Tailscale direct connection' : 'Tailscale offline');

      const card = document.createElement('div');
      card.className = 'node-hdr ' + tsStatus;
      card.innerHTML = `<div class="node-head"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg><span class="node-title" title="${escHtml(displayName)}">${escHtml(displayName)}</span></div><div class="node-meta" style="color:${tsStatusColor}" title="${tsStatusTitle}">${tsStatusLabel}</div>`;

      const actionBtn = document.createElement('button');
      actionBtn.className = 'btn btn-ghost';
      actionBtn.style.cssText = 'margin-left:6px;font-size:10px;padding:1px 7px';
      actionBtn.title = canBrowse ? 'Browse connected paths' : (canConnect ? 'Connect first path' : 'Device offline');
      actionBtn.textContent = canBrowse ? 'Browse' : (canConnect ? 'Connect' : 'Off');
      actionBtn.disabled = !canBrowse && !canConnect;
      actionBtn.style.opacity = (canBrowse || canConnect) ? '1' : '.55';
      actionBtn.onclick = (e) => {
        e.stopPropagation();
        if (canBrowse) {
          const first = mounts[0];
          if (first) navigate(first.id, '');
          return;
        }
        if (canConnect) {
          if (_isSelfNode(node)) quickExposePath(node);
          else connectRemoteEndpoint(node);
        }
      };
      card.appendChild(actionBtn);
      el.appendChild(card);

      if (!mounts.length) {
        const empty = document.createElement('div');
        empty.className = 'loc mount-item';
        empty.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg><span class="loc-name">${connected ? 'No path connected' : 'Offline'}</span>`;
        empty.style.opacity = '.78';
        empty.onclick = () => {
          if (canConnect) {
            if (_isSelfNode(node)) quickExposePath(node);
            else connectRemoteEndpoint(node);
          }
        };
        el.appendChild(empty);
        return;
      }

      mounts.forEach(m => {
        rootMeta[m.id] = { path: m.path || '', label: m.label || m.id, node: displayName, type: node.type || 'local', hostname: node.hostname || '', tailscale_ip: node.tailscale_ip || '' };
        const div = document.createElement('div');
        div.className = 'loc mount-item' + (m.id === activeRoot ? ' active' : '');
        div.dataset.root = m.id;
        div.innerHTML = `${_locIcon({...m, type: node.type})}<span class="loc-name" title="${escHtml(m.label)}">${escHtml(m.label)}</span><button class="btn btn-ghost" style="margin-left:auto;font-size:10px;padding:1px 6px" title="Remove path" onclick="event.stopPropagation(); deleteMount('${esc(node.id)}','${esc(m.id)}','${esc(m.label)}')">Delete</button>`;
        div.onclick = () => navigate(m.id, '');
        el.appendChild(div);
      });
    });
  });
}

function _isSelfNode(node) {
  const nType = String(node.type || '').toLowerCase();
  const nId = String(node.id || '').toLowerCase();
  const nHost = String(node.hostname || '').toLowerCase();
  const serverHost = String(window._serverHostname || '').toLowerCase();
  return (nType === 'local' || nType === 'vps') && !!serverHost && (nId === serverHost || nHost === serverHost);
}

function _isIOSNode(node) {
  const osRaw = String((node._peer && node._peer.os) || '').toLowerCase();
  const label = String(node.label || '').toLowerCase();
  const host = String(node.hostname || '').toLowerCase();
  return osRaw.includes('ios') || label.includes('iphone') || host.includes('iphone');
}

async function connectRemoteEndpoint(node) {
  const target = node.label || node.hostname || node.id;
  const osRaw = String((node._peer && node._peer.os) || '').toLowerCase();
  const ua = String(navigator.platform || navigator.userAgent || '').toLowerCase();
  const osName = osRaw.includes('mac') ? 'macos' : (osRaw.includes('win') ? 'windows' : (ua.includes('mac') ? 'macos' : 'linux'));

  const showAgentFallback = async () => {
    showModal({
      title: `Agent fallback not enabled yet`,
      desc:
        `This Porter instance is running self-hosted on VPS and does not have a published agent installer endpoint yet.<br><br>` +
        `Use SSH mode for now. Agent fallback will be enabled only after installer hosting is configured.`,
      actions: [
        { label: 'Close', cls: 'btn-primary', action: closeModal }
      ]
    });
  };

  if (node && node._forceAgent) {
    await showAgentFallback();
    return;
  }

  const showActionPlan = () => {
    const isIOS = _isIOSNode(node);
    if (isIOS) {
      // iPhone is a browser client — it accesses Porter via Safari, not via SSH or agent.
      showIosBrowserAccess(node, target);
      return;
    }
    showModal({
      title: `Connect ${escHtml(target)}`,
      desc:
        `<div style="display:grid;gap:10px">` +
          `<div style="font-size:12px;color:var(--accent2);font-weight:600;letter-spacing:.02em">WHAT WILL HAPPEN</div>` +
          `<div style="padding:10px 12px;border:1px solid var(--border2);border-radius:10px;background:var(--surface)">` +
            `<strong style="display:block;margin-bottom:8px">Enable remote filesystem browsing:</strong>` +
            `<div style="display:grid;gap:6px;font-size:13px;color:var(--text2)">` +
              `<div><strong style="color:var(--text)">1.</strong> Verify this device is reachable over Tailscale</div>` +
              `<div><strong style="color:var(--text)">2.</strong> Test SSH connectivity (used to serve remote files)</div>` +
              `<div><strong style="color:var(--text)">3.</strong> Save endpoint — device becomes browseable from Porter</div>` +
            `</div>` +
          `</div>` +
          `<div style="font-size:12px;color:var(--text3)">No hidden actions. You choose at each step.</div>` +
        `</div>`,
      actions: [
        { label: 'Cancel', action: closeModal },
        {
          label: 'Test SSH over Tailscale',
          cls: 'btn-primary',
          action: () => { closeModal(); openSshConnectWizard(node, target); }
        },
        {
          label: 'Install Agent (coming soon)',
          cls: 'btn-ghost',
          action: async () => { closeModal(); await showAgentFallback(); }
        }
      ]
    });
  };

  showModal({
    title: `Connect ${escHtml(target)}?`,
    desc:
      `${escHtml(target)} needs a remote filesystem endpoint.<br><br>` +
      `Press <strong>Proceed</strong> to review all actions before anything runs.`,
    actions: [
      { label: 'Cancel', action: closeModal },
      { label: 'Proceed', cls: 'btn-primary', action: () => { closeModal(); showActionPlan(); } },
    ],
  });
}

async function openSshConnectWizard(node, targetLabel) {
  const hostGuess = (node.tailscale_ip || node.hostname || '').trim();
  showModal({
    title: `SSH connect ${escHtml(targetLabel)}`,
    desc:
      `<div style="display:grid;gap:10px">` +
      `<div style="font-size:13px;color:var(--text2)">Validate SSH reachability first. If SSH fails, we immediately offer Agent fallback.</div>` +
      `<label style="display:grid;gap:4px;font-size:12px;color:var(--text3)">SSH user<input id="sshUserInput" class="input" style="margin-top:2px" type="text" value="root" /></label>` +
      `<label style="display:grid;gap:4px;font-size:12px;color:var(--text3)">Host or Tailscale IP<input id="sshHostInput" class="input" style="margin-top:2px" type="text" value="${escHtml(hostGuess)}" /></label>` +
      `<label style="display:grid;gap:4px;font-size:12px;color:var(--text3)">Port<input id="sshPortInput" class="input" style="margin-top:2px" type="number" value="22" /></label>` +
      `</div>`,
    actions: [
      { label: 'Cancel', action: closeModal },
      {
        label: 'Test SSH',
        cls: 'btn-primary',
        action: async () => {
          const user = (document.getElementById('sshUserInput') || {}).value || 'root';
          const host = (document.getElementById('sshHostInput') || {}).value || '';
          const port = parseInt(((document.getElementById('sshPortInput') || {}).value || '22'), 10) || 22;
          if (!host.trim()) { toast('Enter host or Tailscale IP', 'err'); return; }
          const r = await api('/api/ssh/probe', { user: user.trim(), host: host.trim(), port });
          closeModal();
          if (r && r.ok) {
            await api('/api/nodes', { action: 'set_ssh_endpoint', node_id: node.id, user: user.trim(), host: host.trim(), port });
            const sshCmd = `ssh -p ${port} ${user.trim()}@${host.trim()}`;
            showModal({
              title: `SSH verified: ${escHtml(targetLabel)}`,
              desc: `Connection test succeeded and endpoint saved for this device.<br><br><strong>Immediate next step:</strong> open an SSH session from this VPS using the command below.`,
              input: true,
              inputVal: sshCmd,
              actions: [
                { label: 'Close', action: closeModal },
                {
                  label: 'Copy SSH Command',
                  cls: 'btn-primary',
                  action: async () => {
                    try {
                      await navigator.clipboard.writeText(document.getElementById('modalInput').value || sshCmd);
                      toast('SSH command copied', 'ok');
                    } catch (_) {}
                  }
                }
              ]
            });
            loadLocations();
          } else {
            const errObj = r && r.error;
            const errMsg = errObj && typeof errObj === 'object' ? (errObj.message || 'SSH probe failed') : (errObj || 'SSH probe failed');
            const errCode = errObj && typeof errObj === 'object' ? errObj.code : 'SSH_UNREACHABLE';
            const retryable = errObj && typeof errObj === 'object' ? !!errObj.retryable : true;
            showModal({
              title: `SSH unreachable — ${escHtml(targetLabel)}`,
              desc:
                `<div style="display:grid;gap:10px">` +
                `<div style="font-size:13px;color:var(--text2)">SSH probe did not succeed. No changes were made.</div>` +
                `<div style="padding:10px;border:1px solid var(--border2);border-radius:8px;background:var(--surface);font-size:12px">` +
                  `<div style="font-weight:600;color:var(--danger);margin-bottom:4px">${escHtml(errCode || 'SSH_UNREACHABLE')}</div>` +
                  `<div style="color:var(--text2)">${escHtml(errMsg)}</div>` +
                  (retryable ? `<div style="margin-top:8px;color:var(--text3)">Retryable — confirm Tailscale is connected and SSH is running on ${escHtml(targetLabel)}, then try again.</div>` : '') +
                `</div>` +
                `</div>`,
              actions: [
                { label: 'Close', action: closeModal },
                ...(retryable ? [{ label: 'Retry SSH', cls: 'btn-primary', action: () => { closeModal(); openSshConnectWizard(node, targetLabel); } }] : []),
                { label: 'Install Agent (coming soon)', cls: 'btn-ghost', action: () => connectRemoteEndpoint({ ...node, _forceAgent: true }) }
              ]
            });
          }
        }
      }
    ]
  });
}

// iPhone is a browser client — show access instructions, no SSH prep needed.
function showIosBrowserAccess(node, targetLabel) {
  const hubIp = (window._tsIp || window._serverHostname || window.location.hostname || '').trim();
  const hubUrl = hubIp ? `http://${hubIp}:8877` : `http://<porter-hub-ip>:8877`;
  showModal({
    title: `iPhone access: ${escHtml(targetLabel)}`,
    desc:
      `<div style="display:grid;gap:12px">` +
      `<div style="font-size:13px;color:var(--text2)">` +
        `<strong style="color:var(--text)">iPhone is a browser client.</strong> ` +
        `No SSH server or agent is needed on iPhone — it accesses Porter through Safari over Tailscale.` +
      `</div>` +
      `<div style="padding:10px;border:1px solid var(--border2);border-radius:10px;background:var(--surface);font-size:12px;color:var(--text2)">` +
        `<strong style="color:var(--text);display:block;margin-bottom:8px">To access Porter from this iPhone:</strong>` +
        `<div style="display:grid;gap:6px">` +
          `<div>1. Open <strong>Tailscale</strong> on the iPhone and confirm it’s connected</div>` +
          `<div>2. Open <strong>Safari</strong> and go to:</div>` +
          `<code style="display:block;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-size:12px;margin-top:4px">${escHtml(hubUrl)}</code>` +
          `<div>3. Log in with your Porter credentials</div>` +
        `</div>` +
      `</div>` +
      `<div style="font-size:11px;color:var(--text3)">This iPhone appears here because it’s on your Tailscale network. Porter can see it, but iPhone doesn’t host files — it browses them.</div>` +
      `</div>`,
    actions: [
      { label: 'Got it', cls: 'btn-primary', action: closeModal }
    ]
  });
}

// Backward-compatible stub — delegates to showIosBrowserAccess.
async function openIosPrepWizard(node, targetLabel) {
  showIosBrowserAccess(node, targetLabel);
}

async function quickExposePath(node) {

  let nodeId = node.id;
  if (node._virtual) {
    const created = await api('/api/nodes', {
      action: 'add_node',
      id: node.id,
      label: node.label || node.hostname || node.id,
      type: 'tailscale',
      hostname: node.hostname || '',
      tailscale_ip: node.tailscale_ip || '',
    });
    if (!created || !created.ok) {
      toast((created && created.error) || 'Failed to create location', 'err');
      return;
    }
    nodeId = node.id;
  }

  const nodeName = node.label || node.hostname || node.id;

  const saveMount = async (pathValue) => {
    const path = String(pathValue || '').trim();
    if (!path) return;
    const suggested = path.split('/').filter(Boolean).pop() || 'Path';
    const label = prompt('Label for this path:', suggested);
    if (label === null || !label.trim()) return;
    const res = await api('/api/nodes', {
      action: 'add_mount',
      node_id: nodeId,
      mount: { label: label.trim(), path }
    });
    if (res && res.ok) {
      toast('Path exposed', 'ok');
      loadLocations();
    } else {
      toast((res && res.error) || 'Failed to expose path', 'err');
    }
  };

  if (_isSelfNode(node) && typeof openFolderPicker === 'function') {
    // Local server path picker: no blind typing.
    openFolderPicker(async (pickedRelative) => {
      const rel = String(pickedRelative || '').trim();
      const absolute = rel ? `/${rel}` : '/';
      await saveMount(absolute);
    });
    return;
  }

  // Remote peers: block manual blind input until remote browser adapter is live.
  toast(`Remote directory browse for ${nodeName} is not enabled yet. Install/connect Porter Agent on target device.`, 'err');
  return;
}
// kept for backward compat during transition
function _renderSidebarLocs(locs, activeRoot) {
  // group by node_id if available, else render flat
  const byNode = {};
  locs.forEach(l => {
    const nid = l.node_id || '__flat__';
    (byNode[nid] = byNode[nid] || []).push(l);
  });

  if (Object.keys(byNode).length === 1 && byNode['__flat__']) {
    // flat legacy: no node grouping
    const targets = [document.getElementById('locations'), document.getElementById('locations-secondary')].filter(Boolean);
    targets.forEach(el => {
      el.innerHTML = '';
      locs.forEach(l => {
        rootMeta[l.id] = { path: l.path || '', label: l.label || l.id, node: l.node_id || '', type: l.type || 'local', hostname: l.node || '', tailscale_ip: l.tailscale_ip || '' };
        const div = document.createElement('div');
        div.className = 'loc' + (l.id === activeRoot ? ' active' : '');
        div.dataset.root = l.id;
        div.innerHTML = `${_locIcon(l)}<span class="loc-name">${escHtml(l.label)}</span>`;
        div.onclick = () => navigate(l.id, '');
        el.appendChild(div);
      });
    });
  } else {
    // has node context: build pseudo-nodes and delegate
    const nodes = Object.entries(byNode).map(([nid, ms]) => ({id:nid, label:nid, type:'local', mounts:ms}));
    _renderSidebarNodes(nodes, activeRoot);
  }
}

async function init() {
  loadSettings();
  await loadMe();
  populateChangelog();
  const nodeData = await api('/api/nodes');
  const nodes = (nodeData && nodeData.nodes) || [];
  _renderSidebarNodes(nodes, null);
  // Default to overview unless a hash/route is added later
  switchModule('overview');
  await maybeShowWizard();
}

// ── navigation ──
async function navigate(root, path) {
  if (rootMeta[root] && rootMeta[root].type === 'tailscale' && !isTailscaleNodeConnected(rootMeta[root])) {
    toast('That Tailscale location is disconnected', 'err');
    return;
  }
  curRoot = root; curPath = path;
  document.title = path ? `Porter · ${root}/${path}` : `Porter · ${root}`;
  closeSettings();
  // Ensure we are in files module
  if (_currentModule !== 'files') switchModule('files');
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
  const meta = rootMeta[root] || {};
  const rootPath = meta.path || `~/${root}`;
  let h = `<button class="crumb" onclick="navigate('${esc(root)}','')">${escHtml(rootPath)}</button>`;
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
  const el = document.getElementById('file-results-footer');
  if (!el) return;
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

document.addEventListener('keydown', function(e) {
  const tag = (document.activeElement.tagName || '').toLowerCase();
  const inInput = tag === 'input' || tag === 'textarea' || document.activeElement.isContentEditable;

  if (e.key === 'Escape') {
    if (document.getElementById('shortcutsOverlay').style.display !== 'none') { toggleShortcuts(); return; }
    if (document.getElementById('fpOverlay').style.display !== 'none') { closeFolderPicker(); return; }
    if (document.getElementById('overlay').style.display !== 'none') { closeModal(); return; }
    const settingsPanel = document.getElementById('settingsPanel');
    if (settingsPanel && settingsPanel.classList.contains('open')) { closeSettings(); return; }
    if (_currentModule !== 'files') { switchModule('files'); return; }
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
// ── onboarding wizard ──────────────────────────────────────────────────────
let _wizStep = 1, _wizLocAdded = false, _wizAgentCreated = false;
let _wizAgentKey = '', _wizAgentRole = 'writer';
const WIZ_TOTAL = 4;

function _wizUpdateProgress() {
  const bar = document.getElementById('wizProgress');
  bar.innerHTML = Array.from({length: WIZ_TOTAL}, (_, i) => {
    const n = i + 1;
    const cls = n < _wizStep ? 'done' : n === _wizStep ? 'active' : '';
    return `<div class="wiz-dot ${cls}"></div>`;
  }).join('');
}

function wizShowStep(n) {
  _wizStep = n;
  document.querySelectorAll('.wiz-step').forEach((el, i) => {
    el.classList.toggle('active', i + 1 === n);
  });
  if (n === 3 && !_wizAgentCreated) {
    document.getElementById('wiz-agent-key-section').style.display = 'none';
    document.getElementById('wiz-agent-btn').textContent = 'Create agent';
    document.getElementById('wiz-agent-btn').onclick = wizCreateAgent;
    document.getElementById('wiz-agent-skip').style.display = '';
  }
  if (n === WIZ_TOTAL) _wizBuildChecklist();
  _wizUpdateProgress();
}

function wizNext() { wizShowStep(_wizStep + 1); }
function wizPrev() { wizShowStep(_wizStep - 1); }
function wizSkipStep() { wizNext(); }

async function wizSkip() {
  await api('/api/preferences', { onboarding_complete: true });
  document.getElementById('wizOverlay').classList.remove('open');
}

async function wizTestPath() {
  const path = document.getElementById('wiz-loc-path').value.trim();
  const res = document.getElementById('wiz-path-result');
  if (!path) { res.textContent = 'Enter a path first.'; res.style.color = 'var(--danger)'; return; }
  const r = await api('/api/locations/test', { path });
  if (r && r.ok && r.readable) {
    res.textContent = r.writable ? '✓ Path exists and is writable' : '✓ Path exists (read-only)';
    res.style.color = '#4caf50';
  } else {
    res.textContent = (r && r.error) || 'Path not accessible';
    res.style.color = 'var(--danger)';
  }
}

async function wizSaveLocation() {
  const label = document.getElementById('wiz-loc-label').value.trim();
  const path  = document.getElementById('wiz-loc-path').value.trim();
  if (!label || !path) { toast('Enter a label and path', 'err'); return; }
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'location';
  const r = await api('/api/locations', { action: 'add', id, label, type: 'local', path });
  if (r && r.ok) {
    _wizLocAdded = true;
    toast('Location added', 'ok');
    wizNext();
  } else {
    toast((r && r.error) || 'Failed to add location', 'err');
  }
}

async function wizCreateAgent() {
  const name = document.getElementById('wiz-agent-name').value.trim();
  _wizAgentRole = document.getElementById('wiz-agent-role').value;
  if (!name) { toast('Enter an agent name', 'err'); return; }
  const r = await api('/api/agents', { action: 'create', name, role: _wizAgentRole, namespaces: [] });
  if (r && r.ok) {
    _wizAgentCreated = true;
    _wizAgentKey = r.key || '';
    document.getElementById('wiz-agent-key-display').textContent = _wizAgentKey;
    document.getElementById('wiz-agent-key-section').style.display = 'block';
    const btn = document.getElementById('wiz-agent-btn');
    btn.textContent = 'Continue';
    btn.onclick = wizNext;
    document.getElementById('wiz-agent-skip').style.display = 'none';
    toast('Agent created — copy your key!', 'ok');
  } else {
    toast((r && r.error) || 'Failed to create agent', 'err');
  }
}

function wizCopyKey() {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(_wizAgentKey).then(() => toast('Key copied', 'ok'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = _wizAgentKey;
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    toast('Key copied', 'ok');
  }
}

function _wizBuildChecklist() {
  const items = [
    { done: _wizLocAdded,
      label: 'File location added',
      skip:  'No location added — add one in Settings → Locations' },
    { done: _wizAgentCreated,
      label: `Agent created (role: ${_wizAgentRole})`,
      skip:  'No agent connected — add one in Settings → Agents' },
  ];
  document.getElementById('wiz-checklist').innerHTML = items.map(it => `
    <li>
      <span class="${it.done ? 'wiz-check-icon' : 'wiz-check-skip'}">${it.done ? '✓' : '—'}</span>
      <span>${it.done ? it.label : it.skip}</span>
    </li>`).join('');
}

async function wizFinish() {
  await api('/api/preferences', { onboarding_complete: true });
  document.getElementById('wizOverlay').classList.remove('open');
  init(); // refresh sidebar with any newly added locations
}

async function maybeShowWizard() {
  const prefs = await api('/api/preferences');
  if (prefs && prefs.onboarding_complete === false) {
    wizShowStep(1);
    document.getElementById('wizOverlay').classList.add('open');
  }
}
// ── end wizard ─────────────────────────────────────────────────────────────

init();
</script>

<!-- ── onboarding wizard ── -->
<div class="wiz-overlay" id="wizOverlay">
  <div class="wiz-dialog">
    <div class="wiz-progress" id="wizProgress"></div>

    <!-- Step 1: Welcome -->
    <div class="wiz-step active" id="wiz-step-1">
      <div class="wiz-step-badge">Welcome</div>
      <div class="wiz-title">Set up Porter</div>
      <div class="wiz-subtitle">Connect your file locations and optionally register AI agents. Takes about 2 minutes.</div>
      <div class="wiz-actions">
        <button class="btn" onclick="wizNext()">Start setup</button>
        <button class="btn-skip" onclick="wizSkip()">Skip for now</button>
      </div>
    </div>

    <!-- Step 2: Add Location -->
    <div class="wiz-step" id="wiz-step-2">
      <div class="wiz-step-badge">Step 1 of 3</div>
      <div class="wiz-title">Add a location</div>
      <div class="wiz-subtitle">Connect a directory on this server. You can add more later in Settings → Locations.</div>
      <div class="wiz-type-cards">
        <div class="wiz-type-card selected">
          <div class="wiz-card-icon">📁</div>
          <div class="wiz-card-label">Local directory</div>
          <div class="wiz-card-sub">This server</div>
        </div>
        <div class="wiz-type-card disabled">
          <div class="wiz-card-icon">🔌</div>
          <div class="wiz-card-label">SSH server</div>
          <div class="wiz-card-sub">Coming soon</div>
        </div>
        <div class="wiz-type-card disabled">
          <div class="wiz-card-icon">🐙</div>
          <div class="wiz-card-label">GitHub repo</div>
          <div class="wiz-card-sub">Coming soon</div>
        </div>
      </div>
      <div class="settings-field">
        <label>Label</label>
        <input class="settings-input" id="wiz-loc-label" placeholder="e.g. My Files" />
      </div>
      <div class="settings-field">
        <label>Absolute path</label>
        <div style="display:flex;gap:8px">
          <input class="settings-input" id="wiz-loc-path" placeholder="/home/user/files" style="flex:1" />
          <button class="btn-secondary" onclick="wizTestPath()">Test</button>
        </div>
        <div id="wiz-path-result" style="font-size:12px;margin-top:6px;color:var(--text3)"></div>
      </div>
      <div class="wiz-actions">
        <button class="btn" onclick="wizSaveLocation()">Add & Continue</button>
        <button class="btn-secondary" onclick="wizPrev()">Back</button>
        <button class="btn-skip" onclick="wizSkipStep()">Skip this step</button>
      </div>
    </div>

    <!-- Step 3: Connect Agent -->
    <div class="wiz-step" id="wiz-step-3">
      <div class="wiz-step-badge">Step 2 of 3</div>
      <div class="wiz-title">Connect an agent</div>
      <div class="wiz-subtitle">Issue an API key for an AI agent. You can skip this and add agents later in Settings → Agents.</div>
      <div class="settings-field">
        <label>Agent name</label>
        <input class="settings-input" id="wiz-agent-name" placeholder="e.g. openclaw" />
      </div>
      <div class="settings-field">
        <label>Role</label>
        <select class="settings-input" id="wiz-agent-role">
          <option value="viewer">Viewer — read only</option>
          <option value="writer" selected>Writer — read + write files</option>
          <option value="operator">Operator — + checkpoint / finalize</option>
          <option value="admin">Admin — full access</option>
        </select>
      </div>
      <div id="wiz-agent-key-section" style="display:none">
        <div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:6px">API key — copy now, shown once</div>
        <div class="wiz-key-box" id="wiz-agent-key-display"></div>
        <div class="wiz-key-note">Save this key — it will not be shown again.</div>
        <button class="btn-secondary" onclick="wizCopyKey()" style="margin-bottom:16px">Copy key</button>
      </div>
      <div class="wiz-actions">
        <button class="btn" id="wiz-agent-btn" onclick="wizCreateAgent()">Create agent</button>
        <button class="btn-secondary" onclick="wizPrev()">Back</button>
        <button class="btn-skip" id="wiz-agent-skip" onclick="wizSkipStep()">Skip this step</button>
      </div>
    </div>

    <!-- Step 4: Complete -->
    <div class="wiz-step" id="wiz-step-4">
      <div class="wiz-step-badge">Done</div>
      <div class="wiz-title">Porter is ready</div>
      <div class="wiz-subtitle">Here's what was configured. Adjust everything anytime in Settings.</div>
      <ul class="wiz-checklist" id="wiz-checklist"></ul>
      <div class="wiz-actions">
        <button class="btn" onclick="wizFinish()">Open Porter</button>
      </div>
    </div>
  </div>
</div>
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

    def get_agent_from_bearer(self) -> dict | None:
        """Return the agent dict if a valid Bearer token is present, else None."""
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return None
        raw_key = auth[7:].strip()
        if not raw_key:
            return None
        key_hash = _hash_agent_key(raw_key)
        for agent in _config.get("agents", []):
            if agent.get("key_hash") == key_hash and agent.get("status") != "revoked":
                return agent
        return None

    def auth_check_cap(self, capability: str) -> bool:
        """Auth check that accepts a session cookie (browser) OR a Bearer token with
        the required capability (agent).  Sends 401/403 JSON and returns False on denial."""
        # Browser session → full access
        token = self.get_session_token()
        if token and get_session(token):
            return True
        # Agent Bearer token → check capability
        agent = self.get_agent_from_bearer()
        if agent:
            if capability in ROLE_CAPS.get(agent.get("role", "viewer"), set()):
                return True
            self.reply_json({"error": "forbidden",
                             "reason": f"role '{agent.get('role')}' lacks '{capability}' capability"}, 403)
            return False
        # No valid auth
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
                "full_name":    cfg.get("full_name", ""),
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

        # ── locations ─────────────────────────────────────────────────────
        elif parsed.path == "/api/nodes":
            if not self.auth_check(redirect=False): return
            hn = socket.gethostname()
            out = []
            for node in _config.get("nodes", []):
                n = dict(node)
                n["mounts"] = []
                for mount in node.get("mounts", []):
                    m = dict(mount)
                    p = Path(m.get("path", ""))
                    m["exists"]   = p.exists()
                    m["writable"] = os.access(str(p), os.W_OK) if m["exists"] else False
                    n["mounts"].append(m)
                if n.get("type") == "local":
                    n["hostname"] = hn
                out.append(n)
            self.reply_json({"nodes": out})

        elif parsed.path == "/api/locations":
            if not self.auth_check(redirect=False): return
            # backward-compat flat view derived from nodes
            hn = socket.gethostname()
            locs = []
            for node in _config.get("nodes", []):
                for mount in node.get("mounts", []):
                    entry = dict(mount)
                    entry["type"]    = node.get("type", "local")
                    entry["node_id"] = node["id"]
                    p = Path(entry.get("path", ""))
                    entry["exists"]   = p.exists()
                    entry["writable"] = os.access(str(p), os.W_OK) if entry["exists"] else False
                    if node.get("type") == "local":
                        entry["hostname"] = hn
                    locs.append(entry)
            self.reply_json({"locations": locs})

        elif parsed.path in ("/api/tailscale/peers", "/api/tailscale/status"):
            if not self.auth_check(redirect=False): return
            want_status = parsed.path == "/api/tailscale/status"
            try:
                result = subprocess.run(
                    ["tailscale", "status", "--json"],
                    capture_output=True, text=True, timeout=5
                )
                if result.returncode != 0:
                    base = {"available": False, "error": "tailscale not running", "peers": []}
                    if want_status: base.update({"self": None, "peers_online": 0, "peers_total": 0})
                    self.reply_json(base); return
                ts = json.loads(result.stdout)
                peers = []
                for _, v in ts.get("Peer", {}).items():
                    host_name = (v.get("HostName", "") or "").strip()
                    dns_name = (v.get("DNSName", "") or "").rstrip(".")
                    dns_label = dns_name.split(".", 1)[0] if dns_name else ""
                    name = host_name
                    # Some iOS devices report HostName=localhost; prefer DNS label in that case.
                    if not name or name.lower() == "localhost":
                        name = dns_label or host_name
                    if "funnel-ingress" in name or not name: continue
                    ips = [ip for ip in v.get("TailscaleIPs", []) if ":" not in ip]
                    if not ips: continue
                    peers.append({
                        "name":     name,
                        "dns_name": dns_name,
                        "ip":       ips[0],
                        "online":   v.get("Online", False),
                        "os":       v.get("OS", ""),
                        "relay":    bool(v.get("Relay", "")),
                    })
                if want_status:
                    self_node = ts.get("Self", {})
                    self_ips  = [ip for ip in self_node.get("TailscaleIPs", []) if ":" not in ip]
                    tailnet   = self_node.get("DNSName", "").split(".", 1)[-1].rstrip(".") if "." in self_node.get("DNSName", "") else ""
                    self.reply_json({
                        "available":    True,
                        "self": {
                            "name":      self_node.get("HostName", "") or socket.gethostname(),
                            "ip":        self_ips[0] if self_ips else "",
                            "public_ip": _public_ip_hint(),
                            "tailnet":   tailnet,
                            "os":        self_node.get("OS", ""),
                        },
                        "peers_online": sum(1 for p in peers if p["online"]),
                        "peers_total":  len(peers),
                        "peers":        peers,
                    })
                else:
                    self.reply_json({"peers": peers, "available": True})
            except FileNotFoundError:
                base = {"available": False, "error": "tailscale not found", "peers": []}
                if want_status: base.update({"self": None, "peers_online": 0, "peers_total": 0})
                self.reply_json(base)
            except Exception as e:
                base = {"available": False, "error": str(e), "peers": []}
                if want_status: base.update({"self": None, "peers_online": 0, "peers_total": 0})
                self.reply_json(base)

        # ── agents ────────────────────────────────────────────────────────
        elif parsed.path == "/api/agents":
            if not self.auth_check(redirect=False): return
            safe = [{k: v for k, v in a.items() if k != "key_hash"}
                    for a in _config.get("agents", [])]
            self.reply_json({"agents": safe})

        # ── config summary / export ───────────────────────────────────────
        elif parsed.path == "/api/config/summary":
            if not self.auth_check(redirect=False): return
            prefs = _config.get("preferences", {})
            locs  = []
            for node in _config.get("nodes", []):
                for mount in node.get("mounts", []):
                    p = Path(mount.get("path", ""))
                    locs.append({
                        "id": mount.get("id"), "label": mount.get("label"),
                        "type": node.get("type", "local"), "path": mount.get("path"),
                        "node": node.get("id"),
                        "exists": p.exists(),
                        "writable": os.access(str(p), os.W_OK) if p.exists() else False,
                    })
            agents = [
                {"id": a.get("id"), "name": a.get("name"), "role": a.get("role"),
                 "type": a.get("type"), "status": a.get("status")}
                for a in _config.get("agents", [])
            ]
            self.reply_json({
                "auth": {
                    "username":     _config.get("username", "admin"),
                    "full_name":    _config.get("full_name", ""),
                    "display_name": _config.get("display_name", ""),
                    "mode":         "single-user owner",
                    "session_ttl":  SESSION_TTL,
                },
                "locations": locs,
                "preferences": prefs,
                "agents": agents,
                "runtime": {
                    "runtime_dir":  str(RUNTIME_DIR),
                    "memory_dir":   str(MEMORY_DIR),
                    "namespaces":   sorted(MEMORY_NAMESPACES),
                    "heartbeat_ttl_min":  HEARTBEAT_TTL_MIN,
                    "heartbeat_ttl_max":  HEARTBEAT_TTL_MAX,
                    "heartbeat_ttl_def":  HEARTBEAT_TTL_DEF,
                },
            })

        elif parsed.path == "/api/config/export":
            if not self.auth_check(redirect=False): return
            STRIP = {"password_hash", "salt", "key_hash", "raw_key"}
            def _sanitize(obj):
                if isinstance(obj, dict):
                    return {k: _sanitize(v) for k, v in obj.items() if k not in STRIP}
                if isinstance(obj, list): return [_sanitize(i) for i in obj]
                return obj
            export = _sanitize(dict(_config))
            body = json.dumps(export, indent=2, default=str).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Disposition", 'attachment; filename="porter-config.json"')
            self.send_header("Content-Length", str(len(body)))
            self.end_headers(); self.wfile.write(body)

        # ── preferences ───────────────────────────────────────────────────
        elif parsed.path == "/api/preferences":
            if not self.auth_check(redirect=False): return
            self.reply_json(_config.get("preferences", {}))

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

        # ── P0: runtime recover ────────────────────────────────────────────
        elif parsed.path == "/runtime/recover":
            if not self.auth_check_cap("read"): return
            task_id = qs.get("task_id", [""])[0]
            if not task_id or not re.match(r'^[\w\-\.]+$', task_id):
                self.reply_json({"error": "invalid task_id"}, 400); return
            lease_path = RUNTIME_DIR / "leases" / f"{task_id}.json"
            ckpt_path  = RUNTIME_DIR / "checkpoints" / f"{task_id}.jsonl"
            drafts_dir = RUNTIME_DIR / "drafts" / task_id
            lease = json.loads(lease_path.read_text()) if lease_path.exists() else None
            steps = []
            if ckpt_path.exists():
                for line in ckpt_path.read_text().splitlines():
                    line = line.strip()
                    if line:
                        try:
                            steps.append(json.loads(line))
                        except Exception:
                            pass
            chunks = []
            if drafts_dir.exists():
                chunks = sorted(p.name for p in drafts_dir.iterdir() if p.is_file())
            last_step = steps[-1] if steps else None
            last_status = (last_step or {}).get("status", "")
            now = time.time()
            lease_expired = False
            if lease is not None:
                lease_expired = lease.get("expires_at", 0) <= now
            resumable = (
                lease is not None
                and not lease_expired
                and lease.get("state", "running") in ("running", "interrupted")
                and last_status != "done"
            )
            self.reply_json({
                "task_id":      task_id,
                "lease":        lease,
                "steps":        steps,
                "chunks":       chunks,
                "last_step":    last_step,
                "resumable":    resumable,
                "lease_expired": lease_expired,
            })

        # ── P1: memory fetch ───────────────────────────────────────────────
        elif parsed.path == "/memory/fetch":
            if not self.auth_check_cap("read"): return
            uri      = qs.get("uri",   [""])[0]
            from_ln  = int(qs.get("from",  ["1"])[0])
            n_lines  = int(qs.get("lines", ["0"])[0])
            fpath = porter_uri_to_path(uri)
            if fpath is None:
                self.reply_json({"error": "invalid uri"}, 400); return
            if not fpath.exists():
                self.reply_json({"error": "not found"}, 404); return
            content = fpath.read_text(encoding="utf-8", errors="replace")
            all_lines = content.splitlines(keepends=True)
            total_lines = len(all_lines)
            if n_lines > 0:
                start = max(0, from_ln - 1)
                sliced = all_lines[start:start + n_lines]
                content = "".join(sliced)
            st = fpath.stat()
            self.reply_json({
                "uri":         uri,
                "content":     content,
                "size":        st.st_size,
                "modified":    st.st_mtime,
                "total_lines": total_lines,
            })

        elif parsed.path == "/agent-usage/current":
            if not self.auth_check(redirect=False): return
            from datetime import datetime, timezone
            USAGE_DIR.mkdir(parents=True, exist_ok=True)
            results = []
            for agent in _config.get("agents", []):
                aid = agent.get("id", "")
                snap_file = USAGE_DIR / f"{aid}.json"
                snap = {}
                if snap_file.exists():
                    try: snap = json.loads(snap_file.read_text())
                    except Exception: pass
                results.append({
                    "agent_id":    aid,
                    "name":        agent.get("name", aid),
                    "type":        agent.get("type", ""),
                    "role":        agent.get("role", ""),
                    "status":      snap.get("status", "unknown"),
                    "usage_percent": snap.get("usage_percent"),
                    "window_resets_at": snap.get("window_resets_at"),
                    "captured_at": snap.get("captured_at"),
                    "provider":    snap.get("provider", agent.get("type", "")),
                })
            self.reply_json({"agents": results, "count": len(results)})

        # ── P2: task list ──────────────────────────────────────────────────
        elif parsed.path == "/api/tasks":
            if not self.auth_check(redirect=False): return
            leases_dir = RUNTIME_DIR / "leases"
            ckpts_dir  = RUNTIME_DIR / "checkpoints"
            now        = time.time()
            tasks      = []
            if leases_dir.exists():
                for lf in leases_dir.glob("*.json"):
                    try:
                        lease = json.loads(lf.read_text())
                    except Exception:
                        continue
                    task_id = lease.get("task_id", lf.stem)
                    state   = lease.get("state", "running")
                    if state == "running" and lease.get("expires_at", 0) < now:
                        state = "stalled"
                    stall_reason = None
                    if state == "stalled":
                        hb = lease.get("last_heartbeat")
                        exp = lease.get("expires_at", 0)
                        if hb is None:
                            stall_reason = "No heartbeat was ever sent for this task"
                        else:
                            overdue_secs = int(now - exp)
                            stall_reason = f"Heartbeat expired {overdue_secs}s ago — agent may be offline or crashed"
                    # count steps in checkpoint log
                    ckpt_path = ckpts_dir / f"{task_id}.jsonl"
                    steps = []
                    if ckpt_path.exists():
                        try:
                            steps = [json.loads(l) for l in ckpt_path.read_text().splitlines() if l.strip()]
                        except Exception:
                            pass
                    last_step = steps[-1] if steps else None
                    # resolve owner name
                    owner_id   = lease.get("owner", "")
                    owner_name = owner_id
                    for a in _config.get("agents", []):
                        if a.get("id") == owner_id:
                            owner_name = a.get("name", owner_id)
                            break
                    tasks.append({
                        "task_id":        task_id,
                        "owner":          owner_id,
                        "owner_name":     owner_name,
                        "state":          state,
                        "started_at":     lease.get("started_at"),
                        "last_heartbeat": lease.get("last_heartbeat"),
                        "expires_at":     lease.get("expires_at"),
                        "step_count":     len(steps),
                        "last_step":      last_step,
                        "stalled":        state == "stalled",
                        "stall_reason":   stall_reason,
                    })
            # sort: running→paused→stalled→complete→cancelled
            _order = {"running": 0, "paused": 1, "stalled": 2, "complete": 3, "cancelled": 4}
            tasks.sort(key=lambda t: (_order.get(t["state"], 9), -(t["last_heartbeat"] or 0)))
            self.reply_json({"tasks": tasks, "count": len(tasks)})

        # ── agent fleet lifecycle ─────────────────────────────────────────
        elif parsed.path == "/api/agent-fleet":
            if not self.auth_check(redirect=False): return
            fleet = _config.get("agent_fleet", DEFAULT_AGENT_FLEET)
            devices = fleet.get("devices", {})
            self.reply_json({
                "channel": fleet.get("channel", "stable"),
                "current_version": fleet.get("current_version", "0.1.0"),
                "min_compatible": fleet.get("min_compatible", "0.1.0"),
                "auto_update": bool(fleet.get("auto_update", True)),
                "rollout": int(fleet.get("rollout", 100)),
                "device_count": len(devices),
                "devices": devices,
            })

        elif parsed.path == "/api/agent/bootstrap":
            # Installer recipe for first-use bootstrap on target devices
            if not self.auth_check(redirect=False): return
            os_name = (qs.get("os", ["linux"])[0] or "linux").lower()
            arch = (qs.get("arch", ["x64"])[0] or "x64").lower()
            if not AGENT_INSTALL_URL:
                self.reply_json({
                    "ok": False,
                    "error": "Agent installer URL is not configured on this Porter host",
                    "hint": "Set PORTER_AGENT_INSTALL_URL and restart Porter",
                }, 503)
                return
            cmd = (
                f"curl -fsSL {AGENT_INSTALL_URL} | "
                f"bash -s -- --os {os_name} --arch {arch} --channel stable"
            )
            self.reply_json({
                "ok": True,
                "os": os_name,
                "arch": arch,
                "install_command": cmd,
                "note": "Run on target device. Agent will self-register and auto-update.",
            })

        # ── P2: audit log ──────────────────────────────────────────────────
        elif parsed.path == "/api/audit":
            if not self.auth_check(redirect=False): return
            try:
                limit = min(int(qs.get("limit", ["50"])[0]), 200)
            except (ValueError, TypeError):
                limit = 50
            entries = []
            if AUDIT_LOG.exists():
                try:
                    lines = AUDIT_LOG.read_text().splitlines()
                    for line in reversed(lines[-200:]):
                        line = line.strip()
                        if line:
                            try:
                                entries.append(json.loads(line))
                            except Exception:
                                pass
                        if len(entries) >= limit:
                            break
                except Exception:
                    pass
            self.reply_json({"entries": entries, "count": len(entries)})

        # ── P3: policy presets ─────────────────────────────────────────────
        elif parsed.path == "/api/policy/presets":
            if not self.auth_check(redirect=False): return
            active = _config.get("preferences", {}).get("policy_preset", "balanced")
            out = [dict(p, active=(p["id"] == active)) for p in POLICY_PRESETS]
            self.reply_json({"presets": out, "active": active})

        # ── P4: overview ───────────────────────────────────────────────────────
        elif parsed.path == "/api/overview":
            if not self.auth_check(redirect=False): return
            now = time.time()
            leases_dir = RUNTIME_DIR / "leases"
            active_t = stalled = 0
            if leases_dir.exists():
                for lf in leases_dir.glob("*.json"):
                    try:
                        lease = json.loads(lf.read_text())
                        state = lease.get("state", "running")
                        if state == "running":
                            if lease.get("expires_at", 0) < now: stalled += 1
                            else: active_t += 1
                        elif state == "stalled": stalled += 1
                    except: pass
            recent_audit = []
            if AUDIT_LOG.exists():
                try:
                    lines = AUDIT_LOG.read_text().splitlines()
                    for line in reversed(lines[-20:]):
                        if line.strip():
                            try: recent_audit.append(json.loads(line))
                            except: pass
                        if len(recent_audit) >= 5: break
                except: pass
            disk_used_pct = 0
            try:
                usage = shutil.disk_usage("/")
                disk_used_pct = round(usage.used / usage.total * 100, 1) if usage.total > 0 else 0
            except: pass
            self.reply_json({
                "active_tasks": active_t, "stalled_tasks": stalled,
                "agent_count": len(_config.get("agents", [])),
                "location_count": sum(len(n.get("mounts", [])) for n in _config.get("nodes", [])),
                "schedule_count": len(_config.get("schedules", [])),
                "tool_count": len(_config.get("tools", [])),
                "disk_used_pct": disk_used_pct,
                "recent_audit": recent_audit[:5],
            })

        # ── P5: schedules ──────────────────────────────────────────────────────
        elif parsed.path == "/api/schedules":
            if not self.auth_check(redirect=False): return
            jobs = _config.get("schedules", [])
            result = []
            for job in jobs:
                j = dict(job)
                try:
                    j["next_run_display"] = _cron_next_display(job["schedule"])
                    nxt = _cron_next(job["schedule"])
                    j["next_run_ts"] = nxt.timestamp() if nxt else None
                except: j["next_run_display"] = "─"; j["next_run_ts"] = None
                result.append(j)
            self.reply_json({"schedules": result, "count": len(result)})

        # ── P6: tools ────────────────────────────────────────────────────────
        elif parsed.path == "/api/tools":
            if not self.auth_check(redirect=False): return
            self.reply_json({
                "tools": _config.get("tools", []),
                "policy": _config.get("tool_selection_policy", DEFAULT_TOOL_POLICY),
            })

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

        elif parsed.path == "/api/tailscale/control":
            if not self.auth_check(redirect=False): return
            self.reply_json({
                "ok": False,
                "error": "Tailscale connect/disconnect is disabled on this server to prevent lockouts"
            }, 403)

        elif parsed.path == "/api/ssh/probe":
            if not self.auth_check(redirect=False): return
            data = self.read_json_body()
            user = str(data.get("user", "root")).strip()
            host = str(data.get("host", "")).strip()
            port = int(data.get("port", 22) or 22)
            if not re.match(r"^[a-zA-Z0-9._-]{1,64}$", user):
                self.reply_json({"ok": False, "error": "invalid ssh user"}, 400); return
            if not re.match(r"^[a-zA-Z0-9:._-]{1,255}$", host):
                self.reply_json({"ok": False, "error": "invalid host"}, 400); return
            if port < 1 or port > 65535:
                self.reply_json({"ok": False, "error": "invalid port"}, 400); return
            cmd = [
                "ssh",
                "-o", "BatchMode=yes",
                "-o", "StrictHostKeyChecking=accept-new",
                "-o", "ConnectTimeout=5",
                "-p", str(port),
                f"{user}@{host}",
                "echo PORTER_SSH_OK",
            ]
            try:
                p = subprocess.run(cmd, capture_output=True, text=True, timeout=8)
                out = (p.stdout or "") + "\n" + (p.stderr or "")
                if p.returncode == 0 and "PORTER_SSH_OK" in out:
                    self.reply_json({"ok": True, "message": "SSH reachable"})
                else:
                    err = (p.stderr or p.stdout or "ssh connection failed").strip()
                    self.reply_json({"ok": False, "error": {
                        "code": "SSH_UNREACHABLE",
                        "message": err[:300],
                        "retryable": True,
                    }})
            except subprocess.TimeoutExpired:
                self.reply_json({"ok": False, "error": {
                    "code": "SSH_TIMEOUT",
                    "message": "SSH probe timed out (8s). Check Tailscale is connected and SSH is running on the remote device.",
                    "retryable": True,
                }})
            except Exception as e:
                self.reply_json({"ok": False, "error": {
                    "code": "SSH_ERROR",
                    "message": str(e)[:300],
                    "retryable": False,
                }})

        elif parsed.path == "/api/agent-fleet":
            # Admin controls + agent heartbeat/update reporting
            data = self.read_json_body()
            action = str(data.get("action", "")).strip().lower()

            # Agent report path (bearer)
            if action in {"report_heartbeat", "report_update"}:
                agent = self.get_agent_from_bearer()
                if not agent:
                    self.reply_json({"ok": False, "error": "unauthorized"}, 401); return
                fleet = _config.setdefault("agent_fleet", dict(DEFAULT_AGENT_FLEET))
                devices = fleet.setdefault("devices", {})
                aid = agent.get("id")
                entry = devices.get(aid, {})
                entry.update({
                    "agent_id": aid,
                    "name": agent.get("name", aid),
                    "os": data.get("os", entry.get("os", "")),
                    "arch": data.get("arch", entry.get("arch", "")),
                    "version": data.get("version", entry.get("version", "")),
                    "status": data.get("status", "online"),
                    "last_seen": int(time.time()),
                })
                if action == "report_update":
                    entry["last_update_from"] = data.get("from_version", "")
                    entry["last_update_to"] = data.get("to_version", entry.get("version", ""))
                    entry["last_update_ts"] = int(time.time())
                devices[aid] = entry
                _config["agent_fleet"] = fleet
                save_config(_config)
                _append_audit(action, target=aid, actor=f"agent:{aid}", detail=entry)
                self.reply_json({"ok": True}); return

            # Admin-only controls
            if not self.auth_check(redirect=False): return
            fleet = _config.setdefault("agent_fleet", dict(DEFAULT_AGENT_FLEET))
            if action == "set_policy":
                if "channel" in data: fleet["channel"] = str(data.get("channel") or "stable")
                if "current_version" in data: fleet["current_version"] = str(data.get("current_version") or fleet.get("current_version", "0.1.0"))
                if "min_compatible" in data: fleet["min_compatible"] = str(data.get("min_compatible") or fleet.get("min_compatible", "0.1.0"))
                if "auto_update" in data: fleet["auto_update"] = bool(data.get("auto_update"))
                if "rollout" in data:
                    try: fleet["rollout"] = max(0, min(100, int(data.get("rollout"))))
                    except Exception: pass
                _config["agent_fleet"] = fleet
                save_config(_config)
                _append_audit("agent_fleet_set_policy", target="fleet", actor="owner", detail=fleet)
                self.reply_json({"ok": True, "fleet": fleet}); return

            self.reply_json({"ok": False, "error": "Unsupported action"}, 400)

        elif parsed.path == "/api/profile/update":
            if not self.auth_check(redirect=False): return
            data = self.read_json_body()
            full_name = data.get("full_name", "").strip()
            display_name = data.get("display_name", "").strip()
            email = data.get("email", "").strip()
            if not display_name:
                self.reply_json({"ok": False, "error": "Preferred name cannot be empty"}, 400); return
            _config["full_name"] = full_name
            _config["display_name"] = display_name
            _config["email"] = email
            save_config(_config)
            self.reply_json({"ok": True, "full_name": full_name, "display_name": display_name, "email": email})

        elif parsed.path == "/api/password/change":
            if not self.auth_check(redirect=False): return
            data = self.read_json_body()
            current_pw = data.get("current", "")  # optional in owner mode
            new_pw     = data.get("new", "")
            if len(new_pw) < 8:
                self.reply_json({"ok": False, "error": "New password must be at least 8 characters"}, 400); return
            # Owner mode: skip current-password check when caller is already authenticated
            # (session cookie verified above). If current was supplied, still validate it.
            cfg = _config
            if current_pw and _hash_password(current_pw, cfg.get("salt", "")) != cfg.get("password_hash"):
                self.reply_json({"ok": False, "error": "Current password is incorrect"}, 401); return
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

        # ── P0: runtime checkpoint ─────────────────────────────────────────
        elif parsed.path == "/runtime/checkpoint":
            if not self.auth_check_cap("checkpoint"): return
            data = self.read_json_body()
            task_id   = data.get("task_id", "")
            step_id   = data.get("step_id", "")
            operation = data.get("operation", "")
            status    = data.get("status", "")
            # concurrency enforcement (bearer agents only)
            if status == "started":
                agent = self.get_agent_from_bearer()
                if agent:
                    max_c = agent.get("max_concurrent", 0)
                    if max_c > 0:
                        _now = time.time()
                        leases_dir = RUNTIME_DIR / "leases"
                        running = sum(
                            _safe_lease_running(lf, agent["id"], _now)
                            for lf in leases_dir.glob("*.json")
                        ) if leases_dir.exists() else 0
                        if running >= max_c:
                            self.reply_json({"error": "Concurrency limit reached",
                                             "max_concurrent": max_c, "running": running}, 429)
                            return
            metadata  = data.get("metadata", {})
            errors = []
            if not task_id or not re.match(r'^[\w\-\.]+$', task_id):
                errors.append("task_id must be non-empty and match [\\w\\-\\.]+")
            if not step_id:
                errors.append("step_id is required")
            if not operation:
                errors.append("operation is required")
            if status not in ("started", "partial", "done", "failed"):
                errors.append("status must be one of: started, partial, done, failed")
            if errors:
                self.reply_json({"error": "; ".join(errors)}, 400); return
            now = time.time()
            entry = {
                "task_id":   task_id,
                "step_id":   step_id,
                "operation": operation,
                "status":    status,
                "timestamp": now,
                "metadata":  metadata,
            }
            ckpt_path = RUNTIME_DIR / "checkpoints" / f"{task_id}.jsonl"
            with open(ckpt_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry) + "\n")
            self.reply_json({"ok": True, "step_id": step_id, "timestamp": now})

        # ── P0: runtime heartbeat ──────────────────────────────────────────
        elif parsed.path == "/runtime/heartbeat":
            if not self.auth_check_cap("checkpoint"): return
            data    = self.read_json_body()
            task_id = data.get("task_id", "")
            if not task_id or not re.match(r'^[\w\-\.]+$', task_id):
                self.reply_json({"error": "task_id must be non-empty and match [\\w\\-\\.]+"}, 400); return
            owner = data.get("owner", "agent")
            try:
                ttl = int(data.get("ttl", HEARTBEAT_TTL_DEF))
            except (TypeError, ValueError):
                self.reply_json({"error": "ttl must be an integer"}, 400); return
            if not (HEARTBEAT_TTL_MIN <= ttl <= HEARTBEAT_TTL_MAX):
                self.reply_json({
                    "error": f"ttl must be between {HEARTBEAT_TTL_MIN} and {HEARTBEAT_TTL_MAX}"
                }, 400); return
            now   = time.time()
            lease_path = RUNTIME_DIR / "leases" / f"{task_id}.json"
            if lease_path.exists():
                try:
                    lease = json.loads(lease_path.read_text())
                except Exception:
                    lease = {}
            else:
                lease = {}
            lease.update({
                "task_id":        task_id,
                "owner":          owner,
                "last_heartbeat": now,
                "expires_at":     now + ttl,
                "state":          lease.get("state", "running"),
            })
            if "started_at" not in lease:
                lease["started_at"] = now
            lease_path.write_text(json.dumps(lease, indent=2))
            self.reply_json({"ok": True, "task_id": task_id, "expires_at": lease["expires_at"]})

        # ── P0: runtime finalize ───────────────────────────────────────────
        elif parsed.path == "/runtime/finalize":
            if not self.auth_check_cap("finalize"): return
            data      = self.read_json_body()
            task_id   = data.get("task_id", "")
            temp_uri  = data.get("temp_uri", "")
            final_uri = data.get("final_uri", "")
            if not task_id or not re.match(r'^[\w\-\.]+$', task_id):
                self.reply_json({"error": "invalid task_id"}, 400); return
            temp_path  = porter_uri_to_path(temp_uri)
            final_path = porter_uri_to_path(final_uri)
            if temp_path is None:
                self.reply_json({"error": "invalid temp_uri"}, 400); return
            if final_path is None:
                self.reply_json({"error": "invalid final_uri"}, 400); return
            if not temp_path.exists() or temp_path.stat().st_size == 0:
                self.reply_json({"error": "temp file missing or empty"}, 400); return
            final_path.parent.mkdir(parents=True, exist_ok=True)
            os.replace(str(temp_path), str(final_path))
            now = time.time()
            # append finalize entry to checkpoint log (full metadata)
            ckpt_path = RUNTIME_DIR / "checkpoints" / f"{task_id}.jsonl"
            entry = json.dumps({
                "step_id":   "finalize",
                "status":    "done",
                "timestamp": now,
                "temp_uri":  temp_uri,
                "final_uri": final_uri,
            })
            with open(ckpt_path, "a", encoding="utf-8") as f:
                f.write(entry + "\n")
            # update lease state
            lease_path = RUNTIME_DIR / "leases" / f"{task_id}.json"
            if lease_path.exists():
                try:
                    lease = json.loads(lease_path.read_text())
                    lease["state"] = "complete"
                    lease_path.write_text(json.dumps(lease, indent=2))
                except Exception:
                    pass
            self.reply_json({"ok": True, "final_uri": final_uri, "timestamp": now})

        # ── P1: memory search ──────────────────────────────────────────────
        elif parsed.path == "/memory/search":
            if not self.auth_check_cap("read"): return
            data        = self.read_json_body()
            query       = data.get("query", "")
            limit       = min(int(data.get("limit", 10)), 50)
            filter_tags = data.get("tags", [])
            if not isinstance(filter_tags, list):
                filter_tags = []
            results = []
            for dirpath, _dirs, filenames in os.walk(str(MEMORY_DIR)):
                for fname in filenames:
                    fp = Path(dirpath) / fname
                    ext = fp.suffix.lower()
                    try:
                        if ext == ".json":
                            raw = fp.read_text(encoding="utf-8", errors="replace")
                            obj = json.loads(raw)
                            # accept porter_uri at top level or nested inside "source"
                            has_uri = ("porter_uri" in obj or
                                       "porter_uri" in (obj.get("source") or {}))
                            if "id" not in obj or not has_uri:
                                continue
                            title   = obj.get("title", fp.stem)
                            summary = obj.get("summary", "")
                            tags    = obj.get("tags", [])
                            content = title + " " + summary
                        elif ext in (".md", ".txt"):
                            raw  = fp.read_text(encoding="utf-8", errors="replace")
                            lines = raw.splitlines()
                            title = fp.stem
                            for ln in lines:
                                if ln.startswith("# "):
                                    title = ln[2:].strip()
                                    break
                            tags_val = []
                            for ln in lines:
                                m = re.match(r'^tags:\s*(.+)', ln, re.IGNORECASE)
                                if m:
                                    tags_val = [t.strip() for t in m.group(1).split(",") if t.strip()]
                                    break
                            tags    = tags_val
                            summary = ""
                            content = raw
                        else:
                            continue
                        # tag filter
                        if filter_tags and not any(t in tags for t in filter_tags):
                            continue
                        # relevance score
                        q_lower = query.lower()
                        score = 0
                        if q_lower and q_lower in title.lower():
                            score = 2
                        elif q_lower and q_lower in content.lower():
                            score = 1
                        if score == 0 and query:
                            continue
                        # build porter:// uri
                        try:
                            rel = fp.relative_to(MEMORY_DIR)
                            parts = rel.parts
                            uri = "porter://" + "/".join(parts)
                        except Exception:
                            uri = f"porter://artifacts/{fp.name}"
                        results.append({
                            "uri":     uri,
                            "title":   title,
                            "summary": summary,
                            "tags":    tags,
                            "score":   score,
                        })
                    except Exception:
                        continue
            results.sort(key=lambda r: r["score"], reverse=True)
            total_before_limit = len(results)
            results = results[:limit]
            self.reply_json({
                "results":  results,
                "total":    total_before_limit,
                "returned": len(results),
            })

        # ── P1: memory upsert ──────────────────────────────────────────────
        elif parsed.path == "/memory/upsert":
            if not self.auth_check_cap("write"): return
            data    = self.read_json_body()
            uri     = data.get("uri", "")
            content = data.get("content", "")
            tags    = data.get("tags", [])
            if not uri:
                self.reply_json({"error": "uri is required"}, 400); return
            if not content:
                self.reply_json({"error": "content is required"}, 400); return
            fpath = porter_uri_to_path(uri)
            if fpath is None:
                self.reply_json({"error": "invalid uri"}, 400); return
            created = not fpath.exists()
            fpath.parent.mkdir(parents=True, exist_ok=True)
            fpath.write_text(content, encoding="utf-8")
            from datetime import datetime, timezone
            version = datetime.now(timezone.utc).isoformat()
            self.reply_json({"ok": True, "uri": uri, "version": version, "created": created})

        # ── P1: memory pointer ─────────────────────────────────────────────
        elif parsed.path == "/memory/pointer":
            if not self.auth_check_cap("write"): return
            data = self.read_json_body()
            ptr_id     = data.get("id", "")
            title      = data.get("title", "")
            summary    = data.get("summary", "")
            porter_uri = data.get("porter_uri", "")
            tags       = data.get("tags", [])
            confidence = data.get("confidence", "medium")
            # collect all validation errors
            errors = []
            if not ptr_id or not re.match(r'^[\w\-]+$', ptr_id) or len(ptr_id) > 64:
                errors.append("id must be non-empty, match [\\w\\-]+, max 64 chars")
            if not title:
                errors.append("title is required")
            if not summary:
                errors.append("summary is required")
            if not porter_uri or not porter_uri.startswith("porter://"):
                errors.append("porter_uri must start with porter://")
            if confidence not in ("high", "medium", "low"):
                errors.append("confidence must be one of: high, medium, low")
            if not isinstance(tags, list):
                errors.append("tags must be a list")
            if errors:
                self.reply_json({"error": "; ".join(errors)}, 400); return
            from datetime import datetime, timezone
            now_iso = datetime.now(timezone.utc).isoformat()
            ptr_path = MEMORY_DIR / "pointers" / f"{ptr_id}.json"
            created_at = now_iso
            if ptr_path.exists():
                try:
                    existing = json.loads(ptr_path.read_text())
                    created_at = existing.get("created_at", now_iso)
                except Exception:
                    pass
            pointer = {
                "id":      ptr_id,
                "title":   title,
                "summary": summary,
                "source":  {"porter_uri": porter_uri, "version": now_iso},
                "tags":    tags,
                "confidence":     confidence,
                "created_at":     created_at,
                "updated_at":     now_iso,
                "last_validated": now_iso,
            }
            ptr_path.parent.mkdir(parents=True, exist_ok=True)
            ptr_path.write_text(json.dumps(pointer, indent=2))
            self.reply_json({
                "ok":        True,
                "id":        ptr_id,
                "uri":       f"porter://pointers/{ptr_id}.json",
                "updated_at": now_iso,
            })

        # ── nodes + mounts CRUD ────────────────────────────────────────────
        elif parsed.path == "/api/nodes":
            if not self.auth_check(redirect=False): return
            data   = self.read_json_body()
            action = data.get("action", "")

            if action == "add_node":
                raw_id = re.sub(r'[^\w\-]', '-', data.get("id", "")).lower().strip('-') or secrets.token_hex(4)
                existing = {n["id"] for n in _config.get("nodes", [])}
                nid = raw_id; sfx = 2
                while nid in existing: nid = f"{raw_id}-{sfx}"; sfx += 1
                new_node = {
                    "id": nid, "label": data.get("label", nid).strip(),
                    "type": data.get("type", "local"),
                    "hostname": data.get("hostname", ""),
                    "tailscale_ip": data.get("tailscale_ip"),
                    "mounts": [],
                }
                _config.setdefault("nodes", []).append(new_node)
                _load_serve_dirs(_config); save_config(_config)
                self.reply_json({"ok": True, "node": new_node})

            elif action == "update_node":
                node_id   = data.get("node_id", "")
                new_label = data.get("label", "").strip()
                new_type  = data.get("type", "")
                node = next((n for n in _config.get("nodes", []) if n["id"] == node_id), None)
                if not node:
                    self.reply_json({"error": "node not found"}, 404); return
                if new_label:
                    node["label"] = new_label
                if new_type in ("local", "vps", "tailscale"):
                    node["type"] = new_type
                _load_serve_dirs(_config); save_config(_config)
                self.reply_json({"ok": True, "node": {k: v for k, v in node.items() if k != "key_hash"}})

            elif action == "set_ssh_endpoint":
                node_id = data.get("node_id", "")
                user = str(data.get("user", "root")).strip()
                host = str(data.get("host", "")).strip()
                port = int(data.get("port", 22) or 22)
                if not re.match(r"^[a-zA-Z0-9._-]{1,64}$", user):
                    self.reply_json({"error": "invalid ssh user"}, 400); return
                if not re.match(r"^[a-zA-Z0-9:._-]{1,255}$", host):
                    self.reply_json({"error": "invalid host"}, 400); return
                if port < 1 or port > 65535:
                    self.reply_json({"error": "invalid port"}, 400); return
                node = next((n for n in _config.get("nodes", []) if n["id"] == node_id), None)
                if not node:
                    self.reply_json({"error": "node not found"}, 404); return
                node["ssh"] = {
                    "user": user,
                    "host": host,
                    "port": port,
                    "verified_at": datetime.now(timezone.utc).isoformat(),
                }
                save_config(_config)
                self.reply_json({"ok": True, "node": {k: v for k, v in node.items() if k != "key_hash"}})

            elif action == "delete_node":
                nid    = data.get("id", "")
                before = len(_config.get("nodes", []))
                _config["nodes"] = [n for n in _config.get("nodes", []) if n["id"] != nid]
                if len(_config["nodes"]) < before:
                    _load_serve_dirs(_config); save_config(_config)
                    self.reply_json({"ok": True})
                else:
                    self.reply_json({"error": "node not found"}, 404)

            elif action == "add_mount":
                nid   = data.get("node_id", "")
                m     = data.get("mount", {})
                mlbl  = m.get("label", "").strip()
                mpath = m.get("path",  "").strip()
                if not mlbl or not mpath:
                    self.reply_json({"error": "label and path required"}, 400); return
                mid = re.sub(r'[^\w\-]', '-', mlbl).lower().strip('-') or secrets.token_hex(4)
                all_ids = {mt["id"] for nd in _config.get("nodes", []) for mt in nd.get("mounts", [])}
                base = mid; sfx = 2
                while mid in all_ids: mid = f"{base}-{sfx}"; sfx += 1
                new_mount = {"id": mid, "label": mlbl, "path": mpath, "visible": True}
                for node in _config.get("nodes", []):
                    if node["id"] == nid:
                        node.setdefault("mounts", []).append(new_mount)
                        _load_serve_dirs(_config); save_config(_config)
                        self.reply_json({"ok": True, "mount": new_mount}); return
                self.reply_json({"error": "node not found"}, 404)

            elif action == "update_mount":
                nid = data.get("node_id", ""); mid = data.get("mount_id", "")
                upd = data.get("updates", {})
                for node in _config.get("nodes", []):
                    if node["id"] == nid:
                        for mount in node.get("mounts", []):
                            if mount["id"] == mid:
                                for k in ("label", "path", "visible"):
                                    if k in upd: mount[k] = upd[k]
                                _load_serve_dirs(_config); save_config(_config)
                                self.reply_json({"ok": True, "mount": mount}); return
                        self.reply_json({"error": "mount not found"}, 404); return
                self.reply_json({"error": "node not found"}, 404)

            elif action == "delete_mount":
                nid = data.get("node_id", ""); mid = data.get("mount_id", "")
                for node in _config.get("nodes", []):
                    if node["id"] == nid:
                        before = len(node.get("mounts", []))
                        node["mounts"] = [m for m in node.get("mounts", []) if m["id"] != mid]
                        if len(node["mounts"]) < before:
                            _load_serve_dirs(_config); save_config(_config)
                            self.reply_json({"ok": True}); return
                        self.reply_json({"error": "mount not found"}, 404); return
                self.reply_json({"error": "node not found"}, 404)

            else:
                self.reply_json({"error": "unknown action"}, 400)

        # ── locations (backward-compat, thin wrapper over nodes) ──────────
        elif parsed.path == "/api/locations":
            if not self.auth_check(redirect=False): return
            data   = self.read_json_body()
            action = data.get("action", "")
            loc    = data.get("location", {})
            # delegate add/remove to the default local node's mounts
            local_node = next((n for n in _config.get("nodes", []) if n.get("type") == "local"), None)

            if action == "add" and local_node:
                mlbl  = loc.get("label", "").strip()
                mpath = loc.get("path",  "").strip()
                if not mlbl or not mpath:
                    self.reply_json({"error": "label and path are required"}, 400); return
                mid = re.sub(r'[^\w\-]', '-', mlbl).lower().strip('-') or secrets.token_hex(4)
                all_ids = {mt["id"] for nd in _config.get("nodes", []) for mt in nd.get("mounts", [])}
                base = mid; sfx = 2
                while mid in all_ids: mid = f"{base}-{sfx}"; sfx += 1
                new_mount = {"id": mid, "label": mlbl, "path": mpath, "visible": True}
                local_node.setdefault("mounts", []).append(new_mount)
                _load_serve_dirs(_config); save_config(_config)
                self.reply_json({"ok": True, "location": {**new_mount, "type": "local"}})

            elif action == "update":
                lid = loc.get("id", "")
                for node in _config.get("nodes", []):
                    for mount in node.get("mounts", []):
                        if mount["id"] == lid:
                            for k in ("label", "path"):
                                if k in loc: mount[k] = loc[k]
                            _load_serve_dirs(_config); save_config(_config)
                            self.reply_json({"ok": True, "location": mount}); return
                self.reply_json({"error": "not found"}, 404)

            elif action == "remove":
                lid = loc.get("id", "")
                for node in _config.get("nodes", []):
                    before = len(node.get("mounts", []))
                    node["mounts"] = [m for m in node.get("mounts", []) if m["id"] != lid]
                    if len(node["mounts"]) < before:
                        _load_serve_dirs(_config); save_config(_config)
                        self.reply_json({"ok": True}); return
                self.reply_json({"error": "not found"}, 404)

            else:
                self.reply_json({"error": "unknown action"}, 400)

        elif parsed.path == "/api/locations/test":
            if not self.auth_check(redirect=False): return
            data  = self.read_json_body()
            tpath = Path(data.get("path", "").strip())
            exists   = tpath.exists()
            readable = False
            writable = False
            if exists:
                try:    readable = os.access(str(tpath), os.R_OK)
                except Exception: pass
                try:    writable = os.access(str(tpath), os.W_OK)
                except Exception: pass
            self.reply_json({"ok": exists, "exists": exists, "readable": readable, "writable": writable})

        # ── agent usage tracker ────────────────────────────────────────────
        elif parsed.path == "/agent-usage/snapshot":
            if not self.auth_check(redirect=False): return
            from datetime import datetime, timezone
            d = self.read_json_body()
            agent_id = d.get("agent_id", "").strip()
            if not agent_id:
                self.reply_json({"error": "agent_id required"}, 400); return
            status = d.get("status", "unknown")
            if status not in ("available", "degraded", "rate_limited", "exhausted", "unknown"):
                status = "unknown"
            snapshot = {
                "agent_id":         agent_id,
                "provider":         d.get("provider", "unknown"),
                "captured_at":      datetime.now(timezone.utc).isoformat(),
                "status":           status,
                "usage_percent":    d.get("usage_percent"),
                "window_started_at":d.get("window_started_at"),
                "window_resets_at": d.get("window_resets_at"),
                "source_type":      d.get("source_type", "api"),
            }
            USAGE_DIR.mkdir(parents=True, exist_ok=True)
            (USAGE_DIR / f"{agent_id}.json").write_text(json.dumps(snapshot, indent=2))
            self.reply_json({"ok": True, "captured_at": snapshot["captured_at"]})

        elif parsed.path == "/agent-usage/parse":
            if not self.auth_check(redirect=False): return
            d = self.read_json_body()
            raw    = d.get("raw", "")
            provider = d.get("provider", "claude_code")
            result = {"status": "unknown", "usage_percent": None,
                      "window_resets_at": None, "source_type": "cli_parse"}
            if provider == "claude_code":
                # match "X%" usage patterns
                m = re.search(r'(\d+)\s*%', raw)
                if m:
                    pct = int(m.group(1))
                    result["usage_percent"] = pct
                    result["status"] = "exhausted" if pct >= 100 else \
                                       "rate_limited" if pct >= 90 else \
                                       "degraded"    if pct >= 75 else "available"
                # match reset/resets timestamp
                m2 = re.search(r'[Rr]eset[s]?\D{0,10}(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2})', raw)
                if m2:
                    result["window_resets_at"] = m2.group(1).replace(" ", "T") + ":00Z"
            elif provider == "openclaw":
                m = re.search(r'(\d+)\s*%', raw)
                if m:
                    pct = int(m.group(1))
                    result["usage_percent"] = pct
                    result["status"] = "exhausted" if pct >= 100 else \
                                       "rate_limited" if pct >= 90 else \
                                       "degraded"    if pct >= 75 else "available"
                m2 = re.search(r'[Rr]eset[s]?\D{0,10}(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2})', raw)
                if m2:
                    result["window_resets_at"] = m2.group(1).replace(" ", "T") + ":00Z"
            self.reply_json(result)

        # ── agents CRUD ────────────────────────────────────────────────────
        elif parsed.path == "/api/agents":
            if not self.auth_check(redirect=False): return
            data   = self.read_json_body()
            action = data.get("action", "")

            if action == "create":
                name       = data.get("name", "").strip()
                agent_type = data.get("type", "generic")
                role       = data.get("role", "writer")
                namespaces = data.get("namespaces", list(MEMORY_NAMESPACES))
                if not name:
                    self.reply_json({"error": "name is required"}, 400); return
                if role not in ("viewer", "writer", "operator", "admin"):
                    self.reply_json({"error": "role must be viewer/writer/operator/admin"}, 400); return
                from datetime import datetime, timezone
                raw_key  = secrets.token_hex(32)
                agent_id = secrets.token_hex(8)
                agent    = {
                    "id":               agent_id,
                    "name":             name,
                    "type":             agent_type,
                    "key_hash":         _hash_agent_key(raw_key),
                    "raw_key":          raw_key,
                    "role":             role,
                    "namespaces":       namespaces,
                    "created_at":       datetime.now(timezone.utc).isoformat(),
                    "last_seen":        None,
                    "runtime_location": data.get("runtime_location", "local"),
                    "model_source":     data.get("model_source", "cloud"),
                    "model_id":         data.get("model_id", ""),
                    "agent_type":       data.get("agent_type", "production"),
                    "limit_type":       data.get("limit_type", "none"),
                }
                _config.setdefault("agents", []).append(agent)
                save_config(_config)
                safe = {k: v for k, v in agent.items() if k != "key_hash"}
                self.reply_json({"ok": True, "agent": safe, "key": raw_key})

            elif action == "revoke":
                agent_id = data.get("id", "")
                before   = len(_config.get("agents", []))
                _config["agents"] = [a for a in _config.get("agents", []) if a["id"] != agent_id]
                if len(_config["agents"]) < before:
                    save_config(_config)
                    self.reply_json({"ok": True})
                else:
                    self.reply_json({"error": "agent not found"}, 404)

            else:
                self.reply_json({"error": "unknown action"}, 400)

        elif parsed.path == "/api/agents/rotate-key":
            if not self.auth_check(redirect=False): return
            data     = self.read_json_body()
            agent_id = data.get("id", "")
            agent    = _agent_by_id(agent_id)
            if not agent:
                self.reply_json({"error": "agent not found"}, 404); return
            raw_key           = secrets.token_hex(32)
            agent["key_hash"] = _hash_agent_key(raw_key)
            agent["raw_key"]  = raw_key
            save_config(_config)
            self.reply_json({"ok": True, "key": raw_key})

        # ── preferences ────────────────────────────────────────────────────
        elif parsed.path == "/api/preferences":
            if not self.auth_check(redirect=False): return
            data  = self.read_json_body()
            prefs = _config.setdefault("preferences", {})
            allowed = {"onboarding_complete", "default_location", "checkpoint_interval",
                       "lease_ttl", "auto_resume", "show_hidden", "density", "editor_font_size",
                       "policy_preset"}
            for k, v in data.items():
                if k in allowed:
                    prefs[k] = v
            save_config(_config)
            self.reply_json({"ok": True, "preferences": prefs})

        # ── permissions check ──────────────────────────────────────────────
        elif parsed.path == "/api/permissions/check":
            if not self.auth_check(redirect=False): return
            data       = self.read_json_body()
            agent_id   = data.get("agent_id", "")
            namespace  = data.get("namespace", "")
            capability = data.get("capability", "read")
            agent = _agent_by_id(agent_id)
            if not agent:
                self.reply_json({"allowed": False, "reason": "agent not found"}); return
            role = agent.get("role", "viewer")
            # simple role hierarchy: admin > operator > writer > viewer
            role_caps = {
                "viewer":   {"read"},
                "writer":   {"read", "write", "checkpoint"},
                "operator": {"read", "write", "checkpoint", "finalize"},
                "admin":    {"read", "write", "checkpoint", "finalize", "admin"},
            }
            caps = role_caps.get(role, set())
            ns_ok = (not namespace) or (namespace in agent.get("namespaces", []))
            allowed = capability in caps and ns_ok
            self.reply_json({"allowed": allowed, "role": role, "namespace": namespace})

        # ── P2: task operations ────────────────────────────────────────────
        elif parsed.path == "/api/tasks":
            if not self.auth_check(redirect=False): return
            data    = self.read_json_body()
            action  = data.get("action", "")
            now     = time.time()
            session = self.get_session_token()
            actor   = _config.get("username", "admin") if session else "agent"

            if action == "clear_completed":
                leases_dir = RUNTIME_DIR / "leases"
                removed = 0
                if leases_dir.exists():
                    for lf in list(leases_dir.glob("*.json")):
                        try:
                            lease = json.loads(lf.read_text())
                            if lease.get("state") in ("complete", "cancelled"):
                                lf.unlink()
                                removed += 1
                        except Exception:
                            pass
                _append_audit("task.clear_completed", "*", actor, details={"removed": removed})
                self.reply_json({"ok": True, "removed": removed})

            elif action == "update_agent_concurrency":
                agent_id    = data.get("agent_id", "")
                try:
                    max_c = int(data.get("max_concurrent", 0))
                except (TypeError, ValueError):
                    self.reply_json({"error": "max_concurrent must be an integer"}, 400); return
                if max_c < 0:
                    self.reply_json({"error": "max_concurrent must be >= 0"}, 400); return
                agent = _agent_by_id(agent_id)
                if not agent:
                    self.reply_json({"error": "agent not found"}, 404); return
                agent["max_concurrent"] = max_c
                save_config(_config)
                _append_audit("agent.set_concurrency", agent_id, actor,
                              details={"max_concurrent": max_c})
                self.reply_json({"ok": True, "agent_id": agent_id, "max_concurrent": max_c})

            else:
                task_id = data.get("task_id", "")
                if not task_id:
                    self.reply_json({"error": "task_id required"}, 400); return
                lease_path = RUNTIME_DIR / "leases" / f"{task_id}.json"
                if not lease_path.exists():
                    self.reply_json({"error": "task not found"}, 404); return
                try:
                    lease = json.loads(lease_path.read_text())
                except Exception:
                    lease = {}
                state = lease.get("state", "running")
                # auto-classify stalled
                if state == "running" and lease.get("expires_at", 0) < now:
                    state = "stalled"

                if action == "pause":
                    if state not in ("running", "stalled"):
                        self.reply_json({"error": f"Cannot pause task in state: {state}"}, 409); return
                    lease["state"] = "paused"
                    lease_path.write_text(json.dumps(lease, indent=2))
                    _append_audit("task.pause", task_id, actor)
                    self.reply_json({"ok": True, "task_id": task_id, "state": "paused"})

                elif action == "resume":
                    if state != "paused":
                        self.reply_json({"error": f"Cannot resume task in state: {state}"}, 409); return
                    ttl = _config.get("preferences", {}).get("lease_ttl", 300)
                    lease["state"]          = "running"
                    lease["last_heartbeat"] = now
                    lease["expires_at"]     = now + ttl
                    lease_path.write_text(json.dumps(lease, indent=2))
                    _append_audit("task.resume", task_id, actor)
                    self.reply_json({"ok": True, "task_id": task_id, "state": "running"})

                elif action == "cancel":
                    if state in ("complete", "cancelled"):
                        self.reply_json({"error": f"Task already in terminal state: {state}"}, 409); return
                    lease["state"] = "cancelled"
                    lease_path.write_text(json.dumps(lease, indent=2))
                    # append cancel step to checkpoint log
                    ckpt_path = RUNTIME_DIR / "checkpoints" / f"{task_id}.jsonl"
                    cancel_entry = json.dumps({
                        "task_id":   task_id,
                        "step_id":   "cancel",
                        "operation": "cancel",
                        "status":    "done",
                        "timestamp": now,
                        "metadata":  {"cancelled_by": actor},
                    })
                    try:
                        with open(ckpt_path, "a", encoding="utf-8") as f:
                            f.write(cancel_entry + "\n")
                    except Exception:
                        pass
                    _append_audit("task.cancel", task_id, actor)
                    self.reply_json({"ok": True, "task_id": task_id, "state": "cancelled"})

                else:
                    self.reply_json({"error": f"Unknown action: {action}"}, 400)

        # ── POST: schedules ──────────────────────────────────────────────────────
        elif parsed.path == "/api/schedules":
            if not self.auth_check(redirect=False): return
            data = self.read_json_body()
            action = data.get("action", "")
            if action == "add_schedule":
                job = {
                    "id":       secrets.token_hex(8),
                    "name":     data.get("name", "").strip(),
                    "schedule": data.get("schedule", "").strip(),
                    "target":   data.get("target", "").strip(),
                    "enabled":  data.get("enabled", True),
                }
                if not job["name"] or not job["schedule"]:
                    self.reply_json({"error": "name and schedule required"}, 400); return
                _config.setdefault("schedules", []).append(job)
                save_config(_config); self.reply_json({"ok": True, "id": job["id"]})
            elif action == "update_schedule":
                sid = data.get("id", "")
                jobs = _config.get("schedules", [])
                for j in jobs:
                    if j.get("id") == sid:
                        j.update({k: data[k] for k in ("name","schedule","target","enabled") if k in data})
                        break
                else:
                    self.reply_json({"error": "schedule not found"}, 404); return
                save_config(_config); self.reply_json({"ok": True})
            elif action == "delete_schedule":
                sid = data.get("id", "")
                _config["schedules"] = [j for j in _config.get("schedules", []) if j.get("id") != sid]
                save_config(_config); self.reply_json({"ok": True})
            elif action in ("enable_schedule", "disable_schedule"):
                sid = data.get("id", "")
                enabled = action == "enable_schedule"
                for j in _config.get("schedules", []):
                    if j.get("id") == sid: j["enabled"] = enabled; break
                save_config(_config); self.reply_json({"ok": True})
            else:
                self.reply_json({"error": "unknown action"}, 400)

        # ── POST: tools ─────────────────────────────────────────────────────────
        elif parsed.path == "/api/tools":
            if not self.auth_check(redirect=False): return
            data = self.read_json_body()
            action = data.get("action", "")
            if action == "add_tool":
                tool = {
                    "id":               secrets.token_hex(8),
                    "name":             data.get("name", "").strip(),
                    "provider":         data.get("provider", "").strip(),
                    "capability_tags":  data.get("capability_tags", []),
                    "cost_profile":     data.get("cost_profile", "unknown"),
                    "trust_tier":       data.get("trust_tier", "restricted"),
                    "enabled":          True,
                }
                if not tool["name"]: self.reply_json({"error": "name required"}, 400); return
                _config.setdefault("tools", []).append(tool)
                save_config(_config); self.reply_json({"ok": True, "id": tool["id"]})
            elif action == "update_tool":
                tid = data.get("id", "")
                for t in _config.get("tools", []):
                    if t.get("id") == tid:
                        for k in ("name","provider","capability_tags","cost_profile","trust_tier"):
                            if k in data: t[k] = data[k]
                        break
                else:
                    self.reply_json({"error": "tool not found"}, 404); return
                save_config(_config); self.reply_json({"ok": True})
            elif action == "delete_tool":
                tid = data.get("id", "")
                _config["tools"] = [t for t in _config.get("tools", []) if t.get("id") != tid]
                save_config(_config); self.reply_json({"ok": True})
            elif action == "update_policy":
                policy = {
                    "mode":             data.get("mode", "auto"),
                    "strategy":         data.get("strategy", "balanced"),
                    "budget_guardrails": data.get("budget_guardrails", DEFAULT_TOOL_POLICY["budget_guardrails"]),
                }
                _config["tool_selection_policy"] = policy
                save_config(_config); self.reply_json({"ok": True})
            else:
                self.reply_json({"error": "unknown action"}, 400)

        else:
            self.reply_html("<h1>Not found</h1>", 404)

# ── main ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    _config.update(load_config())
    _load_serve_dirs(_config)
    ensure_runtime_dirs()
    ensure_memory_dirs()
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"\n  Porter v0.12.70 ready (localhost only)")
    print(f"  SSH tunnel:  ssh -L {PORT}:localhost:{PORT} lobster@{HOST}")
    print(f"  Then open:   http://localhost:{PORT}\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")
