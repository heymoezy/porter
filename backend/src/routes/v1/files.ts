import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { ok, err } from '../../lib/envelope.js';
import { config, LOCAL_HOSTS } from '../../config.js';
import { pool } from '../../db/client.js';
import { z } from 'zod';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// --- MIME detection ---------------------------------------------------------

const MIME_MAP: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon',
  pdf: 'application/pdf', json: 'application/json', html: 'text/html',
  css: 'text/css', js: 'application/javascript', wasm: 'application/wasm',
  zip: 'application/zip', gz: 'application/gzip', tar: 'application/x-tar',
  mp3: 'audio/mpeg', mp4: 'video/mp4', webm: 'video/webm',
};

const TEXT_EXTS = new Set([
  'py', 'js', 'ts', 'tsx', 'jsx', 'sh', 'json', 'yaml', 'yml', 'toml', 'md',
  'txt', 'log', 'csv', 'html', 'css', 'xml', 'ini', 'conf', 'rs', 'go',
  'java', 'c', 'cpp', 'h', 'rb', 'php', 'env', 'bash', 'sql', 'graphql',
]);

function getMime(ext: string): string {
  if (TEXT_EXTS.has(ext)) return 'text/plain';
  return MIME_MAP[ext] || 'application/octet-stream';
}

// --- Serve-root resolution --------------------------------------------------

/**
 * Build the SERVE_DIRS map from porter_config.json.
 * Falls back to sensible defaults if config is missing.
 */
function getServeDirs(): Record<string, string> {
  const dirs: Record<string, string> = {};

  // Try loading from porter_config.json (nodes → mounts)
  try {
    const cfgPath = path.join(config.dataDir, 'porter_config.json');
    const raw = fsSync.readFileSync(cfgPath, 'utf-8');
    const cfg = JSON.parse(raw);

    // nodes[*].mounts
    const nodes = cfg.nodes || cfg.fleet?.devices || {};
    for (const node of Object.values(nodes) as any[]) {
      if (node.type !== 'local' && !LOCAL_HOSTS.has(node.host)) continue;
      const mounts = node.mounts || [];
      for (const m of mounts) {
        if (m.id && m.path) dirs[m.id] = m.path;
      }
    }

    // Legacy locations fallback
    if (Object.keys(dirs).length === 0 && cfg.locations) {
      for (const loc of cfg.locations) {
        if (loc.id && loc.path) dirs[loc.id] = loc.path;
      }
    }
  } catch {
    // Config not found or not parseable — use defaults
  }

  // If still empty, use sensible defaults
  if (Object.keys(dirs).length === 0) {
    const home = os.homedir();
    dirs['documents'] = path.join(home, 'documents');
    dirs['uploads'] = path.join(home, 'uploads');
  }

  return dirs;
}

// --- Path traversal protection ----------------------------------------------

/**
 * Resolve a path safely within a serve root. Prevents traversal attacks.
 * Returns the resolved absolute path or null if invalid.
 */
function safeResolve(rootPath: string, rel: string): string | null {
  try {
    const root = path.resolve(rootPath);
    const decoded = decodeURIComponent(rel || '');
    const target = path.resolve(root, decoded);

    // Must be within root (prevent ../ traversal)
    if (!target.startsWith(root + path.sep) && target !== root) {
      return null;
    }

    return target;
  } catch {
    return null;
  }
}

/**
 * Check if a path is writable by the current process (same uid owns it).
 */
async function isWritable(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.uid === process.getuid!();
  } catch {
    return false;
  }
}

/**
 * Sanitize a filename: replace dangerous characters with underscores.
 */
function safeName(name: string): string {
  return name.replace(/[^\w.\- ]/g, '_').trim();
}

/**
 * Format file size to human readable.
 */
function humanSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return i === 0 ? `${n} ${units[i]}` : `${n.toFixed(1)} ${units[i]}`;
}

// --- Schemas ----------------------------------------------------------------

const mkdirSchema = z.object({
  root: z.string().min(1),
  path: z.string().default(''),
  name: z.string().min(1),
});

