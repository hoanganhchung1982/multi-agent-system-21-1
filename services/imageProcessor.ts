/**
 * Nén ảnh Canvas về chuẩn JPEG <400KB trước khi gửi sang API Gemini
 * @param base64Str Chuỗi Base64 ảnh gốc
 * @param maxWidth Bề rộng tối đa cho phép (Mặc định 1024px)
 */
export const compressImage = (base64Str: string, maxWidth = 1024): Promise<string> => {
  return new Promise((resolve) => {
    // Kiểm tra nếu không phải chuỗi base64 hợp lệ thì trả về nguyên bản
    if (!base64Str || !base64Str.startsWith('data:image')) {
      return resolve(base64Str);
    }

    const img = new Image();
    img.src = base64Str;
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Tính toán tỷ lệ co giãn giữ nguyên khung hình
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return resolve(base64Str);
      }

      // Tô nền trắng tránh lỗi nền đen đối với ảnh PNG trong suốt
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Xuất ảnh dạng JPEG với chất lượng 70% để tối ưu dung lượng
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };

    img.onerror = () => {
      // Nếu lỗi không đọc được ảnh, giữ nguyên chuỗi gốc
      resolve(base64Str);
    };
  });
};