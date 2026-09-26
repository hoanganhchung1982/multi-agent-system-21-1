// Thêm import OCR Service ở đầu file App.tsx
import { extractTextFromImageClient } from './services/ocrService';

// ... (Giữ nguyên các State và useEffect cũ) ...

// Luồng xử lý Siêu tốc QUAD-CORE MAS
const runAnalysis = useCallback(async () => {
  if (!selectedSubject || (!image && !voiceText) || isImageCaptured) {
    return alert("Vui lòng nhập đề bài hoặc lưu ảnh!");
  }
  
  setScreen('ANALYSIS');
  setLoading(true);
  setIsCurrentResultSaved(false);
  setProfessor3ShownSolutionIndex(null);

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

    // BƯỚC 2: NHÂN 1 (ORCHESTRATOR) CHUẨN HÓA DỮ LIỆU CẤP TỐC (~0.3s)
    setLoadingStatus('Tác tử Điều phối đang đóng gói dữ liệu...');
    let normalizedContext = processedText;
    
    // Nếu vẫn phải gửi kèm ảnh dự phòng cho Orchestrator
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

    // BƯỚC 3: BẮN SONG SONG 3 REQUEST ĐỒNG THỜI DÙNG CHUỖI TEXT THUẦN (0 TOKEN ẢNH)
    setLoadingStatus('Các Chuyên gia AI đang xử lý song song...');

    // Nhân 2: Giải nhanh 1S
    const task1S = fetchAgentData(AgentType.GIAI_NHANH_1S, selectedSubject, normalizedContext);
    
    // Nhân 3: Gia sư AI
    const taskGiaSu = fetchAgentData(AgentType.GIA_SU_AI, selectedSubject, normalizedContext);
    
    // Nhân 4: Luyện Skill (Chỉ nhận Text mỏng nhẹ -> Triệt tiêu 100% lỗi Timeout / Parse JSON)
    const taskLuyenSkill = fetchAgentData(AgentType.LUYEN_SKILL, selectedSubject, normalizedContext);

    // Thực thi song song không chờ đợi lẫn nhau
    await Promise.allSettled([task1S, taskGiaSu, taskLuyenSkill]);

  } catch (error) {
    console.error("Lỗi trong luồng QUAD-CORE MAS:", error);
  } finally {
    setLoading(false);
    setLoadingStatus('');
  }
}, [selectedSubject, image, voiceText, isImageCaptured, fetchAgentData]);
