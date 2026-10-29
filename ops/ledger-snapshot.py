#!/usr/bin/env python3
"""Ledger — token metering across all four gateways.

Aggregates token usage over a trailing window and appends ONE snapshot line per
gateway per run to Porter/runtime/usage/ledger.jsonl.

  claude  ~/.claude/projects/**/*.jsonl        priced at Anthropic list rates
  codex   ~/.codex/sessions/**/*.jsonl         tokens + real plan quota %, UNPRICED
  gemini  ~/.gemini/antigravity-cli/brain/**   activity only — no token data at source
  ollama  local                                $0 by construction (open weights)

Actual billed cost is $0.00 on every gateway (Claude Max, ChatGPT Plus, Gemini
free, Ollama local). Dollar figures are EQUIVALENT API COST — what this traffic
would cost at list rates. When API keys are added, the metering is already in place.

A gateway is only priced against rates verified from a source. An unverified rate
is worse than no rate, so unpriced gateways report tokens and quota with
usd_equivalent_api = null and `priced: false`. They are never silently zeroed.

Usage:  python3 ledger-snapshot.py [--hours 24] [--no-write] [--quiet]

BLIND SPOTS (reported in every snapshot, never swallowed):
  claude — `claude -p --no-session-persistence` fleet agents write no transcript
  codex  — no pricing table verified for gpt-5.6-terra; quota % is the live signal
  gemini — antigravity-cli transcripts carry no usage block at all
  ollama — journald unreadable without sudo; request counts unavailable
"""
import argparse, collections, datetime as dt, fnmatch, json, os, re, sys

TRANSCRIPTS = os.path.expanduser("~/.claude/projects")
CODEX_SESSIONS = os.path.expanduser("~/.codex/sessions")
GEMINI_BRAIN = os.path.expanduser("~/.gemini/antigravity-cli/brain")
STATE = os.path.expanduser("~/projects/Porter/runtime/usage/ledger.jsonl")

# Metering semantics version, stamped on every snapshot line so a reader can tell
# WHICH COUNTING RULES produced a number instead of assuming the file is uniform.
#   1 — claude dedupe keyed on (response id, output_tokens). The replayed rows are
#       streaming snapshots of one cumulative usage object, so their output_tokens
#       differ and one response was booked several times: +40% calls, +30.3M tokens,
#       +$24.79 measured over the live 24h window. Every line written before
#       2026-08-11T21:06Z carries that inflation and is stamped meter_version 1.
#   2 — claude dedupe keyed on response id alone, fullest snapshot wins (2026-08-11).
#       Verified independently: 2,837 raw usage rows collapse to 1,092 responses.
#   3 — every gateway emits a row every tick, idle or failed (2026-08-13). Before
#       this, a collector with nothing to report wrote NO line, so gemini ran
#       2026-08-12T17Z -> 2026-08-13T13Z (20 ticks) with no row while looking
#       merely quiet. Row COUNTS and any average over them are not comparable
#       across this boundary: gemini gains idle rows at usd_equivalent_api 0.0
#       where v<=2 had no row at all. Per-call and per-token figures are unchanged.
#       Read `observed` to separate measured traffic from idle/error rows.
# Bump this whenever a change moves a number a reader might compare across time.
METER_VERSION = 3

# OpenAI list rates, USD per million tokens, keyed by model id.
# EMPTY ON PURPOSE. Nothing goes in here that was not read off a cited source.
# Codex therefore reports tokens and plan-quota % with usd_equivalent_api = null.
# On a ChatGPT Plus subscription the quota percentage IS the currency; the dollar
# figure only starts mattering the day an OpenAI API key is added.
CODEX_RATES: dict = {}

