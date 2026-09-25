// services/imageProcessor.ts

/**
 * Hàm nén ảnh siêu tốc:
 * - Giới hạn kích thước tối đa 900px (đủ nét cho AI đọc toán/văn bản).
 * - Chuyển sang JPEG quality 0.7 (giảm dung lượng còn ~50KB - 100KB).
 * - Tự động loại bỏ Metadata EXIF.
 */
export const compressImage = (
  base64Str: string,
  maxWidth = 900,
  quality = 0.7
): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Tính toán lại kích thước nếu vượt quá maxWidth
      if (width > maxWidth || height > maxWidth) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
      }

      // Xuất ra Base64 định dạng JPEG nén
      const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedBase64);
    };

    img.onerror = () => {
      // Fallback trả về ảnh gốc nếu có lỗi đọc canvas
      resolve(base64Str);
    };
  });
};
