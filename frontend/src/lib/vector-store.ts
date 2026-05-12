export interface VectorRecord {
  vector: number[];
  metadata: {
    text: string;
    pageNumber: number;
    fileName: string;
  };
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let mA = 0;
  let mB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    mA += vecA[i] * vecA[i];
    mB += vecB[i] * vecB[i];
  }
  mA = Math.sqrt(mA);
  mB = Math.sqrt(mB);
  return dotProduct / (mA * mB);
}

export class VectorStore {
  public records: VectorRecord[] = [];

  addRecord(record: VectorRecord) {
    this.records.push(record);
  }

  search(queryVector: number[], topK: number = 3): VectorRecord[] {
    const scored = this.records.map(record => ({
      record,
      score: cosineSimilarity(queryVector, record.vector)
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map(s => s.record);
  }

  clear() {
    this.records = [];
  }

  get count() {
    return this.records.length;
  }
}

export const vectorStore = new VectorStore();
