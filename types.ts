export const ROLES = ["user", "assistant", "system", "tool"] as const;

export type Message = {
  role: (typeof ROLES)[number];
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

// Knowledge Base Types
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

// OpenAI Function Calling Types
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  tool_call_id: string;
  role: "tool";
  content: string;
}

export interface ChatCompletionMessage {
  role: string;
  content: string | null;
  tool_calls?: ToolCall[];
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatCompletionMessage;
  finish_reason: "stop" | "tool_calls" | "length" | "content_filter";
}