# Anthropic public list rates, USD per million tokens.
# Derived rates: cache write 5m = 1.25x input, 1h = 2.0x input, cache read = 0.1x input.
# Verified against the claude-api skill's pricing table, 2026-08-11.
#
# A rate may be a plain {"in","out"} dict, or carry "until"/"then" for a
# time-boxed promotional price. Promotions are priced PER CALL against the
# call's own timestamp, so a window spanning the cutover bills each side
# correctly instead of applying one rate to the whole window.
RATES = {
    "claude-opus-5":    {"in": 5.00,  "out": 25.00, "note": "list"},
    "claude-opus-4-8":  {"in": 5.00,  "out": 25.00, "note": "list"},
    "claude-opus-4-7":  {"in": 5.00,  "out": 25.00, "note": "list"},
    "claude-opus-4-6":  {"in": 5.00,  "out": 25.00, "note": "list"},
    "claude-sonnet-5":  {"in": 2.00,  "out": 10.00, "note": "intro thru 2026-08-31",
                         "until": "2026-09-01", "then": {"in": 3.00, "out": 15.00}},
    "claude-sonnet-4-6":{"in": 3.00,  "out": 15.00, "note": "list"},
    "claude-haiku-4-5": {"in": 1.00,  "out":  5.00, "note": "list"},
    "claude-fable-5":   {"in": 10.00, "out": 50.00, "note": "list"},
    "claude-mythos-5":  {"in": 10.00, "out": 50.00, "note": "list (Project Glasswing)"},
}


DATED = re.compile(r"-\d{8}$")


def _rate_for(model):
    """RATES entry for `model`, tolerating a pinned date suffix.

    Transcripts report a model either bare (`claude-sonnet-5`) or pinned to a
    release (`claude-haiku-4-5-20251001`). An exact-match lookup missed the
    pinned form and silently dropped that traffic to unpriced — measured
    2026-08-13: 1 call, 10,804 cache-write + 18,101 cache-read + 76 output
    tokens booked at null instead of the haiku rate.

    Stripping the pin is an IDENTITY mapping, not an invented rate: the pin
    names a release of the same model at the same published price. Exact match
    still wins, so an explicitly dated RATES key overrides this fallback.
    """
    if model in RATES:
        return RATES[model]
    return RATES.get(DATED.sub("", model))


def rate_at(model, t):
    """(input, output) $/Mtok for `model` at time `t`. None if unpriced."""
    r = _rate_for(model)
    if not r:
        return None
    if "until" in r:
        cut = dt.datetime.fromisoformat(r["until"]).replace(tzinfo=dt.timezone.utc)
        if t >= cut:
            return r["then"]["in"], r["then"]["out"]
    return r["in"], r["out"]


def _billable(r):
    """Every billable token on a collected row. Picks the fullest streaming
    snapshot of one response — never used for reporting."""
    return r["in"] + r["out"] + r["cwtot"] + r["cr"]


LIMIT_RE = re.compile(r"(session|usage|5-hour|weekly|rate) limit|out of extra usage"
                      r"|quota|overloaded|\b429\b", re.I)


def _synthetic_text(msg):
    """Flatten a <synthetic> assistant turn to plain text. These carry the CLI's own
    refusals — session-limit blocks, 429s, overload — not model output."""
    c = msg.get("content")
    if isinstance(c, str):
        return c[:300]
    if isinstance(c, list):
        return " ".join(b.get("text", "") for b in c
                        if isinstance(b, dict) and b.get("type") == "text")[:300]
    return ""


def limit_events(rows):
    """Dispatches the plan REFUSED inside the window. $0 billed, and the single most
    routing-relevant fact a subscription gateway produces: while this is firing,
    claude capacity is zero and Atlas should be sending work elsewhere. Returns None
    when the window is clean, so a quiet ledger stays quiet."""
    hits = [r for r in rows if r["err"] and LIMIT_RE.search(r["err"])]
    if not hits:
        return None
    hits.sort(key=lambda r: r["t"])
    return {
        "count": len(hits),
        "first": hits[0]["t"].isoformat(timespec="seconds"),
        "last": hits[-1]["t"].isoformat(timespec="seconds"),
        "blocked_calls": {"main": sum(1 for r in hits if not r["sub"]),
                          "subagent": sum(1 for r in hits if r["sub"])},
        "by_hour": {k: len(v) for k, v in
                    sorted(group(hits, lambda r: r["t"].strftime("%Y-%m-%dT%H")).items())},
        "message": hits[-1]["err"],
    }


