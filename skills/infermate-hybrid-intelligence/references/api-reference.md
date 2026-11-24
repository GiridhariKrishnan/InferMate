# InferMate API & MCP Reference

## Discovery Endpoints

| Endpoint | Method | Description |
| :--- | :---: | :--- |
| `/SKILL.md` | `GET` | Canonical Agent Skill Markdown (`skills/infermate-hybrid-intelligence/SKILL.md`). |
| `/api/agent/manifest` | `GET` | Machine-readable tool schemas in `claude`, `openai_deepseek`, and `mcp` formats. |
| `/.well-known/agent.json` | `GET` | Agent Card discovery metadata. |
| `/api/agent/health` | `GET` | Service status, tool count, auth mode, and Knowledge Base statistics. |
| `/api/agent/mcp` | `POST` | Streamable HTTP MCP JSON-RPC 2.0 endpoint (`initialize`, `ping`, `tools/list`, `tools/call`). |

## Authentication, Keys & Outbound Hosts

### Required Permissions (`env_vars` & `network`)
- **`INFERMATE_BASE_URL`** *(client)*: URL of the running InferMate server.
- **`INFERMATE_AGENT_API_KEY`** *(optional, client + server)*: When configured on the server, all `POST /api/agent/*` and `POST /api/agent/mcp` calls require:
  ```http
  Authorization: Bearer <INFERMATE_AGENT_API_KEY>
  ```
- **`GEMINI_API_KEY`** *(required if self-hosting `server.ts`)*: User's own Google Gemini API key (`generativelanguage.googleapis.com`).
- **`HF_API_KEY`** *(optional, if using `backend/app.py` or `services/huggingFaceService.ts`)*: User's own Hugging Face API token (`api-inference.huggingface.co`).

### Clean Package Downloads
- `GET /api/agent/skill/download.zip?bundle=skill` — Downloads the standalone `infermate-hybrid-intelligence/` skill folder only (recommended for marketplace submission).
- `GET /api/agent/skill/download.zip?bundle=selfhost` — Downloads the skill folder plus minimal standalone `server.ts` runtime (excludes prompt history, lockfiles, and optional Hugging Face proxy).

---

## Tool Schemas

### 1. `infermate_translate` — `POST /api/agent/translate`

Request JSON:
```json
{
  "text": "Good morning, how is the project going?",
  "sourceLang": "en",
  "targetLang": "es",
  "mode": "TRANSLATE",
  "verbose": false
}
```
- `text` *(string, required, max 50,000 chars)*
- `sourceLang` *(string, default `"auto"`)*: `auto`, `en`, `es`, `fr`, `de`, `hi`, `bn`, `ta`, `ja`, `ko`, `zh`, `ru`, `ar`
- `targetLang` *(string, required)*
- `mode` *(string, default `"TRANSLATE"`)*: `"TRANSLATE"` or `"TRANSLITERATE"`
- `verbose` *(boolean, default `false`)*: Adds grammar notes and alternatives.

Response JSON:
```json
{
  "result": "Buenos días, ¿cómo va el proyecto?",
  "sourceLang": "en",
  "targetLang": "es",
  "mode": "TRANSLATE",
  "verbose": false
}
```

---

### 2. `infermate_ocr` — `POST /api/agent/ocr`

Request JSON:
```json
{
  "imageBase64": "<raw-base64-without-data-uri-prefix>",
  "mimeType": "image/jpeg"
}
```
- `mimeType`: `"image/jpeg"`, `"image/png"`, or `"image/webp"` (max 10 MB base64).

Response JSON:
```json
{
  "text": "Extracted text from image",
  "mimeType": "image/jpeg"
}
```

---

### 3. `infermate_rag_ingest` — `POST /api/agent/rag/ingest`

Request JSON:
```json
{
  "text": "InferMate Truth Guard embeds chunks using gemini-embedding-2-preview.",
  "source": "Architecture Notes",
  "category": "Engineering"
}
```

Response JSON:
```json
{
  "chunksIndexed": 1,
  "source": "Architecture Notes",
  "category": "Engineering",
  "stats": {
    "totalDocuments": 1,
    "categories": ["Engineering"],
    "sources": ["Architecture Notes"]
  }
}
```

---

### 4. `infermate_rag_query` — `POST /api/agent/rag/query`

Request JSON:
```json
{
  "query": "Which embedding model does Truth Guard use?",
  "topK": 3,
  "generateAnswer": true
}
```
- `topK` *(integer 1–10, default `3`)*
- `generateAnswer` *(boolean, default `false`)*

Response JSON:
```json
{
  "query": "Which embedding model does Truth Guard use?",
  "matches": [
    {
      "id": "a1b2c3d4",
      "source": "Architecture Notes",
      "category": "Engineering",
      "score": 0.9124,
      "text": "InferMate Truth Guard embeds chunks using gemini-embedding-2-preview."
    }
  ],
  "answer": "Truth Guard uses gemini-embedding-2-preview (Source: Architecture Notes)."
}
```

---

### 5. `infermate_rag_stats` — `GET /api/agent/rag/stats`

Response JSON:
```json
{
  "totalDocuments": 1,
  "categories": ["Engineering"],
  "sources": ["Architecture Notes"]
}
```

---

### 6. `infermate_chat` — `POST /api/agent/chat`

Request JSON:
```json
{
  "message": "Summarize key risks in this rollout.",
  "persona": "Data Analyst",
  "useRag": true,
  "useSearch": false,
  "history": [
    { "role": "user", "content": "Prior question" },
    { "role": "model", "content": "Prior answer" }
  ]
}
```
- `persona`: `"General Assistant"`, `"Academic Researcher"`, `"Creative Writer"`, `"Data Analyst"`, `"Custom Identity"`
- `customPersonaInstruction` *(string, optional)*: Used when `persona` is `"Custom Identity"`.

Response JSON:
```json
{
  "text": "...",
  "persona": "Data Analyst",
  "ragMatchesUsed": 1,
  "sources": []
}
```

---

### 7. `infermate_analyze_document` — `POST /api/agent/analyze`

Request JSON:
```json
{
  "content": "Document text or base64 payload",
  "task": "summary",
  "mimeType": "text/plain",
  "isBinary": false
}
```
- `task`: `"summary"`, `"questions"`, or `"keywords"`.

Response JSON:
```json
{
  "task": "summary",
  "result": "..."
}
```

---

## Streamable HTTP MCP Protocol (`POST /api/agent/mcp`)

Supported JSON-RPC 2.0 methods:
- `initialize` — Returns `protocolVersion: "2025-03-26"`, `capabilities: { tools: { listChanged: false } }`, and `serverInfo`.
- `notifications/initialized` — Returns `202 Accepted`.
- `ping` — Returns `{}`.
- `tools/list` — Returns all 7 tools with MCP `inputSchema`.
- `tools/call` — Executes `params.name` with `params.arguments` and returns `content` + `structuredContent`.
