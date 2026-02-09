import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, UploadedFile, ChatPersona, LLMProvider } from '../types';
import { chatHybrid, speakText, analyzeDocument, fetchKnowledgeFromWeb, startLiveSession, generateVeoVideo, createPersonaDescription } from '../services/geminiService';
import { chatWithHuggingFace } from '../services/huggingFaceService';
import { vectorStore } from '../services/vectorStore';
import { useTier } from '../contexts/TierContext';
import PaymentModal from './PaymentModal';

// Decode Audio for Live API
function decodeAudio(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

interface IntelligentChatProps {
    initialMessage?: string;
    onClearInitialMessage?: () => void;
}

const IntelligentChat: React.FC<IntelligentChatProps> = ({ initialMessage, onClearInitialMessage }) => {
  const { tierConfig, currentTier } = useTier();

  // State
  const [messages, setMessages] = useState<ChatMessage[]>([
      {
          id: 'intro',
          role: 'model',
          content: "Hello! Select a persona to begin. Use 'Visual Tool User' for Veo animations, or 'Custom Identity' to create your own.",
          timestamp: Date.now(),
          provider: 'System'
      }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [persona, setPersona] = useState<ChatPersona>(ChatPersona.GENERAL);
  const [provider, setProvider] = useState<LLMProvider>(LLMProvider.GEMINI);
  const [useRAG, setUseRAG] = useState(true);
  
  // Custom Persona State
  const [customPersonaInput, setCustomPersonaInput] = useState('');
  const [customPersonaInstruction, setCustomPersonaInstruction] = useState('');
  const [isGeneratingPersona, setIsGeneratingPersona] = useState(false);

  // Voice Input (Dictation) State
  const [isDictating, setIsDictating] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  
  // Live API State
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const liveSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);

  // Link State
  const [links, setLinks] = useState<string[]>([]);
  const [isLinkInputOpen, setIsLinkInputOpen] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  
  // Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing, liveTranscript]);

  // Handle incoming context from Translator
  useEffect(() => {
      if (initialMessage) {
          setInputValue(initialMessage);
          if (onClearInitialMessage) onClearInitialMessage();
      }
  }, [initialMessage, onClearInitialMessage]);

  // --- Dictation Setup ---
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        try {
            const recognition = new SpeechRecognition();
            recognitionRef.current = recognition;
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onresult = (event: any) => {
                const transcript = Array.from(event.results)
                    .map((result: any) => result[0].transcript)
                    .join('');
                if (event.results[0].isFinal) {
                    setInputValue(prev => prev ? prev + ' ' + transcript : transcript);
                    setIsDictating(false);
                }
            };

            recognition.onerror = (event: any) => {
                console.error("Dictation Error:", event.error);
                setIsDictating(false);
                
                let errorMessage = "Voice input failed.";
                if (event.error === 'network') {
                    errorMessage = "Network error. Please check your connection.";
                } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                    errorMessage = "Microphone access denied.";
                } else if (event.error === 'no-speech') {
                    return; // Ignore
                }
                
                setSpeechError(errorMessage);
                setTimeout(() => setSpeechError(null), 3000);
            };
            
            recognition.onend = () => {
                setIsDictating(false);
            };
        } catch (e) {
            console.error("Speech Recognition setup failed:", e);
        }
    }
    
    return () => {
        if (recognitionRef.current) {
            recognitionRef.current.abort();
        }
    };
  }, []);

  const toggleDictation = () => {
      if (isDictating) {
          recognitionRef.current?.stop();
          setIsDictating(false);
      } else {
          try {
              setSpeechError(null);
              recognitionRef.current?.start();
              setIsDictating(true);
          } catch(e) {
              console.error(e);
              setSpeechError("Could not start voice input.");
              setTimeout(() => setSpeechError(null), 3000);
          }
      }
  };

  // --- Live API Handlers ---
  const toggleLiveMode = async () => {
      if (isLiveMode) {
          // Stop
          if (liveSessionRef.current) liveSessionRef.current.disconnect();
          if (audioContextRef.current) audioContextRef.current.close();
          setIsLiveMode(false);
          setLiveTranscript('');
      } else {
          // Start
          setIsLiveMode(true);
          // Fix: Webkit fallback cast to any
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
          nextStartTimeRef.current = 0;

          const session = await startLiveSession(
              async (base64Audio) => {
                  // Play Audio
                  if (!audioContextRef.current) return;
                  const audioCtx = audioContextRef.current;
                  const audioData = decodeAudio(base64Audio);
                  
                  // Simple Decode
                  const buffer = audioCtx.createBuffer(1, audioData.length / 2, 24000);
                  const channel = buffer.getChannelData(0);
                  const int16 = new Int16Array(audioData.buffer);
                  for (let i = 0; i < int16.length; i++) {
                      channel[i] = int16[i] / 32768.0;
                  }

                  const source = audioCtx.createBufferSource();
                  source.buffer = buffer;
                  source.connect(audioCtx.destination);
                  
                  const now = audioCtx.currentTime;
                  // Schedule ensuring no overlap but continuous play
                  const start = Math.max(now, nextStartTimeRef.current);
                  source.start(start);
                  nextStartTimeRef.current = start + buffer.duration;
              },
              (text, isUser) => {
                  setLiveTranscript(prev => `${isUser ? '\nUser: ' : '\nAI: '}${text}`);
              },
              (err) => {
                  alert("Live Session Error: " + err);
                  setIsLiveMode(false);
              }
          );
          liveSessionRef.current = session;
      }
  };

  // --- Custom Persona Handler ---
  const handleGeneratePersona = async () => {
      if (!customPersonaInput.trim()) return;
      setIsGeneratingPersona(true);
      const instruction = await createPersonaDescription(customPersonaInput);
      setCustomPersonaInstruction(instruction);
      setIsGeneratingPersona(false);
      setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'model',
          content: `Persona configured! I am now acting as: "${customPersonaInput}".`,
          timestamp: Date.now(),
          provider: 'System'
      }]);
  };

  // --- File Handling ---
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];
    if (uploadedFile) {
        const isPdf = uploadedFile.type === 'application/pdf' || uploadedFile.name.toLowerCase().endsWith('.pdf');
        const isImage = uploadedFile.type.startsWith('image/');

        const reader = new FileReader();
        reader.onload = async (e) => {
            let content = e.target?.result as string;
            if (isPdf || isImage) content = content.split(',')[1];

            setFile({
                name: uploadedFile.name,
                mimeType: uploadedFile.type || 'text/plain',
                isBinary: isPdf || isImage,
                size: uploadedFile.size,
                content: content
            });
            
            // If Visual Persona and Image, prompt for Veo
            if (persona === ChatPersona.VISUAL_CREATOR && isImage) {
                 setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    role: 'model',
                    content: `📸 **Image Uploaded**. To animate this with **Veo**, reply with a prompt (e.g., "A neon hologram of a cat driving").`,
                    timestamp: Date.now()
                }]);
            } else {
                 setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    role: 'model',
                    content: `✅ Attached **${uploadedFile.name}**.`,
                    timestamp: Date.now()
                }]);
            }
        };
        if (isPdf || isImage) reader.readAsDataURL(uploadedFile);
        else reader.readAsText(uploadedFile);
    }
  };

  const removeLink = (index: number) => {
      setLinks(prev => prev.filter((_, i) => i !== index));
  };

  // --- Chat Logic ---
  const handleSendMessage = async (msgText = inputValue) => {
    if (!msgText.trim()) return;

    const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: msgText,
        timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsProcessing(true);

    try {
        // Special Case: Veo Animation Request
        if (persona === ChatPersona.VISUAL_CREATOR && file && file.mimeType.startsWith('image/')) {
            try {
                const videoUri = await generateVeoVideo(file.content, userMsg.content, file.mimeType);
                if (videoUri) {
                    setMessages(prev => [...prev, {
                        id: Date.now().toString(),
                        role: 'model',
                        content: "Here is your Veo generation:",
                        timestamp: Date.now(),
                        generatedVideo: videoUri,
                        provider: 'Veo'
                    }]);
                    setIsProcessing(false);
                    return;
                }
            } catch (error: any) {
                if (error.message === "PAYMENT_REQUIRED") {
                    setPendingMessage(msgText); // Save state to retry
                    setShowPaymentModal(true);
                    setIsProcessing(false);
                    return;
                }
                throw error;
            }
        }

        const history = messages.map(m => ({
            role: m.role,
            parts: [{ text: m.content }]
        }));

        // 1. Retrieval (RAG)
        let ragContext = "";
        if (useRAG && !file) {
            const docs = await vectorStore.similaritySearch(userMsg.content);
            if (docs.length > 0) {
                ragContext = docs.map(d => `Source: ${d.source}\n${d.text}`).join('\n\n');
            }
        }

        // 2. Generation
        let responseText = "";
        let sources = undefined;
        let generatedImage = undefined;

        if (provider === LLMProvider.GEMINI) {
            const result = await chatHybrid(
                userMsg.content, 
                history, 
                file || undefined, 
                links, 
                persona,
                ragContext,
                persona === ChatPersona.CUSTOM ? customPersonaInstruction : undefined
            );
            responseText = result.text;
            sources = result.sources;
            generatedImage = result.generatedImage;
        } else {
            responseText = await chatWithHuggingFace(userMsg.content, history, `You are a ${persona}.`, ragContext);
        }

        const botMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: 'model',
            content: responseText,
            timestamp: Date.now(),
            sources: sources,
            generatedImage: generatedImage,
            provider: provider
        };

        setMessages(prev => [...prev, botMsg]);
    } catch (e: any) {
        if (e.message === "PAYMENT_REQUIRED") {
            setPendingMessage(msgText);
            setShowPaymentModal(true);
        } else {
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'model',
                content: "Error processing request. " + e,
                timestamp: Date.now()
            }]);
        }
    } finally {
        setIsProcessing(false);
    }
  };

  const handlePaymentSuccess = () => {
      // Retry the last message if available
      if (pendingMessage) {
          // Remove the failed attempt message from the UI to avoid duplicates or keep it, 
          // here we just trigger processing again.
          const msgToRetry = pendingMessage;
          setPendingMessage(null);
          // Note: We need to manually invoke the logic, but since handleSendMessage adds a User message,
          // we should slightly modify logic or just inform user to try again.
          // Better UX: Just auto-retry logic without adding another user bubble:
          // For simplicity in this structure:
          alert("Premium Key Activated! Please click the send button or type your request again to verify.");
          setInputValue(msgToRetry);
      }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
        <PaymentModal 
            isOpen={showPaymentModal} 
            onClose={() => setShowPaymentModal(false)}
            onSuccess={handlePaymentSuccess}
        />
        
        {/* Live Mode Overlay */}
        {isLiveMode && (
            <div className="absolute inset-0 z-50 bg-indigo-900/95 backdrop-blur-md flex flex-col items-center justify-center text-white animate-fade-in">
                <div className="w-32 h-32 rounded-full bg-indigo-500 animate-pulse flex items-center justify-center shadow-[0_0_50px_rgba(99,102,241,0.5)]">
                    <i className="fas fa-microphone text-4xl"></i>
                </div>
                <h2 className="mt-8 text-2xl font-bold">Gemini Live</h2>
                <p className="text-indigo-300">Listening & Speaking...</p>
                <div className="mt-8 max-w-md w-full h-40 overflow-y-auto bg-black/20 rounded-xl p-4 text-sm font-mono whitespace-pre-wrap">
                    {liveTranscript || "Say something..."}
                </div>
                <button onClick={toggleLiveMode} className="mt-8 px-8 py-3 bg-red-500 rounded-full font-bold hover:bg-red-600 transition-colors">
                    End Session
                </button>
            </div>
        )}

        {/* Controls Bar */}
        <div className="flex-shrink-0 flex flex-col gap-3 p-2 bg-gray-50/80 md:bg-white/50 rounded-2xl border border-gray-200/60 mb-2">
            <div className="flex-1 overflow-x-auto flex gap-1 no-scrollbar">
                {Object.values(ChatPersona).map((p) => (
                    <button
                        key={p}
                        onClick={() => setPersona(p)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                            persona === p 
                                ? p === ChatPersona.VISUAL_CREATOR 
                                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-lg' 
                                    : p === ChatPersona.CUSTOM
                                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg'
                                        : 'bg-indigo-600 text-white shadow' 
                                : 'bg-white text-gray-600 hover:bg-indigo-50 border border-gray-100'
                        }`}
                    >
                        {p === ChatPersona.VISUAL_CREATOR && <i className="fas fa-magic mr-1"></i>}
                        {p === ChatPersona.CUSTOM && <i className="fas fa-user-edit mr-1"></i>}
                        {p}
                    </button>
                ))}
            </div>
            
            {/* Custom Persona Configuration Panel */}
            {persona === ChatPersona.CUSTOM && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 animate-fade-in">
                    <h4 className="text-xs font-bold text-emerald-800 mb-2 flex items-center gap-2">
                        <i className="fas fa-robot"></i> Configure Identity
                        {customPersonaInstruction && <span className="text-[10px] bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full">Active</span>}
                    </h4>
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            value={customPersonaInput}
                            onChange={(e) => setCustomPersonaInput(e.target.value)}
                            placeholder="Describe persona (e.g. 'A sarcastic pirate who loves coding')"
                            className="flex-1 text-sm p-2 rounded-lg border border-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <button 
                            onClick={handleGeneratePersona}
                            disabled={isGeneratingPersona || !customPersonaInput}
                            className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {isGeneratingPersona ? <i className="fas fa-spinner fa-spin"></i> : 'Create'}
                        </button>
                    </div>
                </div>
            )}

            <div className="flex items-center gap-2 border-t border-gray-200 pt-2">
                <button 
                    onClick={() => setProvider(provider === LLMProvider.GEMINI ? LLMProvider.HUGGING_FACE : LLMProvider.GEMINI)}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 hover:border-indigo-300 transition-colors"
                >
                    <i className={`fas ${provider === LLMProvider.GEMINI ? 'fa-gem' : 'fa-robot'} ${provider === LLMProvider.GEMINI ? 'text-indigo-600' : 'text-orange-500'}`}></i>
                    {provider === LLMProvider.GEMINI ? 'Gemini' : 'Mistral'}
                </button>

                 {/* RAG Toggle */}
                {!file && (
                    <button 
                        onClick={() => setUseRAG(!useRAG)}
                        className={`w-12 h-6 rounded-full relative transition-colors flex items-center px-1 flex-shrink-0 ${useRAG ? 'bg-emerald-500' : 'bg-gray-300'}`}
                        title={`Knowledge Base RAG: ${useRAG ? 'ON' : 'OFF'}`}
                    >
                        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${useRAG ? 'translate-x-6' : 'translate-x-0'}`}></div>
                        <span className={`absolute text-[9px] font-bold text-white ${useRAG ? 'left-1.5' : 'right-1.5'}`}>{useRAG ? 'KB' : 'OFF'}</span>
                    </button>
                )}
            </div>
        </div>

        {/* Chat Messages Area */}
        <div className={`flex-1 overflow-y-auto px-1 py-2 space-y-4 md:bg-white/40 md:rounded-3xl scroll-smooth ${persona === ChatPersona.VISUAL_CREATOR ? 'border-2 border-pink-100' : ''}`}>
            {messages.map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm ${
                        msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-800 border border-gray-100'
                    }`}>
                        <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
                        
                        {/* Render Images */}
                        {msg.generatedImage && (
                            <div className="mt-3 rounded-xl overflow-hidden shadow-lg border border-gray-200">
                                <img src={`data:image/png;base64,${msg.generatedImage}`} alt="Generated" className="w-full h-auto" />
                            </div>
                        )}

                        {/* Render Videos */}
                        {msg.generatedVideo && (
                            <div className="mt-3 rounded-xl overflow-hidden shadow-lg border border-gray-200">
                                <video controls src={msg.generatedVideo} className="w-full h-auto bg-black" />
                            </div>
                        )}

                        {/* Render Sources */}
                        {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-black/5 flex flex-wrap gap-2">
                                {msg.sources.map((src, i) => (
                                    <a 
                                        key={i} 
                                        href={src.uri} 
                                        target="_blank" 
                                        title={src.uri} 
                                        className="text-[10px] bg-black/5 px-2 py-1 rounded truncate max-w-[150px] hover:bg-black/10 transition-colors flex items-center gap-1"
                                    >
                                        <i className={`fas ${src.uri.includes('maps') || src.title.includes('Map') ? 'fa-map-marker-alt text-red-500' : 'fa-external-link-alt text-blue-500'}`}></i> 
                                        {src.title}
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-2 mt-1 px-1">
                        <span className="text-[10px] text-gray-400">{msg.role === 'user' ? 'You' : `${persona} • ${msg.provider || provider}`}</span>
                        {msg.role === 'model' && (
                            <button onClick={() => speakText(msg.content)} className="text-gray-400 hover:text-indigo-600">
                                <i className="fas fa-volume-up text-xs"></i>
                            </button>
                        )}
                    </div>
                </div>
            ))}
            <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <div className="flex-shrink-0 py-2 bg-white md:bg-transparent border-t border-gray-100 md:border-none z-10">
            {/* Pending Attachments View */}
            {(links.length > 0 || file) && (
                <div className="flex gap-2 px-3 pb-2 overflow-x-auto no-scrollbar">
                    {file && (
                        <div 
                            className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-1 rounded-lg text-xs"
                            title={`File: ${file.name}\nSize: ${(file.size / 1024).toFixed(1)} KB`}
                        >
                            <i className="fas fa-file"></i> 
                            <span className="truncate max-w-[100px]">{file.name}</span>
                            <button onClick={() => setFile(null)} className="hover:text-red-500"><i className="fas fa-times"></i></button>
                        </div>
                    )}
                    {links.map((link, i) => (
                        <div 
                            key={i} 
                            className="flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-700 px-2 py-1 rounded-lg text-xs"
                            title={link}
                        >
                            <i className="fas fa-link"></i>
                            <span className="truncate max-w-[150px]">{link}</span>
                            <button onClick={() => removeLink(i)} className="hover:text-red-500"><i className="fas fa-times"></i></button>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex items-center gap-2 bg-white border border-gray-200 p-1.5 rounded-full shadow-lg relative">
                
                {/* Visual Tool Hint */}
                {persona === ChatPersona.VISUAL_CREATOR && (
                    <div className="absolute -top-8 left-0 right-0 text-center">
                        <span className="bg-pink-100 text-pink-700 text-[10px] font-bold px-3 py-1 rounded-full border border-pink-200 animate-bounce">
                            Visual Mode Active: Upload image to animate with Veo
                        </span>
                    </div>
                )}

                <label className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-indigo-600 cursor-pointer rounded-full hover:bg-gray-50 transition-colors" title={file ? "Change File" : "Attach File"}>
                    <input type="file" className="hidden" accept=".pdf,.doc,.docx,.txt,image/*" onChange={handleFileUpload} />
                    <i className={`fas ${file ? 'fa-check text-green-500' : 'fa-paperclip'}`}></i>
                </label>

                <div className="relative">
                    <button onClick={() => setIsLinkInputOpen(!isLinkInputOpen)} className={`w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-50 ${links.length > 0 ? 'text-blue-500' : 'text-gray-400 hover:text-blue-500'}`} title="Add Link">
                        <i className="fas fa-link"></i>
                    </button>
                    {isLinkInputOpen && (
                        <div className="absolute bottom-12 left-0 z-50 bg-white p-2 rounded-xl shadow-xl border border-gray-200 w-64 animate-fade-in">
                            <input 
                                type="text" 
                                value={linkInput}
                                onChange={(e) => setLinkInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (setLinks(prev => [...prev, linkInput]), setLinkInput(''), setIsLinkInputOpen(false))}
                                placeholder="Paste URL..."
                                className="w-full text-xs border border-gray-200 rounded p-2 mb-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                                autoFocus
                            />
                        </div>
                    )}
                </div>

                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    disabled={isProcessing}
                    placeholder={persona === ChatPersona.VISUAL_CREATOR ? "Describe image or video..." : "Message..."}
                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 px-1 text-gray-800"
                />

                {/* Dictation Button with Error Tooltip */}
                <div className="relative">
                    {speechError && (
                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-red-500 text-white text-[10px] px-2 py-1 rounded shadow-lg animate-fade-in z-50">
                            {speechError}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-red-500"></div>
                        </div>
                    )}
                    <button 
                        onClick={toggleDictation}
                        className={`w-10 h-10 rounded-full flex-shrink-0 transition-colors ${isDictating ? 'text-red-500 animate-pulse' : 'text-gray-400 hover:text-indigo-600'}`}
                        title="Voice Typing"
                    >
                         <i className={`fas ${isDictating ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
                    </button>
                </div>

                {/* Live Button */}
                <button onClick={toggleLiveMode} className="w-10 h-10 rounded-full flex-shrink-0 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Start Live Conversation">
                     <i className="fas fa-headset"></i>
                </button>

                <button onClick={() => handleSendMessage()} disabled={!inputValue.trim()} className={`w-10 h-10 text-white rounded-full shadow-md flex items-center justify-center flex-shrink-0 disabled:bg-gray-300 transition-colors ${persona === ChatPersona.VISUAL_CREATOR ? 'bg-pink-600 hover:bg-pink-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                    {isProcessing ? <i className="fas fa-spinner fa-spin text-xs"></i> : <i className="fas fa-arrow-up text-sm"></i>}
                </button>
            </div>
        </div>
    </div>
  );
};

export default IntelligentChat;
