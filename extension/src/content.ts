type Ctx = {
  url: string;
  title: string;
  selection: string;
  visibleText: string;
  domSummary: string;
  frameId: number;
  snapshotId: string;
  timestamp: string;
};
type ActionElement = {
  elementId: string;
  element: HTMLElement;
  summary: string;
};
type ActionTarget =
  | string
  | {
      snapshotId: string;
      frameId: number;
      elementId: string;
    };
type Language = "zh" | "en";
const root = document.createElement("div");
root.id = "intra-copilot-root";
root.style.display = "none";
const shadow = root.attachShadow({ mode: "open" });
document.documentElement.appendChild(root);
shadow.innerHTML = `<style>.ball{position:fixed;right:22px;bottom:80px;width:52px;height:52px;border-radius:50%;background:#2563eb;color:#fff;z-index:2147483647;display:grid;place-items:center;font:700 18px sans-serif;box-shadow:0 5px 16px #0004;cursor:grab;user-select:none}.ball.edge{width:26px;height:68px;right:0;border-radius:24px 0 0 24px;font-size:12px}.ball-button{position:absolute;width:20px;height:20px;padding:0;border:1px solid #fff;border-radius:50%;background:#111;color:#fff;box-shadow:0 2px 6px #0004;cursor:pointer;font:600 13px/18px sans-serif;place-items:center}.mini{top:-11px;right:-11px;display:grid}.dismiss{top:-11px;left:-11px;display:grid}.dismiss:hover{background:#dc2626}</style><div class="ball" title="打开 Intra Copilot">✦<button class="ball-button mini" title="收缩">−</button><button class="ball-button dismiss" title="关闭悬浮球" aria-label="关闭悬浮球">×</button></div>`;
const visualRoot = document.createElement("div");
visualRoot.id = "intra-copilot-visual-root";
const visualShadow = visualRoot.attachShadow({ mode: "open" });
visualShadow.innerHTML = `<style>
.cursor{position:fixed;left:0;top:0;width:18px;height:18px;border:2px solid #2563eb;border-radius:50%;background:#fff;box-shadow:0 3px 10px #0004;opacity:0;pointer-events:none;transition:transform 220ms ease,opacity 120ms ease;z-index:2147483647}
.highlight{position:fixed;border:2px solid #2563eb;border-radius:6px;background:#2563eb14;box-shadow:0 0 0 1px #fff8;opacity:0;pointer-events:none;transition:all 180ms ease;z-index:2147483646}
.status{position:fixed;right:18px;bottom:18px;padding:8px 12px;border-radius:8px;background:#111827f2;color:#fff;font:12px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px #0004;opacity:0;pointer-events:none;transition:opacity 160ms ease;z-index:2147483647}
.approval{position:fixed;inset:0;display:none;place-items:center;background:#11182738;z-index:2147483647;font:13px/1.5 system-ui,sans-serif}
.approval.open{display:grid}
.approval-card{width:min(420px,calc(100vw - 32px));padding:18px;border:1px solid #d1d5db;border-radius:10px;background:#fff;color:#111827;box-shadow:0 18px 60px #11182740}
.approval-title{margin:0 0 8px;font-size:16px}
.approval-reason{margin:0 0 12px;color:#374151;white-space:pre-wrap}
.approval-actions{display:flex;justify-content:flex-end;gap:8px}
.approval-actions button{padding:7px 12px;border:1px solid #d1d5db;border-radius:7px;background:#fff;color:#111827;cursor:pointer}
.approval-actions .primary{border-color:#2563eb;background:#2563eb;color:#fff}
</style><div class="highlight"></div><div class="cursor"></div><div class="status"></div><div class="approval"><div class="approval-card"><h2 class="approval-title"></h2><p class="approval-reason"></p><div class="approval-actions"><button type="button" class="reject"></button><button type="button" class="primary approve"></button></div></div></div>`;
document.documentElement.appendChild(visualRoot);
const visualCursor = visualShadow.querySelector(".cursor") as HTMLElement;
const visualHighlight = visualShadow.querySelector(".highlight") as HTMLElement;
const visualStatus = visualShadow.querySelector(".status") as HTMLElement;
const approvalPanel = visualShadow.querySelector(".approval") as HTMLElement;
const approvalTitle = visualShadow.querySelector(
  ".approval-title",
) as HTMLElement;
const approvalReason = visualShadow.querySelector(
  ".approval-reason",
) as HTMLElement;
const approvalApprove = visualShadow.querySelector(
  ".approve",
) as HTMLButtonElement;
const approvalReject = visualShadow.querySelector(
  ".reject",
) as HTMLButtonElement;
let visualStatusTimer: number | undefined;
const ball = shadow.querySelector(".ball") as HTMLElement;
const mini = shadow.querySelector(".mini") as HTMLButtonElement;
const dismiss = shadow.querySelector(".dismiss") as HTMLButtonElement;
let language: Language = "zh";
let pageEnabled = false;
let frameId = 0;
let snapshotSequence = 0;
let interactionMode:
  "FAST" | "VISIBLE_VIRTUAL" | "BROWSER_TRUSTED" | "SYSTEM_TRUSTED" =
  "VISIBLE_VIRTUAL";
