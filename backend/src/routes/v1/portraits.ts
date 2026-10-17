import { FastifyInstance } from 'fastify';
import { err } from '../../lib/envelope.js';
import {
  ACCESSORIES, AGES, EXPRESSIONS, FACE_SHAPES, FACIAL_HAIR, HAIR_STYLES, OUTFITS, PRESETS, renderPortraitSvg,
} from '../../lib/portrait.js';

/**
 * Portraits v1 — the avatar renderer as a service, so a product (ymc's Tom desk first) draws its
 * agents with the same tool the admin uses rather than keeping a second drawing of its own.
 *
 *   GET /api/v1/portraits/render.svg?spec=<json>&size=<px>&title=<text>&transparent=1&cutout=1
 *   GET /api/v1/portraits/options   the choices a spec may name, so a caller validates against the
 *                                   renderer's own lists instead of keeping a copy that drifts
 *
 * `spec` is a PortraitSpec (or the older PixelPortrait props, or a persona's `appearance_spec`);
 * the renderer validates every field, so an unknown style or a bad colour falls back to the default
 * instead of reaching the markup. The answer is SVG; a caller that needs a raster rasterises it.
 *
 * Auth: `requireAuth` (a platform_admin session or the X-Porter-Service-Token), like every v1
 * route that is not the health check.
 */
const MAX_SPEC_CHARS = 4_000;

export default async function portraitsV1Routes(fastify: FastifyInstance) {
  fastify.get('/options', { preHandler: [fastify.requireAuth] }, async () => ({
    styles: {
      hairStyle: HAIR_STYLES, face: FACE_SHAPES, outfit: OUTFITS, accessory: ACCESSORIES,
      facialHair: FACIAL_HAIR, expression: EXPRESSIONS, age: AGES,
    },
    // Any #rrggbb is accepted for these; the presets are the palette the editor offers.
    colours: ['skin', 'hair', 'eyes', 'shirt', 'accent', 'background'],
    presets: PRESETS,
  }));

  fastify.get('/render.svg', { preHandler: [fastify.requireAuth] }, async (request, reply) => {
    const q = request.query as { spec?: string; size?: string; title?: string; transparent?: string; cutout?: string };
    let spec: unknown = {};
    if (q.spec) {
      if (q.spec.length > MAX_SPEC_CHARS) {
        return reply.code(400).send(err('SPEC_TOO_LONG', `spec is over ${MAX_SPEC_CHARS} characters`, request.id));
      }
      try { spec = JSON.parse(q.spec); }
      catch { return reply.code(400).send(err('BAD_SPEC', 'spec is not JSON', request.id)); }
    }
    const size = Math.min(1024, Math.max(16, Number(q.size) || 200));
    const svg = renderPortraitSvg(spec, { size, title: q.title, transparent: q.transparent === '1', cutout: q.cutout === '1' });
    return reply
      .header('content-type', 'image/svg+xml; charset=utf-8')
      // An SVG opened directly is a document; it carries no script, and this says so.
      .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'")
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'private, max-age=300')
      .send(svg);
  });
}
