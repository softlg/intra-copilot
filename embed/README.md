# Intra Copilot Embedded SDK

The embedded runtime lets a host system attach the same browser agent used by the extension
without requiring a browser extension.

```ts
import { attach } from "@intra-copilot/embed";

const agent = attach({
  baseUrl: "http://127.0.0.1:8080",
  token: deviceToken,
  interactionMode: "VISIBLE_VIRTUAL",
  permissionMode: "delegate",
  onToken: (text) => appendText(text),
});

const answer = await agent.send({
  message: "填写当前表单并提交",
});
```

The SDK owns the host-page runtime and polls the durable `EMBEDDED` task queue:

- Captures a structured page snapshot.
- Executes allowlisted actions returned by the backend.
- Shows a virtual cursor, focus highlight and status text.
- Claims task leases and commands through `/api/v1/browser/runtimes`.
- Reports verified action results and page observations back to the backend.

The SDK advertises `FAST` and `VISIBLE_VIRTUAL` modes. Browser-trusted and system-trusted input stay
extension-only because a host page cannot send trusted Chrome or operating-system input events.

Build with:

```powershell
npm install
npm run build
```
