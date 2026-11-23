---
name: infermate-hybrid-intelligence
description: >-
  Hybrid-intelligence agent skill providing Neural Translation & Transliteration,
  Vision OCR, Truth Guard™ RAG knowledge indexing & semantic retrieval,
  persona-driven Intelligent Chat with Google Search grounding, and structured
  Document Analysis via REST API and Streamable HTTP MCP.
version: "1.0.0"
license: MIT
compatibility:
  - claude-code
  - claude-desktop
  - claude-api
  - deepseek-api
  - openai-agents
  - mcp-streamable-http
  - cursor
  - cline
metadata:
  author: InferMate
  platform: InferMate Hybrid Intelligence Platform
  api_base: /api/agent
  mcp_endpoint: /api/agent/mcp
  manifest_endpoint: /api/agent/manifest
  models:
    reasoning_and_translation: gemini-3-flash-preview
    embeddings: gemini-embedding-2-preview
---

# InferMate Agent Skill (`Skills.md`)

**InferMate** is a multimodal Hybrid Intelligence agent service that external LLMs and coding/workflow agents (Claude, DeepSeek, ChatGPT/OpenAI, Cursor, Cline, LangChain, CrewAI, or custom agents) can call as a toolset for cross-lingual communication, OCR, grounded RAG memory, and document intelligence.

---

## When to Use This Skill

Invoke InferMate tools whenever a user request involves any of the following:

1. **Translation or Script Transliteration**: Converting text between languages (`en`, `es`, `fr`, `de`, `hi`, `bn`, `ta`, `ja`, `ko`, `zh`, `ru`, `ar`, or `auto`), optionally with linguistic/grammar notes (`verbose: true`), or converting writing systems phonetically without changing meaning (`mode: "TRANSLITERATE"`, e.g., `"नमस्ते"` -> `"Namaste"`).
2. **Image OCR**: Extracting exact text from a base64-encoded image (`image/png`, `image/jpeg`, `image/webp`) using cloud vision.
3. **Truth Guard™ RAG Memory**: Storing domain documents, notes, or translated texts into a vector store (`gemini-embedding-2-preview`) and retrieving top-K semantically similar chunks or grounded answers.
4. **Grounded Hybrid Chat**: Asking research, analytical, creative, or custom-persona questions optionally augmented with live Google Search grounding and/or Truth Guard™ RAG context.
5. **Document Analysis**: Extracting executive summaries, study/review questions, or structured keywords from raw text or base64 documents.

---

## Base URL & Authentication

Set the base URL to your running InferMate instance:

```bash
export INFERMATE_BASE_URL="http://localhost:3000"
# Or your deployed URL, e.g.:
# export INFERMATE_BASE_URL="https://your-infermate-app.run.app"
```

### Optional API Key Protection
If the server operator configures `INFERMATE_AGENT_API_KEY` in the server environment, every `POST /api/agent/*` request must include:

```http
Authorization: Bearer <INFERMATE_AGENT_API_KEY>
```

If `INFERMATE_AGENT_API_KEY` is not set on the server, `/api/agent/*` endpoints are open for local/preview agent testing.

---

## Discovery Endpoints

| Endpoint | Method | Purpose |
| :--- | :---: | :--- |
| `/Skills.md` (or `/SKILL.md`) | `GET` | Raw Markdown specification (this file) for agent context ingestion. |
| `/api/agent/manifest` | `GET` | Machine-readable tool schemas in **Claude Tool Use**, **DeepSeek/OpenAI Function Calling**, and **MCP** formats. |
| `/.well-known/agent.json` | `GET` | Standard Agent Card discovery metadata. |
| `/api/agent/health` | `GET` | Service status, available tool count, and Knowledge Base vector count. |
| `/api/agent/mcp` | `POST` | JSON-RPC 2.0 Streamable HTTP MCP endpoint (`initialize`, `tools/list`, `tools/call`). |

---

## Tool Reference & HTTP Endpoints

### 1. `infermate_translate`
Translate text between languages or transliterate scripts phonetically.

- **HTTP**: `POST /api/agent/translate`
- **Parameters**:
  - `text` *(string, required)*: Source text to translate or transliterate (max 50,000 chars).
  - `sourceLang` *(string, optional, default `"auto"`)*: Language code (`auto`, `en`, `es`, `fr`, `de`, `hi`, `bn`, `ta`, `ja`, `ko`, `zh`, `ru`, `ar`).
  - `targetLang` *(string, required)*: Target language code (e.g. `es`, `en`, `hi`, `ja`).
  - `mode` *(string, optional, default `"TRANSLATE"`)*: `"TRANSLATE"` or `"TRANSLITERATE"`.
  - `verbose` *(boolean, optional, default `false`)*: Include linguistic breakdown, alternatives, and grammar notes.

