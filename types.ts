export enum Subject {
  MATH = 'Toán học',
  PHYSICS = 'Vật lí',
  CHEMISTRY = 'Hóa học',
  DIARY = 'Nhật ký'
}

export enum AgentType {
  GIAI_NHANH_1S = 'Giải nhanh 1S', // Trả đáp án kết quả ngắn gọn
  GIA_SU_AI = 'Gia sư AI',         // Trả lời giải chi tiết Socratic
  LUYEN_SKILL = 'Luyện Skill',     // Trả 2 bài tập tương tự + lời giải gọn
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answer: string;
  solution: string;
}

export interface Professor3QuizResult {
  quizzes: QuizQuestion[];
}

export interface Professor1Result {
  finalAnswer: string;
}

export interface AnalysisResult {
  content: string;
  mindMap: string;
}

export type InputMode = 'CAMERA' | 'GALLERY' | 'VOICE';

// Kiểu dữ liệu cho Màn hình Ghi danh học sinh
export interface UserProfile {
  fullName: string;
  className: string;
  school: string;
  province: string;
}

// Kiểu dữ liệu cho Nhật ký học tập cá nhân hóa tại máy
export interface DiaryEntry {
  date: string;
  subject: Subject;
  agentType: AgentType;
  input: string;
  image?: string;
  resultContent: string;
  studentInfo?: string;
  professor3Quizzes?: Professor3QuizResult;
}