// /api/items/:id
// GET    -> one item
// PATCH  -> update { filename?, note?, source_url?, tags?: [names] }
// DELETE -> remove the item and its image

import {
  shapeItem, ITEM_SELECT, cleanTag, cleanFilename, json, fail, DROP_ORPHAN_TAGS,
} from '../../../lib/db.js';

async function getItem(env, id) {
  return env.DB.prepare(`${ITEM_SELECT} WHERE i.id = ?`).bind(id).first();
}

export async function onRequestGet({ env, params }) {
  const row = await getItem(env, params.id);
  return row ? json(shapeItem(row)) : fail('Not found', 404);
}

export async function onRequestPatch({ request, env, params }) {
  const id = params.id;
  if (!(await getItem(env, id))) return fail('Not found', 404);

  let body;
  try { body = await request.json(); } catch { return fail('Bad JSON'); }

  const stmts = [];

  if (typeof body.filename === 'string') {
    stmts.push(env.DB.prepare('UPDATE items SET filename = ? WHERE id = ?')
      .bind(cleanFilename(body.filename), id));
  }
  if (typeof body.note === 'string') {
    stmts.push(env.DB.prepare('UPDATE items SET note = ? WHERE id = ?')
      .bind(body.note.slice(0, 5000), id));
  }
  if (typeof body.source_url === 'string') {
    stmts.push(env.DB.prepare('UPDATE items SET source_url = ? WHERE id = ?')
      .bind(body.source_url.trim().slice(0, 2000), id));
  }

  if (Array.isArray(body.tags)) {
    const tags = [...new Set(body.tags.map(cleanTag).filter(Boolean))].slice(0, 60);
    stmts.push(env.DB.prepare('DELETE FROM item_tags WHERE item_id = ?').bind(id));
    for (const name of tags) {
      stmts.push(env.DB.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').bind(name));
      stmts.push(env.DB.prepare(
        `INSERT OR IGNORE INTO item_tags (item_id, tag_id, origin)
         SELECT ?, id, 'manual' FROM tags WHERE name = ?`
      ).bind(id, name));
    }
    stmts.push(env.DB.prepare(DROP_ORPHAN_TAGS));
  }

  if (stmts.length) await env.DB.batch(stmts);
  return json(shapeItem(await getItem(env, id)));
}

export async function onRequestDelete({ env, params }) {
  const row = await getItem(env, params.id);
  if (!row) return fail('Not found', 404);

  await env.BUCKET.delete(row.file_key);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM item_tags WHERE item_id = ?').bind(row.id),
    env.DB.prepare('DELETE FROM items WHERE id = ?').bind(row.id),
    env.DB.prepare(DROP_ORPHAN_TAGS),
  ]);
  return json({ ok: true });
}
