
import React, { useState, useCallback } from 'react';
import { Subject, AgentType } from './types';
import { extractTextFromImageClient } from './services/ocrService';
import { processTask } from './services/geminiService';

export default function App() {
  const [selectedSubject, setSelectedSubject] = useState<Subject>(Subject.MATH);
  const [image, setImage] = useState<string | null>(null);
  const [voiceText, setVoiceText] = useState('');
  const [isImageCaptured, setIsImageCaptured] = useState(false);
  const [screen, setScreen] = useState<'HOME' | 'ANALYSIS'>('HOME');
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  
  const [allRawResults, setAllRawResults] = useState<Record<string, string>>({});
  const [allAudios, setAllAudios] = useState<Record<string, string>>({});
  const [professor1Result, setProfessor1Result] = useState<any>(null);
  const [professor3QuizResult, setProfessor3QuizResult] = useState<any>(null);
  const [agentProcessingStates, setAgentProcessingStates] = useState<Record<string, string>>({});
  const [userSelectedAnswers, setUserSelectedAnswers] = useState<any[]>([]);
  const [quizFeedback, setQuizFeedback] = useState<any[]>([]);

  // Hàm gọi dữ liệu từng Tác tử độc lập
  const fetchAgentData = useCallback(async (agent: AgentType, subject: Subject, context: string) => {
    try {
      setAgentProcessingStates(prev => ({ ...prev, [agent]: 'loading' }));
      const resText = await processTask(subject, agent, context);
      setAllRawResults(prev => ({ ...prev, [agent]: resText }));
      setAgentProcessingStates(prev => ({ ...prev, [agent]: 'success' }));
      return resText;
    } catch (err) {
      setAgentProcessingStates(prev => ({ ...prev, [agent]: 'error' }));
      console.error(`Lỗi Agent ${agent}:`, err);
    }
  }, []);

  // Luồng xử lý Siêu tốc QUAD-CORE MAS
  const runAnalysis = useCallback(async () => {
    if (!selectedSubject || (!image && !voiceText)) {
      return alert("Vui lòng nhập đề bài hoặc cung cấp hình ảnh!");
    }
    
    setScreen('ANALYSIS');
    setLoading(true);
    setAllRawResults({});
    setAllAudios({});
    setProfessor1Result(null);
    setProfessor3QuizResult(null);
    setAgentProcessingStates({
      [AgentType.GIAI_NHANH_1S]: 'loading',
      [AgentType.GIA_SU_AI]: 'loading',
      [AgentType.LUYEN_SKILL]: 'loading'
    });
    setUserSelectedAnswers([]);
    setQuizFeedback([]);

    try {
      let processedText = voiceText;

      // BƯỚC 1: NẾU CÓ ẢNH -> CHẠY CLIENT OCR TẠI MÁY KHÁCH (0 TOKEN API)
      if (image) {
        setLoadingStatus('Đang quét chữ từ ảnh tại thiết bị...');
        const ocrResult = await extractTextFromImageClient(image);
        if (ocrResult) {
          processedText = `${voiceText ? voiceText + "\n" : ""}${ocrResult}`;
        }
      }

      // BƯỚC 2: NHÂN 1 (ORCHESTRATOR) CHUẨN HÓA DỮ LIỆU CẤP TỐC
      setLoadingStatus('Tác tử Điều phối đang đóng gói dữ liệu...');
      let normalizedContext = processedText;
      
      try {
        const orchestratorRes = await processTask(
          selectedSubject, 
          AgentType.ORCHESTRATOR, 
          processedText || "Hãy bóc tách đề bài từ hình ảnh này.", 
          image || undefined
        );
        if (orchestratorRes) {
          normalizedContext = orchestratorRes;
        }
      } catch (e) {
        console.warn("Orchestrator bỏ qua bước chuẩn hóa, dùng trực tiếp Text đầu vào.");
      }

      // BƯỚC 3: BẮN SONG SONG 3 REQUEST ĐỒNG THỜI
      setLoadingStatus('Các Chuyên gia AI đang xử lý song song...');

      const task1S = fetchAgentData(AgentType.GIAI_NHANH_1S, selectedSubject, normalizedContext);
      const taskGiaSu = fetchAgentData(AgentType.GIA_SU_AI, selectedSubject, normalizedContext);
      const taskLuyenSkill = fetchAgentData(AgentType.LUYEN_SKILL, selectedSubject, normalizedContext);

      await Promise.allSettled([task1S, taskGiaSu, taskLuyenSkill]);

    } catch (error) {
      console.error("Lỗi trong luồng QUAD-CORE MAS:", error);
    } finally {
      setLoading(false);
      setLoadingStatus('');
    }
  }, [selectedSubject, image, voiceText, fetchAgentData]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 flex flex-col items-center justify-center">
      <div className="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h1 className="text-xl font-bold text-blue-400 mb-4 text-center">
          QUAD-CORE MAS-CHUNG ANH (FAST-MAS 4X)
        </h1>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Nội dung đề bài / Câu hỏi:</label>
            <textarea
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500"
              rows={4}
              value={voiceText}
              onChange={(e) => setVoiceText(e.target.value)}
              placeholder="Nhập đề toán hoặc câu hỏi ôn thi tốt nghiệp..."
            />
          </div>

          <button
            onClick={runAnalysis}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white font-medium py-3 rounded-xl transition shadow-lg"
          >
            {loading ? (loadingStatus || 'Đang xử lý hệ thống...') : '🚀 Kích hoạt Phân tích Song song Quad-Core'}
          </button>
        </div>

        {screen === 'ANALYSIS' && (
          <div className="mt-6 border-t border-slate-800 pt-4">
            <h2 className="text-sm font-semibold text-slate-300 mb-2">Trạng thái các Nhân AI:</h2>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="font-semibold text-blue-400">Giải nhanh 1S</div>
                <div>{agentProcessingStates[AgentType.GIAI_NHANH_1S] || 'Chờ...'}</div>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="font-semibold text-emerald-400">Gia sư AI</div>
                <div>{agentProcessingStates[AgentType.GIA_SU_AI] || 'Chờ...'}</div>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="font-semibold text-purple-400">Luyện Skill</div>
                <div>{agentProcessingStates[AgentType.LUYEN_SKILL] || 'Chờ...'}</div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h3 className="text-xs font-bold text-blue-400 mb-1 uppercase">Kết quả Nhân 2 (Giải nhanh):</h3>
                <div className="text-sm whitespace-pre-wrap">{allRawResults[AgentType.GIAI_NHANH_1S] || 'Đang tổng hợp...'}</div>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h3 className="text-xs font-bold text-emerald-400 mb-1 uppercase">Kết quả Nhân 3 (Gia sư Socratic):</h3>
                <div className="text-sm whitespace-pre-wrap">{allRawResults[AgentType.GIA_SU_AI] || 'Đang tổng hợp...'}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
