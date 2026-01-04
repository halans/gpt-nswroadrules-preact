# NSW Road Rules Chat

A modern, AI-powered chat application designed to help you understand NSW road rules and driving regulations. Built with Preact, Tailwind CSS, and Cloudflare Pages.

## Features

### AI-Powered Knowledge Base
- **RAG (Retrieval-Augmented Generation)**: Every answer is grounded in the official NSW Road User Handbook (PDF converted to markdown)
- **Hybrid Search**: Combines semantic similarity with keyword matching for better accuracy
  - Semantic embeddings using OpenAI's `text-embedding-3-small` model
  - Keyword boosting ensures specific terms like "alcohol interlock" or "demerit points" are found
  - Returns top 5 most relevant chunks with similarity scores
- **Automatic Knowledge Retrieval**: AI automatically searches the knowledge base for all NSW road rules questions
- **Transparent Sourcing**: Responses indicate when information comes from official NSW sources

### Modern User Interface
- **Accessible Design**: WCAG AAA compliant color palette using 60-30-10 design principles
  - Primary: NSW Blue (#0066CC) - 30% coverage, 9.67:1 contrast ratio
  - Background: Off-white (#FAFAFA) - 60% coverage
  - Accents: Green/Red/Amber for traffic-light semantics - 10% coverage
- **Inspiration System**:
  - **Welcome Grid**: Browse 5 categories with 25+ suggested questions
  - **Collapsible Suggestions**: Access inspiration anytime via the "Sparkles" button
  - **Smart Pills**: Clickable question pills that wrap naturally
- **Rich Interactions**:
  - **Typewriter Effect**: Dynamic typing speed based on response length
  - **Smooth Animations**: Chat bubbles slide and fade in naturally
  - **Visual Clarity**: Distinct icons (User/Bot) for easy conversation flow
  - **Input Sanitization**: XSS protection and content validation for security

## Tech Stack

- **Frontend**: [Preact](https://preactjs.com/) (Fast, 3kB React alternative)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Build Tool**: [WMR](https://wmr.dev/)
- **Backend/Edge**: [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/platform/functions/)
- **AI**: [OpenAI API](https://platform.openai.com/docs/api-reference) (via Cloudflare AI Gateway)
- **Testing**: [Vitest](https://vitest.dev/)

## Knowledge Base (RAG)

The application uses an advanced Retrieval-Augmented Generation (RAG) approach to provide accurate, authoritative information:

### Architecture

1. **Knowledge Source**: NSW Road User Handbook (4,600+ lines) in `public/knowledge/Road-User-Handbook-English.md`
2. **Chunking**: Markdown parsed into semantic chunks by category and topic (209 chunks)
3. **Embedding**: Each chunk embedded using OpenAI's `text-embedding-3-small` model (1,536 dimensions)
4. **Hybrid Search**:
   - **Semantic similarity**: Cosine similarity between query and chunk embeddings
   - **Keyword matching**: Exact term matching with boost scoring (0.1 per keyword, max 0.3)
   - **Combined ranking**: Best of both approaches for superior recall
5. **Function Calling**: AI automatically invokes `search_knowledge` for all NSW road rules questions
6. **Safeguards**: Detects and blocks malformed AI responses, ensuring clean output to users

### Search Parameters

- **Top-K**: Returns 5 most relevant chunks
- **Minimum Similarity**: 0.15 threshold (lowered for better recall)
- **Keyword Filter**: Only keywords > 3 characters
- **Context Size**: Up to ~5,000 characters of official handbook content per query

### Generating Embeddings

Pre-compute embeddings for faster responses and reduced API calls:

```bash
OPENAI_API_KEY=your-key npm run generate-embeddings
```

This creates `public/knowledge/embeddings.json` with pre-computed embeddings. If not present, embeddings are generated on-demand (slower first request, then cached).

## Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/halans/gpt-nswroadrules-preact
   cd gpt-nswroadrules-preact
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment**
   Create a `.dev.vars` file in the root directory:
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   OPENAI_MODEL=gpt-5-mini  
   ```

4. **Generate Embeddings** (Optional but recommended)
   ```bash
   OPENAI_API_KEY=your-key npm run generate-embeddings
   ```

5. **Start the development server**
   ```bash
   npm start
   ```
   This runs `wrangler pages dev` with `wmr`. Open http://localhost:8788 in your browser.

## Testing

Run the test suite:

```bash
npm test        # Watch mode
npm run test:run  # Single run
```

## Deployment

This project is designed to be deployed on **Cloudflare Pages**.

1. **Push to GitHub**: Make sure your code is pushed to a GitHub repository.

2. **Create a Cloudflare Pages Project**:
   - Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
   - Navigate to **Workers & Pages** > **Create Application** > **Pages** > **Connect to Git**.
   - Select your repository.

3. **Configure Build Settings**:
   - **Framework Preset**: None (or custom)
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`

4. **Environment Variables**:
   - In the Cloudflare Pages dashboard for your project, go to **Settings** > **Environment variables**.
   - Add `OPENAI_API_KEY` with your production API key.
   - Add `OPENAI_MODEL` with your chosen model (e.g., `gpt-5-mini` or `gpt-5-nano`)
   - **Important**: Ensure your API key has usage limits set in the OpenAI dashboard for production.

5. **Deploy**: Click **Save and Deploy**. Cloudflare will build and deploy your site globally.

## Recent Improvements

### Hybrid Search (January 2026)
- Implemented keyword matching alongside semantic search
- Increased top-K from 3 to 5 results
- Lowered similarity threshold from 0.2 to 0.15 for better recall
- Added keyword boost scoring (0.1 per match, max 0.3)
- Result: Specific terms like "alcohol interlock" and "demerit points" now found reliably

### Enhanced System Prompt
- AI now required to always search knowledge base for NSW road rules questions
- Responses clearly indicate when using official NSW sources
- Fallback messaging when knowledge base doesn't contain specific information

### Security & Stability
- Input sanitization for XSS protection
- Safeguards to detect and block malformed AI responses
- Error handling with user-friendly messages
- Content validation on all user inputs

## Project Structure

```
├── public/
│   ├── knowledge/          # RAG knowledge base
│   │   ├── Road-User-Handbook-English.md  # NSW Road User Handbook (247KB)
│   │   └── embeddings.json    # Pre-computed embeddings (generated - 7.1MB)
│   ├── Chat.tsx            # Main chat component
│   └── index.tsx           # App entry point
├── functions/
│   ├── chat.ts             # Chat API with function calling
│   └── embeddings.ts       # RAG utilities
├── scripts/
│   └── generate-embeddings.ts  # Embedding generation script
├── tests/
│   └── embeddings.test.ts  # Unit tests
├── tailwind.config.js
└── vitest.config.ts
```

Created with Antigravity and Claude Code with Claude Opus 4.5, as an excercise in building a RAG application with a simple embeddings JSON (instead of vector database) for grounded responses, hosted on Cloudflare Pages.