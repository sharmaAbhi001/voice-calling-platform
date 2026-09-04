/**
 * Domain rule: how a knowledge document becomes retrievable units.
 *
 * Chunks are kept small and paragraph-aligned. A voice agent reads answers aloud,
 * so a retrieved chunk should be one coherent fact, not three pages of prose.
 */
const MAX_CHUNK_CHARS = 900;
const OVERLAP_CHARS = 120;

/**
 * A paragraph at least this long stands on its own as a chunk. Shorter fragments
 * (a heading, a one-line answer) are glued to the next paragraph so they carry
 * some context into their embedding.
 *
 * This threshold is what keeps an FAQ retrievable. Merging paragraphs up to the
 * size limit would pack four unrelated questions into one chunk, and its embedding
 * would then be the average of four topics - close to none of them. A caller asking
 * about one of those four gets no confident match, and the agent wrongly reports
 * that it has no information.
 */
const MIN_STANDALONE_CHARS = 120;

const splitLongParagraph = (paragraph: string): string[] => {
  const sentences = paragraph.match(/[^.!?]+[.!?]*\s*/g) ?? [paragraph];
  const parts: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > MAX_CHUNK_CHARS && current.length > 0) {
      parts.push(current.trim());
      // Carry a little context forward so a fact split across the seam stays findable.
      current = `${current.slice(-OVERLAP_CHARS)}${sentence}`;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
};

export const chunkDocument = (title: string, content: string): string[] => {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buffer = '';

  const flush = () => {
    if (buffer.trim()) chunks.push(buffer.trim());
    buffer = '';
  };

  for (const paragraph of paragraphs) {
    // Too long to embed usefully: break it on sentence boundaries.
    if (paragraph.length > MAX_CHUNK_CHARS) {
      flush();
      chunks.push(...splitLongParagraph(paragraph));
      continue;
    }

    const pending = buffer ? `${buffer}\n\n${paragraph}` : paragraph;

    // A substantial paragraph is a fact in its own right and ends the chunk.
    // Only fragments below the standalone threshold keep accumulating.
    if (pending.length >= MIN_STANDALONE_CHARS) {
      buffer = pending;
      flush();
    } else {
      buffer = pending;
    }
  }
  flush();

  // Prefixing the title keeps the embedding anchored to its subject, which matters
  // when a chunk says "It costs 499 per user" without repeating the product name.
  return chunks.map((chunk) => `${title}\n\n${chunk}`);
};
