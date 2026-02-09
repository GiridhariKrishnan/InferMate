import { GoogleGenAI, GenerateContentResponse, Part, Content, FunctionDeclaration, Type, Modality, LiveServerMessage } from "@google/genai";
import { TranslationMode, ChatPersona } from "../types";

// Dynamic Client Creator (Fixes Stale API Key Issues)
const getAiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_NAME = 'gemini-3-flash-preview';
const MAPS_MODEL = 'gemini-2.5-flash';
const IMAGE_MODEL = 'gemini-3-pro-image-preview';
const VEO_MODEL = 'veo-3.1-fast-generate-preview';
const EMBEDDING_MODEL = 'gemini-embedding-001';
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

// --- Helper: Ensure API Key for Premium Models ---
const ensureApiKey = async () => {
    // @ts-ignore
    if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        // @ts-ignore
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
            // @ts-ignore
            await window.aistudio.openSelectKey();
        }
    }
};

// --- Helper: Retry Logic ---
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isInternal = error?.status === 500 || error?.code === 500 || error?.message?.includes("Internal error");
    if (isInternal && retries > 0) {
      console.warn(`API 500 Error encountered. Retrying in ${delay}ms... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

// --- System Prompts for Personas ---
const BASE_SYSTEM_INSTRUCTION = `You are InferMate AI. 
Safety Rules: Do not generate hate speech, harmful content, or biased information.
Objective: Be helpful, accurate, and concise.`;

const PERSONA_PROMPTS: Record<ChatPersona, string> = {
  [ChatPersona.GENERAL]: `${BASE_SYSTEM_INSTRUCTION} You are a helpful general assistant.`,
  [ChatPersona.RESEARCHER]: `${BASE_SYSTEM_INSTRUCTION} You are an academic researcher. Cite sources, be objective, and use formal language.`,
  [ChatPersona.CREATIVE]: `${BASE_SYSTEM_INSTRUCTION} You are a creative writer. Be expressive, imaginative, and engaging.`,
  [ChatPersona.ANALYST]: `${BASE_SYSTEM_INSTRUCTION} You are a data analyst. Focus on facts, patterns, and structured data outputs.`,
  [ChatPersona.VISUAL_CREATOR]: `${BASE_SYSTEM_INSTRUCTION} You are a Visual Tool User. 
  If the user asks for a video or animation and provides NO image, I will automatically:
  1. Enhance their prompt with visual details.
  2. Generate a reference image.
  3. Create a video from that image.
  
  If they want just an image, I use the generate_image tool.
  If they upload an image, I guide them to animate it.`,
  [ChatPersona.CUSTOM]: `${BASE_SYSTEM_INSTRUCTION} You are a custom persona.` // Placeholder
};

// --- Tool Definitions ---
const generateImageTool: FunctionDeclaration = {
  name: 'generate_image',
  description: 'Generates an image based on a text prompt.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      prompt: { type: Type.STRING, description: 'The detailed description of the image to generate.' },
      size: { type: Type.STRING, description: 'Image size: "1K", "2K", or "4K". Default to "1K".' }
    },
    required: ['prompt']
  }
};

// --- Live API (Real-time Audio) ---
export const startLiveSession = async (
    onAudioData: (base64Audio: string) => void,
    onTranscription: (text: string, isUser: boolean) => void,
    onError: (err: any) => void
) => {
    const ai = getAiClient();
    // Fixed AudioContext fallback
    const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 16000});
    let stream: MediaStream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
        onError("Microphone permission denied");
        return null;
    }

    const sessionPromise = ai.live.connect({
        model: LIVE_MODEL,
        callbacks: {
            onopen: () => {
                console.log("Live Session Connected");
                const source = inputAudioContext.createMediaStreamSource(stream);
                const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                
                scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                    const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                    // Convert Float32 to Int16 PCM
                    const l = inputData.length;
                    const int16 = new Int16Array(l);
                    for (let i = 0; i < l; i++) {
                        int16[i] = inputData[i] * 32768;
                    }
                    const base64Data = btoa(String.fromCharCode(...new Uint8Array(int16.buffer)));
                    
                    sessionPromise.then((session) => {
                        session.sendRealtimeInput({
                            media: { mimeType: 'audio/pcm;rate=16000', data: base64Data }
                        });
                    });
                };
                source.connect(scriptProcessor);
                scriptProcessor.connect(inputAudioContext.destination);
            },
            onmessage: (message: LiveServerMessage) => {
                // Audio Output
                const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                if (audioData) {
                    onAudioData(audioData);
                }
                // Transcriptions
                if (message.serverContent?.outputTranscription?.text) {
                    onTranscription(message.serverContent.outputTranscription.text, false);
                }
                if (message.serverContent?.inputTranscription?.text) {
                    onTranscription(message.serverContent.inputTranscription.text, true);
                }
            },
            onerror: (e) => {
                console.error("Live API Error", e);
                onError(e);
            },
            onclose: (e) => {
                console.log("Live Session Closed");
            }
        },
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
            },
            inputAudioTranscription: {} // Corrected: Empty object instead of invalid model string
        }
    });

    return {
        disconnect: async () => {
            if (stream) stream.getTracks().forEach(t => t.stop());
            if (inputAudioContext) await inputAudioContext.close();
        }
    };
};

// --- Vectorization & Embeddings ---

export const getEmbedding = async (text: string): Promise<number[]> => {
  const ai = getAiClient();
  try {
    return await withRetry(async () => {
        // SDK usage for embedContent.
        // Use 'contents' (plural) for the standard embedContent endpoint with text-embedding-004
        const response = await ai.models.embedContent({
            model: EMBEDDING_MODEL,
            contents: [{ parts: [{ text }] }]
        });
        // Corrected: accessing 'embeddings' (plural) as per single request response structure
        return response.embeddings?.[0]?.values || [];
    });
  } catch (error: any) {
    console.error("Embedding failed:", error);
    // Return empty array to allow app to continue gracefully without RAG for this specific chunk
    return [];
  }
};

// --- Knowledge Fetching ---

export const fetchKnowledgeFromWeb = async (topic: string): Promise<string> => {
    // 1. Try Python Scraper (Localhost)
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); 

        const response = await fetch('http://localhost:5000/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: topic, query: topic }), 
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            if (data.content) return data.content;
        }
    } catch (e) {
        // Fallback
    }

    // 2. Fallback to Gemini Search
    const executeFetch = async () => {
      const ai = getAiClient();
      const prompt = `Research: "${topic}". detailed summary.`;
      
      try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        });
        return response.text || "";
      } catch (e: any) {
        // Fallback: If Search is not allowed (403), try standard generation
        if (e.status === 403 || e.message?.includes("PERMISSION_DENIED")) {
            console.warn("Search permission denied. Falling back to internal knowledge.");
            const response = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: prompt
            });
            return response.text || "";
        }
        throw e;
      }
    };

    try {
        return await withRetry(executeFetch, 3, 2000);
    } catch (error) {
        return "";
    }
};

// --- Translation ---

export const translateText = async (
    text: string, 
    sourceLang: string, 
    targetLang: string, 
    mode: TranslationMode, 
    verbose: boolean = false
): Promise<string> => {
  if (!text.trim()) return "";
  const ai = getAiClient();
  
  let systemInstruction = "";

  if (mode === TranslationMode.TRANSLITERATE) {
      systemInstruction = `You are a professional Transliteration Engine.
      Task: Convert the script of the user input from ${sourceLang === 'auto' ? 'the detected language' : sourceLang} to ${targetLang} script.
      
      CRITICAL RULES:
      1. Do NOT translate the meaning of the words. Keep the original words, just change the alphabet/script.
      2. Example (Hindi to English): "नमस्ते" -> "Namaste" (NOT "Hello").
      3. Example (English to Hindi): "Hello" -> "हेलो" (NOT "नमस्ते").
      4. Return ONLY the transliterated text.
      `;
  } else if (verbose) {
    systemInstruction = `You are a helpful AI assistant and expert linguist.
    Task: Translate the user input from ${sourceLang === 'auto' ? 'the detected language' : sourceLang} to ${targetLang}.
    
    Instructions:
    1. Provide the direct translation first.
    2. Then, provide a breakdown, alternative meanings, grammar notes, or cultural context.
    3. Be descriptive and educational.`;
  } else {
    // Strict concise
    systemInstruction = `You are a professional, high-precision translator.
    Task: Translate the user input from ${sourceLang === 'auto' ? 'the detected language' : sourceLang} to ${targetLang}.
    
    STRICT OUTPUT RULES:
    1. Return ONLY the translated text. 
    2. Do NOT include phrases like "Here is the translation", "The translation is", or "Sure".
    3. Do NOT wrap the output in quotes.
    4. Exception: If the source text is extremely ambiguous or has multiple distinct meanings, you may add a brief parenthetical note explaining the chosen context (e.g. "Kinder im Garten (referring to multiple children)"). Otherwise, NO notes.`;
  }

  let prompt = mode === TranslationMode.TRANSLITERATE
    ? `Transliterate into ${targetLang} script: "${text}"`
    : `Input to translate: "${text}"`;

  try {
    const response = await ai.models.generateContent({ 
        model: MODEL_NAME, 
        contents: prompt,
        config: { systemInstruction } 
    });
    return response.text?.trim() || "Processing failed.";
  } catch (error) { return "Error."; }
};

export const translateDocument = async (
  file: { data: string; mimeType: string; isBinary: boolean },
  sourceLang: string,
  targetLang: string,
  mode: TranslationMode,
  verbose: boolean = false
): Promise<string> => {
  const ai = getAiClient();
  
  let systemInstruction = "";
  const isImage = file.mimeType.startsWith('image/');

  if (isImage) {
      systemInstruction = `You are a helpful AI visual translator.
      Target Language: ${targetLang}.
      
      Your Goal:
      1. Extract and translate any text found in the image to ${targetLang}.
      2. If NO text is found, or the text is unreadable, provide a detailed description of the image content in ${targetLang}.
      3. If there is text, provide the translation first, then a brief description of the visual context.
      `;
  } else if (mode === TranslationMode.TRANSLITERATE) {
      systemInstruction = `You are a document transliterator.
      Task: Transliterate the provided document content from ${sourceLang === 'auto' ? 'detected language' : sourceLang} script to ${targetLang} script.
      
      Rules:
      1. Do NOT translate the meaning. Convert script only.
      2. Preserve the original formatting, paragraphs, and structure exactly.
      3. Return ONLY the transliterated content.
      `;
  } else if (verbose) {
    systemInstruction = `You are a helpful AI assistant and expert linguist analyzing a document.
    Task: Translate the provided document from ${sourceLang === 'auto' ? 'detected language' : sourceLang} to ${targetLang}.
    
    Instructions:
    1. Provide the translation.
    2. You may add footnotes or a summary of linguistic choices at the end if the document has complex terminology.`;
  } else {
    systemInstruction = `You are a document translator.
    Task: Translate the provided document content from ${sourceLang === 'auto' ? 'detected language' : sourceLang} to ${targetLang}.
    Rules:
    1. Preserve the original formatting, paragraphs, and structure exactly.
    2. Return ONLY the translated content. No introductory or concluding text.`;
  }

  try {
    const parts: Part[] = [];
    if (file.isBinary) {
        parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
        if (isImage) {
            parts.push({ text: `
Please analyze this image.
1. If there is text in the image, translate it to ${targetLang}.
2. If there is NO text, provide a detailed description of what you see in the image in ${targetLang}.
3. If there is text but it's part of a larger scene, translate the text and briefly describe the scene.
` });
        } else {
            parts.push({ text: mode === TranslationMode.TRANSLITERATE ? "Transliterate this document." : "Translate this document." });
        }
    } else {
        parts.push({ text: `[DOCUMENT CONTENT TO PROCESS]\n${file.data}` });
    }
    
    const response = await ai.models.generateContent({ 
        model: MODEL_NAME, 
        contents: [{ role: 'user', parts }],
        config: { systemInstruction }
    });
    return response.text?.trim() || "Failed.";
  } catch (error) { return "Error."; }
};

export const extractTextFromImage = async (base64Data: string, mimeType: string): Promise<string> => {
    const ai = getAiClient();
    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: {
                parts: [
                    { inlineData: { mimeType, data: base64Data } },
                    { text: "OCR Task: Extract all text from this image exactly as it appears. Return only the extracted text, no markdown, no commentary." }
                ]
            }
        });
        return response.text?.trim() || "";
    } catch (e) {
        console.error("Cloud OCR Error", e);
        return "";
    }
};

// --- Chat with Document ---

export const chatWithDocument = async (query: string, fileContent: string, history: Content[]): Promise<string> => {
  const ai = getAiClient();
  try {
    const systemInstruction = "You are a helpful assistant. Answer questions based on the provided document context.";
    
    // We treat fileContent as text here since DocumentChat reads it as text
    const docPart = { text: `[DOCUMENT CONTENT]\n${fileContent}\n\n[INSTRUCTION]\nAnswer the user's questions based on the document above.` };

    const apiHistory: Content[] = [
        {
            role: 'user',
            parts: [docPart]
        },
        {
            role: 'model',
            parts: [{ text: "Understood. I will answer based on the document." }]
        },
        ...history
    ];

    const chat = ai.chats.create({
        model: MODEL_NAME,
        config: { systemInstruction },
        history: apiHistory
    });

    const response = await chat.sendMessage({ message: query });
    return response.text || "";
  } catch (e) {
    console.error("Document Chat Error", e);
    return "Error processing document chat.";
  }
};

