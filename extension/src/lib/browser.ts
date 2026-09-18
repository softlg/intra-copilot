export const attachmentObjectUrlCache = new Map<string, string>();
const ATTACHMENT_OBJECT_URL_LIMIT = 100;

/**
 * 在页面主世界执行的上下文采集函数。该函数会被 chrome.scripting.executeScript
 * 序列化后注入到目标标签页执行，因此不能引用任何模块级变量。
 */
export function collectPageContext() {
  return {
    url: location.href,
    title: document.title,
    selection: (getSelection()?.toString() || "").slice(0, 4000),
    visibleText: (document.body?.innerText || "").slice(0, 12000),
    domSummary: Array.from(
      document.querySelectorAll(
        "input,button,select,textarea,a,[role='button'],[contenteditable='true'],.monaco-editor,.cm-editor",
      ),
    )
      .filter((element) => {
        if (!(element instanceof HTMLElement)) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0"
        );
      })
      .slice(0, 120)
      .map((element, index) => {
        const e = element as HTMLElement;
        const codeEditor = e.matches(".monaco-editor,.cm-editor");
        const name = (
          (codeEditor ? "代码编辑器" : "") ||
          e.getAttribute("aria-label") ||
          e.getAttribute("title") ||
          (e as HTMLInputElement).placeholder ||
          e.innerText ||
          (e as HTMLInputElement).value ||
          e.getAttribute("name") ||
          ""
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 160);
        return `${index + 1 < 10 ? " " : ""}ref_${index + 1} <${e.tagName.toLowerCase()}> role="${codeEditor ? "code-editor" : e.getAttribute("role") || (e.tagName === "A" ? "link" : e.tagName === "BUTTON" ? "button" : e.tagName.toLowerCase())}"${name ? ` name="${name.replace(/"/g, '\\"')}"` : ""}`;
      })
      .join("\n"),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Runs in the page's MAIN world so it can access Monaco's JavaScript API. The function is
 * serialized by chrome.scripting.executeScript and must not reference module-level values.
 */
