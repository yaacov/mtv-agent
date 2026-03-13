import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type ChatMessage as ChatMsg, type ToolCallEntry } from "../state/app-state.js";

@customElement("chat-message")
export class ChatMessageEl extends LitElement {
  static styles = css`
    :host {
      display: block;
      padding: 4px 0;
      animation: fadeIn 0.25s ease;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .message {
      display: flex;
      flex-direction: column;
      max-width: 100%;
    }

    .message.user {
      align-items: flex-end;
    }

    .message.assistant {
      align-items: flex-start;
    }

    .bubble {
      max-width: 85%;
      border-radius: var(--radius-lg);
      line-height: var(--line-height);
    }

    .user .bubble-wrapper .bubble {
      max-width: 100%;
    }

    .user .bubble-wrapper {
      position: relative;
      max-width: 85%;
    }

    .user .bubble {
      background: var(--bg-user-bubble);
      color: var(--text-primary);
      padding: 10px 16px;
      border-bottom-right-radius: var(--radius-xs);
      --md-h1-size: 1em;
      --md-h2-size: 1em;
      --md-h3-size: 1em;
      --md-h4-size: 1em;
    }

    .user .bubble.truncated {
      max-height: 6.4em;
      overflow: hidden;
    }

    .expand-toggle {
      position: absolute;
      top: 4px;
      right: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      font-size: 14px;
      line-height: 1;
      color: var(--text-tertiary);
      background: var(--bg-user-bubble);
      border: none;
      border-radius: var(--radius-xs);
      cursor: pointer;
      padding: 0;
      z-index: 1;
    }

    .expand-toggle:hover {
      color: var(--text-secondary);
    }

    .assistant .bubble {
      background: var(--bg-assistant);
      color: var(--text-primary);
      max-width: 100%;
      padding: 4px 0;
    }

    .tool-calls {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 8px 0;
      max-width: 100%;
    }

    .timestamp {
      font-size: var(--font-size-xs);
      color: var(--text-tertiary);
      margin-top: 4px;
      padding: 0 4px;
    }

    .role-label {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      color: var(--text-tertiary);
      margin-bottom: 4px;
      padding: 0 4px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .message.assistant.cancelled .bubble {
      opacity: 0.7;
      border-left: 3px solid #d32f2f;
      padding-left: 8px;
    }

    .cancelled-label {
      font-size: var(--font-size-xs);
      color: #d32f2f;
      font-style: italic;
      margin-top: 2px;
      padding: 0 4px;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  `;

  @property({ type: Object }) msg!: ChatMsg;
  @state() private userExpanded = false;
  @state() private userOverflows = false;

  protected updated() {
    if (this.msg.role !== "user" || !this.msg.content) return;
    // Wait for child markdown-renderer to finish rendering before measuring.
    const md = this.renderRoot.querySelector("markdown-renderer") as LitElement | null;
    const ready = md?.updateComplete ?? Promise.resolve();
    ready.then(() => {
      requestAnimationFrame(() => this._measureOverflow());
    });
  }

  private _measureOverflow() {
    const bubble = this.renderRoot.querySelector(".bubble") as HTMLElement | null;
    if (!bubble) return;
    const overflows = this.userExpanded ? true : bubble.scrollHeight > bubble.clientHeight + 1;
    if (overflows !== this.userOverflows) {
      this.userOverflows = overflows;
    }
  }

  private toggleExpand() {
    this.userExpanded = !this.userExpanded;
  }

  private formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  render() {
    const m = this.msg;
    const isUser = m.role === "user";
    const isCancelled = m.role === "assistant" && m.cancelled === true;

    return html`
      <div class="message ${m.role}${isCancelled ? " cancelled" : ""}">
        ${isUser ? nothing : html`<span class="role-label">Assistant</span>`}
        ${m.thinking ? html`<thinking-indicator></thinking-indicator>` : nothing}
        ${m.toolCalls?.length
          ? html`
              <div class="tool-calls">
                ${m.toolCalls.map(
                  (tc: ToolCallEntry) =>
                    html`<tool-call-card .entry=${tc} .sessionId=${this.msg.id}></tool-call-card>`,
                )}
              </div>
            `
          : nothing}
        ${m.content
          ? isUser
            ? html`
                <div class="bubble-wrapper">
                  <div class="bubble ${!this.userExpanded ? "truncated" : ""}">
                    <markdown-renderer .content=${m.content}></markdown-renderer>
                  </div>
                  ${this.userOverflows
                    ? html`<button
                        class="expand-toggle"
                        @click=${this.toggleExpand}
                        title=${this.userExpanded ? "Collapse" : "Expand"}
                      >
                        ${this.userExpanded ? "▽" : "◁"}
                      </button>`
                    : nothing}
                </div>
              `
            : html`
                <div class="bubble">
                  <markdown-renderer .content=${m.content}></markdown-renderer>
                </div>
              `
          : nothing}
        ${isCancelled
          ? html`<span class="cancelled-label" aria-label="This response was cancelled"
              >cancelled<span class="sr-only"> — response was interrupted</span></span
            >`
          : nothing}
        <span class="timestamp">${this.formatTime(m.timestamp)}</span>
      </div>
    `;
  }
}
