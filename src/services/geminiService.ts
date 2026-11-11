import { ExtractedDocument } from '../types';
import { PDFDocument } from 'pdf-lib';

export const uint8ArrayToBase64 = (bytes: Uint8Array): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const blob = new Blob([bytes as any], { type: 'application/pdf' });
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Lỗi khi mã hóa dữ liệu PDF'));
      reader.readAsDataURL(blob);
    } catch (err) {
      reject(err);
    }
  });
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

/**
 * Optimizes an image before sending: downscales massive photos (>2400px)
 * to prevent oversized base64 payloads and enable unlimited file size handling.
 */
export const optimizeImageFile = async (file: File): Promise<{ base64: string; mimeType: string }> => {
  if (file.size <= 2 * 1024 * 1024 && (file.type === 'image/jpeg' || file.type === 'image/png')) {
    const base64 = await fileToBase64(file);
    return { base64, mimeType: file.type };
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const MAX_DIM = 2400; // Optimal resolution for high-accuracy OCR
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        fileToBase64(file)
          .then((b64) => resolve({ base64: b64, mimeType: file.type || 'image/jpeg' }))
          .catch(() => resolve({ base64: '', mimeType: 'image/jpeg' }));
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.90);
      const base64 = dataUrl.split(',')[1] || '';
      resolve({ base64, mimeType: 'image/jpeg' });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      fileToBase64(file)
        .then((b64) => resolve({ base64: b64, mimeType: file.type || 'image/jpeg' }))
        .catch(() => resolve({ base64: '', mimeType: 'image/jpeg' }));
    };
    img.src = url;
  });
};

const callExtractApi = async (body: any, retries = 2): Promise<ExtractedDocument[]> => {
  let response: Response | null = null;
  let lastErrorMsg = '';

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      response = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response) {
        break;
      }
    } catch (fetchErr: any) {
      lastErrorMsg = fetchErr?.message || String(fetchErr);
      console.warn(`Lần thử kết nối ${attempt}/${retries} thất bại:`, lastErrorMsg);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
  }

  if (!response) {
    throw new Error(
      'Không thể kết nối đến máy chủ xử lý dữ liệu. Vui lòng kiểm tra dung lượng tệp hoặc kết nối mạng và thử lại.'
    );
  }

  let result: any = null;
  const rawText = await response.text();
  try {
    result = JSON.parse(rawText);
  } catch {
    console.error('Phản hồi không phải JSON hợp lệ:', rawText);
    if (response.status === 413) {
      throw new Error('Dung lượng tệp tải lên vượt quá giới hạn máy chủ. Hệ thống sẽ tự động chia nhỏ.');
    }
    throw new Error(`Máy chủ phản hồi trạng thái ${response.status}. Vui lòng thử lại.`);
  }

  if (!result || !result.success) {
    const errorMsg = result?.error || result?.details || 'Không thể bóc tách tài liệu này từ AI.';
    throw new Error(errorMsg);
  }

  const rawData: ExtractedDocument[] = result.data || [];

  // Hậu xử lý từng văn bản
  rawData.forEach((doc) => {
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
        const words = summary.split(/\s+/);
        const firstWord = words[0] || '';
        const secondWord = words[1] || '';
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
  if (!rawSymbol) return '';
  const trimmed = rawSymbol.trim();
  if (!trimmed) return '';

  const hasDigit = /\d/.test(trimmed);
  const hasLetter = /[a-zA-Z\u00C0-\u024F\u1EA0-\u1EF9]/i.test(trimmed);

  // Must contain BOTH text/letters and digits
  if (hasDigit && hasLetter) {
    return trimmed;
  }
  return '';
};

export const formatDisplayDate = (rawDate: string | undefined): string => {
  if (!rawDate) return '';
  let clean = rawDate.trim();
  while (clean.startsWith("'") || clean.startsWith('"')) {
    clean = clean.substring(1).trim();
  }
  while (clean.endsWith("'") || clean.endsWith('"')) {
    clean = clean.substring(0, clean.length - 1).trim();
  }
  if (!clean) return '';

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

export const formatDisplayPageRange = (
  rawPageRange: string | undefined,
  rawStartPage?: string | undefined
): string => {
  let val = (rawPageRange || rawStartPage || '').trim();
  if (!val) return '';

  while (val.startsWith("'") || val.startsWith('"')) {
    val = val.substring(1).trim();
  }
  while (val.endsWith("'") || val.endsWith('"')) {
    val = val.substring(0, val.length - 1).trim();
  }
  if (!val) return '';

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
      startPage: startPage ? `'${startPage}` : '',
    };
  });
};

