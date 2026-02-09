import { VectorDocument } from "../types";
import { getEmbedding } from "./geminiService";

type Listener = () => void;

// In-Memory Vector Store (simulating a DB like Pinecone/Weaviate)
class VectorStore {
    private documents: VectorDocument[] = [];
    private listeners: Listener[] = [];

    subscribe(listener: Listener): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notify() {
        this.listeners.forEach(l => l());
    }

    // Adds a text to the store (automatically embeds it)
    async addDocument(text: string, source: string, category: string): Promise<number> {
        // Chunking Strategy: Simple text chunking (in production, use smart recursive splitters)
        const chunks = this.chunkText(text, 500); // 500 char chunks
        let successCount = 0;

        for (const chunk of chunks) {
            try {
                const embedding = await getEmbedding(chunk);
                if (embedding.length > 0) {
                    const doc: VectorDocument = {
                        id: Math.random().toString(36).substring(7),
                        text: chunk,
                        source,
                        category,
                        embedding,
                        timestamp: Date.now()
                    };
                    this.documents.push(doc);
                    successCount++;
                }
            } catch (err) {
                console.warn(`Failed to embed chunk from ${source}:`, err);
                // Continue processing other chunks despite this failure (Graceful degradation)
            }
        }
        
        if (successCount > 0) {
            this.notify();
        }
        
        return successCount;
    }

    // Searches the store using Cosine Similarity
    async similaritySearch(query: string, topK: number = 3): Promise<VectorDocument[]> {
        const queryEmbedding = await getEmbedding(query);
        if (queryEmbedding.length === 0) return [];

        const scoredDocs = this.documents.map(doc => ({
            doc,
            score: this.cosineSimilarity(queryEmbedding, doc.embedding)
        }));

        // Sort by score descending
        scoredDocs.sort((a, b) => b.score - a.score);

        return scoredDocs.slice(0, topK).map(sd => sd.doc);
    }

    getStats() {
        return {
            totalDocuments: this.documents.length,
            categories: [...new Set(this.documents.map(d => d.category))]
        };
    }

    private chunkText(text: string, chunkSize: number): string[] {
        const chunks = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.slice(i, i + chunkSize));
        }
        return chunks;
    }

    private cosineSimilarity(vecA: number[], vecB: number[]): number {
        let dotProduct = 0;
        let magA = 0;
        let magB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            magA += vecA[i] * vecA[i];
            magB += vecB[i] * vecB[i];
        }
        return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
    }
}

export const vectorStore = new VectorStore();