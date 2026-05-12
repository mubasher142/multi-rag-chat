import * as pdfjsLib from 'pdfjs-dist';

// Configure worker - we'll use a local CDN version for simplicity in this environment
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export interface DocumentChunk {
  text: string;
  pageNumber: number;
  fileName: string;
}

export async function extractTextFromPdf(file: File): Promise<DocumentChunk[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const chunks: DocumentChunk[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: any) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (text) {
      // Split large pages into chunks if needed (e.g. 1000 characters)
      const pageChunks = chunkText(text, 1000, 200);
      pageChunks.forEach(chunkText => {
        chunks.push({
          text: chunkText,
          pageNumber: i,
          fileName: file.name
        });
      });
    }
  }

  return chunks;
}

function chunkText(text: string, size: number, overlap: number): string[] {
  const chunks: string[] = [];
  let i = 0;
  
  if (text.length <= size) return [text];
  
  while (i < text.length) {
    const end = Math.min(i + size, text.length);
    chunks.push(text.slice(i, end));
    i += (size - overlap);
    if (end === text.length) break;
  }
  
  return chunks;
}