def collect(hours):
    now = dt.datetime.now(dt.timezone.utc)
    cut = now - dt.timedelta(hours=hours)
    files = _walk(TRANSCRIPTS)
    recent = [f for f in files
              if dt.datetime.fromtimestamp(os.path.getmtime(f), dt.timezone.utc) > cut]
    seen, rows = {}, []   # response id -> fullest row seen; rows = the un-keyed rest
    for path in recent:
        try:
            fh = open(path, errors="replace")
        except OSError:
            continue
        with fh:
            for line in fh:
                if '"usage"' not in line:
                    continue
                try:
                    d = json.loads(line)
                except ValueError:
                    continue
                msg = d.get("message")
                if not isinstance(msg, dict):
                    continue
                u = msg.get("usage")
                if not isinstance(u, dict):
                    continue
                ts = d.get("timestamp")
                if not ts:
                    continue
                try:
                    t = dt.datetime.fromisoformat(ts.replace("Z", "+00:00"))
                except ValueError:
                    continue
                if t < cut:
                    continue
                # Dedupe: one API response is written to the transcript once per
                # content block, and can additionally appear in more than one
                # transcript (forked/resumed sessions replay history).
                #
                # CORRECTED 2026-08-11 21:06. The key here was (rid, output_tokens),
                # which assumed every replayed row carried identical usage. It does
                # not: the rows are STREAMING SNAPSHOTS of one cumulative usage
                # object, so an early row reads output_tokens 1 and the final row
                # reads 336 — different tuples, both kept, one response booked twice
                # with its full input and cache_read counted each time. Measured over
                # the live 24h window: 1526 dispatches against a true 1092 (+40%
                # phantom calls), 257.0M tokens against 226.7M (+30.3M), and $223.06
                # equivalent against $198.27. Every snapshot line in
                # runtime/usage/ledger.jsonl written before this timestamp carries
                # that inflation.
                #
                # Key on the response id alone and keep the FULLEST snapshot. Not
                # last-seen: files are walked in arbitrary order, so a truncated
                # replay must not overwrite a complete row. Verified on the same
                # window — the fullest row is the final row for all 1092 responses.
                rid = d.get("requestId") or msg.get("id")
                cc = u.get("cache_creation") or {}
                row = {
                    "t": t,
                    "model": msg.get("model") or "unknown",
                    "in": u.get("input_tokens") or 0,
                    "out": u.get("output_tokens") or 0,
                    "cw5": cc.get("ephemeral_5m_input_tokens") or 0,
                    "cw1h": cc.get("ephemeral_1h_input_tokens") or 0,
                    "cwtot": u.get("cache_creation_input_tokens") or 0,
                    "cr": u.get("cache_read_input_tokens") or 0,
                    "ws": (u.get("server_tool_use") or {}).get("web_search_requests") or 0,
                    "cwd": d.get("cwd") or "unknown",
                    "sid": d.get("sessionId") or "unknown",
                    "sub": bool(d.get("isSidechain")),
                    # On a subscription the QUOTA is the currency, so a refusal is a
                    # cost event even though it bills nothing. The CLI writes one as a
                    # <synthetic> assistant turn carrying a zeroed usage block, which
                    # means it is already in this stream — carry its text so main() can
                    # count limit hits without a second pass over 1.8GB of transcripts.
                    "err": _synthetic_text(msg) if msg.get("model") == "<synthetic>" else "",
                }
                if not rid:
                    rows.append(row)
                    continue
                prev = seen.get(rid)
                if prev is None:
                    seen[rid] = row
                elif _billable(row) > _billable(prev):
                    row["t"] = min(row["t"], prev["t"])   # dispatch START time
                    seen[rid] = row
                else:
                    prev["t"] = min(prev["t"], row["t"])
    rows.extend(seen.values())
    return now, cut, rows, len(recent), len(files)


def cost(model, rs):
    """Equivalent API cost in USD. None if the model has no list price."""
    if _rate_for(model) is None:
        return None
    total = 0.0
    for x in rs:
        i, o = rate_at(model, x["t"])
        total += (x["in"] / 1e6 * i
                  + x["cw5"] / 1e6 * i * 1.25
                  + x["cw1h"] / 1e6 * i * 2.00
                  + x["cr"] / 1e6 * i * 0.10
                  + x["out"] / 1e6 * o)
    return total


def cost_of(rs):
    by = collections.defaultdict(list)
    for r in rs:
        by[r["model"]].append(r)
    return sum(c for c in (cost(m, v) for m, v in by.items()) if c is not None)


def components(rs):
    """Equivalent cost split by what the tokens WERE, not who spent them.

    The single most useful cost-shape signal on this fleet: generation is a
    minority of the bill. Context reload (cache read) and context build (cache
    write) dominate, which means the lever is session/context hygiene, not
    shorter answers. Unpriced models are skipped, never zeroed.
    """
    out = collections.Counter()
    for r in rs:
        rt = rate_at(r["model"], r["t"])
        if not rt:
            continue
        i, o = rt
        out["input"] += r["in"] / 1e6 * i
        out["cache_write"] += r["cw5"] / 1e6 * i * 1.25 + r["cw1h"] / 1e6 * i * 2.00
        out["cache_read"] += r["cr"] / 1e6 * i * 0.10
        out["output"] += r["out"] / 1e6 * o
    return {k: round(v, 4) for k, v in out.items()}


