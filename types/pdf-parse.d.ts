// pdf-parse ships no types for its internal entrypoint. We import the lib directly to skip the
// package's index.js debug harness (which reads a sample file on require).
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info: unknown;
    metadata: unknown;
    version: string;
  }
  function pdfParse(dataBuffer: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}