**Example:**
```bash
curl -s -X POST "$INFERMATE_BASE_URL/api/agent/translate" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Good morning, how is the project going?",
    "sourceLang": "en",
    "targetLang": "es",
    "mode": "TRANSLATE",
    "verbose": false
  }'
```

**Response:**
```json
{
  "result": "Buenos días, ¿cómo va el proyecto?",
  "sourceLang": "en",
  "targetLang": "es",
  "mode": "TRANSLATE"
}
```

---

### 2. `infermate_ocr`
Extract exact text from an image using Gemini Vision OCR.

- **HTTP**: `POST /api/agent/ocr`
- **Parameters**:
  - `imageBase64` *(string, required)*: Raw base64 string (without `data:...;base64,` prefix).
  - `mimeType` *(string, optional, default `"image/jpeg"`)*: `"image/jpeg"`, `"image/png"`, or `"image/webp"`.

**Response:**
```json
{
  "text": "Extracted text from the image"
}
```

---

### 3. `infermate_rag_ingest`
Chunk, embed (`gemini-embedding-2-preview`), and index text into the Truth Guard™ Knowledge Base.

- **HTTP**: `POST /api/agent/rag/ingest`
- **Parameters**:
  - `text` *(string, required)*: Document text to index (max 50,000 chars).
  - `source` *(string, optional, default `"Agent Input"`)*: Source label or title.
  - `category` *(string, optional, default `"Agent Knowledge"`)*: Logical category tag.

**Example:**
```bash
curl -s -X POST "$INFERMATE_BASE_URL/api/agent/rag/ingest" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "InferMate Truth Guard uses cosine similarity over gemini-embedding-2-preview vectors.",
    "source": "Architecture Notes",
    "category": "Engineering"
  }'
```

**Response:**
```json
{
  "chunksIndexed": 1,
  "source": "Architecture Notes",
  "category": "Engineering",
  "stats": { "totalDocuments": 1, "categories": ["Engineering"], "sources": ["Architecture Notes"] }
}
```

---

### 4. `infermate_rag_query`
Run semantic cosine-similarity search against Truth Guard™ vectors, optionally generating a strictly grounded answer.

- **HTTP**: `POST /api/agent/rag/query`
- **Parameters**:
  - `query` *(string, required)*: Search question or semantic query.
  - `topK` *(integer, optional, default `3`, range `1-10`)*: Number of matching chunks to return.
  - `generateAnswer` *(boolean, optional, default `false`)*: If `true`, synthesizes a concise answer strictly grounded in retrieved chunks.

**Response:**
```json
{
  "query": "How does Truth Guard search?",
  "matches": [
    { "id": "abc123", "source": "Architecture Notes", "category": "Engineering", "score": 0.89, "text": "..." }
  ],
  "answer": "Truth Guard uses cosine similarity over gemini-embedding-2-preview vectors."
}
```

---

### 5. `infermate_rag_stats`
Inspect the current state of the Truth Guard™ vector store.

- **HTTP**: `GET /api/agent/rag/stats`
- **Response:**
```json
{
  "totalDocuments": 4,
  "categories": ["Engineering", "User Translation"],
  "sources": ["Architecture Notes"]
}
```

---

### 6. `infermate_chat`
Run persona-driven Intelligent Chat with optional Truth Guard™ RAG context and Google Search grounding.

- **HTTP**: `POST /api/agent/chat`
- **Parameters**:
  - `message` *(string, required)*: User/agent prompt.
  - `persona` *(string, optional, default `"General Assistant"`)*: One of `"General Assistant"`, `"Academic Researcher"`, `"Creative Writer"`, `"Data Analyst"`, `"Custom Identity"`.
  - `customPersonaInstruction` *(string, optional)*: System instructions when `persona` is `"Custom Identity"`.
  - `useRag` *(boolean, optional, default `true`)*: Automatically inject relevant Truth Guard™ chunks.
  - `useSearch` *(boolean, optional, default `false`)*: Enable live Google Search grounding and return source citations.
  - `history` *(array, optional)*: Prior turns `[{ "role": "user" | "model", "content": "..." }]`.

**Response:**
```json
{
  "text": "Grounded response text...",
  "persona": "Academic Researcher",
  "ragMatchesUsed": 2,
  "sources": [{ "title": "Example", "uri": "https://example.com" }]
}
```

