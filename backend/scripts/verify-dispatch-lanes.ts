/**
 * Proves the bridge dispatch lanes actually behave. Concurrency is the one place
 * where reading the code and believing it has a poor record here.
 *
 * ⚠️ THE REGRESSION BASELINE IS REAL. Until 2026-09-01 dispatch-queues.ts held ONE
 * PQueue at concurrency 1 and getQueue() ignored the gateway type it was handed, so
 * every model call on this box was strictly serial and a 12-hour workspace job could
 * block Tom's next chat turn. Tests 1 and 3 are the two things that could not happen.
 *
 * ⚠️ AND TEST 4 IS THE GUARDRAIL. Removing the serial job queue once before let two
 * personas on thirty-second heartbeats run ~285 CLI cold boots an hour for 58 hours.
 * Lanes without a global cap are that incident waiting again.
 *
 *   npx tsx scripts/verify-dispatch-lanes.ts
 */
import { runDispatch, acquireDispatchSlot, getQueueStats, MAX_INFLIGHT } from '../src/services/bridge/dispatch-queues.js';

let failures = 0;
const pass = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => { console.log(`  ✗ ${m}`); failures++; };
const check = (c: boolean, m: string) => (c ? pass(m) : fail(m));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let inFlight = 0, peak = 0;
async function task(ms: number, log?: string[], tag?: string) {
  inFlight++; peak = Math.max(peak, inFlight);
  if (log && tag) log.push(`start:${tag}`);
  await sleep(ms);
  if (log && tag) log.push(`end:${tag}`);
  inFlight--;
  return tag;
}

async function main() {
  console.log('\n1. different gateways run CONCURRENTLY (they were serial)');
  let t0 = Date.now();
  await Promise.all([
    runDispatch('codex_cli', 'interactive', () => task(200)),
    runDispatch('grok_cli', 'interactive', () => task(200)),
  ]);
  let ms = Date.now() - t0;
  check(ms < 350, `codex + grok took ${ms}ms, not ~400ms serial`);

  console.log('\n2. the SAME gateway and lane still serialises');
  t0 = Date.now();
  await Promise.all([
    runDispatch('claude_cli', 'interactive', () => task(150)),
    runDispatch('claude_cli', 'interactive', () => task(150)),
  ]);
  ms = Date.now() - t0;
  check(ms >= 290, `two claude interactive calls took ${ms}ms, i.e. one after the other`);

  console.log('\n3. an interactive turn is NOT stuck behind a long batch job on the same gateway');
  const order: string[] = [];
  const batch = runDispatch('claude_cli', 'batch', () => task(400, order, 'batch'));
  await sleep(20);
  const chat = runDispatch('claude_cli', 'interactive', () => task(50, order, 'chat'));
  await Promise.all([batch, chat]);
  check(order.indexOf('end:chat') < order.indexOf('end:batch'),
    `the chat turn finished first (${order.join(' ')})`);

  console.log('\n4. the global cap holds across every gateway and lane');
  peak = 0; inFlight = 0;
  await Promise.all(
    ['claude_cli', 'codex_cli', 'grok_cli', 'antigravity_cli'].flatMap(g => [
      runDispatch(g, 'interactive', () => task(120)),
      runDispatch(g, 'batch', () => task(120)),
    ]),
  );
  check(peak <= MAX_INFLIGHT, `peak in-flight was ${peak}, cap is ${MAX_INFLIGHT}`);
  check(peak > 1, `and it did run things in parallel (peak ${peak}), not serially`);

  console.log('\n5. stats name the lanes');
  const stats = getQueueStats();
  check('_global' in stats, 'the global gate is reported');
  check(Object.keys(stats).some(k => k.endsWith(':interactive')), 'interactive lanes are reported');
  check(Object.keys(stats).some(k => k.endsWith(':batch')), 'batch lanes are reported');

  console.log('\n6. a STREAM occupies a slot for as long as its tokens flow');
  // ⚠️ THE REGRESSION BASELINE. Until v6.163.0 dispatchStream called
  // adapter.stream() directly and took NO slot at all, so interactive chat —
  // the burstiest traffic on the box — was outside the cap that check 4 proves.
  peak = 0; inFlight = 0;
  const streamed = async (ms: number) => {
    const slot = await acquireDispatchSlot('claude_cli', 'interactive');
    inFlight++; peak = Math.max(peak, inFlight);
    try { await sleep(ms); } finally { inFlight--; slot.release(); }
  };
  t0 = Date.now();
  await Promise.all([streamed(150), streamed(150)]);
  ms = Date.now() - t0;
  check(ms >= 290, `two streams on one lane took ${ms}ms, i.e. they queued rather than both running`);

  console.log('\n7. streams and non-streams share the SAME cap');
  peak = 0; inFlight = 0;
  await Promise.all([
    ...['claude_cli', 'codex_cli', 'grok_cli', 'antigravity_cli'].map(g =>
      runDispatch(g, 'interactive', () => task(120))),
    ...['claude_cli', 'codex_cli', 'grok_cli', 'antigravity_cli'].map(async g => {
      const slot = await acquireDispatchSlot(g, 'batch');
      inFlight++; peak = Math.max(peak, inFlight);
      try { await sleep(120); } finally { inFlight--; slot.release(); }
    }),
  ]);
  check(peak <= MAX_INFLIGHT, `peak in-flight across both kinds was ${peak}, cap is ${MAX_INFLIGHT}`);
  check(peak > 1, `and they still ran in parallel (peak ${peak})`);

  console.log('\n8. a released slot is really given back, and releasing twice is safe');
  const s1 = await acquireDispatchSlot('codex_cli', 'interactive');
  s1.release();
  s1.release(); // must not free a second slot it never held
  t0 = Date.now();
  const s2 = await acquireDispatchSlot('codex_cli', 'interactive');
  ms = Date.now() - t0;
  s2.release();
  check(ms < 60, `the next acquire waited ${ms}ms, i.e. the slot was returned`);

  console.log('\n9. aborting while QUEUED returns at once and does not strand the lane');
  // The real hazard: a browser closes mid-stream while that stream is still
  // waiting its turn. On a concurrency-1 lane a waiter that ignored the abort
  // would sit out the entire dispatch in front of it, and a slot nobody wants
  // would then be taken. MAX_INFLIGHT of those wedges the bridge.
  const holder = await acquireDispatchSlot('grok_cli', 'batch');
  const ac = new AbortController();
  t0 = Date.now();
  const queued = acquireDispatchSlot('grok_cli', 'batch', ac.signal); // parked behind holder
  ac.abort();
  (await queued).release();
  ms = Date.now() - t0;
  check(ms < 60, `the aborted waiter returned in ${ms}ms instead of waiting for its turn`);

  holder.release();
  await sleep(20);
  t0 = Date.now();
  const afterAbort = await acquireDispatchSlot('grok_cli', 'batch');
  ms = Date.now() - t0;
  afterAbort.release();
  check(ms < 60, `and the lane was still usable afterwards (${ms}ms), not wedged`);

  console.log('\n10. an already-aborted signal never takes a slot at all');
  const pre = new AbortController();
  pre.abort();
  t0 = Date.now();
  const dead = await acquireDispatchSlot('antigravity_cli', 'interactive', pre.signal);
  dead.release();
  ms = Date.now() - t0;
  check(ms < 60, `acquire with a pre-aborted signal returned in ${ms}ms`);

  console.log(failures ? `\n${failures} FAILURE(S)\n` : '\nall checks passed\n');
  process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
