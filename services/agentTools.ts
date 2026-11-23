export interface AgentToolParameterProperty {
  type: string;
  description: string;
  enum?: string[];
  default?: string | number | boolean;
  items?: {
    type: string;
    properties?: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}

export interface AgentToolDefinition {
  name: string;
  title: string;
  description: string;
  httpMethod: 'GET' | 'POST';
  endpoint: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, AgentToolParameterProperty>;
    required: string[];
  };
  sampleInput: Record<string, unknown>;
}

export const AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: 'infermate_translate',
    title: 'Neural Translator & Transliterator',
    description:
      'Translate text between languages or phonetically transliterate scripts (e.g., Hindi to Latin script) with optional linguistic breakdown.',
    httpMethod: 'POST',
    endpoint: '/api/agent/translate',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Source text to translate or transliterate (max 50,000 characters).'
        },
        sourceLang: {
          type: 'string',
          description: 'Source language code (auto, en, es, fr, de, hi, bn, ta, ja, ko, zh, ru, ar).',
          default: 'auto'
        },
        targetLang: {
          type: 'string',
          description: 'Target language code (en, es, fr, de, hi, bn, ta, ja, ko, zh, ru, ar).'
        },
        mode: {
          type: 'string',
          enum: ['TRANSLATE', 'TRANSLITERATE'],
          description: 'TRANSLATE converts meaning; TRANSLITERATE converts script phonetically.',
          default: 'TRANSLATE'
        },
        verbose: {
          type: 'boolean',
          description: 'Include linguistic notes, grammar breakdown, and alternative phrasings.',
          default: false
        }
      },
      required: ['text', 'targetLang']
    },
    sampleInput: {
      text: 'Hello, how can InferMate help your AI agent today?',
      sourceLang: 'en',
      targetLang: 'es',
      mode: 'TRANSLATE',
      verbose: false
    }
  },
  {
    name: 'infermate_ocr',
    title: 'Vision OCR Extractor',
    description: 'Extract exact text from a base64-encoded image using Gemini Vision OCR.',
    httpMethod: 'POST',
    endpoint: '/api/agent/ocr',
    inputSchema: {
      type: 'object',
      properties: {
        imageBase64: {
          type: 'string',
          description: 'Raw base64-encoded image payload without data URI prefix.'
        },
        mimeType: {
          type: 'string',
          enum: ['image/jpeg', 'image/png', 'image/webp'],
          description: 'Image MIME type.',
          default: 'image/jpeg'
        }
      },
      required: ['imageBase64']
    },
    sampleInput: {
      imageBase64: '',
      mimeType: 'image/jpeg'
    }
  },
  {
    name: 'infermate_rag_ingest',
    title: 'Truth Guard™ RAG Ingest',
    description:
      'Chunk, embed with gemini-embedding-2-preview, and store text in the Truth Guard Knowledge Base for grounded semantic retrieval.',
    httpMethod: 'POST',
    endpoint: '/api/agent/rag/ingest',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text content to chunk and vectorize (max 50,000 characters).'
        },
        source: {
          type: 'string',
          description: 'Source document name or citation label.',
          default: 'Agent Input'
        },
        category: {
          type: 'string',
          description: 'Category tag for grouping knowledge.',
          default: 'Agent Knowledge'
        }
      },
      required: ['text']
    },
    sampleInput: {
      text: 'InferMate supports Claude Code Skills, DeepSeek function calling, and Streamable HTTP MCP out of the box using Gemini 3 Flash and gemini-embedding-2-preview.',
      source: 'InferMate Docs',
      category: 'Platform'
    }
  },
  {
    name: 'infermate_rag_query',
    title: 'Truth Guard™ Semantic Search',
    description:
      'Search the Truth Guard Knowledge Base via cosine similarity and optionally synthesize a strictly grounded answer.',
    httpMethod: 'POST',
    endpoint: '/api/agent/rag/query',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Semantic search query or question.'
        },
        topK: {
          type: 'number',
          description: 'Number of top matching chunks to return (1-10).',
          default: 3
        },
        generateAnswer: {
          type: 'boolean',
          description: 'If true, synthesize a concise answer strictly grounded in retrieved chunks.',
          default: true
        }
      },
      required: ['query']
    },
    sampleInput: {
      query: 'Which agent protocols and models does InferMate support?',
      topK: 3,
      generateAnswer: true
    }
  },
  {
    name: 'infermate_rag_stats',
    title: 'Knowledge Base Stats',
    description: 'Return the number of indexed vector chunks, categories, and sources in Truth Guard.',
    httpMethod: 'GET',
    endpoint: '/api/agent/rag/stats',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    },
    sampleInput: {}
  },
  {
    name: 'infermate_chat',
    title: 'Hybrid Intelligent Chat',
    description:
      'Converse with an InferMate persona with optional Truth Guard RAG grounding and live Google Search citations.',
    httpMethod: 'POST',
    endpoint: '/api/agent/chat',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'User or agent prompt.'
        },
        persona: {
          type: 'string',
          enum: [
            'General Assistant',
            'Academic Researcher',
            'Creative Writer',
            'Data Analyst',
            'Custom Identity'
          ],
          description: 'Persona style to apply.',
          default: 'General Assistant'
        },
        customPersonaInstruction: {
          type: 'string',
          description: 'Custom behavior prompt used when persona is Custom Identity.'
        },
        useRag: {
          type: 'boolean',
          description: 'Inject relevant Truth Guard Knowledge Base chunks into context.',
          default: true
        },
        useSearch: {
          type: 'boolean',
          description: 'Enable live Google Search grounding and return web citations.',
          default: false
        },
        history: {
          type: 'array',
          description: 'Optional prior conversation turns.',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', description: 'Turn role', enum: ['user', 'model'] },
              content: { type: 'string', description: 'Turn text content' }
            },
            required: ['role', 'content']
          }
        }
      },
      required: ['message']
    },
    sampleInput: {
      message: 'Give me a 3-bullet comparison of neural translation vs transliteration.',
      persona: 'Academic Researcher',
      useRag: true,
      useSearch: false
    }
  },
  {
    name: 'infermate_analyze_document',
    title: 'Document Intelligence Analyzer',
    description: 'Generate an executive summary, key questions, or keyword list from text or base64 documents.',
    httpMethod: 'POST',
    endpoint: '/api/agent/analyze',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Plain text content or base64-encoded binary document.'
        },
        task: {
          type: 'string',
          enum: ['summary', 'questions', 'keywords'],
          description: 'Analysis operation to run.'
        },
        mimeType: {
          type: 'string',
          description: 'Document MIME type (e.g., text/plain, application/pdf).',
          default: 'text/plain'
        },
        isBinary: {
          type: 'boolean',
          description: 'Set true when content is base64-encoded binary.',
          default: false
        }
      },
      required: ['content', 'task']
    },
    sampleInput: {
      content:
        'InferMate bridges neural translation, vision OCR, Truth Guard RAG, and hybrid LLM chat so both humans and autonomous AI agents can collaborate across languages with grounded citations.',
      task: 'summary',
      mimeType: 'text/plain',
      isBinary: false
    }
  }
];

