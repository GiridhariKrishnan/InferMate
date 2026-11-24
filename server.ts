import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { GoogleGenAI } from '@google/genai';
import type { Content, Part } from '@google/genai';
import { AGENT_TOOLS, buildAgentManifest, getMcpTools } from './services/agentTools.ts';
import { buildZipBuffer } from './services/zipBuilder.ts';
import type { ZipEntryInput } from './services/zipBuilder.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local as well if present (dotenv/config loads .env by default)
const envLocalPath = path.resolve(__dirname, '.env.local');
if (fs.existsSync(envLocalPath)) {
  const lines = fs.readFileSync(envLocalPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    const val = line.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}

const PORT = Number(process.env.PORT) || 3000;
const MODEL_NAME = 'gemini-3-flash-preview';
const EMBEDDING_MODEL = 'gemini-embedding-2-preview';
const SKILL_NAME = 'infermate-hybrid-intelligence';
const SKILL_DIR = path.resolve(__dirname, 'skills', SKILL_NAME);
const SKILL_MD_PATH = path.resolve(SKILL_DIR, 'SKILL.md');
const SKILL_PACKAGE_FILES: Record<string, { filePath: string; contentType: string }> = {
  'SKILL.md': { filePath: SKILL_MD_PATH, contentType: 'text/markdown; charset=utf-8' },
  'references/api-reference.md': {
    filePath: path.resolve(SKILL_DIR, 'references', 'api-reference.md'),
    contentType: 'text/markdown; charset=utf-8'
  },
  'references/integrations.md': {
    filePath: path.resolve(SKILL_DIR, 'references', 'integrations.md'),
    contentType: 'text/markdown; charset=utf-8'
  },
  'scripts/infermate.mjs': {
    filePath: path.resolve(SKILL_DIR, 'scripts', 'infermate.mjs'),
    contentType: 'application/javascript; charset=utf-8'
  }
};

const MAX_TEXT_LENGTH = 50_000;
const MAX_BASE64_LENGTH = 10_000_000;
const MAX_VECTOR_CHUNKS = 2_000;

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_DOC_MIMES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
]);
const ALLOWED_TASKS = new Set(['summary', 'questions', 'keywords']);
const PERSONA_PROMPTS: Record<string, string> = {
  'General Assistant':
    'You are InferMate AI, a helpful, accurate, and concise general assistant.',
  'Academic Researcher':
    'You are InferMate AI acting as an academic researcher. Cite sources, remain objective, and use formal analytical language.',
  'Creative Writer':
    'You are InferMate AI acting as a creative writer. Be expressive, imaginative, and engaging.',
  'Data Analyst':
    'You are InferMate AI acting as a data analyst. Focus on facts, patterns, and structured outputs.',
  'Custom Identity': 'You are InferMate AI.'
};

interface StoredVectorChunk {
  id: string;
  text: string;
  source: string;
  category: string;
  embedding: number[];
  timestamp: number;
}

class ServerVectorStore {
  private documents: StoredVectorChunk[] = [];

  chunkText(text: string, chunkSize = 500): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      const piece = text.slice(i, i + chunkSize).trim();
      if (piece) chunks.push(piece);
    }
    return chunks;
  }

  cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length === 0 || vecA.length !== vecB.length) return 0;
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      magA += vecA[i] * vecA[i];
      magB += vecB[i] * vecB[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }

  async addDocument(text: string, source: string, category: string): Promise<number> {
    const chunks = this.chunkText(text, 500);
    let successCount = 0;

    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk);
      if (embedding.length > 0) {
        if (this.documents.length >= MAX_VECTOR_CHUNKS) {
          this.documents.shift();
        }
        this.documents.push({
          id: crypto.randomUUID().slice(0, 8),
          text: chunk,
          source,
          category,
          embedding,
          timestamp: Date.now()
        });
        successCount++;
      }
    }
    return successCount;
  }

  async similaritySearch(query: string, topK = 3) {
    if (this.documents.length === 0) return [];
    const queryEmbedding = await getEmbedding(query);
    if (queryEmbedding.length === 0) return [];

    return this.documents
      .map((doc) => ({
        id: doc.id,
        text: doc.text,
        source: doc.source,
        category: doc.category,
        score: Number(this.cosineSimilarity(queryEmbedding, doc.embedding).toFixed(4))
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  getStats() {
    return {
      totalDocuments: this.documents.length,
      categories: [...new Set(this.documents.map((d) => d.category))],
      sources: [...new Set(this.documents.map((d) => d.source))]
    };
  }
}

const serverVectorStore = new ServerVectorStore();

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error('Server GEMINI_API_KEY is not configured.');
  }
  return new GoogleGenAI({ apiKey });
}

async function getEmbedding(text: string): Promise<number[]> {
  const ai = getAiClient();
  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: [{ parts: [{ text }] }]
  });
  return response.embeddings?.[0]?.values || [];
}