const actionElements = new Map<string, HTMLElement>();
let currentSnapshotId = "";
let currentSnapshotCapabilities = "";
let snapshotStale = false;
let snapshotObserver: MutationObserver | null = null;
function setPageEnabled(enabled: boolean) {
  pageEnabled = enabled;
  root.style.display = enabled && frameId === 0 ? "block" : "none";
}

function refreshPageEnabled() {
  chrome.runtime.sendMessage({ type: "CONTENT_READY" }, (response) => {
    if (chrome.runtime.lastError) return;
    if (Number.isInteger(response?.frameId)) frameId = response.frameId;
    setPageEnabled(Boolean(response?.enabled));
  });
}

function updateBallLanguage(next: Language) {
  language = next;
  ball.title = language === "en" ? "Open Intra Copilot" : "打开 Intra Copilot";
  mini.title = language === "en" ? "Collapse" : "收缩";
  dismiss.title = language === "en" ? "Hide floating button" : "关闭悬浮球";
  dismiss.setAttribute(
    "aria-label",
    language === "en" ? "Hide floating button" : "关闭悬浮球",
  );
}
let drag = false,
  moved = false,
  sx = 0,
  sy = 0;

function clampBall() {
  if (!ball.style.left || !ball.style.top) return;
  const rect = ball.getBoundingClientRect();
  const maxX = Math.max(0, window.innerWidth - rect.width);
  const maxY = Math.max(0, window.innerHeight - rect.height);
  ball.style.left = Math.min(maxX, Math.max(0, rect.left)) + "px";
  ball.style.top = Math.min(maxY, Math.max(0, rect.top)) + "px";
}

function restoreBallPosition(value: any) {
  if (value.ballEdge) {
    ball.style.left = "";
    ball.style.right = "0px";
    if (value.ballPos) ball.style.top = value.ballPos.y + "px";
  } else if (value.ballAnchor) {
    const rect = ball.getBoundingClientRect();
    const maxX = Math.max(0, window.innerWidth - rect.width);
    const maxY = Math.max(0, window.innerHeight - rect.height);
    ball.style.left = value.ballAnchor.x * maxX + "px";
    ball.style.top = value.ballAnchor.y * maxY + "px";
    ball.style.right = "auto";
  } else if (value.ballPos) {
    ball.style.left = value.ballPos.x + "px";
    ball.style.top = value.ballPos.y + "px";
    ball.style.right = "auto";
  }
  clampBall();
}

