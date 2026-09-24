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

const getAPIKeys = (): string[] => {
  const keys: string[] = [];
  
  const hardcodedKey = "AIzaSyDIPttSyT-lj7r97wtFCno6vpF_JSDlzUc";
  if (hardcodedKey && !hardcodedKey.includes("DÁN_API_KEY") && hardcodedKey.startsWith("AIzaSy")) {
    keys.push(hardcodedKey.trim());
  }

  const envKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY;
  if (envKey) {
    keys.push(...envKey.split(',').map(k => k.trim()));
  }

  return Array.from(new Set(keys.filter(k => k && k.length > 0)));
};

async function executeWithKeyRotation(operation: (ai: GoogleGenAI) => Promise<any>): Promise<any> {
  const keys = getAPIKeys();
  if (keys.length === 0) {
    throw new Error("Chưa khai báo GEMINI_API_KEY trong biến môi trường của Vercel!");
  }

  const shuffledKeys = [...keys].sort(() => Math.random() - 0.5);
  let lastError: any = null;

  for (const apiKey of shuffledKeys) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      return await operation(ai);
    } catch (error: any) {
      console.warn(`Key gặp lỗi, đang thử Key khác...`, error?.message);
      lastError = error;
    }
  }

  throw lastError || new Error("Tất cả API Key đều đã gặp lỗi hoặc vượt quá giới hạn.");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { action, subject, agent, input, image, text, systemPrompt } = req.body || {};

  try {
    if (action === 'SUMMARY') {
      const summaryText = await executeWithKeyRotation(async (ai) => {
        const response = await ai.models.generateContent({
          model: TEXT_MODEL,
          contents: `Chỉ trả lời một câu duy nhất, cực kỳ ngắn gọn, và trọng tâm để đọc: \n${text || ''}`,
        });
        return response.text || '';
      });
      return res.status(200).json({ text: summaryText });
    }

    const safeSubject = subject || '';
    const safeAgent = agent || '';
    const safeSystemPrompt = systemPrompt || '';
    const safeInput = input || text || '';

    let promptContent = `Môn: ${safeSubject}. Chuyên gia: ${safeAgent}. Yêu cầu: ${safeSystemPrompt}.\nNội dung: ${safeInput}`;
    
    const parts: any[] = [{ text: promptContent }];
    
    if (image) {
      const base64Data = image.includes(',') ? image.split(',')[1] : image;
      parts.unshift({
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Data
        }
      });
    }

const resultText = await executeWithKeyRotation(async (ai) => {
      // Cấu hình linh hoạt theo từng tác tử để tránh lỗi phản hồi
      let generationConfig: any = { temperature: 0.1, topP: 0.5 };

      if (agent === 'GIAI_NHANH_1S') {
        // Tác tử 1S ưu tiên trả về text rõ ràng, rành mạch cho học sinh
        generationConfig.maxOutputTokens = 2048;
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
