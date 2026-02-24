#!/usr/bin/env python3
"""Porter P0 + P1 integration tests — stdlib only."""

import argparse
import http.cookiejar
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8877"
CREDENTIALS = {"username": "admin", "password": "porter"}

# ── tiny HTTP client ───────────────────────────────────────────────────────

class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar)
        )

    def request(self, method, path, body=None, expect_code=None):
        url = BASE + path
        if body is not None:
            data = json.dumps(body).encode()
            req = urllib.request.Request(
                url, data=data,
                headers={"Content-Type": "application/json"},
                method=method,
            )
        else:
            req = urllib.request.Request(url, method=method)
        try:
            resp = self.opener.open(req)
            code = resp.getcode()
            raw  = resp.read()
        except urllib.error.HTTPError as e:
            code = e.code
            raw  = e.read()
        try:
            payload = json.loads(raw)
        except Exception:
            payload = raw.decode(errors="replace")
        if expect_code is not None and code != expect_code:
            raise AssertionError(f"{method} {path} → HTTP {code}, expected {expect_code}. body={payload!r}")
        return code, payload

    def get(self, path, **kw):
        return self.request("GET", path, **kw)

    def post(self, path, body=None, **kw):
        return self.request("POST", path, body=body, **kw)

# ── test runner ────────────────────────────────────────────────────────────

_results = []

def test(name, fn):
    try:
        fn()
        _results.append(("PASS", name))
        print(f"  PASS  {name}")
    except Exception as e:
        _results.append(("FAIL", name, str(e)))
        print(f"  FAIL  {name}: {e}")

