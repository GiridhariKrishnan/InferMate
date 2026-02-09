import React, { useState, useEffect, useRef } from 'react';
import { TranslationMode, SUPPORTED_LANGUAGES, Tier } from '../types';
import { translateText, translateDocument, speakText, extractTextFromImage } from '../services/geminiService';
import { useTier } from '../contexts/TierContext';
import { createWorker } from 'tesseract.js';

// Polyfill type for SpeechRecognition
declare global {
    interface Window {
        webkitSpeechRecognition: any;
        SpeechRecognition: any;
    }
}

interface AttachedFile {
    name: string;
    mimeType: string;
    data: string; // Base64 (for binary) OR Raw Text (for text files)
    isBinary: boolean;
}

interface TranslatorProps {
    onSendToChat: (text: string, isRAG: boolean) => void;
}

const getTesseractLang = (code: string) => {
    // Extended language support
    const map: Record<string, string> = {
        'en': 'eng', 'es': 'spa', 'fr': 'fra', 'de': 'deu',
        'it': 'ita', 'pt': 'por', 'ru': 'rus', 'zh': 'chi_sim',
        'ja': 'jpn', 'ko': 'kor', 'hi': 'hin', 'bn': 'ben',
        'ar': 'ara', 'tr': 'tur', 'pl': 'pol', 'nl': 'nld'
    };
    return map[code] || 'eng';
};

// Simple stop-word based language detection
const STOP_WORDS: Record<string, string[]> = {
    'en': ['the', 'and', 'is', 'in', 'to', 'of', 'it', 'you', 'that', 'for'],
    'es': ['el', 'la', 'de', 'que', 'en', 'y', 'a', 'los', 'del', 'las', 'por', 'un'],
    'fr': ['le', 'la', 'les', 'de', 'et', 'est', 'un', 'une', 'du', 'en', 'qui'],
    'de': ['der', 'die', 'das', 'und', 'ist', 'in', 'zu', 'den', 'von', 'mit'],
    'it': ['il', 'la', 'che', 'di', 'e', 'in', 'un', 'per', 'sono', 'mi'],
    'pt': ['o', 'a', 'de', 'que', 'e', 'do', 'da', 'em', 'um', 'para']
};

const detectLanguage = (text: string): string | null => {
    const lowerText = text.toLowerCase();
    const tokens = lowerText.split(/[\s,.;!?]+/);
    
    let bestLang = null;
    let maxMatches = 0;

    for (const [lang, words] of Object.entries(STOP_WORDS)) {
        const matches = tokens.filter(t => words.includes(t)).length;
        if (matches > maxMatches) {
            maxMatches = matches;
            bestLang = lang;
        }
    }
    // Require at least 2 stop word matches to be confident enough to switch
    return maxMatches >= 2 ? bestLang : null;
};