def group(rows, keyfn):
    g = collections.defaultdict(list)
    for r in rows:
        g[keyfn(r)].append(r)
    return g


def _walk(root, pattern="*.jsonl"):
    """Every file under `root` matching `pattern`, INCLUDING hidden directories.

    Not glob: `**` silently skips any path component beginning with a dot, and
    Gemini writes its transcripts to `<session>/.system_generated/logs/`. That
    one dot made a live gateway report as no-traffic for every snapshot up to
    2026-08-11T18:54Z. A walk has no such blind spot."""
    return [os.path.join(dirpath, n)
            for dirpath, _dirs, names in os.walk(root)
            for n in fnmatch.filter(names, pattern)]


def _recent(root, cut, pattern="*.jsonl"):
    """Files under `root` matching `pattern` and touched since `cut`."""
    return [f for f in _walk(root, pattern)
            if os.path.exists(f)
            and dt.datetime.fromtimestamp(os.path.getmtime(f), dt.timezone.utc) > cut]


def _jsonl(path):
    """Yield parsed objects from a jsonl file, skipping anything unreadable."""
    try:
        fh = open(path, errors="replace")
    except OSError:
        return
    with fh:
        for line in fh:
            try:
                d = json.loads(line)
            except ValueError:
                continue
            if isinstance(d, dict):
                yield d