export function getOpenAIDeepSeekTools() {
  return AGENT_TOOLS.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
    }
  }));
}

export function getClaudeTools() {
  return AGENT_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema
  }));
}

export function getMcpTools() {
  return AGENT_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }));
}

export function buildAgentManifest(baseUrl: string) {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return {
    name: 'infermate-hybrid-intelligence',
    displayName: 'InferMate Hybrid Intelligence Agent',
    version: '1.0.0',
    description:
      'Multimodal agent skill for neural translation, transliteration, vision OCR, Truth Guard RAG, grounded chat, and document analysis.',
    skillUrl: `${cleanBase}/Skills.md`,
    mcpEndpoint: `${cleanBase}/api/agent/mcp`,
    apiBaseUrl: `${cleanBase}/api/agent`,
    authentication: {
      type: 'bearer',
      optionalInPreview: true,
      header: 'Authorization',
      envVar: 'INFERMATE_AGENT_API_KEY'
    },
    endpoints: AGENT_TOOLS.map((t) => ({
      name: t.name,
      title: t.title,
      method: t.httpMethod,
      url: `${cleanBase}${t.endpoint}`
    })),
    formats: {
      claude: getClaudeTools(),
      openai_deepseek: getOpenAIDeepSeekTools(),
      mcp: getMcpTools()
    }
  };
}
