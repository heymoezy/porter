/**
 * pii-scrub.ts — Shared PII redaction for Intellect-layer writers.
 *
 * Refactored from backend/src/services/learner.ts (Phase 48.2 TRC-05).
 * Both the learner (correction/feedback signals) and the transcript-capture
 * pipeline share this set so PII rules stay one copy.
 *
 * Patterns covered:
 *   - email addresses
 *   - @-handles (Twitter/Slack-style)
 *   - phone numbers (US-style with dashes/spaces/parens)
 *
 * Output token: [REDACTED] (constant — match existing learner.ts behavior).
 */

// Verbatim from learner.ts lines 193-205 (extracted to shared helper 2026-05-11)
export const PII_PATTERNS: RegExp[] = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,  // emails
  /\B@[A-Za-z0-9_]{2,}\b/g,                                    // @handles (min 2 chars)
  /\b\+?[\d][\d\s\-().]{7,}\d\b/g,                             // phone numbers
];

export function scrubPII(text: string): string {
  if (!text) return text;
  let clean = text;
  for (const pattern of PII_PATTERNS) {
    // Re-construct the RegExp per call so the /g state doesn't leak between
    // invocations (mirrors learner.ts behavior exactly).
    clean = clean.replace(new RegExp(pattern.source, pattern.flags), '[REDACTED]');
  }
  return clean;
}