def _ts(d):
    raw = d.get("timestamp") or d.get("created_at")
    if not isinstance(raw, str):
        return None
    try:
        return dt.datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def collect_codex(now, cut, hours):
    """Codex gateway. Sessions carry exact per-turn token counts AND the live
    plan quota, which is the number that actually binds on a Plus subscription."""
    files = _recent(CODEX_SESSIONS, cut)
    tok = collections.Counter()
    by_hour = collections.Counter()
    models = collections.Counter()
    sessions, turns, quota, quota_t = set(), 0, None, None
    for path in files:
        for d in _jsonl(path):
            p = d.get("payload")
            if not isinstance(p, dict):
                continue
            t = _ts(d)
            m = p.get("model")
            if m:
                models[m] += 1
            # rate_limits ride along on token_count events; keep the newest seen,
            # window-independent — a quota reading is a level, not a flow.
            rl = p.get("rate_limits")
            if isinstance(rl, dict) and t and (quota_t is None or t > quota_t):
                quota, quota_t = rl, t
            if p.get("type") != "token_count" or not t or t < cut:
                continue
            lu = (p.get("info") or {}).get("last_token_usage")
            if not isinstance(lu, dict):
                continue
            turns += 1
            sessions.add(path)
            for k, v in lu.items():
                tok[k] += v or 0
            by_hour[t.strftime("%Y-%m-%dT%H")] += lu.get("total_tokens") or 0

    if not turns:
        return None
    # OpenAI reports input_tokens as the TOTAL, with cached_input_tokens a subset.
    uncached = tok["input_tokens"] - tok["cached_input_tokens"]
    unpriced = sorted(m for m in models if m not in CODEX_RATES)
    snap = {
        "ts": now.isoformat(timespec="seconds"),
        "window_hours": hours,
        "window_start": cut.isoformat(timespec="seconds"),
        "gateway": "codex",
        "plan": f"chatgpt-{(quota or {}).get('plan_type', 'unknown')}-subscription",
        "usd_billed": 0.0,
        "usd_equivalent_api": None,
        "priced": False,
        "calls": turns,
        "transcripts_touched": len(sessions),
        "tokens": {
            "input": uncached,
            "cache_read": tok["cached_input_tokens"],
            "cache_write": tok["cache_write_input_tokens"],
            "output": tok["output_tokens"],
            "reasoning_output": tok["reasoning_output_tokens"],
            "total": tok["total_tokens"],
        },
        "by_model": {m: {"turns": c, "usd_equiv": None} for m, c in models.items()},
        "by_hour": dict(by_hour),
        "unpriced_models": unpriced,
        "blind_spots": ["no verified OpenAI list rates for %s — tokens and quota "
                        "are exact, USD is deliberately null" % (", ".join(unpriced) or "n/a")],
    }
    if quota:
        pri = quota.get("primary") or {}
        used, win = pri.get("used_percent"), pri.get("window_minutes")
        resets = pri.get("resets_at")
        snap["quota"] = {
            "used_percent": used,
            "window_minutes": win,
            "window_days": round(win / 1440, 2) if win else None,
            "resets_at": (dt.datetime.fromtimestamp(resets, dt.timezone.utc).isoformat(
                timespec="seconds") if resets else None),
            "hours_to_reset": (round((resets - now.timestamp()) / 3600, 1)
                               if resets else None),
            "reading_age_min": round((now - quota_t).total_seconds() / 60, 1),
            "spend_control_reached": quota.get("spend_control_reached"),
            "rate_limit_reached_type": quota.get("rate_limit_reached_type"),
            "credits": quota.get("credits"),
        }
        # Burn projection: at the current pace, does this window's quota survive?
        #
        # The projection multiplies the observed pace by (window / elapsed). Early
        # in a window that multiplier is enormous — 1.5h into a 7d window it is
        # 112x — and used_percent arrives at 0.1% granularity, so the SMALLEST
        # non-zero reading alone projects >100%. A flat 0.5h floor therefore fired
        # a false "over quota" on essentially every window reset followed by any
        # activity, which is a routing hazard: it argues for moving traffic off a
        # gateway that is 1% used. Require the elapsed span to be a meaningful
        # FRACTION of the window, and always publish the basis so the number is
        # auditable rather than merely plausible.
        if used is not None and win and resets:
            window_h = win / 60
            elapsed_h = window_h - max((resets - now.timestamp()) / 3600, 0)
            min_basis_h = max(0.5, window_h * 0.05)
            snap["quota"]["projection_basis_hours"] = round(elapsed_h, 2)
            # One guard, one definition. The two thresholds (> 0.5 for the pace,
            # >= min_basis_h for the projection) read as equivalent but are not:
            # min_basis_h is itself FLOORED at 0.5, so an elapsed span of exactly
            # 0.5h clears the projection guard while skipping the pace assignment
            # — NameError, swallowed by fleet()'s except into a blind gateway.
            # Derive the projection from the pace rather than re-deriving the
            # condition, and the two can no longer disagree.
            pace = used / elapsed_h if elapsed_h > 0.5 else None
            if pace is not None:
                # Measured, not extrapolated — safe to publish at any elapsed span.
                snap["quota"]["percent_per_hour"] = round(pace, 3)
            if pace is not None and elapsed_h >= min_basis_h:
                snap["quota"]["projected_window_percent"] = round(pace * window_h, 1)
            else:
                snap["quota"]["projected_window_percent"] = None
                snap["quota"]["projection_suppressed"] = (
                    "only %.2fh of a %.0fh window elapsed (need %.1fh); "
                    "extrapolation would amplify noise %.0fx"
                    % (elapsed_h, window_h, min_basis_h,
                       window_h / elapsed_h if elapsed_h > 0 else 0))
    return snap


def collect_gemini(now, cut, hours):
    """Gemini gateway. Active, but antigravity-cli transcripts carry NO usage
    block — this reports activity and names the gap rather than reporting $0."""
    files = _recent(GEMINI_BRAIN, cut)
    if not files:
        return None
    steps, brains = 0, set()
    for path in files:
        for d in _jsonl(path):
            t = _ts(d)
            if t and t < cut:
                continue
            steps += 1
        parts = os.path.relpath(path, GEMINI_BRAIN).split(os.sep)
        if parts:
            brains.add(parts[0])
    return {
        "ts": now.isoformat(timespec="seconds"),
        "window_hours": hours,
        "window_start": cut.isoformat(timespec="seconds"),
        "gateway": "gemini",
        "plan": "gemini-free",
        "usd_billed": 0.0,
        "usd_equivalent_api": None,
        "priced": False,
        "metered": False,
        "calls": None,
        "transcripts_touched": len(files),
        "activity": {"sessions": len(brains), "transcript_steps": steps},
        "tokens": None,
        "blind_spots": ["antigravity-cli writes no usage/token block — token counts "
                        "are UNAVAILABLE at source, not zero. Metering this gateway "
                        "needs a proxy or an upstream CLI change."],
    }


