export enum Subject {
  MATH = 'Toán học',
  PHYSICS = 'Vật lí',
  CHEMISTRY = 'Hóa học',
  DIARY = 'Nhật ký'
}

export enum AgentType {
  ORCHESTRATOR = 'Điều phối MAS',  // Tác tử Nhân 1: Bóc tách, chuẩn hóa đề
  GIAI_NHANH_1S = 'Giải nhanh 1S', // Tác tử Nhân 2: Trả đáp án kết quả ngắn gọn
  GIA_SU_AI = 'Gia sư AI',         // Tác tử Nhân 3: Trả lời giải chi tiết Socratic
  LUYEN_SKILL = 'Luyện Skill',     // Tác tử Nhân 4: Trả 2 bài tập tương tự + lời giải gọn
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

export interface UserProfile {
  fullName: string;
  className: string;
  school: string;
  province: string;
}

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
