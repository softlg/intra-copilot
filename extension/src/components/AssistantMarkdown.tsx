import React from "react";
import rehypeHighlight from "rehype-highlight";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
export function isDefaultSessionTitle(title: unknown) {
  return (
    !title ||
    title === "新会话" ||
    (typeof title === "string" && title.toLowerCase() === "new chat")
  );
}

type AssistantMarkdownProps = {
  content: string;
  messageIndex: number;
  copiedCode?: string;
  onCopyCode: (code: string, codeId: string) => void;
  copyCodeLabel: string;
  copiedLabel: string;
};
type CodeElementProps = {
  className?: string;
  children?: React.ReactNode;
};

function getRenderedText(value: React.ReactNode): string {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (Array.isArray(value)) return value.map(getRenderedText).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(value)) {
    return getRenderedText(value.props.children);
  }
  return "";
}

/**
 * Models occasionally omit the space/newline that Markdown requires for a
 * heading (for example `###标题` or `... ###下一步`).  Normalise only the
 * prose portions, leaving fenced code untouched, so streamed responses remain
 * readable without changing the actual message text copied by the user.
 */
function decodeProseEscapes(value: string): string {
  return value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\([\\`*_{}\[\]()#+\-.!>])/g, "$1");
}

function normalizeCodeFenceLanguage(value: string): string {
  return value
    .replace(
      /^(\s*(?:```|~~~)java)(?=(?:class|public|import|package|interface|enum)\b)/gm,
      "$1\n",
    )
    .replace(
      /^(\s*(?:```|~~~)(?:go|golang))(?=(?:package|import|func|type|var|const)\b)/gm,
      "$1\n",
    )
    .replace(
      /^(\s*(?:```|~~~)(?:python|py))(?=(?:from|import|def|class)\b)/gm,
      "$1\n",
    )
    .replace(
      /^(\s*(?:```|~~~)(?:javascript|js|typescript|ts))(?=(?:const|let|var|function|class|interface|type|import)\b)/gm,
      "$1\n",
    )
    .replace(
      /^(\s*(?:```|~~~)(?:cpp|c\+\+|csharp|cs|rust|rs|kotlin|swift|php|ruby|sql|bash|sh))(?=(?:#include|using|fn|fun|class|function|def|SELECT|select|echo|export)\b)/gm,
      "$1\n",
    );
}

function normalizeMarkdownProse(value: string): string {
  return decodeProseEscapes(value)
    .replace(/(^|\n)([ \t]*#{1,6})(?=\S)/g, "$1$2 ")
    .replace(/([。！？.!?：:])\s+(#{1,6})(?=\S)/g, "$1\n\n$2 ")
    .replace(/^(#{1,6} [^\n]+?)(\|)/gm, "$1\n\n$2")
    .replace(/(^|\n)([ \t]*)(?:-(?!-)|[+•])(?=\S)/g, "$1$2- ")
    .replace(/(^|\n)([ \t]*)(\d{1,2})[.)、][ \t]*(?=\S)/g, "$1$2$3. ")
    .replace(/\*\*([^*\n]+?)\*\*(?=[\p{L}\p{N}])/gu, "**$1** ")
    .replace(/([^\n])\n([ \t]*\*\*[^*\n]{1,80}\*\*)[ \t]*(?=\n|$)/g, "$1\n\n$2")
    .replace(/(^|\n)([ \t]*\*\*[^*\n]{1,80}\*\*)[ \t]*(?=\n)/g, "$1$2\n")
    .replace(/([。！？.!?：:])\s+(?=(?:\d{1,2}[.)、]|[-+•])\s*\S)/g, "$1\n\n")
    .replace(/([。！？.?：:])\s+(\*\*[^*\n]{1,80}\*\*)/g, "$1\n\n$2")
    .replace(/\n{3,}/g, "\n\n");
}

function normalizeAssistantMarkdown(value: string): string {
  // 模型偶尔会输出 `1.内容`、`-内容` 这类缺少空格的列表，或把加粗小标题
  // 紧贴在正文段落里。这里只规整围栏代码之外的块结构，保留原始换行和内容。
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/([^\n])(```|~~~)/g, "$1\n\n$2")
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g)
    .map((part) => {
      if (/^(```|~~~)/.test(part)) {
        return normalizeCodeFenceLanguage(part);
      }
      return normalizeMarkdownProse(part);
    })
    .join("\n");
}

function isSafeAssistantUrl(value?: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function AssistantMarkdown({
  content,
  messageIndex,
  copiedCode,
  onCopyCode,
  copyCodeLabel,
  copiedLabel,
}: AssistantMarkdownProps) {
  let codeBlockIndex = 0;
  return (
    <ReactMarkdown
      skipHtml
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        code({ className, children, ...props }) {
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        pre({ children }) {
          const codeElement = React.Children.toArray(children).find((child) =>
            React.isValidElement(child),
          ) as React.ReactElement<CodeElementProps> | undefined;
          const code = getRenderedText(codeElement?.props.children).replace(
            /\n$/,
            "",
          );
          const className = codeElement?.props.className;
          const language =
            className?.match(/language-([\w+-]+)/)?.[1]?.toLowerCase() ||
            "text";
          const codeId = `${messageIndex}:${codeBlockIndex++}`;
          const isCopied = copiedCode === codeId;
          return (
            <div className="code-block">
              <div className="code-toolbar">
                <span className="code-language">{language}</span>
                <button
                  type="button"
                  className="code-copy-button"
                  onClick={() => onCopyCode(code, codeId)}
                  title={isCopied ? copiedLabel : copyCodeLabel}
                  aria-label={isCopied ? copiedLabel : copyCodeLabel}
                >
                  {isCopied ? "✓" : "⧉"}{" "}
                  {isCopied ? copiedLabel : copyCodeLabel}
                </button>
              </div>
              <pre>{codeElement ?? <code>{children}</code>}</pre>
            </div>
          );
        },
        a({ href, children, ...props }) {
          return (
            <a href={href} target="_blank" rel="noreferrer" {...props}>
              {children}
            </a>
          );
        },
        table({ children }) {
          return (
            <div className="markdown-table-wrap">
              <table>{children}</table>
            </div>
          );
        },
        img({ src, alt }) {
          if (
            !src ||
            !(
              isSafeAssistantUrl(src) ||
              /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(src)
            )
          )
            return null;
          return (
            <img
              className="markdown-image"
              src={src}
              alt={alt ?? ""}
              loading="lazy"
            />
          );
        },
      }}
    >
      {normalizeAssistantMarkdown(content)}
    </ReactMarkdown>
  );
}
