import type { MCPServerInfo, PlaybookInfo, ToolInfo } from "../services/api-client.js";
import type { CardDisplayType } from "../utils/tool-registry/index.js";

export const BUILTIN_TOOLS: ToolInfo[] = [
  {
    name: "set_context",
    description: "Set or update a context key-value pair for the conversation",
  },
  {
    name: "select_skill",
    description: "Load a reference guide (skill) for the current conversation",
  },
];

export type ToolPolicy = "auto-accept" | "auto-reject" | "ask";

export type MessageRole = "user" | "assistant";

export interface ToolCallEntry {
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
  denied?: boolean;
  denyReason?: string;
  pending?: boolean;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCallEntry[];
  thinking?: boolean;
  cancelled?: boolean;
  timestamp: number;
}

export interface UsageInfo {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  contextWindow: number;
}

export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: number;
}

export interface PinCard {
  id: string;
  title: string;
  content: string;
  timestamp: number;
  height?: number;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  type?: CardDisplayType;
  loading?: boolean;
}

export interface AppStateData {
  sessionId: string | null;
  activeChatId: string | null;
  chatList: ChatSummary[];
  messages: ChatMessage[];
  isStreaming: boolean;
  usage: UsageInfo | null;
  model: string;
  mcpServers: MCPServerInfo[];
  toolCount: number;
  contextWindow: number;
  maxActiveSkills: number;
  availableSkills: { name: string; description: string }[];
  activeSkills: string[];
  context: Record<string, string>;
  availableModels: string[];
  availablePlaybooks: PlaybookInfo[];
  availableTools: ToolInfo[];
  toolPolicies: Record<string, ToolPolicy>;
  pinCards: PinCard[];
  sidebarOpen: boolean;
  detailPaneOpen: boolean;
  detailPaneWidth: number;
  error: string | null;
  warning: string | null;
  streamStartTime: number | null;
  streamElapsed: number | null;
}

type Listener = () => void;

class AppState {
  private data: AppStateData = {
    sessionId: null,
    activeChatId: null,
    chatList: [],
    messages: [],
    isStreaming: false,
    usage: null,
    model: "",
    mcpServers: [],
    toolCount: 0,
    contextWindow: 0,
    maxActiveSkills: 3,
    availableSkills: [],
    activeSkills: [],
    context: {},
    availableModels: [],
    availablePlaybooks: [],
    availableTools: [],
    toolPolicies: {},
    pinCards: [],
    sidebarOpen: true,
    detailPaneOpen: true,
    detailPaneWidth: 340,
    error: null,
    warning: null,
    streamStartTime: null,
    streamElapsed: null,
  };

  private listeners = new Set<Listener>();