function asTrimmedString(value: unknown, maxLen = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

function getBaseUrl(req: Request): string {
  const forwardedProto = req.header('x-forwarded-proto');
  const proto = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol || 'http';
  const host = req.header('x-forwarded-host') || req.header('host') || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function verifyAgentBearer(req: Request, res: Response, next: NextFunction) {
  const configuredKey = process.env.INFERMATE_AGENT_API_KEY;
  if (!configuredKey) {
    return next();
  }

  const authHeader = req.header('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({
      error: 'Unauthorized: missing Bearer token in Authorization header.'
    });
  }

  const providedBuf = Buffer.from(match[1]);
  const expectedBuf = Buffer.from(configuredKey);
  if (
    providedBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return res.status(403).json({
      error: 'Forbidden: invalid agent API key.'
    });
  }

  return next();
}

// --- Core Agent Tool Implementations ---

async function executeTranslate(args: Record<string, unknown>) {
  const text = asTrimmedString(args.text, MAX_TEXT_LENGTH);
  const targetLang = asTrimmedString(args.targetLang, 40);
  const sourceLang = typeof args.sourceLang === 'string' && args.sourceLang.trim()
    ? args.sourceLang.trim().slice(0, 40)
    : 'auto';
  const mode = args.mode === 'TRANSLITERATE' ? 'TRANSLITERATE' : 'TRANSLATE';
  const verbose = Boolean(args.verbose);

  if (!text) {
    throw new HttpError(400, 'Field "text" must be a non-empty string (max 50,000 characters).');
  }
  if (!targetLang) {
    throw new HttpError(400, 'Field "targetLang" is required (e.g. "es", "en", "hi", "ja").');
  }

  const ai = getAiClient();
  let systemInstruction = '';
  if (mode === 'TRANSLITERATE') {
    systemInstruction = `You are a professional Transliteration Engine.
Task: Convert the script of the user input from ${sourceLang === 'auto' ? 'the detected language' : sourceLang} to ${targetLang} script.
Rules:
1. Do NOT translate meaning. Keep the original words phonetically in the target script.
2. Return ONLY the transliterated text.`;
  } else if (verbose) {
    systemInstruction = `You are an expert linguist.
Task: Translate the user input from ${sourceLang === 'auto' ? 'the detected language' : sourceLang} to ${targetLang}.
1. Provide the direct translation first.
2. Then provide alternative meanings, grammar notes, or cultural context.`;
  } else {
    systemInstruction = `You are a professional high-precision translator.
Task: Translate the user input from ${sourceLang === 'auto' ? 'the detected language' : sourceLang} to ${targetLang}.
Rules:
1. Return ONLY the translated text without introductory commentary or enclosing quotes.`;
  }

  const prompt =
    mode === 'TRANSLITERATE'
      ? `Transliterate into ${targetLang} script:\n${text}`
      : `Translate to ${targetLang}:\n${text}`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: { systemInstruction }
  });

  return {
    result: response.text?.trim() || '',
    sourceLang,
    targetLang,
    mode,
    verbose
  };
}

async function executeOcr(args: Record<string, unknown>) {
  const imageBase64 = asTrimmedString(args.imageBase64, MAX_BASE64_LENGTH);
  const mimeType = typeof args.mimeType === 'string' && ALLOWED_IMAGE_MIMES.has(args.mimeType)
    ? args.mimeType
    : 'image/jpeg';

  if (!imageBase64) {
    throw new HttpError(400, 'Field "imageBase64" must be a non-empty base64 string.');
  }

  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: {
      parts: [
        { inlineData: { mimeType, data: imageBase64 } },
        {
          text: 'OCR Task: Extract all text from this image exactly as it appears. Return only the extracted text, no markdown, no commentary.'
        }
      ]
    }
  });

  return {
    text: response.text?.trim() || '',
    mimeType
  };
}

