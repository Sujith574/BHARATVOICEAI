import pdfParse from "pdf-parse";

export class DocumentParserService {
  /**
   * Parses the content buffer of a document and extracts plain text.
   *
   * Supports:
   *  - application/pdf -> via pdf-parse
   *  - text/plain, text/csv, application/json, and other text structures -> decoded as UTF-8
   */
  public async parseDocument(buffer: Buffer, mimetype: string): Promise<string> {
    const normalizedMime = mimetype.trim().toLowerCase();

    if (normalizedMime === "application/pdf") {
      try {
        const parseFunc = (pdfParse as unknown) as (buf: Buffer) => Promise<{ text: string }>;
        const data = await parseFunc(buffer);
        return data.text || "";
      } catch (error) {
        throw new Error(`Failed to parse PDF document: ${(error as Error).message}`);
      }
    }

    // Default fallback to UTF-8 string decoding for txt/csv/json/etc.
    return buffer.toString("utf8");
  }
}
