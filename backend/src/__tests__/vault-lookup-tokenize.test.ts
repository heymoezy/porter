/**
 * Tests for tokenizeQuery() — what porter_search_vault actually searches for.
 *
 * Run with: npx tsx --test backend/src/__tests__/vault-lookup-tokenize.test.ts
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * On 2026-09-09 Yai asked Tom, over WhatsApp, in a normal sentence:
 *
 *   "tom. can you give me the incorporation documents, the setup, and documents
 *    pertaining to the structure of nodal spc"
 *
 * The tokenizer was `q.split(/\s+/).filter(t => t.length >= 2).slice(0, 8)`, and
 * every search arm ANDs its tokens. So the vault was searched for
 *
 *   %tom.% AND %can% AND %you% AND %give% AND %me% AND %the%
 *          AND %incorporation% AND %documents,%
 *
 * — `nodal` and `spc` sit at positions 19 and 20 and were never searched AT ALL.
 * Zero rows from all three arms, guaranteed, and Tom reported that he could not
 * find the documents. They were there the whole time.
 *
 * The first test below is that exact sentence. It is the regression, not an
 * illustration: if someone reinstates a positional slice, or drops punctuation
 * stripping, or caps before removing stopwords, this goes red instead of a
 * person being told their documents do not exist.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { tokenizeQuery } from '../mcp/vault-lookup.js';

/** The message that exposed the bug, verbatim. */
const YAI = 'tom. can you give me the incorporation documents, the setup, and documents pertaining to the structure of nodal spc';

describe('tokenizeQuery — the Yai regression', () => {
  it('KEEPS the subject of the question', () => {
    const t = tokenizeQuery(YAI).map((x) => x.toLowerCase());
    // The two words that say WHAT is wanted. Losing these is the whole bug.
    assert.ok(t.includes('nodal'), `"nodal" must be searched — got ${JSON.stringify(t)}`);
    assert.ok(t.includes('spc'), `"spc" must be searched — got ${JSON.stringify(t)}`);
  });

  it('keeps the words that say what KIND of document', () => {
    const t = tokenizeQuery(YAI).map((x) => x.toLowerCase());
    assert.ok(t.includes('incorporation'));
    assert.ok(t.includes('documents'));
    assert.ok(t.includes('structure'));
  });

  it('drops the conversational opening that used to consume the whole budget', () => {
    const t = tokenizeQuery(YAI).map((x) => x.toLowerCase());
    for (const filler of ['can', 'you', 'give', 'me', 'the', 'and', 'to', 'of']) {
      assert.ok(!t.includes(filler), `"${filler}" should not be searched`);
    }
  });

  it('strips punctuation — "tom." and "documents," matched nothing', () => {
    const t = tokenizeQuery(YAI);
    assert.ok(!t.some((x) => x.includes('.') || x.includes(',')), JSON.stringify(t));
  });

  it('stays within the token cap', () => {
    assert.ok(tokenizeQuery(YAI).length <= 8);
  });
});

describe('tokenizeQuery — general', () => {
  it('leaves a keyword query alone (the shape the tool was designed for)', () => {
    assert.deepEqual(tokenizeQuery('Edward Chen workout'), ['Edward', 'Chen', 'workout']);
  });

  it('dedupes case-insensitively', () => {
    assert.deepEqual(tokenizeQuery('Nodal nodal NODAL spc'), ['Nodal', 'spc']);
  });

  it('drops one-character tokens', () => {
    assert.deepEqual(tokenizeQuery('a nodal x spc'), ['nodal', 'spc']);
  });

  it('keeps punctuation INSIDE a token, so identifiers survive', () => {
    assert.deepEqual(tokenizeQuery('nodal-spc v6.1'), ['nodal-spc', 'v6.1']);
  });

  it('searches the stopwords rather than nothing when that is all there is', () => {
    // "no such document" and "we searched for nothing" are different answers and
    // the caller cannot tell them apart, so never return an empty token list.
    const t = tokenizeQuery('what is the');
    assert.ok(t.length > 0, 'a non-empty query must never search for nothing');
  });

  it('is empty only for an empty or punctuation-only query', () => {
    assert.deepEqual(tokenizeQuery(''), []);
    assert.deepEqual(tokenizeQuery('   '), []);
    assert.deepEqual(tokenizeQuery('?! ...'), []);
  });

  it('over the cap, keeps the MOST SELECTIVE tokens, not the first ones', () => {
    // A positional slice is what lost "nodal spc". Nine content words, cap 8:
    // the shortest must be the one dropped, never the last-written.
    const t = tokenizeQuery('aa incorporation memorandum association resolutions shareholders directors registered nodalspcstructure');
    assert.equal(t.length, 8);
    assert.ok(t.includes('nodalspcstructure'), 'the longest, rarest token must survive');
    assert.ok(!t.includes('aa'), 'the least selective token is the one to drop');
  });

  it('preserves written order among the tokens it keeps', () => {
    const t = tokenizeQuery('incorporation documents nodal spc');
    assert.deepEqual(t, ['incorporation', 'documents', 'nodal', 'spc']);
  });
});