// --- Media Generation ---

export const generateImage = async (prompt: string, size: "1K" | "2K" | "4K" = "1K"): Promise<string | null> => {
    try {
        await ensureApiKey(); // Ensure Key for Premium Model
        const ai = getAiClient();
        console.log(`Generating image with Nano Banana Pro (${size})...`);
        const response = await ai.models.generateContent({
            model: IMAGE_MODEL,
            contents: { parts: [{ text: prompt }] },
            config: {
                imageConfig: {
                    imageSize: size,
                    aspectRatio: "1:1"
                }
            }
        });
        
        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) return part.inlineData.data;
        }
        return null;
    } catch (e: any) {
        console.error("Image Gen Error", e);
        // Detect Paid Model Error
        if (e.message?.includes('404') || e.message?.includes('not found') || e.message?.includes('403') || e.status === 404 || e.status === 403) {
            throw new Error("PAYMENT_REQUIRED");
        }
        return null;
    }
};

export const generateVeoVideo = async (imageBase64: string, prompt: string, mimeType: string): Promise<string | null> => {
    try {
        await ensureApiKey(); // Ensure Key for Veo
        const ai = getAiClient();

        let operation = await ai.models.generateVideos({
            model: VEO_MODEL,
            prompt: prompt || "Animate this image",
            image: {
                imageBytes: imageBase64,
                mimeType: mimeType
            },
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: '16:9'
            }
        });

        // Polling
        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            operation = await ai.operations.getVideosOperation({operation: operation});
        }

        const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (uri) {
            return `${uri}&key=${process.env.API_KEY}`;
        }
        return null;
    } catch (e: any) {
        console.error("Veo Error", e);
        // Detect Paid Model Error
        if (e.message?.includes('404') || e.message?.includes('not found') || e.message?.includes('403') || e.status === 404 || e.status === 403) {
            throw new Error("PAYMENT_REQUIRED");
        }
        throw e;
    }
};

