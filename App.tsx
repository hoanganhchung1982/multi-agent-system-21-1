import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Subject, AgentType, Professor1Result, Professor3QuizResult, QuizQuestion, UserProfile, DiaryEntry } from './types';
import { Layout } from './components/Layout';
import { processTask, fetchTTSAudio, playStoredAudio, generateSummary } from './services/geminiService';
import { compressImage } from './services/imageProcessor';

// Thay thế URL Web App Google Apps Script của bạn vào đây khi triển khai
const GOOGLE_SHEET_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxiyXqRez46ieiWJcaJiy_siEThYgiDCf7fNgST3Zky8KOdNSyGy5G4Tzt2rsCHqL8Ajw/exec";

// Hàm xử lý và bóc tách JSON an toàn từ phản hồi của AI
const parseJsonSafely = <T,>(jsonString: string): T | null => {
  try {
    let cleaned = jsonString.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
    return JSON.parse(cleaned) as T;
  } catch (e) {
    console.error('Lỗi parse JSON:', e, 'Dữ liệu gốc:', jsonString);
    return null;
  }
};

// Chuẩn hóa chữ cái đáp án (A, B, C, D)
const normalizeAnswerLetter = (ans: string): string => {
  if (!ans) return '';
  const trimmed = ans.trim().toUpperCase();
  return trimmed.charAt(0);
};

const AgentLogo = React.memo(({ type, active }: { type: AgentType, active: boolean }) => {
  const cls = `w-3.5 h-3.5 ${active ? 'text-blue-600' : 'text-white'} transition-colors duration-300`;
  switch (type) {
    case AgentType.GIAI_NHANH_1S: 
      return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M13 10V3L4 14H11V21L20 10H13Z" /></svg>;
    case AgentType.GIA_SU_AI: 
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
    case AgentType.LUYEN_SKILL: 
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
    default: 
      return null;
  }
});

