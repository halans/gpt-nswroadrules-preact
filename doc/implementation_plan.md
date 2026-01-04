# RAG Function Calling Implementation Plan

## Goal

Enhance the chat application with Retrieval-Augmented Generation (RAG) using OpenAI function calling and semantic search to provide accurate, grounded responses based on a road rules knowledge base.

## Architecture

```
User Question
     ↓
OpenAI (with tools)
     ↓
Tool Call: search_knowledge
     ↓
Semantic Search (embeddings + cosine similarity)
     ↓
Relevant Knowledge Chunks
     ↓
OpenAI (with context)
     ↓
Grounded Response
```

## Components

### 1. Knowledge Base
- Location: `public/knowledge/Road-User-Handbook-English.md`
- Format: Markdown with `##` categories and `###` topics
- Content: Training basics, behavior issues, settling/anxiety, walks/play, family/socialization, business info

### 2. Embeddings
- Model: `text-embedding-3-small`
- Storage: Pre-computed JSON (`public/knowledge/embeddings.json`)
- Generation: `npm run generate-embeddings`

### 3. Semantic Search
- Algorithm: Cosine similarity
- Top-K: 3 results
- Threshold: 0.2 minimum similarity

### 4. Function Calling
- Tool: `search_knowledge`
- Integration: OpenAI tool calling API
- Fallback: On-demand embedding generation if pre-computed not found

## Files Modified/Created

| File | Action | Purpose |
|------|--------|---------|
| `functions/embeddings.ts` | NEW | Embedding utilities |
| `functions/chat.ts` | MODIFY | Add function calling |
| `public/knowledge/Road-User-Handbook-English.md` | NEW | Knowledge base |
| `scripts/generate-embeddings.ts` | NEW | Embedding generator |
| `tests/embeddings.test.ts` | NEW | Unit tests |
| `types.ts` | MODIFY | Add interfaces |
| `package.json` | MODIFY | Add dependencies |

## Verification

1. Run `npm run test:run` - all 11 tests pass
2. Run `npm run generate-embeddings` - creates embeddings.json
3. Run `npm start` - test chat with knowledge base queries
