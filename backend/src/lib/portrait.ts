/**
 * portrait.ts — THE avatar renderer. One pure function, spec in, SVG string out.
 *
 * Moe 2026-10-14: *"please improve that tool to make the avatars a little more lifelike."* The tool
 * was `PixelPortrait`: a 16x24 grid of rectangles (a box head, two square eyes, a box body). It read
 * as a figure at 28px and as nobody at any size above that, and it could not leave the admin SPA,
 * so an agent's face could never travel to a chat, a deck or another product.
 *
 * ⚠️ ONE RENDERER, SERVED TWO WAYS. The admin component injects this string and
 * `GET /api/v1/portraits/render.svg` returns it, so a face drawn in the admin and a face sent to a
 * phone are the same drawing. A second drawing of the same spec drifts the first time either is
 * touched, which is why the old component is rebuilt on this rather than left beside it.
 *
 * ⚠️ EVERY VALUE THAT REACHES THE MARKUP IS VALIDATED HERE. The admin injects the result as HTML
 * and the endpoint takes the spec from a query string, so a colour is `#rrggbb` or the default and
 * every style is one of a closed list; nothing from the caller is ever interpolated unchecked.
 *
 * ⚠️ IDS ARE SCOPED PER DRAWING (`uid`). Gradients are referenced by id, and inline SVGs on one page
 * share one id space: without a prefix the sidebar's skin gradient would paint every face on the
 * page.
 *
 * ⚠️ NO FILTERS, NO FONTS, NO EXTERNAL REFERENCES. Shading is gradients and translucent shapes, so
 * the drawing rasterises identically in a browser and in resvg (which ymc uses to send it).
 *
 * Geometry is a 200x200 square: head centred at (100, 92), shoulders running off the bottom edge.
 */

export const HAIR_STYLES = [
  'short', 'parted', 'buzz', 'curly', 'wavy', 'slick', 'long', 'bob', 'ponytail', 'bun', 'mohawk', 'bald',
] as const;
export const FACE_SHAPES = ['oval', 'round', 'square', 'heart'] as const;
export const OUTFITS = ['tee', 'shirt', 'blazer', 'turtleneck', 'hoodie'] as const;
export const ACCESSORIES = ['none', 'glasses', 'headset', 'earpiece'] as const;
export const FACIAL_HAIR = ['none', 'stubble', 'moustache', 'beard'] as const;
export const EXPRESSIONS = ['smile', 'neutral', 'focused'] as const;
export const AGES = ['young', 'adult', 'senior'] as const;

export type HairStyle = (typeof HAIR_STYLES)[number];
export type FaceShape = (typeof FACE_SHAPES)[number];
export type Outfit = (typeof OUTFITS)[number];
export type Accessory = (typeof ACCESSORIES)[number];
export type FacialHair = (typeof FACIAL_HAIR)[number];
export type Expression = (typeof EXPRESSIONS)[number];
export type Age = (typeof AGES)[number];

export interface PortraitSpec {
  skin: string;
  hair: string;
  eyes: string;
  shirt: string;
  hairStyle: HairStyle;
  face: FaceShape;
  outfit: Outfit;
  accessory: Accessory;
  facialHair: FacialHair;
  expression: Expression;
  age: Age;
  /** Tie, inner collar, headset trim. */
  accent: string;
  /** The disc behind the head. */
  background: string;
}

export const DEFAULT_SPEC: PortraitSpec = {
  skin: '#e0ac69', hair: '#2c1b18', eyes: '#3b2a20', shirt: '#1e3a5f', hairStyle: 'short',
  face: 'oval', outfit: 'shirt', accessory: 'none', facialHair: 'none', expression: 'smile',
  age: 'adult', accent: '#e8eef5', background: '#dbe6f1',
};

/**
 * The swatches an editor offers. They live with the renderer so every editor offers the same
 * palette; the renderer still accepts any `#rrggbb`.
 */
