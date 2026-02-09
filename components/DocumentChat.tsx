import React, { useState, useRef, useEffect } from 'react';
import { UploadedFile, ChatMessage } from '../types';
import { chatWithDocument, analyzeDocument } from '../services/geminiService';

const DocumentChat: React.FC = () => {
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];
    if (uploadedFile) {
        setIsProcessing(true);
        // Simple text extraction for demo (In prod, use pdf.js for PDFs)
        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            setFile({
                name: uploadedFile.name,
                mimeType: uploadedFile.type,
                size: uploadedFile.size,
                content: text,
                isBinary: false // Assuming text for this demo component as per original code logic
            });
            // Initial greeting
            setMessages([{
                id: 'init',
                role: 'model',
                content: `I've ingested "${uploadedFile.name}". Truth Guard™ is active. You can now ask questions specifically about this document.`,
                timestamp: Date.now()
            }]);
            setIsProcessing(false);
        };
        reader.readAsText(uploadedFile);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !file) return;

    const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: inputValue,
        timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsProcessing(true);

    // Format history for Gemini
    const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
    }));

    const responseText = await chatWithDocument(inputValue, file.content, history);

    const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: responseText,
        timestamp: Date.now()
    };

    setMessages(prev => [...prev, botMsg]);
    setIsProcessing(false);
  };

  const runQuickAction = async (action: 'summary' | 'questions' | 'keywords') => {
      if (!file) return;
      setIsProcessing(true);
      const res = await analyzeDocument(file, action);
      
      const botMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'model',
        content: `**${action.toUpperCase()}**: \n${res}`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, botMsg]);
      setIsProcessing(false);
  };

  if (!file) {
      return (
          <div className="flex flex-col items-center justify-center h-[500px] border-2 border-dashed border-indigo-300 rounded-3xl bg-indigo-50/50 hover:bg-indigo-50 transition-all">
              <div className="bg-white p-6 rounded-full shadow-lg mb-4">
                  <i className="fas fa-file-upload text-4xl text-indigo-600"></i>
              </div>
              <h3 className="text-xl font-bold text-gray-700 mb-2">Activate Truth Guard™</h3>
              <p className="text-gray-500 mb-6 text-center max-w-md">Upload a document (TXT for this demo) to ground the AI in your specific data. Prevents hallucinations by strictly adhering to source material.</p>
              <label className="cursor-pointer bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-lg hover:shadow-xl transition-all">
                  Upload Document
                  <input type="file" className="hidden" accept=".txt,.md,.json,.csv" onChange={handleFileUpload} />
              </label>
              <p className="mt-4 text-xs text-gray-400">Supported: TXT, MD, CSV (PDF support in Pro version)</p>
          </div>
      );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[600px]">
        {/* Sidebar Actions */}
        <div className="lg:col-span-1 space-y-4">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                    <div className="bg-green-100 text-green-600 p-2 rounded-lg">
                        <i className="fas fa-file-alt"></i>
                    </div>
                    <div className="overflow-hidden">
                        <h4 className="font-bold text-sm truncate">{file.name}</h4>
                        <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                </div>
                <button 
                    onClick={() => setFile(null)}
                    className="text-xs text-red-500 hover:text-red-700 w-full text-left mt-2"
                >
                    <i className="fas fa-trash mr-1"></i> Remove File
                </button>
            </div>

            <div className="bg-indigo-900 text-white p-4 rounded-xl shadow-lg">
                <h4 className="font-bold text-sm mb-3 opacity-80 uppercase tracking-wider">Quick Actions</h4>
                <div className="space-y-2">
                    <button onClick={() => runQuickAction('summary')} className="w-full text-left px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors">
                        <i className="fas fa-list-ul mr-2"></i> Summarize
                    </button>
                    <button onClick={() => runQuickAction('questions')} className="w-full text-left px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors">
                        <i className="fas fa-question-circle mr-2"></i> Gen. Questions
                    </button>
                    <button onClick={() => runQuickAction('keywords')} className="w-full text-left px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors">
                        <i className="fas fa-key mr-2"></i> Extract Keywords
                    </button>
                </div>
            </div>
        </div>

        {/* Chat Area */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/50">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl p-4 shadow-sm ${
                            msg.role === 'user' 
                                ? 'bg-indigo-600 text-white rounded-tr-none' 
                                : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none'
                        }`}>
                            {msg.role === 'model' && (
                                <div className="mb-1 text-xs font-bold text-indigo-500 uppercase flex items-center gap-1">
                                    <i className="fas fa-shield-alt"></i> Truth Guard
                                </div>
                            )}
                            <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
                        </div>
                    </div>
                ))}
                <div ref={chatEndRef} />
            </div>

            <div className="p-4 bg-white border-t border-gray-100">
                <div className="flex gap-2 relative">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        disabled={isProcessing}
                        placeholder={isProcessing ? "Thinking..." : "Ask Truth Guard™ about this document..."}
                        className="flex-1 p-3 pl-4 rounded-xl border border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all"
                    />
                    <button 
                        onClick={handleSendMessage}
                        disabled={isProcessing || !inputValue.trim()}
                        className="bg-indigo-600 text-white px-6 rounded-xl hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                        {isProcessing ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};

export default DocumentChat;