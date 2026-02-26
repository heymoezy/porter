#!/usr/bin/env python3
"""
Porter Agent v0.1.0 — PEP/1 Phase 1
Single-file, stdlib-only agent. Registers with a Porter Hub over Tailscale,
serves local filesystem operations, and sends periodic heartbeats.

Usage:
  python3 porter-agent.py --hub http://<hub-tailscale-ip>:8877 \
                          --token <one-time-registration-token> \
                          --node-id <node-id> \
                          [--paths /path/one /path/two] \
                          [--port 8878]

After first registration the agent token is saved to ~/.porter/agent.json
and --token is no longer needed on subsequent starts.
"""
import argparse
import base64
import hashlib
import json
import os
import re
import secrets
import shutil
import signal
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse
import urllib.request
import urllib.error

# ── constants ──────────────────────────────────────────────────────────────
AGENT_VERSION      = "0.1.0"
PEP_VERSION        = "1.0"
DEFAULT_PORT       = 8878
HEARTBEAT_INTERVAL = 60       # seconds
STATE_FILE         = Path.home() / ".porter" / "agent.json"
CAPABILITIES       = ["fs.read", "fs.write", "fs.mkdir", "fs.delete"]

# ── state (populated after registration) ──────────────────────────────────
_state: dict = {}   # hub_url, node_id, agent_token, allowed_paths, port


# ── safe path resolution ───────────────────────────────────────────────────

def safe_resolve(allowed_paths: list, req_path: str) -> "Path | None":
    """Resolve req_path and verify it falls under one of allowed_paths.
    Returns resolved Path or None if the path is outside policy."""
    if not req_path or not allowed_paths:
        return None
    try:
        p = Path(unquote(req_path)).resolve()
    except Exception:
        return None
    for ap in allowed_paths:
        try:
            base = Path(ap).resolve()
            p.relative_to(base)   # raises ValueError if not under base
            return p
        except ValueError:
            continue
    return None


def is_writable(path: Path) -> bool:
    """True if path (or its parent) is owned by the current user."""
    check = path if path.exists() else path.parent
    try:
        return check.stat().st_uid == os.getuid()
    except Exception:
        return False


# ── hub communication ──────────────────────────────────────────────────────

def _hub_post(path: str, body: dict, token: str = "") -> dict:
    url  = _state["hub_url"].rstrip("/") + path
    data = json.dumps(body).encode()
    headers = {"Content-Type": "application/json", "Content-Length": str(len(data))}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read())
        except Exception:
            return {"ok": False, "error": str(e)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _detect_tailscale_ip() -> str:
    """Best-effort: read Tailscale IP from `tailscale ip` or ip addr."""
    try:
        import subprocess
        r = subprocess.run(["tailscale", "ip", "-4"], capture_output=True, text=True, timeout=5)
        ip = r.stdout.strip().split()[0] if r.returncode == 0 else ""
        if ip:
            return ip
    except Exception:
        pass
    # Fallback: first non-loopback IPv4
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return ""


def register(hub_url: str, node_id: str, reg_token: str,
             allowed_paths: list, port: int) -> bool:
    """Register with the Hub using the one-time token. Returns True on success."""
    print(f"  [agent] Registering with hub {hub_url} as node '{node_id}'...")
    ts_ip = _detect_tailscale_ip()
    import platform as _platform
    body = {
        "pep_version":         PEP_VERSION,
        "agent_version":       AGENT_VERSION,
        "node_id":             node_id,
        "registration_token":  reg_token,
        "tailscale_ip":        ts_ip,
        "agent_port":          port,
        "allowed_paths":       allowed_paths,
        "platform": {
            "os":         sys.platform,
            "arch":       _platform.machine(),
            "os_version": _platform.version()[:80],
        },
        "capabilities": CAPABILITIES,
    }
    resp = _hub_post("/pep/v1/agent/register", body)
    if not resp.get("ok"):
        err = resp.get("error", {})
        msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
        print(f"  [agent] Registration failed: {msg}")
        return False

    agent_token = resp["agent_token"]
    _state.update({
        "hub_url":       hub_url,
        "node_id":       node_id,
        "agent_token":   agent_token,
        "allowed_paths": allowed_paths,
        "port":          port,
        "tailscale_ip":  ts_ip,
    })
    _save_state()
    print(f"  [agent] Registered successfully. Token saved to {STATE_FILE}")
    return True


def _save_state() -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps({k: v for k, v in _state.items()}, indent=2))
    STATE_FILE.chmod(0o600)


