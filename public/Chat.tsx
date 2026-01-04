import { useState, useRef, useEffect } from "preact/hooks";
import { Message } from "../types";
import Markdown from 'markdown-to-jsx';
import { Send, Sparkles, Car, Shield, FileText, Navigation, AlertCircle, Square, User, Bot, ChevronDown, ChevronRight, Copy, Check } from 'lucide-preact';

const MAX_MESSAGES = 10;
const MAX_QUESTION_LENGTH = 500;
const STORAGE_KEY = 'nswRoadRulesChat';
const STORAGE_EXPIRY_HOURS = 72; // Clear localStorage after this many hours
const INTERACTION_THRESHOLD = 3;
const REQUEST_TIMEOUT_MS = 60000; // 60 seconds
const LOADING_MESSAGE_INTERVAL_MS = 8000; // Change message every 10 seconds

const LOADING_MESSAGES = [
  "Thinking...",
  "Analyzing your question...",
  "Searching knowledge base...",
  "Gathering the best advice...",
  "Almost there...",
  "Still working on it...",
  "Processing your request...",
  "Fetching insights...",
  "Consulting road rules...",
  "Searching through regulations...",
  "Piecing together the answer...",
  "Just a moment longer...",
  "Reviewing the details...",
  "Connecting the dots...",
  "Preparing your response...",
  "Nearly ready..."
];

/**
 * Sanitize user input before sending to API
 */
const sanitizeInput = (text: string): string => {
  if (typeof text !== 'string') return '';
  // Remove control characters (except newlines/tabs) and trim
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
};

const Typewriter = ({ text, onComplete }: { text: string; onComplete?: () => void }) => {
  const [displayedText, setDisplayedText] = useState("");
  const index = useRef(0);

  useEffect(() => {
    index.current = 0;
    setDisplayedText("");

    // Calculate speed based on length to keep total time reasonable
    // Short: 20ms, Medium: 10ms, Long: 5ms, Very Long: 2ms
    let speed = 20;
    if (text.length > 500) speed = 2;
    else if (text.length > 200) speed = 5;
    else if (text.length > 100) speed = 10;

    const intervalId = setInterval(() => {
      setDisplayedText((prev) => {
        if (index.current < text.length) {
          // For very long texts, add multiple characters per tick to keep up
          const charsToAdd = text.length > 1000 ? 3 : 1;
          const nextChars = text.slice(index.current, index.current + charsToAdd);
          index.current += charsToAdd;
          return prev + nextChars;
        } else {
          clearInterval(intervalId);
          if (onComplete) onComplete();
          return prev;
        }
      });
    }, speed);

    return () => clearInterval(intervalId);
  }, [text]);

  return <Markdown options={{ forceBlock: true }}>{displayedText}</Markdown>;
};

const INSPIRATION_CATEGORIES = [
  {
    title: "Licences & Getting Started",
    icon: <FileText className="w-5 h-5 text-primary" />,
    questions: [
      { label: "Learner's licence", prompt: "How do I get my learner's licence in NSW?" },
      { label: "Licence classes", prompt: "What are the different licence classes in NSW?" },
      { label: "P1 restrictions", prompt: "What are the restrictions for P1 drivers?" },
      { label: "Overseas licence", prompt: "Can I drive in NSW with an overseas licence?" },
      { label: "Medical conditions", prompt: "What medical conditions affect my licence?" }
    ]
  },
  {
    title: "Traffic Rules & Priorities",
    icon: <AlertCircle className="w-5 h-5 text-destructive" />,
    questions: [
      { label: "Give way to pedestrians", prompt: "When must I give way to pedestrians?" },
      { label: "Roundabout rules", prompt: "How do roundabouts work in NSW?" },
      { label: "Traffic lights", prompt: "What are the rules at traffic lights?" },
      { label: "U-turns", prompt: "When can I make a U-turn?" },
      { label: "Railway crossings", prompt: "What are the railway crossing rules?" },
      { label: "Give way vs stop signs", prompt: "What's the difference between give way and stop signs?" }
    ]
  },
  {
    title: "Safe Driving",
    icon: <Shield className="w-5 h-5 text-accent" />,
    questions: [
      { label: "Speed limits", prompt: "What are the speed limits in NSW?" },
      { label: "Alcohol limits", prompt: "What are the alcohol and drug limits for drivers?" },
      { label: "Mobile phone rules", prompt: "What are the mobile phone rules while driving?" },
      { label: "Following distance", prompt: "What is a safe following distance?" },
      { label: "Seatbelts & child restraints", prompt: "What are the seatbelt and child restraint rules?" },
      { label: "Fatigue management", prompt: "How do I manage fatigue while driving?" }
    ]
  },
  {
    title: "Lanes & Road Markings",
    icon: <Navigation className="w-5 h-5 text-primary" />,
    questions: [
      { label: "Bus lanes", prompt: "Can I use bus lanes in NSW?" },
      { label: "Merging correctly", prompt: "How do I merge correctly?" },
      { label: "Road lines explained", prompt: "What do the different road lines mean?" },
      { label: "Overtaking rules", prompt: "What are the overtaking rules and procedures?" },
      { label: "Slip lanes", prompt: "What is a slip lane and how do I use it?" }
    ]
  },
  {
    title: "Parking & Special Situations",
    icon: <Square className="w-5 h-5 text-warning" />,
    questions: [
      { label: "No Parking zones", prompt: "Where can't I park in NSW?" },
      { label: "Parking signs", prompt: "What do parking signs mean?" },
      { label: "Breakdown procedure", prompt: "What should I do if my car breaks down?" },
      { label: "Sharing with cyclists", prompt: "How do I share the road safely with cyclists?" },
      { label: "Poor weather driving", prompt: "What are the rules for driving in poor weather conditions?" }
    ]
  }
];