def collect_ollama(now, cut, hours):
    """Ollama gateway. Local open weights: $0 real AND $0 equivalent — there is no
    list rate to price against. Recorded so the gateway is never merely absent."""
    import urllib.error, urllib.request
    resident, reachable = [], False
    try:
        with urllib.request.urlopen("http://127.0.0.1:11434/api/ps", timeout=3) as r:
            reachable = True
            for m in (json.load(r).get("models") or []):
                resident.append({"model": m.get("model"),
                                 "size_vram": m.get("size_vram"),
                                 "context_length": m.get("context_length")})
    except (urllib.error.URLError, OSError, ValueError):
        pass
    return {
        "ts": now.isoformat(timespec="seconds"),
        "window_hours": hours,
        "window_start": cut.isoformat(timespec="seconds"),
        "gateway": "ollama",
        "plan": "local",
        "usd_billed": 0.0,
        "usd_equivalent_api": 0.0,
        "priced": True,
        "metered": False,
        "reachable": reachable,
        "resident_models": resident,
        "tokens": None,
        "blind_spots": ["ollama journald is not readable without sudo, so request "
                        "and token counts are unavailable. Cost is $0 either way; "
                        "the exposure is capacity (VRAM/CPU), not spend."],
    }


def emit(a, snap):
    """Append ONE snapshot line per gateway to the ledger. --no-write reports only."""
    if snap is None or a.no_write:
        return snap
    snap["meter_version"] = METER_VERSION
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    with open(STATE, "a") as fh:
        fh.write(json.dumps(snap) + "\n")
    return snap


def stub(now, cut, hours, gateway, observed, detail):
    """A line for a gateway that produced no snapshot.

    Absence of a line and absence of traffic are different facts, and until
    2026-08-13 the ledger wrote neither: a collector returning None and a
    collector raising both `continue`d, so gemini went 20 consecutive ticks
    with no row while reading as merely quiet. A reader cannot audit silence.

    observed="idle"   — collector ran, window genuinely empty. Zero is a fact.
    observed="error"  — collector failed. NOT zero: this gateway is UNMETERED
                        for this tick, and usage may have occurred unseen.
    """
    return {
        "ts": now.isoformat(timespec="seconds"),
        "window_hours": hours,
        "window_start": cut.isoformat(timespec="seconds"),
        "gateway": gateway,
        "plan": PLANS.get(gateway, "unknown"),
        "observed": observed,
        "usd_billed": 0.0 if observed == "idle" else None,
        "usd_equivalent_api": 0.0 if observed == "idle" else None,
        "priced": False,
        "metered": observed == "idle",
        "calls": 0 if observed == "idle" else None,
        "tokens": None,
        # An idle tick is a clean measurement, so it carries a note and NO blind
        # spot. A failed collector is the real blind spot and is filed as one.
        "note": detail,
        "blind_spots": [] if observed == "idle" else [detail],
    }


GATEWAY_OF = {"collect_codex": "codex",
              "collect_gemini": "gemini",
              "collect_ollama": "ollama"}

# The subscription behind each gateway. Static facts, and the stub line carries
# them so an idle row is shaped like a real one and readers need no special case.
PLANS = {"codex": "chatgpt-plus-subscription",
         "gemini": "gemini-free",
         "ollama": "local",
         "claude": "claude-max-subscription"}