chrome.storage.local.get(
  ["ballPos", "ballAnchor", "ballEdge", "language", "interactionMode"],
  (value: any) => {
    if (value.language === "en" || value.language === "zh") {
      updateBallLanguage(value.language);
    }
    if (
      value.interactionMode === "FAST" ||
      value.interactionMode === "VISIBLE_VIRTUAL" ||
      value.interactionMode === "BROWSER_TRUSTED" ||
      value.interactionMode === "SYSTEM_TRUSTED"
    )
      interactionMode = value.interactionMode;
    if (value.ballEdge) ball.classList.add("edge");
    restoreBallPosition(value);
  },
);
refreshPageEnabled();
chrome.storage.onChanged.addListener((changes) => {
  const next = changes.language?.newValue;
  if (next === "en" || next === "zh") updateBallLanguage(next);
  if (
    changes.interactionMode?.newValue === "FAST" ||
    changes.interactionMode?.newValue === "VISIBLE_VIRTUAL" ||
    changes.interactionMode?.newValue === "BROWSER_TRUSTED" ||
    changes.interactionMode?.newValue === "SYSTEM_TRUSTED"
  )
    interactionMode = changes.interactionMode.newValue;
  if (changes.activationMode || changes.enabledTabIds) refreshPageEnabled();
});
window.addEventListener("resize", clampBall);
window.visualViewport?.addEventListener("resize", clampBall);
new MutationObserver(() => {
  if (!document.documentElement.contains(root)) {
    document.documentElement.appendChild(root);
  }
  if (!document.documentElement.contains(visualRoot)) {
    document.documentElement.appendChild(visualRoot);
  }
}).observe(document.documentElement, { childList: true, subtree: true });
ball.addEventListener("pointerdown", (e) => {
  if ((e.target as HTMLElement).closest("button")) return;
  drag = true;
  moved = false;
  sx = e.clientX - ball.offsetLeft;
  sy = e.clientY - ball.offsetTop;
  ball.setPointerCapture(e.pointerId);
});
ball.addEventListener("pointermove", (e) => {
  if (!drag) return;
  moved = true;
  const rect = ball.getBoundingClientRect();
  ball.style.left =
    Math.max(0, Math.min(window.innerWidth - rect.width, e.clientX - sx)) +
    "px";
  ball.style.top =
    Math.max(0, Math.min(window.innerHeight - rect.height, e.clientY - sy)) +
    "px";
  ball.style.right = "auto";
});
ball.addEventListener("pointerup", () => {
  if (drag) {
    drag = false;
    const rect = ball.getBoundingClientRect();
    chrome.storage.local.set({
      ballPos: { x: ball.offsetLeft, y: ball.offsetTop },
      ballAnchor: {
        x:
          rect.width >= window.innerWidth
            ? 0
            : ball.offsetLeft / (window.innerWidth - rect.width),
        y:
          rect.height >= window.innerHeight
            ? 0
            : ball.offsetTop / (window.innerHeight - rect.height),
      },
    });
    if (!moved) chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
  }
});
mini.addEventListener("click", (e) => {
  e.stopPropagation();
  const collapsing = !ball.classList.contains("edge");
  if (collapsing) {
    const rect = ball.getBoundingClientRect();
    ball.classList.add("edge");
    ball.style.left = "";
    ball.style.right = "0px";
    ball.style.top = Math.max(0, rect.top) + "px";
    chrome.storage.local.set({
      ballEdge: true,
      ballPos: { x: rect.left, y: rect.top },
    });
  } else {
    ball.classList.remove("edge");
    ball.style.right = "auto";
    chrome.storage.local.get(["ballPos"], (value: any) => {
      if (value.ballPos) {
        ball.style.left = value.ballPos.x + "px";
        ball.style.top = value.ballPos.y + "px";
      } else {
        ball.style.left = "";
        ball.style.top = "";
      }
      clampBall();
    });
    chrome.storage.local.set({ ballEdge: false });
  }
});
dismiss.addEventListener("click", (e) => {
  e.stopPropagation();
  setPageEnabled(false);
  chrome.runtime.sendMessage({ type: "DISMISS_FLOATING_BALL" }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) refreshPageEnabled();
  });
});
export function collectContext(): Ctx {
  const elements = collectActionElements();
  return {
    url: location.href,
    title: document.title,
    selection: getSelection()?.toString().slice(0, 4000) || "",
    visibleText: deepVisibleText().slice(0, 12000),
    domSummary: `snapshotId="${currentSnapshotId}" frameId=${frameId}\n${currentSnapshotCapabilities}\n${elements
      .map((item) => item.summary)
      .join("\n")}`,
    frameId,
    snapshotId: currentSnapshotId,
    timestamp: new Date().toISOString(),
  };
}