def _load_state() -> bool:
    if not STATE_FILE.exists():
        return False
    try:
        data = json.loads(STATE_FILE.read_text())
        _state.update(data)
        return bool(_state.get("agent_token") and _state.get("hub_url"))
    except Exception:
        return False


# ── heartbeat loop ─────────────────────────────────────────────────────────

def _heartbeat_loop() -> None:
    while True:
        time.sleep(HEARTBEAT_INTERVAL)
        try:
            ts_ip = _detect_tailscale_ip()
            resp = _hub_post("/pep/v1/agent/heartbeat",
                             {"node_id": _state["node_id"], "tailscale_ip": ts_ip},
                             token=_state["agent_token"])
            if resp.get("ok"):
                print(f"  [agent] Heartbeat OK ({time.strftime('%H:%M:%S')})")
            else:
                err = resp.get("error", {})
                print(f"  [agent] Heartbeat failed: {err}")
        except Exception as e:
            print(f"  [agent] Heartbeat error: {e}")


# ── FS HTTP server ─────────────────────────────────────────────────────────

class AgentHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        print(f"  [agent] {fmt % args}")

    def _auth(self) -> bool:
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            self._err(401, "AUTH_REQUIRED", "Missing Bearer token")
            return False
        if auth[7:].strip() != _state.get("agent_token", ""):
            self._err(401, "AUTH_INVALID", "Invalid agent token")
            return False
        return True

    def _err(self, code: int, err_code: str, message: str, retryable: bool = False) -> None:
        self._json({"error": {"code": err_code, "message": message, "retryable": retryable}}, code)

    def _json(self, data: dict, code: int = 200) -> None:
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _resolve(self, req_path: str) -> "Path | None":
        p = safe_resolve(_state.get("allowed_paths", []), req_path)
        if p is None:
            self._err(403, "FORBIDDEN", "Path outside allowed mounts")
        return p

    def do_GET(self) -> None:
        if not self._auth():
            return
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        req_path = qs.get("path", [""])[0]

        # /pep/v1/fs/local/list
        if parsed.path == "/pep/v1/fs/local/list":
            target = self._resolve(req_path)
            if target is None:
                return
            if not target.is_dir():
                self._err(404, "PATH_NOT_FOUND", "Not a directory")
                return
            entries = []
            try:
                for child in sorted(target.iterdir(), key=lambda p: (p.is_file(), p.name.lower())):
                    try:
                        st = child.stat()
                        entries.append({
                            "name":  child.name,
                            "type":  "file" if child.is_file() else "dir",
                            "size":  st.st_size if child.is_file() else None,
                            "mtime": st.st_mtime,
                        })
                    except Exception:
                        pass
            except PermissionError:
                self._err(403, "FORBIDDEN", "Permission denied reading directory")
                return
            self._json({"node_id": _state["node_id"], "path": str(target), "entries": entries})

        elif parsed.path == "/pep/v1/fs/local/read":
            target = self._resolve(req_path)
            if target is None:
                return
            if not target.is_file():
                self._err(404, "PATH_NOT_FOUND", "File not found")
                return
            try:
                content = target.read_bytes()
            except PermissionError:
                self._err(403, "FORBIDDEN", "Permission denied reading file")
                return
            self._json({
                "node_id":     _state["node_id"],
                "path":        str(target),
                "content_b64": base64.b64encode(content).decode(),
                "size":        len(content),
            })

        elif parsed.path == "/pep/v1/fs/local/stat":
            target = self._resolve(req_path)
            if target is None:
                return
            if not target.exists():
                self._err(404, "PATH_NOT_FOUND", "Path not found")
                return
            st = target.stat()
            self._json({
                "node_id": _state["node_id"],
                "path":    str(target),
                "type":    "file" if target.is_file() else "dir",
                "size":    st.st_size,
                "mtime":   st.st_mtime,
            })

        elif parsed.path == "/pep/v1/health":
            self._json({"ok": True, "node_id": _state.get("node_id"),
                        "agent_version": AGENT_VERSION, "ts": time.time()})

        else:
            self._err(404, "NOT_FOUND", f"Unknown endpoint: {parsed.path}")

    def do_POST(self) -> None:
        if not self._auth():
            return
        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length", 0))
        try:
            data = json.loads(self.rfile.read(length)) if length else {}
        except Exception:
            self._err(400, "BAD_REQUEST", "Invalid JSON body")
            return
        req_path = str(data.get("path", "")).strip()

        if parsed.path == "/pep/v1/fs/local/write":
            target = self._resolve(req_path)
            if target is None:
                return
            content_b64 = data.get("content_b64", "")
            try:
                content = base64.b64decode(content_b64)
            except Exception:
                self._err(400, "BAD_REQUEST", "Invalid base64 content")
                return
            if not is_writable(target.parent if not target.exists() else target):
                self._err(403, "FORBIDDEN", "Path is read-only (not owned by this user)")
                return
            try:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)
            except PermissionError:
                self._err(403, "FORBIDDEN", "Permission denied writing file")
                return
            self._json({"ok": True, "path": str(target), "size": len(content)})

        elif parsed.path == "/pep/v1/fs/local/mkdir":
            target = self._resolve(req_path)
            if target is None:
                return
            if not is_writable(target.parent if not target.exists() else target):
                self._err(403, "FORBIDDEN", "Path is read-only")
                return
            try:
                target.mkdir(parents=True, exist_ok=True)
            except PermissionError:
                self._err(403, "FORBIDDEN", "Permission denied creating directory")
                return
            self._json({"ok": True, "path": str(target)})

        elif parsed.path == "/pep/v1/fs/local/delete":
            target = self._resolve(req_path)
            if target is None:
                return
            if not target.exists():
                self._err(404, "PATH_NOT_FOUND", "Path not found")
                return
            if not is_writable(target):
                self._err(403, "FORBIDDEN", "Path is read-only")
                return
            try:
                if target.is_dir():
                    shutil.rmtree(str(target))
                else:
                    target.unlink()
            except PermissionError:
                self._err(403, "FORBIDDEN", "Permission denied deleting path")
                return
            self._json({"ok": True, "path": str(target)})

        else:
            self._err(404, "NOT_FOUND", f"Unknown endpoint: {parsed.path}")


