// Opaque keyset cursors: (timestamp, row id), base64url-encoded.

export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify({ t: at.toISOString(), i: id })).toString('base64url');
}

export function decodeCursor(cursor: string): { at: Date; id: string } | null {
  try {
    const v = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { t?: unknown; i?: unknown };
    if (typeof v.t !== 'string' || typeof v.i !== 'string' || !/^\d+$/.test(v.i)) return null;
    const at = new Date(v.t);
    return Number.isNaN(at.getTime()) ? null : { at, id: v.i };
  } catch {
    return null;
  }
}
