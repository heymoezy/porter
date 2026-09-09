/**
 * Pins the INTAKE CONTRACT on the WhatsApp webhook: nothing arrives and vanishes.
 *
 * Run with: npx tsx --test backend/src/__tests__/whatsapp-inbound.test.ts
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The handler used to read exactly `entry[0].changes[0].messages[0]`, then bail on
 * `if (!from || !messageText)`. Two silent losses followed from those two lines:
 *
 *   1. Meta batches. Send three messages quickly and they arrive in ONE POST; the
 *      second and third were discarded and the batch was acknowledged with a 200,
 *      so the sender saw delivery and Porter never answered.
 *   2. Only `text` messages carry `text.body`. A photo, a voice note, a forwarded
 *      PDF, a tap on a quick-reply button — every one of them has an empty body
 *      and was treated as a status update.
 *
 * Both are the reported symptom: messages dropped before a reply. These tests hold
 * the two pure functions the fix rests on, so a future refactor cannot quietly
 * reintroduce either loss.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenInboundMessages, describeMessage } from '../routes/v1/webhooks-whatsapp.js';

// ── Batching ──────────────────────────────────────────────────────────────────

test('every message in a batch survives, across entries and changes', () => {
  const flat = flattenInboundMessages({
    entry: [
      {
        changes: [
          { value: { messages: [{ id: 'a', from: '1', type: 'text', text: { body: 'one' } },
                                { id: 'b', from: '1', type: 'text', text: { body: 'two' } }] } },
          { value: { messages: [{ id: 'c', from: '1', type: 'text', text: { body: 'three' } }] } },
        ],
      },
      { changes: [{ value: { messages: [{ id: 'd', from: '2', type: 'text', text: { body: 'four' } }] } }] },
    ],
  });

  assert.deepEqual(flat.map((f) => f.msg.id), ['a', 'b', 'c', 'd']);
});

test('order is preserved, so replies follow the order they were written in', () => {
  const flat = flattenInboundMessages({
    entry: [{ changes: [{ value: { messages: [
      { id: '1', type: 'text', text: { body: 'first' } },
      { id: '2', type: 'text', text: { body: 'second' } },
      { id: '3', type: 'text', text: { body: 'third' } },
    ] } }] }],
  });

  assert.deepEqual(flat.map((f) => f.msg.text?.body), ['first', 'second', 'third']);
});

test('each message keeps the value envelope it arrived in', () => {
  const flat = flattenInboundMessages({
    entry: [{ changes: [
      { value: { contacts: [{ wa_id: '1', profile: { name: 'Ada' } }], messages: [{ id: 'a', from: '1' }] } },
      { value: { contacts: [{ wa_id: '2', profile: { name: 'Moe' } }], messages: [{ id: 'b', from: '2' }] } },
    ] }],
  });

  assert.equal(flat[0].value.contacts?.[0]?.profile?.name, 'Ada');
  assert.equal(flat[1].value.contacts?.[0]?.profile?.name, 'Moe');
});

test('a status-update payload yields nothing, and yields it without throwing', () => {
  assert.deepEqual(flattenInboundMessages({ entry: [{ changes: [{ value: { messaging_product: 'whatsapp' } }] }] }), []);
  assert.deepEqual(flattenInboundMessages({ entry: [] }), []);
  assert.deepEqual(flattenInboundMessages({}), []);
  assert.deepEqual(flattenInboundMessages(undefined), []);
});

// ── Non-text message types ────────────────────────────────────────────────────

test('text comes through verbatim', () => {
  assert.deepEqual(describeMessage({ type: 'text', text: { body: 'where are we on the deck?' } }),
    { content: 'where are we on the deck?', routable: true });
});

test('media without a caption still says something, and still reaches the agent', () => {
  for (const type of ['image', 'video', 'audio', 'document']) {
    const { content, routable } = describeMessage({ type });
    assert.notEqual(content, '', `${type} produced no content`);
    assert.equal(routable, true, `${type} would not reach the agent`);
  }
});

test('a caption is the message when there is one', () => {
  assert.equal(describeMessage({ type: 'image', image: { caption: 'this slide' } }).content, 'this slide');
  assert.equal(describeMessage({ type: 'video', video: { caption: 'watch 0:14' } }).content, 'watch 0:14');
});

test('a voice note is distinguishable from an audio file', () => {
  assert.equal(describeMessage({ type: 'audio', audio: { voice: true } }).content, '[voice note]');
  assert.equal(describeMessage({ type: 'audio', audio: { voice: false } }).content, '[audio]');
});

test('a document names itself, and keeps its caption', () => {
  assert.equal(describeMessage({ type: 'document', document: { filename: 'term-sheet.pdf' } }).content,
    '[document: term-sheet.pdf]');
  assert.equal(describeMessage({ type: 'document', document: { filename: 'term-sheet.pdf', caption: 'clause 4' } }).content,
    '[document: term-sheet.pdf] clause 4');
});

test('a tap on a quick-reply button carries the title the user saw', () => {
  assert.deepEqual(describeMessage({ type: 'interactive', interactive: { button_reply: { id: 'yes', title: 'Yes, send it' } } }),
    { content: 'Yes, send it', routable: true });
  assert.deepEqual(describeMessage({ type: 'interactive', interactive: { list_reply: { id: 'b', title: 'Tuesday' } } }),
    { content: 'Tuesday', routable: true });
  assert.deepEqual(describeMessage({ type: 'button', button: { text: 'Stop' } }),
    { content: 'Stop', routable: true });
});

test('a location resolves to a place or to coordinates', () => {
  assert.equal(describeMessage({ type: 'location', location: { name: 'The office' } }).content, '[location: The office]');
  assert.equal(describeMessage({ type: 'location', location: { latitude: 25.2, longitude: 55.3 } }).content, '[location: 25.2,55.3]');
});

// ── Things that should NOT wake the agent ─────────────────────────────────────

test('a reaction is archived but never answered', () => {
  const reaction = describeMessage({ type: 'reaction', reaction: { emoji: '👍' } });
  assert.equal(reaction.routable, false);
  assert.notEqual(reaction.content, '', 'a reaction still belongs in the history');

  assert.equal(describeMessage({ type: 'sticker' }).routable, false);
  assert.equal(describeMessage({ type: 'unsupported' }).routable, false);
});

// ── The general guarantee ─────────────────────────────────────────────────────

test('no message type renders as empty — empty is what got them dropped', () => {
  // 'text' is excluded on purpose: a text message with no body IS empty, and the
  // handler reports that as a drop rather than routing a blank line. Every other
  // type must render something, because emptiness is what got them discarded.
  const types = ['image', 'video', 'audio', 'document', 'sticker', 'location',
                 'contacts', 'reaction', 'button', 'interactive', 'unsupported',
                 'order', 'system', 'something_meta_ships_next_year'];

  for (const type of types) {
    // Deliberately bare: no sub-object, the shape a malformed or novel payload has.
    const { content } = describeMessage({ type });
    assert.notEqual(content.trim(), '', `type "${type}" rendered empty and would be dropped`);
  }
});

test('an empty text body is the one genuinely empty case, and is reported as such', () => {
  // Caller treats empty content as a drop and records it, rather than 200-ing in silence.
  assert.equal(describeMessage({ type: 'text', text: { body: '   ' } }).content, '');
});