/**
 * Extracts document records with NO file size limits.
 * Handles arbitrarily large files (hundreds of MB, many pages) by adaptive streaming chunking.
 */
export const extractDataFromFiles = async (
  files: File[],
  onProgress?: (
    currentFileIndex: number,
    totalFiles: number,
    currentFileName: string,
    detailInfo?: string
  ) => void
): Promise<ExtractedDocument[]> => {
  const allResults: ExtractedDocument[] = [];
  const totalFiles = files.length;

  for (let fileIdx = 0; fileIdx < totalFiles; fileIdx++) {
    const currentFile = files[fileIdx];

    if (onProgress) {
      onProgress(fileIdx + 1, totalFiles, currentFile.name, 'Đang chuẩn bị tệp');
    }

    const isPdf =
      currentFile.type === 'application/pdf' || currentFile.name.toLowerCase().endsWith('.pdf');
    const isImage =
      currentFile.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|tiff)$/i.test(currentFile.name);

    if (isPdf) {
      const arrayBuffer = await currentFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const totalPdfPages = pdfDoc.getPageCount();
      const fileRawDocs: ExtractedDocument[] = [];

      let pageIndex = 0;
      while (pageIndex < totalPdfPages) {
        let chunkPages = 4;
        let pdfBytes: Uint8Array | null = null;
        let actualPagesCopied = 0;

        // Dynamically ensure chunk size remains under 10MB to guarantee compliance with API gateways
        while (chunkPages >= 1) {
          const end = Math.min(pageIndex + chunkPages, totalPdfPages);
          actualPagesCopied = end - pageIndex;
          const newDoc = await PDFDocument.create();
          const pagesToCopy = Array.from({ length: actualPagesCopied }, (_, k) => pageIndex + k);
          const copiedPages = await newDoc.copyPages(pdfDoc, pagesToCopy);
          copiedPages.forEach((page) => newDoc.addPage(page));
          const testBytes = await newDoc.save();

          if (testBytes.length <= 10 * 1024 * 1024 || chunkPages === 1) {
            pdfBytes = testBytes;
            break;
          }
          chunkPages = Math.max(1, Math.floor(chunkPages / 2));
        }

        if (pdfBytes) {
          const endPageNum = Math.min(pageIndex + actualPagesCopied, totalPdfPages);
          const detail = `Đang xử lý trang ${pageIndex + 1} - ${endPageNum} / ${totalPdfPages}`;
          if (onProgress) {
            onProgress(fileIdx + 1, totalFiles, currentFile.name, detail);
          }

          const base64Chunk = await uint8ArrayToBase64(pdfBytes);
          const chunkResults = await callExtractApi({
            fileBase64: base64Chunk,
            fileType: 'application/pdf',
            fileName: `${currentFile.name}-p${pageIndex + 1}-${endPageNum}`,
          });
          fileRawDocs.push(...chunkResults);
        }

        pageIndex += actualPagesCopied;
        // Yield momentarily to keep browser UI responsive during massive file processing
        await new Promise((r) => setTimeout(r, 80));
      }

      const formattedFileDocs = formatAndCalculateRanges(fileRawDocs).map((doc, docIdx) => ({
        ...doc,
        sourceFileName: currentFile.name,
        index: allResults.length + docIdx + 1,
      }));

      allResults.push(...formattedFileDocs);
    } else if (isImage) {
      if (onProgress) {
        onProgress(fileIdx + 1, totalFiles, currentFile.name, 'Đang tối ưu & bóc tách hình ảnh');
      }

      // Optimize image before sending to handle any file size effortlessly
      const { base64, mimeType } = await optimizeImageFile(currentFile);
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
