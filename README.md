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
*   **In-Memory Vector Store:** client-side vectorization using `text-embedding-004`.
*   **Dynamic Scraping:** Python-based backend scraper to fetch web content and index it instantly.
*   **Tiered Knowledge:** Pre-loaded foundational knowledge sets based on user tiers (Free vs. Enterprise).
*   **Document Q&A:** Chat specifically with uploaded documents to extract summaries, keywords, or answers.

---

## 🏗 System Architecture

### Frontend
*   **Framework:** React 19 (TypeScript).
*   **Styling:** TailwindCSS with a custom "Neuro" theme.
*   **State Management:** Context API (`TierContext`) for managing subscription features.
*   **AI SDKs:** `@google/genai` (v1.38+), `tesseract.js`.

### Backend (Microservice)
*   **Stack:** Python (Flask).
*   **Functions:**
    *   `POST /scrape`: Fetches clean text from URLs for the RAG engine.
    *   `POST /chat/hf`: Proxies requests to HuggingFace Inference API to bypass CORS.

### Tiered Feature System
InferMate operates on a business-ready tiered architecture:
| Feature | Free | Pro | Enterprise |
| :--- | :---: | :---: | :---: |
| **Max File Size** | 2MB | 10MB | 20MB |
| **RAG Knowledge** | General History/Science | Advanced Philosophy | Global Economics |
| **Media Gen** | Basic | Image Generation | Veo Video Gen |
| **Models** | Gemini Flash | Gemini Pro | Gemini Ultra (Simulated) |

---

## 🛠️ Installation & Setup

### Prerequisites
*   Node.js (v18+)
*   Python (3.9+)
*   Google Gemini API Key
*   (Optional) HuggingFace API Key

### 1. Environment Setup
Create a `.env` file in the root directory:
```env
API_KEY=your_google_gemini_api_key
HF_API_KEY=your_hugging_face_token
```

### 2. Start Backend (Scraper & Proxy)
The Python backend handles web scraping and open-source model proxying.
```bash
cd backend
pip install flask flask-cors requests beautifulsoup4
python app.py
```
*Server runs on `http://localhost:5000`*

### 3. Start Frontend
```bash
npm install
npm start
```
*App runs on `http://localhost:3000`*

---

## 🔮 Future Roadmap

*   **Offline First:** Implement local LLM (WebLLM) for full offline capabilities.
*   **Voice Cloning:** Integration of custom voice cloning for the Live API.
*   **Enterprise connectors:** Direct connectors for Google Drive and Slack ingestion into Truth Guard™.

---

© 2024 InferMate Inc. | Built with Google Gemini
