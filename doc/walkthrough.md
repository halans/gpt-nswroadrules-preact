# RAG Function Calling Implementation

## Summary

Added Retrieval-Augmented Generation (RAG) with OpenAI function calling to the NSW Road Rules Chat application. The AI now searches a knowledge base for relevant information before answering questions.

## Changes Made

### New Files

| File | Purpose |
|------|---------|
| `public/knowledge/Road-User-Handbook-English.md` | Knowledge base with 37 topics including Transport for NSW info |
| `functions/embeddings.ts` | Markdown parsing, embeddings, cosine similarity |
| `scripts/generate-embeddings.ts` | Script to pre-compute embeddings |
| `tests/embeddings.test.ts` | 11 unit tests |
| `vitest.config.ts` | Test configuration |

### Modified Files

| File | Changes |
|------|---------|
| `functions/chat.ts` | Added function calling, tool execution loop, knowledge base loading |
| `types.ts` | Added `KnowledgeChunk`, `ToolCall`, `ChatCompletionChoice` types |
| `package.json` | Added `vitest`, `tsx`, test scripts |
| `README.md` | Documented RAG, testing, project structure |
| `public/Chat.tsx` | Auto-growing textarea, localStorage expiration, reset querystring |

## How It Works

1. User asks a question
2. OpenAI decides if knowledge search is needed
3. Semantic search finds relevant chunks from the knowledge base
4. Context is injected and AI generates an informed response

## UI Enhancements

- **Auto-growing textarea**: Input field expands as user types (max 4 lines)
- **localStorage expiration**: Chat history clears after 72 hours (configurable)
- **Reset querystring**: Add `?reset=1` to URL to clear chat history

## Validation

- 11/11 tests passing (markdown parsing, cosine similarity, context formatting)
- TypeScript types complete
- README updated

## Commands

Generate embeddings:
```bash
OPENAI_API_KEY=your-key npm run generate-embeddings
```

Run tests:
```bash
npm test        # Watch mode
npm run test:run  # Single run
```

Start development server:
```bash
npm start
```
