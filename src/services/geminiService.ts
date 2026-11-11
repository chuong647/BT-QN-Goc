import { ExtractedDocument } from '../types';
import { PDFDocument } from 'pdf-lib';

const API_LIMIT_BYTES = 30 * 1024 * 1024; // 30MB
const PAGES_PER_CHUNK = 15;
const IMAGES_PER_CHUNK = 10;

export const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Lỗi khi đọc file."));
  });
};

interface ContentPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

const callExtractApi = async (body: any): Promise<ExtractedDocument[]> => {
  const response = await fetch('/api/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || result.details || 'Không thể bóc tách tài liệu này.');
  }

  const rawData: ExtractedDocument[] = result.data || [];

  // Hậu xử lý từng văn bản
  rawData.forEach(doc => {
    if (doc.startPage && /^\d$/.test(doc.startPage.toString().trim())) {
      doc.startPage = `0${doc.startPage.toString().trim()}`;
    }
    
    if (doc.docType && doc.summary) {
      let summary = doc.summary.trim();
      const docTypeLower = doc.docType.toLowerCase().trim();
      
      if (summary.toLowerCase().startsWith(docTypeLower)) {
        summary = summary.substring(docTypeLower.length).trim();
      }
      
      if (summary.length > 0) {
        // Lowercase first letter unless starting with a proper name (e.g. "Nguyễn Văn A...")
        const words = summary.split(/\s+/);
        const firstWord = words[0] || "";
        const secondWord = words[1] || "";
        const isFirstCap = /^[A-Z\u00C0-\u024F\u1EA0-\u1EF9]/.test(firstWord);
        const isSecondCap = /^[A-Z\u00C0-\u024F\u1EA0-\u1EF9]/.test(secondWord);

        if (!(isFirstCap && isSecondCap)) {
          summary = summary.charAt(0).toLowerCase() + summary.slice(1);
        }
      }
      
      doc.summary = summary;
    }
  });

  return rawData;
};

const filterValidSymbol = (rawSymbol: string | undefined): string => {
  if (!rawSymbol) return "";
  const trimmed = rawSymbol.trim();
  if (!trimmed) return "";

  const hasDigit = /\d/.test(trimmed);
  const hasLetter = /[a-zA-Z\u00C0-\u024F\u1EA0-\u1EF9]/i.test(trimmed);

  // Must contain BOTH text/letters and digits
  if (hasDigit && hasLetter) {
    return trimmed;
  }
  return "";
};

export const formatDisplayDate = (rawDate: string | undefined): string => {
  if (!rawDate) return "";
  let clean = rawDate.trim();
  while (clean.startsWith("'") || clean.startsWith('"')) {
    clean = clean.substring(1).trim();
  }
  while (clean.endsWith("'") || clean.endsWith('"')) {
    clean = clean.substring(0, clean.length - 1).trim();
  }
  if (!clean) return "";

  const parts = clean.split('/');
  if (parts.length === 3) {
    let [day, month, year] = parts;
    day = day.trim();
    month = month.trim();
    year = year.trim();
    const monthNum = parseInt(month, 10);
    if (!isNaN(monthNum)) {
      if (monthNum === 1 || monthNum === 2) {
        month = `0${monthNum}`;
      } else if (monthNum >= 3 && monthNum <= 9) {
        month = `${monthNum}`;
      } else if (monthNum >= 10 && monthNum <= 12) {
        month = `${monthNum}`;
      }
      clean = `${day}/${month}/${year}`;
    }
  }
  return `'${clean}`;
};

export const formatDisplayPageRange = (rawPageRange: string | undefined, rawStartPage?: string | undefined): string => {
  let val = (rawPageRange || rawStartPage || "").trim();
  if (!val) return "";

  while (val.startsWith("'") || val.startsWith('"')) {
    val = val.substring(1).trim();
  }
  while (val.endsWith("'") || val.endsWith('"')) {
    val = val.substring(0, val.length - 1).trim();
  }
  if (!val) return "";

  if (/^\d+$/.test(val)) {
    const num = parseInt(val, 10);
    val = num < 10 ? `0${num}` : `${num}`;
  } else if (/^(\d+)\s*[-–—]\s*(\d+)$/.test(val)) {
    const match = val.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = parseInt(match[2], 10);
      const startStr = start < 10 ? `0${start}` : `${start}`;
      const endStr = end < 10 ? `0${end}` : `${end}`;
      val = `${startStr}-${endStr}`;
    }
  }

  return `'${val}`;
};

