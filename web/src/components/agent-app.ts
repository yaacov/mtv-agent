import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  appState,
  BUILTIN_TOOLS,
  defaultPolicyForTool,
  type PinCard,
  type ToolPolicy,
} from "../state/app-state.js";
import {
  getStatus,
  getModels,
  getSkills,
  getPlaybooks,
  getMcpServers,
  connectMcpServer,
  getTools,
  getChats,
  getChat,
  deleteChat as apiDeleteChat,
} from "../services/api-client.js";
import type { ChatSummary } from "../state/app-state.js";
import { executeStreamChat } from "../services/stream-handler.js";
import { convertStoredMessages } from "../services/chat-utils.js";

@customElement("agent-app")
export class AgentApp extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-sans);
    }

    .content {
      display: flex;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .sidebar-container {
      width: var(--sidebar-width);
      min-width: var(--sidebar-width);
      height: 100%;
      transition: margin-left var(--transition-normal);
      overflow: hidden;
    }

    .sidebar-container.collapsed {
      margin-left: calc(-1 * var(--sidebar-width));
    }

    .main {
      flex: 1;
      display: flex;
      flex-direction: row;
      height: 100%;
      min-width: 0;
      position: relative;
    }

    .chat-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      height: 100%;
      min-width: var(--chat-area-min-width);
      position: relative;
    }

    detail-pane {
      height: 100%;
      flex-shrink: 0;
    }

    @media (max-width: 768px) {
      .sidebar-container {
        position: absolute;
        z-index: 100;
        top: 0;
        left: 0;
        height: 100%;
        box-shadow: var(--shadow-lg);
      }

      .sidebar-container.collapsed {
        margin-left: calc(-1 * var(--sidebar-width));
      }

      resize-handle,
      detail-pane {
        display: none;
      }
    }
  `;

  @state() private sidebarOpen = appState.state.sidebarOpen;
  @state() private detailPaneOpen = appState.state.detailPaneOpen;
  @state() private detailPaneWidth = appState.state.detailPaneWidth;

  private dragStartWidth = 0;
  private unsubscribe?: () => void;
  private abortController?: AbortController;

  connectedCallback() {
    super.connectedCallback();
    this.unsubscribe = appState.subscribe(() => {
      this.sidebarOpen = appState.state.sidebarOpen;
      this.detailPaneOpen = appState.state.detailPaneOpen;
      if (!appState.state.isStreaming && this.abortController) {
        this.abortController.abort();
        this.abortController = undefined;
      }
    });
    this.addEventListener("send-message", this.onSendMessage as EventListener);
    this.addEventListener("cancel-stream", this.onCancelStream as EventListener);
    this.addEventListener("load-chat", this.onLoadChat as unknown as EventListener);
    this.addEventListener("delete-chat", this.onDeleteChat as unknown as EventListener);
    this.addEventListener("pin-card", this.onPinCard as EventListener);
    this.loadInitialData();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
    this.removeEventListener("send-message", this.onSendMessage as EventListener);
    this.removeEventListener("cancel-stream", this.onCancelStream as EventListener);
    this.removeEventListener("load-chat", this.onLoadChat as unknown as EventListener);
    this.removeEventListener("delete-chat", this.onDeleteChat as unknown as EventListener);
    this.removeEventListener("pin-card", this.onPinCard as EventListener);
  }

  private async loadInitialData() {
    try {
      const [status, skills, playbooks, initialMcpServers, initialTools, chatDtos] = await Promise.all([
        getStatus(),
        getSkills(),
        getPlaybooks(),
        getMcpServers(),
        getTools(),
        getChats(),
      ]);
      let mcpServers = initialMcpServers;
      let tools = initialTools;
      const chatList: ChatSummary[] = chatDtos.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updated_at,
      }));

      let models: string[] = [];
      let warning: string | null = null;
      if (status.llm_status !== "ok") {
        warning = "LLM server is unreachable. Start your LLM server and reload the page.";
      } else {
        try {
          models = await getModels();
        } catch {
          warning = "Could not fetch model list from LLM server.";
        }
      }

      // Retry any MCP servers that failed during backend startup.
      const disconnected = mcpServers.filter((s) => !s.connected);
      const failedNames: string[] = [];
      let toolCount = status.tools;
      for (const s of disconnected) {
        try {
          const result = await connectMcpServer(s.name);
          mcpServers = result.servers;
          toolCount = result.tools;
        } catch {
          failedNames.push(s.name);
        }
      }
      if (failedNames.length > 0) {
        const names = failedNames.join(", ");
        warning = [warning, `MCP server${failedNames.length > 1 ? "s" : ""} unreachable: ${names}.`]
          .filter(Boolean)
          .join(" ");
      }
      if (disconnected.length > 0) {
        tools = await getTools();
      }

      const allToolsUpdated = [...tools, ...BUILTIN_TOOLS];
      const updatedPolicies: Record<string, ToolPolicy> = {};
      for (const t of allToolsUpdated) {
        updatedPolicies[t.name] =
          appState.state.toolPolicies[t.name] ?? defaultPolicyForTool(t.name);
      }

      appState.update({
        model: status.model,
        mcpServers,
        toolCount,
        contextWindow: status.context_window,
        maxActiveSkills: status.max_active_skills,
        availableModels: models,
        availableSkills: skills,
        availablePlaybooks: playbooks,
        availableTools: allToolsUpdated,
        toolPolicies: updatedPolicies,
        chatList,
        warning,
      });
    } catch (err) {
      appState.update({
        error: `Cannot connect to agent server: ${(err as Error).message}`,
      });
    }
  }

  private onSendMessage = (e: CustomEvent<{ message: string }>) => {
    this.handleSend(e.detail.message);
  };

  private onCancelStream = () => {
    this.handleCancel();
  };

  private handleCancel() {
    if (!this.abortController) return;
    this.abortController.abort();
    this.abortController = undefined;

    appState.updateLastAssistant((m) => ({
      ...m,
      thinking: false,
      content: m.content || "",
      cancelled: true,
    }));
    appState.update({ isStreaming: false });
  }

  private onLoadChat = async (e: CustomEvent<{ chatId: string }>) => {
    if (appState.state.isStreaming) return;
    const { chatId } = e.detail;
    try {
      const record = await getChat(chatId);
      const messages = convertStoredMessages(
        record.messages ?? [],
        record.id,
        record.updated_at * 1000,
      );
      appState.setActiveChat(chatId, chatId, messages);
    } catch (err) {
      appState.update({ error: `Failed to load chat: ${(err as Error).message}` });
    }
  };

  private onDeleteChat = async (e: CustomEvent<{ chatId: string }>) => {
    const { chatId } = e.detail;
    try {
      await apiDeleteChat(chatId);
      appState.removeChat(chatId);
    } catch (err) {
      appState.update({ error: `Failed to delete chat: ${(err as Error).message}` });
    }
  };

  private onPinCard = (e: CustomEvent<{ card: PinCard }>) => {
    appState.addCard(e.detail.card);
    if (!appState.state.detailPaneOpen) {
      appState.update({ detailPaneOpen: true });
    }
  };

  private async handleSend(message: string) {
    if (appState.state.isStreaming) return;

    appState.addMessage({
      id: appState.genId(),
      role: "user",
      content: message,
      timestamp: Date.now(),
    });
    appState.addMessage({
      id: appState.genId(),
      role: "assistant",
      content: "",
      thinking: true,
      timestamp: Date.now(),
    });

    const approve = appState.needsApproval();
    const startTime = performance.now();
    appState.update({ isStreaming: true, error: null, streamStartTime: Date.now() });

    this.abortController = new AbortController();
    await executeStreamChat(message, approve, startTime, this.abortController.signal);
  }

  private onPaneResize = (e: CustomEvent<{ delta: number }>) => {
    const styles = getComputedStyle(this);
    const paneMinWidth = parseInt(styles.getPropertyValue("--detail-pane-min-width")) || 200;
    const chatMinWidth = parseInt(styles.getPropertyValue("--chat-area-min-width")) || 320;
    const handleWidth = 4;

    const mainEl = this.shadowRoot?.querySelector(".main");
    const availableWidth = mainEl ? mainEl.clientWidth : Infinity;
    const maxWidth = availableWidth - chatMinWidth - handleWidth;

    if (!this.dragStartWidth) {
      this.dragStartWidth = this.detailPaneWidth;
    }
    const newWidth = Math.max(
      paneMinWidth,
      Math.min(maxWidth, this.dragStartWidth - e.detail.delta),
    );
    this.detailPaneWidth = newWidth;
  };

  private onPaneResizeEnd = () => {
    appState.update({ detailPaneWidth: this.detailPaneWidth });
    this.dragStartWidth = 0;
  };

  render() {
    return html`
      <top-bar></top-bar>
      <div class="content">
        <div class="sidebar-container ${this.sidebarOpen ? "" : "collapsed"}">
          <agent-sidebar></agent-sidebar>
        </div>
        <div class="main">
          <div class="chat-area">
            <agent-chat></agent-chat>
          </div>
          ${this.detailPaneOpen
            ? html`
                <resize-handle
                  @handle-resize=${this.onPaneResize}
                  @resize-end=${this.onPaneResizeEnd}
                ></resize-handle>
                <detail-pane style="width:${this.detailPaneWidth}px"></detail-pane>
              `
            : ""}
        </div>
      </div>
    `;
  }
}
