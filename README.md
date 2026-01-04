# NSW Road Rules Chat

A modern, AI-powered chat application designed to help you understand NSW road rules and driving regulations. Built with Preact, Tailwind CSS, and Cloudflare Pages.

## Features

- **AI-Powered Chat**: Uses OpenAI's GPT models to provide helpful information about NSW road rules, traffic regulations, and safe driving practices.
- **RAG (Retrieval-Augmented Generation)**: Semantic search over the comprehensive NSW Road User Handbook for accurate, consistent responses based on official rules.
- **Modern UI**: A sleek, responsive interface built with Tailwind CSS, featuring an accessible 60-30-10 color palette and smooth animations.
- **Inspiration System**:
  - **Welcome Grid**: Browse categories (Licences & Getting Started, Traffic Rules & Priorities, Safe Driving, Lanes & Road Markings, Parking & Special Situations) to get started.
  - **Collapsible Suggestions**: Access inspiration questions anytime via the "Sparkles" button in the input bar.
  - **Smart Pills**: Clickable question pills that wrap naturally for easy selection.
- **Rich Interactions**:
  - **Typewriter Effect**: AI responses appear smoothly with a dynamic typing speed based on length.
  - **Smooth Animations**: Chat bubbles slide and fade in for a natural feel.
  - **Visual Clarity**: Distinct icons for User and Bot to easily follow the conversation.

## Tech Stack

- **Frontend**: [Preact](https://preactjs.com/) (Fast, 3kB React alternative)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Build Tool**: [WMR](https://wmr.dev/)
- **Backend/Edge**: [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/platform/functions/)
- **AI**: [OpenAI API](https://platform.openai.com/docs/api-reference) (via Cloudflare AI Gateway)
- **Testing**: [Vitest](https://vitest.dev/)

## Knowledge Base (RAG)

The application uses a Retrieval-Augmented Generation (RAG) approach to provide accurate information:

1. **Knowledge Base**: Comprehensive markdown documentation in `public/knowledge/Road-User-Handbook-English.md`
2. **Semantic Search**: Uses OpenAI embeddings (`text-embedding-3-small`) with cosine similarity
3. **Function Calling**: The AI automatically retrieves relevant information when answering questions

### Generating Embeddings

Pre-compute embeddings for faster responses:

```bash
OPENAI_API_KEY=your-key npm run generate-embeddings
```

This creates `public/knowledge/embeddings.json` with pre-computed embeddings. If not present, embeddings are generated on-demand.

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
   ```

4. **Start the development server**
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
   - **Note**: For production, ensure your API key has usage limits set in the OpenAI dashboard.

5. **Deploy**: Click **Save and Deploy**. Cloudflare will build and deploy your site globally.

## Project Structure

```
├── public/
│   ├── knowledge/          # RAG knowledge base
│   │   ├── Road-User-Handbook-English.md  # NSW Road User Handbook
│   │   └── embeddings.json    # Pre-computed embeddings (generated)
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

Created with Antigravity and Claude Opus 4.5.