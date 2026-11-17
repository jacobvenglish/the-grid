// /api/items
// GET  -> list items, newest first. ?q=words&tag=name to filter.
// POST -> upload one image (form fields: file, width, height, source_url).

import { shapeItem, ITEM_SELECT, cleanFilename, cleanTag, json, fail } from '../../../lib/db.js';

const TAG_MATCH = `EXISTS (SELECT 1 FROM item_tags it JOIN tags t ON t.id = it.tag_id
                   WHERE it.item_id = i.id AND it.approved = 1 AND t.name LIKE ?)`;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').toLowerCase().trim();
  const tag = (url.searchParams.get('tag') || '').toLowerCase().trim();

  let sql = `${ITEM_SELECT} WHERE i.status = 'library'`;
  const binds = [];

  if (tag) {
    sql += ` AND ${TAG_MATCH}`;
    binds.push(tag);
  }

  // Every word has to match somewhere: filename, note, source or a tag.
  for (const word of q.split(/\s+/).filter(Boolean).slice(0, 8)) {
    const like = `%${word}%`;
    sql += ` AND (lower(i.filename) LIKE ? OR lower(i.note) LIKE ?
             OR lower(coalesce(i.source_url, '')) LIKE ? OR ${TAG_MATCH})`;
    binds.push(like, like, like, like);
  }

  sql += ' ORDER BY i.created_at DESC LIMIT 1000';
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json(results.map(shapeItem));
}

const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg',
};

export async function onRequestPost({ request, env }) {
  const form = await request.formData();
  const file = form.get('file');

  if (!file || typeof file === 'string') return fail('No file sent');
  if (!EXT[file.type]) return fail('That file type is not supported yet', 415);
  if (file.size > 50 * 1024 * 1024) return fail('File is over 50 MB', 413);

  const id = crypto.randomUUID();
  const key = `${id}.${EXT[file.type]}`;

  await env.BUCKET.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  const width = parseInt(form.get('width'), 10) || null;
  const height = parseInt(form.get('height'), 10) || null;
  const source = String(form.get('source_url') || '').slice(0, 2000);
  const filename = cleanFilename(file.name);
  const createdAt = new Date().toISOString();

  const note = String(form.get('note') || '').slice(0, 5000);
  // Tags sent with the upload (comma separated), applied to this image.
  const tags = [...new Set(String(form.get('tags') || '').split(',').map(cleanTag).filter(Boolean))].slice(0, 60);

  const stmts = [
    env.DB.prepare(
      `INSERT INTO items (id, file_key, filename, mime, width, height, source_url, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, key, filename, file.type, width, height, source, note, createdAt),
  ];
  for (const name of tags) {
    stmts.push(env.DB.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').bind(name));
    stmts.push(env.DB.prepare(
      `INSERT OR IGNORE INTO item_tags (item_id, tag_id, origin)
       SELECT ?, id, 'manual' FROM tags WHERE name = ?`
    ).bind(id, name));
  }
  await env.DB.batch(stmts);

  const row = await env.DB.prepare(`${ITEM_SELECT} WHERE i.id = ?`).bind(id).first();
  return json(shapeItem(row), 201);
}
