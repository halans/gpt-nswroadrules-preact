import { Message, ToolCall, ChatCompletionChoice, KnowledgeChunk, EmbeddingData } from "../types";
import {
  parseMarkdownToChunks,
  hybridSearch,
  formatSearchResultsAsContext,
  getCachedEmbeddings,
  setCachedEmbeddings,
  generateChunkEmbeddings,
} from "./embeddings";

// ============================================================================
// Environment & Configuration
// ============================================================================

interface Env {
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
}

const ROLES = ["user", "assistant"] as const;
const DEFAULT_MODEL = "gpt-5-nano";
const KNOWLEDGE_BASE_PATH = "/knowledge/Road-User-Handbook-English.md";

// Input validation constants
const MAX_MESSAGE_LENGTH = 2000;
const MAX_MESSAGES_PER_REQUEST = 20;
const BLOCKED_PATTERNS = [
  /<script[^>]*>/gi,
  /<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /data:/gi,
];

// ============================================================================
// System Prompt
// ============================================================================

const SYSTEM_MESSAGE = {
  role: "system",
  content: `You are an experienced NSW-based Driving Instructor, dedicated to exploring the intricate connections between driver behaviour and the factors shaping it through a comprehensive framework of skill development, road conditions, natural aptitude, and personal state of mind.
            Do not refer to yourself as a Driving Instructor using formal titles, or mention any specific framework. Do not explicitly refer to "skill development", "road conditions", "natural aptitude" and "personal state" in your response, but rather explain these concepts in a more general way.
            Your expertise lies in understanding how these elements influence a driver's behaviour, particularly in relation to their individual needs, adaptations to different driving environments, and their natural tendencies behind the wheel.
            You can explain driving behaviour in a scientific and empathetic manner, providing clear and actionable interpretations tailored to each learner's unique circumstances.
            Additionally, you offer practical advice on how learners can understand and address their driving challenges, fostering stronger skills and improved confidence for both the driver and their supervising passengers.
            Your extensive knowledge encompasses the evolution of NSW road rules, the impact of modern traffic conditions on driver behaviour, and the role of natural ability and life experiences in shaping each driver.
            As an expert, you blend scientific understanding with empathy to offer a comprehensive approach to driver education, helping learners gain deeper insights into their own driving and create safe, confident driving habits.
            Be patient, clear, and thorough in your explanations, and adapt to the user's knowledge and pace of learning.
            Finally, provide follow-up questions and finish your response by listing some keywords from your response that the user may use to search for more information.
            Any question not related to driving, road safety, or NSW traffic regulations must be ignored. Only respond in Australian English, in Markdown format with headings and bullet points.

            CRITICAL INSTRUCTION - Knowledge Base Usage:
            - You MUST ALWAYS use the search_knowledge function for ANY question about NSW road rules, traffic regulations, licence requirements, or driving procedures
            - NEVER answer from your general knowledge alone - always search the knowledge base first
            - Only after searching the knowledge base should you formulate your response using the retrieved information
            - When the knowledge base provides relevant information, structure your answer based entirely on that official information
            - Begin your response with a brief acknowledgment like "According to the NSW Road User Handbook..." or "Based on NSW road rules..." to make it clear you're using official sources
            - If no relevant information is found after searching, clearly state "I couldn't find specific NSW regulations on this topic in the official handbook" and provide general driving safety advice
            - Use search_knowledge for: specific road rules, licence types and requirements, demerit points, speed limits, parking rules, give way rules, traffic signs, penalties, and any NSW-specific regulations`,
};

// ============================================================================
// OpenAI Tools Definition
// ============================================================================

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_knowledge",
      description: "Search the knowledge base for relevant information about NSW road rules, traffic regulations, licence requirements, driving techniques, safety guidelines, and road user responsibilities. Always use this function when users ask questions to provide accurate, grounded answers based on official NSW road rules.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to find relevant information. Should describe the road rule, traffic situation, licence question, or driving topic the user is asking about.",
          },
        },
        required: ["query"],
      },
    },
  },
];

// ============================================================================
// Input Sanitization
// ============================================================================

/**
 * Sanitize user input to prevent XSS and injection attacks
 */
