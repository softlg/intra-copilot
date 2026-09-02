type Ctx = {
  url: string;
  title: string;
  selection: string;
  visibleText: string;
  domSummary: string;
  timestamp: string;
};
const root = document.createElement("div");
root.id = "intra-copilot-root";
const shadow = root.attachShadow({ mode: "open" });
document.documentElement.appendChild(root);
shadow.innerHTML = `<style>.ball{position:fixed;right:22px;bottom:80px;width:52px;height:52px;border-radius:50%;background:#2563eb;color:#fff;z-index:2147483647;display:grid;place-items:center;font:700 18px sans-serif;box-shadow:0 5px 16px #0004;cursor:grab;user-select:none}.ball.edge{width:26px;height:68px;right:0;border-radius:24px 0 0 24px;font-size:12px}.mini{position:absolute;right:2px;top:-18px;background:#111;color:#fff;border:0;border-radius:8px;font-size:11px}</style><div class="ball" title="打开 Intra Copilot">✦<button class="mini" title="收缩">−</button></div>`;
const ball = shadow.querySelector(".ball") as HTMLElement;
const mini = shadow.querySelector(".mini") as HTMLButtonElement;
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
  ["ballPos", "ballAnchor", "ballEdge"],
  (value: any) => {
    if (value.ballEdge) ball.classList.add("edge");
    restoreBallPosition(value);
  },
);
window.addEventListener("resize", clampBall);
window.visualViewport?.addEventListener("resize", clampBall);
new MutationObserver(() => {
  if (!document.documentElement.contains(root)) {
    document.documentElement.appendChild(root);
  }
}).observe(document.documentElement, { childList: true, subtree: true });
ball.addEventListener("pointerdown", (e) => {
  if ((e.target as HTMLElement).classList.contains("mini")) return;
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
export function collectContext(): Ctx {
  return {
    url: location.href,
    title: document.title,
    selection: getSelection()?.toString().slice(0, 4000) || "",
    visibleText: (document.body?.innerText || "").slice(0, 12000),
    domSummary: Array.from(
      document.querySelectorAll("input,button,select,textarea,a"),
    )
      .slice(0, 80)
      .map(
        (e: any) =>
          `${e.tagName}:${e.innerText || e.placeholder || e.name || ""}`,
      )
      .join("\n"),
    timestamp: new Date().toISOString(),
  };
}
chrome.runtime.onMessage.addListener((msg: any, _sender: any, send: any) => {
  if (msg?.type === "COLLECT_CONTEXT") {
    send(collectContext());
    return true;
  }
  if (msg?.type === "EXECUTE_ACTION") {
    try {
      const a = msg.action;
      if (!["CLICK", "FILL", "NAVIGATE"].includes(a.type))
        throw Error("不支持的操作");
      if (a.type === "NAVIGATE") {
        location.href = a.arguments?.url;
      } else {
        const el = document.querySelector(a.target) as HTMLElement | null;
        if (!el) throw Error("找不到目标元素");
        if (a.type === "CLICK") el.click();
        else {
          const input = el as HTMLInputElement;
          input.focus();
          input.value = a.arguments?.value || "";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
      send({ ok: true });
    } catch (e) {
      send({ ok: false, error: (e as Error).message });
    }
    return true;
  }
});
