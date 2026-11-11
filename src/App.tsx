import React, { useState, useRef, useEffect } from 'react';
import { extractDataFromFiles } from './services/geminiService';
import { DataTable } from './components/DataTable';
import { BannerCarousel } from './components/BannerCarousel';
import { exportToExcel, calculateSttList } from './utils/excelExport';
import { ExtractedDocument, ProcessingStatus, ExcelExportConfig, ThemeConfig, HistoryItem } from './types';
import { 
  FileSpreadsheet, Loader2, AlertCircle, Check, Copy, Settings, X, 
  UploadCloud, History, Trash2, Cpu, Palette, Monitor, FileText, Image as ImageIcon,
  Images, Plus, Sparkles, Globe, Layers, Play, ArrowUp, ArrowDown, RotateCcw, Users
} from 'lucide-react';

const THEMES: ThemeConfig[] = [
  { id: 'blue', name: 'Xanh dương', primary: 'blue', gray: 'slate' },
  { id: 'emerald', name: 'Thiên nhiên', primary: 'emerald', gray: 'zinc' },
  { id: 'violet', name: 'Sáng tạo', primary: 'violet', gray: 'slate' },
  { id: 'rose', name: 'Nổi bật', primary: 'rose', gray: 'stone' },
  { id: 'amber', name: 'Mặc định', primary: 'amber', gray: 'neutral' },
];

const PRESET_BG_COLORS = [
  { name: 'Sương mai', value: '#F8FAFC' },
  { name: 'Bạc hà', value: '#F0FDF4' },
  { name: 'Bầu trời', value: '#F0F9FF' },
  { name: 'Oải hương', value: '#F5F3FF' },
  { name: 'Cát trắng', value: '#FAFAF9' },
  { name: 'Hồng phấn', value: '#FFF1F2' },
  { name: 'Cam đào', value: '#FFF7ED' },
  { name: 'Mặc định', value: '#F5FFFA' },
];

const DEFAULT_BG_COLOR = '#F5FFFA';

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

