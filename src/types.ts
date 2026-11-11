export interface ExtractedDocument {
  docType: string;
  symbol: string;
  date: string;
  summary: string;
  authority: string;
  startPage: string;
  pageRange?: string;
  index?: number;
  original?: string;
  sourceFileName?: string;
}

export enum ProcessingStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export interface ProcessingResult {
  fileName: string;
  data: ExtractedDocument[];
}

export interface ExcelExportConfig {
  fontName: string;
  fontSize: number;
  wrapText: boolean;
  allBorders: boolean;
}

export interface ThemeConfig {
  id: string;
  name: string;
  primary: string; // Tailwind color name (e.g., 'blue', 'emerald')
  gray: string;    // Tailwind gray scale (e.g., 'slate', 'zinc')
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  fileName: string;
  data: ExtractedDocument[];
}