export const PRESETS = {
  skin: ['#ffdbb4', '#f3d2b8', '#f1c9a5', '#e8b98f', '#e0ac69', '#d9a77c', '#c68642', '#a86b45', '#8d5524', '#7a4a2c', '#5c3317'],
  hair: ['#140d0b', '#2a1d17', '#3a2418', '#5a3a22', '#8b4513', '#a0522d', '#d4a76a', '#e8c86a', '#b9b4ac', '#e5e5e5'],
  eyes: ['#2a1a12', '#4a3426', '#3c4a5a', '#3b6ea5', '#1f8a7e', '#3d6b4f', '#5b6770'],
  cloth: ['#0f2a44', '#14294a', '#1e3a5f', '#22384f', '#334a66', '#1f2a37', '#475569', '#2f6f73', '#0f766e', '#4f46e5', '#7c3aed', '#be123c', '#e5e7eb'],
  accent: ['#ffffff', '#e8eef5', '#e9f3f2', '#2bb3a3', '#0f766e', '#4f46e5', '#be123c', '#1f2937'],
  background: ['#dbe6f1', '#d5e2f0', '#cfe3e6', '#cfe7e3', '#d7ecea', '#d3dbe4', '#dbe3ee', '#e5e1f5', '#ece7e1'],
} as const;

const HEX = /^#[0-9a-f]{6}$/i;