def fleet(a, now, cut, snaps):
    """The other three gateways. A collector that raises must not take the run
    down with it — one blind gateway is a gap, four is an outage.

    Every collector yields exactly one line per run, including the boring ones.
    That is what makes a missing row mean "the snapshot did not run" instead of
    "something, somewhere, was quiet" — the invariant main() claims at its close.
    """
    for fn in (collect_codex, collect_gemini, collect_ollama):
        # Derived, not asserted: renaming a collector must not KeyError the whole
        # fleet run. Losing three gateways to protect a lookup table is a bad trade.
        gw = GATEWAY_OF.get(fn.__name__, fn.__name__.replace("collect_", ""))
        try:
            s = fn(now, cut, a.hours)
        except Exception as e:                              # noqa: BLE001
            print(f"{fn.__name__}: {type(e).__name__}: {e}", file=sys.stderr)
            s = stub(now, cut, a.hours, gw, "error",
                     f"collector raised {type(e).__name__}: {e}. This gateway is "
                     f"UNMETERED for this tick — treat as unknown, not as zero.")
        if s is None:
            print(f"{fn.__name__}: no traffic in window", file=sys.stderr)
            s = stub(now, cut, a.hours, gw, "idle",
                     f"collector ran and found no {gw} activity in the trailing "
                     f"{a.hours}h. Observed zero, not missing data.")
        emit(a, s)
        snaps.append(s)

    if a.quiet:
        return 0

    w = lambda s: print(s)
    for s in snaps:
        if s.get("gateway") == "claude":
            continue                                        # reported in full above
        usd = s.get("usd_equivalent_api")
        usd_s = f"${usd:,.2f}" if usd is not None else "UNPRICED"
        billed = s.get("usd_billed")
        billed_s = f"${billed:,.2f}" if billed is not None else "UNKNOWN"
        w(f"\ngateway={s['gateway']:<8} plan={s['plan']:<34} "
          f"billed={billed_s}  equivalent API={usd_s}")
        # An idle tick and a failed collector both used to print nothing at all.
        # Say which one happened, in the same place a reader looks for the money.
        obs = s.get("observed")
        if obs == "idle":
            w(f"  IDLE — no activity in the trailing {s['window_hours']}h. "
              f"Observed zero, not missing data.")
        elif obs == "error":
            w("  !! UNMETERED — the collector failed this tick. Not zero: "
              "usage here is UNKNOWN and may be nonzero.")
        tk = s.get("tokens")
        if tk:
            w("  " + "  ".join(f"{k}={v:,}" for k, v in tk.items()
                               if isinstance(v, int)))
        act = s.get("activity")
        if act:
            w("  " + "  ".join(f"{k}={v:,}" for k, v in act.items()))
        q = s.get("quota") or {}
        if q.get("used_percent") is not None:
            proj = q.get("projected_window_percent")
            proj_s = (f"projected {proj}%" if proj is not None
                      else "projected n/a (too early to extrapolate)")
            w(f"  quota {q['used_percent']}% of a {q.get('window_days')}d window"
              f"  resets in {q.get('hours_to_reset')}h"
              f"  pace {q.get('percent_per_hour', 'n/a')}%/h"
              f"  {proj_s}")
            if q.get("projection_suppressed"):
                w(f"  projection withheld: {q['projection_suppressed']}")
        for b in s.get("blind_spots") or []:
            w(f"  blind spot: {b}")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hours", type=int, default=24)
    ap.add_argument("--no-write", action="store_true", help="report only, do not append state")
    ap.add_argument("--quiet", action="store_true", help="append state, suppress report")
    a = ap.parse_args()

    now, cut, rows, nrecent, ntotal = collect(a.hours)
    if not rows:
        # A silent claude gateway is itself a fact worth recording, and it must not
        # suppress the other three. Fall through to the fleet pass.
        print("claude: no metered traffic in window", file=sys.stderr)
        return fleet(a, now, cut, [])
    tot = lambda k: sum(r[k] for r in rows)
    grand = cost_of(rows)
    unpriced = sorted({r["model"] for r in rows if _rate_for(r["model"]) is None})

    by_model = {m: {"calls": len(v), "input": sum(x["in"] for x in v),
                    "cache_write": sum(x["cwtot"] for x in v),
                    "cache_read": sum(x["cr"] for x in v),
                    "output": sum(x["out"] for x in v),
                    "usd_equiv": round(cost(m, v), 4) if cost(m, v) is not None else None}
                for m, v in group(rows, lambda r: r["model"]).items()}
    by_project = {k.replace(os.path.expanduser("~"), "~"): round(cost_of(v), 4)
                  for k, v in group(rows, lambda r: r["cwd"]).items()}
    by_hour = {k: round(cost_of(v), 4)
               for k, v in group(rows, lambda r: r["t"].strftime("%Y-%m-%dT%H")).items()}
    peak_h = max(by_hour, key=by_hour.get)
    by_component = components(rows)
    # Attribution by caller. `isSidechain` is the only marker distinguishing a
    # subagent turn from a main-thread turn, and it was being collected and
    # thrown away — so fan-out cost was invisible in every prior snapshot.
    by_caller = {
        lab: {"calls": len(v), "usd_equiv": round(cost_of(v), 4),
              "usd_per_call": round(cost_of(v) / len(v), 4),
              "mean_context_tokens": round(sum(x["cr"] for x in v) / len(v))}
        for lab, v in group(rows, lambda r: "subagent" if r["sub"] else "main").items()}

    snapshot = {
        "ts": now.isoformat(timespec="seconds"),
        "window_hours": a.hours,
        "window_start": cut.isoformat(timespec="seconds"),
        "gateway": "claude",
        "plan": "claude-max-subscription",
        "usd_billed": 0.0,
        "usd_equivalent_api": round(grand, 4),
        "priced": True,
        "calls": len(rows),
        "transcripts_touched": nrecent,
        "tokens": {"input": tot("in"), "cache_write_5m": tot("cw5"),
                   "cache_write_1h": tot("cw1h"), "cache_read": tot("cr"),
                   "output": tot("out"), "web_search_requests": tot("ws")},
        "by_model": by_model,
        "by_component": by_component,
        "by_caller": by_caller,
        "by_project": by_project,
        "by_hour": by_hour,
        "peak_hour": {"hour": peak_h, "usd_equiv": by_hour[peak_h],
                      "extrapolated_daily": round(by_hour[peak_h] * 24, 2)},
        "limit_events": limit_events(rows),
        "unpriced_models": unpriced,
        "blind_spots": ["claude -p --no-session-persistence (fleet agents write no transcript)"],
    }

    emit(a, snapshot)

    w = (lambda s: None) if a.quiet else (lambda s: print(s))
    w(f"LEDGER  {cut:%Y-%m-%d %H:%M} -> {now:%Y-%m-%d %H:%M} UTC   ({a.hours}h)")
    w(f"gateway=claude  plan=claude-max  billed=$0.00  equivalent API=${grand:,.2f}")
    w(f"{len(rows):,} calls across {nrecent} of {ntotal:,} transcripts")

    # The plan REFUSING work is the loudest thing this gateway can say, and it was
    # written to the snapshot but never printed — visible only to whoever went and
    # read the jsonl. On a subscription the quota IS the currency, so a refusal
    # outranks every dollar figure below it. Print it first, and only when it fired.
    le = snapshot["limit_events"]
    if le:
        w(f"\n!! SESSION LIMIT — {le['count']} dispatches refused, "
          f"{le['first'][11:16]}-{le['last'][11:16]}Z "
          f"({le['blocked_calls']['main']} main / {le['blocked_calls']['subagent']} subagent)")
        w(f"   {le['message']}")
        w("   claude capacity was ZERO for this span — route elsewhere while it fires")
    w("")

    w(f"{'model':<20}{'calls':>7}{'cache_wr':>11}{'cache_rd':>12}{'output':>10}{'usd_eq':>10}")
    for m, d in sorted(by_model.items(), key=lambda kv: -(kv[1]["usd_equiv"] or 0)):
        usd = f"{d['usd_equiv']:.2f}" if d["usd_equiv"] is not None else "n/a"
        w(f"{m[:19]:<20}{d['calls']:>7}{d['cache_write']:>11,}{d['cache_read']:>12,}{d['output']:>10,}{usd:>10}")

    w("\nwhat the money bought")
    for k, v in sorted(by_component.items(), key=lambda kv: -kv[1]):
        w(f"  {k:<14}${v:>8.2f}  {v / grand * 100:>5.1f}%")

    w("\nby caller")
    for k, d in sorted(by_caller.items(), key=lambda kv: -kv[1]["usd_equiv"]):
        w(f"  {k:<14}${d['usd_equiv']:>8.2f}  {d['usd_equiv'] / grand * 100:>5.1f}%"
          f"   {d['calls']:>5} calls  ${d['usd_per_call']:.3f}/call"
          f"  ctx {d['mean_context_tokens']:>9,}")

    w("\nby project")
    for k, v in sorted(by_project.items(), key=lambda kv: -kv[1])[:10]:
        w(f"  {k[:52]:<54}${v:>8.2f}  {v / grand * 100:>5.1f}%")

    w("\nburn rate")
    for k in sorted(by_hour):
        w(f"  {k[5:]}h  ${by_hour[k]:>7.2f}  {'#' * int(by_hour[k] * 1.5)}")
    w(f"\nmean ${grand / a.hours:.2f}/h   peak {peak_h[5:]}h ${by_hour[peak_h]:.2f}/h "
      f"(={by_hour[peak_h] * 24:,.0f}/day sustained)")
    if unpriced:
        w(f"\nunpriced models seen: {', '.join(unpriced)}")

    # Every path ends here: all four gateways are metered on every run, quiet or not.
    return fleet(a, now, cut, [snapshot])


if __name__ == "__main__":
    sys.exit(main())
