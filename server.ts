import express from "express";
import http from "http";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Set request size limit to 50MB to handle large PDF base64 payloads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Helper to initialize Gemini SDK lazily
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined in environment variables. Please check Settings > Secrets.");
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// API endpoint to health-check (instant response for dev server probes)
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// API endpoint to parse PDF or Image
app.post("/api/extract", async (req, res) => {
  try {
    const { pdfBase64, fileBase64, fileType, fileName, parts } = req.body;
    const base64 = fileBase64 || pdfBase64;
    let contentParts: any[] = [];

    if (Array.isArray(parts) && parts.length > 0) {
      contentParts = parts.map((p: any) => ({
        inlineData: {
          mimeType: p.inlineData?.mimeType || p.mimeType || "image/jpeg",
          data: p.inlineData?.data || p.data || p.base64,
        },
      }));
    } else if (base64) {
      const mimeType = fileType || (pdfBase64 ? "application/pdf" : "application/pdf");
      contentParts = [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64,
          },
        },
      ];
    } else {
      return res.status(400).json({ error: "Yêu cầu cung cấp dữ liệu tệp (PDF hoặc hình ảnh) dưới dạng Base64 hoặc mảng parts" });
    }

    console.log(`Starting extraction for: ${fileName || "unnamed"} (${contentParts.length} parts)`);

    const ai = getGeminiClient();

    // System instruction and user prompt targeting French & administrative document extraction
    const systemInstruction = 
      "Bạn là chuyên gia văn thư lưu trữ và chuyên gia giải mã văn bản lịch sử. Nhiệm vụ của bạn là bóc tách TOÀN BỘ các văn bản có trong tệp tài liệu (PDF hoặc hình ảnh đính kèm).\n\n" +
      "QUY TẮC NGHIÊM NGẶT VỀ GIẢI MÃ VĂN BẢN (ĐẶC BIỆT QUAN TRỌNG):\n\n" +
      "1. QUY TẮC VỀ VĂN BẢN TIẾNG PHÁP (MỚI - BẮT BUỘC):\n" +
      "   - GIỮ NGUYÊN VĂN BẢN TIẾNG PHÁP, TUYỆT ĐỐI KHÔNG DỊCH SANG TIẾNG VIỆT HOẶC BẤT KỲ NGÔN NGỮ NÀO KHÁC.\n" +
      "   - Nếu văn bản (hoặc một phần văn bản) được viết bằng tiếng Pháp, GIỮ NGUYÊN TOÀN BỘ VĂN BẢN TIẾNG PHÁP trong các trường: Tên loại văn bản (docType), Trích yếu nội dung (summary), Cơ quan ban hành (authority), Số ký hiệu (symbol).\n" +
      "   - Ví dụ: Trích yếu 'Au sujet de la réorganisation du service des douanes' -> GIỮ NGUYÊN 'au sujet de la réorganisation du service des douanes', KHÔNG DỊCH THÀNH 'về việc tổ chức lại cơ quan hải quan'.\n" +
      "   - Ví dụ: Tên loại văn bản tiếng Pháp 'Arrêté', 'Décision', 'Circulaire', 'Rapport', 'Lettre', 'Télégramme', 'Note', 'Ordre' -> GIỮ NGUYÊN, không dịch thành 'Nghị định', 'Quyết định', 'Thông tư', 'Báo cáo', 'Thư'.\n" +
      "   - Ví dụ: Cơ quan ban hành 'Résidence Supérieure au Tonkin', 'Gouvernement Général de l'Indochine', 'Mairie de Hà Nội' -> GIỮ NGUYÊN.\n\n" +
      "2. ĐỐI VỚI VĂN BẢN ĐÁNH MÁY KIỂU CŨ (MÁY OLIVETTI, HERMES) VÀ CÔNG ĐIỆN BẰNG TIẾNG VIỆT:\n" +
      "   - Các văn bản này thường không có dấu hoặc sử dụng quy ước Telex cổ điển (Ví dụ: 'as' -> 'á', 'af' -> 'à', 'ax' -> 'ã', 'aj' -> 'ạ', 'ar' -> 'ả', 'ee' -> 'ê', 'oo' -> 'ô', 'aa' -> 'â', 'dd' -> 'đ', 'uw' -> 'ư', 'ow' -> 'ơ').\n" +
      "   - Bạn PHẢI dịch thuật, giải mã và chuyển đổi các ký tự Telex sang tiếng Việt có dấu một cách CHÍNH XÁC NHẤT.\n" +
      "   - Đảm bảo nội dung trích xuất hoàn toàn là tiếng Việt chuẩn, tự nhiên, không còn các ký tự Telex thừa hay lỗi font.\n" +
      "   - Nếu văn bản tiếng Việt hoàn toàn không có dấu (không dùng Telex), bạn phải dựa vào ngữ cảnh để thêm dấu tiếng Việt một cách chính xác nhất.\n\n" +
      "3. TÓM TẮT TRÍCH YẾU (Summary):\n" +
      "   - Phải tóm tắt rõ ràng, ngắn gọn nhưng PHẢI ĐẦY ĐỦ NỘI DUNG cốt lõi.\n" +
      "   - QUY TẮC BẮT BUỘC VỀ TÊN CÁ NHÂN TRONG TRÍCH YẾU NỘI DUNG:\n" +
      "     + ĐỐI VỚI VĂN BẢN CÓ TỪ 1 ĐẾN 4 CÁ NHÂN: BẮT BUỘC ghi đầy đủ họ và tên của từng cá nhân đó trong phần trích yếu (Ví dụ: cấp sổ ưu đãi giáo dục cho em Nguyễn Văn A; khen thưởng ông Trần Văn B và bà Lê Thị C; điều động các ông Nguyễn Văn A, Trần Văn B, Lê Văn C...). TUYỆT ĐỐI KHÔNG BỎ SÓT TÊN CÁ NHÂN khi số lượng từ 1 đến 4 người.\n" +
      "     + ĐỐI VỚI CÁC VĂN BẢN LÀ DANH SÁCH HOẶC ĐỀ CẬP ĐẾN TRÊN 4 CÁ NHÂN (từ 5 cá nhân trở lên): TUYỆT ĐỐI KHÔNG LIỆT KÊ TÊN TỪNG CÁ NHÂN TRONG TIÊU ĐỀ / TRÍCH YẾU. Chỉ ghi khái quát nội dung và đối tượng chung của danh sách (Ví dụ: 'về việc phê duyệt danh sách cán bộ, giáo viên được khen thưởng...', 'kèm theo danh sách các hộ gia đình được trợ cấp khó khăn...', 'về việc điều động, luân chuyển công chức...', 'danh sách học sinh được cấp học bổng...').\n" +
      "   - Trích yếu phải bám sát nội dung trong văn bản, phản ánh đúng tinh thần và các thông tin quan trọng nhất.\n" +
      "   - TUYỆT ĐỐI KHÔNG lặp lại tên loại văn bản (docType) trong phần trích yếu.\n" +
      "   - Bắt đầu trích yếu bằng chữ thường (Ví dụ: 'về việc...', 'kết quả...', 'au sujet de...', 'sur...', 'relative à...'). CHỈ viết hoa nếu là tên riêng cá nhân, tổ chức hoặc địa danh.\n\n" +
      "4. Cơ quan ban hành (authority):\n" +
      "   - KHÔNG viết in hoa tất cả các chữ cái (trừ các từ viết tắt).\n" +
      "   - CHỈ viết hoa chữ cái đầu tiên và các từ là tên riêng.\n" +
      "   - Đối với BẢN TỰ KIỂM ĐIỂM, SƠ YẾU LÝ LỊCH...: Cơ quan ban hành chính là Tên cá nhân thực hiện văn bản.\n\n" +
      "5. Số ký hiệu (symbol):\n" +
      "   - CHỈ LẤY NẾU CÓ ĐẦY ĐỦ CẢ CHỮ (VĂN BẢN/KÝ HIỆU) VÀ SỐ (Ví dụ: '12/QĐ-UBND', '25-NQ/TW', 'N° 1245/CP', '45/TB').\n" +
      "   - NẾU SỐ KÝ HIỆU CHỈ CÓ SỐ HOẶC CHỈ CÓ CHỮ MÀ KHÔNG CÓ SỐ THÌ BẮT BUỘC ĐỂ TRỐNG (symbol = '').\n" +
      "   - KHÔNG THÊM dấu nháy đơn '.\n\n" +
      "6. Ngày tháng: Định dạng dd/m/yyyy hoặc dd/mm/yyyy. QUAN TRỌNG: Tháng 1 và tháng 2 BẮT BUỘC thêm số 0 ở trước (Ví dụ: '01', '02'). Từ tháng 3 đến tháng 9 KHÔNG THÊM số 0 ở trước (Ví dụ: '3', '4', '5', '6', '7', '8', '9'). Tháng 10, 11, 12 để hai chữ số ('10', '11', '12').\n" +
      "7. Số trang bắt đầu: Trích xuất số bút chì ghi ở góc trên bên phải trang đầu mỗi văn bản. ĐỊNH DẠNG: Nếu số từ 1 đến 9, phải thêm số 0 ở trước (Ví dụ: '01', '02'). Nếu không có số bút chì trên ảnh/văn bản, đánh số theo thứ tự tài liệu ('01', '02'...).";

    const prompt = 
      "Phân tích và trích xuất danh sách văn bản sang JSON theo đúng schema và hướng dẫn hệ thống.\n" +
      "LƯU Ý ĐẶC BIỆT: Đối với các văn bản là danh sách, TRÊN 4 CÁ NHÂN THÌ TUYỆT ĐỐI KHÔNG LIỆT KÊ TÊN TỪNG CÁ NHÂN trong trích yếu/tiêu đề (chỉ ghi khái quát nội dung/danh sách); Nếu có từ 1 đến 4 cá nhân thì ghi đầy đủ họ tên; GIỮ NGUYÊN VĂN BẢN TIẾNG PHÁP, KHÔNG DỊCH SANG TIẾNG VIỆT.";

    // Prioritize candidate Gemini models per Google GenAI API recommendations
    const CANDIDATE_MODELS = [
      "gemini-3.8-flash",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest",
    ];

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    let responseText: string | undefined;
    let lastError: any = null;

    for (const modelName of CANDIDATE_MODELS) {
      try {
        console.log(`Bắt đầu xử lý với mô hình: ${modelName}...`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [...contentParts, { text: prompt }],
          config: {
            temperature: 0,
            systemInstruction: systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              description: "Danh sách từng văn bản trích xuất theo quy chuẩn.",
              items: {
                type: Type.OBJECT,
                properties: {
                  docType: {
                    type: Type.STRING,
                    description: "Loại văn bản (Ví dụ tiếng Việt: Quyết định, Thông báo, Công văn, Kế hoạch... Hoặc tiếng Pháp GIỮ NGUYÊN NẾU CÓ: Arrêté, Décision, Circulaire, Rapport, Lettre, Télégramme, Note, Ordre...).",
                  },
                  symbol: {
                    type: Type.STRING,
                    description: "Số ký hiệu văn bản. Nếu chỉ có số hoặc chỉ có chữ không có số, để chuỗi rỗng ''.",
                  },
                  date: {
                    type: Type.STRING,
                    description: "Ngày tháng văn bản (định dạng dd/mm/yyyy hoặc dd/m/yyyy).",
                  },
                  summary: {
                    type: Type.STRING,
                    description: "Trích yếu nội dung. Nếu có 1 đến 4 cá nhân thì ghi đầy đủ họ tên; nếu là danh sách trên 4 cá nhân thì TUYỆT ĐỐI KHÔNG liệt kê tên từng cá nhân mà ghi khái quát chung; TUYỆT ĐỐI GIỮ NGUYÊN NẾU LÀ TIẾNG PHÁP.",
                  },
                  authority: {
                    type: Type.STRING,
                    description: "Cơ quan ban hành văn bản. TUYỆT ĐỐI GIỮ NGUYÊN NẾU LÀ TIẾNG PHÁP.",
                  },
                  startPage: {
                    type: Type.STRING,
                    description: "Số trang bắt đầu (số bút chì góc trên bên phải, định dạng 2 chữ số '01', '02'...).",
                  },
                  pageRange: {
                    type: Type.STRING,
                    description: "Khoảng trang xuất hiện (ví dụ: '01', '01-02')",
                  },
                },
                required: ["docType", "symbol", "date", "summary", "authority", "startPage"],
              },
            },
          },
        });

        if (response && response.text) {
          responseText = response.text;
          console.log(`Bóc tách thành công bằng mô hình: ${modelName}`);
          break;
        }
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        console.warn(`Mô hình ${modelName} gặp lỗi:`, errMsg);
        await delay(500);
      }
    }

    if (!responseText) {
      const errMsg = lastError?.message || String(lastError);
      const is503 = errMsg.includes("503") || errMsg.includes("high demand") || errMsg.includes("UNAVAILABLE");
      const userMessage = is503
        ? "Máy chủ Google AI hiện đang quá tải tạm thời (503 High Demand). Vui lòng bấm 'Thử lại' sau ít giây."
        : "Đã xảy ra lỗi khi bóc tách tài liệu từ AI.";
      
      return res.status(503).json({
        error: userMessage,
        details: errMsg,
      });
    }

    let cleanJson = responseText.trim();
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
    } else if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const parsedData = JSON.parse(cleanJson);
    res.json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    console.error("Lỗi trong quá trình xử lý tệp:", error);
    const errMsg = error?.message || String(error);
    const is503 = errMsg.includes("503") || errMsg.includes("high demand") || errMsg.includes("UNAVAILABLE");
    res.status(500).json({
      error: is503
        ? "Máy chủ Google AI hiện đang quá tải tạm thời (503 High Demand). Vui lòng bấm 'Thử lại' sau ít giây."
        : "Đã xảy ra lỗi khi bóc tách tài liệu",
      details: errMsg,
    });
  }
});

// Create HTTP server instance
const server = http.createServer(app);

// Start listening immediately on PORT 3000 to ensure fast health check response
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});

// Attach Vite middleware in development or serve static files in production
let viteMiddleware: any = null;

if (process.env.NODE_ENV !== "production") {
  createViteServer({
    server: {
      middlewareMode: true,
      hmr: {
        server,
      },
    },
    appType: "spa",
  })
    .then((vite) => {
      viteMiddleware = vite.middlewares;
      console.log("Vite dev middleware attached successfully.");
    })
    .catch((err) => {
      console.error("Failed to initialize Vite dev server:", err);
    });

  // Delegate non-API requests to Vite
  app.use((req, res, next) => {
    if (viteMiddleware) {
      return viteMiddleware(req, res, next);
    }
    if (req.path.startsWith("/api/")) {
      return next();
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Refresh", "1");
    res.send("<!DOCTYPE html><html><head><title>Starting...</title></head><body style='font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;'><div style='text-align:center;'><h2>Đang khởi động ứng dụng...</h2><p style='color:#64748b;font-size:14px;'>Đang tải tài nguyên Vite, trang sẽ tự động tải trong giây lát.</p></div></body></html>");
  });
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