export async function setEditorValueInPage(args: any) {
  const code = typeof args?.code === "string" ? args.code : "";
  if (!code.trim()) {
    return { ok: false, action: "SET_EDITOR", error: "Code is empty" };
  }
  const normalize = (value: unknown) =>
    String(value || "")
      .replace(/\s+/g, "")
      .trim();
  const expected = normalize(code).slice(0, 240);
  const verified = (value: unknown) => {
    const actual = normalize(value);
    const probe = expected.slice(0, Math.min(100, expected.length));
    return probe.length > 0 && actual.includes(probe);
  };
  const applyModel = (model: any, method: string) => {
    try {
      if (!model || typeof model.setValue !== "function") return null;
      model.setValue(code);
      const current =
        typeof model.getValue === "function" ? model.getValue() : "";
      return verified(current)
        ? {
            ok: true,
            action: "SET_EDITOR",
            method,
            preview: String(current).slice(0, 160),
          }
        : null;
    } catch {
      return null;
    }
  };
  const applyCodeMirror = (view: any, method: string) => {
    try {
      const doc = view?.state?.doc;
      if (
        !doc ||
        typeof doc.toString !== "function" ||
        !Number.isInteger(doc.length) ||
        typeof view.dispatch !== "function"
      ) {
        return null;
      }
      view.dispatch({
        changes: {
          from: 0,
          to: doc.length,
          insert: code,
        },
      });
      const current = view.state.doc.toString();
      return verified(current)
        ? {
            ok: true,
            action: "SET_EDITOR",
            method,
            preview: String(current).slice(0, 160),
          }
        : null;
    } catch {
      return null;
    }
  };
  const applyEditor = (editor: any, method: string) => {
    try {
      const byModel = applyModel(editor?.getModel?.(), `${method}-model`);
      if (byModel) return byModel;
      if (!editor || typeof editor.setValue !== "function") return null;
      editor.setValue(code);
      const current =
        typeof editor.getValue === "function" ? editor.getValue() : "";
      return verified(current)
        ? {
            ok: true,
            action: "SET_EDITOR",
            method,
            preview: String(current).slice(0, 160),
          }
        : null;
    } catch {
      return null;
    }
  };
  const editorCandidate = (value: any) => {
    if (!value || typeof value !== "object") return null;
    if (
      typeof value.dispatch === "function" &&
      typeof value.state?.doc?.toString === "function"
    ) {
      return { kind: "codeMirror", value };
    }
    if (
      typeof value.getModel === "function" &&
      typeof value.setValue === "function"
    ) {
      return { kind: "editor", value };
    }
    if (
      typeof value.getValue === "function" &&
      typeof value.setValue === "function"
    ) {
      return { kind: "model", value };
    }
    return null;
  };
  const applyCandidate = (candidate: any, method: string) =>
    candidate?.kind === "model"
      ? applyModel(candidate.value, method)
      : candidate?.kind === "codeMirror"
        ? applyCodeMirror(candidate.value, method)
        : applyEditor(candidate?.value, method);

  const deepQueryAll = (
    queryRoot: Document | ShadowRoot | HTMLElement,
    selector: string,
  ): Element[] => {
    const values = Array.from(queryRoot.querySelectorAll(selector));
    for (const element of Array.from(queryRoot.querySelectorAll("*"))) {
      if (element.shadowRoot) {
        values.push(...deepQueryAll(element.shadowRoot, selector));
      }
    }
    return values;
  };

  const markedEditor = deepQueryAll(
    document,
    "[data-intra-copilot-editor-target='true']",
  )[0];
  if (markedEditor instanceof HTMLElement) {
    markedEditor.setAttribute("data-intra-copilot-editor-target", "true");
  }
  const domEditors = deepQueryAll(
    document,
    ".monaco-editor, .cm-editor, .cm-content, textarea[class*='inputarea']",
  ).filter((element): element is HTMLElement => element instanceof HTMLElement);
  if (
    markedEditor instanceof HTMLElement &&
    !domEditors.includes(markedEditor)
  ) {
    domEditors.unshift(markedEditor);
  }

  if (!(markedEditor instanceof HTMLElement)) {
    const host = window as any;
    const globalMonaco = host.monaco;
    const globalModels = globalMonaco?.editor?.getModels?.() || [];
    if (Array.isArray(globalModels)) {
      for (const model of globalModels) {
        const result = applyModel(model, "monaco-global-model");
        if (result) return result;
      }
    }
    const globalEditors = globalMonaco?.editor?.getEditors?.() || [];
    if (Array.isArray(globalEditors)) {
      for (const editor of globalEditors) {
        const result = applyEditor(editor, "monaco-global-editor");
        if (result) return result;
      }
    }
  }

  for (const domEditor of domEditors) {
    const directCodeMirror =
      (domEditor as any).cmView?.view || (domEditor as any).view;
    const directCodeMirrorResult = applyCodeMirror(
      directCodeMirror,
      "codemirror-dom",
    );
    if (directCodeMirrorResult) return directCodeMirrorResult;
    const fiberKey = Object.keys(domEditor).find(
      (key) =>
        key.startsWith("__reactFiber$") ||
        key.startsWith("__reactInternalInstance$"),
    );
    if (fiberKey) {
      const seen = new Set<any>();
      const queue: any[] = [(domEditor as any)[fiberKey]];
      while (queue.length && seen.size < 3000) {
        const node = queue.shift();
        if (!node || seen.has(node)) continue;
        seen.add(node);
        for (const value of [
          node.stateNode,
          node.memoizedProps,
          node.memoizedState,
          node.ref,
        ]) {
          const candidate = editorCandidate(value);
          if (candidate) {
            const result = applyCandidate(candidate, "react-instance");
            if (result) return result;
          }
          if (value && typeof value === "object") queue.push(value);
        }
        if (node.child) queue.push(node.child);
        if (node.sibling) queue.push(node.sibling);
        if (node.return) queue.push(node.return);
      }
    }

    const surface =
      domEditor.querySelector(
        "textarea.inputarea, textarea, [contenteditable='true']",
      ) || domEditor;
    if (surface instanceof HTMLElement) {
      surface.focus();
      if (
        surface instanceof HTMLInputElement ||
        surface instanceof HTMLTextAreaElement
      ) {
        surface.select();
      } else if (surface.isContentEditable) {
        const selection = getSelection();
        const range = document.createRange();
        range.selectNodeContents(surface);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }

      try {
        const pasteData = new DataTransfer();
        pasteData.setData("text/plain", code);
        surface.dispatchEvent(
          new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: pasteData,
          } as any),
        );
      } catch {
        // ClipboardEvent is not supported on every Chromium version.
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const rendered = Array.from(domEditor.querySelectorAll(".view-line"))
        .map((line) => line.textContent || "")
        .join("\n");
      if (verified(rendered)) {
        return {
          ok: true,
          action: "SET_EDITOR",
          method: "clipboard-event",
          preview: rendered.slice(0, 160),
        };
      }

      try {
        document.execCommand("selectAll", false);
        if (document.execCommand("insertText", false, code)) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          const nextRendered = Array.from(
            domEditor.querySelectorAll(".view-line"),
          )
            .map((line) => line.textContent || "")
            .join("\n");
          if (verified(nextRendered)) {
            return {
              ok: true,
              action: "SET_EDITOR",
              method: "dom-execCommand",
              preview: nextRendered.slice(0, 160),
            };
          }
        }
      } catch {
        // Continue with direct input events below.
      }

      try {
        if (
          surface instanceof HTMLInputElement ||
          surface instanceof HTMLTextAreaElement
        ) {
          const setter = Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(surface),
            "value",
          )?.set;
          if (setter) setter.call(surface, code);
          else surface.value = code;
          surface.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              inputType: "insertText",
              data: code,
            }),
          );
        } else if (surface.isContentEditable) {
          surface.textContent = code;
          surface.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              inputType: "insertText",
              data: code,
            }),
          );
        }
      } catch {
        // Continue to the final verification result.
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const finalRendered = Array.from(domEditor.querySelectorAll(".view-line"))
        .map((line) => line.textContent || "")
        .join("\n");
      if (verified(finalRendered)) {
        return {
          ok: true,
          action: "SET_EDITOR",
          method: "input-event",
          preview: finalRendered.slice(0, 160),
        };
      }
    }
  }
  return {
    ok: false,
    action: "SET_EDITOR",
    error: "未能在页面中确认代码写入，请刷新 LeetCode 页面后重试",
  };
}

