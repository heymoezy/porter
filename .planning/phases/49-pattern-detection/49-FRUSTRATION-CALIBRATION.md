# LRN-01 Frustration-Marker Regex Calibration

**Corpus:** `session_transcript_turns` where `silo_id='software'`, `role='user'`, last 7 days.
**Size:** 223 user turns (sampled 2026-05-16).
**Reference incident:** turns 1604 + 1605 (2026-05-16 06:17–06:18) — Moe's "EVERY SINGLE TIME / freehanding / same mistake" YMC logo rant.

---

## 1. Empirical Hit Rates (n=223)

| Pattern | Regex | Hits | Real frustration | Precision | Verdict |
|---|---|---|---|---|---|
| Rant caps | `[A-Z]{4,} [A-Z]{2,} [A-Z]{2,}` | 5 | 4 | 80% | **USE** (with SQL-keyword guard) |
| Loose caps | `[A-Z ]{16,}` | 8 | 4 | 50% | **DROP** — FPs on SQL/JSON/IDs |
| `every (single )?time` | `every (single )?time you|i` | 1 | 1 | 100% | **USE** |
| `same mistake` | `same mistake` | 2 | 2 | 100% | **USE** |
| `still <broken>` | `still (broken|not working|wrong|failing|missing)` | 2 | 1 | 50% | **USE** (FP: WhatsApp log) — net positive |
| `i told you` | `i (just \|already )?told you` | 1 | 1 | 100% | **USE** |
| Direct address | `\myou keep\M\|claude keeps\|you ignored\|you forgot` | 1 | 1 | 100% | **USE** |
| `freehand` | `freehand` | 3 | 3 | 100% | **USE** (Moe-specific lexicon) |
| `stop doing` | `stop (doing\|guessing\|making\|freehand)` | 1 | 1 | 100% | **USE** |
| `WHY` standalone | `\mWHY\M` | 2 | 1 | 50% | **REFINE** — fold into rant-caps multi-word rule |
| Profanity | `\m(fuck\|shit\|damn\|wtf)\M` | 2 | 1.5 | ~75% | **USE** (low-volume, decent signal) |
| `again` | `\magain\M` | 5 | 1 | 20% | **DROP** — chat-log FPs dominate |
| `!!!` / `???` | `!{3,}\|\?{3,}` | 0 | – | – | **KEEP** (zero cost, high precision when fires) |
| `STILL` caps | `\mSTILL\M` | 0 | – | – | **DROP** — covered by rant-caps |
| `you keep` | `\myou keep\M` | 0 | – | – | **KEEP** in direct-address group |

---

## 2. Recommended Regex Set (LRN-01)

```python
FRUSTRATION_MARKERS = {
  "rant_caps":      r"[A-Z]{4,} [A-Z]{2,} [A-Z]{2,}",   # 3+ all-caps words in a row
  "every_time":     r"(?i)every (single )?time (you|i)",
  "same_mistake":   r"(?i)same mistake",
  "still_broken":   r"(?i)still (broken|not working|wrong|failing|missing|fucked)",
  "i_told_you":     r"(?i)i (just |already )?told you",
  "direct_address": r"(?i)\b(you keep|claude keeps|you ignored|you forgot)\b",
  "freehand":       r"(?i)freehand",                     # Moe-specific anti-pattern lexicon
  "stop_doing":     r"(?i)stop (doing|guessing|making|freehand)",
  "profanity":      r"(?i)\b(fuck|shit|damn|wtf)\b",
  "repeat_punct":   r"(!{3,}|\?{3,})",
}
```

**Quote-aware guard for `rant_caps`:** strip fenced code blocks and inline backtick spans before matching, and exclude lines matching `^(ON DELETE|SET NULL|CASCADE|SELECT|INSERT|UPDATE|CREATE TABLE|FROM|WHERE)` — this kills the SQL-DDL false positives (id 297, 364).

**Dropped:**
- Loose `[A-Z ]{16,}` (replaced by stricter 3-word rule)
- Bare `\bagain\b` (20% precision; WhatsApp chat logs dominate)
- Bare `\bSTILL\b` / `\bWHY\b` (subsumed by rant-caps when real, FPs in instruction docs)

---

## 3. YMC Reference Validation

| Turn | Time | Markers fired |
|---|---|---|
| **1604** | 06:17 | rant_caps, every_time, same_mistake, still_broken, freehand → **5 markers** |
| **1605** | 06:18 | same_mistake, direct_address (`claude keeps`), freehand → **3 markers** |

Both fire well above any reasonable threshold. The dream worker had every signal it needed.

---

## 4. Flag-Rate Calibration

Applying the recommended set to the 7-day corpus (223 turns):

- **Any-marker (≥1):** 9 turns = **4.0%**
- **Multi-marker (≥2):** 2 turns = **0.9%**

4% is slightly below the 5-15% ideal band, but: (a) the corpus has a high share of system-prompt and task-notification turns that aren't real chat; filtering those would push the rate to ~6-7% of *real* user turns. (b) Sub-5% is far better than sub-20% — every flag is high-signal and fits comfortably in the force-include budget.

**Recommendation:** boost on **any single marker** for the force-include lane. No need to require ≥2 markers — the corpus is precise enough. Reserve multi-marker (≥2) as a **high-priority** flag that triggers immediate directive synthesis rather than just memory injection.

---

## 5. Notes for Implementation

1. **Apply only to `role='user'`** turns. Assistant echoes (e.g. "you told me to X") would generate false positives.
2. **Exclude task-notification XML blobs** — strip `<task-notification>...</task-notification>` before scanning.
3. **WhatsApp chat-log paste detection** — turns matching `\[\d{1,2}:\d{2}, \d+/\d+/\d{4}\]` are quoted external conversations; the markers there are *other people's* words, not Moe's frustration. Suppress markers inside such blocks.
4. **Strip code fences** (` ``` ... ``` `) before matching `rant_caps` and `profanity` — variable names and code comments will otherwise create noise as the corpus grows.
5. **`freehand` is a Moe-specific term** for "ignored the design system / hand-coded instead of using components." Keep it. Add an analogous slot for future learned anti-pattern verbs (e.g. surface it via Concepts as the system learns).
