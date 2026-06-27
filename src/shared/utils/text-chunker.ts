export interface TextChunk {
  content: string;
  chunkIndex: number;
}

/**
 * Splits input text into overlapping chunks using a sliding window algorithm.
 * Guarantees that words are not split in half by looking for whitespace boundaries.
 *
 * @param text The input text to chunk
 * @param maxChunkSize Maximum character length of each chunk
 * @param overlap Character overlap between consecutive chunks
 */
export const chunkText = (text: string, maxChunkSize = 500, overlap = 100): TextChunk[] => {
  const chunks: TextChunk[] = [];
  const normalizedText = text.replace(/\r\n/g, "\n").trim();
  
  if (normalizedText.length === 0) {
    return [];
  }

  let start = 0;
  let chunkIndex = 0;

  while (start < normalizedText.length) {
    let end = start + maxChunkSize;

    if (end >= normalizedText.length) {
      end = normalizedText.length;
    } else {
      // Find a safe word boundary to split (space, tab, or newline)
      // Limit backtracking to 20% of maxChunkSize to avoid tiny chunks
      const backtrackLimit = Math.max(start, end - Math.floor(maxChunkSize * 0.2));
      let boundaryIndex = -1;

      for (let i = end; i > backtrackLimit; i--) {
        const char = normalizedText[i];
        if (char === " " || char === "\n" || char === "\t") {
          boundaryIndex = i;
          break;
        }
      }

      if (boundaryIndex !== -1) {
        end = boundaryIndex;
      }
    }

    const chunkContent = normalizedText.substring(start, end).trim();
    if (chunkContent.length > 0) {
      chunks.push({
        content: chunkContent,
        chunkIndex
      });
      chunkIndex++;
    }

    const nextStart = end - overlap;
    if (nextStart <= start) {
      start = end; // Prevent infinite loop if no progress made
    } else {
      start = nextStart;
    }
  }

  return chunks;
};
