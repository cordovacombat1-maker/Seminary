// Voyage AI embeddings (voyage-3, 1024 dimensions).
export const VOYAGE_MODEL = 'voyage-3';

export async function embed(texts: string[], inputType: 'query' | 'document', apiKey = process.env.VOYAGE_API_KEY): Promise<number[][]> {
  if (!apiKey) throw new Error('VOYAGE_API_KEY is not set');
  const res = await fetch(process.env.VOYAGE_BASE_URL ?? 'https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ input: texts, model: VOYAGE_MODEL, input_type: inputType }),
  });
  if (!res.ok) throw new Error(`Voyage embeddings failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  return body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}
