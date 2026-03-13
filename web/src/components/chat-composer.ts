import { LitElement, html, css } from "lit";
import { customElement, property, state, query } from "lit/decorators.js";
import { appState } from "../state/app-state.js";

@customElement("chat-composer")
export class ChatComposer extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .usage-bar {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      padding: 4px 8px;
      font-size: var(--font-size-xs);
      color: var(--text-tertiary);
    }

    .composer {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      padding: 12px 16px;
      background: var(--bg-input);
      border: 1px solid var(--border-primary);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-md);
      transition:
        border-color var(--transition-fast),
        box-shadow var(--transition-fast);
    }

    .composer:focus-within {
      border-color: var(--accent-primary);
      box-shadow:
        var(--shadow-md),
        0 0 0 2px rgba(174, 86, 48, 0.15);
    }

    textarea {
      flex: 1;
      border: none;
      background: none;
      resize: none;
      outline: none;
      font-family: var(--font-sans);
      font-size: var(--font-size-base);
      line-height: var(--line-height);
      color: var(--text-primary);
      max-height: 200px;
      min-height: 24px;
      padding: 7px 0;
    }

    textarea::placeholder {
      color: var(--text-tertiary);
    }

    .send-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: none;
      border-radius: var(--radius-full);
      background: var(--accent-primary);
      color: var(--text-inverse);
      cursor: pointer;
      flex-shrink: 0;
      transition:
        background var(--transition-fast),
        transform var(--transition-fast);
    }

    .send-btn:hover {
      background: var(--accent-hover);
    }

    .send-btn:active {
      transform: scale(0.95);
    }

    .send-btn:disabled {
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      cursor: not-allowed;
    }

    .send-btn.stop {
      background: var(--status-error, #d32f2f);
    }

    .send-btn.stop:hover {
      background: color-mix(in srgb, var(--status-error, #d32f2f) 85%, black);
    }

    .send-btn .material-symbols-outlined {
      font-family: "Material Symbols Outlined";
      font-weight: normal;
      font-style: normal;
      font-size: 20px;
      line-height: 1;
      letter-spacing: normal;
      text-transform: none;
      white-space: nowrap;
      direction: ltr;
      font-feature-settings: "liga";
      -webkit-font-smoothing: antialiased;
    }

    .toggle-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: none;
      border-radius: var(--radius-full);
      background: transparent;
      color: var(--text-tertiary);
      cursor: pointer;
      flex-shrink: 0;
      transition:
        color var(--transition-fast),
        background var(--transition-fast),
        transform var(--transition-fast);
    }

    .toggle-btn:hover {
      color: var(--accent-primary);
      background: var(--bg-secondary);
    }

    .toggle-btn.open {
      color: var(--accent-primary);
      transform: rotate(45deg);
    }

    .toggle-btn .material-symbols-outlined {
      font-family: "Material Symbols Outlined";
      font-weight: normal;
      font-style: normal;
      font-size: 22px;
      line-height: 1;
      letter-spacing: normal;
      text-transform: none;
      white-space: nowrap;
      direction: ltr;
      font-feature-settings: "liga";
      -webkit-font-smoothing: antialiased;
    }
  `;

  @property({ type: Boolean }) playbooksOpen = false;

  @state() private text = "";
  @state() private isStreaming = false;
  @state() private usage: {
    totalTokens: number;
    contextWindow: number;
  } | null = null;
  @state() private elapsed: number | null = null;

  @query("textarea") private textarea!: HTMLTextAreaElement;

  private unsubscribe?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.unsubscribe = appState.subscribe(() => {
      this.isStreaming = appState.state.isStreaming;
      this.usage = appState.state.usage;
      this.elapsed = appState.state.streamElapsed;
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
  }

  private autoResize() {
    const ta = this.textarea;
    if (!ta) return;
    ta.style.height = "auto";
    if (ta.scrollHeight > ta.clientHeight) {
      ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
    } else {
      ta.style.removeProperty("height");
    }
  }

  private handleInput(e: InputEvent) {
    this.text = (e.target as HTMLTextAreaElement).value;
    this.autoResize();
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.send();
    }
  }

  private togglePlaybooks() {
    this.dispatchEvent(new CustomEvent("toggle-playbooks", { bubbles: true, composed: true }));
  }

  private send() {
    const msg = this.text.trim();
    if (!msg || this.isStreaming) return;
    this.text = "";
    if (this.textarea) {
      this.textarea.style.height = "auto";
    }
    this.dispatchEvent(
      new CustomEvent("send-message", {
        detail: { message: msg },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private cancel() {
    this.dispatchEvent(
      new CustomEvent("cancel-stream", { bubbles: true, composed: true }),
    );
  }

  private formatTokens(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  }

  render() {
    return html`
      ${this.usage || this.elapsed !== null
        ? html`
            <div class="usage-bar">
              ${this.usage
                ? html`<span>
                    ${this.formatTokens(this.usage.totalTokens)} /
                    ${this.formatTokens(this.usage.contextWindow)} tokens
                  </span>`
                : ""}
              ${this.elapsed !== null ? html`<span>${this.elapsed.toFixed(1)}s</span>` : ""}
            </div>
          `
        : ""}

      <div class="composer">
        <button
          class="toggle-btn ${this.playbooksOpen ? "open" : ""}"
          @click=${this.togglePlaybooks}
          title="${this.playbooksOpen ? "Hide playbooks" : "Show playbooks"}"
          aria-label="${this.playbooksOpen ? "Hide playbooks" : "Show playbooks"}"
        >
          <span class="material-symbols-outlined">add</span>
        </button>
        <textarea
          rows="1"
          placeholder="Send a message..."
          .value=${this.text}
          @input=${this.handleInput}
          @keydown=${this.handleKeyDown}
        ></textarea>
        ${this.isStreaming
          ? html`<button
              class="send-btn stop"
              @click=${this.cancel}
              title="Stop"
              aria-label="Stop"
            >
              <span class="material-symbols-outlined">block</span>
            </button>`
          : html`<button
              class="send-btn"
              @click=${this.send}
              ?disabled=${!this.text.trim()}
              title="Send message"
              aria-label="Send message"
            >
              <span class="material-symbols-outlined">forklift</span>
            </button>`}
      </div>
    `;
  }
}
