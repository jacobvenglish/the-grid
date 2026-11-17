// /api/tags -> every tag with how many items use it, most used first.

import { json } from '../../lib/db.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT t.name, COUNT(*) AS count
       FROM tags t JOIN item_tags it ON it.tag_id = t.id
       JOIN items i ON i.id = it.item_id AND i.status = 'library'
      WHERE it.approved = 1
      GROUP BY t.id
      ORDER BY count DESC, t.name ASC`
  ).all();
  const total = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM items WHERE status = 'library'"
  ).first();
  return json({ total: total.n, tags: results });
}