function colour(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const s = v.trim();
  if (HEX.test(s)) return s.toLowerCase();
  // Three-digit hex is common in hand-written specs; expand it rather than refuse it.
  if (/^#[0-9a-f]{3}$/i.test(s)) return ('#' + s.slice(1).split('').map((c) => c + c).join('')).toLowerCase();
  return fallback;
}

function oneOf<T extends string>(list: readonly T[], v: unknown, fallback: T): T {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}

/**
 * Accepts the old PixelPortrait props, a persona's stored `appearance_spec` (snake_case, with a
 * `palette`) or this module's own shape, and returns a spec where every field is known-good.
 * The old `mohawk`/`ponytail` names are kept; nothing that rendered before stops rendering.
 */
export function normalizeSpec(input: unknown): PortraitSpec {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const pal = (o.palette && typeof o.palette === 'object' ? o.palette : {}) as Record<string, unknown>;
  const pick = (k: string, alt?: string) => o[k] ?? (alt ? o[alt] : undefined) ?? pal[k];
  return {
    skin: colour(pick('skin'), DEFAULT_SPEC.skin),
    hair: colour(pick('hair'), DEFAULT_SPEC.hair),
    eyes: colour(pick('eyes'), DEFAULT_SPEC.eyes),
    shirt: colour(pick('shirt'), DEFAULT_SPEC.shirt),
    hairStyle: oneOf(HAIR_STYLES, pick('hairStyle', 'hair_style'), DEFAULT_SPEC.hairStyle),
    face: oneOf(FACE_SHAPES, pick('face'), DEFAULT_SPEC.face),
    outfit: oneOf(OUTFITS, pick('outfit'), DEFAULT_SPEC.outfit),
    accessory: oneOf(ACCESSORIES, pick('accessory'), DEFAULT_SPEC.accessory),
    facialHair: oneOf(FACIAL_HAIR, pick('facialHair', 'facial_hair'), DEFAULT_SPEC.facialHair),
    expression: oneOf(EXPRESSIONS, pick('expression'), DEFAULT_SPEC.expression),
    age: oneOf(AGES, pick('age'), DEFAULT_SPEC.age),
    accent: colour(pick('accent'), DEFAULT_SPEC.accent),
    background: colour(pick('background'), DEFAULT_SPEC.background),
  };
}

// ── colour arithmetic ────────────────────────────────────────────────────────

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function toHex([r, g, b]: [number, number, number]): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
/** Mix two colours; t=0 is `a`, t=1 is `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a), y = rgb(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}
const darken = (c: string, t: number) => mix(c, '#000000', t);
const lighten = (c: string, t: number) => mix(c, '#ffffff', t);
/** Perceived lightness 0..1, used to keep outlines visible on very dark or very light tones. */
function luma(c: string): number {
  const [r, g, b] = rgb(c);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// ── the parts ────────────────────────────────────────────────────────────────

interface Ctx { s: PortraitSpec; id: (name: string) => string; url: (name: string) => string }

/** The face outline. Every shape shares the same eye line so features never need re-placing. */
function facePath(shape: FaceShape): string {
  switch (shape) {
    case 'round':
      return 'M100,47 C130,47 143,67 143,93 C143,118 128,138 100,139 C72,138 57,118 57,93 C57,67 70,47 100,47 Z';
    case 'square':
      return 'M100,46 C129,46 141,62 141,90 C141,108 139,121 132,130 C124,138 112,141 100,141 C88,141 76,138 68,130 C61,121 59,108 59,90 C59,62 71,46 100,46 Z';
    case 'heart':
      return 'M100,46 C131,46 142,64 142,88 C142,108 130,126 116,135 C109,139 104,141 100,141 C96,141 91,139 84,135 C70,126 58,108 58,88 C58,64 69,46 100,46 Z';
    case 'oval':
    default:
      return 'M100,46 C128,46 140,66 140,92 C140,114 129,134 112,139 C107,140.5 103,141 100,141 C97,141 93,140.5 88,139 C71,134 60,114 60,92 C60,66 72,46 100,46 Z';
  }
}

function defs(c: Ctx): string {
  const { s } = c;
  return `<defs>
<radialGradient id="${c.id('bg')}" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="${lighten(s.background, 0.35)}"/><stop offset="1" stop-color="${darken(s.background, 0.08)}"/></radialGradient>
<radialGradient id="${c.id('skin')}" cx="42%" cy="36%" r="72%"><stop offset="0" stop-color="${lighten(s.skin, 0.12)}"/><stop offset="0.65" stop-color="${s.skin}"/><stop offset="1" stop-color="${darken(s.skin, 0.16)}"/></radialGradient>
<linearGradient id="${c.id('neck')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${darken(s.skin, 0.28)}"/><stop offset="0.45" stop-color="${darken(s.skin, 0.1)}"/><stop offset="1" stop-color="${s.skin}"/></linearGradient>
<linearGradient id="${c.id('hair')}" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="${lighten(s.hair, luma(s.hair) < 0.2 ? 0.22 : 0.14)}"/><stop offset="0.55" stop-color="${s.hair}"/><stop offset="1" stop-color="${darken(s.hair, 0.22)}"/></linearGradient>
<linearGradient id="${c.id('cloth')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(s.shirt, 0.1)}"/><stop offset="1" stop-color="${darken(s.shirt, 0.18)}"/></linearGradient>
<radialGradient id="${c.id('iris')}" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="${lighten(s.eyes, 0.3)}"/><stop offset="1" stop-color="${darken(s.eyes, 0.25)}"/></radialGradient>
<clipPath id="${c.id('disc')}"><circle cx="100" cy="100" r="100"/></clipPath>
<clipPath id="${c.id('face')}"><path d="${facePath(s.face)}"/></clipPath>
</defs>`;
}

/** Hair that sits BEHIND the head and shoulders (long styles, the hood, the ponytail). */
function hairBack(c: Ctx): string {
  const f = c.url('hair');
  switch (c.s.hairStyle) {
    case 'long':
      return `<path d="M58,90 C54,58 72,38 100,38 C128,38 146,58 142,90 C146,120 150,150 156,172 C140,178 122,176 112,170 L88,170 C78,176 60,178 44,172 C50,150 54,120 58,90 Z" fill="${f}"/>`;
    case 'bob':
      return `<path d="M58,92 C55,60 72,40 100,40 C128,40 145,60 142,92 C143,110 145,124 148,134 C134,140 120,138 114,132 L86,132 C80,138 66,140 52,134 C55,124 57,110 58,92 Z" fill="${f}"/>`;
    case 'wavy':
      return `<path d="M58,90 C55,58 72,40 100,40 C128,40 145,58 142,90 C146,104 150,118 146,132 C150,140 144,148 134,146 C126,144 120,140 116,134 L84,134 C80,140 74,144 66,146 C56,148 50,140 54,132 C50,118 54,104 58,90 Z" fill="${f}"/>`;
    case 'ponytail':
      return `<path d="M128,62 C152,66 160,92 154,118 C150,134 158,146 152,152 C142,146 140,132 138,118 C136,100 134,84 126,72 Z" fill="${f}"/>`;
    case 'bun':
      return `<circle cx="100" cy="34" r="17" fill="${f}"/><path d="M90,30 C94,24 106,24 110,30" fill="none" stroke="${darken(c.s.hair, 0.3)}" stroke-width="1.4" opacity="0.6"/>`;
    default:
      return '';
  }
}

/** Hair that sits ON the head, drawn after the face so it frames the forehead. */
function hairFront(c: Ctx): string {
  const f = c.url('hair');
  const line = darken(c.s.hair, 0.35);
  const sheen = lighten(c.s.hair, luma(c.s.hair) < 0.2 ? 0.3 : 0.25);
  const strands = (d: string) => `<path d="${d}" fill="none" stroke="${line}" stroke-width="1.2" stroke-linecap="round" opacity="0.45"/>`;
  const shine = (d: string) => `<path d="${d}" fill="none" stroke="${sheen}" stroke-width="2.2" stroke-linecap="round" opacity="0.45"/>`;
  switch (c.s.hairStyle) {
    case 'short':
      return `<path d="M60,86 C56,58 74,40 100,40 C128,40 146,58 140,86 C137,76 132,66 124,62 C114,58 104,60 96,59 C84,58 72,62 66,72 C63,77 61,82 60,86 Z" fill="${f}"/>`
        + strands('M78,52 C86,48 96,47 104,48 M92,58 C100,52 112,50 122,54') + shine('M80,50 C90,45 104,44 116,48');
    case 'parted':
      return `<path d="M60,90 C55,58 74,38 102,39 C130,40 146,60 140,88 C136,74 128,64 116,60 C104,57 92,64 82,66 C72,68 64,76 60,90 Z" fill="${f}"/>`
        + `<path d="M84,44 C88,52 88,58 86,64" fill="none" stroke="${line}" stroke-width="1.4" opacity="0.6"/>`
        + strands('M90,46 C106,44 124,50 134,64 M92,54 C106,52 120,56 128,64') + shine('M96,45 C110,43 124,48 132,58');
    case 'buzz':
      return `<path d="M61,84 C60,60 76,44 100,44 C124,44 140,60 139,84 C134,70 122,60 100,59 C78,60 66,70 61,84 Z" fill="${f}" opacity="0.88"/>`
        + `<path d="M70,62 C82,52 118,52 130,62" fill="none" stroke="${sheen}" stroke-width="1.6" opacity="0.3"/>`;
    case 'curly': {
      const curls = [
        [64, 78, 10], [68, 64, 11], [78, 52, 12], [92, 45, 12], [108, 45, 12], [122, 52, 12], [132, 64, 11], [136, 78, 10],
        [84, 60, 9], [100, 56, 10], [116, 60, 9],
      ];
      return curls.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}"/>`).join('')
        + curls.map(([x, y, r]) => `<path d="M${x - r * 0.5},${y - r * 0.2} a${r * 0.5},${r * 0.5} 0 0 1 ${r},0" fill="none" stroke="${sheen}" stroke-width="1.3" opacity="0.4"/>`).join('');
    }
    case 'wavy':
      return `<path d="M60,94 C54,60 74,40 100,40 C128,40 147,60 140,94 C136,80 130,70 120,64 C110,68 98,62 90,66 C80,70 72,66 68,74 C63,80 61,88 60,94 Z" fill="${f}"/>`
        + strands('M74,56 C84,50 92,56 100,50 C108,46 118,52 126,50') + shine('M82,48 C94,44 108,44 120,48');
    case 'slick':
      return `<path d="M61,84 C58,56 76,40 100,40 C126,40 143,56 139,84 C134,70 126,62 114,60 C102,58 86,60 76,66 C68,70 63,76 61,84 Z" fill="${f}"/>`
        + strands('M70,62 C84,50 112,46 132,58 M68,70 C86,58 116,54 136,68') + shine('M76,52 C92,44 114,44 128,52');
    case 'long':
      return `<path d="M60,96 C55,60 74,40 100,40 C126,40 145,60 140,96 C136,80 128,66 112,60 C106,58 102,60 100,64 C98,60 94,58 88,60 C72,66 64,80 60,96 Z" fill="${f}"/>`
        + strands('M100,44 L100,62 M86,50 C80,58 72,70 66,86 M114,50 C120,58 128,70 134,86') + shine('M78,52 C86,46 94,44 100,44');
    case 'bob':
      return `<path d="M59,96 C55,60 74,40 100,40 C126,40 145,60 141,96 C138,84 136,74 130,68 C116,72 98,68 84,70 C74,72 66,78 62,86 C60,90 59,93 59,96 Z" fill="${f}"/>`
        + shine('M80,50 C92,44 108,44 120,50');
    case 'ponytail':
      return `<path d="M60,88 C56,58 74,40 100,40 C128,40 146,58 140,88 C136,74 128,64 116,60 C104,57 88,60 78,64 C70,68 63,76 60,88 Z" fill="${f}"/>`
        + strands('M78,54 C92,46 112,46 128,56') + shine('M84,48 C96,44 110,44 120,48')
        + `<path d="M133,68 L139,64" stroke="${darken(c.s.hair, 0.45)}" stroke-width="3.5" stroke-linecap="round"/>`;
    case 'bun':
      return `<path d="M60,88 C56,58 74,42 100,42 C126,42 144,58 140,88 C136,74 128,64 114,61 C104,59 96,59 86,61 C72,64 64,74 60,88 Z" fill="${f}"/>`
        + strands('M78,56 C90,48 110,48 122,56') + shine('M84,50 C96,46 108,46 118,50');
    case 'mohawk':
      return `<path d="M88,62 C86,46 90,32 100,26 C110,32 114,46 112,62 C106,58 94,58 88,62 Z" fill="${f}"/>`
        + `<path d="M62,82 C62,68 70,58 82,54 L118,54 C130,58 138,68 138,82 C130,70 118,64 100,63 C82,64 70,70 62,82 Z" fill="${f}" opacity="0.35"/>`;
    case 'bald':
    default:
      return `<path d="M76,56 C86,49 104,48 118,54" fill="none" stroke="${lighten(c.s.skin, 0.35)}" stroke-width="3" stroke-linecap="round" opacity="0.45"/>`;
  }
}

function torso(c: Ctx): string {
  const { s } = c;
  const cloth = c.url('cloth');
  const fold = darken(s.shirt, 0.3);
  const shoulders = 'M8,206 C12,178 42,165 76,158 L124,158 C158,165 188,178 192,206 Z';
  const base = `<path d="${shoulders}" fill="${cloth}"/>`;
  switch (s.outfit) {
    case 'tee':
      return base
        + `<path d="M82,158 C88,170 112,170 118,158" fill="none" stroke="${fold}" stroke-width="3" stroke-linecap="round"/>`
        + `<path d="M52,182 C56,190 58,196 58,200 M148,182 C144,190 142,196 142,200" fill="none" stroke="${fold}" stroke-width="1.5" opacity="0.5"/>`;
    case 'turtleneck':
      return base
        + `<path d="M84,136 C84,150 84,156 82,160 L118,160 C116,156 116,150 116,136 Z" fill="${cloth}"/>`
        + `<path d="M84,142 L116,142 M84,148 L116,148 M84,154 L116,154" stroke="${fold}" stroke-width="1.4" opacity="0.5"/>`;
    case 'hoodie':
      return `<path d="M62,170 C64,150 80,144 100,144 C120,144 136,150 138,170 Z" fill="${darken(s.shirt, 0.15)}"/>` + base
        + `<path d="M80,158 C86,174 114,174 120,158" fill="${darken(s.shirt, 0.22)}"/>`
        + `<path d="M92,168 L90,190 M108,168 L110,190" stroke="${s.accent}" stroke-width="2" stroke-linecap="round"/>`
        + `<circle cx="90" cy="191" r="2" fill="${s.accent}"/><circle cx="110" cy="191" r="2" fill="${s.accent}"/>`;
    case 'blazer':
      return base
        // The shirt under the jacket.
        + `<path d="M84,158 L100,200 L116,158 Z" fill="${s.accent}"/>`
        + `<path d="M84,158 L94,170 L100,160 L106,170 L116,158" fill="${lighten(s.accent, 0.2)}" stroke="${darken(s.accent, 0.18)}" stroke-width="1"/>`
        + `<path d="M98,170 L102,170 L104,198 L100,200 L96,198 Z" fill="${darken(s.shirt, 0.45)}"/>`
        // Lapels.
        + `<path d="M82,158 L76,162 L90,190 L100,200 L94,176 L86,160 Z" fill="${darken(s.shirt, 0.18)}"/>`
        + `<path d="M118,158 L124,162 L110,190 L100,200 L106,176 L114,160 Z" fill="${darken(s.shirt, 0.18)}"/>`;
    case 'shirt':
    default:
      return base
        + `<path d="M84,156 L92,174 L100,162 L108,174 L116,156 L108,154 L100,162 L92,154 Z" fill="${lighten(s.shirt, 0.12)}" stroke="${fold}" stroke-width="1"/>`
        + `<path d="M100,164 L100,200" stroke="${fold}" stroke-width="1.2" opacity="0.6"/>`
        + `<circle cx="100" cy="180" r="1.3" fill="${fold}"/><circle cx="100" cy="192" r="1.3" fill="${fold}"/>`;
  }
}

function neck(c: Ctx): string {
  if (c.s.outfit === 'turtleneck') return `<path d="M86,124 L114,124 L115,140 L85,140 Z" fill="${c.url('neck')}"/>`;
  return `<path d="M86,124 L114,124 L116,160 C110,166 90,166 84,160 Z" fill="${c.url('neck')}"/>`;
}

function ears(c: Ctx): string {
  const { s } = c;
  const inner = darken(s.skin, 0.18);
  const ear = (x: number, dir: number) =>
    `<ellipse cx="${x}" cy="96" rx="7" ry="11" fill="${s.skin}"/>`
    + `<path d="M${x + dir * 2},90 C${x - dir * 2},92 ${x - dir * 2},100 ${x + dir * 1},104" fill="none" stroke="${inner}" stroke-width="1.6" stroke-linecap="round"/>`;
  return ear(60, 1) + ear(140, -1);
}

function eyesAndBrows(c: Ctx): string {
  const { s } = c;
  const lid = darken(s.skin, 0.45);
  const browC = luma(s.hair) > 0.75 ? darken(s.hair, 0.35) : darken(s.hair, 0.1);
  const browLift = s.expression === 'focused' ? 2 : s.expression === 'smile' ? -1 : 0;
  const eye = (cx: number) => {
    const half = cx < 100 ? -1 : 1;
    return `<path d="M${cx - 9},95 Q${cx},86 ${cx + 9},95 Q${cx},100 ${cx - 9},95 Z" fill="#fbfaf7"/>`
      + `<circle cx="${cx + half * 0.3}" cy="93.6" r="4.4" fill="${c.url('iris')}"/>`
      + `<circle cx="${cx + half * 0.3}" cy="93.6" r="2" fill="#111214"/>`
      + `<circle cx="${cx + half * 0.3 + 1.5}" cy="92.1" r="1.25" fill="#ffffff" opacity="0.92"/>`
      // Upper lid and a soft crease above it.
      + `<path d="M${cx - 9.5},95.2 Q${cx},85.6 ${cx + 9.5},95.2" fill="none" stroke="${lid}" stroke-width="1.8" stroke-linecap="round"/>`
      + `<path d="M${cx - 7},88.6 Q${cx},84.4 ${cx + 7},88.6" fill="none" stroke="${darken(s.skin, 0.2)}" stroke-width="1" opacity="0.55"/>`
      + `<path d="M${cx + half * 9.5},95.2 l${half * 2.2},-1.6" stroke="${lid}" stroke-width="1.3" stroke-linecap="round"/>`
      + (s.age === 'senior'
        ? `<path d="M${cx - 6},101 Q${cx},103 ${cx + 6},101" fill="none" stroke="${darken(s.skin, 0.22)}" stroke-width="0.9" opacity="0.7"/>`
        : '');
  };
  const brow = (cx: number) => {
    const out = cx < 100 ? -1 : 1;
    const inY = 81 + browLift + (s.expression === 'focused' ? 1.5 : 0);
    const outY = 80 + browLift - (s.expression === 'focused' ? 1 : 0);
    const xIn = cx - out * 8, xOut = cx + out * 10;
    return `<path d="M${xIn},${inY + 1.6} Q${cx},${inY - 4.5} ${xOut},${outY + 0.8} Q${cx},${inY - 2} ${xIn},${inY + 1.6} Z" fill="${browC}" stroke="${browC}" stroke-width="1.6" stroke-linejoin="round"/>`;
  };
  return eye(84) + eye(116) + brow(84) + brow(116);
}

function nose(c: Ctx): string {
  const shade = darken(c.s.skin, 0.22);
  return `<path d="M101,98 C102,105 105,110 107,114 C104,116 100,117 96,115" fill="none" stroke="${shade}" stroke-width="1.7" stroke-linecap="round" opacity="0.75"/>`
    + `<ellipse cx="95.5" cy="114.2" rx="2.2" ry="1.3" fill="${darken(c.s.skin, 0.3)}" opacity="0.55"/>`
    + `<ellipse cx="104.5" cy="114.2" rx="2.2" ry="1.3" fill="${darken(c.s.skin, 0.3)}" opacity="0.55"/>`
    + `<path d="M97,104 C98,108 99,110 99,112" fill="none" stroke="${lighten(c.s.skin, 0.4)}" stroke-width="1.6" stroke-linecap="round" opacity="0.5"/>`
    + `<path d="M98,117 L98.6,121 M102,117 L101.4,121" stroke="${darken(c.s.skin, 0.16)}" stroke-width="1" opacity="0.45"/>`;
}

function mouth(c: Ctx): string {
  const { s } = c;
  const lip = mix(darken(s.skin, 0.18), '#a8433d', 0.35);
  const line = darken(lip, 0.35);
  if (s.expression === 'smile') {
    return `<path d="M87,123 Q100,133 113,123 Q100,128 87,123 Z" fill="${lip}"/>`
      + `<path d="M88,123 Q100,130 112,123" fill="none" stroke="${line}" stroke-width="1.5" stroke-linecap="round"/>`
      + `<path d="M85.5,121.5 Q86.5,123.5 88,123.5 M114.5,121.5 Q113.5,123.5 112,123.5" fill="none" stroke="${darken(s.skin, 0.25)}" stroke-width="1" opacity="0.7"/>`;
  }
  const y = s.expression === 'focused' ? 125 : 124.5;
  return `<path d="M89,${y} Q100,${y - 3} 111,${y} Q100,${y + 4.5} 89,${y} Z" fill="${lip}"/>`
    + `<path d="M89,${y} Q100,${y + 1} 111,${y}" fill="none" stroke="${line}" stroke-width="1.4" stroke-linecap="round"/>`;
}

function cheeksAndAge(c: Ctx): string {
  const { s } = c;
  const blush = `<ellipse cx="75" cy="110" rx="9" ry="5" fill="#e3735f" opacity="0.13"/><ellipse cx="125" cy="110" rx="9" ry="5" fill="#e3735f" opacity="0.13"/>`;
  // Shadow under the brow ridge and down each side of the face, clipped to the face.
  const contour = `<g clip-path="${c.url('face')}">`
    + `<path d="M60,70 C64,100 72,124 92,140 L60,140 Z" fill="${darken(s.skin, 0.3)}" opacity="0.14"/>`
    + `<path d="M140,70 C136,100 128,124 108,140 L140,140 Z" fill="${darken(s.skin, 0.3)}" opacity="0.16"/>`
    + `<ellipse cx="100" cy="140" rx="22" ry="6" fill="${darken(s.skin, 0.3)}" opacity="0.18"/>`
    + `</g>`;
  const lines = s.age === 'senior'
    ? `<path d="M84,68 Q100,64 116,68 M86,73 Q100,70 114,73" fill="none" stroke="${darken(s.skin, 0.22)}" stroke-width="1" opacity="0.6"/>`
      + `<path d="M88,112 C85,118 85,122 87,126 M112,112 C115,118 115,122 113,126" fill="none" stroke="${darken(s.skin, 0.24)}" stroke-width="1.1" opacity="0.6"/>`
    : '';
  return contour + blush + lines;
}

function facialHair(c: Ctx): string {
  const { s } = c;
  const h = s.hair;
  switch (s.facialHair) {
    case 'stubble':
      return `<g clip-path="${c.url('face')}"><path d="M62,104 C66,128 84,142 100,142 C116,142 134,128 138,104 C132,118 122,128 112,130 C104,120 96,120 88,130 C78,128 68,118 62,104 Z" fill="${h}" opacity="0.16"/></g>`;
    case 'moustache':
      return `<path d="M86,121 C90,115 97,116 100,118 C103,116 110,115 114,121 C110,120 104,121 100,121 C96,121 90,120 86,121 Z" fill="${c.url('hair')}"/>`;
    case 'beard':
      return `<g clip-path="${c.url('face')}"><path d="M60,98 C62,128 82,146 100,146 C118,146 138,128 140,98 C136,112 128,124 118,128 C112,118 106,117 100,118 C94,117 88,118 82,128 C72,124 64,112 60,98 Z" fill="${c.url('hair')}"/></g>`
        + `<path d="M86,121 C90,115 97,116 100,118 C103,116 110,115 114,121 C110,120 104,121 100,121 C96,121 90,120 86,121 Z" fill="${c.url('hair')}"/>`
        + `<path d="M89,124 Q100,129 111,124" fill="none" stroke="${darken(s.skin, 0.4)}" stroke-width="1.4" stroke-linecap="round"/>`;
    default:
      return '';
  }
}

function accessory(c: Ctx): string {
  const { s } = c;
  switch (s.accessory) {
    case 'glasses': {
      const frame = luma(s.hair) < 0.25 ? '#1b1d22' : darken(s.hair, 0.55);
      const lens = (cx: number) => `<rect x="${cx - 12}" y="86" width="24" height="16" rx="6" fill="#dcecff" fill-opacity="0.16" stroke="${frame}" stroke-width="2.4"/>`;
      return lens(84) + lens(116)
        + `<path d="M96,92 Q100,89 104,92" fill="none" stroke="${frame}" stroke-width="2.2"/>`
        + `<path d="M72,91 L62,89 M128,91 L138,89" stroke="${frame}" stroke-width="2.2" stroke-linecap="round"/>`
        + `<path d="M75,89 L80,88" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>`;
    }
    case 'headset': {
      const band = '#26292f';
      return `<path d="M56,96 C52,52 76,32 100,32 C124,32 148,52 144,96" fill="none" stroke="${band}" stroke-width="5" stroke-linecap="round"/>`
        + `<rect x="49" y="86" width="14" height="22" rx="6" fill="${band}"/><rect x="137" y="86" width="14" height="22" rx="6" fill="${band}"/>`
        + `<rect x="52" y="90" width="8" height="14" rx="3" fill="${s.accent}" opacity="0.85"/>`
        + `<path d="M56,106 C58,122 70,128 84,128" fill="none" stroke="${band}" stroke-width="3" stroke-linecap="round"/>`
        + `<ellipse cx="86" cy="128" rx="4" ry="3" fill="${band}"/>`;
    }
    case 'earpiece':
      return `<path d="M141,92 C148,94 148,102 142,104" fill="none" stroke="#2a2d33" stroke-width="3.2" stroke-linecap="round"/>`
        // A white accent (the usual shirt colour under a blazer) would read as a blob on the ear.
        + `<circle cx="141" cy="98" r="3.2" fill="${luma(s.accent) > 0.8 ? '#4b5563' : s.accent}"/>`
        + `<path d="M144,104 C150,120 146,140 136,156" fill="none" stroke="#2a2d33" stroke-width="1.4" opacity="0.7"/>`;
    default:
      return '';
  }
}

export interface RenderOptions {
  /** Prefix for every id in the drawing; pass something unique per drawing on a shared page. */
  uid?: string;
  /** Pixel size written on the root element; the drawing itself always scales from 200x200. */
  size?: number;
  /** An accessible name. Escaped. */
  title?: string;
  /** Leave out the background disc (for a transparent cut-out). */
  transparent?: boolean;
}

function escapeText(t: string): string {
  return t.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

/** The whole portrait as one SVG document. Pure: same spec and options, same string. */
export function renderPortraitSvg(input: unknown, opts: RenderOptions = {}): string {
  const s = normalizeSpec(input);
  const uid = (opts.uid ?? 'p').replace(/[^a-zA-Z0-9_-]/g, '') || 'p';
  const c: Ctx = { s, id: (n) => `${uid}-${n}`, url: (n) => `url(#${uid}-${n})` };
  const size = Number.isFinite(opts.size) && (opts.size as number) > 0 ? Math.round(opts.size as number) : 200;
  const title = opts.title ? `<title>${escapeText(opts.title.slice(0, 120))}</title>` : '';
  const role = opts.title ? 'role="img"' : 'aria-hidden="true"';
  const bg = opts.transparent ? '' : `<circle cx="100" cy="100" r="100" fill="${c.url('bg')}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${size}" height="${size}" ${role}>${title}`
    + defs(c)
    + bg
    + `<g clip-path="${c.url('disc')}"><g transform="translate(100 120) scale(1.12) translate(-100 -120)">`
    + hairBack(c)
    + torso(c)
    + neck(c)
    + ears(c)
    + `<path d="${facePath(s.face)}" fill="${c.url('skin')}"/>`
    + cheeksAndAge(c)
    + facialHair(c)
    + nose(c)
    + mouth(c)
    + eyesAndBrows(c)
    + hairFront(c)
    + accessory(c)
    + `</g></g></svg>`;
}
