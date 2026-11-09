// atelier/core/observers/totals.ts — A TOTAL THE TABLE'S OWN ROWS DO NOT ADD UP TO.
//
// A piece that tabulates (a price comparison, a budget, a score sheet) states a total row, and a writer that rewrote one
// row and not the total leaves a table that contradicts itself: the reader who adds it up stops trusting the rest.
// This is arithmetic on the piece's own figures, for every kind of work: no class, no wording. In each markdown table,
// a row whose first cell is labelled as a total ("Total", "Sum", "Overall") is checked, column by column, against the
// sum of the rows above it (back to the header or the previous total), where every one of those cells holds a figure.
// A subtotal is checked against the rows since the last one, and stands for them in the total below it.
// A mismatch at the total's own precision is LISTED beside the piece for the person to check, never changed, never
// blocking: a weighted total, or one that counts rows the table leaves out, is not wrong, and only the person knows.

/** One total the rows above it do not add up to. */
export interface TotalOff { readonly table: number; readonly column: string; readonly stated: string; readonly sum: number }

const TOTAL_LABEL = /^\W*(?:grand\s+)?(?:total|sum|overall)\b/i;
const SUBTOTAL_LABEL = /^\W*sub-?\s*total\b/i;

/** The figure a cell holds ("$1,200", "12.5%", "−3"), or null where it holds anything else. */
export function figureOf(cell: string): { value: number; decimals: number } | null {
  const t = cell.replace(/[*_`]/g, '').replace(/[−–]/g, '-').trim();
  const m = /^(-)?\s*[$€£¥]?\s*(-)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*%?$/.exec(t);
  if (!m) return null;
  const value = Number(`${m[1] || m[2] ? '-' : ''}${m[3].replace(/,/g, '')}${m[4] ? `.${m[4]}` : ''}`);
  return Number.isFinite(value) ? { value, decimals: m[4]?.length ?? 0 } : null;
}

const cellsOf = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const isRule = (line: string): boolean => line.includes('-') && /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/.test(line);

/** Every total row in the text's tables that its rows do not add up to, column by column. */
export function totalsOff(text: string): TotalOff[] {
  const out: TotalOff[] = [];
  const lines = text.split(/\r?\n/);
  let table = 0;
  for (let i = 0; i < lines.length; i++) {
    // a table: a header row, its rule line, then the rows
    if (!lines[i].includes('|') || !isRule(lines[i + 1] ?? '')) continue;
    table++;
    const header = cellsOf(lines[i]);
    let rows: string[][] = []; let subtotals: string[][] = [];
    let j = i + 2;
    for (; j < lines.length && lines[j].includes('|') && lines[j].trim(); j++) {
      const row = cellsOf(lines[j]);
      const sub = SUBTOTAL_LABEL.test(row[0] ?? '');
      if (!sub && !TOTAL_LABEL.test(row[0] ?? '')) { rows.push(row); continue; }
      for (let col = 1; col < Math.min(row.length, header.length); col++) {
        const stated = figureOf(row[col] ?? '');
        const parts = (sub ? rows : [...subtotals, ...rows]).map((r) => figureOf(r[col] ?? ''));
        if (!stated || parts.length < 2 || parts.some((p) => p === null)) continue;
        const sum = parts.reduce((a, p) => a + (p?.value ?? 0), 0);
        if (Number(sum.toFixed(stated.decimals)) !== stated.value) out.push({ table, column: header[col] || `column ${col + 1}`, stated: (row[col] ?? '').replace(/[*_`]/g, '').trim(), sum: Number(sum.toFixed(Math.max(stated.decimals, ...parts.map((p) => p?.decimals ?? 0)))) });
      }
      // a total closes a block; a subtotal is checked too, and stands for its block in the total below it
      rows = [];
      subtotals = sub ? [...subtotals, row] : [];
    }
    i = j - 1;
  }
  return out;
}

/** The line said beside the piece. */
export const totalsLine = (off: readonly TotalOff[]): string =>
  `Arithmetic to check (${off.length}): ${off.map((o) => `table ${o.table}, ${o.column}: the total says ${o.stated}, the rows above it add up to ${o.sum}`).join('; ')}. Listed, never changed: a weighted total is not wrong.`;
