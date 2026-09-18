type Ctx = {
  url: string;
  title: string;
  selection: string;
  visibleText: string;
  domSummary: string;
  timestamp: string;
};
type ActionElement = {
  ref: string;
  element: HTMLElement;
  summary: string;
};
type Language = "zh" | "en";
const root = document.createElement("div");
root.id = "intra-copilot-root";
root.style.display = "none";
const shadow = root.attachShadow({ mode: "open" });
document.documentElement.appendChild(root);
shadow.innerHTML = `<style>.ball{position:fixed;right:22px;bottom:80px;width:52px;height:52px;border-radius:50%;background:#2563eb;color:#fff;z-index:2147483647;display:grid;place-items:center;font:700 18px sans-serif;box-shadow:0 5px 16px #0004;cursor:grab;user-select:none}.ball.edge{width:26px;height:68px;right:0;border-radius:24px 0 0 24px;font-size:12px}.ball-button{position:absolute;width:20px;height:20px;padding:0;border:1px solid #fff;border-radius:50%;background:#111;color:#fff;box-shadow:0 2px 6px #0004;cursor:pointer;font:600 13px/18px sans-serif;place-items:center}.mini{top:-11px;right:-11px;display:grid}.dismiss{top:-11px;left:-11px;display:grid}.dismiss:hover{background:#dc2626}</style><div class="ball" title="打开 Intra Copilot">✦<button class="ball-button mini" title="收缩">−</button><button class="ball-button dismiss" title="关闭悬浮球" aria-label="关闭悬浮球">×</button></div>`;
const ball = shadow.querySelector(".ball") as HTMLElement;
const mini = shadow.querySelector(".mini") as HTMLButtonElement;
const dismiss = shadow.querySelector(".dismiss") as HTMLButtonElement;
let language: Language = "zh";
let pageEnabled = false;
const actionElements = new Map<string, HTMLElement>();
function setPageEnabled(enabled: boolean) {
  pageEnabled = enabled;
  root.style.display = enabled ? "block" : "none";
}

function refreshPageEnabled() {
  chrome.runtime.sendMessage({ type: "CONTENT_READY" }, (response) => {
    if (chrome.runtime.lastError) return;
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
  ["ballPos", "ballAnchor", "ballEdge", "language"],
  (value: any) => {
    if (value.language === "en" || value.language === "zh") {
      updateBallLanguage(value.language);
    }
    if (value.ballEdge) ball.classList.add("edge");
    restoreBallPosition(value);
  },
);
refreshPageEnabled();
chrome.storage.onChanged.addListener((changes) => {
  const next = changes.language?.newValue;
  if (next === "en" || next === "zh") updateBallLanguage(next);
  if (changes.activationMode || changes.enabledTabIds) refreshPageEnabled();
});
window.addEventListener("resize", clampBall);
window.visualViewport?.addEventListener("resize", clampBall);
new MutationObserver(() => {
  if (!document.documentElement.contains(root)) {
    document.documentElement.appendChild(root);
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
    visibleText: (document.body?.innerText || "").slice(0, 12000),
    domSummary: elements.map((item) => item.summary).join("\n"),
    timestamp: new Date().toISOString(),
  };
}

function collectActionElements(): ActionElement[] {
  actionElements.clear();
  return Array.from(
    document.querySelectorAll(
      "input,button,select,textarea,a,[role='button'],[contenteditable='true']",
    ),
  )
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .filter(isVisible)
    .slice(0, 120)
    .map((element, index) => {
      const ref = `ref_${index + 1}`;
      actionElements.set(ref, element);
      const tag = element.tagName.toLowerCase();
      const role =
        element.getAttribute("role") ||
        (tag === "a" ? "link" : tag === "button" ? "button" : tag);
      const name = compact(
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
        "disabled" in element &&
        Boolean((element as HTMLInputElement).disabled);
      const value = compact((element as HTMLInputElement).value || "");
      const details = [
        `${ref} <${tag}>`,
        `role="${role}"`,
        name ? `name="${escapeAttribute(name)}"` : "",
        type ? `type="${type}"` : "",
        value ? `value="${escapeAttribute(value)}"` : "",
        disabled ? "disabled=true" : "",
      ]
        .filter(Boolean)
        .join(" ");
      return { ref, element, summary: details };
    });
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

function escapeAttribute(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function resolveActionElement(target: string): HTMLElement | null {
  const registered = actionElements.get(target);
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
  const input = editor.querySelector(
    "textarea.inputarea, textarea, [contenteditable='true']",
  ) as HTMLElement | null;
  const target: HTMLElement = input || (editor as HTMLElement);
  target.focus();
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
    return;
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
    return;
  }
  throw Error(language === "en" ? "Code editor not found" : "未找到代码编辑器");
}

async function executeBrowserAction(a: any) {
  if (!["CLICK", "FILL", "NAVIGATE", "SET_EDITOR"].includes(a.type)) {
    throw Error(language === "en" ? "Unsupported action" : "不支持的操作");
  }
  if (a.type === "NAVIGATE") {
    location.href = a.arguments?.url;
    return { ok: true, action: a.type, observation: null };
  }
  const element = resolveActionElement(a.target || "");
  if (!element) {
    throw Error(
      language === "en" ? "Target element not found" : "找不到目标元素",
    );
  }
  if (a.type === "CLICK") {
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
  } else if (a.type === "FILL") {
    fillElement(element, a.arguments?.value || "");
  } else {
    setEditorElement(element, a.arguments?.code || "");
  }
  await new Promise((resolve) => window.setTimeout(resolve, 300));
  return { ok: true, action: a.type, observation: collectContext() };
}

chrome.runtime.onMessage.addListener((msg: any, _sender: any, send: any) => {
  if (msg?.type === "REFRESH_PAGE_ENABLED") {
    refreshPageEnabled();
    send({ ok: true });
    return true;
  }
  if (msg?.type === "COLLECT_CONTEXT") {
    send(collectContext());
    return true;
  }
  if (msg?.type === "EXECUTE_ACTION") {
    void executeBrowserAction(msg.action)
      .then(send)
      .catch((error) =>
        send({ ok: false, error: (error as Error).message || String(error) }),
      );
    return true;
  }
});