function collectActionElements(): ActionElement[] {
  snapshotObserver?.disconnect();
  snapshotStale = false;
  actionElements.clear();
  currentSnapshotId = `snap_${Date.now()}_${frameId}_${++snapshotSequence}`;
  const baseElements = deepQueryAll(
    document,
    "input,button,select,textarea,a,[role='button'],[role='textbox'],[role='combobox'],[contenteditable='true'],.monaco-editor,.cm-editor,.view-lines,.cm-content,[data-mode-id],[data-language],[role='status'],[aria-live],pre,code,h1,h2,h3,table,[data-testid],[id*='result' i],[class*='result' i],[id*='editor' i],[class*='editor' i],[id*='code' i],[class*='code' i]",
  )
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .filter(isVisible);
  const editorElements: HTMLElement[] = [];
  deepQueryAll(document, ".view-line,.cm-line,[data-line-number]").forEach(
    (element) => {
      if (!(element instanceof HTMLElement)) return;
      const editor =
        element.closest(
          ".monaco-editor,.cm-editor,[role='textbox'],[contenteditable='true'],[data-mode-id],[data-language],[class*='editor' i]",
        ) || element;
      if (editor instanceof HTMLElement && isVisible(editor)) {
        editorElements.push(editor);
      }
    },
  );
  const candidates = Array.from(new Set([...baseElements, ...editorElements]));
  const elements = candidates.slice(0, 120).map((element, index) => {
    const elementId = `el_${index + 1}`;
    actionElements.set(elementId, element);
    const tag = element.tagName.toLowerCase();
    const codeEditor = isCodeEditorElement(element);
    const role =
      (codeEditor ? "code-editor" : element.getAttribute("role")) ||
      (tag === "a" ? "link" : tag === "button" ? "button" : tag);
    const name = compact(
      (codeEditor ? "代码编辑器" : "") ||
        element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        (element as HTMLInputElement).placeholder ||
        element.innerText ||
        (element as HTMLInputElement).value ||
        element.getAttribute("name") ||
        "",
    );
    const type = (element as HTMLInputElement).type;
    const disabled =
      "disabled" in element && Boolean((element as HTMLInputElement).disabled);
    const value = compact((element as HTMLInputElement).value || "");
    const languageHost = element.matches("[data-language],[data-mode-id]")
      ? element
      : element.querySelector("[data-language],[data-mode-id]");
    const language =
      element.getAttribute("data-language") ||
      element.getAttribute("data-mode-id") ||
      languageHost?.getAttribute("data-language") ||
      languageHost?.getAttribute("data-mode-id") ||
      "";
    const details = [
      `${elementId} <${tag}>`,
      `role="${role}"`,
      name ? `name="${escapeAttribute(name)}"` : "",
      language ? `language="${escapeAttribute(language)}"` : "",
      type ? `type="${type}"` : "",
      value ? `value="${escapeAttribute(value)}"` : "",
      disabled ? "disabled=true" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return { elementId, element, summary: details };
  });
  snapshotObserver = new MutationObserver((records) => {
    if (records.some((record) => mutationTouchesRegisteredElement(record))) {
      snapshotStale = true;
    }
  });
  snapshotObserver.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  const editorCount = elements.filter((item) =>
    isCodeEditorElement(item.element),
  ).length;
  const runButton = elements.some((item) => /运行|run/i.test(item.summary));
  const submitButton = elements.some((item) =>
    /提交|submit/i.test(item.summary),
  );
  const capabilities = `capabilities: editor=${editorCount > 0} run=${runButton} submit=${submitButton}`;
  currentSnapshotCapabilities = capabilities;
  return elements;
}

function isCodeEditorElement(element: HTMLElement) {
  return Boolean(
    element.matches(
      ".monaco-editor,.cm-editor,.view-lines,.cm-content,[data-mode-id],[data-language]",
    ) ||
    element.closest(
      ".monaco-editor,.cm-editor,[data-mode-id],[data-language]",
    ) ||
    element.querySelector(
      ".monaco-editor,.cm-editor,.view-lines,.cm-content,[data-mode-id],[data-language]",
    ),
  );
}

function mutationTouchesRegisteredElement(record: MutationRecord) {
  if (
    record.type === "attributes" &&
    record.attributeName === "data-intra-copilot-editor-target"
  ) {
    return false;
  }
  const candidates =
    record.type === "childList"
      ? [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)]
      : [record.target];
  for (const candidate of candidates) {
    if (!(candidate instanceof Node)) continue;
    for (const element of actionElements.values()) {
      if (
        candidate === element ||
        candidate.contains(element) ||
        element.contains(candidate)
      ) {
        return true;
      }
    }
  }
  return false;
}

function deepQueryAll(
  root: Document | ShadowRoot | HTMLElement,
  selector: string,
) {
  const values: Element[] = Array.from(root.querySelectorAll(selector));
  const descendants = Array.from(root.querySelectorAll("*"));
  for (const element of descendants) {
    if (element.shadowRoot) {
      values.push(...deepQueryAll(element.shadowRoot, selector));
    }
  }
  return values;
}

function isVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    style.opacity !== "0"
  );
}

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 160);
}

function deepVisibleText(
  root: Document | ShadowRoot | HTMLElement = document,
): string {
  const body =
    root instanceof Document
      ? root.body
      : root instanceof ShadowRoot
        ? root
        : root;
  const own =
    body instanceof HTMLBodyElement || body instanceof HTMLElement
      ? body.innerText || body.textContent || ""
      : body.textContent || "";
  const nested: string = Array.from(root.querySelectorAll("*"))
    .filter(
      (element) =>
        element.shadowRoot &&
        !["intra-copilot-root", "intra-copilot-visual-root"].includes(
          element.id,
        ),
    )
    .map((element) => deepVisibleText(element.shadowRoot!))
    .filter(Boolean)
    .join("\n");
  return nested ? `${own}\n${nested}` : own;
}