async function executeRagIngest(args: Record<string, unknown>) {
  const text = asTrimmedString(args.text, MAX_TEXT_LENGTH);
  const source =
    typeof args.source === 'string' && args.source.trim()
      ? args.source.trim().slice(0, 200)
      : 'Agent Input';
  const category =
    typeof args.category === 'string' && args.category.trim()
      ? args.category.trim().slice(0, 100)
      : 'Agent Knowledge';

  if (!text) {
    throw new HttpError(400, 'Field "text" must be a non-empty string (max 50,000 characters).');
  }

  const chunksIndexed = await serverVectorStore.addDocument(text, source, category);
  return {
    chunksIndexed,
    source,
    category,
    stats: serverVectorStore.getStats()
  };
}

async function executeRagQuery(args: Record<string, unknown>) {
  const query = asTrimmedString(args.query, 4_000);
  if (!query) {
    throw new HttpError(400, 'Field "query" must be a non-empty string.');
  }
  const rawTopK = typeof args.topK === 'number' ? Math.floor(args.topK) : 3;
  const topK = Math.min(Math.max(rawTopK, 1), 10);
  const generateAnswer = Boolean(args.generateAnswer);

  const matches = await serverVectorStore.similaritySearch(query, topK);

  let answer: string | undefined;
  if (generateAnswer) {
    if (matches.length === 0) {
      answer =
        'No matching documents were found in the Truth Guard Knowledge Base. Ingest relevant context via infermate_rag_ingest first.';
    } else {
      const ai = getAiClient();
      const context = matches
        .map((m, idx) => `[#${idx + 1} | Source: ${m.source} | Score: ${m.score}]\n${m.text}`)
        .join('\n\n');
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Question: ${query}\n\nGrounded Context:\n${context}`,
        config: {
          systemInstruction:
            'You are InferMate Truth Guard. Answer the question strictly using the provided Grounded Context. Cite source names. If the context does not contain the answer, clearly state that.'
        }
      });
      answer = response.text?.trim() || '';
    }
  }

  return {
    query,
    matches,
    ...(answer !== undefined ? { answer } : {})
  };
}

async function executeChat(args: Record<string, unknown>) {
  const message = asTrimmedString(args.message, MAX_TEXT_LENGTH);
  if (!message) {
    throw new HttpError(400, 'Field "message" must be a non-empty string.');
  }

  const personaName =
    typeof args.persona === 'string' && args.persona in PERSONA_PROMPTS
      ? args.persona
      : 'General Assistant';
  const customPersonaInstruction =
    typeof args.customPersonaInstruction === 'string'
      ? args.customPersonaInstruction.trim().slice(0, 4_000)
      : '';
  const useRag = args.useRag !== false;
  const useSearch = Boolean(args.useSearch);

  let systemInstruction = PERSONA_PROMPTS[personaName];
  if (personaName === 'Custom Identity' && customPersonaInstruction) {
    systemInstruction = `You are InferMate AI.\n\n[CUSTOM PERSONA INSTRUCTION]\n${customPersonaInstruction}`;
  }

  let ragMatchesUsed = 0;
  if (useRag) {
    const matches = await serverVectorStore.similaritySearch(message, 3);
    if (matches.length > 0) {
      ragMatchesUsed = matches.length;
      const ragContext = matches
        .map((m) => `Source: ${m.source} (${m.category})\n${m.text}`)
        .join('\n\n');
      systemInstruction += `\n\n[TRUTH GUARD RAG CONTEXT]\n${ragContext}`;
    }
  }

  const apiHistory: Content[] = [];
  if (Array.isArray(args.history)) {
    for (const item of args.history.slice(-20)) {
      if (
        item &&
        typeof item === 'object' &&
        (item.role === 'user' || item.role === 'model') &&
        typeof item.content === 'string' &&
        item.content.trim()
      ) {
        apiHistory.push({
          role: item.role,
          parts: [{ text: item.content.slice(0, 10_000) }]
        });
      }
    }
  }

  const ai = getAiClient();
  const tools = useSearch ? [{ googleSearch: {} }] : undefined;
  let response;
  try {
    const chat = ai.chats.create({
      model: MODEL_NAME,
      config: { systemInstruction, ...(tools ? { tools } : {}) },
      history: apiHistory
    });
    response = await chat.sendMessage({ message });
  } catch (err: unknown) {
    const errObj = err as { status?: number; message?: string };
    if (useSearch && (errObj?.status === 403 || errObj?.message?.includes('PERMISSION_DENIED'))) {
      const fallbackChat = ai.chats.create({
        model: MODEL_NAME,
        config: { systemInstruction },
        history: apiHistory
      });
      response = await fallbackChat.sendMessage({ message });
    } else {
      throw err;
    }
  }
  const sources: { title: string; uri: string }[] = [];
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (Array.isArray(groundingChunks)) {
    for (const chunk of groundingChunks as Array<{ web?: { uri?: string; title?: string } }>) {
      if (chunk.web?.uri) {
        sources.push({
          title: chunk.web.title || 'Web Source',
          uri: chunk.web.uri
        });
      }
    }
  }

  return {
    text: response.text?.trim() || '',
    persona: personaName,
    ragMatchesUsed,
    sources
  };
}

async function executeAnalyzeDocument(args: Record<string, unknown>) {
  const isBinary = Boolean(args.isBinary);
  const content = asTrimmedString(args.content, isBinary ? MAX_BASE64_LENGTH : MAX_TEXT_LENGTH);
  const task = typeof args.task === 'string' ? args.task : '';
  const mimeType =
    typeof args.mimeType === 'string' && ALLOWED_DOC_MIMES.has(args.mimeType)
      ? args.mimeType
      : 'text/plain';

  if (!content) {
    throw new HttpError(400, 'Field "content" must be a non-empty string.');
  }
  if (!ALLOWED_TASKS.has(task)) {
    throw new HttpError(400, 'Field "task" must be one of: "summary", "questions", "keywords".');
  }

  const ai = getAiClient();
  const parts: Part[] = [];
  if (isBinary) {
    parts.push({ inlineData: { mimeType, data: content } });
  } else {
    parts.push({ text: `Document:\n${content}` });
  }
  parts.push({
    text: `Perform task: ${task.toUpperCase()} on the attached document. Return a clear, structured response.`
  });

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: [{ role: 'user', parts }]
  });

  return {
    task,
    result: response.text?.trim() || ''
  };
}

class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function dispatchAgentTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'infermate_translate':
      return executeTranslate(args);
    case 'infermate_ocr':
      return executeOcr(args);
    case 'infermate_rag_ingest':
      return executeRagIngest(args);
    case 'infermate_rag_query':
      return executeRagQuery(args);
    case 'infermate_rag_stats':
      return serverVectorStore.getStats();
    case 'infermate_chat':
      return executeChat(args);
    case 'infermate_analyze_document':
      return executeAnalyzeDocument(args);
    default:
      throw new HttpError(404, `Unknown agent tool: ${name}`);
  }
}

function handleRouteError(res: Response, error: unknown) {
  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  console.error('InferMate Agent Route Error:', error);
  return res.status(500).json({
    error: 'Internal agent execution error. Verify server configuration and try again.'
  });
}

function validateSkillPackage() {
  const checks: { id: string; label: string; passed: boolean; detail: string }[] = [];
  const exists = fs.existsSync(SKILL_MD_PATH);
  checks.push({
    id: 'filename',
    label: 'Exact uppercase SKILL.md filename',
    passed: exists && path.basename(SKILL_MD_PATH) === 'SKILL.md',
    detail: exists ? 'skills/infermate-hybrid-intelligence/SKILL.md found' : 'SKILL.md missing'
  });

  if (!exists) {
    return { valid: false, checks };
  }

  const raw = fs.readFileSync(SKILL_MD_PATH, 'utf8');
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const hasFrontmatter = Boolean(fmMatch);
  checks.push({
    id: 'frontmatter',
    label: 'Valid YAML frontmatter delimiters',
    passed: hasFrontmatter,
    detail: hasFrontmatter ? 'Frontmatter block present' : 'Missing --- YAML frontmatter'
  });

  if (fmMatch) {
    const fmLines = fmMatch[1].split(/\r?\n/);
    const allowedTopLevel = new Set([
      'name',
      'description',
      'license',
      'compatibility',
      'metadata',
      'allowed-tools'
    ]);
    const topKeys: string[] = [];
    const metadataEntries: Record<string, string> = {};
    let currentKey = '';
    let inMetadata = false;
    let compatibilityIsList = false;
    let metadataHasNested = false;
    const scalarValues: Record<string, string> = {};

    for (const line of fmLines) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      if (!line.startsWith(' ') && !line.startsWith('\t')) {
        const idx = line.indexOf(':');
        if (idx > 0) {
          currentKey = line.slice(0, idx).trim();
          topKeys.push(currentKey);
          inMetadata = currentKey === 'metadata';
          const val = line.slice(idx + 1).trim();
          if (val && val !== '>-' && val !== '|' && val !== '>') {
            scalarValues[currentKey] = val.replace(/^["']|["']$/g, '');
          } else {
            scalarValues[currentKey] = '';
          }
        }
      } else if (inMetadata) {
        const trimmed = line.trim();
        const indent = line.length - line.trimStart().length;
        if (indent >= 4) {
          metadataHasNested = true;
        }
        const idx = trimmed.indexOf(':');
        if (idx > 0) {
          const mk = trimmed.slice(0, idx).trim();
          const mv = trimmed.slice(idx + 1).trim();
          if (!mv) metadataHasNested = true;
          metadataEntries[mk] = mv.replace(/^["']|["']$/g, '');
        }
      } else if (currentKey) {
        const trimmed = line.trim();
        if (currentKey === 'compatibility' && trimmed.startsWith('- ')) {
          compatibilityIsList = true;
        }
        scalarValues[currentKey] = `${scalarValues[currentKey] || ''} ${trimmed}`.trim();
      }
    }

    const unknownKeys = topKeys.filter((k) => !allowedTopLevel.has(k));
    checks.push({
      id: 'allowed-keys',
      label: 'Only official Agent Skills frontmatter keys',
      passed: unknownKeys.length === 0,
      detail:
        unknownKeys.length === 0
          ? `Keys: ${topKeys.join(', ')}`
          : `Unsupported keys: ${unknownKeys.join(', ')}`
    });

    const parsedName = scalarValues.name || '';
    const nameRegexOk = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(parsedName) && parsedName.length <= 64;
    const folderMatches = parsedName === path.basename(SKILL_DIR);
    checks.push({
      id: 'name-rule',
      label: 'name format & parent folder match',
      passed: nameRegexOk && folderMatches,
      detail: `name="${parsedName}", folder="${path.basename(SKILL_DIR)}"`
    });

    const desc = scalarValues.description || '';
    checks.push({
      id: 'description-rule',
      label: 'description non-empty (<= 1024 chars)',
      passed: desc.length > 0 && desc.length <= 1024,
      detail: `${desc.length} / 1024 characters`
    });

    const compat = scalarValues.compatibility || '';
    checks.push({
      id: 'compatibility-rule',
      label: 'compatibility is plain string (<= 500 chars)',
      passed: !compatibilityIsList && compat.length <= 500,
      detail: compatibilityIsList
        ? 'Must be string, not YAML array'
        : `${compat.length} / 500 characters`
    });

    checks.push({
      id: 'metadata-rule',
      label: 'metadata is flat string-to-string map',
      passed: !metadataHasNested && Object.keys(metadataEntries).length > 0,
      detail: metadataHasNested
        ? 'Nested objects found in metadata'
        : `${Object.keys(metadataEntries).length} flat string keys`
    });
  }

  const missingAssets = Object.entries(SKILL_PACKAGE_FILES)
    .filter(([, meta]) => !fs.existsSync(meta.filePath))
    .map(([rel]) => rel);
  checks.push({
    id: 'references',
    label: 'Progressive disclosure references & helper script present',
    passed: missingAssets.length === 0,
    detail:
      missingAssets.length === 0
        ? 'api-reference.md, integrations.md, scripts/infermate.mjs verified'
        : `Missing: ${missingAssets.join(', ')}`
  });

  const unwantedFiles = ['migrated_prompt_history', 'bun.lock'].filter((rel) =>
    fs.existsSync(path.resolve(__dirname, rel))
  );
  checks.push({
    id: 'clean-repo',
    label: 'No private prompt logs or lockfile bloat in workspace',
    passed: unwantedFiles.length === 0,
    detail:
      unwantedFiles.length === 0
        ? 'migrated_prompt_history and bun.lock removed'
        : `Found unwanted items: ${unwantedFiles.join(', ')}`
  });

  return {
    valid: checks.every((c) => c.passed),
    skillName: SKILL_NAME,
    directory: `skills/${SKILL_NAME}`,
    checks
  };
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10mb' }));

  // --- Skill Specification & Discovery Routes (Read-only GET) ---
  const serveSkillMarkdown = (_req: Request, res: Response) => {
    try {
      const content = fs.readFileSync(SKILL_MD_PATH, 'utf8');
      res.type('text/markdown; charset=utf-8').send(content);
    } catch (err) {
      console.error('Failed to read SKILL.md:', err);
      res.status(404).type('text/plain').send('SKILL.md not found');
    }
  };

  app.get('/SKILL.md', serveSkillMarkdown);
  app.get('/Skills.md', serveSkillMarkdown);
  app.get('/api/agent/skill', serveSkillMarkdown);

  // Serve allowlisted files inside skills/infermate-hybrid-intelligence/
  app.get(`/skills/${SKILL_NAME}/SKILL.md`, serveSkillMarkdown);
  app.get(`/skills/${SKILL_NAME}/references/:file`, (req, res) => {
    const key = `references/${req.params.file}`;
    const entry = SKILL_PACKAGE_FILES[key];
    if (!entry || !fs.existsSync(entry.filePath)) {
      return res.status(404).type('text/plain').send('Reference file not found');
    }
    return res.type(entry.contentType).send(fs.readFileSync(entry.filePath, 'utf8'));
  });
  app.get(`/skills/${SKILL_NAME}/scripts/:file`, (req, res) => {
    const key = `scripts/${req.params.file}`;
    const entry = SKILL_PACKAGE_FILES[key];
    if (!entry || !fs.existsSync(entry.filePath)) {
      return res.status(404).type('text/plain').send('Script file not found');
    }
    return res.type(entry.contentType).send(fs.readFileSync(entry.filePath, 'utf8'));
  });

  app.get('/api/agent/skill/validate', (_req, res) => {
    res.json(validateSkillPackage());
  });

  // Clean marketplace-ready ZIP download (strictly allowlisted files only)
  app.get('/api/agent/skill/download.zip', (req, res) => {
    try {
      const bundle = req.query.bundle === 'selfhost' ? 'selfhost' : 'skill';
      const entries: ZipEntryInput[] = [];

      // Always include the clean skill package folder
      for (const [relPath, meta] of Object.entries(SKILL_PACKAGE_FILES)) {
        if (fs.existsSync(meta.filePath)) {
          entries.push({
            name: `${SKILL_NAME}/${relPath}`,
            content: fs.readFileSync(meta.filePath)
          });
        }
      }

      // Optional minimal standalone server files (strictly excludes prompt logs, bun.lock, .env*, backend/app.py, huggingFaceService.ts)
      if (bundle === 'selfhost') {
        const selfHostAllowlist = [
          'server.ts',
          'services/agentTools.ts',
          'services/zipBuilder.ts',
          'package.json',
          'tsconfig.json',
          '.env.example',
          'README.md'
        ];
        for (const rel of selfHostAllowlist) {
          const abs = path.resolve(__dirname, rel);
          if (fs.existsSync(abs)) {
            entries.push({
              name: `${SKILL_NAME}-server/${rel}`,
              content: fs.readFileSync(abs)
            });
          }
        }
      }

      const zipBuf = buildZipBuffer(entries);
      const filename =
        bundle === 'selfhost'
          ? `${SKILL_NAME}-selfhost.zip`
          : `${SKILL_NAME}-skill.zip`;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', String(zipBuf.length));
      return res.send(zipBuf);
    } catch (err) {
      console.error('Failed to build skill ZIP:', err);
      return res.status(500).json({ error: 'Could not generate skill ZIP package.' });
    }
  });

  app.get('/api/agent/manifest', (req, res) => {
    res.json(buildAgentManifest(getBaseUrl(req)));
  });

  app.get('/.well-known/agent.json', (req, res) => {
    res.json(buildAgentManifest(getBaseUrl(req)));
  });

  app.get('/api/agent/health', (_req, res) => {
    res.json({
      status: 'operational',
      agent: 'infermate-hybrid-intelligence',
      version: '1.0.0',
      toolsAvailable: AGENT_TOOLS.length,
      authRequired: Boolean(process.env.INFERMATE_AGENT_API_KEY),
      knowledgeBase: serverVectorStore.getStats()
    });
  });

  app.get('/api/agent/rag/stats', (_req, res) => {
    res.json(serverVectorStore.getStats());
  });

  // --- Action Routes (Protected if INFERMATE_AGENT_API_KEY is set) ---
  app.post('/api/agent/translate', verifyAgentBearer, async (req, res) => {
    try {
      const result = await executeTranslate((req.body || {}) as Record<string, unknown>);
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/agent/ocr', verifyAgentBearer, async (req, res) => {
    try {
      const result = await executeOcr((req.body || {}) as Record<string, unknown>);
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/agent/rag/ingest', verifyAgentBearer, async (req, res) => {
    try {
      const result = await executeRagIngest((req.body || {}) as Record<string, unknown>);
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/agent/rag/query', verifyAgentBearer, async (req, res) => {
    try {
      const result = await executeRagQuery((req.body || {}) as Record<string, unknown>);
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/agent/chat', verifyAgentBearer, async (req, res) => {
    try {
      const result = await executeChat((req.body || {}) as Record<string, unknown>);
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/agent/analyze', verifyAgentBearer, async (req, res) => {
    try {
      const result = await executeAnalyzeDocument((req.body || {}) as Record<string, unknown>);
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // --- Streamable HTTP MCP JSON-RPC 2.0 Endpoint ---
  // Stateless Streamable HTTP servers MUST return 405 on GET/DELETE rather than SPA HTML
  app.get('/api/agent/mcp', (_req, res) => {
    res.setHeader('Allow', 'POST');
    res.status(405).json({
      error: 'Method Not Allowed. Send JSON-RPC 2.0 requests via POST /api/agent/mcp.'
    });
  });

  app.delete('/api/agent/mcp', (_req, res) => {
    res.setHeader('Allow', 'POST');
    res.status(405).json({
      error: 'Method Not Allowed. This MCP endpoint is stateless.'
    });
  });

  app.post('/api/agent/mcp', verifyAgentBearer, async (req, res) => {
    const body = req.body as {
      jsonrpc?: string;
      id?: string | number | null;
      method?: string;
      params?: Record<string, unknown>;
    };

    const hasId = body && Object.prototype.hasOwnProperty.call(body, 'id');
    const id = body?.id ?? null;
    if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
      return res.status(400).json({
        jsonrpc: '2.0',
        id,
        error: { code: -32600, message: 'Invalid JSON-RPC 2.0 request.' }
      });
    }

    // Per JSON-RPC 2.0 & MCP Streamable HTTP spec, notifications (no id) return 202 Accepted
    if (!hasId || body.method.startsWith('notifications/')) {
      return res.status(202).end();
    }

    try {
      switch (body.method) {
        case 'initialize':
          return res.json({
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2025-03-26',
              capabilities: { tools: { listChanged: false } },
              serverInfo: {
                name: SKILL_NAME,
                version: '1.0.0'
              }
            }
          });

        case 'ping':
          return res.json({ jsonrpc: '2.0', id, result: {} });

        case 'tools/list':
          return res.json({
            jsonrpc: '2.0',
            id,
            result: {
              tools: getMcpTools()
            }
          });

        case 'tools/call': {
          const params = (body.params || {}) as {
            name?: string;
            arguments?: Record<string, unknown>;
          };
          if (typeof params.name !== 'string') {
            return res.status(400).json({
              jsonrpc: '2.0',
              id,
              error: { code: -32602, message: 'Missing tool name in params.name.' }
            });
          }
          try {
            const toolResult = await dispatchAgentTool(params.name, params.arguments || {});
            return res.json({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }],
                structuredContent: toolResult,
                isError: false
              }
            });
          } catch (toolErr) {
            // Tool execution/validation errors return MCP isError: true so agents can self-correct
            const errMsg =
              toolErr instanceof HttpError ? toolErr.message : 'Tool execution failed.';
            return res.json({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text: errMsg }],
                isError: true
              }
            });
          }
        }

        default:
          return res.status(404).json({
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${body.method}` }
          });
      }
    } catch (err) {
      const message = err instanceof HttpError ? err.message : 'Agent tool invocation failed.';
      const code = err instanceof HttpError && err.statusCode === 400 ? -32602 : -32000;
      return res.status(err instanceof HttpError ? err.statusCode : 500).json({
        jsonrpc: '2.0',
        id,
        error: { code, message }
      });
    }
  });

  // --- Frontend Serving (Vite middleware in dev, dist/ in production) ---
  const distDir = path.resolve(__dirname, 'dist');
  const isDevMode = process.env.VITE_DEV === 'true' || (process.env.NODE_ENV !== 'production' && !fs.existsSync(distDir));

  if (isDevMode) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`InferMate Server & Agent Skill Runtime listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start InferMate server:', err);
  process.exit(1);
});
