---
name: infermate-hybrid-intelligence
description: >-
  Provides neural translation, phonetic script transliteration, vision image OCR,
  Truth Guard RAG knowledge indexing and semantic retrieval, grounded hybrid chat,
  and document analysis through InferMate HTTP and MCP endpoints. Use when a user
  asks to translate or transliterate text, extract text from images, store or query
  grounded RAG knowledge, run web-grounded persona chat, or summarize and analyze
  documents.
license: MIT
compatibility: >-
  Requires network access to an InferMate server (INFERMATE_BASE_URL) and curl,
  Node.js 18+, or an MCP Streamable HTTP client. Self-hosting requires your own
  GEMINI_API_KEY (and optional HF_API_KEY for Hugging Face models).
metadata:
  author: infermate
  version: "1.0.1"
  api_base: "/api/agent"
  mcp_endpoint: "/api/agent/mcp"
  manifest_endpoint: "/api/agent/manifest"
  permissions: "env_vars, network"
  env_vars: "INFERMATE_BASE_URL, INFERMATE_AGENT_API_KEY, GEMINI_API_KEY, HF_API_KEY"
  external_hosts: "generativelanguage.googleapis.com, api-inference.huggingface.co"
allowed-tools: Bash(curl:*) Bash(node:*) Read
---

# InferMate Hybrid Intelligence

Use this skill to invoke InferMate's translation, OCR, Truth Guard RAG, grounded chat, and document analysis services over REST or Streamable HTTP MCP.

## Prerequisites & Bring Your Own API Keys

### 1. Connecting to an Existing InferMate Server (Skill Client)

Set `INFERMATE_BASE_URL` to your running InferMate instance (defaults to `http://localhost:3000`):

```bash
export INFERMATE_BASE_URL="http://localhost:3000"
# Optional: set if the server operator enabled INFERMATE_AGENT_API_KEY
# export INFERMATE_AGENT_API_KEY="your-bearer-token"
```

### 2. Self-Hosting the InferMate Server (Required User Keys)

If you run the InferMate server yourself rather than connecting to a hosted instance, **you must supply your own API keys** via environment variables (`env_vars` permission):

- **`GEMINI_API_KEY` (Required for `server.ts`)**: Your own Google Gemini API key (from Google AI Studio). Used by `server.ts` (`@google/genai`) for translation, OCR, `gemini-embedding-2-preview` embeddings, RAG answers, chat, and document analysis.
- **`HF_API_KEY` (Optional, for Hugging Face open-source models)**: Your own Hugging Face Inference API token. Required only if you also run the optional open-source Mistral/Zephyr provider (`backend/app.py` or `services/huggingFaceService.ts`).
- **`INFERMATE_AGENT_API_KEY` (Optional)**: Shared Bearer token you choose to protect `POST /api/agent/*` and `POST /api/agent/mcp` endpoints.

### 3. Declared Outbound Hosts & Permissions

- **Permissions**: `env_vars`, `network`
- **Skill Client Host**: `$INFERMATE_BASE_URL` (user-configured InferMate server URL)
- **Server Upstream Hosts (when self-hosting)**:
  - `generativelanguage.googleapis.com` — Google Gemini API (via `GEMINI_API_KEY` in `server.ts`)
  - `api-inference.huggingface.co` — Hugging Face Inference API (via optional `HF_API_KEY` in `backend/app.py` / `services/huggingFaceService.ts`)

## Available Tools

| Tool | Endpoint | Use For |
| :--- | :--- | :--- |
| `infermate_translate` | `POST /api/agent/translate` | Translate meaning (`TRANSLATE`) or convert script phonetically (`TRANSLITERATE`). |
| `infermate_ocr` | `POST /api/agent/ocr` | Extract exact text from a base64-encoded JPEG, PNG, or WebP image. |
| `infermate_rag_ingest` | `POST /api/agent/rag/ingest` | Chunk, embed (`gemini-embedding-2-preview`), and index text into Truth Guard. |
| `infermate_rag_query` | `POST /api/agent/rag/query` | Semantic search over Truth Guard vectors with optional grounded answer synthesis. |
| `infermate_rag_stats` | `GET /api/agent/rag/stats` | Inspect indexed chunk count, categories, and sources. |
| `infermate_chat` | `POST /api/agent/chat` | Persona-driven chat with optional Truth Guard RAG and Google Search grounding. |
| `infermate_analyze_document` | `POST /api/agent/analyze` | Extract `summary`, `questions`, or `keywords` from text or base64 documents. |

## Quick Execution

### Option 1: Bundled Helper Script (Recommended for CLI Agents)

Use `scripts/infermate.mjs` to avoid shell JSON escaping errors:

```bash
node scripts/infermate.mjs infermate_translate '{"text":"Good morning","sourceLang":"en","targetLang":"es","mode":"TRANSLATE"}'
node scripts/infermate.mjs infermate_rag_ingest '{"text":"Release v2 ships Monday.","source":"Release Notes","category":"Product"}'
node scripts/infermate.mjs infermate_rag_query '{"query":"When does v2 ship?","topK":3,"generateAnswer":true}'
```

### Option 2: Direct HTTP / MCP

Call any REST endpoint directly or send JSON-RPC 2.0 to `POST $INFERMATE_BASE_URL/api/agent/mcp`:

```bash
curl -sS -X POST "${INFERMATE_BASE_URL:-http://localhost:3000}/api/agent/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"infermate_translate","arguments":{"text":"Hello","targetLang":"ja","mode":"TRANSLATE"}}}'
```

If `INFERMATE_AGENT_API_KEY` is configured on the server, add `-H "Authorization: Bearer $INFERMATE_AGENT_API_KEY"`.

## Recommended Workflows

1. **Cross-Lingual RAG**: Call `infermate_translate` -> store output with `infermate_rag_ingest` -> query with `infermate_rag_query` (`generateAnswer: true`) or `infermate_chat` (`useRag: true`).
2. **Image to Translation**: Call `infermate_ocr` on base64 image bytes -> pass extracted `text` to `infermate_translate`.
3. **Document Triage**: Call `infermate_analyze_document` with `task: "summary"` and `task: "keywords"`, then index full text with `infermate_rag_ingest` for follow-up Q&A.

## Guardrails

- Never print or echo `GEMINI_API_KEY`, `HF_API_KEY`, or `INFERMATE_AGENT_API_KEY`.
- Keep text payloads under 50,000 characters and base64 files under 10 MB.
- Use `mode: "TRANSLITERATE"` only for phonetic script conversion (e.g., `"नमस्ते"` -> `"Namaste"`), not semantic translation.
- If `infermate_rag_query` returns zero matches, inform the user and offer to ingest source context via `infermate_rag_ingest`.

## Detailed References

Load these on demand when full schemas or client SDK examples are needed:

- [API & MCP Reference](references/api-reference.md) — Complete JSON input/output schemas, error codes, and discovery endpoints.
- [Agent Integrations Guide](references/integrations.md) — Setup snippets for Claude Code, Claude Desktop, Claude API, DeepSeek, Cursor, Cline, and OpenAI.