# ── main ───────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Porter PEP/1 Agent")
    parser.add_argument("--hub",     help="Hub URL, e.g. http://100.x.y.z:8877")
    parser.add_argument("--token",   help="One-time registration token from Hub UI")
    parser.add_argument("--node-id", help="Node ID matching Hub configuration", dest="node_id")
    parser.add_argument("--paths",   nargs="+", default=[], help="Filesystem paths this agent may serve")
    parser.add_argument("--port",    type=int, default=DEFAULT_PORT, help=f"Local HTTP port (default {DEFAULT_PORT})")
    args = parser.parse_args()

    # Try loading saved state first
    loaded = _load_state()

    if args.hub and args.token and args.node_id:
        # Fresh registration (or re-registration)
        allowed = args.paths or ([str(Path.home())] if not loaded else _state.get("allowed_paths", []))
        if not register(args.hub, args.node_id, args.token, allowed, args.port):
            sys.exit(1)
    elif loaded:
        print(f"  [agent] Resuming as node '{_state['node_id']}' (loaded from {STATE_FILE})")
        if args.port:
            _state["port"] = args.port
    else:
        print("  [agent] No saved state found. Provide --hub, --token, and --node-id to register.")
        print("  [agent] Example:")
        print("    python3 porter-agent.py --hub http://100.x.y.z:8877 \\")
        print("                            --token <token-from-hub-ui> \\")
        print("                            --node-id my-mac \\")
        print("                            --paths /Users/me/projects /Users/me/docs")
        sys.exit(1)

    port = _state.get("port", DEFAULT_PORT)
    allowed_paths = _state.get("allowed_paths", [])

    print(f"  [agent] Node:    {_state['node_id']}")
    print(f"  [agent] Hub:     {_state['hub_url']}")
    print(f"  [agent] Serving: {allowed_paths}")
    print(f"  [agent] Port:    {port} (localhost only)")
    print(f"  [agent] Starting heartbeat every {HEARTBEAT_INTERVAL}s...")

    # Heartbeat in background thread
    hb = threading.Thread(target=_heartbeat_loop, daemon=True)
    hb.start()

    # FS HTTP server — localhost only for security (Hub reaches via Tailscale overlay)
    server = HTTPServer(("0.0.0.0", port), AgentHandler)

    def _stop(sig, frame):
        print("\n  [agent] Stopping.")
        server.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    print(f"  [agent] Ready. Listening on 0.0.0.0:{port}\n")
    server.serve_forever()


if __name__ == "__main__":
    main()