function escapeAttribute(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function resolveActionElement(
  target?: ActionTarget,
  allowStale = false,
): HTMLElement | null {
  if (!target) return null;
  if (!allowStale && snapshotStale) return null;
  if (
    typeof target === "object" &&
    (target.snapshotId !== currentSnapshotId || target.frameId !== frameId)
  ) {
    return null;
  }
  const elementId = typeof target === "string" ? target : target.elementId;
  const registered = actionElements.get(elementId);
  if (registered && registered.isConnected && isVisible(registered))
    return registered;
  return null;
}

function fillElement(element: HTMLElement, value: string) {
  element.focus();
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: value,
      }),
    );
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (element.isContentEditable) {
    element.textContent = value;
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: value,
      }),
    );
    return;
  }
  throw Error(
    language === "en"
      ? "Target is not a fillable input"
      : "目标元素不是可填写控件",
  );
}

function setEditorElement(element: HTMLElement, value: string) {
  const editor = element.closest(".monaco-editor") || element;
  deepQueryAll(document, "[data-intra-copilot-editor-target]").forEach((item) =>
    item.removeAttribute("data-intra-copilot-editor-target"),
  );
  editor.setAttribute("data-intra-copilot-editor-target", "true");
  const input = editor.querySelector(
    "textarea.inputarea, textarea, [contenteditable='true']",
  ) as HTMLElement | null;
  const target: HTMLElement = input || (editor as HTMLElement);
  target.focus();
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    target.select();
  } else if (target.isContentEditable) {
    const selection = getSelection();
    const range = document.createRange();
    range.selectNodeContents(target);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
  if (document.execCommand("insertText", false, value)) {
    return { ok: true, action: "SET_EDITOR", method: "execCommand" };
  }
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    if (setter) setter.call(target, value);
    else target.value = value;
    target.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: value,
      }),
    );
    return { ok: true, action: "SET_EDITOR", method: "native-setter" };
  }
  if (target.isContentEditable) {
    target.textContent = value;
    target.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: value,
      }),
    );
    return { ok: true, action: "SET_EDITOR", method: "contenteditable" };
  }
  return {
    ok: false,
    action: "SET_EDITOR",
    error: language === "en" ? "Code editor not found" : "未找到代码编辑器",
  };
}

function dispatchMouseSequence(element: HTMLElement) {
  element.scrollIntoView({ block: "center", inline: "center" });
  const rect = element.getBoundingClientRect();
  const options = {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    button: 0,
  };
  element.dispatchEvent(new PointerEvent("pointerdown", options));
  element.dispatchEvent(new MouseEvent("mousedown", options));
  element.dispatchEvent(new PointerEvent("pointerup", options));
  element.dispatchEvent(new MouseEvent("mouseup", options));
  element.click();
}

function setNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: value,
    }),
  );
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function selectOption(element: HTMLElement, argumentsValue: any) {
  if (!(element instanceof HTMLSelectElement)) {
    throw Error("SELECT target is not a select element");
  }
  const values = Array.isArray(argumentsValue?.values)
    ? argumentsValue.values.map(String)
    : [String(argumentsValue?.value ?? "")];
  for (const option of Array.from(element.options)) {
    option.selected =
      values.includes(option.value) || values.includes(option.text);
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function setChecked(element: HTMLElement, checked: boolean) {
  if (!(element instanceof HTMLInputElement)) {
    throw Error("CHECK target is not an input element");
  }
  if (element.checked !== checked) element.click();
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function hoverElement(element: HTMLElement) {
  element.scrollIntoView({ block: "center", inline: "center" });
  element.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
  element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  element.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
  element.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
}

function pressKey(element: HTMLElement | null, argumentsValue: any) {
  const raw = String(argumentsValue?.key || "");
  if (!raw) throw Error("PRESS_KEY requires key");
  const parts = raw.split("+").map((part) => part.trim());
  const key = parts.pop() || raw;
  const modifiers = {
    altKey: parts.some((part) => /alt/i.test(part)),
    ctrlKey: parts.some((part) => /ctrl|control/i.test(part)),
    metaKey: parts.some((part) => /meta|cmd|command/i.test(part)),
    shiftKey: parts.some((part) => /shift/i.test(part)),
  };
  const target = element || document.activeElement || document.body;
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...modifiers,
    }),
  );
  target.dispatchEvent(
    new KeyboardEvent("keyup", {
      key,
      bubbles: true,
      cancelable: true,
      ...modifiers,
    }),
  );
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function uploadFiles(element: HTMLElement, files: any[]) {
  if (!(element instanceof HTMLInputElement) || element.type !== "file") {
    throw Error("UPLOAD target is not a file input");
  }
  const transfer = new DataTransfer();
  for (const item of files) {
    transfer.items.add(
      new File(
        [decodeBase64(String(item?.dataBase64 || ""))],
        String(item?.name || "upload.bin"),
        {
          type: String(item?.contentType || "application/octet-stream"),
        },
      ),
    );
  }
  element.files = transfer.files;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function normalizedText(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function evaluateCondition(condition: any, allowStaleTarget = false): boolean {
  if (!condition || typeof condition !== "object") return true;
  if (
    condition.urlContains &&
    !location.href.includes(String(condition.urlContains))
  ) {
    return false;
  }
  if (condition.textVisible) {
    const text = normalizedText(deepVisibleText());
    if (!text.includes(normalizedText(condition.textVisible))) return false;
  }
  if (condition.documentTextContains) {
    const text = normalizedText(deepVisibleText());
    if (!text.includes(normalizedText(condition.documentTextContains)))
      return false;
  }
  if (condition.target) {
    const target = resolveActionElement(condition.target, allowStaleTarget);
    if (!target) return false;
    if (
      condition.valueEquals != null &&
      normalizedText((target as HTMLInputElement).value) !==
        normalizedText(condition.valueEquals)
    ) {
      return false;
    }
    if (
      condition.checkedEquals != null &&
      target instanceof HTMLInputElement &&
      target.checked !== Boolean(condition.checkedEquals)
    ) {
      return false;
    }
    if (condition.editorContains) {
      const rendered =
        Array.from(target.querySelectorAll(".view-line"))
          .map((line) => line.textContent || "")
          .join("\n") ||
        (target as HTMLInputElement).value ||
        target.textContent ||
        "";
      if (
        !normalizedText(rendered).includes(
          normalizedText(condition.editorContains).slice(0, 120),
        )
      ) {
        return false;
      }
    }
  }
  if (condition.elementExists) {
    if (!resolveActionElement(condition.elementExists, allowStaleTarget))
      return false;
  }
  return true;
}

async function waitForCondition(
  condition: any,
  timeoutMs = 5000,
  allowStaleTarget = false,
) {
  const deadline =
    Date.now() + Math.max(100, Math.min(30000, Number(timeoutMs) || 5000));
  while (Date.now() <= deadline) {
    if (evaluateCondition(condition, allowStaleTarget)) return true;
    await new Promise((resolve) => window.setTimeout(resolve, 120));
  }
  return evaluateCondition(condition, allowStaleTarget);
}

function extractValue(element: HTMLElement | null, format: string) {
  if (!element) {
    if (format === "html") return document.documentElement.outerHTML;
    return document.body?.innerText || "";
  }
  if (format === "html") return element.outerHTML;
  if (format === "value") {
    return (element as HTMLInputElement).value ?? element.textContent ?? "";
  }
  if (format === "code") {
    return Array.from(element.querySelectorAll(".view-line"))
      .map((line) => line.textContent || "")
      .join("\n");
  }
  return element.innerText || element.textContent || "";
}

async function showVisualAction(
  element: HTMLElement,
  type: string,
  reason?: string,
) {
  if (interactionMode === "FAST") return;
  const rect = element.getBoundingClientRect();
  const targetX = rect.left + rect.width / 2 - 9;
  const targetY = rect.top + rect.height / 2 - 9;
  visualCursor.style.opacity = "1";
  visualCursor.style.transform = `translate(${targetX}px, ${targetY}px)`;
  visualHighlight.style.opacity = "1";
  visualHighlight.style.left = `${rect.left - 3}px`;
  visualHighlight.style.top = `${rect.top - 3}px`;
  visualHighlight.style.width = `${rect.width + 6}px`;
  visualHighlight.style.height = `${rect.height + 6}px`;
  showVisualStatus(reason || actionProgressText(type));
  await new Promise((resolve) => window.setTimeout(resolve, 230));
}

let approvalResolver: ((approved: boolean) => void) | null = null;

function requestActionApproval(action: any) {
  if (approvalResolver) approvalResolver(false);
  approvalTitle.textContent =
    language === "en" ? "Allow page operation?" : "是否允许页面操作？";
  const actionLabel = actionProgressText(String(action?.type || ""));
  const reason = normalizedText(action?.reason);
  const risk = String(action?.risk || "medium");
  approvalReason.textContent = [
    actionLabel,
    reason,
    language === "en" ? `Risk: ${risk}` : `风险等级：${risk}`,
  ]
    .filter(Boolean)
    .join("\n");
  approvalApprove.textContent =
    language === "en" ? "Allow once" : "允许本次操作";
  approvalReject.textContent = language === "en" ? "Reject" : "拒绝";
  approvalPanel.classList.add("open");
  return new Promise<boolean>((resolve) => {
    approvalResolver = (approved) => {
      approvalResolver = null;
      approvalPanel.classList.remove("open");
      resolve(approved);
    };
  });
}

approvalApprove.addEventListener("click", () => approvalResolver?.(true));
approvalReject.addEventListener("click", () => approvalResolver?.(false));

function showVisualStatus(message: string, persistMs = 1800) {
  if (interactionMode === "FAST") return;
  visualStatus.textContent = message;
  visualStatus.style.opacity = "1";
  if (visualStatusTimer !== undefined) window.clearTimeout(visualStatusTimer);
  visualStatusTimer = window.setTimeout(() => {
    visualStatus.style.opacity = "0";
  }, persistMs);
}

function hideVisualAction() {
  visualCursor.style.opacity = "0";
  visualHighlight.style.opacity = "0";
}

function actionProgressText(type: string) {
  if (language === "en") {
    return (
      {
        CLICK: "Clicking the target",
        TYPE: "Writing into the input",
        FILL: "Writing into the input",
        SET_EDITOR: "Writing code",
        SELECT: "Selecting an option",
        CHECK: "Checking the option",
        UNCHECK: "Unchecking the option",
        NAVIGATE: "Opening the page",
      }[type] || "Operating on the page"
    );
  }
  return (
    {
      CLICK: "正在点击目标",
      TYPE: "正在填写输入框",
      FILL: "正在填写输入框",
      SET_EDITOR: "正在写入代码",
      SELECT: "正在选择选项",
      CHECK: "正在勾选",
      UNCHECK: "正在取消勾选",
      NAVIGATE: "正在打开页面",
    }[type] || "正在操作页面"
  );
}

function actionRect(element: HTMLElement) {
  element.scrollIntoView({ block: "center", inline: "center" });
  const rect = element.getBoundingClientRect();
  let left = rect.left;
  let top = rect.top;
  let currentWindow: Window = window;
  while (currentWindow.frameElement instanceof HTMLElement) {
    const frameRect = currentWindow.frameElement.getBoundingClientRect();
    left += frameRect.left;
    top += frameRect.top;
    currentWindow = currentWindow.parent;
  }
  const chromeTop = Math.max(0, window.outerHeight - window.innerHeight);
  return {
    x: left + rect.width / 2,
    y: top + rect.height / 2,
    screenX: window.screenX + left + rect.width / 2,
    screenY: window.screenY + chromeTop + top + rect.height / 2,
    left,
    top,
    width: rect.width,
    height: rect.height,
  };
}

async function executeBrowserAction(a: any) {
  const supported = new Set([
    "CLICK",
    "FOCUS",
    "TYPE",
    "FILL",
    "CLEAR",
    "SELECT",
    "CHECK",
    "UNCHECK",
    "HOVER",
    "SCROLL",
    "PRESS_KEY",
    "UPLOAD",
    "NAVIGATE",
    "SET_EDITOR",
    "WAIT_FOR",
    "VERIFY",
    "EXTRACT",
    "SNAPSHOT",
  ]);
  if (!supported.has(a.type)) {
    throw Error(language === "en" ? "Unsupported action" : "不支持的操作");
  }
  if (a.type === "NAVIGATE") {
    showVisualStatus(actionProgressText(a.type));
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    location.href = a.arguments?.url;
    return { ok: true, action: a.type, verified: true, observation: null };
  }

  const element =
    a.type === "SNAPSHOT" || a.type === "SCROLL" || a.type === "PRESS_KEY"
      ? a.target
        ? resolveActionElement(a.target)
        : null
      : resolveActionElement(a.target);

  if (
    ![
      "SNAPSHOT",
      "WAIT_FOR",
      "VERIFY",
      "EXTRACT",
      "SCROLL",
      "PRESS_KEY",
    ].includes(a.type) &&
    !element
  ) {
    throw Error(
      language === "en" ? "Target element not found" : "找不到目标元素",
    );
  }
  if (element) {
    await showVisualAction(element, a.type, a.reason);
  }

  let execution: Record<string, unknown> = { ok: true, action: a.type };
  switch (a.type) {
    case "CLICK":
      if (element) dispatchMouseSequence(element);
      break;
    case "FOCUS":
      element?.focus();
      break;
    case "TYPE":
    case "FILL":
      if (element) fillElement(element, String(a.arguments?.value || ""));
      break;
    case "CLEAR":
      if (element) {
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement
        ) {
          setNativeValue(element, "");
        } else if (element.isContentEditable) {
          element.textContent = "";
          element.dispatchEvent(
            new InputEvent("input", { bubbles: true, data: "" }),
          );
        }
      }
      break;
    case "SELECT":
      if (element) selectOption(element, a.arguments || {});
      break;
    case "CHECK":
      if (element) setChecked(element, true);
      break;
    case "UNCHECK":
      if (element) setChecked(element, false);
      break;
    case "HOVER":
      if (element) hoverElement(element);
      break;
    case "SCROLL":
      if (element)
        element.scrollIntoView({ block: "center", inline: "center" });
      else {
        window.scrollBy({
          left: Number(a.arguments?.deltaX || 0),
          top: Number(a.arguments?.deltaY || 0),
          behavior: "smooth",
        });
      }
      break;
    case "PRESS_KEY":
      pressKey(element, a.arguments || {});
      break;
    case "UPLOAD":
      if (element) uploadFiles(element, a.arguments?.files || []);
      break;
    case "SET_EDITOR":
      if (element)
        execution = setEditorElement(element, String(a.arguments?.code || ""));
      break;
    case "WAIT_FOR": {
      const verified = await waitForCondition(
        conditionWithTarget(a.arguments?.condition, a.target),
        a.arguments?.timeoutMs,
      );
      execution = { ok: verified, verified, action: a.type };
      break;
    }
    case "VERIFY": {
      const verified = evaluateCondition(
        conditionWithTarget(a.arguments?.condition, a.target),
      );
      execution = { ok: verified, verified, action: a.type };
      break;
    }
    case "EXTRACT": {
      const extracted = extractValue(
        element,
        String(a.arguments?.format || "text"),
      );
      execution = { ok: true, verified: true, action: a.type, extracted };
      break;
    }
    case "SNAPSHOT":
      execution = { ok: true, verified: true, action: a.type };
      break;
    default:
      break;
  }

  await new Promise((resolve) => window.setTimeout(resolve, 200));
  const postcondition = a.postcondition || {};
  const hasPostcondition = Object.keys(postcondition).length > 0;
  const verified =
    execution.ok !== false &&
    (!hasPostcondition ||
      (await waitForCondition(
        conditionWithTarget(postcondition, a.target),
        a.arguments?.timeoutMs || 5000,
        true,
      )));
  hideVisualAction();
  return {
    ...execution,
    verified,
    ok: execution.ok !== false && verified,
    observation: collectContext(),
  };
}

function conditionWithTarget(condition: any, target: ActionTarget | undefined) {
  if (!condition || typeof condition !== "object") return condition;
  const needsTarget =
    "valueEquals" in condition ||
    "checkedEquals" in condition ||
    "editorContains" in condition;
  if (!target || condition.target || !needsTarget) return condition;
  return { ...condition, target };
}

chrome.runtime.onMessage.addListener((msg: any, sender: any, send: any) => {
  if (Number.isInteger(sender?.frameId)) frameId = sender.frameId;
  if (msg?.type === "PING") {
    send({ ok: true, frameId });
    return true;
  }
  if (msg?.type === "REFRESH_PAGE_ENABLED") {
    refreshPageEnabled();
    send({ ok: true });
    return true;
  }
  if (msg?.type === "COLLECT_CONTEXT") {
    send(collectContext());
    return true;
  }
  if (msg?.type === "GET_ACTION_RECT") {
    const element = resolveActionElement(msg.target, true);
    send(element ? { ok: true, rect: actionRect(element) } : { ok: false });
    return true;
  }
  if (msg?.type === "REQUEST_ACTION_APPROVAL") {
    void requestActionApproval(msg.action).then((approved) =>
      send({ ok: true, approved }),
    );
    return true;
  }
  if (msg?.type === "CLEAR_EDITOR_TARGET") {
    document
      .querySelectorAll("[data-intra-copilot-editor-target]")
      .forEach((item) =>
        item.removeAttribute("data-intra-copilot-editor-target"),
      );
    send({ ok: true });
    return true;
  }
  if (msg?.type === "EXECUTE_ACTION") {
    const previousMode = interactionMode;
    if (
      msg.interactionMode === "FAST" ||
      msg.interactionMode === "VISIBLE_VIRTUAL" ||
      msg.interactionMode === "BROWSER_TRUSTED" ||
      msg.interactionMode === "SYSTEM_TRUSTED"
    ) {
      interactionMode = msg.interactionMode;
    }
    void executeBrowserAction(msg.action)
      .then(send)
      .catch((error) => {
        hideVisualAction();
        send({ ok: false, error: (error as Error).message || String(error) });
      })
      .finally(() => {
        interactionMode = previousMode;
      });
    return true;
  }
});
