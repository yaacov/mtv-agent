import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import xml from "highlight.js/lib/languages/xml";
import css_ from "highlight.js/lib/languages/css";
import sql from "highlight.js/lib/languages/sql";
import markdown from "highlight.js/lib/languages/markdown";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import DOMPurify from "dompurify";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("json", json);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("yml", yaml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("css", css_);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("md", markdown);
hljs.registerLanguage("go", go);
hljs.registerLanguage("rust", rust);

const marked = new Marked(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code: string, lang: string) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch {
          // fall through
        }
      }
      return hljs.highlightAuto(code).value;
    },
  }),
);

marked.setOptions({ breaks: true, gfm: true });

@customElement("markdown-renderer")
export class MarkdownRenderer extends LitElement {
  static styles = css`
    :host {
      display: block;
      line-height: var(--line-height);
      color: var(--text-primary);
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .md h1,
    .md h2,
    .md h3,
    .md h4 {
      margin-top: 1.2em;
      margin-bottom: 0.4em;
      font-weight: var(--font-weight-bold);
      line-height: 1.3;
    }

    .md h1 {
      font-size: var(--md-h1-size, 1.5em);
    }
    .md h2 {
      font-size: var(--md-h2-size, 1.3em);
    }
    .md h3 {
      font-size: var(--md-h3-size, 1.15em);
    }
    .md h4 {
      font-size: var(--md-h4-size, 1em);
    }

    .md h1:first-child,
    .md h2:first-child,
    .md h3:first-child {
      margin-top: 0;
    }

    .md p {
      margin: 0.6em 0;
    }

    .md p:first-child {
      margin-top: 0;
    }

    .md p:last-child {
      margin-bottom: 0;
    }

    .md ul,
    .md ol {
      margin: 0.6em 0;
      padding-left: 1.5em;
    }

    .md li {
      margin: 0.2em 0;
    }

    .md code {
      font-family: var(--font-mono);
      font-size: 0.9em;
      padding: 0.15em 0.4em;
      border-radius: var(--radius-xs);
      background: var(--bg-code);
      color: var(--text-code);
    }

    .md pre {
      margin: 0.8em 0;
      padding: 14px 16px;
      border-radius: var(--radius-sm);
      background: var(--bg-code);
      overflow-x: auto;
      font-size: 0.88em;
      line-height: 1.5;
    }

    .md pre code {
      padding: 0;
      background: none;
      color: var(--text-primary);
      font-size: inherit;
    }

    .md blockquote {
      margin: 0.8em 0;
      padding: 0.4em 1em;
      border-left: 3px solid var(--accent-primary);
      color: var(--text-secondary);
      background: var(--bg-tertiary);
      border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
    }

    .md table {
      width: 100%;
      border-collapse: collapse;
      margin: 0.8em 0;
      font-size: var(--font-size-sm);
    }

    .md th,
    .md td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid var(--border-secondary);
    }

    .md th {
      font-weight: var(--font-weight-bold);
      color: var(--text-secondary);
      border-bottom-color: var(--border-primary);
    }

    .md a {
      color: var(--accent-info);
      text-decoration: none;
    }

    .md a:hover {
      text-decoration: underline;
    }

    .md hr {
      margin: 1.2em 0;
      border: none;
      border-top: 1px solid var(--border-secondary);
    }

    .md img {
      max-width: 100%;
      border-radius: var(--radius-sm);
    }

    /* highlight.js theme integration */
    .md .hljs-keyword,
    .md .hljs-selector-tag,
    .md .hljs-built_in,
    .md .hljs-name,
    .md .hljs-tag {
      color: var(--accent-primary);
    }
    .md .hljs-string,
    .md .hljs-title,
    .md .hljs-section,
    .md .hljs-attribute,
    .md .hljs-literal,
    .md .hljs-template-tag,
    .md .hljs-template-variable,
    .md .hljs-type,
    .md .hljs-addition {
      color: var(--accent-success);
    }
    .md .hljs-comment,
    .md .hljs-quote,
    .md .hljs-deletion,
    .md .hljs-meta {
      color: var(--text-tertiary);
    }
    .md .hljs-number,
    .md .hljs-regexp,
    .md .hljs-literal,
    .md .hljs-bullet,
    .md .hljs-link {
      color: var(--accent-info);
    }
    .md .hljs-emphasis {
      font-style: italic;
    }
    .md .hljs-strong {
      font-weight: var(--font-weight-bold);
    }
  `;

  @property({ type: String }) content = "";

  private _cacheKey = "";
  private _cacheHtml = "";

  private renderMarkdown(): string {
    if (!this.content) return "";
    if (this._cacheKey === this.content) return this._cacheHtml;
    this._cacheKey = this.content;
    const raw = marked.parse(this.content) as string;
    this._cacheHtml = DOMPurify.sanitize(raw);
    return this._cacheHtml;
  }

  render() {
    return html`<div class="md">${unsafeHTML(this.renderMarkdown())}</div>`;
  }
}
