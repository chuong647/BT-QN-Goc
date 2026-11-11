import XLSX from 'xlsx-js-style';
import { ExtractedDocument, ExcelExportConfig } from '../types';

const formatDisplayDate = (rawDate: string | undefined): string => {
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

const formatDisplayPageRange = (rawPageRange: string | undefined, rawStartPage?: string | undefined): string => {
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

export const calculateSttList = (data: ExtractedDocument[]): string[] => {
  let counter = 0;
  return data.map((item, idx) => {
    const pageVal = formatDisplayPageRange(item.pageRange, item.startPage);
    const clean = pageVal.replace(/^['"]+/, '').trim();
    const firstPart = clean.split(/[-–—]/)[0]?.trim();
    const isStartAtOne = parseInt(firstPart || '', 10) === 1;

    if (idx === 0) {
      counter = 1;
    } else if (isStartAtOne) {
      counter = 1; // Khi số trang bắt đầu từ 01 thì STT chạy lại từ 01
    } else {
      counter += 1;
    }

    return `'${counter < 10 ? `0${counter}` : counter}`;
  });
};

export const exportToExcel = (
  data: ExtractedDocument[], 
  fileName: string = 'ket_qua_trich_xuat',
  config: ExcelExportConfig
) => {
  // Map data to Vietnamese headers with STT and 5 data columns
  // Giữ dấu nháy đơn (') trên STT, Ngày tháng và Số trang để Excel giữ nguyên kiểu chuỗi (text)
  const sttList = calculateSttList(data);

  const formattedData = data.map((item, index) => {
    const formattedStt = sttList[index] || `'${index + 1 < 10 ? `0${index + 1}` : index + 1}`;
    return {
      "STT": formattedStt,
      "Số ký hiệu văn bản": item.symbol || "",
      "Ngày tháng của văn bản": formatDisplayDate(item.date),
      "Trích yếu nội dung văn bản": `${item.docType || ""} ${item.summary || ""}`.trim(),
      "Cơ quan ban hành": item.authority || "",
      "Số trang (Số trang là số nằm phía bên góc phải văn bản, được viết bằng bút chì)": formatDisplayPageRange(item.pageRange, item.startPage),
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(formattedData);
  const range = XLSX.utils.decode_range(worksheet['!ref'] || "A1:A1");
  
  const borderStyle = config.allBorders ? {
    top: { style: "thin", color: { rgb: "000000" } },
    bottom: { style: "thin", color: { rgb: "000000" } },
    left: { style: "thin", color: { rgb: "000000" } },
    right: { style: "thin", color: { rgb: "000000" } }
  } : {};

  const fontStyle = {
    name: config.fontName || 'Times New Roman',
    sz: config.fontSize || 14,
  };

  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      if (!worksheet[cellAddress]) continue;

      const cell = worksheet[cellAddress];
      if (!cell.s) cell.s = {};

      cell.s.font = { ...fontStyle };
      if (config.allBorders) cell.s.border = borderStyle;

      cell.s.alignment = { 
        vertical: "center",
        wrapText: config.wrapText 
      };

      if (R === 0) {
        cell.s.font = { ...fontStyle, bold: true };
        cell.s.alignment = { horizontal: "center", vertical: "center", wrapText: true };
        cell.s.fill = { fgColor: { rgb: "EFEFEF" } };
      } else {
        // Alignment for columns
        if (C === 0 || C === 2 || C === 5) { // STT, Date, Page Range
          cell.s.alignment = { horizontal: "center", vertical: "center" };
        }
      }
    }
  }

  const wscols = [
    { wch: 8 },  // STT
    { wch: 18 }, // Symbol
    { wch: 18 }, // Date
    { wch: 60 }, // Summary
    { wch: 30 }, // Authority
    { wch: 25 }, // Page Range
  ];
  worksheet['!cols'] = wscols;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Dữ liệu");
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
};
