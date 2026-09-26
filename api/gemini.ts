import { GoogleGenAI } from "@google/genai";

export interface VercelRequest {
  method?: string;
  body?: any;
  query?: Record<string, string | string[]>;
  headers?: Record<string, string | string[]>;
}

export interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: any) => void;
  send?: (body: any) => void;
  end?: () => void;
}

const TEXT_MODEL = 'gemini-2.5-flash';

/**
 * Lấy danh sách toàn bộ API Key từ các biến môi trường của Vercel
 */
const getAllAPIKeys = (): string[] => {
  const rawKeys: string[] = [];

  // Lấy từ 4 biến riêng biệt cho QUAD-CORE MAS
  if (process.env.GEMINI_API_KEY_1) rawKeys.push(process.env.GEMINI_API_KEY_1);
  if (process.env.GEMINI_API_KEY_2) rawKeys.push(process.env.GEMINI_API_KEY_2);
  if (process.env.GEMINI_API_KEY_3) rawKeys.push(process.env.GEMINI_API_KEY_3);
  if (process.env.GEMINI_API_KEY_4) rawKeys.push(process.env.GEMINI_API_KEY_4);

  // Lấy từ biến gộp GEMINI_API_KEY (nếu dán dạng key1,key2,key3,key4)
  const envKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY;
  if (envKey) {
    rawKeys.push(...envKey.split(','));
  }

  // Tách chuỗi, xóa khoảng trắng và loại bỏ các Key trùng lặp
  const cleanKeys = rawKeys
    .map(k => k ? k.trim() : '')
    .filter(k => k.length > 0 && k.startsWith("AIzaSy"));

  return Array.from(new Set(cleanKeys));
};

/**
 * Sắp xếp thứ tự ưu tiên Key dựa trên Tác tử (Agent), sau đó xoay vòng dự phòng
 */
const getOrderedKeysForAgent = (agent?: string): string[] => {
  const allKeys = getAllAPIKeys();
  if (allKeys.length === 0) return [];

  // Xác định Key ưu tiên hàng đầu dựa trên Tác tử
  let primaryKeyIndex = 0;
  if (agent === 'Điều phối MAS' || agent === 'ORCHESTRATOR') {
    primaryKeyIndex = 0; // Key 1
  } else if (agent === 'Giải nhanh 1S' || agent === 'GIAI_NHANH_1S') {
    primaryKeyIndex = 1; // Key 2
  } else if (agent === 'Gia sư AI' || agent === 'GIA_SU_AI') {
    primaryKeyIndex = 2; // Key 3
  } else if (agent === 'Luyện Skill' || agent === 'LUYEN_SKILL') {
    primaryKeyIndex = 3; // Key 4
  }

  // Đưa Key ưu tiên lên đầu, các Key còn lại xếp phía sau để làm dự phòng
  const ordered: string[] = [];
  if (allKeys[primaryKeyIndex]) {
    ordered.push(allKeys[primaryKeyIndex]);
  }

  allKeys.forEach((key, index) => {
    if (index !== primaryKeyIndex && !ordered.includes(key)) {
      ordered.push(key);
    }
  });

  return ordered;
};

/**
 * Thử thực thi thao tác với Key ưu tiên, tự động luân chuyển sang Key dự phòng khi gặp lỗi
 */
async function executeWithKeyRotation(agent: string | undefined, operation: (ai: GoogleGenAI) => Promise<any>): Promise<any> {
  const keys = getOrderedKeysForAgent(agent);
  
  if (keys.length === 0) {
    throw new Error("Chưa khai báo GEMINI_API_KEY trong Environment Variables của Vercel!");
  }

  let lastError: any = null;

  for (let i = 0; i < keys.length; i++) {
    const apiKey = keys[i];
    try {
      const ai = new GoogleGenAI({ apiKey });
      return await operation(ai);
    } catch (error: any) {
      console.warn(`Key thứ ${i + 1} gặp sự cố (${error?.message || 'Lỗi kết nối'}), đang tự động luân chuyển sang Key tiếp theo...`);
      lastError = error;
    }
  }

  throw lastError || new Error("Tất cả API Key đều gặp lỗi hoặc vượt quá giới hạn hạn mức (Quota).");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { action, subject, agent, input, image, text, systemPrompt, responseFormat } = req.body || {};

  try {
    // 1. Xử lý yêu cầu tóm tắt (SUMMARY)
    if (action === 'SUMMARY') {
      const summaryText = await executeWithKeyRotation('SUMMARY', async (ai) => {
        const response = await ai.models.generateContent({
          model: TEXT_MODEL,
          contents: `Chỉ trả lời một câu duy nhất, cực kỳ ngắn gọn, và trọng tâm để đọc: \n${text || ''}`,
        });
        return response.text || '';
      });
      return res.status(200).json({ text: summaryText });
    }

    // 2. Xử lý tác tử chính (PROCESS_TASK)
    const safeSubject = subject || '';
    const safeAgent = agent || '';
    const safeSystemPrompt = systemPrompt || '';
    const safeInput = input || text || '';

    let promptContent = `Môn: ${safeSubject}. Chuyên gia: ${safeAgent}. Yêu cầu: ${safeSystemPrompt}.\nNội dung: ${safeInput}`;
    
    const parts: any[] = [{ text: promptContent }];
    
    // Đính kèm hình ảnh nếu có (Base64)
    if (image) {
      const base64Data = image.includes(',') ? image.split(',')[1] : image;
      parts.unshift({
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Data
        }
      });
    }

    const resultText = await executeWithKeyRotation(safeAgent, async (ai) => {
      let generationConfig: any = { 
        temperature: 0.2, 
        topP: 0.8 
      };

      // Nếu yêu cầu định dạng JSON (Cho Giải nhanh 1S hoặc Luyện Skill)
      if (responseFormat === 'json') {
        generationConfig.responseMimeType = "application/json";
      }

      const response = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: parts,
        config: generationConfig
      });
      
      return response.text || '';
    });

    return res.status(200).json({ text: resultText });

  } catch (error: any) {
    console.error("Lỗi API Server Gemini:", error);
    return res.status(500).json({ 
      error: "Lỗi kết nối máy chủ AI: " + (error?.message || "Không xác định") 
    });
  }
}
