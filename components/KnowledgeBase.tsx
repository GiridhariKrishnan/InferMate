import React, { useState, useEffect } from 'react';
import { vectorStore } from '../services/vectorStore';
import { fetchKnowledgeFromWeb } from '../services/geminiService';
import { useTier } from '../contexts/TierContext';
import { Tier } from '../types';

interface KnowledgeSource {
    name: string;
    query: string;
    description: string;
}

// Generalized Topics for "Foundational Knowledge"
const TIER_KNOWLEDGE: Record<Tier, KnowledgeSource[]> = {
    [Tier.FREE]: [
        { name: 'General Science', query: 'Key concepts in physics, chemistry, and biology summary', description: 'Scientific Principles' },
        { name: 'World History', query: 'Summary of major world history events 20th century', description: 'Historical Context' }
    ],
    [Tier.PRO]: [
        { name: 'Advanced Philosophy', query: 'Major philosophical schools: Stoicism, Existentialism, Eastern Philosophy', description: 'Ethics & Thought' },
        { name: 'Literature Classics', query: 'Summary of Shakespeare, Homer, and Dante key themes', description: 'Classic Literature' }
    ],
    [Tier.ENTERPRISE]: [
        { name: 'Global Economics', query: 'Macroeconomic principles and global market structures', description: 'Economics' },
        { name: 'Cutting Edge Tech', query: 'Latest developments in AI, Quantum Computing, and Biotech', description: 'Future Tech' }
    ]
};

const KnowledgeBase: React.FC = () => {
    const { currentTier } = useTier();
    const [isSyncing, setIsSyncing] = useState(false);
    const [customTopic, setCustomTopic] = useState("");
    const [stats, setStats] = useState(vectorStore.getStats());
    const [statusMsg, setStatusMsg] = useState<{type: 'success' | 'error', text: string} | null>(null);

    // Subscribe to VectorStore updates
    useEffect(() => {
        // Initial set to ensure fresh data on mount/tab switch
        setStats(vectorStore.getStats());
        
        const unsubscribe = vectorStore.subscribe(() => {
            setStats(vectorStore.getStats());
        });
        return () => unsubscribe();
    }, []);

    // Clear status message after 5 seconds
    useEffect(() => {
        if (statusMsg) {
            const timer = setTimeout(() => setStatusMsg(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [statusMsg]);

    const getSources = () => {
        let sources = [...TIER_KNOWLEDGE[Tier.FREE]];
        if (currentTier !== Tier.FREE) sources = [...sources, ...TIER_KNOWLEDGE[Tier.PRO]];
        if (currentTier === Tier.ENTERPRISE) sources = [...sources, ...TIER_KNOWLEDGE[Tier.ENTERPRISE]];
        return sources;
    };

    const handleSync = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        setStatusMsg(null);
        
        const sources = getSources();
        let totalVectors = 0;
        let failedTopics = 0;

        for (const source of sources) {
            try {
                const content = await fetchKnowledgeFromWeb(source.query);
                if (content) {
                    const count = await vectorStore.addDocument(content, source.name, "Core Knowledge");
                    totalVectors += count;
                } else {
                    failedTopics++;
                }
            } catch (e) {
                console.error(`Failed: ${source.name}`);
                failedTopics++;
            }
        }
        setIsSyncing(false);
        
        if (totalVectors > 0) {
            setStatusMsg({ type: 'success', text: `Sync complete. Added ${totalVectors} new vectors.${failedTopics > 0 ? ` (${failedTopics} topics failed)` : ''}` });
        } else {
            setStatusMsg({ type: 'error', text: "Sync completed but no new vectors were generated. Check connection." });
        }
    };

    const handleAddCustom = async () => {
        if (!customTopic.trim()) return;
        setIsSyncing(true);
        setStatusMsg(null);
        
        try {
            const content = await fetchKnowledgeFromWeb(customTopic);
            if (!content) throw new Error("Could not retrieve content.");
            
            const count = await vectorStore.addDocument(content, customTopic, "User Custom");
            
            if (count > 0) {
                setStatusMsg({ type: 'success', text: `Success: "${customTopic}" added as ${count} vectors.` });
                setCustomTopic("");
            } else {
                setStatusMsg({ type: 'error', text: "Content was retrieved but vector generation failed." });
            }
        } catch(e) {
            setStatusMsg({ type: 'error', text: `Failed to process topic: ${e instanceof Error ? e.message : 'Unknown error'}` });
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="flex flex-col h-full gap-6">
            <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
                <div className="relative z-10">
                    <h2 className="text-2xl font-bold mb-2">Knowledge Base</h2>
                    <p className="text-gray-300 text-sm mb-4">
                        Build a custom RAG corpus. Sync foundational topics or add your own research interests.
                        {stats.totalDocuments > 0 && <span className="block mt-2 text-green-400 font-bold">{stats.totalDocuments} vectors indexed.</span>}
                    </p>
                    
                    {statusMsg && (
                        <div className={`mb-4 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 animate-fade-in ${
                            statusMsg.type === 'success' ? 'bg-green-500/20 text-green-200 border border-green-500/30' : 'bg-red-500/20 text-red-200 border border-red-500/30'
                        }`}>
                            <i className={`fas ${statusMsg.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
                            {statusMsg.text}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-3">
                        <button 
                            onClick={handleSync} 
                            disabled={isSyncing}
                            className="bg-white text-gray-900 px-4 py-2 rounded-lg font-bold hover:bg-gray-200 transition-colors disabled:opacity-50"
                        >
                            {isSyncing ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-sync"></i>} Sync Core Topics
                        </button>
                    </div>
                    
                    <div className="mt-4 flex gap-2">
                        {/* Improved contrast for input field */}
                        <input 
                            type="text" 
                            value={customTopic}
                            onChange={(e) => setCustomTopic(e.target.value)}
                            placeholder="Add custom topic (e.g. 'Quantum Mechanics')..."
                            className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
                        />
                        <button 
                            onClick={handleAddCustom}
                            disabled={isSyncing || !customTopic}
                            className="bg-indigo-600 px-4 py-2 rounded-lg font-bold hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                        >
                            Add
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-y-auto">
                <div className="space-y-2">
                    <h3 className="text-xs font-bold text-gray-500 uppercase">Core Topics ({currentTier})</h3>
                    {getSources().map((s, i) => (
                        <div key={i} className="bg-white/60 p-3 rounded-xl border border-white shadow-sm">
                            <h4 className="font-bold text-sm">{s.name}</h4>
                            <p className="text-xs text-gray-500">{s.description}</p>
                        </div>
                    ))}
                </div>
                <div className="space-y-2">
                    <h3 className="text-xs font-bold text-gray-500 uppercase">Active Vectors</h3>
                     {stats.categories.map((c, i) => (
                        <div key={i} className="bg-green-50 p-3 rounded-xl border border-green-100 shadow-sm flex items-center gap-2">
                            <i className="fas fa-database text-green-600"></i>
                            <span className="text-sm font-medium text-green-800">{c}</span>
                        </div>
                    ))}
                    {stats.categories.length === 0 && (
                        <p className="text-xs text-gray-400 italic">No topics indexed yet.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default KnowledgeBase;