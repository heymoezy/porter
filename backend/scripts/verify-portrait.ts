/**
 * verify-portrait.ts — the avatar renderer's promises, checked.
 *
 * The admin injects the renderer's output as HTML and the endpoint takes its spec from a query
 * string, so the one property that matters is that nothing the caller sends reaches the markup
 * unchecked. Also: every listed style draws, ids carry the per-drawing prefix, same input gives
 * the same string.
 *
 *   npx tsx backend/scripts/verify-portrait.ts
 */
import {
  ACCESSORIES, AGES, EXPRESSIONS, FACE_SHAPES, FACIAL_HAIR, HAIR_STYLES, OUTFITS,
  normalizeSpec, renderPortraitSvg,
} from '../src/lib/portrait.js';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failed++;
};

// 1. Hostile values never reach the markup.
const evil = '"/><script>alert(1)</script><x a="';
const hostile = renderPortraitSvg({
  skin: evil, hair: 'url(javascript:alert(1))', eyes: 'red;x:expression(1)', shirt: evil,
  hairStyle: evil, face: evil, outfit: evil, accessory: evil, accent: evil, background: evil,
}, { uid: '"><img src=x onerror=alert(1)>', title: '<script>t</script>' });
check('no script tag survives', !/<script/i.test(hostile));
check('no javascript: survives', !/javascript:/i.test(hostile));
check('no event-handler attribute survives', !/\son[a-z]+\s*=/i.test(hostile));
check('title is escaped', hostile.includes('&lt;script&gt;t&lt;/script&gt;'));

// 2. A bad value falls back to the default rather than throwing.
const n = normalizeSpec({ skin: 'nope', hairStyle: 'nope', hair: '#ABC' });
check('bad colour falls back', /^#[0-9a-f]{6}$/.test(n.skin));
check('3-digit hex expands', n.hair === '#aabbcc', n.hair);
check('bad style falls back', (HAIR_STYLES as readonly string[]).includes(n.hairStyle));

// 3. A persona's stored appearance_spec (snake_case + palette) is read.
const persona = normalizeSpec({ hair_style: 'curly', palette: { skin: '#f1c27d', shirt: '#1e3a5f' } });
check('persona spec read', persona.hairStyle === 'curly' && persona.skin === '#f1c27d' && persona.shirt === '#1e3a5f');

const cut = renderPortraitSvg({}, { cutout: true });
const disc = renderPortraitSvg({});
check('cut-out has no background disc', !cut.includes('fill="url(#p-bg)"'));
check('cut-out is not clipped to a circle', !cut.includes('clip-path="url(#p-disc)"'));
check('normal render keeps the disc and the clip (control)', disc.includes('fill="url(#p-bg)"') && disc.includes('clip-path="url(#p-disc)"'));

// 4. Every style draws, and ids are prefixed.
const lists: [string, readonly string[]][] = [
  ['hairStyle', HAIR_STYLES], ['face', FACE_SHAPES], ['outfit', OUTFITS], ['accessory', ACCESSORIES],
  ['facialHair', FACIAL_HAIR], ['expression', EXPRESSIONS], ['age', AGES],
];
let styleFailures = 0;
for (const [k, list] of lists) for (const v of list) {
  const svg = renderPortraitSvg({ [k]: v }, { uid: 'z9' });
  const ids = [...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  if (!svg.startsWith('<svg') || !svg.endsWith('</svg>') || ids.some((id) => !id.startsWith('z9-'))) {
    check(`${k}=${v} draws with prefixed ids`, false);
    styleFailures++;
  }
}
check('every style draws with prefixed ids', styleFailures === 0);

// 5. Deterministic.
const a = renderPortraitSvg({ hairStyle: 'bob', accessory: 'headset' }, { uid: 'd' });
const b = renderPortraitSvg({ hairStyle: 'bob', accessory: 'headset' }, { uid: 'd' });
check('same input, same string', a === b);

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nportrait renderer: all checks pass');
