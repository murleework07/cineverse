/**
 * Opaque cursor helpers for keyset pagination (stable under concurrent inserts,
 * O(log n) per page instead of OFFSET scans).
 */
function encodeCursor(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

module.exports = { encodeCursor, decodeCursor };