export async function executeEditorAction(tabId: number, action: any) {
  const frameId =
    typeof action.target === "object" &&
    Number.isInteger(action.target?.frameId)
      ? action.target.frameId
      : 0;
  let contentResult: any;
  try {
    contentResult = await chrome.tabs.sendMessage(
      tabId,
      {
        type: "EXECUTE_ACTION",
        action,
      },
      { frameId },
    );
  } catch {
    contentResult = { ok: false, error: "Content script unavailable" };
  }
  let mainResult: unknown;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      world: "MAIN",
      func: setEditorValueInPage,
      args: [{ ...action.arguments, target: action.target }],
    });
    mainResult = results[0]?.result;
  } finally {
    void chrome.tabs
      .sendMessage(tabId, { type: "CLEAR_EDITOR_TARGET" }, { frameId })
      .catch(() => {});
  }
  if ((mainResult as { ok?: boolean } | undefined)?.ok) return mainResult;
  return {
    ok: false,
    action: "SET_EDITOR",
    error:
      (mainResult as { error?: string } | undefined)?.error ||
      contentResult?.error ||
      "页面编辑器写入未成功",
  };
}

export async function resolveAttachment(
  fetchFn: (path: string, init?: RequestInit) => Promise<Response>,
  id: string,
): Promise<string> {
  const cached = attachmentObjectUrlCache.get(id);
  if (cached) return cached;
  const response = await fetchFn(`/attachments/${id}`);
  if (!response.ok) throw new Error(`attachment ${response.status}`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  attachmentObjectUrlCache.set(id, objectUrl);
  while (attachmentObjectUrlCache.size > ATTACHMENT_OBJECT_URL_LIMIT) {
    const oldest = attachmentObjectUrlCache.keys().next().value as
      string | undefined;
    if (!oldest) break;
    const stale = attachmentObjectUrlCache.get(oldest);
    attachmentObjectUrlCache.delete(oldest);
    if (stale) URL.revokeObjectURL(stale);
  }
  return objectUrl;
}

export async function collectContextsFromTab(
  id: number,
): Promise<Record<string, any>[]> {
  let frames: chrome.webNavigation.GetAllFrameResultDetails[] = [];
  try {
    frames = (await chrome.webNavigation.getAllFrames({ tabId: id })) || [];
  } catch {
    frames = [];
  }
  const frameIds = frames.length ? frames.map((frame) => frame.frameId) : [0];
  const contexts = await Promise.all(
    frameIds.map(async (frameId) => {
      try {
        const context = await chrome.tabs.sendMessage(
          id,
          { type: "COLLECT_CONTEXT" },
          { frameId },
        );
        return context ? { ...context, frameId } : null;
      } catch {
        return null;
      }
    }),
  );
  const available = contexts.filter(
    (context): context is Record<string, any> => context != null,
  );
  if (available.length) return available;

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: id, allFrames: true },
      func: collectPageContext,
    });
    return results
      .filter((result) => result.result)
      .map((result) => ({
        ...(result.result as Record<string, any>),
        frameId: result.frameId,
      }));
  } catch {
    return [];
  }
}
