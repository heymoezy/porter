import { FastifyInstance } from 'fastify';
import { ok, err } from '../lib/envelope.js';
import { config } from '../config.js';

export default async function templatesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/templates — proxy to porter.py /api/templates
  fastify.get('/', async (req) => {
    const url = new URL('/api/templates', config.porterPyUrl);
    const cat = (req.query as Record<string, string>).category;
    if (cat) url.searchParams.set('category', cat);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { Cookie: req.headers.cookie || '' },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return err('PROXY_ERROR', `Porter.py returned ${res.status}`);
      }

      const data = await res.json();
      const templates = data.templates || [];

      // Compute category stats
      const catCounts: Record<string, number> = {};
      const archetypeCounts: Record<string, number> = {};
      for (const t of templates) {
        catCounts[t.category || 'uncategorized'] = (catCounts[t.category || 'uncategorized'] || 0) + 1;
        archetypeCounts[t.archetype || 'unknown'] = (archetypeCounts[t.archetype || 'unknown'] || 0) + 1;
      }

      return ok({
        templates,
        count: templates.length,
        categories: catCounts,
        archetypes: archetypeCounts,
      });
    } catch (e) {
      return err('PROXY_UNREACHABLE', 'Could not reach Porter.py — is it running?');
    }
  });

  // GET /api/admin/templates/:id — proxy to porter.py /api/templates/:id
  fastify.get('/:id', async (req) => {
    const { id } = req.params as { id: string };
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${config.porterPyUrl}/api/templates/${id}`, {
        signal: controller.signal,
        headers: { Cookie: req.headers.cookie || '' },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return err('NOT_FOUND', `Template ${id} not found`);
      }

      const data = await res.json();
      return ok(data);
    } catch {
      return err('PROXY_UNREACHABLE', 'Could not reach Porter.py');
    }
  });

  // GET /api/admin/templates/stats — category/archetype distribution
  fastify.get('/stats', async (req) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${config.porterPyUrl}/api/templates`, {
        signal: controller.signal,
        headers: { Cookie: req.headers.cookie || '' },
      });
      clearTimeout(timeout);

      if (!res.ok) return err('PROXY_ERROR', `Porter.py returned ${res.status}`);

      const data = await res.json();
      const templates = data.templates || [];

      const catCounts: Record<string, number> = {};
      const archetypeCounts: Record<string, number> = {};
      for (const t of templates) {
        catCounts[t.category || 'uncategorized'] = (catCounts[t.category || 'uncategorized'] || 0) + 1;
        archetypeCounts[t.archetype || 'unknown'] = (archetypeCounts[t.archetype || 'unknown'] || 0) + 1;
      }

      return ok({ total: templates.length, categories: catCounts, archetypes: archetypeCounts });
    } catch {
      return err('PROXY_UNREACHABLE', 'Could not reach Porter.py');
    }
  });
}
