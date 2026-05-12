import { GoogleGenAI } from "@google/genai";

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const MODELS = {
  CHAT: "gemini-3-flash-preview",
  EMBEDDING: "gemini-embedding-2-preview",
};

export async function getEmbedding(text: string): Promise<number[]> {
  const result = await ai.models.embedContent({
    model: MODELS.EMBEDDING,
    contents: [{ parts: [{ text }] }],
  });
  return result.embeddings[0].values;
}

export async function getAnswerWithContext(query: string, context: string, history: { role: 'user' | 'model'; text: string }[]) {
  const systemInstruction = `You are a helpful AI assistant that answers questions based on provided document context.
If the answer is not in the context, say that you don't have enough information from the documents to answer accurately.
Keep your answers concise and well-structured.

CONTEXT:
${context}`;

  const response = await ai.models.generateContent({
    model: MODELS.CHAT,
    contents: [
      ...history.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
      { role: 'user', parts: [{ text: query }] }
    ],
    config: {
      systemInstruction,
    }
  });

  return response.text;
}