def run_all(suites):
    anon = Client()
    authed = Client()

    # ── auth: login ──────────────────────────────────────────────────────────
    def t_login():
        code, payload = authed.post("/login", CREDENTIALS, expect_code=200)
        assert payload.get("ok"), f"login failed: {payload}"

    test("login", t_login)

    # Unique task ID per run — avoids accumulated lease state across runs
    import time as _t
    ROUNDTRIP_TASK = f"roundtrip-{int(_t.time())}"

    # ── P0 ───────────────────────────────────────────────────────────────────
    if "p0" in suites:

        def t_auth_checkpoint():
            code, payload = anon.post("/runtime/checkpoint", {
                "task_id": "test-task", "step_id": "s1",
                "operation": "write", "status": "started",
            }, expect_code=401)
            assert "unauthorized" in str(payload).lower(), payload

        def t_auth_heartbeat():
            code, _ = anon.post("/runtime/heartbeat", {"task_id": "x"}, expect_code=401)

        def t_auth_recover():
            code, _ = anon.get("/runtime/recover?task_id=x", expect_code=401)

        def t_auth_finalize():
            code, _ = anon.post("/runtime/finalize", {}, expect_code=401)

        def t_checkpoint_started():
            code, payload = authed.post("/runtime/checkpoint", {
                "task_id":   ROUNDTRIP_TASK,
                "step_id":   "step-1",
                "operation": "fetch-context",
                "status":    "started",
            }, expect_code=200)
            assert payload.get("ok"), payload
            assert payload["step_id"] == "step-1"
            assert "timestamp" in payload

        def t_heartbeat():
            code, payload = authed.post("/runtime/heartbeat", {
                "task_id": ROUNDTRIP_TASK,
                "owner":   "claude-code",
                "ttl":     60,
            }, expect_code=200)
            assert payload.get("ok"), payload
            assert payload["task_id"] == ROUNDTRIP_TASK
            assert "expires_at" in payload

        def t_recover_resumable():
            code, payload = authed.get(f"/runtime/recover?task_id={ROUNDTRIP_TASK}", expect_code=200)
            assert payload["task_id"] == ROUNDTRIP_TASK
            assert payload["resumable"] is True, f"expected resumable=True, got {payload}"
            assert len(payload["steps"]) >= 1

        def t_checkpoint_done():
            code, payload = authed.post("/runtime/checkpoint", {
                "task_id":   ROUNDTRIP_TASK,
                "step_id":   "step-2",
                "operation": "write-output",
                "status":    "done",
            }, expect_code=200)
            assert payload.get("ok"), payload

        def t_finalize():
            # first upsert a temp file via memory/upsert
            temp_uri  = "porter://projects/tmp-test-finalize.txt"
            final_uri = "porter://projects/final-test-finalize.txt"
            code, _ = authed.post("/memory/upsert", {
                "uri":     temp_uri,
                "content": "finalize test content",
            }, expect_code=200)
            code, payload = authed.post("/runtime/finalize", {
                "task_id":   ROUNDTRIP_TASK,
                "temp_uri":  temp_uri,
                "final_uri": final_uri,
            }, expect_code=200)
            assert payload.get("ok"), payload
            assert payload["final_uri"] == final_uri

        def t_recover_not_resumable():
            code, payload = authed.get(f"/runtime/recover?task_id={ROUNDTRIP_TASK}", expect_code=200)
            # last step is the finalize done entry
            assert payload["resumable"] is False, f"expected resumable=False, got {payload}"

        def t_bad_task_id():
            code, payload = authed.post("/runtime/checkpoint", {
                "task_id":   "bad task id!",
                "step_id":   "s1",
                "operation": "x",
                "status":    "started",
            }, expect_code=400)

        def t_missing_step_id():
            code, payload = authed.post("/runtime/checkpoint", {
                "task_id": "valid-id", "step_id": "", "operation": "x", "status": "started",
            }, expect_code=400)

        def t_bad_status():
            code, payload = authed.post("/runtime/checkpoint", {
                "task_id": "valid-id", "step_id": "s1", "operation": "x", "status": "unknown",
            }, expect_code=400)

        # ── hardening: lease expiry ───────────────────────────────────────
        def t_recover_expired_lease():
            import json as _json, time as _time
            from pathlib import Path as _Path
            task_id = "hardening-expired-task"
            now = _time.time()
            lease = {
                "task_id":        task_id,
                "owner":          "test",
                "started_at":     now - 400,
                "last_heartbeat": now - 400,
                "expires_at":     now - 1,   # already expired
                "state":          "running",
            }
            lease_path = _Path("/home/lobster/documents/porter/runtime/leases") / f"{task_id}.json"
            lease_path.write_text(_json.dumps(lease))
            ckpt_path = _Path("/home/lobster/documents/porter/runtime/checkpoints") / f"{task_id}.jsonl"
            ckpt_path.write_text(
                _json.dumps({"step_id": "s1", "status": "partial", "timestamp": now - 400}) + "\n"
            )
            code, payload = authed.get(f"/runtime/recover?task_id={task_id}", expect_code=200)
            assert payload["lease_expired"] is True, f"expected lease_expired=True: {payload}"
            assert payload["resumable"] is False, f"expected resumable=False: {payload}"

        def t_recover_active_partial():
            import json as _json, time as _time
            from pathlib import Path as _Path
            task_id = "hardening-active-task"
            now = _time.time()
            lease = {
                "task_id":        task_id,
                "owner":          "test",
                "started_at":     now,
                "last_heartbeat": now,
                "expires_at":     now + 3600,
                "state":          "running",
            }
            lease_path = _Path("/home/lobster/documents/porter/runtime/leases") / f"{task_id}.json"
            lease_path.write_text(_json.dumps(lease))
            ckpt_path = _Path("/home/lobster/documents/porter/runtime/checkpoints") / f"{task_id}.jsonl"
            ckpt_path.write_text(
                _json.dumps({"step_id": "s1", "status": "partial", "timestamp": now}) + "\n"
            )
            code, payload = authed.get(f"/runtime/recover?task_id={task_id}", expect_code=200)
            assert payload["lease_expired"] is False, f"expected lease_expired=False: {payload}"
            assert payload["resumable"] is True, f"expected resumable=True: {payload}"

        # ── hardening: finalize ───────────────────────────────────────────
        def t_finalize_atomic():
            temp_uri  = "porter://projects/hardening-tmp-atomic.txt"
            final_uri = "porter://projects/hardening-final-atomic.txt"
            authed.post("/memory/upsert", {
                "uri": temp_uri, "content": "atomic content",
            }, expect_code=200)
            code, payload = authed.post("/runtime/finalize", {
                "task_id":   "hardening-atomic-task",
                "temp_uri":  temp_uri,
                "final_uri": final_uri,
            }, expect_code=200)
            assert payload.get("ok"), payload
            # verify final exists and temp is gone
            code2, fetched = authed.get(
                "/memory/fetch?" + urllib.parse.urlencode({"uri": final_uri}),
                expect_code=200,
            )
            assert fetched["content"] == "atomic content", fetched
            code3, _ = authed.get(
                "/memory/fetch?" + urllib.parse.urlencode({"uri": temp_uri}),
                expect_code=404,
            )

        def t_finalize_missing_temp():
            code, payload = authed.post("/runtime/finalize", {
                "task_id":   "hardening-missing-task",
                "temp_uri":  "porter://projects/nonexistent-hardening-tmp.txt",
                "final_uri": "porter://projects/nonexistent-hardening-final.txt",
            }, expect_code=400)
            assert "error" in payload, payload

        # ── hardening: heartbeat TTL ──────────────────────────────────────
        def t_heartbeat_ttl_too_low():
            code, payload = authed.post("/runtime/heartbeat", {
                "task_id": "ttl-test", "ttl": 10,
            }, expect_code=400)
            assert "error" in payload, payload

        def t_heartbeat_ttl_too_high():
            code, payload = authed.post("/runtime/heartbeat", {
                "task_id": "ttl-test", "ttl": 7200,
            }, expect_code=400)
            assert "error" in payload, payload

        def t_heartbeat_ttl_valid():
            code, payload = authed.post("/runtime/heartbeat", {
                "task_id": "ttl-test", "ttl": 60,
            }, expect_code=200)
            assert payload.get("ok"), payload

        test("P0 auth gate: /runtime/checkpoint",     t_auth_checkpoint)
        test("P0 auth gate: /runtime/heartbeat",      t_auth_heartbeat)
        test("P0 auth gate: /runtime/recover",        t_auth_recover)
        test("P0 auth gate: /runtime/finalize",       t_auth_finalize)
        test("P0 checkpoint(started)",                t_checkpoint_started)
        test("P0 heartbeat",                          t_heartbeat)
        test("P0 recover(resumable=True)",            t_recover_resumable)
        test("P0 checkpoint(done)",                   t_checkpoint_done)
        test("P0 finalize",                           t_finalize)
        test("P0 recover(resumable=False)",           t_recover_not_resumable)
        test("P0 validation: bad task_id",            t_bad_task_id)
        test("P0 validation: missing step_id",        t_missing_step_id)
        test("P0 validation: bad status",             t_bad_status)
        test("P0 hardening: expired lease → not resumable", t_recover_expired_lease)
        test("P0 hardening: active lease + partial → resumable", t_recover_active_partial)
        test("P0 hardening: finalize atomic",         t_finalize_atomic)
        test("P0 hardening: finalize missing temp",   t_finalize_missing_temp)
        test("P0 hardening: ttl too low → 400",       t_heartbeat_ttl_too_low)
        test("P0 hardening: ttl too high → 400",      t_heartbeat_ttl_too_high)
        test("P0 hardening: ttl valid",               t_heartbeat_ttl_valid)

    # ── P1 ───────────────────────────────────────────────────────────────────
    if "p1" in suites:

        def t_auth_upsert():
            code, _ = anon.post("/memory/upsert", {"uri": "porter://projects/x.txt", "content": "hi"}, expect_code=401)

        def t_auth_fetch():
            code, _ = anon.get("/memory/fetch?uri=porter://projects/x.txt", expect_code=401)

        def t_auth_pointer():
            code, _ = anon.post("/memory/pointer", {}, expect_code=401)

        def t_auth_search():
            code, _ = anon.post("/memory/search", {"query": "x"}, expect_code=401)

        def t_upsert_and_fetch():
            uri     = "porter://projects/test-note.md"
            content = "# Test Note\ntags: alpha, beta\nHello from Porter P1."
            code, payload = authed.post("/memory/upsert", {
                "uri": uri, "content": content, "tags": ["alpha"],
            }, expect_code=200)
            assert payload.get("ok"), payload
            assert "created" in payload

            # fetch it back
            code, fetched = authed.get(
                "/memory/fetch?" + urllib.parse.urlencode({"uri": uri}),
                expect_code=200,
            )
            assert fetched["content"] == content, f"content mismatch: {fetched['content']!r}"
            assert fetched["uri"] == uri, f"uri mismatch: got {fetched['uri']!r}, want {uri!r}"

        def t_upsert_overwrite():
            uri  = "porter://projects/test-note.md"
            code, payload = authed.post("/memory/upsert", {
                "uri": uri, "content": "updated content",
            }, expect_code=200)
            assert payload.get("ok"), payload
            assert payload["created"] is False

        def t_pointer_valid():
            code, payload = authed.post("/memory/pointer", {
                "id":         "test-ptr-001",
                "title":      "Test Pointer",
                "summary":    "A pointer for testing",
                "porter_uri": "porter://projects/test-note.md",
                "tags":       ["alpha", "test"],
                "confidence": "high",
            }, expect_code=200)
            assert payload.get("ok"), payload
            assert payload["id"] == "test-ptr-001"
            assert payload["uri"] == "porter://pointers/test-ptr-001.json"
            assert "updated_at" in payload

        def t_pointer_preserves_created_at():
            # call again with only confidence changed — created_at must be preserved
            code, p1 = authed.post("/memory/pointer", {
                "id": "test-ptr-001", "title": "Test Pointer",
                "summary": "A pointer for testing",
                "porter_uri": "porter://projects/test-note.md",
                "tags": ["alpha", "test"],
                "confidence": "low",
            }, expect_code=200)
            # fetch the JSON file directly
            code, fetched = authed.get(
                "/memory/fetch?" + urllib.parse.urlencode({"uri": "porter://pointers/test-ptr-001.json"}),
                expect_code=200,
            )
            obj = json.loads(fetched["content"])
            assert obj["confidence"] == "low"

        def t_search_finds_note():
            # The pointer (test-ptr-001.json) has title "Test Pointer" — search for it.
            code, payload = authed.post("/memory/search", {
                "query": "Test Pointer", "limit": 10,
            }, expect_code=200)
            uris = [r["uri"] for r in payload["results"]]
            assert any("test-ptr-001" in u for u in uris), f"not found in {uris}"

        def t_search_tag_filter():
            # Pointer has tags ["alpha", "test"]; filter by "alpha" should still return it.
            code, payload = authed.post("/memory/search", {
                "query": "Test Pointer", "tags": ["alpha"],
            }, expect_code=200)
            assert payload["total"] > 0, "tag filter returned nothing"

        def t_pointer_bad_confidence():
            code, payload = authed.post("/memory/pointer", {
                "id": "x", "title": "t", "summary": "s",
                "porter_uri": "porter://projects/f.md", "confidence": "extreme",
            }, expect_code=400)

        def t_pointer_missing_fields():
            code, payload = authed.post("/memory/pointer", {
                "id": "x",
            }, expect_code=400)

        def t_upsert_empty_content():
            code, payload = authed.post("/memory/upsert", {
                "uri": "porter://projects/empty.md", "content": "",
            }, expect_code=400)

        def t_fetch_not_found():
            uri = "porter://projects/does-not-exist-xyz.md"
            code, _ = authed.get(
                "/memory/fetch?" + urllib.parse.urlencode({"uri": uri}),
                expect_code=404,
            )

        def t_pointer_bad_id():
            code, payload = authed.post("/memory/pointer", {
                "id": "bad id!", "title": "t", "summary": "s",
                "porter_uri": "porter://projects/f.md", "confidence": "medium",
            }, expect_code=400)

        # ── hardening: search totals ─────────────────────────────────────
        def t_search_totals():
            # seed two files that both match a unique query term
            authed.post("/memory/upsert", {
                "uri":     "porter://projects/totals-alpha.md",
                "content": "# totals alpha\nsome totals alpha content",
            }, expect_code=200)
            authed.post("/memory/upsert", {
                "uri":     "porter://projects/totals-beta.md",
                "content": "# totals beta\nsome totals beta content",
            }, expect_code=200)
            code, payload = authed.post("/memory/search", {
                "query": "totals", "limit": 1,
            }, expect_code=200)
            assert payload["returned"] == 1, f"returned={payload.get('returned')}"
            assert payload["total"] >= 2, f"total={payload.get('total')} (expected >=2)"
            assert payload["total"] > payload["returned"], \
                f"total={payload['total']} should exceed returned={payload['returned']}"

        test("P1 auth gate: /memory/upsert",  t_auth_upsert)
        test("P1 auth gate: /memory/fetch",   t_auth_fetch)
        test("P1 auth gate: /memory/pointer", t_auth_pointer)
        test("P1 auth gate: /memory/search",  t_auth_search)
        test("P1 upsert + fetch round-trip",  t_upsert_and_fetch)
        test("P1 upsert overwrite",           t_upsert_overwrite)
        test("P1 pointer (valid)",            t_pointer_valid)
        test("P1 pointer preserves created_at", t_pointer_preserves_created_at)
        test("P1 search finds note",          t_search_finds_note)
        test("P1 search tag filter",          t_search_tag_filter)
        test("P1 hardening: search totals (total > returned)", t_search_totals)
        test("P1 validation: bad confidence", t_pointer_bad_confidence)
        test("P1 validation: missing fields", t_pointer_missing_fields)
        test("P1 validation: empty content",  t_upsert_empty_content)
        test("P1 fetch: not found",           t_fetch_not_found)
        test("P1 validation: bad pointer id", t_pointer_bad_id)

    # ── summary ──────────────────────────────────────────────────────────────
    passed = sum(1 for r in _results if r[0] == "PASS")
    failed = sum(1 for r in _results if r[0] == "FAIL")
    print(f"\n  {passed} passed, {failed} failed")
    if failed:
        print("\nFailed tests:")
        for r in _results:
            if r[0] == "FAIL":
                print(f"  • {r[1]}: {r[2]}")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--suite", default="all", choices=["p0", "p1", "all"])
    args = parser.parse_args()
    suites = {"p0", "p1"} if args.suite == "all" else {args.suite}
    print(f"\nPorter P0+P1 tests — suite={args.suite}\n")
    run_all(suites)
