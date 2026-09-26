// Đường dẫn file: App.tsx
import React, { useState, useRef } from 'react';

type SubjectType = 'TOÁN HỌC' | 'VẬT LÍ' | 'HÓA HỌC' | 'NHẬT KÝ' | null;
type AgentType = 'ĐIỀU PHỐI MAS' | 'GIẢI NHANH 1S' | 'GIA SƯ AI' | 'LUYỆN SKILL';

export default function App() {
  const [selectedSubject, setSelectedSubject] = useState<SubjectType>(null);
  const [activeAgent, setActiveAgent] = useState<AgentType>('GIẢI NHANH 1S');
  const [inputText, setInputText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [responseOutput, setResponseOutput] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chọn ảnh từ thư viện hoặc camera
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Gửi dữ liệu tới API Serverless /api/gemini
  const handleExecute = async () => {
    if (!inputText && !imagePreview) {
      alert('Vui lòng nhập câu hỏi, chụp ảnh hoặc tải ảnh lên!');
      return;
    }

    setLoading(true);
    setResponseOutput(null);

    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: selectedSubject,
          agent: activeAgent,
          input: inputText,
          image: imagePreview,
          action: 'PROCESS_TASK'
        })
      });

      const data = await res.json();
      if (data.error) {
        setResponseOutput(`Lỗi: ${data.error}`);
      } else {
        setResponseOutput(data.text);
      }
    } catch (err: any) {
      setResponseOutput(`Lỗi kết nối hệ thống: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-800 font-sans flex flex-col items-center justify-between p-4">
      
      {/* Header Thương Hiệu */}
      <header className="text-center my-4">
        <h1 className="text-2xl font-black tracking-tight text-slate-900">SYMBIOTIC AI</h1>
        <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase mt-0.5">MULTI AGENT SYSTEMS</p>
        <p className="text-xs italic text-indigo-500 mt-1">Gia sư ảo thông minh của mọi thế hệ học sinh</p>
        
        {selectedSubject && (
          <div className="mt-3 inline-block bg-indigo-50 text-indigo-600 px-4 py-1 rounded-full text-xs font-bold uppercase">
            {selectedSubject}
          </div>
        )}
      </header>

      {/* Thông tin tài khoản */}
      <div className="w-full max-max-w-md bg-slate-50 border border-slate-100 rounded-full px-4 py-2 flex items-center justify-between text-xs mb-6 shadow-sm">
        <div className="flex items-center space-x-2">
          <span className="font-bold text-slate-800">CHUNG (12A)</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500">THPT MAI SƠN - Sơn La</span>
        </div>
        <button className="text-indigo-600 font-bold hover:underline">ĐỔI TÀI KHOẢN</button>
      </div>

      {/* Nội dung chính: Chọn môn học hoặc Giao diện làm bài */}
      <main className="w-full max-w-md flex-1 flex flex-col justify-center">
        {!selectedSubject ? (
          /* Màn hình 4 thẻ môn học chính (Ảnh 2) */
          <div className="grid grid-cols-2 gap-4 my-auto">
            <button
              onClick={() => setSelectedSubject('TOÁN HỌC')}
              className="h-44 bg-indigo-600 hover:bg-indigo-700 text-white rounded-3xl flex flex-col items-center justify-center space-y-3 shadow-lg transition-transform active:scale-95"
            >
              <span className="font-extrabold text-base tracking-wide">TOÁN HỌC</span>
              <span className="text-4xl">📐</span>
            </button>

            <button
              onClick={() => setSelectedSubject('VẬT LÍ')}
              className="h-44 bg-purple-600 hover:bg-purple-700 text-white rounded-3xl flex flex-col items-center justify-center space-y-3 shadow-lg transition-transform active:scale-95"
            >
              <span className="font-extrabold text-base tracking-wide">VẬT LÍ</span>
              <span className="text-4xl">⚛️</span>
            </button>

            <button
              onClick={() => setSelectedSubject('HÓA HỌC')}
              className="h-44 bg-emerald-600 hover:bg-emerald-700 text-white rounded-3xl flex flex-col items-center justify-center space-y-3 shadow-lg transition-transform active:scale-95"
            >
              <span className="font-extrabold text-base tracking-wide">HÓA HỌC</span>
              <span className="text-4xl">🧪</span>
            </button>

            <button
              onClick={() => setSelectedSubject('NHẬT KÝ')}
              className="h-44 bg-amber-600 hover:bg-amber-700 text-white rounded-3xl flex flex-col items-center justify-center space-y-3 shadow-lg transition-transform active:scale-95"
            >
              <span className="font-extrabold text-base tracking-wide">NHẬT KÝ</span>
              <span className="text-4xl">📓</span>
            </button>
          </div>
        ) : (
          /* Màn hình làm bài & chọn Tác tử (Ảnh 3, 4) */
          <div className="flex flex-col flex-1">
            
            {/* Thanh chọn Tác tử MAS (Ảnh 4) */}
            <div className="bg-indigo-600 p-1.5 rounded-2xl flex justify-between items-center text-white mb-4 shadow-md text-3xs font-bold">
              {(['ĐIỀU PHỐI MAS', 'GIẢI NHANH 1S', 'GIA SƯ AI', 'LUYỆN SKILL'] as AgentType[]).map((agent) => (
                <button
                  key={agent}
                  onClick={() => setActiveAgent(agent)}
                  className={`px-2.5 py-2 rounded-xl transition-all ${
                    activeAgent === agent
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-indigo-100 hover:bg-indigo-500'
                  }`}
                >
                  {agent}
                </button>
              ))}
            </div>

            {/* Khung hiển thị nội dung nhập / kết quả */}
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-3xl p-5 min-h-[260px] flex flex-col items-center justify-center text-center relative mb-6">
              {loading ? (
                <div className="flex flex-col items-center justify-center space-y-3">
                  <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-xs font-bold text-indigo-600">ĐANG TẢI DỮ LIỆU TỪ CHUYÊN GIA {activeAgent}...</p>
                </div>
              ) : responseOutput ? (
                <div className="w-full text-left text-xs leading-relaxed text-slate-700 whitespace-pre-wrap max-h-[300px] overflow-y-auto p-2">
                  {responseOutput}
                </div>
              ) : imagePreview ? (
                <div className="relative w-full h-48">
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-contain rounded-xl" />
                  <button
                    onClick={() => setImagePreview(null)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 text-xs"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="space-y-3 w-full">
                  <p className="text-xs font-medium text-slate-400">Vui lòng chụp ảnh, chọn ảnh hoặc nhập câu hỏi...</p>
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Nhập đề bài hoặc thắc mắc tại đây..."
                    className="w-full p-3 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    rows={3}
                  />
                </div>
              )}
            </div>

            {/* Bộ nút công cụ Camera, Thư viện, Ghi âm, Thực hiện (Ảnh 3) */}
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleImageUpload}
              className="hidden"
            />

            <div className="grid grid-cols-4 gap-3 text-center mb-4">
              <button
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.capture = 'environment';
                    fileInputRef.current.click();
                  }
                }}
                className="flex flex-col items-center space-y-1.5"
              >
                <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white text-lg shadow-md active:scale-90 transition-transform">
                  📷
                </div>
                <span className="text-[10px] font-bold tracking-wider text-slate-500">CAMERA</span>
              </button>

              <button
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.removeAttribute('capture');
                    fileInputRef.current.click();
                  }
                }}
                className="flex flex-col items-center space-y-1.5"
              >
                <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white text-lg shadow-md active:scale-90 transition-transform">
                  🖼️
                </div>
                <span className="text-[10px] font-bold tracking-wider text-slate-500">THƯ VIỆN</span>
              </button>

              <button
                onClick={() => alert('Tính năng ghi âm đang kết nối...')}
                className="flex flex-col items-center space-y-1.5"
              >
                <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white text-lg shadow-md active:scale-90 transition-transform">
                  🎙️
                </div>
                <span className="text-[10px] font-bold tracking-wider text-slate-500">GHI ÂM</span>
              </button>

              <button
                onClick={handleExecute}
                className="flex flex-col items-center space-y-1.5"
              >
                <div className="w-12 h-12 bg-indigo-200 rounded-full flex items-center justify-center text-indigo-600 text-lg shadow-md active:scale-90 transition-transform">
                  🚀
                </div>
                <span className="text-[10px] font-bold tracking-wider text-indigo-600">THỰC HIỆN</span>
              </button>
            </div>

            {/* Nút quay lại chọn môn */}
            <button
              onClick={() => {
                setSelectedSubject(null);
                setResponseOutput(null);
                setImagePreview(null);
                setInputText('');
              }}
              className="text-xs text-slate-400 hover:text-slate-600 font-semibold py-2"
            >
              ← Quay lại danh sách môn học
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center my-4">
        <p className="text-[10px] font-extrabold text-slate-700 tracking-wider">
          SYMBIOTIC AI — GIẢI PHÁP CHUYỂN ĐỔI SỐ GIÁO DỤC
        </p>
        <p className="text-[10px] font-bold text-indigo-500 mt-0.5">TRƯỜNG THPT MAI SƠN</p>
      </footer>

    </div>
  );
}
