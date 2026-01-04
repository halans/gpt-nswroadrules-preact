# RAG (Retrieval-Augmented Generation) Architecture

This document explains how the road rules chat application uses RAG with OpenAI function calling to provide accurate, knowledge-grounded responses.

## Overview

RAG enhances AI responses by retrieving relevant information from a knowledge base before generating answers. This ensures responses are accurate and consistent with established road rules best practices.

## Swimlane Diagram

```
 User          Frontend        Backend         OpenAI          Knowledge
  │            (Chat.tsx)      (chat.ts)         API              Base
  │                │               │               │               │
  │──Question─────►│               │               │               │
  │                │──Sanitize────►│               │               │
  │                │               │               │               │
  │                │──POST /chat──►│               │               │
  │                │               │──Validate────►│               │
  │                │               │               │               │
  │                │               │◄─Load KB─────────────────────►│
  │                │               │  (37 chunks)                  │
  │                │               │               │               │
  │                │               │──Chat+Tools──►│               │
  │                │               │◄──tool_calls──│               │
  │                │               │  "search_knowledge"           │
  │                │               │               │               │
  │                │               │══Function Calling Loop═══════╗│
  │                │               │  Generate query embedding    ║│
  │                │               │───────────────►│              ║│
  │                │               │◄───────────────│              ║│
  │                │               │  Cosine similarity search    ║│
  │                │               │◄─────────────────────────────►│
  │                │               │  Top 3 results               ║│
  │                │               │═══════════════════════════════╝│
  │                │               │               │               │
  │                │               │──Chat+Context─►│               │
  │                │               │◄──Response────│               │
  │                │               │               │               │
  │                │◄──JSON────────│               │               │
  │                │──Typewriter──►│               │               │
  │◄───Display─────│               │               │               │
  │                │               │               │               │
```

## Components

### 1. Knowledge Base (`public/knowledge/`)

| File | Purpose |
|------|---------|
| `Road-User-Handbook-English.md` | Source content with `##` categories and `###` topics |
| `embeddings.json` | Pre-computed vectors for each chunk |

### 2. Embeddings Processing (`functions/embeddings.ts`)

```
Markdown → parseMarkdownToChunks() → Chunks
Chunks → generateChunkEmbeddings() → Chunks with vectors
Query → generateEmbedding() → Query vector
Query vector + Chunks → cosineSimilarity() → Ranked results
```

### 3. Function Calling Flow (`functions/chat.ts`)

1. **Initial Request**: User message sent to OpenAI with `tools` definition
2. **Tool Decision**: OpenAI decides if knowledge search is needed
3. **Tool Execution**: `search_knowledge` function runs semantic search
4. **Context Injection**: Search results added to conversation
5. **Final Response**: OpenAI generates grounded answer

## Semantic Search Algorithm

```
1. Generate embedding for user query
2. For each knowledge chunk:
   similarity = cosine(queryVector, chunkVector)
3. Filter: similarity >= 0.2
4. Sort by similarity descending
5. Return top 3 results
```

### Cosine Similarity Formula

```
           A · B
cos(θ) = ───────── 
         |A| × |B|
```

Where:
- `A · B` = dot product of vectors
- `|A|`, `|B|` = magnitudes of vectors
- Result range: -1 (opposite) to 1 (identical)

## Configuration

| Constant | Value | Location |
|----------|-------|----------|
| Embedding model | `text-embedding-3-small` | embeddings.ts |
| Dimensions | 1536 | embeddings.ts |
| Top K results | 3 | chat.ts |
| Min similarity | 0.2 | chat.ts |
| Max iterations | 3 | chat.ts |

## Generating Embeddings

When the knowledge base is updated, regenerate embeddings:

```bash
OPENAI_API_KEY=your-key npm run generate-embeddings
```

This reads `Road-User-Handbook-English.md`, parses it into chunks, generates embeddings for each, and saves to `embeddings.json`.
