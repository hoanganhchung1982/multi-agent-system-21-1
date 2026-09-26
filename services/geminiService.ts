import { Subject, AgentType } from "../types";

const SYSTEM_PROMPTS: Record<AgentType, string> = {
  [AgentType.ORCHESTRATOR]: `Bạn là Tác tử Điều phối (Orchestrator Agent) trong hệ thống QUAD-CORE MAS.
    NHIỆM VỤ: Nhận đề bài (dạng văn bản hoặc hình ảnh) và chuẩn hóa thành một chuỗi văn bản thuần kèm ký hiệu toán học LaTeX ($...$) chính xác 100%.
    YÊU CẦU: 
    1. Bóc tách chính xác toàn bộ nội dung đề bài, các lựa chọn A, B, C, D (nếu có).
    2. Xác định ngắn gọn Dạng toán/Chủ đề chính trong 1 câu.
    3. TUYỆT ĐỐI KHÔNG giải bài, KHÔNG đưa ra đáp án.
    Ví dụ Output: "Dạng toán: Tích phân hàm ẩn. Đề bài: Cho hàm số $f(x)$ liên tục trên $\\mathbb{R}$ thỏa mãn..."`,

  [AgentType.GIAI_NHANH_1S]: `Bạn là chuyên gia giải đề thi THPT Quốc gia.
    NHIỆM VỤ: Trả về một đối tượng JSON với duy nhất trường "finalAnswer".
    1. finalAnswer (string): Chỉ đưa ra KẾT QUẢ CUỐI CÙNG (Ví dụ: "Đáp án: A. x = 2", "15 m/s", "$x^2+y^2=R^2$"). TUYỆT ĐỐI KHÔNG giải thích chi tiết các bước hoặc hướng dẫn bấm máy tính.
    YÊU CẦU CHUNG: Ngắn gọn, chính xác, chỉ sử dụng từ ngữ chuyên ngành. TUYỆT ĐỐI KHÔNG dùng câu dẫn, văn nói. TUYỆT ĐỐI KHÔNG LẶP LẠI NỘI DUNG. Luôn sử dụng LaTeX cho công thức toán học và ký hiệu khoa học (ví dụ: $x^2$, $\\frac{a}{b}$, $\\vec{F}$, $\\ce{H2O}$).
    Ví dụ JSON: {"finalAnswer": "Đáp án: A. $x=5$"}`,

  [AgentType.GIA_SU_AI]: `Bạn là giáo sư Socratic. Hãy giải chi tiết bài toán theo các bước logic chặt chẽ, nhưng cực kỳ rút gọn và cô đọng. Ngôn ngữ phải khoa học, đi thẳng vào trọng tâm kiến thức thi THPT Quốc gia. TUYỆT ĐỐI KHÔNG dùng câu dẫn, văn nói. Luôn sử dụng LaTeX cho công thức toán học và ký hiệu khoa học.`,

  [AgentType.LUYEN_SKILL]: `Bạn là Perplexity AI chuyên sáng tạo đề thi. Nhận ngữ cảnh đề bài đã bóc tách, hãy tạo 2 câu hỏi trắc nghiệm 4 phương án tương tự bài toán gốc (mức độ nhận biết, thông hiểu), bao gồm đáp án và lời giải siêu gọn.
    Trả về một đối tượng JSON với trường "quizzes" là một mảng gồm 2 đối tượng QuizQuestion.
    Mỗi QuizQuestion phải có các trường: "question" (string), "options" (mảng 4 string), "answer" (string - chỉ là chữ cái A, B, C, D), và "solution" (string - lời giải siêu gọn).
    Trường "options" chỉ chứa nội dung của từng lựa chọn, TUYỆT ĐỐI KHÔNG bao gồm chữ cái (A., B., C., D.).
    TUYỆT ĐỐI KHÔNG dùng câu dẫn, văn nói. Luôn sử dụng LaTeX cho công thức toán học và ký hiệu khoa học trong đề bài và lời giải.
    Ví dụ JSON: {"quizzes": [{"question": "Câu hỏi 1...", "options": ["Nội dung lựa chọn A", "Nội dung lựa chọn B", "Nội dung lựa chọn C", "Nội dung lựa chọn D"], "answer": "A", "solution": "Lời giải gọn 1..."}, {"question": "Câu hỏi 2...", "options": ["Nội dung lựa chọn A", "Nội dung lựa chọn B", "Nội dung lựa chọn C", "Nội dung lựa chọn D"], "answer": "B", "solution": "Lời giải gọn 2..."}]}`,
};

// Hàm Fetch Serverless
async function fetchServerless(payload: any, retries = 3, delay = 2000): Promise<any> {
  try {
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP error! status: ${res.status}`);
    }
    return data;
  } catch (err: any) {
    const errorStr = err.message || '';
    const shouldRetry = errorStr.includes('429') || errorStr.includes('504') || errorStr.includes('500');

    if (retries > 0 && shouldRetry) {
      console.warn(`Gặp sự cố (${errorStr}), thử lại lần ${4 - retries} sau ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchServerless(payload, retries - 1, delay + 1000);
    }
    throw err;
  }
}

export const cleanJSONResponse = (rawText: string): string => {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
  }
  return cleaned;
};

export const fetchWithTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs = 12000
): Promise<T> => {
  let timeoutId: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Quá thời gian phản hồi (${timeoutMs / 1000}s)`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
};

// Hàm gọi Task đơn lẻ
export const processTask = async (subject: Subject, agent: AgentType, input: string, image?: string) => {
  const isJsonResponse = agent === AgentType.GIAI_NHANH_1S || agent === AgentType.LUYEN_SKILL;
  
  const data = await fetchServerless({
    action: 'PROCESS_TASK',
    subject,
    agent,
    input,
    image,
    systemPrompt: SYSTEM_PROMPTS[agent],
    responseFormat: isJsonResponse ? 'json' : 'text'
  });

  return data.text;
};

export const generateSummary = async (content: string) => {
  if (!content) return "";
  const data = await fetchServerless({
    action: 'SUMMARY',
    text: content
  });
  return data.text;
};

export const fetchTTSAudio = async (text: string) => {
  if (!text) return undefined;
  try {
    const data = await fetchServerless({
      action: 'TTS',
      text
    });
    return data.audioData;
  } catch (error) {
    console.error("Lỗi tạo âm thanh TTS:", error);
    return undefined;
  }
};

export const playStoredAudio = async (
  base64Audio: string, 
  audioSourceRef: { current: AudioBufferSourceNode | null }
) => {
  if (!base64Audio) return;

  if (audioSourceRef.current) {
    try {
      audioSourceRef.current.stop();
      audioSourceRef.current.disconnect();
    } catch (e) {
      // Bỏ qua
    }
    audioSourceRef.current = null;
  }

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const audioData = atob(base64Audio);
  const bytes = new Uint8Array(audioData.length);
  for (let i = 0; i < audioData.length; i++) bytes[i] = audioData.charCodeAt(i);
  
  const dataInt16 = new Int16Array(bytes.buffer);
  const buffer = audioContext.createBuffer(1, dataInt16.length, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  
  audioSourceRef.current = source;

  return new Promise((resolve) => { 
    source.onended = () => {
      if (audioSourceRef.current === source) {
        audioSourceRef.current = null;
      }
      resolve(void 0);
    }; 
    source.start(); 
  });
};