const Translator: React.FC<TranslatorProps> = ({ onSendToChat }) => {
  const { tierConfig, currentTier } = useTier();

  const [sourceText, setSourceText] = useState('');
  const [targetText, setTargetText] = useState('');
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('es');
  const [mode, setMode] = useState<TranslationMode>(TranslationMode.TRANSLATE);
  const [isVerbose, setIsVerbose] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  
  // Camera State
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [isOcrInitializing, setIsOcrInitializing] = useState(false);
  const [ocrConfidence, setOcrConfidence] = useState(0);
  const [isCloudProcessing, setIsCloudProcessing] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // For capturing frame
  const overlayRef = useRef<HTMLCanvasElement>(null); // For drawing boxes
  const recognitionRef = useRef<any>(null);
  const workerRef = useRef<any>(null);
  const ocrIntervalRef = useRef<any>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        try {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = false;

            recognitionRef.current.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript;
                setSourceText(transcript);
                setIsListening(false);
            };

            recognitionRef.current.onerror = (event: any) => {
                console.error("Speech Recognition Error:", event.error);
                setIsListening(false);
            };
            
            recognitionRef.current.onend = () => {
                setIsListening(false);
            };
        } catch (e) {
            console.error("Speech Recognition setup failed:", e);
        }
    }
  }, []);

  // Debounce translation trigger for text
  useEffect(() => {
    const timer = setTimeout(() => {
      if (sourceText.length > 1 && !attachedFile) { 
        handleProcess();
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [sourceText, sourceLang, targetLang, mode, isVerbose]);

  // Handle Camera Stream & OCR
  useEffect(() => {
    let stream: MediaStream | null = null;
    
    const startCameraAndOCR = async () => {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' } 
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }

            // Init OCR Worker
            setIsOcrInitializing(true);
            
            // If auto, try to load a multi-lang model for detection purposes
            const tLang = sourceLang === 'auto' 
                ? 'eng+spa+fra+deu' 
                : getTesseractLang(sourceLang);
            
            if (workerRef.current) {
                await workerRef.current.terminate();
            }

            const worker = await createWorker(tLang);
            workerRef.current = worker;
            setIsOcrInitializing(false);

            // Start OCR Loop
            ocrIntervalRef.current = setInterval(async () => {
                if (videoRef.current && canvasRef.current && workerRef.current && !isCloudProcessing) {
                    const video = videoRef.current;
                    const canvas = canvasRef.current;
                    const overlay = overlayRef.current;
                    
                    if (video.readyState === video.HAVE_ENOUGH_DATA) {
                        // Capture Frame
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                        const ctx = canvas.getContext('2d');
                        if (!ctx) return;
                        
                        // --- PREPROCESSING FOR TESSERACT ---
                        // Apply contrast and saturation filter to improve edge detection
                        ctx.filter = 'contrast(1.4) grayscale(1) brightness(1.1)';
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        ctx.filter = 'none'; // Reset

                        const dataUrl = canvas.toDataURL('image/jpeg', 0.6); // Slightly higher quality
                        
                        try {
                            const { data } = await workerRef.current.recognize(dataUrl);
                            
                            // Auto-detect Language logic
                            if (sourceLang === 'auto' && data.text.trim().length > 15) {
                                const detected = detectLanguage(data.text);
                                if (detected) {
                                    setSourceLang(detected);
                                    return;
                                }
                            }

                            if (data.text.trim().length > 1) {
                                setOcrText(data.text.trim());
                                setOcrConfidence(data.confidence);
                            }

                            // Draw Bounding Boxes on Overlay
                            if (overlay) {
                                overlay.width = video.clientWidth;
                                overlay.height = video.clientHeight;
                                const oCtx = overlay.getContext('2d');
                                if (oCtx) {
                                    oCtx.clearRect(0, 0, overlay.width, overlay.height);
                                    
                                    const scaleX = overlay.width / video.videoWidth;
                                    const scaleY = overlay.height / video.videoHeight;
                                    
                                    data.words.forEach((word: any) => {
                                        if (word.confidence > 50) {
                                            const { x0, y0, x1, y1 } = word.bbox;
                                            const w = (x1 - x0) * scaleX;
                                            const h = (y1 - y0) * scaleY;
                                            const x = x0 * scaleX;
                                            const y = y0 * scaleY;
                                            
                                            // Enhanced Visuals: Neural HUD Style
                                            oCtx.fillStyle = `rgba(0, 255, 255, 0.15)`;
                                            oCtx.fillRect(x, y, w, h);

                                            oCtx.strokeStyle = "#06B6D4"; // Cyan-500
                                            oCtx.lineWidth = 2;
                                            oCtx.strokeRect(x, y, w, h);
                                        }
                                    });
                                }
                            }

                        } catch (e) {
                            // console.debug("OCR Frame Error", e);
                        }
                    }
                }
            }, 800); // Slower interval to allow processing

        } catch (err) {
            console.error("Error accessing camera or OCR:", err);
            alert("Could not access camera or initialize OCR.");
            setIsCameraOpen(false);
        }
    };

    if (isCameraOpen) {
        startCameraAndOCR();
    } else {
        if (ocrIntervalRef.current) clearInterval(ocrIntervalRef.current);
        if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
        }
        setOcrText('');
    }

    return () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        if (ocrIntervalRef.current) clearInterval(ocrIntervalRef.current);
        if (workerRef.current) workerRef.current.terminate();
    };
  }, [isCameraOpen, sourceLang]);

  const handleCloudOCR = async () => {
    if (videoRef.current && canvasRef.current) {
        setIsCloudProcessing(true);
        const video = videoRef.current;
        const canvas = canvasRef.current;
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(video, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            const base64Data = dataUrl.split(',')[1];
            
            const text = await extractTextFromImage(base64Data, 'image/jpeg');
            if (text) {
                setOcrText(text);
                setOcrConfidence(99); // Cloud confidence assumed high
            }
        }
        setIsCloudProcessing(false);
    }
  };

  const capturePhoto = () => {
      if (videoRef.current && canvasRef.current) {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
              ctx.drawImage(video, 0, 0);
              const dataUrl = canvas.toDataURL('image/jpeg');
              const base64Data = dataUrl.split(',')[1];
              
              setAttachedFile({
                  name: `capture_${Date.now()}.jpg`,
                  mimeType: 'image/jpeg',
                  data: base64Data,
                  isBinary: true
              });
              setIsCameraOpen(false);
              setTargetText('');
          }
      }
  };

  const useScannedText = () => {
      if (ocrText) {
          setSourceText(ocrText);
          setIsCameraOpen(false);
      }
  };

  const handleProcess = async () => {
    if (!sourceText.trim() && !attachedFile) return;
    setIsLoading(true);
    let result = "";

    try {
        if (attachedFile) {
            result = await translateDocument(
                { data: attachedFile.data, mimeType: attachedFile.mimeType, isBinary: attachedFile.isBinary },
                sourceLang, targetLang, mode, isVerbose
            );
        } else {
            result = await translateText(sourceText, sourceLang, targetLang, mode, isVerbose);
        }
        setTargetText(result);
    } catch (e) {
        setTargetText("Error processing request. Please try again.");
    } finally {
        setIsLoading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
          if (file.size > tierConfig.maxFileSizeMB * 1024 * 1024) {
              alert(`File too large for ${currentTier} tier.`);
              return;
          }
          const reader = new FileReader();
          reader.onload = (e) => {
              const content = e.target?.result as string;
              setAttachedFile({
                  name: file.name,
                  mimeType: file.type || 'text/plain',
                  data: file.type.startsWith('image/') || file.type.includes('pdf') ? content.split(',')[1] : content,
                  isBinary: file.type.startsWith('image/') || file.type.includes('pdf')
              });
              setTargetText('');
          };
          if (file.type.startsWith('image/') || file.type.includes('pdf')) reader.readAsDataURL(file);
          else reader.readAsText(file);
      }
  };

  const handleRemoveFile = () => { setAttachedFile(null); setTargetText(''); };
  const handleDownload = () => {
      if (!targetText) return;
      const element = document.createElement("a");
      const file = new Blob([targetText], {type: 'text/plain'});
      element.href = URL.createObjectURL(file);
      element.download = "translation.txt";
      document.body.appendChild(element); element.click(); document.body.removeChild(element);
  };
  const toggleListening = () => {
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); }
    else { recognitionRef.current?.start(); setIsListening(true); }
  };
  const handleSpeak = async () => {
      if (!targetText) return;
      setIsPlaying(true);
      await speakText(targetText);
      setIsPlaying(false);
  };
  const handleSwap = () => {
    if (sourceLang === 'auto') return;
    const oldSource = sourceLang; setSourceLang(targetLang); setTargetLang(oldSource);
    if (!attachedFile) { setSourceText(targetText); setTargetText(sourceText); }
  };
  const getButtonLabel = () => {
      if (attachedFile?.mimeType.startsWith('image/')) return 'Analyze Image';
      return mode === TranslationMode.TRANSLITERATE ? 'Transliterate Doc' : 'Translate Doc';
  };

  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-900">Source Language (OCR)</label>
          <select 
            value={sourceLang}
            onChange={(e) => setSourceLang(e.target.value)}
            className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-gray-900"
          >
            {SUPPORTED_LANGUAGES.map(l => (
              <option key={`src-${l.code}`} value={l.code}>{l.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2 justify-center items-center">
            <button onClick={handleSwap} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors">
                <i className="fas fa-exchange-alt"></i>
            </button>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-900">Target Language</label>
          <select 
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-gray-900"
          >
            {SUPPORTED_LANGUAGES.filter(l => l.code !== 'auto').map(l => (
              <option key={`tgt-${l.code}`} value={l.code}>{l.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Mode & Verbose Toggles */}
      <div className="flex flex-col items-center gap-3">
        <div className="bg-gray-200 p-1 rounded-full flex gap-1 relative shadow-inner">
             <button onClick={() => setMode(TranslationMode.TRANSLATE)} className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${mode === TranslationMode.TRANSLATE ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-300/50'}`}>Translate</button>
             <button onClick={() => setMode(TranslationMode.TRANSLITERATE)} className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${mode === TranslationMode.TRANSLITERATE ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-300/50'}`}>Transliterate</button>
        </div>
        
        <button 
            onClick={() => setIsVerbose(!isVerbose)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${
                isVerbose 
                ? 'bg-purple-100 text-purple-700 border-purple-300' 
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}
        >
            <i className={`fas ${isVerbose ? 'fa-toggle-on' : 'fa-toggle-off'}`}></i>
            Verbose Mode
        </button>
      </div>

      {/* Text Areas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
        
        {/* Camera Modal Overlay */}
        {isCameraOpen && (
            <div className="absolute inset-0 z-50 bg-black/95 rounded-2xl flex flex-col items-center justify-center p-4 animate-fade-in">
                <div className="relative w-full max-w-md aspect-[3/4] bg-black rounded-xl overflow-hidden border border-gray-700 shadow-2xl">
                    <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        muted
                        className="w-full h-full object-fill" 
                    />
                    <canvas ref={canvasRef} className="hidden" /> {/* Hidden canvas for extraction */}
                    <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" /> {/* Visible overlay for boxes */}
                    
                    {/* OCR Text Preview Overlay */}
                    <div className="absolute bottom-4 left-4 right-4 bg-gray-900/80 backdrop-blur-md p-4 rounded-xl border border-gray-700">
                        {isOcrInitializing ? (
                            <div className="flex items-center gap-2 text-indigo-400">
                                <i className="fas fa-circle-notch fa-spin"></i>
                                <span className="text-sm font-medium">Initializing Neural OCR ({sourceLang})...</span>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="flex justify-between items-center text-xs text-gray-400 uppercase tracking-wider font-bold">
                                    <span>Detected Text</span>
                                    {ocrConfidence > 0 && <span>Conf: {ocrConfidence.toFixed(0)}%</span>}
                                </div>
                                <p className="text-white text-sm font-mono min-h-[40px] max-h-[100px] overflow-y-auto">
                                    {isCloudProcessing ? (
                                        <span className="text-indigo-400 flex items-center gap-2">
                                            <i className="fas fa-magic fa-spin"></i> Enhancing with Gemini Vision...
                                        </span>
                                    ) : (
                                        ocrText || <span className="text-gray-600 italic">Scanning...</span>
                                    )}
                                </p>
                                
                                <div className="flex gap-2">
                                    {ocrText && (
                                        <button 
                                            onClick={useScannedText}
                                            className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-500 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <i className="fas fa-check"></i> Accept
                                        </button>
                                    )}
                                    <button 
                                        onClick={handleCloudOCR}
                                        disabled={isCloudProcessing}
                                        className="bg-gray-700 text-indigo-300 px-3 py-2 rounded-lg text-sm font-bold hover:bg-gray-600 transition-colors flex items-center justify-center gap-2 border border-gray-600"
                                        title="Use Gemini Vision for higher accuracy"
                                    >
                                        <i className="fas fa-cloud"></i> Enhanced Scan
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="flex gap-4 mt-6">
                    <button 
                        onClick={() => setIsCameraOpen(false)}
                        className="px-6 py-3 rounded-full bg-gray-800 text-white font-bold hover:bg-gray-700 transition-colors border border-gray-700"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={capturePhoto}
                        className="px-6 py-3 rounded-full bg-white text-black font-bold hover:bg-gray-200 transition-colors flex items-center gap-2 shadow-lg shadow-white/20"
                    >
                        <i className="fas fa-camera"></i> Capture & Translate
                    </button>
                </div>
                <p className="text-gray-500 text-[10px] mt-4">
                    Tesseract Live OCR + Gemini Vision Cloud
                </p>
            </div>
        )}

        {/* SOURCE AREA */}
        <div className="relative group h-full">
            <div className="flex justify-between mb-2">
                <span className="text-sm font-semibold text-gray-600">Source</span>
                <div className="flex gap-2">
                     <button onClick={() => setIsCameraOpen(true)} disabled={!!attachedFile} className={`text-xs flex items-center gap-1 font-bold transition-colors ${attachedFile ? 'opacity-30' : 'text-gray-500 hover:text-indigo-600'}`}>
                        <i className="fas fa-camera"></i> Camera
                    </button>
                     <label className={`cursor-pointer text-xs flex items-center gap-1 font-bold transition-colors ${attachedFile ? 'text-indigo-600' : 'text-gray-500 hover:text-indigo-600'}`}>
                        <input type="file" className="hidden" accept={tierConfig.allowedMimeTypes.join(',')} onChange={handleFileUpload} />
                        <i className="fas fa-paperclip"></i> {attachedFile ? ' Change' : ' Attach'}
                    </label>
                    <button onClick={toggleListening} disabled={!!attachedFile} className={`text-xs flex items-center gap-1 font-bold transition-colors ${isListening ? 'text-red-600 animate-pulse' : 'text-gray-500 hover:text-indigo-600'}`}>
                        <i className={`fas fa-microphone${isListening ? '' : '-slash'}`}></i> Voice
                    </button>
                </div>
            </div>
            
            <div className="relative w-full h-80">
                {attachedFile ? (
                    <div className="absolute inset-0 z-10 bg-indigo-50 border-2 border-indigo-200 border-dashed rounded-2xl flex flex-col items-center justify-center p-6 text-center animate-fade-in">
                        <div className="bg-white p-4 rounded-full shadow-sm mb-3 text-indigo-600 text-2xl"><i className={`fas ${attachedFile.mimeType.startsWith('image/') ? 'fa-image' : 'fa-file-alt'}`}></i></div>
                        <h4 className="font-bold text-gray-900 break-all max-w-full mb-1">{attachedFile.name}</h4>
                        {attachedFile.mimeType.startsWith('image/') && (
                             <div className="w-20 h-20 mb-4 rounded-lg overflow-hidden border border-gray-300 shadow-sm">
                                 <img src={`data:${attachedFile.mimeType};base64,${attachedFile.data}`} alt="Preview" className="w-full h-full object-cover" />
                             </div>
                        )}
                        <div className="flex gap-2">
                             <button onClick={handleProcess} disabled={isLoading} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-sm">{isLoading ? <i className="fas fa-spinner fa-spin"></i> : getButtonLabel()}</button>
                             <button onClick={handleRemoveFile} className="bg-white text-red-500 border border-red-200 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-50">Remove</button>
                        </div>
                    </div>
                ) : (
                    <textarea value={sourceText} onChange={(e) => setSourceText(e.target.value)} placeholder="Enter text or use camera..." className="w-full h-full p-5 rounded-2xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none resize-none shadow-inner text-lg bg-white text-gray-900"></textarea>
                )}
            </div>
        </div>

        {/* TARGET AREA */}
        <div className="relative group h-full">
            <div className="flex justify-between mb-2">
                <span className="text-sm font-semibold text-gray-600">Result</span>
                <div className="flex gap-3">
                     <button onClick={handleDownload} disabled={!targetText} className={`text-xs font-bold flex items-center gap-1 ${targetText ? 'text-indigo-600' : 'text-gray-300'}`}><i className="fas fa-download"></i> Download</button>
                     <button onClick={handleSpeak} disabled={!targetText} className={`text-xs font-bold flex items-center gap-1 ${isPlaying ? 'text-green-600' : 'text-gray-500 hover:text-indigo-600'}`}><i className={`fas fa-volume-${isPlaying ? 'up' : 'off'}`}></i> Listen</button>
                     <button onClick={() => navigator.clipboard.writeText(targetText)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"><i className="fas fa-copy mr-1"></i> Copy</button>
                </div>
            </div>
            
            {/* Action Buttons for Chat Integration */}
            {targetText && (
                <div className="absolute bottom-5 right-5 z-20 flex gap-2">
                     <button 
                        onClick={() => onSendToChat(targetText, false)}
                        className="bg-white text-gray-700 border border-gray-300 shadow-lg px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-50 transition-all flex items-center gap-1"
                        title="Paste to Chat Input"
                    >
                        <i className="fas fa-comment-alt"></i> Use in Chat
                    </button>
                    <button 
                        onClick={() => onSendToChat(targetText, true)}
                        className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg px-3 py-1.5 rounded-lg text-xs font-bold hover:from-indigo-600 hover:to-purple-700 transition-all flex items-center gap-1"
                        title="Analyze using RAG"
                    >
                        <i className="fas fa-brain"></i> Analyze (RAG)
                    </button>
                </div>
            )}
            
            <textarea readOnly value={targetText} placeholder="Translation will appear here..." className="w-full h-80 p-5 rounded-2xl border border-gray-300 bg-white text-gray-900 resize-none shadow-sm focus:outline-none text-lg pb-14"></textarea>
        </div>
      </div>
    </div>
  );
};

export default Translator;