const App: React.FC = () => {
  // User Registration State
  const [user, setUser] = useState<UserProfile | null>(null);
  const [form, setForm] = useState<UserProfile>({
    fullName: '',
    className: '',
    school: '',
    province: 'Sơn La'
  });
  const [isRegistering, setIsRegistering] = useState(false);

  // App Navigation States
  const [screen, setScreen] = useState<'HOME' | 'INPUT' | 'ANALYSIS' | 'DIARY'>('HOME');
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentType>(AgentType.GIAI_NHANH_1S);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');

  // Results State
  const [allRawResults, setAllRawResults] = useState<Partial<Record<AgentType, string>>>({});
  const [allAudios, setAllAudios] = useState<Partial<Record<AgentType, string>>>({});
  const [professor1Result, setProfessor1Result] = useState<Professor1Result | null>(null);
  const [professor3QuizResult, setProfessor3QuizResult] = useState<Professor3QuizResult | null>(null);
  const [agentProcessingStates, setAgentProcessingStates] = useState<Partial<Record<AgentType, 'loading' | 'error' | null>>>({});

  // Quiz Interaction State
  const [userSelectedAnswers, setUserSelectedAnswers] = useState<(string | null)[]>([]);
  const [quizFeedback, setQuizFeedback] = useState<('correct' | 'incorrect' | null)[]>([]);
  const [professor3ShownSolutionIndex, setProfessor3ShownSolutionIndex] = useState<number | null>(null);

  // Inputs & Camera
  const [image, setImage] = useState<string | null>(null);
  const [voiceText, setVoiceText] = useState('');
  const [capturedImagePreview, setCapturedImagePreview] = useState<string | null>(null);
  const [isImageCaptured, setIsImageCaptured] = useState<boolean>(false);
  const [showCamera, setShowCamera] = useState(false);
  const [isCounting, setIsCounting] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [isRecording, setIsRecording] = useState(false);

  // Diary & Audio
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [isCurrentResultSaved, setIsCurrentResultSaved] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const agents = Object.values(AgentType);

  // Initial Load (User profile & Local History)
  useEffect(() => {
    const savedUser = localStorage.getItem('symbiotic_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    const savedDiary = localStorage.getItem('symbiotic_diary');
    if (savedDiary) setDiaryEntries(JSON.parse(savedDiary));
  }, []);

  useEffect(() => {
    if (showSaveSuccess) {
      const timer = setTimeout(() => setShowSaveSuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [showSaveSuccess]);

  useEffect(() => {
    return () => {
      if (audioSourceRef.current) {
        audioSourceRef.current.stop();
        audioSourceRef.current.disconnect();
        audioSourceRef.current = null;
        setIsSpeaking(false);
      }
    };
  }, [screen, selectedAgent]);

  // Handle Registration Submit
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName || !form.className || !form.school || !form.province) {
      alert("Vui lòng điền đầy đủ thông tin ghi danh!");
      return;
    }

    setIsRegistering(true);
    try {
      if (GOOGLE_SHEET_WEB_APP_URL && GOOGLE_SHEET_WEB_APP_URL !== "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL") {
        fetch(GOOGLE_SHEET_WEB_APP_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        }).catch(err => console.error("Lỗi đồng bộ Sheets:", err));
      }

      localStorage.setItem('symbiotic_user', JSON.stringify(form));
      setUser(form);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRegistering(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('symbiotic_user');
    localStorage.removeItem('user');
  };

  const resetAppState = useCallback(() => {
    setAllRawResults({});
    setAllAudios({});
    setProfessor1Result(null);
    setProfessor3QuizResult(null);
    setAgentProcessingStates({});
    setUserSelectedAnswers([]);
    setQuizFeedback([]);
    setImage(null);
    setVoiceText('');
    setCapturedImagePreview(null);
    setIsImageCaptured(false);
    setSelectedAgent(AgentType.GIAI_NHANH_1S);
    setLoading(false);
    setLoadingStatus('');
    setIsCurrentResultSaved(false);
  }, []);

  const handleSubjectSelect = useCallback((sub: Subject) => {
    resetAppState();
    if (sub === Subject.DIARY) {
      setSelectedSubject(null);
      setScreen('DIARY');
    } else {
      setSelectedSubject(sub);
      setScreen('INPUT');
    }
  }, [resetAppState]);

  const startCamera = useCallback(async () => {
    setImage(null);
    setVoiceText('');
    setCapturedImagePreview(null);
    setIsImageCaptured(false);
    setIsCurrentResultSaved(false);

    setShowCamera(true); 
    setIsCounting(true); 
    setCountdown(3);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch { 
      setShowCamera(false); 
      setIsCounting(false);
      alert("Không thể truy cập camera. Vui lòng kiểm tra quyền truy cập.");
    }
  }, []);

  useEffect(() => {
    if (isCounting && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (isCounting && countdown === 0) {
      if (videoRef.current && canvasRef.current) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        canvasRef.current.getContext('2d')?.drawImage(videoRef.current, 0, 0);
        
        const rawBase64 = canvasRef.current.toDataURL('image/jpeg', 0.9);
        compressImage(rawBase64).then((compressed) => {
          setCapturedImagePreview(compressed);
          setIsImageCaptured(true);
        });
        
        (videoRef.current.srcObject as MediaStream)?.getTracks().forEach(t => t.stop());
        setShowCamera(false); 
        setIsCounting(false);
      }
    }
  }, [isCounting, countdown]);

  const toggleRecording = useCallback(() => {
    setImage(null);
    setCapturedImagePreview(null);
    setIsImageCaptured(false);
    setIsCurrentResultSaved(false);

    if (isRecording) {
      recognitionRef.current?.stop();
    } else {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) return alert("Trình duyệt không hỗ trợ nhận diện giọng nói!");
      const r = new SR(); 
      r.lang = 'vi-VN';
      r.onstart = () => setIsRecording(true);
      r.onend = () => setIsRecording(false);
      r.onerror = () => setIsRecording(false);
      r.onresult = (e: any) => {
        const text = e.results[0][0].transcript;
        setVoiceText(text);
        setImage(null);
        setIsCurrentResultSaved(false);
      };
      recognitionRef.current = r; 
      r.start();
    }
  }, [isRecording]);

  const handleRetakePhoto = useCallback(() => {
    setCapturedImagePreview(null);
    setIsImageCaptured(false);
    startCamera();
  }, [startCamera]);

  const handleSaveCapturedPhoto = useCallback(() => {
    if (capturedImagePreview) {
      setImage(capturedImagePreview);
      setVoiceText('');
      setCapturedImagePreview(null);
      setIsImageCaptured(false);
      setIsCurrentResultSaved(false);
    }
  }, [capturedImagePreview]);

  const fetchAgentData = useCallback(async (agent: AgentType, sub: Subject, text: string, img?: string) => {
    setAgentProcessingStates(prev => ({ ...prev, [agent]: 'loading' }));
    setAllRawResults(prev => ({ ...prev, [agent]: '' }));
    if (agent === AgentType.GIAI_NHANH_1S) setProfessor1Result(null);
    if (agent === AgentType.LUYEN_SKILL) {
      setProfessor3QuizResult(null);
      setUserSelectedAnswers([]);
      setQuizFeedback([]);
    }
    setAllAudios(prev => ({ ...prev, [agent]: '' }));

    try {
      const res = await processTask(sub, agent, text, img);
      setAllRawResults(prev => ({ ...prev, [agent]: res }));

      let contentForTTSAndSummary = res;

      if (agent === AgentType.GIAI_NHANH_1S) {
        const parsed = parseJsonSafely<Professor1Result>(res);
        if (parsed && parsed.finalAnswer) {
          setProfessor1Result(parsed);
          contentForTTSAndSummary = parsed.finalAnswer; 
        } else {
          setAgentProcessingStates(prev => ({ ...prev, [agent]: 'error' }));
          setAllRawResults(prev => ({ ...prev, [agent]: `Lỗi phân tích kết quả từ chuyên gia ${agent}. Vui lòng thử lại.` }));
          setProfessor1Result(null);
          return;
        }
      } else if (agent === AgentType.LUYEN_SKILL) {
        const parsed = parseJsonSafely<Professor3QuizResult>(res);
        if (parsed && parsed.quizzes) {
          setProfessor3QuizResult(parsed);
          setUserSelectedAnswers(new Array(parsed.quizzes.length).fill(null));
          setQuizFeedback(new Array(parsed.quizzes.length).fill(null));

          if (parsed.quizzes.length > 0) {
            contentForTTSAndSummary = `Bài tập tương tự thứ nhất: ${parsed.quizzes[0].question}`;
          } else {
            contentForTTSAndSummary = `Chuyên gia ${agent} đã tạo ra các bài tập tương tự.`;
          }
        } else {
          setAgentProcessingStates(prev => ({ ...prev, [agent]: 'error' }));
          setAllRawResults(prev => ({ ...prev, [agent]: `Lỗi phân tích kết quả từ chuyên gia ${agent}. Vui lòng thử lại.` }));
          setProfessor3QuizResult(null);
          return;
        }
      }
      
      if (contentForTTSAndSummary && contentForTTSAndSummary.trim()) {
        const summary = await generateSummary(contentForTTSAndSummary);
        if (summary) {
          fetchTTSAudio(summary).then(audio => { 
            if (audio) setAllAudios(prev => ({ ...prev, [agent]: audio })); 
          });
        }
      }
      setAgentProcessingStates(prev => ({ ...prev, [agent]: null }));

    } catch (e: any) {
      setAgentProcessingStates(prev => ({ ...prev, [agent]: 'error' }));
      setAllRawResults(prev => ({ ...prev, [agent]: `Chuyên gia ${agent} hiện đang bận hoặc có lỗi xảy ra. Vui lòng thử lại.` }));
      if (agent === AgentType.GIAI_NHANH_1S) setProfessor1Result(null);
      if (agent === AgentType.LUYEN_SKILL) setProfessor3QuizResult(null);
    }
  }, []); 

  const runAnalysis = useCallback(async () => {
    if (!selectedSubject || (!image && !voiceText) || isImageCaptured) {
        return alert("Vui lòng nhập đề bài hoặc lưu ảnh!");
    }
    
    setScreen('ANALYSIS');
    setLoading(true);
    setLoadingStatus('Đang gửi yêu cầu đến các Chuyên gia AI...');
    setIsCurrentResultSaved(false);
    setProfessor3ShownSolutionIndex(null);

    setAllRawResults({});
    setAllAudios({});
    setProfessor1Result(null);
    setProfessor3QuizResult(null);
    setAgentProcessingStates({});
    setUserSelectedAnswers([]);
    setQuizFeedback([]);

    const agentPromises = agents.map(agent => 
        fetchAgentData(agent, selectedSubject, voiceText, image || undefined)
    );

    await Promise.allSettled(agentPromises);
    
    setLoading(false);
    setLoadingStatus('');
  }, [selectedSubject, image, voiceText, isImageCaptured, fetchAgentData, agents]);

  const handleSaveToDiary = useCallback(() => {
    if (!selectedSubject || !allRawResults[selectedAgent] || isCurrentResultSaved) return;

    let resultContentToSave: string;
    let professor3QuizzesToSave: Professor3QuizResult | undefined = undefined;

    if (selectedAgent === AgentType.GIAI_NHANH_1S && professor1Result) {
      resultContentToSave = professor1Result.finalAnswer;
    } else if (selectedAgent === AgentType.LUYEN_SKILL && professor3QuizResult) {
      resultContentToSave = `Đã tạo ${professor3QuizResult.quizzes.length} bài tập tương tự.`;
      professor3QuizzesToSave = professor3QuizResult;
    } else {
      resultContentToSave = allRawResults[selectedAgent]!;
    }

    const studentInfoStr = user ? `${user.fullName} (${user.className} - ${user.school})` : undefined;

    const newEntry: DiaryEntry = {
      date: new Date().toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      subject: selectedSubject,
      agentType: selectedAgent,
      input: voiceText || "Hình ảnh",
      image: image || undefined,
      resultContent: resultContentToSave,
      studentInfo: studentInfoStr,
      professor3Quizzes: professor3QuizzesToSave,
    };

    const updatedDiary = [newEntry, ...diaryEntries];
    setDiaryEntries(updatedDiary);
    localStorage.setItem('symbiotic_diary', JSON.stringify(updatedDiary));
    setShowSaveSuccess(true);
    setIsCurrentResultSaved(true);
  }, [selectedSubject, allRawResults, selectedAgent, isCurrentResultSaved, professor1Result, professor3QuizResult, voiceText, image, diaryEntries, user]);

  const handleQuizOptionSelect = useCallback((quizIndex: number, selectedOptionLetter: string, correctAnswer: string) => {
    if (userSelectedAnswers[quizIndex] !== null) return;

    const normalizedCorrect = normalizeAnswerLetter(correctAnswer);
    const normalizedSelected = normalizeAnswerLetter(selectedOptionLetter);

    const newSelectedAnswers = [...userSelectedAnswers];
    newSelectedAnswers[quizIndex] = selectedOptionLetter;
    setUserSelectedAnswers(newSelectedAnswers);

    const newQuizFeedback = [...quizFeedback];
    newQuizFeedback[quizIndex] = (normalizedSelected === normalizedCorrect) ? 'correct' : 'incorrect';
    setQuizFeedback(newQuizFeedback);
  }, [userSelectedAnswers, quizFeedback]);

  // Màn hình Ghi danh ban đầu
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-8 border border-slate-100 animate-in fade-in duration-500">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">SYMBIOTIC AI</h1>
            <p className="text-xs font-bold text-indigo-600 tracking-wider uppercase mt-1">MULTI AGENT SYSTEMS</p>
            <p className="text-xs text-slate-400 mt-2">Gia sư ảo thông minh - Gian hàng Chuyển đổi số</p>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1">Họ và tên học sinh</label>
              <input
                type="text"
                placeholder="Ví dụ: Nguyễn Văn A"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                value={form.fullName}
                onChange={e => setForm({ ...form, fullName: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1">Lớp</label>
                <input
                  type="text"
                  placeholder="Ví dụ: 12A1"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                  value={form.className}
                  onChange={e => setForm({ ...form, className: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1">Tỉnh / Thành phố</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Sơn La"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                  value={form.province}
                  onChange={e => setForm({ ...form, province: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1">Trường THPT</label>
              <input
                type="text"
                placeholder="Ví dụ: THPT Mai Sơn"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                value={form.school}
                onChange={e => setForm({ ...form, school: e.target.value })}
                required
              />
            </div>

            <button
              type="submit"
              disabled={isRegistering}
              className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl text-sm transition-all shadow-lg shadow-indigo-200 active:scale-95"
            >
              {isRegistering ? 'Đang kết nối hệ thống...' : '🚀 BẮT ĐẦU TRẢI NGHIỆM'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <Layout 
      onBack={() => {
        if (screen === 'ANALYSIS') {
          setScreen('INPUT');
          setProfessor1Result(null); 
          setProfessor3QuizResult(null);
          setAgentProcessingStates({});
          setUserSelectedAnswers([]); 
          setQuizFeedback([]);        
        }
        else if (screen === 'INPUT' || screen === 'DIARY') setScreen('HOME');
      }}
      title={screen !== 'HOME' ? (selectedSubject || (screen === 'DIARY' ? 'Nhật ký học tập' : '')) : undefined}
    >
      {/* User Info Toolbar */}
      <div className="flex justify-between items-center mb-4 bg-slate-50 px-4 py-2.5 rounded-2xl border border-slate-200/80 text-xs font-medium text-slate-600 shadow-sm">
        <div className="flex items-center space-x-2 truncate">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
          <span className="font-bold text-slate-800">{user.fullName} ({user.className})</span>
          <span className="text-slate-300">|</span>
          <span className="truncate">{user.school} - {user.province}</span>
        </div>
        <button onClick={handleLogout} className="text-indigo-600 hover:underline font-bold text-[10px] uppercase tracking-wider ml-2 whitespace-nowrap">
          Đổi tài khoản
        </button>
      </div>

      {screen === 'HOME' && (
        <div className="grid grid-cols-2 gap-4 mt-2 animate-in fade-in duration-500">
          {[
            { name: Subject.MATH, color: 'bg-indigo-600', icon: '📐' },
            { name: Subject.PHYSICS, color: 'bg-violet-600', icon: '⚛️' },
            { name: Subject.CHEMISTRY, color: 'bg-emerald-600', icon: '🧪' },
            { name: Subject.DIARY, color: 'bg-amber-600', icon: '📔' },
          ].map((sub) => (
            <button key={sub.name} onClick={() => handleSubjectSelect(sub.name as Subject)} className={`${sub.color} aspect-square rounded-[2rem] flex flex-col items-center justify-center text-white shadow-xl active:scale-95 transition-all`}>
              <span className="text-lg font-black mb-2 uppercase tracking-tight">{sub.name}</span>
              <span className="text-5xl">{sub.icon}</span>
            </button>
          ))}
        </div>
      )}

      {screen === 'INPUT' && (
        <div className="space-y-10 animate-in fade-in duration-500">
          <div className="w-full aspect-[16/10] bg-blue-50/70 rounded-[2.5rem] flex items-center justify-center overflow-hidden border-2 border-blue-100 relative shadow-inner">
            {showCamera ? (
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            ) : capturedImagePreview ? (
              <img src={capturedImagePreview} className="p-4 h-full object-contain" alt="Ảnh đã chụp" />
            ) : image ? (
              <img src={image} className="p-4 h-full object-contain" alt="Ảnh đề bài" />
            ) : (
              <div className="p-10 text-center text-blue-900 font-bold text-sm leading-relaxed">{voiceText || "Vui lòng chụp ảnh hoặc ghi âm đề bài..."}</div>
            )}
            {isCounting && <div className="absolute inset-0 flex items-center justify-center text-7xl font-black text-white drop-shadow-lg">{countdown}</div>}
          </div>
          
          <div className="flex justify-between items-end px-4">
            {isImageCaptured ? (
              <>
                <div className="flex flex-col items-center group">
                  <button onClick={handleRetakePhoto} className="w-16 h-16 rounded-3xl bg-red-500 text-white shadow-lg active:scale-90 flex items-center justify-center hover:bg-red-600 transition-colors" aria-label="Chụp lại">
                    <span className="text-2xl">🔄</span>
                  </button>
                  <span className="text-[10px] font-black uppercase mt-3 text-red-500 opacity-60 group-hover:opacity-100">Chụp lại</span>
                </div>
                <div className="flex flex-col items-center group">
                  <button onClick={handleSaveCapturedPhoto} className="w-16 h-16 rounded-3xl bg-emerald-500 text-white shadow-lg active:scale-90 flex items-center justify-center hover:bg-emerald-600 transition-colors" aria-label="Lưu ảnh">
                    <span className="text-2xl">✅</span>
                  </button>
                  <span className="text-[10px] font-black uppercase mt-3 text-emerald-500 opacity-60 group-hover:opacity-100">Lưu</span>
                </div>
              </>
            ) : (
              <>
                {[
                  { l: 'Camera', i: '📸', a: startCamera }, 
                  { l: 'Thư viện', i: '🖼️', a: () => fileInputRef.current?.click() }, 
                  { l: isRecording ? 'Dừng' : 'Ghi âm', i: isRecording ? '⏹️' : '🎙️', a: () => toggleRecording() }
                ].map((it) => (
                  <div key={it.l} className="flex flex-col items-center group">
                    <button onClick={it.a} className="w-16 h-16 rounded-3xl bg-blue-600 text-white shadow-lg active:scale-90 flex items-center justify-center hover:bg-blue-700 transition-colors" aria-label={it.l}>
                      <span className="text-2xl">{it.i}</span>
                    </button>
                    <span className="text-[10px] font-black uppercase mt-3 text-blue-600 opacity-60 group-hover:opacity-100">{it.l}</span>
                  </div>
                ))}
                <div className="flex flex-col items-center group">
                  <button onClick={runAnalysis} disabled={(!image && !voiceText) || isImageCaptured} className="w-16 h-16 rounded-3xl bg-blue-600 text-white shadow-lg active:scale-90 flex items-center justify-center hover:bg-blue-700 transition-colors disabled:opacity-30 disabled:pointer-events-none" aria-label="Thực hiện">
                    <span className="text-2xl">🚀</span>
                  </button>
                  <span className="text-[10px] font-black uppercase mt-3 text-blue-600 opacity-60 group-hover:opacity-100">Thực hiện</span>
                </div>
              </>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />
          <input type="file" ref={fileInputRef} onChange={(e) => {
            const f = e.target.files?.[0]; 
            if (f) { 
              const r = new FileReader(); 
              r.onload = (e) => {
                const rawBase64 = e.target?.result as string;
                compressImage(rawBase64).then((compressed) => {
                  setImage(compressed);
                  setVoiceText('');
                  setIsCurrentResultSaved(false);
                  setCapturedImagePreview(null);
                  setIsImageCaptured(false);
                });
              }; 
              r.readAsDataURL(f); 
            }
          }} className="hidden" accept="image/*" />
        </div>
      )}

      {screen === 'ANALYSIS' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="flex items-center justify-center bg-blue-600 p-2 rounded-2xl shadow-lg text-white">
            <div className="flex flex-grow-0 flex-shrink-0 gap-0.5 justify-center">
              {agents.map((ag) => (
                <button 
                  key={ag} 
                  onClick={() => { setSelectedAgent(ag); setProfessor3ShownSolutionIndex(null); }} 
                  className={`flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl text-[8px] font-black uppercase transition-all whitespace-nowrap 
                    ${selectedAgent === ag ? 'bg-white text-blue-600 shadow-sm' : 'text-blue-100 hover:bg-blue-500'}
                  `}
                >
                  <AgentLogo type={ag} active={selectedAgent === ag} />
                  <span>{ag}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm relative min-h-[500px]">
            {agentProcessingStates[selectedAgent] === 'loading' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-[10px] font-black uppercase text-blue-500 tracking-widest">
                  Đang tải dữ liệu từ chuyên gia {selectedAgent}...
                </p>
              </div>
            ) : agentProcessingStates[selectedAgent] === 'error' ? (
              <p className="text-red-500 italic text-center p-8">
                {allRawResults[selectedAgent] || `Không thể tải kết quả từ chuyên gia ${selectedAgent}.`}
              </p>
            ) : (
              <div className="space-y-8">
                <div className="space-y-4">
                  <div className="flex justify-between items-center relative">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{selectedAgent} - KẾT QUẢ</span>
                    <div className="flex items-center gap-2">
                      {showSaveSuccess && (
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full animate-in fade-in">
                              Đã lưu vào Nhật ký!
                          </span>
                      )}
                      <button 
                          onClick={handleSaveToDiary}
                          disabled={!allRawResults[selectedAgent] || isCurrentResultSaved}
                          className="flex items-center gap-1.5 p-2 bg-blue-50 text-blue-600 rounded-full disabled:opacity-20 transition-all active:scale-90"
                          aria-label={isCurrentResultSaved ? "Đã lưu vào Nhật ký" : "Lưu vào Nhật ký"}
                      >
                          {isCurrentResultSaved ? (
                              <>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                                  <span className="text-xs font-bold">Đã lưu</span>
                              </>
                          ) : (
                              <>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                  <span className="text-xs font-bold">Lưu nhật ký</span>
                              </>
                          )}
                      </button>
                      <button 
                          onClick={async () => {
                              if (allAudios[selectedAgent]) {
                                  setIsSpeaking(true);
                                  await playStoredAudio(allAudios[selectedAgent]!, audioSourceRef);
                                  setIsSpeaking(false);
                              }
                          }} 
                          disabled={!allAudios[selectedAgent] || isSpeaking} 
                          className="p-2 bg-blue-50 text-blue-600 rounded-full disabled:opacity-20 transition-all active:scale-90"
                          aria-label="Đọc kết quả"
                      >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                      </button>
                    </div>
                  </div>
                  <div className="prose prose-slate max-w-none text-sm math-font">
                    {selectedAgent === AgentType.GIAI_NHANH_1S && professor1Result ? (
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {professor1Result.finalAnswer}
                      </ReactMarkdown>
                    ) : selectedAgent === AgentType.LUYEN_SKILL && professor3QuizResult && professor3QuizResult.quizzes.length > 0 ? (
                      professor3QuizResult.quizzes.map((q: QuizQuestion, qIndex: number) => (
                        <div key={qIndex} className="bg-amber-50/50 p-4 mt-4 rounded-2xl border-l-4 border-amber-500 shadow-sm">
                            <h4 className="text-xs font-black uppercase text-amber-600 mb-1 flex items-center gap-2">
                                Bài tập tương tự {qIndex + 1}
                                {quizFeedback[qIndex] === 'correct' && <span className="text-emerald-500">✅</span>}
                                {quizFeedback[qIndex] === 'incorrect' && <span className="text-red-500">❌</span>}
                            </h4>
                            <div className="font-bold text-slate-800 mb-2">
                              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                {q.question}
                              </ReactMarkdown>
                            </div>
                            <div className="grid gap-2">
                            {q.options.map((o: string, oIndex: number) => {
                                const optionLetter = String.fromCharCode(65 + oIndex);
                                const isSelected = normalizeAnswerLetter(userSelectedAnswers[qIndex] || '') === optionLetter;
                                const isCorrectAnswer = normalizeAnswerLetter(q.answer) === optionLetter;
                                
                                let optionClasses = `w-full text-left px-4 py-3 rounded-xl border text-xs font-bold transition-all `;

                                if (userSelectedAnswers[qIndex] !== null) {
                                    optionClasses += `cursor-not-allowed `;
                                    if (isSelected && !isCorrectAnswer) {
                                        optionClasses += `bg-red-100 border-red-500 text-red-700 `;
                                    } else if (isCorrectAnswer) {
                                        optionClasses += `bg-emerald-100 border-emerald-500 text-emerald-700 `;
                                    } else {
                                        optionClasses += `bg-slate-50 border-slate-200 text-slate-500 `;
                                    }
                                } else {
                                    optionClasses += `bg-white border-slate-200 text-slate-800 hover:bg-blue-50 hover:border-blue-300 cursor-pointer `;
                                }

                                return (
                                <button 
                                  key={oIndex} 
                                  onClick={() => handleQuizOptionSelect(qIndex, optionLetter, q.answer)}
                                  disabled={userSelectedAnswers[qIndex] !== null}
                                  className={optionClasses}
                                >
                                    <span className="opacity-70 mr-2 font-black">{optionLetter}.</span> 
                                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                      {o}
                                    </ReactMarkdown>
                                </button>
                                );
                            })}
                            </div>
                            <div className="mt-4 flex flex-col gap-2">
                              <button 
                                onClick={() => setProfessor3ShownSolutionIndex(professor3ShownSolutionIndex === qIndex ? null : qIndex)}
                                className="px-4 py-2 bg-blue-100 text-blue-700 rounded-xl text-xs font-bold transition-colors hover:bg-blue-200 active:scale-95"
                              >
                                {professor3ShownSolutionIndex === qIndex ? 'Ẩn lời giải' : 'Hiện lời giải'}
                              </button>
                              {professor3ShownSolutionIndex === qIndex && (
                                <div className="bg-blue-50/50 p-3 rounded-xl border-l-4 border-blue-500">
                                  <h5 className="text-[9px] font-black uppercase text-blue-600 mb-1">Đáp án: {q.answer}</h5>
                                  <div className="prose prose-slate max-w-none text-xs math-font">
                                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                      {q.solution}
                                    </ReactMarkdown>
                                  </div>
                                </div>
                              )}
                            </div>
                        </div>
                      ))
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {allRawResults[selectedAgent] || ''}
                      </ReactMarkdown>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Màn hình Nhật ký Học tập */}
      {screen === 'DIARY' && (
        <div className="space-y-4 animate-in fade-in duration-500">
          {diaryEntries.length === 0 ? (
            <div className="text-center py-12 text-slate-400 font-medium text-sm">
              Chưa có nhật ký nào được lưu tại thiết bị này.
            </div>
          ) : (
            diaryEntries.map((item, idx) => (
              <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3">
                <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400">
                  <span className="text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">{item.subject} - {item.agentType}</span>
                  <span>{item.date}</span>
                </div>
                
                {item.studentInfo && (
                  <div className="text-xs font-bold text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                    👤 Học sinh: {item.studentInfo}
                  </div>
                )}

                {item.image && (
                  <img src={item.image} className="max-h-40 rounded-xl border object-contain" alt="Đề bài" />
                )}
                
                <p className="text-xs font-medium text-slate-500">
                  <strong className="text-slate-700">Đề bài:</strong> {item.input}
                </p>

                <div className="bg-slate-50 p-3 rounded-xl text-xs math-font prose max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {item.resultContent}
                  </ReactMarkdown>

                  {item.professor3Quizzes && item.professor3Quizzes.quizzes && item.professor3Quizzes.quizzes.length > 0 && (
                    <div className="mt-3 space-y-3 pt-3 border-t border-slate-200">
                      {item.professor3Quizzes.quizzes.map((quiz, qIdx) => (
                        <div key={qIdx} className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                          <p className="font-bold text-slate-800 mb-1">
                            Bài {qIdx + 1}: {quiz.question}
                          </p>
                          <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600 my-1">
                            {quiz.options.map((opt, oIdx) => (
                              <div key={oIdx}>
                                <strong>{String.fromCharCode(65 + oIdx)}.</strong> {opt}
                              </div>
                            ))}
                          </div>
                          <p className="text-[10px] text-emerald-600 font-bold mt-1">
                            Đáp án: {quiz.answer}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Layout>
  );
};

export default App;