  get state(): Readonly<AppStateData> {
    return this.data;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  update(partial: Partial<AppStateData>): void {
    Object.assign(this.data, partial);
    this.notify();
  }

  addMessage(msg: ChatMessage): void {
    this.data.messages = [...this.data.messages, msg];
    this.notify();
  }

  updateLastAssistant(updater: (msg: ChatMessage) => ChatMessage): void {
    const msgs = [...this.data.messages];
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "assistant") {
        msgs[i] = updater(msgs[i]);
        break;
      }
    }
    this.data.messages = msgs;
    this.notify();
  }

  addToolCallToLast(entry: ToolCallEntry): void {
    this.updateLastAssistant((msg) => ({
      ...msg,
      toolCalls: [...(msg.toolCalls ?? []), entry],
    }));
  }

  updateLastToolCall(updater: (tc: ToolCallEntry) => ToolCallEntry): void {
    this.updateLastAssistant((msg) => {
      const tcs = [...(msg.toolCalls ?? [])];
      if (tcs.length > 0) {
        tcs[tcs.length - 1] = updater(tcs[tcs.length - 1]);
      }
      return { ...msg, toolCalls: tcs };
    });
  }

  clearMessages(): void {
    this.data.messages = [];
    this.data.sessionId = null;
    this.data.activeChatId = null;
    this.data.isStreaming = false;
    this.data.usage = null;
    this.data.error = null;
    this.data.streamStartTime = null;
    this.data.streamElapsed = null;
    this.notify();
  }

  setChatList(chats: ChatSummary[]): void {
    this.data.chatList = chats;
    this.notify();
  }

  setActiveChat(chatId: string, sessionId: string, messages: ChatMessage[]): void {
    this.data.activeChatId = chatId;
    this.data.sessionId = sessionId;
    this.data.messages = messages;
    this.data.isStreaming = false;
    this.data.usage = null;
    this.data.error = null;
    this.data.streamStartTime = null;
    this.data.streamElapsed = null;
    this.notify();
  }

  removeChat(chatId: string): void {
    this.data.chatList = this.data.chatList.filter((c) => c.id !== chatId);
    if (this.data.activeChatId === chatId) {
      this.clearMessages();
    }
    this.notify();
  }

  setContext(key: string, value: string): void {
    this.data.context = { ...this.data.context, [key]: value };
    this.notify();
  }

  removeContext(key: string): void {
    const ctx = { ...this.data.context };
    delete ctx[key];
    this.data.context = ctx;
    this.notify();
  }

  clearContext(): void {
    this.data.context = {};
    this.notify();
  }

  toggleSkill(name: string): void {
    const skills = [...this.data.activeSkills];
    const idx = skills.indexOf(name);
    if (idx >= 0) {
      skills.splice(idx, 1);
    } else {
      skills.push(name);
      if (skills.length > this.data.maxActiveSkills) {
        skills.shift();
      }
    }
    this.data.activeSkills = skills;
    this.notify();
  }

  setActiveSkills(skills: string[]): void {
    this.data.activeSkills = skills;
    this.notify();
  }

  /** Returns true if the stream should use ?approve=true (not all tools are auto-accept). */
  needsApproval(): boolean {
    const policies = Object.values(this.data.toolPolicies);
    if (policies.length === 0) return true;
    return policies.some((p) => p !== "auto-accept");
  }

  setToolPolicy(name: string, policy: ToolPolicy): void {
    this.data.toolPolicies = { ...this.data.toolPolicies, [name]: policy };
    this.notify();
  }

  setAllToolPolicies(policy: ToolPolicy): void {
    const policies: Record<string, ToolPolicy> = {};
    for (const tool of this.data.availableTools) {
      policies[tool.name] = policy;
    }
    this.data.toolPolicies = policies;
    this.notify();
  }

  hasCard(id: string): boolean {
    return this.data.pinCards.some((c) => c.id === id);
  }

  addCard(card: PinCard): void {
    if (this.hasCard(card.id)) return;
    this.data.pinCards = [...this.data.pinCards, card];
    this.notify();
  }

  removeCard(id: string): void {
    this.data.pinCards = this.data.pinCards.filter((c) => c.id !== id);
    this.notify();
  }

  moveCard(id: string, to: number): void {
    const cards = [...this.data.pinCards];
    const from = cards.findIndex((c) => c.id === id);
    if (from < 0 || from === to) return;
    const [card] = cards.splice(from, 1);
    cards.splice(to, 0, card);
    this.data.pinCards = cards;
    this.notify();
  }

  updateCardContent(id: string, content: string): void {
    this.data.pinCards = this.data.pinCards.map((c) =>
      c.id === id ? { ...c, content, timestamp: Date.now() } : c,
    );
    this.notify();
  }

  updateCard(id: string, partial: Partial<Omit<PinCard, "id">>): void {
    this.data.pinCards = this.data.pinCards.map((c) => (c.id === id ? { ...c, ...partial } : c));
    this.notify();
  }

  updateCardHeight(id: string, height: number): void {
    this.data.pinCards = this.data.pinCards.map((c) => (c.id === id ? { ...c, height } : c));
    this.notify();
  }

  genId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

export const appState = new AppState();

export function defaultPolicyForTool(name: string): ToolPolicy {
  if (name === "set_context" || name === "select_skill") return "auto-accept";
  return name.endsWith("_read") || name.endsWith("_help") ? "auto-accept" : "ask";
}
