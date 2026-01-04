// Functions utility for RAG (Retrieval-Augmented Generation)
// Provides markdown parsing, embedding generation, and semantic search

// ============================================================================
// Types
// ============================================================================

export interface KnowledgeChunk {
    id: string;
    title: string;
    category: string;
    content: string;
    embedding?: number[];
}

export interface EmbeddingData {
    chunks: KnowledgeChunk[];
    model: string;
    generatedAt: string;
}

// ============================================================================
// Markdown Parsing
// ============================================================================

/**
 * Parse markdown content into semantic chunks based on headers
 */
export function parseMarkdownToChunks(markdown: string): Omit<KnowledgeChunk, 'embedding'>[] {
    const chunks: Omit<KnowledgeChunk, 'embedding'>[] = [];
    const lines = markdown.split('\n');

    let currentCategory = '';
    let currentTitle = '';
    let currentContent: string[] = [];
    let chunkId = 0;

    const saveChunk = () => {
        if (currentTitle && currentContent.length > 0) {
            const content = currentContent.join('\n').trim();
            if (content.length > 50) { // Only save chunks with meaningful content
                chunks.push({
                    id: `chunk-${chunkId++}`,
                    title: currentTitle,
                    category: currentCategory,
                    content: content,
                });
            }
        }
        currentContent = [];
    };

    for (const line of lines) {
        // Level 2 header (## Category)
        if (line.startsWith('## ')) {
            saveChunk();
            currentCategory = line.replace('## ', '').trim();
            currentTitle = '';
        }
        // Level 3 header (### Topic)
        else if (line.startsWith('### ')) {
            saveChunk();
            currentTitle = line.replace('### ', '').trim();
        }
        // Regular content
        else if (currentTitle) {
            currentContent.push(line);
        }
    }

    // Save the last chunk
    saveChunk();

    return chunks;
}

// ============================================================================
// Embedding Generation
// ============================================================================

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Generate embeddings for text using OpenAI API
 */
export async function generateEmbedding(
    text: string,
    apiKey: string
): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: text,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Embedding API error: ${error}`);
    }

    const data: { data: { embedding: number[] }[] } = await response.json();
    return data.data[0].embedding;
}

/**
 * Generate embeddings for all chunks
 */
export async function generateChunkEmbeddings(
    chunks: Omit<KnowledgeChunk, 'embedding'>[],
    apiKey: string
): Promise<KnowledgeChunk[]> {
    const embeddedChunks: KnowledgeChunk[] = [];

    for (const chunk of chunks) {
        // Combine title, category, and content for richer embedding
        const textForEmbedding = `${chunk.category}: ${chunk.title}\n\n${chunk.content}`;
        const embedding = await generateEmbedding(textForEmbedding, apiKey);

        embeddedChunks.push({
            ...chunk,
            embedding,
        });
    }

    return embeddedChunks;
}

// ============================================================================
// Semantic Search
// ============================================================================

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Search for relevant chunks based on query embedding
 */
export async function searchKnowledge(
    query: string,
    chunks: KnowledgeChunk[],
    apiKey: string,
    topK: number = 3,
    minSimilarity: number = 0.3
): Promise<{ chunk: KnowledgeChunk; similarity: number }[]> {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query, apiKey);

    // Calculate similarity for each chunk
    const results = chunks
        .filter(chunk => chunk.embedding) // Only chunks with embeddings
        .map(chunk => ({
            chunk,
            similarity: cosineSimilarity(queryEmbedding, chunk.embedding!),
        }))
        .filter(result => result.similarity >= minSimilarity)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);

    return results;
}

/**
 * Hybrid search: Combines semantic similarity with keyword matching for better recall
 */
export async function hybridSearch(
    query: string,
    chunks: KnowledgeChunk[],
    apiKey: string,
    topK: number = 5,
    minSimilarity: number = 0.15
): Promise<{ chunk: KnowledgeChunk; similarity: number }[]> {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query, apiKey);

    // Extract keywords from query (simple tokenization)
    const keywords = query.toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .split(/\s+/)
        .filter(word => word.length > 3); // Only words > 3 chars

    console.log(`Hybrid search keywords: ${keywords.join(', ')}`);

    // Calculate similarity + keyword boost
    const results = chunks
        .filter(chunk => chunk.embedding)
        .map(chunk => {
            const semanticSimilarity = cosineSimilarity(queryEmbedding, chunk.embedding!);

            // Check for keyword matches in title, category, and content
            const searchText = `${chunk.title} ${chunk.category} ${chunk.content}`.toLowerCase();
            const keywordMatches = keywords.filter(keyword => searchText.includes(keyword));
            const hasKeywordMatch = keywordMatches.length > 0;

            // Boost score if keywords are found
            // Each keyword match adds 0.1 to similarity (max boost: 0.3)
            const keywordBoost = Math.min(keywordMatches.length * 0.1, 0.3);
            const boostedSimilarity = semanticSimilarity + keywordBoost;

            return {
                chunk,
                semanticSimilarity,
                boostedSimilarity,
                hasKeywordMatch,
                keywordMatchCount: keywordMatches.length
            };
        })
        .filter(result => result.boostedSimilarity >= minSimilarity)
        .sort((a, b) => b.boostedSimilarity - a.boostedSimilarity)
        .slice(0, topK);

    // Log keyword match statistics
    const withKeywords = results.filter(r => r.hasKeywordMatch).length;
    console.log(`Found ${results.length} results (${withKeywords} with keyword matches)`);

    // Return simplified format matching original searchKnowledge interface
    return results.map(r => ({
        chunk: r.chunk,
        similarity: r.boostedSimilarity
    }));
}

/**
 * Format search results as context for the LLM
 */
export function formatSearchResultsAsContext(
    results: { chunk: KnowledgeChunk; similarity: number }[]
): string {
    if (results.length === 0) {
        return '';
    }

    const contextParts = results.map((result, index) => {
        return `[Source ${index + 1}: ${result.chunk.category} - ${result.chunk.title}]\n${result.chunk.content}`;
    });

    return `The following relevant information from the NSW Road Rules knowledge base may help you answer the question:\n\n${contextParts.join('\n\n---\n\n')}`;
}

// ============================================================================
// Pre-computed Embeddings Cache
// ============================================================================

let cachedEmbeddings: EmbeddingData | null = null;

/**
 * Load pre-computed embeddings from JSON
 */
export function loadEmbeddings(embeddingsJson: string): EmbeddingData {
    cachedEmbeddings = JSON.parse(embeddingsJson);
    return cachedEmbeddings!;
}

/**
 * Get cached embeddings
 */
export function getCachedEmbeddings(): EmbeddingData | null {
    return cachedEmbeddings;
}

/**
 * Set cached embeddings
 */
export function setCachedEmbeddings(data: EmbeddingData): void {
    cachedEmbeddings = data;
}