---

### 7. `infermate_analyze_document`
Extract structured intelligence (`summary`, `questions`, or `keywords`) from text or base64 documents.

- **HTTP**: `POST /api/agent/analyze`
- **Parameters**:
  - `content` *(string, required)*: Plain text or base64 content.
  - `task` *(string, required)*: `"summary"`, `"questions"`, or `"keywords"`.
  - `mimeType` *(string, optional, default `"text/plain"`)*: MIME type (e.g. `"text/plain"`, `"application/pdf"`, `"image/png"`).
  - `isBinary` *(boolean, optional, default `false`)*: Set `true` when `content` is base64-encoded binary.

---

## MCP (Model Context Protocol) JSON-RPC Interface

InferMate exposes a Streamable HTTP MCP endpoint at `POST /api/agent/mcp`.

**List tools:**
```bash
curl -s -X POST "$INFERMATE_BASE_URL/api/agent/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

**Call a tool:**
```bash
curl -s -X POST "$INFERMATE_BASE_URL/api/agent/mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "infermate_translate",
      "arguments": { "text": "Hello world", "targetLang": "ja", "mode": "TRANSLATE" }
    }
  }'
```

---

## Multi-Step Agent Workflows

1. **Translate -> Index -> Analyze (Cross-Lingual RAG)**:
   - Call `infermate_translate` on foreign-language text.
   - Call `infermate_rag_ingest` with the translated output.
   - Call `infermate_chat` (`useRag: true`, `persona: "Data Analyst"`) or `infermate_rag_query` (`generateAnswer: true`).
2. **Image -> OCR -> Translate**:
   - Call `infermate_ocr` with base64 image bytes.
   - Pass extracted `text` to `infermate_translate` with the desired `targetLang`.
3. **Document Review Pipeline**:
   - Call `infermate_analyze_document` with `task: "summary"` and `task: "keywords"`.
   - Store the full text via `infermate_rag_ingest` for follow-up Q&A.

---

## How to Use in Claude, DeepSeek & Other Agents

### Claude Code (Agent Skills)
Copy this file into your project or global Claude skills directory:
```bash
mkdir -p .claude/skills/infermate
curl -s "$INFERMATE_BASE_URL/Skills.md" -o .claude/skills/infermate/SKILL.md
```
Claude Code automatically discovers `.claude/skills/*/SKILL.md` and uses `curl` against `$INFERMATE_BASE_URL/api/agent/*` when translation, OCR, RAG, or document analysis is requested.

### Claude Desktop / Claude API
- **Claude Desktop (MCP)**: Connect via `mcp-remote` pointing to `$INFERMATE_BASE_URL/api/agent/mcp` in `claude_desktop_config.json`.
- **Anthropic Messages API**: Fetch `GET /api/agent/manifest` and pass `manifest.formats.claude` into the `tools` parameter of `anthropic.messages.create(...)`, dispatching `tool_use` blocks to `POST /api/agent/mcp` (`tools/call`).

### DeepSeek (`deepseek-chat` / `deepseek-reasoner`)
DeepSeek uses an OpenAI-compatible Function Calling API (`base_url="https://api.deepseek.com"`):
1. Fetch `GET $INFERMATE_BASE_URL/api/agent/manifest` and read `manifest.formats.openai_deepseek`.
2. Pass those tool definitions as `tools=` to `client.chat.completions.create(model="deepseek-chat", ...)`.
3. When DeepSeek emits `tool_calls`, forward each `{ name, arguments }` to `POST $INFERMATE_BASE_URL/api/agent/mcp` (`method: "tools/call"`) and append the result as a `role: "tool"` message.
4. For **DeepSeek inside Cline / Roo Code / Cursor**: Add `Skills.md` to `.cursor/rules/` or Cline's Custom Instructions / MCP Server config pointing to `$INFERMATE_BASE_URL/api/agent/mcp`.

---

## Guardrails & Best Practices

- Keep API keys strictly on the server; never echo `GEMINI_API_KEY` or `INFERMATE_AGENT_API_KEY` in tool outputs.
- Respect payload limits: text inputs up to 50,000 characters; base64 attachments up to 10 MB.
- When `infermate_rag_query` returns zero matches, inform the user that the Knowledge Base has no matching documents and offer to ingest source material via `infermate_rag_ingest`.
- Prefer `mode: "TRANSLITERATE"` only when the user wants phonetic script conversion rather than semantic translation.
