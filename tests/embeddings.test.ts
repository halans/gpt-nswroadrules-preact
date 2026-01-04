import { describe, it, expect } from 'vitest';
import {
    parseMarkdownToChunks,
    cosineSimilarity,
    formatSearchResultsAsContext,
} from '../functions/embeddings';
import type { KnowledgeChunk } from '../types';

describe('parseMarkdownToChunks', () => {
    it('should parse markdown with categories and topics', () => {
        const markdown = `# Knowledge Base

## Licences

### Getting Your Learner Licence

The learner licence is the first step in becoming a licensed driver in NSW.
You must pass a Driver Knowledge Test to obtain your learner licence.

### Licence Classes

Different vehicle types require different licence classes in NSW.

## Safe Driving Behaviour

### Speed Limits

Speed limits vary depending on the road type and conditions.
`;

        const chunks = parseMarkdownToChunks(markdown);

        expect(chunks.length).toBe(3);

        expect(chunks[0].title).toBe('Getting Your Learner Licence');
        expect(chunks[0].category).toBe('Licences');
        expect(chunks[0].content).toContain('learner licence');

        expect(chunks[1].title).toBe('Licence Classes');
        expect(chunks[1].category).toBe('Licences');

        expect(chunks[2].title).toBe('Speed Limits');
        expect(chunks[2].category).toBe('Safe Driving Behaviour');
    });

    it('should skip chunks with minimal content', () => {
        const markdown = `## Category

### Short Topic

Hi

### Long Topic

This is a longer piece of content that should be included because it has enough substance to be meaningful.
`;

        const chunks = parseMarkdownToChunks(markdown);

        // Only the long topic should be included (>50 chars)
        expect(chunks.length).toBe(1);
        expect(chunks[0].title).toBe('Long Topic');
    });

    it('should generate unique IDs for each chunk', () => {
        const markdown = `## Category

### Topic One

Content for topic one that is long enough to be included.

### Topic Two

Content for topic two that is also long enough to include.
`;

        const chunks = parseMarkdownToChunks(markdown);

        const ids = chunks.map(c => c.id);
        const uniqueIds = new Set(ids);

        expect(ids.length).toBe(uniqueIds.size);
    });
});

describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
        const a = [1, 0, 0];
        const b = [1, 0, 0];

        expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
        const a = [1, 0, 0];
        const b = [0, 1, 0];

        expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
    });

    it('should return -1 for opposite vectors', () => {
        const a = [1, 0, 0];
        const b = [-1, 0, 0];

        expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
    });

    it('should handle normalized vectors correctly', () => {
        const a = [0.6, 0.8];
        const b = [0.8, 0.6];

        const similarity = cosineSimilarity(a, b);

        // Dot product: 0.6*0.8 + 0.8*0.6 = 0.96
        // Both vectors are unit vectors (0.6^2 + 0.8^2 = 1)
        expect(similarity).toBeCloseTo(0.96, 5);
    });

    it('should throw error for vectors of different lengths', () => {
        const a = [1, 2, 3];
        const b = [1, 2];

        expect(() => cosineSimilarity(a, b)).toThrow('Vectors must have the same length');
    });
});

describe('formatSearchResultsAsContext', () => {
    it('should format results with source headers', () => {
        const results: { chunk: KnowledgeChunk; similarity: number }[] = [
            {
                chunk: {
                    id: 'chunk-1',
                    title: 'Give Way Rules',
                    category: 'Traffic Rules',
                    content: 'Drivers must give way to pedestrians at crossings.',
                },
                similarity: 0.85,
            },
        ];

        const context = formatSearchResultsAsContext(results);

        expect(context).toContain('Traffic Rules');
        expect(context).toContain('Give Way Rules');
        expect(context).toContain('pedestrians');
        expect(context).toContain('[Source 1:');
    });

    it('should return empty string for empty results', () => {
        const context = formatSearchResultsAsContext([]);

        expect(context).toBe('');
    });

    it('should format multiple results with separators', () => {
        const results: { chunk: KnowledgeChunk; similarity: number }[] = [
            {
                chunk: {
                    id: 'chunk-1',
                    title: 'Topic One',
                    category: 'Category A',
                    content: 'Content one.',
                },
                similarity: 0.9,
            },
            {
                chunk: {
                    id: 'chunk-2',
                    title: 'Topic Two',
                    category: 'Category B',
                    content: 'Content two.',
                },
                similarity: 0.8,
            },
        ];

        const context = formatSearchResultsAsContext(results);

        expect(context).toContain('[Source 1:');
        expect(context).toContain('[Source 2:');
        expect(context).toContain('---');
    });
});
