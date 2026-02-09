import React, { useState } from 'react';
import { AppMode, Tier, TIER_CONFIGS } from './types';
import Translator from './components/Translator';
import IntelligentChat from './components/IntelligentChat';
import KnowledgeBase from './components/KnowledgeBase';
import { useTier } from './contexts/TierContext';
import { vectorStore } from './services/vectorStore';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppMode>(AppMode.TRANSLATOR);
  const { currentTier, setTier, tierConfig } = useTier();
  
  // Bridge State to pass data from Translator to Chat
  const [chatInitialMessage, setChatInitialMessage] = useState<string>('');

  const handleTranslationToChat = async (text: string, isRAG: boolean) => {
    if (isRAG) {
        // RAG Mode: Index the translation and prompt chat to analyze it
        try {
            const count = await vectorStore.addDocument(text, "Translation Result", "User Translation");
            if (count > 0) {
                setChatInitialMessage("I have analyzed the translation text you sent to the Knowledge Base. Please summarize it.");
            } else {
                alert("Could not create knowledge vectors from this translation. Please try again.");
                setChatInitialMessage(text); // Fallback to pasting text directly
            }
        } catch (e) {
            console.error("RAG Handoff Error", e);
            alert("Error adding translation to Knowledge Base.");
            setChatInitialMessage(text); // Fallback
        }
    } else {
        // Direct Mode: Paste text into chat input
        setChatInitialMessage(text);
    }
    setActiveTab(AppMode.INTELLIGENT_CHAT);
  };

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 flex justify-center items-start">
      <div className="w-full max-w-7xl animate-fade-in">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-6">
            <div className="text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-3 mb-1">
                    <div className="w-12 h-12 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30 text-white text-2xl">
                        <i className="fas fa-brain"></i>
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">
                            InferMate
                        </h1>
                        <div className="text-xs font-semibold text-indigo-300 uppercase tracking-widest">
                            Hybrid Intelligence Platform
                        </div>
                    </div>
                </div>
            </div>

            {/* Tier Selector Pill */}
            <div className="bg-white/5 backdrop-blur-md p-1.5 rounded-2xl border border-white/10 flex items-center gap-4 shadow-xl">
                <div className="hidden sm:flex flex-col items-end px-3">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Plan</span>
                    <span className="text-xs text-white font-medium">Max: {tierConfig.maxFileSizeMB}MB</span>
                </div>
                <div className="flex bg-black/20 rounded-xl p-1 gap-1">
                    {Object.values(Tier).map((tier) => (
                        <button
                            key={tier}
                            onClick={() => setTier(tier)}
                            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all duration-300 ${
                                currentTier === tier 
                                ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg' 
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            {tier}
                        </button>
                    ))}
                </div>
            </div>
        </div>

        {/* Main Content Card */}
        <div className="bg-white/80 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/40 overflow-hidden flex flex-col min-h-[750px]">
            
            {/* Navigation Tabs */}
            <div className="flex border-b border-gray-200/50 px-6 pt-4 gap-6 overflow-x-auto">
                <button 
                    onClick={() => setActiveTab(AppMode.TRANSLATOR)}
                    className={`pb-4 px-2 text-sm font-semibold flex items-center gap-2 transition-all relative ${
                        activeTab === AppMode.TRANSLATOR 
                        ? 'text-indigo-600' 
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                >
                    <i className="fas fa-language text-lg"></i> Neural Translator
                    {activeTab === AppMode.TRANSLATOR && (
                        <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-t-full animate-slide-up"></span>
                    )}
                </button>
                <button 
                    onClick={() => setActiveTab(AppMode.INTELLIGENT_CHAT)}
                    className={`pb-4 px-2 text-sm font-semibold flex items-center gap-2 transition-all relative ${
                        activeTab === AppMode.INTELLIGENT_CHAT 
                        ? 'text-indigo-600' 
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                >
                    <i className="fas fa-comments text-lg"></i> Intelligent Chat
                    {activeTab === AppMode.INTELLIGENT_CHAT && (
                        <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-t-full animate-slide-up"></span>
                    )}
                </button>
                <button 
                    onClick={() => setActiveTab(AppMode.KNOWLEDGE_BASE)}
                    className={`pb-4 px-2 text-sm font-semibold flex items-center gap-2 transition-all relative ${
                        activeTab === AppMode.KNOWLEDGE_BASE 
                        ? 'text-indigo-600' 
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                >
                    <i className="fas fa-database text-lg"></i> Knowledge Base
                    {activeTab === AppMode.KNOWLEDGE_BASE && (
                        <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-t-full animate-slide-up"></span>
                    )}
                </button>
                <div className="flex-1"></div>
            </div>

            {/* Content Area - Using CSS Hiding to Preserve State */}
            <div className="flex-1 p-6 md:p-8 bg-gradient-to-b from-white/50 to-white/20 relative">
                <div className={activeTab === AppMode.TRANSLATOR ? 'block h-full' : 'hidden'}>
                    <Translator onSendToChat={handleTranslationToChat} />
                </div>
                
                <div className={activeTab === AppMode.INTELLIGENT_CHAT ? 'block h-full' : 'hidden'}>
                    <IntelligentChat 
                        initialMessage={chatInitialMessage} 
                        onClearInitialMessage={() => setChatInitialMessage('')}
                    />
                </div>

                <div className={activeTab === AppMode.KNOWLEDGE_BASE ? 'block h-full' : 'hidden'}>
                    <KnowledgeBase />
                </div>
            </div>

            {/* Status Bar */}
            <div className="px-6 py-3 bg-white/50 border-t border-gray-100 flex justify-between text-[10px] text-gray-500 font-medium">
                <div className="flex gap-4">
                    <span><i className="fas fa-circle text-emerald-500 mr-1 text-[6px] align-middle"></i>System Operational</span>
                    <span><i className="fas fa-shield-alt mr-1"></i>Guardrails Active</span>
                </div>
                <div>
                   Gemini 2.5 Flash • Context: 1M Tokens
                </div>
            </div>

        </div>
        
        <div className="mt-8 text-center">
            <p className="text-white/30 text-xs">© 2024 InferMate Inc.</p>
        </div>

      </div>
    </div>
  );
};

export default App;