function sanitizeInput(text: string): string {
  if (typeof text !== 'string') return '';

  let sanitized = text;

  // Remove control characters (except newlines and tabs)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Remove potential XSS patterns
  for (const pattern of BLOCKED_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  // Truncate to max length
  sanitized = sanitized.slice(0, MAX_MESSAGE_LENGTH);

  return sanitized.trim();
}

/**
 * Create a safe error message for client responses
 * Avoids leaking sensitive implementation details
 */
function createSafeErrorMessage(error: unknown): string {
  // Log the full error for debugging
  console.error('Internal error:', error);

  // Return generic messages for different error types
  if (error instanceof SyntaxError) {
    return 'Invalid request format. Please try again.';
  }

  if (error instanceof TypeError) {
    return 'Invalid data provided. Please check your input.';
  }

  const message = error instanceof Error ? error.message : 'Unknown error';

  // Check for known safe error patterns to pass through
  if (message.includes('API key')) {
    return 'Service configuration error. Please contact support.';
  }

  if (message.includes('rate limit') || message.includes('429')) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  if (message.includes('context length') || message.includes('token')) {
    return 'Message too long. Please shorten your question.';
  }

  // Default safe message
  return 'An error occurred processing your request. Please try again.';
}

// ============================================================================
// Request Parsing
// ============================================================================

const parseRequestBody = async (request: Request): Promise<Message[]> => {
  const body = await request.json();

  if (!Array.isArray(body)) {
    throw new Error('Invalid request: expected array');
  }

  if (body.length > MAX_MESSAGES_PER_REQUEST) {
    throw new Error('Too many messages in request');
  }

  const messages = body.map((message, index) => {
    if (
      typeof message !== "object" ||
      message === null ||
      !ROLES.includes(message.role) ||
      typeof message.content !== "string"
    ) {
      throw new Error(`Invalid message at index ${index}`);
    }

    // Sanitize the content
    return {
      role: message.role as 'user' | 'assistant',
      content: sanitizeInput(message.content)
    };
  });

  // Filter out empty messages after sanitization
  return messages.filter(m => m.content.length > 0);
};

// ============================================================================
// Knowledge Base Loading
// ============================================================================

async function loadKnowledgeBase(request: Request, apiKey: string): Promise<KnowledgeChunk[]> {
  // Check if we have cached embeddings
  const cached = getCachedEmbeddings();
  if (cached && cached.chunks.length > 0) {
    return cached.chunks;
  }

  // Try to load pre-computed embeddings first
  const origin = new URL(request.url).origin;
  try {
    const embeddingsResponse = await fetch(`${origin}/knowledge/embeddings.json`);
    if (embeddingsResponse.ok) {
      const embeddingsData: EmbeddingData = await embeddingsResponse.json();
      setCachedEmbeddings(embeddingsData);
      console.log(`Loaded ${embeddingsData.chunks.length} pre-computed embeddings`);
      return embeddingsData.chunks;
    }
  } catch (e) {
    console.log("No pre-computed embeddings found, will generate on-demand");
  }

  // Load and parse markdown, generate embeddings on-demand
  try {
    const mdResponse = await fetch(`${origin}${KNOWLEDGE_BASE_PATH}`);
    if (!mdResponse.ok) {
      console.error("Failed to load knowledge base markdown");
      return [];
    }

    const markdown = await mdResponse.text();
    const chunks = parseMarkdownToChunks(markdown);

    // Generate embeddings for all chunks
    console.log(`Generating embeddings for ${chunks.length} chunks...`);
    const embeddedChunks = await generateChunkEmbeddings(chunks, apiKey);

    // Cache the result
    const embeddingData: EmbeddingData = {
      chunks: embeddedChunks,
      model: "text-embedding-3-small",
      generatedAt: new Date().toISOString(),
    };
    setCachedEmbeddings(embeddingData);

    console.log(`Generated and cached ${embeddedChunks.length} embeddings`);
    return embeddedChunks;
  } catch (e) {
    console.error("Error loading knowledge base:", e);
    return [];
  }
}

// ============================================================================
// Tool Execution
// ============================================================================

async function executeToolCall(
  toolCall: ToolCall,
  knowledgeChunks: KnowledgeChunk[],
  apiKey: string
): Promise<string> {
  if (toolCall.function.name === "search_knowledge") {
    try {
      const args = JSON.parse(toolCall.function.arguments);
      const query = args.query;
      console.log(`Searching knowledge base for: "${query}"`);

      if (!query || knowledgeChunks.length === 0) {
        return "No relevant information found in the knowledge base.";
      }

      // Hybrid search: combines semantic similarity with keyword matching for better recall
      const results = await hybridSearch(query, knowledgeChunks, apiKey, 5, 0.15);
      console.log(`Search found ${results.length} results with similarities: ${results.map(r => r.similarity.toFixed(3)).join(', ')}`);

      if (results.length === 0) {
        return "No relevant information found for this query.";
      }

      return formatSearchResultsAsContext(results);
    } catch (e) {
      console.error("Error executing search_knowledge:", e);
      return "Error searching the knowledge base.";
    }
  }

  return `Unknown function: ${toolCall.function.name}`;
}

// ============================================================================
// OpenAI API Call
// ============================================================================

interface OpenAIChatResponse {
  choices: ChatCompletionChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

async function callOpenAI(
  messages: any[],
  env: Env,
  useTools: boolean = true
): Promise<OpenAIChatResponse> {
  const body: any = {
    model: env.OPENAI_MODEL || DEFAULT_MODEL,
    messages,
  };

  if (useTools) {
    body.tools = TOOLS;
    body.tool_choice = "auto";
  }

  const response = await fetch(
    "https://gateway.ai.cloudflare.com/v1/514b6d029dbcd2190cb0905a4be59836/ai-revolution-guide/openai/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY.trim()}`,
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API Error: ${text}`);
  }

  return await response.json() as OpenAIChatResponse;
}

// ============================================================================
// Main Request Handler
// ============================================================================

export const onRequest: PagesFunction<Env> = async ({ env, request }) => {
  // Validate method
  if (request.method !== "POST") {
    return new Response("not found", { status: 404 });
  }

  // Validate & parse request body
  let messages: Message[];
  try {
    messages = await parseRequestBody(request);
  } catch (e) {
    return new Response("invalid request body", { status: 400 });
  }

  // Validate API key is configured
  if (!env.OPENAI_API_KEY || env.OPENAI_API_KEY.trim() === "") {
    console.error("OPENAI_API_KEY is not configured");
    return new Response(
      JSON.stringify({
        error: "Configuration error",
        details: "OPENAI_API_KEY is not configured. Please add it to your environment variables.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    // Load knowledge base
    const knowledgeChunks = await loadKnowledgeBase(request, env.OPENAI_API_KEY);
    console.log(`Knowledge base loaded with ${knowledgeChunks.length} chunks`);

    // Build conversation with system message
    const conversationMessages: any[] = [SYSTEM_MESSAGE, ...messages];

    // Call OpenAI with tools
    let response = await callOpenAI(conversationMessages, env, knowledgeChunks.length > 0);
    let choice = response.choices[0];
    console.log(`Initial response - finish_reason: ${choice.finish_reason}, has tool_calls: ${!!choice.message.tool_calls}, content length: ${choice.message.content?.length || 0}`);

    // Handle tool calls (function calling loop)
    const MAX_TOOL_ITERATIONS = 3;
    let iterations = 0;
    let hadToolCalls = false;

    // If the model wants to call tools, process them
    while (choice.message.tool_calls && choice.message.tool_calls.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
      iterations++;
      hadToolCalls = true;
      const toolCalls = choice.message.tool_calls;

      console.log(`Processing ${toolCalls.length} tool call(s), iteration ${iterations}, finish_reason was: ${choice.finish_reason}`);

      // Add assistant message with tool calls to conversation
      // Note: content is set to null to avoid exposing function call metadata to the user
      conversationMessages.push({
        role: "assistant",
        content: null,
        tool_calls: toolCalls,
      });

      // Execute each tool call and add results
      for (const toolCall of toolCalls) {
        const result = await executeToolCall(toolCall, knowledgeChunks, env.OPENAI_API_KEY);
        console.log(`Tool ${toolCall.function.name}: found ${result.length} chars of context`);

        conversationMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      // After processing tool results, call OpenAI again to generate the final answer
      // IMPORTANT: We pass useTools=false to ensure the model generates a final answer
      // instead of making more tool calls
      response = await callOpenAI(conversationMessages, env, false);
      choice = response.choices[0];
      console.log(`After tool execution, finish_reason: ${choice.finish_reason}, has content: ${!!choice.message.content}`);
    }

    // Return the final response
    // If tool calls were made, ensure we only return the final response after tool execution
    const reply = choice.message || { role: "assistant", content: "No response from AI." };

    // CRITICAL: If we had tool calls, we must have a proper final answer
    // The initial tool-calling message should NEVER be returned to the user
    if (hadToolCalls) {
      if (!reply.content || reply.content.trim() === "") {
        console.warn("Tool calls completed but no final response generated");
        reply.content = "I've searched the knowledge base but couldn't formulate a complete response. Please try rephrasing your question.";
      }

      // Check if the response looks like tool-calling metadata (shouldn't happen, but safeguard)
      // This can occur if the model echoes the function call instead of answering
      if (reply.content && (
        reply.content.includes('search_knowledge(') ||
        reply.content.includes('{"query"') ||
        reply.content.includes('{"result"') ||
        reply.content.toLowerCase().includes('searching knowledge base')
      )) {
        console.error("CRITICAL: Tool call metadata detected in final response! This should not happen.");
        console.error("Content preview:", reply.content.substring(0, 200));

        // The model failed to generate a proper answer despite having the context
        // This is a model behavior issue - return a helpful error message
        reply.content = "I apologize, but I encountered a technical issue processing your question. The knowledge base search completed successfully, but I couldn't generate a proper response. Please try rephrasing your question or ask something more specific about NSW road rules.";
      }
    }

    console.log(`Returning response with ${reply.content?.length || 0} chars, hadToolCalls: ${hadToolCalls}`);

    return new Response(
      JSON.stringify({
        role: reply.role,
        content: reply.content || "No response from AI.",
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    const safeMessage = createSafeErrorMessage(err);
    return new Response(
      JSON.stringify({ error: safeMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