export const Chat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set([0]));
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [interactionCount, setInteractionCount] = useState<number>(0);
  const [isFromStorage, setIsFromStorage] = useState<boolean>(true); // Skip typewriter for restored messages
  const [loadingMessageIndex, setLoadingMessageIndex] = useState<number>(0);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea as user types
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`; // Max 120px (~4 lines)
    }
  };

  // Check for reset querystring and handle localStorage expiration
  useEffect(() => {
    // Check for ?reset=1 querystring to clear localStorage
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('reset') === '1') {
      localStorage.removeItem(STORAGE_KEY);
      // Remove the querystring from URL without reload
      window.history.replaceState({}, document.title, window.location.pathname);
      console.log('localStorage cleared via reset parameter');
      return;
    }

    // Load conversation from localStorage
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);

        // Check if data has expired
        if (data.timestamp) {
          const storedTime = new Date(data.timestamp).getTime();
          const now = Date.now();
          const hoursDiff = (now - storedTime) / (1000 * 60 * 60);

          if (hoursDiff > STORAGE_EXPIRY_HOURS) {
            console.log(`localStorage expired after ${hoursDiff.toFixed(1)} hours, clearing...`);
            localStorage.removeItem(STORAGE_KEY);
            return;
          }
        }

        if (data.messages) setMessages(data.messages);
        if (data.interactionCount) setInteractionCount(data.interactionCount);
        // Keep isFromStorage true - these are restored messages
      }
    } catch (err) {
      console.error('Failed to load from localStorage:', err);
    }
  }, []);

  // Save conversation to localStorage when messages change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        messages,
        interactionCount,
        timestamp: new Date().toISOString()
      }));
    } catch (err) {
      console.error('Failed to save to localStorage:', err);
    }
  }, [messages, interactionCount]);

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const toggleCategory = (index: number) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const scrollToBottom = () => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, showSuggestions]);

  const sendMessage = async (text: string) => {
    const sanitized = sanitizeInput(text);
    if (!sanitized || loading) return;

    const question = { role: "user" as const, content: sanitized };
    setMessages(prev => [...prev, question]);
    setInput("");
    setLoading(true);
    setShowSuggestions(false);
    setLoadingMessageIndex(0);

    // Set up AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    // Pick a random loading message every interval
    const messageIntervalId = setInterval(() => {
      setLoadingMessageIndex(Math.floor(Math.random() * LOADING_MESSAGES.length));
    }, LOADING_MESSAGE_INTERVAL_MS);

    try {
      const response = await fetch("/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify([...messages, question].slice(-MAX_MESSAGES)),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMessage = "Something went wrong. Please try again.";
        try {
          const errorData = await response.json() as { error?: string };
          // Only use server error if it's a user-friendly message
          if (errorData.error && errorData.error.length < 200) {
            errorMessage = errorData.error;
          }
        } catch {
          // JSON parsing failed, use generic message
        }
        throw new Error(errorMessage);
      }

      const text = await response.text();
      let reply: Message;
      try {
        reply = JSON.parse(text);
      } catch (e) {
        console.error("Failed to parse JSON response:", text);
        throw new Error("Invalid response from server");
      }

      const answer = {
        role: "assistant" as const,
        content: reply.content,
      };

      setIsFromStorage(false); // Enable typewriter for new API responses
      setMessages(prev => [...prev, answer]);
      setInteractionCount(prev => prev + 1);
    } catch (e: any) {
      console.error(e);
      let errorMessage = e.message || "Sorry, I encountered an error. Please try again.";

      // Handle timeout/abort specifically
      if (e.name === 'AbortError') {
        errorMessage = "Request timed out. The server is taking too long to respond. Please try again.";
      }

      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${errorMessage}` }]);
    } finally {
      clearTimeout(timeoutId);
      clearInterval(messageIntervalId);
      setLoading(false);
      setLoadingMessageIndex(0);
    }
  };

  const onSubmit = (e: JSX.TargetedEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto bg-background shadow-xl border-x border-border">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Car className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">NSW Road Rules Chat</h1>
            <p className="text-xs text-muted-foreground font-medium">Your AI Guide to NSW Road Rules</p>
          </div>
        </div>
        <div className="text-xs px-3 py-1 bg-secondary text-secondary-foreground rounded-full font-medium">
          Beta
        </div>
      </header>

      {/* Chat Window */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scroll-smooth" ref={chatWindowRef}>
        {messages.length === 0 ? (
          <div className="max-w-2xl mx-auto mt-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                Welcome to NSW Road Rules Chat
              </h2>
              <p className="text-muted-foreground text-lg">
                I can help you understand NSW road rules and answer your driving questions.
                <br /> Choose a topic below to get started, or enter your own question
              </p>
            </div>

            <div className="space-y-6">
              {INSPIRATION_CATEGORIES.map((category, idx) => (
                <div key={idx} className="space-y-3 animate-in fade-in slide-in-from-bottom-3 duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
                  <button
                    onClick={() => toggleCategory(idx)}
                    className="flex items-center gap-2 w-full text-left hover:opacity-70 transition-opacity"
                  >
                    {expandedCategories.has(idx) ? (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    )}
                    {category.icon}
                    <h3 className="font-semibold text-foreground">{category.title}</h3>
                  </button>
                  {expandedCategories.has(idx) && (
                    <div className="flex flex-wrap gap-2 ml-7 animate-in fade-in slide-in-from-top-2 duration-300">
                      {category.questions.map((q, qIdx) => (
                        <button
                          key={qIdx}
                          onClick={() => sendMessage(q.prompt)}
                          disabled={loading}
                          className="text-sm bg-secondary/50 hover:bg-primary hover:text-primary-foreground px-4 py-2 rounded-full transition-colors duration-200 text-left"
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex w-full items-end gap-2 ${m.role === "user" ? "justify-end" : "justify-start"
                  } animate-fade-in-up`}
              >
                {m.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="w-5 h-5 text-primary" />
                  </div>
                )}

                <div
                  className={`flex flex-col max-w-[80%] sm:max-w-[70%] rounded-2xl px-5 py-3.5 shadow-sm ${m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-none"
                    : "bg-card border border-border text-card-foreground rounded-bl-none"
                    }`}
                >
                  <div className={`prose prose-sm max-w-none ${m.role === 'user' ? 'prose-invert' : ''}`}>
                    {m.role === 'assistant' && i === messages.length - 1 && !loading && !isFromStorage ? (
                      <Typewriter text={m.content} onComplete={() => setIsFromStorage(false)} />
                    ) : (
                      <Markdown options={{ forceBlock: true }}>{m.content}</Markdown>
                    )}
                  </div>
                  {m.role === 'assistant' && (
                    <div className="flex justify-end mt-2 pt-2 border-t border-border/50">
                      <button
                        onClick={() => copyToClipboard(m.content, i)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        title="Copy response"
                      >
                        {copiedIndex === i ? (
                          <><Check className="w-4 h-4 text-green-500" /> Copied!</>
                        ) : (
                          <><Copy className="w-4 h-4" style={{ marginTop: "4px" }} /></>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {m.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-secondary-foreground" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex justify-start items-end gap-2 animate-fade-in-up">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="w-5 h-5 text-primary" />
                </div>
                <div className="bg-card border border-border rounded-2xl rounded-bl-none px-5 py-4 shadow-sm flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-primary/50 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-2 h-2 bg-primary/50 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-2 h-2 bg-primary/50 rounded-full animate-bounce"></div>
                  </div>
                  <span className="text-sm text-muted-foreground animate-pulse">
                    {LOADING_MESSAGES[loadingMessageIndex]}
                  </span>
                </div>
              </div>
            )}

            {/* Transport NSW Promo - shows after 3 interactions */}
            {interactionCount >= INTERACTION_THRESHOLD && !loading && messages.length > 0 && (
              <div className="mx-auto max-w-md mt-6 p-4 bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-xl animate-fade-in-up">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/20 rounded-full">
                    <Car className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Need official information?</p>
                    <p className="text-xs text-muted-foreground">Visit <strong>Transport for NSW</strong> for authoritative road rules and licensing</p>
                  </div>
                  <a
                    href="https://roadsafety.transport.nsw.gov.au/"
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-full hover:bg-primary/90 transition-colors"
                  >
                    Visit
                  </a>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-background border-t border-border">
        <div className="max-w-3xl mx-auto relative">
          {showSuggestions && (
            <div className="absolute bottom-full left-0 right-0 mb-4 bg-card border border-border rounded-xl shadow-xl p-4 animate-in slide-in-from-bottom-2 fade-in duration-200 z-20 max-h-[60vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-sm text-muted-foreground">Suggested Topics</h3>
                <button onClick={() => setShowSuggestions(false)} className="text-muted-foreground hover:text-foreground">
                  <span className="sr-only">Close</span>
                  ✕
                </button>
              </div>
              <div className="space-y-4">
                {INSPIRATION_CATEGORIES.map((category, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/80">
                      {category.icon}
                      {category.title}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {category.questions.map((q, qIdx) => (
                        <button
                          key={qIdx}
                          onClick={() => sendMessage(q.prompt)}
                          disabled={loading}
                          className="text-xs bg-secondary/50 hover:bg-primary hover:text-primary-foreground px-3 py-1.5 rounded-full transition-colors duration-200 text-left"
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form
            onSubmit={onSubmit}
            className="relative flex items-end shadow-sm rounded-2xl bg-background ring-1 ring-border focus-within:ring-2 focus-within:ring-ring transition-all duration-200"
          >
            <button
              type="button"
              onClick={() => setShowSuggestions(!showSuggestions)}
              className={`p-3 ml-1 mb-1 rounded-full text-muted-foreground bg-primary/5 hover:text-primary hover:bg-primary/10 transition-colors ${showSuggestions ? 'text-primary bg-primary/10' : 'animate-pulse-glow'}`}
              title="Suggested Topics"
            >
              <Sparkles className="w-5 h-5" />
            </button>
            <textarea
              ref={textareaRef}
              id="question"
              className="flex-1 bg-transparent border-none outline-none px-4 py-4 text-base placeholder:text-muted-foreground resize-none overflow-hidden"
              placeholder="Your NSW road rules question"
              value={input}
              onInput={(e) => {
                setInput((e.target as any)?.value ?? "");
                adjustTextareaHeight();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() && !loading) {
                    sendMessage(input);
                    // Reset textarea height
                    if (textareaRef.current) {
                      textareaRef.current.style.height = 'auto';
                    }
                  }
                }
              }}
              maxLength={MAX_QUESTION_LENGTH}
              disabled={loading}
              rows={1}
              style={{ minHeight: '24px' }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="p-3 mr-2 mb-1 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
          <p className="text-center text-muted-foreground mt-3">
            AI can make mistakes. Please verify important information with official sources.
          </p>
          <p className="text-center text-xs text-muted-foreground results-container">
            Information sourced from the <a href="https://www.nsw.gov.au/driving-boating-and-transport/roads-safety-and-rules/safety-updates-for-nsw-road-users/road-user-handbook" target="_blank" rel="noreferrer">NSW Road User Handbook</a><br/>
            &copy; 2026 - Not affiliated with <a href="https://roadsafety.transport.nsw.gov.au/" target="_blank" rel="noreferrer">Transport for NSW</a> or <a href="https://status.openai.com" target="_blank" rel="noreferrer">OpenAI</a>.<br />
            <br />&nbsp;
          </p>
        </div>
      </div>
    </div>
  );
};
