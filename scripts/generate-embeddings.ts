/**
 * Script to generate embeddings for the knowledge base
 * 
 * Usage:
 *   OPENAI_API_KEY=your-key npx tsx scripts/generate-embeddings.ts
 * 
 * This script:
 * 1. Reads the Road-User-Handbook-English.md file
 * 2. Parses it into semantic chunks
 * 3. Generates embeddings using OpenAI's text-embedding-3-small model
 * 4. Saves the result as embeddings.json
 */

import * as fs from 'fs';
import * as path from 'path';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const KNOWLEDGE_BASE_PATH = path.join(__dirname, '../public/knowledge/Road-User-Handbook-English.md');
const OUTPUT_PATH = path.join(__dirname, '../public/knowledge/embeddings.json');

interface KnowledgeChunk {
    id: string;
    title: string;
    category: string;
    content: string;
    embedding?: number[];
}

interface EmbeddingData {
    chunks: KnowledgeChunk[];
    model: string;
    generatedAt: string;
}

/**
 * Parse markdown content into semantic chunks based on headers
 */
function parseMarkdownToChunks(markdown: string): Omit<KnowledgeChunk, 'embedding'>[] {
    const chunks: Omit<KnowledgeChunk, 'embedding'>[] = [];
    const lines = markdown.split('\n');

    let currentCategory = '';
    let currentTitle = '';
    let currentContent: string[] = [];
    let chunkId = 0;

    const saveChunk = () => {
        if (currentTitle && currentContent.length > 0) {
            const content = currentContent.join('\n').trim();
            if (content.length > 50) {
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
        if (line.startsWith('## ')) {
            saveChunk();
            currentCategory = line.replace('## ', '').trim();
            currentTitle = '';
        } else if (line.startsWith('### ')) {
            saveChunk();
            currentTitle = line.replace('### ', '').trim();
        } else if (currentTitle) {
            currentContent.push(line);
        }
    }

    saveChunk();
    return chunks;
}

/**
 * Generate embedding for a single text using OpenAI API
 */
async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
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
 * Main function to generate all embeddings
 */
async function main() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error('Error: OPENAI_API_KEY environment variable is required');
        console.error('Usage: OPENAI_API_KEY=your-key npx tsx scripts/generate-embeddings.ts');
        process.exit(1);
    }

    console.log('Reading knowledge base...');
    const markdown = fs.readFileSync(KNOWLEDGE_BASE_PATH, 'utf-8');

    console.log('Parsing into chunks...');
    const chunks = parseMarkdownToChunks(markdown);
    console.log(`Found ${chunks.length} chunks`);

    console.log('Generating embeddings...');
    const embeddedChunks: KnowledgeChunk[] = [];

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const textForEmbedding = `${chunk.category}: ${chunk.title}\n\n${chunk.content}`;

        process.stdout.write(`  [${i + 1}/${chunks.length}] ${chunk.title}... `);

        try {
            const embedding = await generateEmbedding(textForEmbedding, apiKey);
            embeddedChunks.push({ ...chunk, embedding });
            console.log('✓');
        } catch (e: any) {
            console.log('✗');
            console.error(`    Error: ${e.message}`);
        }

        // Rate limiting: wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    const embeddingData: EmbeddingData = {
        chunks: embeddedChunks,
        model: EMBEDDING_MODEL,
        generatedAt: new Date().toISOString(),
    };

    console.log(`\nSaving to ${OUTPUT_PATH}...`);
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(embeddingData, null, 2));

    console.log(`\n✅ Done! Generated ${embeddedChunks.length} embeddings.`);
    console.log(`   File size: ${(fs.statSync(OUTPUT_PATH).size / 1024).toFixed(1)} KB`);
}

main().catch(console.error);
