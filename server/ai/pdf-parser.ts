import zlib from "zlib";

let pdfParseFn: any = null;
let pdfParseAttempted = false;

async function getPdfParse() {
  if (pdfParseAttempted) return pdfParseFn;
  pdfParseAttempted = true;
  try {
    const mod = await import("pdf-parse");
    let fn = (mod as any).default || mod;
    if (typeof fn !== "function" && fn && typeof (fn as any).pdfParse === "function") {
      fn = (fn as any).pdfParse;
    }
    if (typeof fn === "function") {
      pdfParseFn = fn;
    }
  } catch {
    pdfParseFn = null;
  }
  return pdfParseFn;
}

/**
 * Robustly extracts readable plain text from a PDF Buffer or base64 string.
 * Uses pdfParse when available, and seamlessly falls back to our high-efficiency
 * native Flate stream & Tj/TJ text block extractor.
 */
export async function extractTextFromPdf(pdfBase64OrBuffer: string | Buffer): Promise<string> {
  try {
    let buffer: Buffer;
    if (typeof pdfBase64OrBuffer === "string") {
      let rawBase64 = pdfBase64OrBuffer;
      if (rawBase64.includes(",")) {
        rawBase64 = rawBase64.split(",")[1];
      }
      buffer = Buffer.from(rawBase64, "base64");
    } else {
      buffer = pdfBase64OrBuffer;
    }

    if (!buffer || buffer.length === 0) {
      return "";
    }

    // 1. Try pdf-parse if loaded
    const parser = await getPdfParse();
    if (parser && typeof parser === "function") {
      try {
        const data = await parser(buffer, { max: 15 });
        if (data && typeof data.text === "string" && data.text.trim().length > 0) {
          return cleanPdfText(data.text);
        }
      } catch (parseErr) {
        console.warn("[PDF Parser] pdf-parse call failed, switching to native stream extractor:", parseErr);
      }
    }

    // 2. High-performance native stream extractor
    const streamFallbackText = extractFromPdfStreamBinary(buffer);
    if (streamFallbackText.trim()) {
      return cleanPdfText(streamFallbackText);
    }

    return "";
  } catch (err) {
    console.warn("[PDF Parser] Failed to extract text from PDF:", err);
    return "";
  }
}

/**
 * Cleans extracted PDF text to remove noise, binary artifacts, and redundant whitespace.
 */
export function cleanPdfText(rawText: string, maxLength: number = 8000): string {
  if (!rawText) return "";

  let cleaned = rawText
    // Remove binary control characters except \n, \r, \t
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, " ")
    // Normalize Windows/Mac line endings
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Replace tabs with single spaces
    .replace(/\t+/g, " ")
    // Collapse multiple horizontal spaces
    .replace(/[ ]{2,}/g, " ")
    // Remove blank lines with whitespace only
    .replace(/^[ ]+$/gm, "")
    // Collapse 3+ consecutive newlines to 2
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength) + "\n\n[... content truncated to stay within token limits ...]";
  }

  return cleaned;
}

/**
 * Fallback stream parser that unzips Flate streams and pulls Tj/TJ text tokens.
 */
function extractFromPdfStreamBinary(buffer: Buffer): string {
  try {
    const textChunks: string[] = [];
    const binaryString = buffer.toString("binary");

    // Scan for compressed streams (FlateDecode)
    const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
    let match: RegExpExecArray | null;

    while ((match = streamRegex.exec(binaryString)) !== null) {
      const streamContent = match[1];
      try {
        const streamBuffer = Buffer.from(streamContent, "binary");
        let decompressed: Buffer | null = null;

        try {
          decompressed = zlib.inflateSync(streamBuffer);
        } catch {
          try {
            decompressed = zlib.inflateRawSync(streamBuffer);
          } catch {
            // Not flate
          }
        }

        if (decompressed) {
          const streamText = decompressed.toString("utf-8");
          const extracted = parsePdfStreamText(streamText);
          if (extracted.trim()) {
            textChunks.push(extracted);
          }
        }
      } catch {}
    }

    // Scan for uncompressed text blocks in the binary
    const uncompressed = parsePdfStreamText(binaryString);
    if (uncompressed.trim()) {
      textChunks.push(uncompressed);
    }

    return textChunks.join("\n").trim();
  } catch {
    return "";
  }
}

/**
 * Extracts text from PDF content stream syntax (Tj, TJ, ', ")
 */
function parsePdfStreamText(stream: string): string {
  const lines: string[] = [];

  // Match Tj: (Text) Tj
  const tjRegex = /\(([^)]*)\)\s*Tj/g;
  let match: RegExpExecArray | null;
  while ((match = tjRegex.exec(stream)) !== null) {
    if (match[1]) {
      lines.push(unescapePdfString(match[1]));
    }
  }

  // Match TJ array: [(T) 10 (e) 20 (xt)] TJ
  const tjArrayRegex = /\[([\s\S]*?)\]\s*TJ/g;
  while ((match = tjArrayRegex.exec(stream)) !== null) {
    const arrayContent = match[1];
    const subTjRegex = /\(([^)]*)\)/g;
    let subMatch: RegExpExecArray | null;
    let combined = "";
    while ((subMatch = subTjRegex.exec(arrayContent)) !== null) {
      combined += unescapePdfString(subMatch[1]);
    }
    if (combined.trim()) {
      lines.push(combined);
    }
  }

  // Match ' and ": (Text) '
  const quoteRegex = /\(([^)]*)\)\s*['"]/g;
  while ((match = quoteRegex.exec(stream)) !== null) {
    if (match[1]) {
      lines.push(unescapePdfString(match[1]));
    }
  }

  return lines.join(" ");
}

function unescapePdfString(str: string): string {
  return str
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}
