/**
 * Proves the nightly distiller hands the model dated episodes and asks for a dated recap.
 *
 * ⚠️ WHY (2026-09-26): episodes went in with no date, so a fortnight read as one present. Tom's
 * self-summary, injected every turn as "where I am right now", told Moe that August proposal
 * verdicts and a service provider "gone dark" in July had happened this week, and a claim Moe had
 * corrected came back because nothing said which statement was the later one.
 *
 *   npx tsx scripts/verify-distiller-dates.ts
 */
import { readFileSync } from 'node:fs';
import { buildPrompt } from '../src/services/intellect/distiller.js';

let failures = 0;
const check = (c: boolean, m: string) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) failures++; };

const src = readFileSync(new URL('../src/services/intellect/distiller.ts', import.meta.url), 'utf8');
check(/`\[\$\{e\.day\}\] `/.test(src), 'every episode line starts with its date');
check(/AT TIME ZONE 'Asia\/Singapore'/.test(src), 'the date is the Singapore day');
check(/RECAP WRITTEN \$\{today\} FROM EPISODES DATED/.test(src) && !/`AS OF \$\{/.test(src), 'the stored recap says when it was written and what it covers');

const p = buildPrompt('tom', ['[2026-08-18] [s1] Moe rejected the landlord proposal'], [], '2026-09-26');
check(p.includes('Today is 2026-09-26'), 'the prompt states today');
check(/Never write "this week"/.test(p), 'the prompt forbids "this week"');
check(/keep only the later one/.test(p), 'a later correction replaces the earlier claim');
check(/last 3 days/.test(p), 'only a thread seen in the last 3 days is called open');

console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
