ObjC.import("Foundation");

function run(argv) {
  const data = $.NSData.alloc.initWithBase64EncodedStringOptions(argv[0], 0);
  const text = $.NSString.alloc.initWithDataEncoding(
    data,
    $.NSUTF8StringEncoding,
  );
  const payload = JSON.parse(ObjC.unwrap(text));
  const app = Application("System Events");
  const rect = payload.rect;
  const x = Math.round(rect.screenX);
  const y = Math.round(rect.screenY);
  switch (payload.action) {
    case "CLICK":
    case "FOCUS":
    case "CHECK":
    case "UNCHECK":
      app.click({ at: [x, y] });
      return JSON.stringify({ ok: true });
    case "TYPE":
    case "FILL":
    case "SET_EDITOR": {
      app.click({ at: [x, y] });
      app.keystroke("a", { using: "command down" });
      app.keyCode(51);
      app.keystroke(
        String(payload.arguments.value || payload.arguments.code || ""),
      );
      return JSON.stringify({ ok: true });
    }
    case "PRESS_KEY":
      app.keystroke(String(payload.arguments.key || "return"));
      return JSON.stringify({ ok: true });
    case "SCROLL":
      app.keyCode(Number(payload.arguments.deltaY || 600) > 0 ? 125 : 126);
      return JSON.stringify({ ok: true });
    default:
      throw new Error(`Unsupported native action: ${payload.action}`);
  }
}
