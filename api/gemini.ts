import { GoogleGenAI, Type, Modality } from "@google/genai";

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

const TEXT_MODEL = 'gemini-3.8-flash';
const TTS_MODEL = 'gemini-3.1-flash-tts-preview';

// Lấy danh sách API Key từ file .env.local hoặc biến môi trường

const getAPIKeys = (): string[] => {
  const keys: string[] = [];
  
  // Dán trực tiếp API Key dự phòng (bắt đầu bằng AIzaSy...) nếu cần:
  const hardcodedKey = "AIzaSyDIPttSyT-lj7r97wtFCno6vpF_JSDlzUc";
  
  if (hardcodedKey && !hardcodedKey.includes("DÁN_API_KEY") && hardcodedKey.startsWith("AIzaSy")) {
    keys.push(hardcodedKey.trim());
  }

  // Đọc từ biến môi trường (nếu có)
  const envKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY;
  if (envKey) {
    keys.push(...envKey.split(',').map(k => k.trim()));
  }

  return Array.from(new Set(keys.filter(k => k && k.length > 0)));
};


// Hàm thực thi với cơ chế tự động xoay vòng Key
async function executeWithKeyRotation(operation: (ai: GoogleGenAI) => Promise<any>): Promise<any> {
  const keys = getAPIKeys();
  if (keys.length === 0) {
    throw new Error("Chưa khai báo GEMINI_API_KEY trong file .env.local hoặc biến môi trường server!");
  }

  const shuffledKeys = [...keys].sort(() => Math.random() - 0.5);
  let lastError: any = null;

  for (const apiKey of shuffledKeys) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      return await operation(ai);
    } catch (error: any) {
      console.warn(`Key (${apiKey.substring(0, 6)}...) bị hạn chế lượt gọi, đang đổi sang Key dự phòng...`);
      lastError = error;
      
      const isRateLimit = error?.status === 429 || JSON.stringify(error).includes('429') || JSON.stringify(error).includes('RESOURCE_EXHAUSTED');
      if (!isRateLimit) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Tất cả API Key đều đã vượt quá giới hạn lượt gọi.");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { action, subject, agent, input, image, text, systemPrompt } = req.body || {};

  try {
    // 1. Xử lý TTS
    if (action === 'TTS') {
      const audioData = await executeWithKeyRotation(async (ai) => {
        const response = await ai.models.generateContent({
          model: TTS_MODEL,
          contents: text || '',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          },
        });
        return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      });
      return res.status(200).json({ audioData });
    }

    // 2. Xử lý SUMMARY
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

    // 3. Chuẩn hóa chuỗi Prompt
    const safeSubject = subject || '';
    const safeAgent = agent || '';
    const safeSystemPrompt = systemPrompt || '';
    const safeInput = input || text || '';

    let promptContent = `Môn: ${safeSubject}. Chuyên gia: ${safeAgent}. Yêu cầu: ${safeSystemPrompt}.\nNội dung: ${safeInput}`;
    
    // Mảng parts chuẩn của Google Gen AI SDK
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

    // 4. Gọi xử lý theo từng loại Tác tử
    const resultText = await executeWithKeyRotation(async (ai) => {
      if (agent === 'GIAI_NHANH_1S') {
        const response = await ai.models.generateContent({
          model: TEXT_MODEL,
          contents: parts, // Truyền trực tiếp mảng parts
          config: { 
            temperature: 0.1, 
            topP: 0.5,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                finalAnswer: { type: Type.STRING, description: 'Kết quả cuối cùng của bài toán.' }
              },
              required: ["finalAnswer"]
            }
          }
        });
        return response.text || '{}';
      } else if (agent === 'LUYEN_SKILL') {
        const response = await ai.models.generateContent({
          model: TEXT_MODEL,
          contents: parts,
          config: {
            temperature: 0.1,
            topP: 0.5,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                quizzes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      question: { type: Type.STRING },
                      options: { type: Type.ARRAY, items: { type: Type.STRING } },
                      answer: { type: Type.STRING },
                      solution: { type: Type.STRING }
                    },
                    required: ["question", "options", "answer", "solution"]
                  }
                }
              },
              required: ["quizzes"]
            }
          }
        });
        return response.text || '{}';

      } else {
        const response = await ai.models.generateContent({
          model: TEXT_MODEL,
          contents: parts,
          config: { temperature: 0.1, topP: 0.5 }
        });
        return response.text || '';
      }
    });

    return res.status(200).json({ text: resultText });

  } catch (error: any) {
    console.error("Lỗi API Server Gemini:", error);
    return res.status(500).json({ 
      error: "Lỗi kết nối máy chủ AI: " + (error?.message || "Không xác định") 
    });
  }
}