// --- Persona Generator ---
export const createPersonaDescription = async (userDescription: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Role: Expert System Prompt Engineer.
    Task: Create a detailed, actionable system instruction for an AI persona described as: "${userDescription}".
    Requirements:
    1. Define tone, voice, and style.
    2. Define constraints and behavioral rules.
    3. Be specific and immersive.
    Output: Return ONLY the raw system instruction text, no markdown code blocks.`;
    
    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt
        });
        return response.text?.trim() || userDescription;
    } catch (e) {
        console.error("Persona Gen Error", e);
        return userDescription;
    }
};

// --- Chat Logic ---

export const chatHybrid = async (
  query: string,
  chatHistory: Content[],
  document?: { content: string; mimeType: string; isBinary: boolean },
  links?: string[],
  persona: ChatPersona = ChatPersona.GENERAL,
  ragContext?: string,
  customPersonaInstruction?: string
): Promise<{ text: string, sources?: any[], generatedImage?: string, mapData?: any[], generatedVideo?: string }> => {
  
  // 1. Determine Model & Tools based on intent/persona
  let selectedModel = MODEL_NAME;
  let tools: any[] = [];
  let systemInstruction = PERSONA_PROMPTS[persona];

  if (persona === ChatPersona.CUSTOM && customPersonaInstruction) {
      systemInstruction = `${BASE_SYSTEM_INSTRUCTION}\n\n[CUSTOM PERSONA INSTRUCTION]\n${customPersonaInstruction}`;
  }

  // Specific Logic for "Maps"
  const isMapIntent = query.toLowerCase().includes("map") || query.toLowerCase().includes("location") || query.toLowerCase().includes("path") || query.toLowerCase().includes("where is");
  
  // --- VISUAL CREATOR SPECIAL PIPELINE ---
  if (persona === ChatPersona.VISUAL_CREATOR) {
      selectedModel = IMAGE_MODEL; 
      tools = [{ functionDeclarations: [generateImageTool] }];
      
      // Ensure Key because we will likely use IMAGE_MODEL or VEO
      await ensureApiKey();

      const isVideoRequest = query.toLowerCase().match(/\b(video|animate|movie|motion)\b/);
      
      // If user wants video but provided NO image (document), start chain
      if (isVideoRequest && !document) {
          try {
              const ai = getAiClient();
              // Step 1: Prompt Enhancement
              const enhancementPrompt = `You are a visual prompt expert. Analyze the user request: "${query}".
              Enhance it by adding details (lighting, style, camera angle, mood) that are missing but likely (>75% probability) intended for a high-quality video generation.
              Return ONLY the raw enhanced prompt text, no explanations.`;
              
              const enhancementRes = await ai.models.generateContent({
                  model: MODEL_NAME, // Use Text model for logic
                  contents: enhancementPrompt
              });
              const enhancedPrompt = enhancementRes.text?.trim() || query;

              // Step 2: Generate Reference Image (Nano Banana Pro)
              // We perform this "silently" to get the base frame
              const imgData = await generateImage(enhancedPrompt, "1K");

              if (imgData) {
                  // Step 3: Generate Video (Veo)
                  // Note: generateImage returns base64, usually PNG from Gemini API
                  const videoUri = await generateVeoVideo(imgData, enhancedPrompt, "image/png");
                  
                  return {
                      text: `🎥 **Video Generated**\n\n**Enhanced Prompt:** ${enhancedPrompt}\n\n(I first generated a reference image using ${IMAGE_MODEL}, then animated it with ${VEO_MODEL}.)`,
                      generatedVideo: videoUri,
                      generatedImage: imgData // Optional: Return the base frame as well
                  };
              } else {
                  return { text: "I tried to generate a base image for your video but failed. Please try a different prompt." };
              }
          } catch (e: any) {
              console.error("Video Chain Error", e);
              if (e.message === "PAYMENT_REQUIRED") throw e; // Propagate for UI handling
              return { text: "Error during video generation pipeline. Please check your API limits or try again." };
          }
      }
  }
  
  if (isMapIntent) {
      selectedModel = MAPS_MODEL; // gemini-2.5-flash
      tools = [{ googleMaps: {} }];
      systemInstruction += `\nUse Google Maps to verify locations. For historical queries (like Ramayana), first find the modern equivalent of the place name, then use Google Maps to show the location.`;
  } 
  // General fallback (Web Search)
  else if (!document && persona !== ChatPersona.VISUAL_CREATOR) {
      // Fix 403: googleSearch cannot be combined with other tools.
      // We assume user wants search unless they explicitly ask for an image in general chat.
      const isImageRequest = query.toLowerCase().match(/\b(generate|create|draw|make)\b.*\b(image|picture|photo|art)\b/);
      
      if (isImageRequest) {
          tools = [{ functionDeclarations: [generateImageTool] }];
      } else {
          tools = [{ googleSearch: {} }];
      }
  }

  // RAG & Doc Injection
  if (ragContext) systemInstruction += `\n\n[RAG CONTEXT]\n${ragContext}`;
  if (document) systemInstruction += `\n\n[DOCUMENT CONTEXT]\nAnalyze the uploaded document.`;
  if (links && links.length > 0) query += `\n\nRefer to: ${links.join(', ')}`;

  const apiHistory: Content[] = [...chatHistory];
  if (document) {
      const docPart: Part = document.isBinary 
          ? { inlineData: { mimeType: document.mimeType, data: document.content } }
          : { text: `[DOCUMENT]\n${document.content}` };
      apiHistory.unshift({ role: 'user', parts: [docPart, { text: "Context Document" }] });
      apiHistory.unshift({ role: 'model', parts: [{ text: "Document received." }] });
  }

  try {
    const ai = getAiClient();
    const chat = ai.chats.create({
        model: selectedModel,
        config: { systemInstruction, tools },
        history: apiHistory
    });

    const response = await chat.sendMessage({ message: query });
    
    // --- Result Parsing ---
    let text = response.text || "";
    let generatedImage = undefined;
    let sources: any[] = [];
    let mapData: any[] = [];

    // 1. Handle Function Calls (e.g., Image Gen)
    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
        for (const call of functionCalls) {
            if (call.name === 'generate_image') {
                const args = call.args as any;
                text += `\n\n(Generating image for: "${args.prompt}" at ${args.size || '1K'})...`;
                try {
                    const imgData = await generateImage(args.prompt, args.size);
                    if (imgData) {
                        generatedImage = imgData;
                        // Send response back to model to close loop (optional for single turn, but good practice)
                        await chat.sendMessage({
                            message: [{
                                functionResponse: {
                                    name: 'generate_image',
                                    response: { result: 'Image generated successfully.' }
                                }
                            }]
                        });
                    }
                } catch(e: any) {
                    if (e.message === "PAYMENT_REQUIRED") throw e;
                    text += "\n[Image Generation Failed: Please try again]";
                }
            }
        }
    }

    // 2. Handle Grounding (Web & Maps)
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks) {
        groundingChunks.forEach((chunk: any) => {
            // Web Sources
            if (chunk.web?.uri) {
                sources.push({ uri: chunk.web.uri, title: chunk.web.title || "Web Source" });
            }
            // Map Sources (Check 'maps' property)
            // Note: Use 'any' cast if types are missing for Maps grounding
            const mapInfo = chunk.maps; 
            if (mapInfo?.uri) {
                sources.push({ uri: mapInfo.uri, title: mapInfo.title || "Map Location" });
            }
        });
    }

    return { text, sources, generatedImage, mapData };

  } catch (error: any) {
    if (error.status === 403 || error.message?.includes("PERMISSION_DENIED")) {
         // Fallback: If tools were used, retry without tools
         if (tools && tools.length > 0) {
             console.warn("Permission denied with tools. Retrying without tools...");
             const ai = getAiClient();
             const fallbackChat = ai.chats.create({
                model: selectedModel,
                config: { systemInstruction, tools: [] }, // Remove tools
                history: apiHistory
            });
            const response = await fallbackChat.sendMessage({ message: query });
            return { text: response.text || "" };
         }
         // If still 403 or no tools were used, assume Payment Required for model access
         throw new Error("PAYMENT_REQUIRED");
    }
    
    if (error.message === "PAYMENT_REQUIRED" || error.message?.includes('404')) {
        throw new Error("PAYMENT_REQUIRED");
    }
    console.error("Chat Error:", error);
    return { text: "Error connecting to AI. Please try again." };
  }
};

export const speakText = async (text: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (!window.speechSynthesis) return resolve();
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) || voices[0];
        if (preferredVoice) utterance.voice = preferredVoice;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
    });
};

export const analyzeDocument = async (
    file: { content: string; mimeType: string; isBinary: boolean }, 
    task: 'summary' | 'questions' | 'keywords'
): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Perform task: ${task.toUpperCase()} on the attached document.`;
    try {
        const parts: Part[] = [];
        if (file.isBinary) parts.push({ inlineData: { mimeType: file.mimeType, data: file.content } });
        else parts.push({ text: `Document:\n${file.content}` });
        parts.push({ text: prompt });
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: [{ role: 'user', parts }]
        });
        return response.text || "Analysis failed.";
    } catch (e) {
        return "Error analyzing document.";
    }
}