const App: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [extractedData, setExtractedData] = useState<ExtractedDocument[]>([]);
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [processingInfo, setProcessingInfo] = useState<{
    currentFileIndex: number;
    totalFiles: number;
    currentFileName: string;
  } | null>(null);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [showNotification, setShowNotification] = useState<{message: string, type: 'success' | 'info' | 'error'} | null>(null);
  
  const [showConfigPanel, setShowConfigPanel] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('app_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [backgroundColor, setBackgroundColor] = useState<string>(() => localStorage.getItem('app_bg_color') || DEFAULT_BG_COLOR);
  const [currentTheme, setCurrentTheme] = useState<ThemeConfig>(() => {
    const savedThemeId = localStorage.getItem('app_theme_id');
    if (savedThemeId) {
      const found = THEMES.find(t => t.id === savedThemeId);
      if (found) return found;
    }
    return THEMES[0];
  });

  const [excelConfig] = useState<ExcelExportConfig>({ fontName: 'Times New Roman', fontSize: 14, wrapText: true, allBorders: true });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const configPanelRef = useRef<HTMLDivElement>(null);
  
  const p = currentTheme.primary;
  const g = currentTheme.gray;

  useEffect(() => { localStorage.setItem('app_history', JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem('app_bg_color', backgroundColor); }, [backgroundColor]);
  useEffect(() => { localStorage.setItem('app_theme_id', currentTheme.id); }, [currentTheme]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (configPanelRef.current && !configPanelRef.current.contains(event.target as Node)) {
        setShowConfigPanel(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let interval: any;
    if (status === ProcessingStatus.PROCESSING) {
      interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) return 95;
          return prev + 0.8;
        });
      }, 500);
    } else if (status === ProcessingStatus.SUCCESS) {
      setProgress(100);
      notify("Bóc tách thành công theo đúng thứ tự các tệp!", "success");
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 500);
    }
    return () => clearInterval(interval);
  }, [status]);

  const notify = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setShowNotification({ message, type });
    setTimeout(() => setShowNotification(null), 4000);
  };

  const isAcceptedFile = (f: File) => {
    return f.type === 'application/pdf' || f.type.startsWith('image/') || /\.(pdf|png|jpe?g|webp|bmp|tiff)$/i.test(f.name);
  };

  const handleFilesSelected = (newSelectedFiles: File[]) => {
    const valid = newSelectedFiles.filter(isAcceptedFile);
    if (valid.length === 0) {
      if (newSelectedFiles.length > 0) {
        notify("Hệ thống chỉ hỗ trợ định dạng PDF hoặc hình ảnh (PNG, JPG, WEBP...).", "error");
      }
      return;
    }

    setFiles(prev => [...prev, ...valid]);
    notify(`Đã gắn ${valid.length} tệp vào danh sách. Bấm nút "Bắt đầu" bên dưới để tiến hành.`, "info");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []) as File[];
    handleFilesSelected(selected);
    if (e.target) e.target.value = '';
  };

  const handleAppendFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []) as File[];
    handleFilesSelected(selected);
    if (e.target) e.target.value = '';
  };

  const handleMoveFileUp = (index: number) => {
    if (index === 0) return;
    setFiles(prev => {
      const updated = [...prev];
      const temp = updated[index - 1];
      updated[index - 1] = updated[index];
      updated[index] = temp;
      return updated;
    });
  };

  const handleMoveFileDown = (index: number) => {
    setFiles(prev => {
      if (index >= prev.length - 1) return prev;
      const updated = [...prev];
      const temp = updated[index + 1];
      updated[index + 1] = updated[index];
      updated[index] = temp;
      return updated;
    });
  };

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearAllFiles = () => {
    setFiles([]);
    setProcessingInfo(null);
    if (status !== ProcessingStatus.PROCESSING) {
      setStatus(ProcessingStatus.IDLE);
    }
  };

  const handleStartExtraction = async () => {
    if (files.length === 0) {
      notify("Vui lòng gắn ít nhất một tệp PDF hoặc hình ảnh trước khi bắt đầu.", "error");
      return;
    }

    setStatus(ProcessingStatus.PROCESSING);
    setErrorMessage('');
    setExtractedData([]);
    setProgress(5);
    setProcessingInfo({
      currentFileIndex: 1,
      totalFiles: files.length,
      currentFileName: files[0].name,
    });

    try {
      const data = await extractDataFromFiles(files, (currIdx, total, fileName) => {
        setProcessingInfo({
          currentFileIndex: currIdx,
          totalFiles: total,
          currentFileName: fileName,
        });
        const basePercent = Math.round(((currIdx - 1) / total) * 90);
        setProgress(Math.max(5, basePercent + 5));
      });

      setExtractedData(data);
      setStatus(ProcessingStatus.SUCCESS);
      setProgress(100);
      setProcessingInfo(null);

      const fileNameSummary = files.length === 1 
        ? files[0].name 
        : `${files.length} tệp theo thứ tự (${files.map(f => f.name).slice(0, 2).join(', ')}${files.length > 2 ? '...' : ''})`;

      const newHistoryItem: HistoryItem = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        fileName: fileNameSummary,
        data: data
      };
      setHistory(prev => [newHistoryItem, ...prev]);
    } catch (err: any) {
      console.error(err);
      setStatus(ProcessingStatus.ERROR);
      setProcessingInfo(null);
      const msg = err.message || "Đã xảy ra lỗi trong quá trình xử lý.";
      setErrorMessage(msg);
      notify(msg, "error");
    }
  };

  const handleExport = () => {
    if (extractedData.length === 0) return;
    const baseName = files.length > 0 ? files[0].name.split('.')[0] : 'trich_xuat';
    exportToExcel(extractedData, `ket_qua_${baseName}`, excelConfig);
    notify("Đã xuất file Excel thành công", "success");
  };

  const handleCopy = async () => {
    if (extractedData.length === 0) return;
    const sttList = calculateSttList(extractedData);
    const rows = extractedData.map((d, idx) => {
      const formattedStt = sttList[idx] || `'${idx + 1 < 10 ? `0${idx + 1}` : idx + 1}`;
      const formattedDate = formatDisplayDate(d.date);
      const formattedPage = formatDisplayPageRange(d.pageRange, d.startPage);
      return `${formattedStt}\t${d.symbol || ''}\t${formattedDate}\t${d.docType} ${d.summary}\t${d.authority}\t${formattedPage}`;
    }).join('\n');
    
    try {
      await navigator.clipboard.writeText(rows);
      setCopySuccess(true);
      notify("Đã sao chép vào bộ nhớ tạm", "success");
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      notify("Lỗi khi sao chép", "error");
    }
  };

  const handleDeleteHistory = (id: string) => {
    setHistory(history.filter(h => h.id !== id));
    notify("Đã xóa bản ghi lịch sử", "info");
  };

  const handleLoadHistory = (item: HistoryItem) => {
    setExtractedData(item.data);
    setStatus(ProcessingStatus.SUCCESS);
    setFiles([new File([], item.fileName)]);
    setShowHistory(false);
    notify(`Đã tải lại kết quả: ${item.fileName}`, "success");
  };

  const imageCount = files.filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|tiff)$/i.test(f.name)).length;
  const pdfCount = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')).length;

  return (
    <div 
      className="min-h-screen transition-all duration-700 ease-in-out pb-20"
      style={{ backgroundColor }}
    >
      <nav className="bg-white/80 backdrop-blur-lg sticky top-0 z-40 border-b border-slate-200/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 bg-${p}-500 text-white rounded-2xl shadow-lg shadow-${p}-500/20`}>
              <Cpu size={24} />
            </div>
            <div className="flex flex-col">
              <span className={`text-xl font-black text-${g}-900 tracking-tight leading-none`}>TRÍCH XUẤT TÀI LIỆU CHÍNH QUYỀN</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Hệ thống trích xuất văn bản v2.2 • Hỗ trợ PDF & Nhiều ảnh</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowHistory(true)}
              className="group flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-slate-600 hover:bg-white hover:shadow-md transition-all active:scale-95"
            >
              <History size={18} className="group-hover:rotate-[-30deg] transition-transform" /> 
              <span className="hidden sm:inline">Lịch sử</span>
            </button>
            <div className="w-px h-6 bg-slate-200 hidden sm:block"></div>
            <button 
              onClick={() => setShowConfigPanel(!showConfigPanel)}
              className={`p-2.5 rounded-2xl transition-all active:scale-90 relative ${showConfigPanel ? `bg-${p}-100 text-${p}-600` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
              <Settings size={22} className={showConfigPanel ? 'animate-spin-slow' : ''} />
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="space-y-12 animate-in fade-in duration-700">
          <BannerCarousel theme={currentTheme} />

          <div className="space-y-12">
            <div className="bg-white rounded-[3rem] shadow-2xl shadow-slate-200/50 border border-slate-100 p-8 sm:p-14 overflow-hidden relative group">
              <div className={`absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none text-${p}-500 transition-transform duration-1000 group-hover:scale-110`}>
                <UploadCloud size={400} strokeWidth={1} />
              </div>
              
              <div className="relative z-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                  <div className="flex items-center gap-5">
                    <div className={`p-5 bg-${p}-50 text-${p}-500 rounded-[2rem] shadow-inner`}>
                      <UploadCloud size={32} />
                    </div>
                    <div>
                      <h3 className="text-3xl font-black text-slate-900 leading-tight">Trung tâm bóc tách</h3>
                      <p className="text-slate-500 font-medium text-lg">Phân tích văn bản PDF & Đính kèm nhiều hình ảnh</p>
                    </div>
                  </div>

                  {/* Feature indicators for French, Telex & List rule */}
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 font-bold text-xs rounded-full border border-blue-100 shadow-sm">
                      <Globe size={14} className="text-blue-600" />
                      Giữ nguyên tiếng Pháp (Không dịch)
                    </span>
                    <span className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-full border border-emerald-100 shadow-sm">
                      <Sparkles size={14} className="text-emerald-600" />
                      Giải mã Telex & Thêm dấu tiếng Việt
                    </span>
                    <span className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-800 font-bold text-xs rounded-full border border-amber-100 shadow-sm" title="Văn bản danh sách trên 4 cá nhân: không liệt kê tên trong trích yếu (chỉ ghi khái quát); từ 1-4 cá nhân ghi đầy đủ họ tên">
                      <Users size={14} className="text-amber-600" />
                      Danh sách &gt; 4 cá nhân: Không liệt kê tên
                    </span>
                  </div>
                </div>

                <div 
                  className={`relative border-2 border-dashed rounded-[3rem] p-8 sm:p-14 transition-all cursor-pointer group/upload flex flex-col items-center justify-center ${
                    isDragging ? `border-${p}-500 bg-${p}-50/50 scale-[1.01] shadow-2xl` : `border-slate-200 hover:border-${p}-300 hover:bg-slate-50/20`
                  } ${status === ProcessingStatus.PROCESSING ? 'pointer-events-none opacity-60' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const droppedFiles = Array.from(e.dataTransfer.files || []) as File[];
                    handleFilesSelected(droppedFiles);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept=".pdf,image/*" 
                    multiple 
                    onChange={handleFileUpload} 
                  />
                  
                  <div className={`w-24 h-24 bg-${p}-50 text-${p}-500 rounded-full flex items-center justify-center mb-6 group-hover/upload:scale-110 transition-transform duration-700 shadow-xl shadow-${p}-500/10`}>
                    {status === ProcessingStatus.PROCESSING ? (
                      <Loader2 className="animate-spin" size={42} />
                    ) : (
                      <Images size={42} />
                    )}
                  </div>

                  <div className="text-center max-w-xl">
                    <p className="text-2xl font-black text-slate-800 mb-2">
                      Kéo thả hoặc bấm để gắn tệp PDF / Nhiều hình ảnh
                    </p>
                    <p className="text-slate-400 font-medium text-sm leading-relaxed">
                      Có thể gắn nhiều tệp PDF hoặc ảnh cùng lúc. Sau khi gắn tệp, bạn có thể kiểm tra và sắp xếp thứ tự trước khi bấm nút <strong className="text-slate-600">Bắt đầu</strong>.
                    </p>
                  </div>

                  {status === ProcessingStatus.PROCESSING && (
                    <div className="mt-10 w-full max-w-xl bg-white/90 backdrop-blur-md p-6 rounded-3xl border border-slate-200 shadow-lg">
                      <div className="flex justify-between items-end mb-3">
                        <div className="flex flex-col">
                          <span className={`text-xs font-black text-${p}-600 uppercase tracking-[0.2em] mb-1 flex items-center gap-1.5`}>
                            <Loader2 size={14} className="animate-spin" /> Đang bóc tách dữ liệu
                          </span>
                          <span className="text-slate-700 font-bold text-sm truncate max-w-md">
                            Tệp {processingInfo?.currentFileIndex || 1}/{processingInfo?.totalFiles || files.length}: {processingInfo?.currentFileName || files[0]?.name}
                          </span>
                        </div>
                        <span className={`text-3xl font-black text-${p}-600 tabular-nums`}>{Math.round(progress)}%</span>
                      </div>
                      <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner p-0.5">
                        <div 
                          className={`h-full bg-${p}-500 rounded-full transition-all duration-300 ease-out shadow-lg shadow-${p}-500/30`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-400 font-medium mt-2 text-center">
                        Kết quả bóc tách đang được xử lý và trả về theo đúng thứ tự từng tệp...
                      </p>
                    </div>
                  )}
                </div>

                {/* Staged / Uploaded Files List with Order Control & Start Button */}
                {files.length > 0 && (
                  <div className="mt-8 p-6 sm:p-8 bg-slate-50/90 rounded-3xl border border-slate-200/90 animate-in fade-in duration-300 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-200">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 bg-${p}-100 text-${p}-700 rounded-xl`}>
                          <Layers size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-800 text-base">
                              Danh sách tệp chuẩn bị bóc tách ({files.length}):
                            </span>
                            {pdfCount > 0 && (
                              <span className="px-2.5 py-0.5 bg-red-100 text-red-700 font-bold text-xs rounded-full">
                                {pdfCount} PDF
                              </span>
                            )}
                            {imageCount > 0 && (
                              <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 font-bold text-xs rounded-full">
                                {imageCount} hình ảnh
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 font-medium mt-0.5">
                            Kết quả bảng sẽ được trả về lần lượt theo đúng thứ tự dưới đây (từ #1 đến #{files.length}).
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                          type="button"
                          onClick={() => addFileInputRef.current?.click()}
                          className={`flex items-center gap-1.5 px-4 py-2 bg-white text-${p}-600 border border-${p}-200 rounded-xl font-bold text-xs shadow-sm hover:bg-${p}-50 transition-all cursor-pointer`}
                        >
                          <Plus size={16} /> Thêm file PDF / Ảnh
                        </button>
                        <input 
                          type="file" 
                          ref={addFileInputRef} 
                          className="hidden" 
                          accept=".pdf,image/*" 
                          multiple 
                          onChange={handleAppendFiles} 
                        />
                        
                        <button
                          type="button"
                          onClick={handleClearAllFiles}
                          className="text-xs font-bold text-slate-400 hover:text-rose-600 px-3 py-2 rounded-xl transition-colors cursor-pointer"
                        >
                          Xóa tất cả
                        </button>
                      </div>
                    </div>

                    {/* Sequential File List */}
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                      {files.map((fileItem, idx) => {
                        const isImg = fileItem.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|tiff)$/i.test(fileItem.name);
                        const isFirst = idx === 0;
                        const isLast = idx === files.length - 1;
                        const isCurrentlyProcessing = status === ProcessingStatus.PROCESSING && processingInfo?.currentFileIndex === (idx + 1);

                        return (
                          <div 
                            key={idx}
                            className={`flex items-center justify-between gap-3 px-4 py-3 bg-white rounded-2xl border transition-all ${
                              isCurrentlyProcessing 
                                ? `border-${p}-400 ring-2 ring-${p}-100 shadow-md` 
                                : 'border-slate-200/80 shadow-xs hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {/* Order Badge */}
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                                isCurrentlyProcessing 
                                  ? `bg-${p}-500 text-white animate-pulse` 
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                #{idx + 1}
                              </div>

                              {isImg ? (
                                <ImageIcon size={20} className="text-blue-500 shrink-0" />
                              ) : (
                                <FileText size={20} className="text-red-500 shrink-0" />
                              )}

                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-800 truncate" title={fileItem.name}>
                                  {fileItem.name}
                                </p>
                                <span className="text-[10px] text-slate-400 font-medium">
                                  {(fileItem.size / (1024 * 1024)).toFixed(2)} MB {isImg ? '• Hình ảnh' : '• Văn bản PDF'}
                                </span>
                              </div>
                            </div>

                            {/* Order Controls & Actions */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleMoveFileUp(idx)}
                                disabled={isFirst || status === ProcessingStatus.PROCESSING}
                                title="Chuyển tệp lên trước"
                                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none rounded-lg transition-colors cursor-pointer"
                              >
                                <ArrowUp size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveFileDown(idx)}
                                disabled={isLast || status === ProcessingStatus.PROCESSING}
                                title="Chuyển tệp xuống sau"
                                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none rounded-lg transition-colors cursor-pointer"
                              >
                                <ArrowDown size={16} />
                              </button>
                              <div className="w-px h-4 bg-slate-200 mx-1"></div>
                              <button
                                type="button"
                                onClick={() => handleRemoveFile(idx)}
                                disabled={status === ProcessingStatus.PROCESSING}
                                title="Xóa tệp khỏi danh sách"
                                className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 disabled:opacity-30 disabled:pointer-events-none rounded-lg transition-colors cursor-pointer"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* START EXTRACTION BUTTON SECTION */}
                    <div className="mt-6 pt-5 border-t border-slate-200/90 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                        <span>Đã sẵn sàng {files.length} tệp. Nhấn nút "Bắt đầu" để tiến hành bóc tách theo đúng thứ tự trên.</span>
                      </div>

                      <button
                        type="button"
                        onClick={handleStartExtraction}
                        disabled={status === ProcessingStatus.PROCESSING}
                        className={`w-full sm:w-auto px-10 py-3.5 bg-${p}-600 hover:bg-${p}-700 text-white font-black text-base rounded-2xl shadow-xl shadow-${p}-600/25 active:scale-95 transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60 disabled:pointer-events-none`}
                      >
                        {status === ProcessingStatus.PROCESSING ? (
                          <>
                            <Loader2 size={18} className="animate-spin" />
                            <span>Đang bóc tách...</span>
                          </>
                        ) : (
                          <>
                            <Play size={18} className="fill-white" />
                            <span>Bắt đầu</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

              </div>
            </div>

            <div ref={resultsRef} className="space-y-12">
              {status === ProcessingStatus.ERROR && (
                <div className="bg-rose-50 rounded-[3rem] border border-rose-100 p-12 text-center animate-in zoom-in duration-500 relative overflow-hidden">
                  <div className="relative z-10">
                      <div className="w-20 h-20 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                        <AlertCircle size={40} />
                      </div>
                      <h4 className="text-2xl font-black text-rose-900">Có lỗi xảy ra</h4>
                      <p className="text-rose-600 mt-3 text-lg font-medium max-w-md mx-auto">{errorMessage}</p>
                      <button 
                        onClick={() => files.length > 0 && handleStartExtraction()}
                        className="mt-8 px-10 py-4 bg-rose-500 text-white rounded-2xl font-black shadow-xl shadow-rose-500/20 hover:bg-rose-600 transition-all active:scale-95 cursor-pointer"
                      >
                        Thử lại ngay
                      </button>
                  </div>
                </div>
              )}

              {(status === ProcessingStatus.SUCCESS || extractedData.length > 0) && (
                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-10 duration-1000">
                  <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 px-4">
                    <div className="flex items-center gap-5">
                      <div className={`p-4 bg-${p}-100 text-${p}-600 rounded-[1.5rem]`}>
                        <Monitor size={28} />
                      </div>
                      <div>
                        <h3 className="text-3xl font-black text-slate-900 tracking-tight">Kết quả bóc tách</h3>
                        <p className="text-slate-500 font-bold mt-1 uppercase text-xs tracking-widest flex items-center gap-2">
                          <span>Tìm thấy {extractedData.length} văn bản</span>
                          <span className="text-slate-300">•</span>
                          <span className="text-blue-600 font-medium normal-case">Đã giữ nguyên văn bản tiếng Pháp (không dịch)</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 w-full lg:w-auto">
                      <button
                        onClick={handleCopy}
                        className={`flex-1 lg:flex-none flex items-center justify-center gap-3 px-8 py-4 rounded-[1.5rem] font-black transition-all shadow-xl active:scale-95 ${
                          copySuccess 
                            ? 'bg-green-500 text-white shadow-green-500/20' 
                            : `bg-white text-${p}-600 border border-${p}-100 hover:bg-${p}-50 shadow-slate-200/50`
                        }`}
                      >
                        {copySuccess ? <Check size={20} strokeWidth={3} /> : <Copy size={20} />}
                        {copySuccess ? 'Đã sao chép' : 'Sao chép bảng'}
                      </button>
                      <button
                        onClick={handleExport}
                        className="flex-1 lg:flex-none flex items-center justify-center gap-3 px-8 py-4 bg-emerald-500 text-white rounded-[1.5rem] font-black shadow-xl shadow-emerald-500/20 hover:bg-emerald-600 hover:-translate-y-1 transition-all active:scale-95"
                      >
                        <FileSpreadsheet size={20} /> Xuất Excel
                      </button>
                    </div>
                  </div>
                  <DataTable data={extractedData} theme={currentTheme} />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <div className={`fixed inset-y-0 right-0 w-80 bg-white/95 backdrop-blur-2xl shadow-2xl z-[55] transform transition-transform duration-500 ease-out border-l border-slate-100 ${showConfigPanel ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="h-full flex flex-col p-8">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
              <div className={`p-2 bg-${p}-100 text-${p}-600 rounded-xl`}>
                <Palette size={20} />
              </div>
              <h4 className="text-xl font-black text-slate-900 tracking-tight">Giao diện</h4>
            </div>
            <button onClick={() => setShowConfigPanel(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
          </div>

          <div className="flex-1 space-y-10 overflow-y-auto pr-2 custom-scrollbar">
            <section>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-5">Chủ đề màu sắc</p>
              <div className="grid grid-cols-5 gap-3">
                {THEMES.map(t => (
                  <button 
                    key={t.id} 
                    onClick={() => setCurrentTheme(t)} 
                    title={t.name}
                    className={`aspect-square rounded-2xl border-2 transition-all ${currentTheme.id === t.id ? 'border-slate-900 ring-4 ring-slate-100' : 'border-transparent shadow-sm'}`} 
                    style={{ backgroundColor: t.primary === 'blue' ? '#3B82F6' : t.primary === 'emerald' ? '#10B981' : t.primary === 'violet' ? '#8B5CF6' : t.primary === 'rose' ? '#F43F5E' : '#F59E0B' }} 
                  />
                ))}
              </div>
            </section>

            <section>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-5">Màu nền trang</p>
              <div className="grid grid-cols-4 gap-3">
                {PRESET_BG_COLORS.map((bg, idx) => (
                  <button 
                    key={idx} 
                    onClick={() => setBackgroundColor(bg.value)}
                    title={bg.name}
                    className={`h-10 rounded-xl border transition-all ${backgroundColor === bg.value ? 'border-slate-800 ring-2 ring-slate-400 shadow-md scale-105' : 'border-slate-200 shadow-sm'}`}
                    style={{ backgroundColor: bg.value }}
                  />
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>

      {showHistory && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={() => setShowHistory(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl p-8 animate-in slide-in-from-right duration-500">
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-3"><History size={20} /><h3 className="text-2xl font-black">Lịch sử</h3></div>
              <button onClick={() => setShowHistory(false)}><X size={24} /></button>
            </div>
            <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-200px)]">
              {history.length === 0 ? (
                <p className="text-center text-slate-400 py-10 font-medium">Chưa có lịch sử bóc tách</p>
              ) : (
                history.map(item => (
                  <div key={item.id} className="p-5 bg-slate-50 rounded-3xl hover:bg-white cursor-pointer group transition-all border border-transparent hover:border-slate-200 hover:shadow-md" onClick={() => handleLoadHistory(item)}>
                    <p className="font-black text-slate-900 truncate">{item.fileName}</p>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-[10px] text-slate-400">{new Date(item.timestamp).toLocaleString()}</span>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteHistory(item.id); }} className="text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showNotification && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-10">
          <div className={`px-10 py-4 rounded-[2rem] shadow-2xl font-black text-white flex items-center gap-4 ${showNotification.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
            {showNotification.type === 'success' ? <Check size={20} /> : <AlertCircle size={20} />}
            <span>{showNotification.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
