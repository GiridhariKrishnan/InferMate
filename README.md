# InferMate | Hybrid Intelligence Platform

![Status](https://img.shields.io/badge/Status-Operational-emerald)
![Tech](https://img.shields.io/badge/Stack-React_19_•_Gemini_Pro_•_Tailwind-indigo)
![AI](https://img.shields.io/badge/AI-Multimodal_Hybrid-purple)

**InferMate** is a next-generation communication and intelligence platform that bridges the gap between traditional translation tools and advanced Large Language Models (LLMs). By combining **Neural Machine Translation**, **Real-time RAG (Retrieval-Augmented Generation)**, and **Multimodal Generative AI**, InferMate serves as a comprehensive assistant for cross-lingual communication, data analysis, and creative content generation.

---

## 🌟 Executive Summary

InferMate is designed to solve three core problems:
1.  **Language Barriers:** Beyond simple text translation, it handles real-world scenarios via OCR (Camera), Voice, and Transliteration.
2.  **Hallucinations:** The **Truth Guard™** engine ensures AI responses are grounded in user-provided documents or verified web sources.
3.  **Model Lock-in:** A hybrid architecture allowing users to switch between Google's **Gemini** (high reasoning) and HuggingFace's **Mistral/Zephyr** (open source/speed).

---

## 🚀 Key Features

### 1. Neural Translator Module
A powerhouse for breaking language barriers, featuring:
*   **Multimodal Input:** Text, Document (PDF/TXT), Voice (Speech-to-Text), and **Live Camera**.
*   **Neural OCR & HUD:** Real-time on-device text detection (Tesseract.js) overlaid with a "Heads-Up Display," enhanced by **Gemini Vision** for complex scene analysis.
*   **Transliteration Mode:** Converts scripts (e.g., Hindi to English text) without translating meaning—essential for learning pronunciation.
*   **Smart Handoff:** Seamlessly send translated context to the Intelligent Chat for deep analysis or RAG indexing.

### 2. Intelligent Chat (Hybrid Engine)
A context-aware chat interface supporting multiple personas and providers:
*   **Dual-LLM Support:** Switch between **Gemini 2.5/3.0** (Google) and **Mistral/Zephyr** (via HuggingFace Proxy).
*   **Gemini Live API:** Real-time, low-latency bi-directional voice conversations with interruption handling.
*   **Visual Creator Persona:** Specialized agent for generating **Imagen 3** high-fidelity images and **Veo** videos.
*   **Custom Personas:** Users can prompt-engineer custom identities (e.g., "Sarcastic Pirate").
*   **Grounding:** Integrated **Google Search** and **Google Maps** for real-time fact-checking and location services.

### 3. Truth Guard™ Knowledge Base (RAG)
An integrated Vector Store system for private, grounded intelligence:
*   **Vector Store:** Semantic vectorization using `gemini-embedding-2-preview`.
*   **Dynamic Scraping:** Optional Python backend scraper to fetch web content and index it.
*   **Tiered Knowledge:** Pre-loaded foundational knowledge sets based on user tiers (Free vs. Enterprise).
*   **Document Q&A:** Chat specifically with uploaded documents to extract summaries, keywords, or answers.

### 4. Agent & Skills Mode (`SKILL.md` + REST + MCP)
InferMate ships as an **Agent Skills (`agentskills.io`)** compliant package at `skills/infermate-hybrid-intelligence/SKILL.md` for **Claude Code**, **Claude Desktop**, **Claude API**, **DeepSeek**, **Cursor**, **Cline**, **OpenAI Codex**, and custom agents:
*   **Skill Package:** `skills/infermate-hybrid-intelligence/SKILL.md` (with `references/` and `scripts/infermate.mjs`), served live at `GET /SKILL.md` and validated at `GET /api/agent/skill/validate`.
*   **Tool Manifest:** `GET /api/agent/manifest` and `GET /.well-known/agent.json` expose schemas for Claude Tool Use, DeepSeek/OpenAI Function Calling, and MCP.
*   **Streamable HTTP MCP:** `POST /api/agent/mcp` implements JSON-RPC 2.0 (`initialize`, `ping`, `tools/list`, `tools/call`).
*   **REST Endpoints:** `/api/agent/translate`, `/api/agent/ocr`, `/api/agent/rag/ingest`, `/api/agent/rag/query`, `/api/agent/rag/stats`, `/api/agent/chat`, and `/api/agent/analyze`.

---

## 🏗 System Architecture

### Frontend
*   **Framework:** React 19 (TypeScript).
*   **Styling:** TailwindCSS with a custom "Neuro" theme.
*   **State Management:** Context API (`TierContext`) for managing subscription features.
*   **AI SDKs:** `@google/genai` (v1.38+), `tesseract.js`.

### Server & Agent Runtime (`server.ts`)
*   **Stack:** Express + Vite middleware (dev) / static bundle (production) on port 3000.
*   **Functions:** Serves `SKILL.md`, progressive-disclosure references/scripts, Agent Manifest, live compliance validator, REST tool endpoints, and Streamable HTTP MCP JSON-RPC with optional `INFERMATE_AGENT_API_KEY` Bearer protection.

### Optional Python Microservice (`backend/app.py`)
*   **Stack:** Python (Flask).
*   **Functions:**
    *   `POST /scrape`: Fetches clean text from URLs for the RAG engine.
    *   `POST /chat/hf`: Proxies requests to HuggingFace Inference API to bypass CORS.

---

## 🛠️ Installation & Setup

### Prerequisites
*   Node.js (v20+)
*   Google Gemini API Key
*   (Optional) `INFERMATE_AGENT_API_KEY` to protect external agent API calls

### 1. Environment Setup
Copy `.env.example` to `.env.local` and set your keys:
```env
GEMINI_API_KEY=your_google_gemini_api_key
INFERMATE_AGENT_API_KEY=optional_bearer_secret
```

### 2. Start Full-Stack App & Agent Runtime
```bash
npm install
npm run dev
```
*App & Agent Skill API run on `http://localhost:3000`*

---

© 2024 InferMate Inc. | Built with Google Gemini
