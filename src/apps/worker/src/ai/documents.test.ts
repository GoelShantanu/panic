import { describe, expect, it } from 'vitest';
import { HttpDocumentFetcher, pdfText } from './documents.ts';

// A minimal one-page PDF with a text layer, built byte-exact so the xref offsets are right.
export function tinyPdf(lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const stream = `BT /F1 12 Tf 72 720 Td 14 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

const respond = (body: Uint8Array | string, type: string, status = 200) => async () =>
  new Response(typeof body === 'string' ? body : Buffer.from(body), { status, headers: { 'content-type': type } });

describe('filing attachment text', () => {
  it('extracts the text layer of a PDF', async () => {
    const r = await pdfText(tinyPdf(['Revenue from operations was Rs 1,250.50 crore.', 'The board recommended a dividend of Rs 4 per share.']));
    expect(r.pages).toBe(1);
    expect(r.text).toContain('Revenue from operations was Rs 1,250.50 crore.');
    expect(r.text).toContain('dividend of Rs 4 per share');
  });

  it('fetches PDF, HTML and plain text; refuses other types and errors', async () => {
    const pdf = await new HttpDocumentFetcher(respond(tinyPdf(['Board outcome.']), 'application/octet-stream')).fetchText('https://x.example/a');
    expect(pdf).toMatchObject({ ok: true, kind: 'pdf', pages: 1 });
    const html = await new HttpDocumentFetcher(respond('<html><body><p>Outcome &amp; dividend</p><script>x()</script></body></html>', 'text/html')).fetchText('https://x.example/b');
    expect(html).toEqual({ ok: true, kind: 'html', text: 'Outcome & dividend', pages: null });
    expect(await new HttpDocumentFetcher(respond('plain', 'text/plain')).fetchText('https://x.example/c')).toMatchObject({ ok: true, kind: 'text' });
    expect(await new HttpDocumentFetcher(respond('x', 'image/png')).fetchText('https://x.example/d')).toMatchObject({ ok: false });
    expect(await new HttpDocumentFetcher(respond('x', 'text/plain', 404)).fetchText('https://x.example/e')).toEqual({ ok: false, error: 'HTTP 404' });
  });
});
