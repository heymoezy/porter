import { FastifyInstance } from 'fastify';
import { ok, err } from '../lib/envelope.js';
import { config } from '../config.js';
import fs from 'fs';
import path from 'path';

const TEMPLATE_FILES = ['SOUL.md', 'IDENTITY.md', 'ROLE_CARD.md', 'SKILLS.md', 'DELIVERABLES.md', 'MISSION.md'];

function templateDir(id: string) { return path.join(config.personasDir, '..', 'templates', id); }

function readTemplateFile(id: string, file: string): string | null {
  try { return fs.readFileSync(path.join(templateDir(id), file), 'utf-8'); }
  catch { return null; }
}

function writeTemplateFile(id: string, file: string, content: string) {
  const dir = templateDir(id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), content, 'utf-8');
}

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

      // Attach .md files if they exist
      const files: Record<string, string | null> = {};
      for (const file of TEMPLATE_FILES) {
        files[file] = readTemplateFile(id, file);
      }

      return ok({ ...data, files });
    } catch {
      return err('PROXY_UNREACHABLE', 'Could not reach Porter.py');
    }
  });

  // PUT /api/admin/templates/:id/files/:filename — edit template .md file
  fastify.put('/:id/files/:filename', async (req, reply) => {
    const { id, filename } = req.params as { id: string; filename: string };
    if (!TEMPLATE_FILES.includes(filename)) {
      reply.status(400);
      return err('INVALID_FILE', `Allowed: ${TEMPLATE_FILES.join(', ')}`);
    }
    const { content } = req.body as { content: string };
    if (typeof content !== 'string') {
      reply.status(400);
      return err('INVALID_BODY', 'Body must contain { content: string }');
    }
    try {
      writeTemplateFile(id, filename, content);
      return ok({ id, file: filename, size: content.length });
    } catch (e) {
      reply.status(500);
      return err('WRITE_FAILED', (e as Error).message);
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
