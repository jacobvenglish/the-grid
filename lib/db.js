// Shared helpers for the API functions.

// Turns a database row into the shape the frontend uses.
export function shapeItem(row) {
  return {
    id: row.id,
    filename: row.filename,
    mime: row.mime,
    width: row.width,
    height: row.height,
    source_url: row.source_url || '',
    note: row.note || '',
    created_at: row.created_at,
    url: `/img/${row.file_key}`,
    tags: row.tag_list ? row.tag_list.split(',').sort() : [],
  };
}

// The SELECT used everywhere we return items, so each item comes with its tags.
export const ITEM_SELECT = `
  SELECT i.*,
    (SELECT group_concat(t.name, ',')
       FROM item_tags it JOIN tags t ON t.id = it.tag_id
      WHERE it.item_id = i.id AND it.approved = 1) AS tag_list
  FROM items i`;

// Tags are stored lowercase, trimmed, with no commas.
export function cleanTag(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

// Safe-ish filename: letters, numbers, dot, dash, underscore.
export function cleanFilename(raw) {
  const name = String(raw || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 120);
  return name || 'untitled';
}

export function json(data, status = 200) {
  return Response.json(data, { status });
}

export function fail(message, status = 400) {
  return Response.json({ error: message }, { status });
}

// Removes tags that no item uses anymore.
export const DROP_ORPHAN_TAGS =
  'DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM item_tags)';
