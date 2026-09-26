import { createWorker } from 'tesseract.js';

/**
 * Trích xuất văn bản từ hình ảnh Base64 ngay trên Trình duyệt (Client-side)
 * Tiết kiệm 100% Token hình ảnh gửi lên Gemini API.
 */
export const extractTextFromImageClient = async (base64Image: string): Promise<string> => {
  try {
    const worker = await createWorker('vie+eng');
    const ret = await worker.recognize(base64Image);
    await worker.terminate();
    
    const extractedText = ret.data.text.trim();
    return extractedText || "Không thể trích xuất văn bản từ hình ảnh.";
  } catch (error) {
    console.warn("Lỗi OCR tại máy khách, chuyển sang luồng dự phòng:", error);
    return "";
  }
};