const formatAndCalculateRanges = (allResults: ExtractedDocument[]): ExtractedDocument[] => {
  return allResults.map((doc, index, array) => {
    const nextDoc = array[index + 1];
    let startPage = doc.startPage ? doc.startPage.trim() : '';
    while (startPage.startsWith("'") || startPage.startsWith('"')) {
      startPage = startPage.substring(1).trim();
    }
    if (/^\d$/.test(startPage)) startPage = `0${startPage}`;

    let endPage: number | null = null;
    if (nextDoc && nextDoc.startPage) {
      let nextStart = nextDoc.startPage.trim();
      while (nextStart.startsWith("'") || nextStart.startsWith('"')) {
        nextStart = nextStart.substring(1).trim();
      }
      if (!isNaN(Number(nextStart))) {
        endPage = Number(nextStart) - 1;
      }
    }

    let calculatedRange = '';
    if (startPage && endPage !== null && !isNaN(endPage) && endPage > Number(startPage)) {
      const endPageStr = endPage < 10 ? `0${endPage}` : `${endPage}`;
      calculatedRange = `'${startPage}-${endPageStr}`;
    }

    const finalPageRange = calculatedRange || formatDisplayPageRange(doc.pageRange, startPage);
    const finalDate = formatDisplayDate(doc.date);

    return {
      ...doc,
      symbol: filterValidSymbol(doc.symbol),
      date: finalDate,
      pageRange: finalPageRange,
      startPage: startPage ? `'${startPage}` : ''
    };
  });
};

export const extractDataFromFiles = async (
  files: File[],
  onProgress?: (currentFileIndex: number, totalFiles: number, currentFileName: string) => void
): Promise<ExtractedDocument[]> => {
  const allResults: ExtractedDocument[] = [];
  const totalFiles = files.length;

  // Xử lý từng tệp theo đúng thứ tự mà người dùng đã gắn / sắp xếp
  for (let fileIdx = 0; fileIdx < totalFiles; fileIdx++) {
    const currentFile = files[fileIdx];
    
    if (onProgress) {
      onProgress(fileIdx + 1, totalFiles, currentFile.name);
    }

    const isPdf = currentFile.type === 'application/pdf' || currentFile.name.toLowerCase().endsWith('.pdf');
    const isImage = currentFile.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|tiff)$/i.test(currentFile.name);

    if (isPdf) {
      const arrayBuffer = await currentFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const totalPdfPages = pdfDoc.getPageCount();
      const fileRawDocs: ExtractedDocument[] = [];

      if (currentFile.size <= API_LIMIT_BYTES && totalPdfPages <= PAGES_PER_CHUNK) {
        const base64Data = await fileToBase64(currentFile);
        const pdfResults = await callExtractApi({
          fileBase64: base64Data,
          fileType: "application/pdf",
          fileName: currentFile.name,
        });
        fileRawDocs.push(...pdfResults);
      } else {
        // Tệp PDF nhiều trang: chia nhỏ theo từng chunk 15 trang
        for (let i = 0; i < totalPdfPages; i += PAGES_PER_CHUNK) {
          const newDoc = await PDFDocument.create();
          const end = Math.min(i + PAGES_PER_CHUNK, totalPdfPages);
          const pagesToCopy = Array.from({ length: end - i }, (_, k) => i + k);
          const copiedPages = await newDoc.copyPages(pdfDoc, pagesToCopy);
          copiedPages.forEach(page => newDoc.addPage(page));
          const pdfBytes = await newDoc.save();
          const base64Chunk = uint8ArrayToBase64(pdfBytes);
          const chunkResults = await callExtractApi({
            fileBase64: base64Chunk,
            fileType: "application/pdf",
            fileName: `${currentFile.name}-chunk-${Math.floor(i / PAGES_PER_CHUNK) + 1}`,
          });
          fileRawDocs.push(...chunkResults);
        }
      }

      // Tính toán khoảng trang nội bộ riêng cho từng file để không bị ảnh hưởng chéo giữa các file
      const formattedFileDocs = formatAndCalculateRanges(fileRawDocs).map((doc, docIdx) => ({
        ...doc,
        sourceFileName: currentFile.name,
        index: allResults.length + docIdx + 1,
      }));

      allResults.push(...formattedFileDocs);

    } else if (isImage) {
      // Xử lý tệp hình ảnh đơn lẻ
      const base64 = await fileToBase64(currentFile);
      const mimeType = currentFile.type || 'image/jpeg';
      const imgResults = await callExtractApi({
        parts: [{ inlineData: { mimeType, data: base64 } }],
        fileName: currentFile.name,
      });

      const formattedImgDocs = formatAndCalculateRanges(imgResults).map((doc, docIdx) => ({
        ...doc,
        sourceFileName: currentFile.name,
        index: allResults.length + docIdx + 1,
      }));

      allResults.push(...formattedImgDocs);
    }
  }

  return allResults;
};

export const extractDataFromPdf = async (file: File): Promise<ExtractedDocument[]> => {
  return extractDataFromFiles([file]);
};

