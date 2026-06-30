// Extração de texto do PDF no browser (pdfjs). Reconstrói linhas a partir das
// posições (x,y) — mesma lógica validada no harness Node — e devolve as linhas
// pro parser puro (relacao-calculo-parser).
import * as pdfjsLib from "pdfjs-dist";
// Vite serve o worker como asset com ?url.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { ExtractedLine } from "./relacao-calculo-parser";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

async function extractLines(data: Uint8Array): Promise<ExtractedLine[]> {
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const lines: ExtractedLine[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const byY = new Map<number, { x: number; str: string }[]>();
    for (const it of content.items as { str: string; transform: number[] }[]) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4];
      const y = Math.round(it.transform[5]);
      let key = y;
      for (const k of byY.keys()) {
        if (Math.abs(k - y) <= 2) {
          key = k;
          break;
        }
      }
      if (!byY.has(key)) byY.set(key, []);
      byY.get(key)!.push({ x, str: it.str });
    }
    for (const y of [...byY.keys()].sort((a, b) => b - a)) {
      const items = byY.get(y)!.sort((a, b) => a.x - b.x);
      lines.push({
        page: p,
        items,
        text: items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim(),
      });
    }
    page.cleanup();
  }
  return lines;
}

/** Lê um File de PDF e devolve as linhas extraídas. */
export async function extractLinesFromFile(file: File): Promise<ExtractedLine[]> {
  const buf = await file.arrayBuffer();
  return extractLines(new Uint8Array(buf));
}
