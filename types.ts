export enum AppMode {
  TRANSLATOR = 'translator',
  INTELLIGENT_CHAT = 'intelligent_chat',
  KNOWLEDGE_BASE = 'knowledge_base'
}

export enum TranslationMode {
  TRANSLATE = 'TRANSLATE',
  TRANSLITERATE = 'TRANSLITERATE'
}

export enum LLMProvider {
  GEMINI = 'Gemini (Google)',
  HUGGING_FACE = 'Mistral (HuggingFace)'
}

export enum ChatPersona {
  GENERAL = 'General Assistant',
  RESEARCHER = 'Academic Researcher',
  CREATIVE = 'Creative Writer',
  ANALYST = 'Data Analyst',
  VISUAL_CREATOR = 'Visual Tool User',
  CUSTOM = 'Custom Identity'
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  sources?: { uri: string; title: string }[]; // For Search Grounding
  provider?: string;
  // Rich Media Attachments
  generatedImage?: string; // Base64
  generatedVideo?: string; // URI
  mapData?: { uri: string; title: string; source: string }[];
}

export interface UploadedFile {
  name: string;
  content: string; // Base64 for binary, Text for text
  mimeType: string;
  isBinary: boolean;
  size: number;
}

export const SUPPORTED_LANGUAGES = [
  { code: 'auto', name: 'Auto-detect' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'hi', name: 'Hindi' },
  { code: 'bn', name: 'Bengali' },
  { code: 'ta', name: 'Tamil' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ru', name: 'Russian' },
  { code: 'ar', name: 'Arabic' },
];

// --- Tier Architecture ---

export enum Tier {
  FREE = 'Free',
  PRO = 'Pro',
  ENTERPRISE = 'Enterprise'
}

export interface TierConfig {
  name: Tier;
  maxFileSizeMB: number;
  allowedMimeTypes: string[]; 
  features: string[];
  color: string;
}

export const TIER_CONFIGS: Record<Tier, TierConfig> = {
  [Tier.FREE]: {
    name: Tier.FREE,
    maxFileSizeMB: 2,
    allowedMimeTypes: ['text/plain', 'application/pdf', 'application/json', 'text/csv', 'text/markdown'],
    features: ['Basic Translation', 'Web Search', 'PDF & Text Support', 'Open Source Models'],
    color: 'bg-gray-500'
  },
  [Tier.PRO]: {
    name: Tier.PRO,
    maxFileSizeMB: 10,
    allowedMimeTypes: ['text/plain', 'application/pdf', 'image/jpeg', 'image/png', 'application/json', 'text/csv', 'text/markdown'],
    features: ['PDF Analysis', 'Truth Guard RAG', 'Image Analysis', 'Gemini Pro'],
    color: 'bg-indigo-600'
  },
  [Tier.ENTERPRISE]: {
    name: Tier.ENTERPRISE,
    maxFileSizeMB: 20,
    allowedMimeTypes: ['text/plain', 'application/pdf', 'image/jpeg', 'image/png', 'text/csv', 'application/json', 'text/markdown', 'text/html'],
    features: ['Priority Processing', 'Maximum Context', 'All File Types', 'Dedicated Support'],
    color: 'bg-amber-500'
  }
};

// --- Vector / RAG Types ---

export interface VectorDocument {
  id: string;
  text: string;
  source: string;
  category: string;
  embedding: number[];
  timestamp: number;
}

export interface KnowledgeNode {
  id: string;
  level: number;
  title: string;
  description: string;
  isIndexed: boolean;
}

// Global Types
declare global {
    interface Window {
        webkitSpeechRecognition: any;
        SpeechRecognition: any;
    }
}