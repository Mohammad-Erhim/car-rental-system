/** Masking for personal contact details shown to staff (SRS-SEC-016): enough to recognise a person, not to use the detail. */

export function maskEmail(e: string | null): string | null {
  if (!e || !e.includes('@')) return e;
  const [u = '', d = ''] = e.split('@');
  return `${u.slice(0, 2)}***@${d}`;
}

export function maskPhone(p: string | null): string | null {
  if (!p) return p;
  return p.length <= 4 ? '***' : `***${p.slice(-3)}`;
}