const deleteSchema = z.object({
  root: z.string().min(1),
  path: z.string().default(''),
  name: z.string().min(1),
});

const renameSchema = z.object({
  root: z.string().min(1),
  path: z.string().default(''),
  name: z.string().min(1),
  newName: z.string().min(1),
});

// --- Route plugin -----------------------------------------------------------

export default async function filesV1Routes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // GET /api/v1/files — list directory contents
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { root, path: relPath } = request.query as { root?: string; path?: string };

    if (!root) {
      // Return available roots
      const dirs = getServeDirs();
      const roots = Object.keys(dirs);
      return reply.send(ok({ roots }));
    }

    const dirs = getServeDirs();
    const rootPath = dirs[root];
    if (!rootPath) {
      return reply.code(404).send(err('ROOT_NOT_FOUND', `Unknown root: ${root}`));
    }

    const target = safeResolve(rootPath, relPath || '');
    if (!target) {
      return reply.code(400).send(err('INVALID_PATH', 'Invalid path'));
    }

    try {
      const stat = await fs.stat(target);
      if (!stat.isDirectory()) {
        return reply.code(400).send(err('NOT_DIRECTORY', 'Path is not a directory'));
      }
    } catch {
      return reply.code(404).send(err('NOT_FOUND', 'Path not found'));
    }

    try {
      const items = await fs.readdir(target, { withFileTypes: true });
      // Sort: directories first, then alphabetically
      items.sort((a, b) => {
        const aDir = a.isDirectory() ? 0 : 1;
        const bDir = b.isDirectory() ? 0 : 1;
        if (aDir !== bDir) return aDir - bDir;
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });

      const entries = [];
      for (const item of items) {
        try {
          const fullPath = path.join(target, item.name);
          const st = await fs.stat(fullPath);
          entries.push({
            name: item.name,
            type: item.isDirectory() ? 'dir' : 'file',
            size: item.isFile() ? humanSize(st.size) : '',
            size_bytes: item.isFile() ? st.size : -1,
            mtime: st.mtimeMs / 1000,
            writable: st.uid === process.getuid!(),
          });
        } catch {
          continue; // Skip items we can't stat
        }
      }

      const writable = await isWritable(target);
      return reply.send(ok({ entries, writable }));
    } catch (e: any) {
      return reply.code(500).send(err('FS_ERROR', e.message ?? 'Failed to list directory'));
    }
  });

  // GET /api/v1/files/content — serve file content
  fastify.get('/content', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { root, path: relPath } = request.query as { root?: string; path?: string };

    if (!root || !relPath) {
      return reply.code(400).send(err('INVALID_INPUT', 'root and path are required'));
    }

    const dirs = getServeDirs();
    const rootPath = dirs[root];
    if (!rootPath) {
      return reply.code(404).send(err('ROOT_NOT_FOUND', `Unknown root: ${root}`));
    }

    const target = safeResolve(rootPath, relPath);
    if (!target) {
      return reply.code(400).send(err('INVALID_PATH', 'Invalid path'));
    }

    try {
      const stat = await fs.stat(target);
      if (!stat.isFile()) {
        return reply.code(400).send(err('NOT_FILE', 'Path is not a file'));
      }

      const ext = path.extname(target).toLowerCase().replace('.', '');
      const mime = getMime(ext);
      const data = await fs.readFile(target);

      reply.header('Content-Type', mime);
      reply.header('Content-Length', data.length);
      reply.header('Content-Disposition', `inline; filename="${path.basename(target)}"`);
      return reply.send(data);
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        return reply.code(404).send(err('NOT_FOUND', 'File not found'));
      }
      return reply.code(500).send(err('FS_ERROR', e.message ?? 'Failed to read file'));
    }
  });

  // POST /api/v1/files/upload — multipart file upload
  fastify.post('/upload', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    let data: any;
    try {
      data = await request.file();
    } catch {
      return reply.code(400).send(err('INVALID_INPUT', 'Multipart file expected'));
    }

    if (!data) {
      return reply.code(400).send(err('NO_FILE', 'No file uploaded'));
    }

    const root = (data.fields.root as any)?.value || 'documents';
    const relPath = (data.fields.path as any)?.value || '';

    const dirs = getServeDirs();
    const rootPath = dirs[root];
    if (!rootPath) {
      return reply.code(404).send(err('ROOT_NOT_FOUND', `Unknown root: ${root}`));
    }

    const targetDir = safeResolve(rootPath, relPath);
    if (!targetDir) {
      return reply.code(400).send(err('INVALID_PATH', 'Invalid path'));
    }

    try {
      const stat = await fs.stat(targetDir);
      if (!stat.isDirectory()) {
        return reply.code(400).send(err('NOT_DIRECTORY', 'Target is not a directory'));
      }
      if (stat.uid !== process.getuid!()) {
        return reply.code(403).send(err('READ_ONLY', 'Directory is read-only'));
      }
    } catch {
      return reply.code(404).send(err('NOT_FOUND', 'Target directory not found'));
    }

    const filename = safeName(data.filename);
    if (!filename) {
      return reply.code(400).send(err('INVALID_NAME', 'Invalid filename'));
    }

    const destPath = path.join(targetDir, filename);

    try {
      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // Enforce 10MB limit
      if (buffer.length > 10 * 1024 * 1024) {
        return reply.code(413).send(err('FILE_TOO_LARGE', 'File exceeds 10MB limit'));
      }

      await fs.writeFile(destPath, buffer);
      return reply.send(ok({ uploaded: true, filename, size: buffer.length }));
    } catch (e: any) {
      return reply.code(500).send(err('UPLOAD_ERROR', e.message ?? 'Failed to save file'));
    }
  });

  // POST /api/v1/files/mkdir — create directory
  fastify.post('/mkdir', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const parsed = mkdirSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    const { root, path: relPath, name } = parsed.data;
    const dirs = getServeDirs();
    const rootPath = dirs[root];
    if (!rootPath) {
      return reply.code(404).send(err('ROOT_NOT_FOUND', `Unknown root: ${root}`));
    }

    const parentDir = safeResolve(rootPath, relPath);
    if (!parentDir) {
      return reply.code(400).send(err('INVALID_PATH', 'Invalid path'));
    }

    try {
      const stat = await fs.stat(parentDir);
      if (!stat.isDirectory()) {
        return reply.code(400).send(err('NOT_DIRECTORY', 'Parent is not a directory'));
      }
      if (stat.uid !== process.getuid!()) {
        return reply.code(403).send(err('READ_ONLY', 'Directory is read-only'));
      }
    } catch {
      return reply.code(404).send(err('NOT_FOUND', 'Parent directory not found'));
    }

    const dirName = safeName(name);
    if (!dirName) {
      return reply.code(400).send(err('INVALID_NAME', 'Invalid directory name'));
    }

    const destPath = path.join(parentDir, dirName);

    try {
      await fs.access(destPath);
      return reply.code(409).send(err('ALREADY_EXISTS', 'Directory already exists'));
    } catch {
      // Good — doesn't exist
    }

    try {
      await fs.mkdir(destPath);
      return reply.send(ok({ created: true, name: dirName }));
    } catch (e: any) {
      return reply.code(500).send(err('FS_ERROR', e.message ?? 'Failed to create directory'));
    }
  });

  // POST /api/v1/files/delete — delete file or directory
  fastify.post('/delete', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const parsed = deleteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    const { root, path: relPath, name } = parsed.data;
    const dirs = getServeDirs();
    const rootPath = dirs[root];
    if (!rootPath) {
      return reply.code(404).send(err('ROOT_NOT_FOUND', `Unknown root: ${root}`));
    }

    const rel = [relPath, name].filter(Boolean).join('/');
    const target = safeResolve(rootPath, rel);
    if (!target) {
      return reply.code(400).send(err('INVALID_PATH', 'Invalid path'));
    }

    try {
      await fs.access(target);
    } catch {
      return reply.code(404).send(err('NOT_FOUND', 'File or directory not found'));
    }

    if (!(await isWritable(target))) {
      return reply.code(403).send(err('READ_ONLY', 'Target is read-only'));
    }

    try {
      const stat = await fs.stat(target);
      if (stat.isDirectory()) {
        await fs.rm(target, { recursive: true, force: true });
      } else {
        await fs.unlink(target);
      }
      return reply.send(ok({ deleted: true }));
    } catch (e: any) {
      return reply.code(500).send(err('FS_ERROR', e.message ?? 'Failed to delete'));
    }
  });

  // POST /api/v1/files/rename — rename file or directory
  fastify.post('/rename', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const parsed = renameSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    const { root, path: relPath, name, newName } = parsed.data;
    const dirs = getServeDirs();
    const rootPath = dirs[root];
    if (!rootPath) {
      return reply.code(404).send(err('ROOT_NOT_FOUND', `Unknown root: ${root}`));
    }

    const rel = [relPath, name].filter(Boolean).join('/');
    const target = safeResolve(rootPath, rel);
    if (!target) {
      return reply.code(400).send(err('INVALID_PATH', 'Invalid path'));
    }

    try {
      await fs.access(target);
    } catch {
      return reply.code(404).send(err('NOT_FOUND', 'File or directory not found'));
    }

    if (!(await isWritable(target))) {
      return reply.code(403).send(err('READ_ONLY', 'Target is read-only'));
    }

    const sanitized = safeName(newName);
    if (!sanitized) {
      return reply.code(400).send(err('INVALID_NAME', 'Invalid new name'));
    }

    const dest = path.join(path.dirname(target), sanitized);

    try {
      await fs.access(dest);
      return reply.code(409).send(err('ALREADY_EXISTS', 'Name already exists'));
    } catch {
      // Good — doesn't exist
    }

    try {
      await fs.rename(target, dest);
      return reply.send(ok({ renamed: true, newName: sanitized }));
    } catch (e: any) {
      return reply.code(500).send(err('FS_ERROR', e.message ?? 'Failed to rename'));
    }
  });

  // POST /api/v1/files/registry/upload — atomic file upload with DB registration (FILE-02)
  fastify.post('/registry/upload', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    let data: any;
    try {
      data = await request.file();
    } catch {
      return reply.code(400).send(err('INVALID_INPUT', 'Multipart file expected'));
    }

    if (!data) {
      return reply.code(400).send(err('NO_FILE', 'No file uploaded'));
    }

    const projectId = (data.fields.project_id as any)?.value as string | undefined;
    const contactId = (data.fields.contact_id as any)?.value as string | undefined;
    const conversationId = (data.fields.conversation_id as any)?.value as string | undefined;

    // At least one association target required
    if (!projectId && !contactId && !conversationId) {
      return reply.code(400).send(err('INVALID_INPUT', 'At least one of project_id, contact_id, conversation_id required'));
    }

    // Validate association targets exist before writing to disk
    if (projectId) {
      const proj = (await pool.query('SELECT id FROM projects WHERE id = $1', [projectId])).rows[0];
      if (!proj) {
        return reply.code(404).send(err('PROJECT_NOT_FOUND', 'Project not found'));
      }
    }
    if (contactId) {
      const contact = (await pool.query('SELECT id FROM contacts WHERE id = $1', [contactId])).rows[0];
      if (!contact) {
        return reply.code(404).send(err('CONTACT_NOT_FOUND', 'Contact not found'));
      }
    }
    if (conversationId) {
      const conv = (await pool.query('SELECT id FROM conversations WHERE id = $1', [conversationId])).rows[0];
      if (!conv) {
        return reply.code(404).send(err('CONVERSATION_NOT_FOUND', 'Conversation not found'));
      }
    }

    // Read file into buffer
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Enforce 10MB limit
    if (buffer.length > 10 * 1024 * 1024) {
      return reply.code(413).send(err('FILE_TOO_LARGE', 'File exceeds 10MB limit'));
    }

    const fileId = crypto.randomUUID();
    const uploadedBy = request.sessionUser!.username;
    const filename = safeName(data.filename || 'upload');
    const ext = path.extname(filename).toLowerCase().replace('.', '');
    const mimeType = getMime(ext);

    // Determine upload directory
    const uploadDir = path.join(config.dataDir, 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });

    const diskPath = path.join(uploadDir, `${fileId}_${filename}`);

    // Write file to disk
    await fs.writeFile(diskPath, buffer);

    // Atomically register in DB; rollback disk write on failure
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`
        INSERT INTO files (id, filename, disk_path, mime_type, size_bytes, uploaded_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, EXTRACT(EPOCH FROM NOW()))
      `, [fileId, filename, diskPath, mimeType, buffer.length, uploadedBy]);

      if (projectId) {
        await client.query(`
          INSERT INTO file_projects (file_id, project_id, attached_by) VALUES ($1, $2, $3)
        `, [fileId, projectId, uploadedBy]);
      }
      if (contactId) {
        await client.query(`
          INSERT INTO file_contacts (file_id, contact_id, attached_by) VALUES ($1, $2, $3)
        `, [fileId, contactId, uploadedBy]);
      }
      if (conversationId) {
        await client.query(`
          INSERT INTO file_conversations (file_id, conversation_id, attached_by) VALUES ($1, $2, $3)
        `, [fileId, conversationId, uploadedBy]);
      }

      await client.query('COMMIT');
    } catch (e: unknown) {
      await client.query('ROLLBACK');
      // DB failed — remove orphan file from disk
      await fs.unlink(diskPath).catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    return reply.code(201).send(ok({
      file: {
        id: fileId,
        filename,
        disk_path: diskPath,
        mime_type: mimeType,
        size_bytes: buffer.length,
      },
    }));
  });

  // GET /api/v1/files/registry — query file registry with filters (FILE-01, FILE-03)
  fastify.get('/registry', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const query = request.query as {
      project_id?: string;
      contact_id?: string;
      conversation_id?: string;
      mime_type?: string;
      after?: string;
      before?: string;
      limit?: string;
      offset?: string;
    };

    const limit = Math.min(parseInt(query.limit ?? '50', 10) || 50, 200);
    const offset = parseInt(query.offset ?? '0', 10) || 0;

    const joins: string[] = [];
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (query.project_id) {
      joins.push('JOIN file_projects fp ON fp.file_id = f.id');
      conditions.push(`fp.project_id = $${paramIdx}`);
      params.push(query.project_id);
      paramIdx++;
    }
    if (query.contact_id) {
      joins.push('JOIN file_contacts fc ON fc.file_id = f.id');
      conditions.push(`fc.contact_id = $${paramIdx}`);
      params.push(query.contact_id);
      paramIdx++;
    }
    if (query.conversation_id) {
      joins.push('JOIN file_conversations fconv ON fconv.file_id = f.id');
      conditions.push(`fconv.conversation_id = $${paramIdx}`);
      params.push(query.conversation_id);
      paramIdx++;
    }
    if (query.mime_type) {
      conditions.push(`f.mime_type = $${paramIdx}`);
      params.push(query.mime_type);
      paramIdx++;
    }
    if (query.after) {
      conditions.push(`f.created_at >= $${paramIdx}`);
      params.push(parseFloat(query.after));
      paramIdx++;
    }
    if (query.before) {
      conditions.push(`f.created_at <= $${paramIdx}`);
      params.push(parseFloat(query.before));
      paramIdx++;
    }

    const joinClause = joins.join(' ');
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = ((await pool.query(
      `SELECT COUNT(*) as count FROM files f ${joinClause} ${whereClause}`, params
    )).rows[0] as { count: number }).count;

    const files = (await pool.query(
      `SELECT f.* FROM files f ${joinClause} ${whereClause} ORDER BY f.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    )).rows;

    return reply.send(ok({ files, total }));
  });

  // GET /api/v1/files/registry/:id — get single file metadata with associations
  fastify.get<{ Params: { id: string } }>('/registry/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;

    const fileRow = (await pool.query('SELECT * FROM files WHERE id = $1', [id])).rows[0] as any;
    if (!fileRow) {
      return reply.code(404).send(err('FILE_NOT_FOUND', 'File not found'));
    }

    const projectIds = ((await pool.query(
      'SELECT project_id FROM file_projects WHERE file_id = $1', [id]
    )).rows as Array<{ project_id: string }>).map(r => r.project_id);

    const contactIds = ((await pool.query(
      'SELECT contact_id FROM file_contacts WHERE file_id = $1', [id]
    )).rows as Array<{ contact_id: string }>).map(r => r.contact_id);

    const conversationIds = ((await pool.query(
      'SELECT conversation_id FROM file_conversations WHERE file_id = $1', [id]
    )).rows as Array<{ conversation_id: string }>).map(r => r.conversation_id);

    return reply.send(ok({
      file: {
        ...fileRow,
        project_ids: projectIds,
        contact_ids: contactIds,
        conversation_ids: conversationIds,
      },
    }));
  });

  // POST /api/v1/files/registry/:id/associate — add association to existing file (FILE-01)
  fastify.post<{ Params: { id: string } }>('/registry/:id/associate', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;
    const body = request.body as {
      project_id?: string;
      contact_id?: string;
      conversation_id?: string;
    };

    if (!body.project_id && !body.contact_id && !body.conversation_id) {
      return reply.code(400).send(err('INVALID_INPUT', 'At least one of project_id, contact_id, conversation_id required'));
    }

    const fileRow = (await pool.query('SELECT id FROM files WHERE id = $1', [id])).rows[0];
    if (!fileRow) {
      return reply.code(404).send(err('FILE_NOT_FOUND', 'File not found'));
    }

    const attachedBy = request.sessionUser!.username;

    if (body.project_id) {
      const proj = (await pool.query('SELECT id FROM projects WHERE id = $1', [body.project_id])).rows[0];
      if (!proj) {
        return reply.code(404).send(err('PROJECT_NOT_FOUND', 'Project not found'));
      }
      await pool.query(
        'INSERT INTO file_projects (file_id, project_id, attached_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [id, body.project_id, attachedBy]
      );
    }

    if (body.contact_id) {
      const contact = (await pool.query('SELECT id FROM contacts WHERE id = $1', [body.contact_id])).rows[0];
      if (!contact) {
        return reply.code(404).send(err('CONTACT_NOT_FOUND', 'Contact not found'));
      }
      await pool.query(
        'INSERT INTO file_contacts (file_id, contact_id, attached_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [id, body.contact_id, attachedBy]
      );
    }

    if (body.conversation_id) {
      const conv = (await pool.query('SELECT id FROM conversations WHERE id = $1', [body.conversation_id])).rows[0];
      if (!conv) {
        return reply.code(404).send(err('CONVERSATION_NOT_FOUND', 'Conversation not found'));
      }
      await pool.query(
        'INSERT INTO file_conversations (file_id, conversation_id, attached_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [id, body.conversation_id, attachedBy]
      );
    }

    return reply.send(ok({ associated: true }));
  });

  // DELETE /api/v1/files/registry/:id/associate — remove association (FILE-01)
  // Note: removing the last association does NOT delete the file (orphan preservation)
  fastify.delete<{ Params: { id: string } }>('/registry/:id/associate', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;
    const body = request.body as {
      project_id?: string;
      contact_id?: string;
      conversation_id?: string;
    };

    if (!body.project_id && !body.contact_id && !body.conversation_id) {
      return reply.code(400).send(err('INVALID_INPUT', 'At least one of project_id, contact_id, conversation_id required'));
    }

    const fileRow = (await pool.query('SELECT id FROM files WHERE id = $1', [id])).rows[0];
    if (!fileRow) {
      return reply.code(404).send(err('FILE_NOT_FOUND', 'File not found'));
    }

    if (body.project_id) {
      await pool.query(
        'DELETE FROM file_projects WHERE file_id = $1 AND project_id = $2',
        [id, body.project_id]
      );
    }

    if (body.contact_id) {
      await pool.query(
        'DELETE FROM file_contacts WHERE file_id = $1 AND contact_id = $2',
        [id, body.contact_id]
      );
    }

    if (body.conversation_id) {
      await pool.query(
        'DELETE FROM file_conversations WHERE file_id = $1 AND conversation_id = $2',
        [id, body.conversation_id]
      );
    }

    return reply.send(ok({ disassociated: true }));
  });
}
