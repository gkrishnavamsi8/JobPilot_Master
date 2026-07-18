export type ResumeFormat = 'pdf' | 'docx' | 'txt' | 'md';

export interface ParsedResume {
  text: string;
  fileName: string;
  format: ResumeFormat;
  characterCount: number;
}

const SUPPORTED_EXTENSIONS: Record<string, ResumeFormat> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.txt': 'txt',
  '.md': 'md',
};

function getExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : '';
}

export function getResumeFormat(fileName: string): ResumeFormat | null {
  return SUPPORTED_EXTENSIONS[getExtension(fileName)] ?? null;
}

export function getSupportedResumeExtensions(): string[] {
  return Object.keys(SUPPORTED_EXTENSIONS);
}

async function readTextFile(file: File): Promise<string> {
  return file.text();
}

async function readPdfFile(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (pageText) {
      pages.push(pageText);
    }
  }

  return pages.join('\n\n');
}

async function readDocxFile(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value.replace(/\s+/g, ' ').trim();
}

function normalizeResumeText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\t/g, ' ').trim();
}

/**
 * Parse a resume file into plain text for skill extraction.
 * Supports PDF, DOCX, TXT, and Markdown.
 */
export async function parseResumeFile(file: File): Promise<ParsedResume> {
  const format = getResumeFormat(file.name);

  if (!format) {
    throw new Error(
      `Unsupported file type. Upload one of: ${getSupportedResumeExtensions().join(', ')}`,
    );
  }

  let rawText = '';

  switch (format) {
    case 'pdf':
      rawText = await readPdfFile(file);
      break;
    case 'docx':
      rawText = await readDocxFile(file);
      break;
    case 'txt':
    case 'md':
      rawText = await readTextFile(file);
      break;
  }

  const text = normalizeResumeText(rawText);

  if (!text) {
    throw new Error(
      'Could not extract readable text from this file. Try a text-based PDF or DOCX export.',
    );
  }

  return {
    text,
    fileName: file.name,
    format,
    characterCount: text.length,
  };
}
