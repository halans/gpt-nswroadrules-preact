# Search Improvements for NSW Road Rules Embeddings

## Current Issues

1. **Limited Results**: Only returning top 3 results (`topK: 3`)
2. **Similarity Threshold Too High**: 0.2 threshold may miss relevant content
3. **No Keyword Fallback**: Pure semantic search without exact keyword matching
4. **Single Query Embedding**: No query expansion or multi-query approach

## Proposed Improvements

### 1. **Increase Top-K Results** (Quick Win)
Return more results to give the AI more context.

```typescript
// Current
const results = await searchKnowledge(query, knowledgeChunks, apiKey, 3, 0.2);

// Improved
const results = await searchKnowledge(query, knowledgeChunks, apiKey, 5, 0.15);
// Return top 5 with lower threshold of 0.15
```

**Impact**: Catches more relevant chunks, especially for specific terms like "alcohol interlocks"

---

### 2. **Hybrid Search: Semantic + Keyword Matching** (Recommended)

Combine embedding similarity with exact keyword matching for better recall.

**Implementation** in `functions/embeddings.ts`:

```typescript
/**
 * Hybrid search: Combines semantic similarity with keyword matching
 */
export async function hybridSearch(
    query: string,
    chunks: KnowledgeChunk[],
    apiKey: string,
    topK: number = 5,
    minSimilarity: number = 0.15
): Promise<{ chunk: KnowledgeChunk; similarity: number; hasKeywordMatch: boolean }[]> {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query, apiKey);

    // Extract keywords from query (simple tokenization)
    const keywords = query.toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .split(/\s+/)
        .filter(word => word.length > 3); // Only words > 3 chars

    console.log(`Search keywords: ${keywords.join(', ')}`);

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
            const finalSimilarity = semanticSimilarity + keywordBoost;

            return {
                chunk,
                similarity: semanticSimilarity, // Original score for reference
                boostedSimilarity: finalSimilarity,
                hasKeywordMatch,
                keywordMatches: keywordMatches.length
            };
        })
        .filter(result => result.boostedSimilarity >= minSimilarity)
        .sort((a, b) => b.boostedSimilarity - a.boostedSimilarity)
        .slice(0, topK)
        .map(r => ({
            chunk: r.chunk,
            similarity: r.boostedSimilarity,
            hasKeywordMatch: r.hasKeywordMatch
        }));

    return results;
}
```

**Update in `functions/chat.ts`**:

```typescript
// Replace line 253
const results = await hybridSearch(query, knowledgeChunks, apiKey, 5, 0.15);
console.log(`Hybrid search found ${results.length} results (${results.filter(r => r.hasKeywordMatch).length} with keyword matches)`);
```

**Benefits**:
- Catches exact term matches like "alcohol interlock" even if semantic similarity is low
- Still benefits from semantic understanding for conceptual queries
- Boosts chunks that have both semantic relevance AND keyword matches

---

### 3. **Query Expansion** (Advanced)

Expand user query with synonyms or related terms before searching.

```typescript
function expandQuery(query: string): string[] {
    const synonymMap: Record<string, string[]> = {
        'licence': ['license', 'permit', 'driver licence'],
        'alcohol': ['drink', 'drinking', 'drink-driving', 'drunk'],
        'interlock': ['interlock device', 'breath test device', 'ignition lock'],
        'pedestrian': ['walker', 'person crossing', 'foot traffic'],
        'roundabout': ['traffic circle', 'rotary'],
        'speed': ['speeding', 'velocity', 'speed limit'],
        // Add more as needed
    };

    const queries = [query.toLowerCase()];

    // Add synonyms found in query
    Object.entries(synonymMap).forEach(([term, synonyms]) => {
        if (query.toLowerCase().includes(term)) {
            queries.push(...synonyms);
        }
    });

    return queries;
}

// Search with multiple query variations
const expandedQueries = expandQuery(query);
const allResults = await Promise.all(
    expandedQueries.map(q => searchKnowledge(q, knowledgeChunks, apiKey, 3, 0.2))
);
// Merge and deduplicate results
```

---

### 4. **BM25 Keyword Scoring** (Alternative)

Use BM25 algorithm for better keyword matching instead of simple keyword counting.

**Library**: Can use `js-bm25` or implement simplified version.

---

### 5. **Re-ranking with Cross-Encoder** (Most Advanced)

After initial retrieval, re-rank top results using a cross-encoder model for better precision.

**Not recommended for edge deployment** due to model size, but possible with Cloudflare AI Workers.

---

## Quick Implementation Plan

### Phase 1: Immediate Improvements (5 min)
1. Increase `topK` from 3 to 5
2. Lower `minSimilarity` from 0.2 to 0.15

### Phase 2: Hybrid Search (20 min)
1. Implement `hybridSearch` function with keyword matching
2. Update `executeToolCall` to use hybrid search
3. Add logging to track keyword match rate

### Phase 3: Testing & Tuning (15 min)
1. Test with problematic queries like "alcohol interlocks"
2. Tune keyword boost weights (currently 0.1 per keyword)
3. Adjust minimum similarity threshold based on results

---

## Expected Results

**Before**: "alcohol interlocks" might return 0-1 results with low similarity
**After**: Should return 3-5 results including exact match chunk with boosted score

---

## Code Changes Summary

### File: `functions/embeddings.ts`
- Add `hybridSearch()` function with keyword matching logic
- Keep existing `searchKnowledge()` for backward compatibility
- Export both functions

### File: `functions/chat.ts`
- Line 253: Replace `searchKnowledge` with `hybridSearch`
- Update parameters: `topK: 5`, `minSimilarity: 0.15`
- Update logging to show keyword matches

### File: `types.ts` (if needed)
- Add `hasKeywordMatch` to search result type

---

## Alternative: Client-Side Filtering

If you want to avoid changing embeddings logic, you could also:

1. **Increase chunk size** when generating embeddings (more context per chunk)
2. **Use section headers** in embedding text to improve topic matching
3. **Add metadata tags** to chunks for exact filtering

---

Would you like me to implement the **Hybrid Search** approach? It's the most practical improvement with the best results-to-effort ratio.
