import { Content } from "@google/genai";

const LOCAL_PROXY_URL = "http://localhost:5000/chat/hf";

// Models prioritized by speed and stability for free inference
const MODELS = [
    "HuggingFaceH4/zephyr-7b-beta",
    "microsoft/Phi-3-mini-4k-instruct", 
    "mistralai/Mistral-7B-Instruct-v0.2"
];

const getPromptForModel = (modelId: string, query: string, history: Content[], systemInstruction: string, ragContext?: string) => {
    // 1. Zephyr / Phi-3 (ChatML-like)
    if (modelId.includes("zephyr") || modelId.includes("Phi")) {
        let prompt = `<|system|>\n${systemInstruction}\n`;
        if (ragContext) prompt += `CONTEXT:\n${ragContext}\n`;
        prompt += `</s>\n`;
        
        history.slice(-4).forEach(msg => {
             const role = msg.role === 'user' ? 'user' : 'assistant';
             prompt += `<|${role}|>\n${msg.parts[0].text}</s>\n`;
        });
        prompt += `<|user|>\n${query}</s>\n<|assistant|>\n`;
        return prompt;
    }

    // 2. Mistral (Inst format)
    if (modelId.includes("Mistral")) {
        let prompt = `<s>[INST] ${systemInstruction}\n`;
        if (ragContext) prompt += `CONTEXT:\n${ragContext}\n\n`;
        
        history.slice(-4).forEach(msg => {
            if (msg.role === 'user') prompt += `User: ${msg.parts[0].text}\n`;
            else prompt += `Assistant: ${msg.parts[0].text}\n`;
        });
        
        prompt += `User: ${query} [/INST]`;
        return prompt;
    }

    return `${systemInstruction}\n\nUser: ${query}\nAssistant:`;
};

export const chatWithHuggingFace = async (
    query: string,
    history: Content[],
    systemInstruction: string,
    ragContext?: string
): Promise<string> => {
    
    // 1. Try Local Proxy (Fastest, bypasses CORS)
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500); // 1.5s check for local backend

        // Default to Zephyr prompt for local
        const prompt = getPromptForModel("HuggingFaceH4/zephyr-7b-beta", query, history, systemInstruction, ragContext);
        
        const response = await fetch(LOCAL_PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                inputs: prompt,
                parameters: { max_new_tokens: 512, temperature: 0.7, return_full_text: false }
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
            const result = await response.json();
            return result[0]?.generated_text || result.error || "No response.";
        }
    } catch (e) {
        // Local backend not running
    }

    // 2. Fallback: Direct API (Subject to CORS and Rate Limits)
    for (const model of MODELS) {
        const apiUrl = `https://api-inference.huggingface.co/models/${model}`;
        const prompt = getPromptForModel(model, query, history, systemInstruction, ragContext);
        
        try {
            const response = await fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    inputs: prompt,
                    parameters: { 
                        max_new_tokens: 512, 
                        temperature: 0.7, 
                        return_full_text: false,
                        do_sample: true 
                    }
                })
            });

            if (response.status === 503) continue; // Loading... next
            
            if (!response.ok) {
                // If 4xx/5xx (likely CORS or Auth), throw to catch block
                throw new Error(`Status ${response.status}`); 
            }

            const result = await response.json();
            if (Array.isArray(result) && result[0]?.generated_text) {
                return result[0].generated_text;
            }
            
        } catch (err) {
            // console.warn(`Model ${model} failed.`);
        }
    }

    return "Error: Could not connect to Open Source model. \n\nTip: For the best experience, run the included 'backend/app.py' server to bypass browser restrictions, or use the Gemini provider.";
};