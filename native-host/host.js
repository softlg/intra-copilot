#!/usr/bin/env node

const { spawn } = require("node:child_process");
const path = require("node:path");
const os = require("node:os");

const MAX_MESSAGE_BYTES = 1024 * 1024;

function readMessage() {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 4) return;
      const length = buffer.readUInt32LE(0);
      if (length > MAX_MESSAGE_BYTES) {
        cleanup();
        reject(new Error("message too large"));
        return;
      }
      if (buffer.length < 4 + length) return;
      const payload = buffer.subarray(4, 4 + length).toString("utf8");
      cleanup();
      try {
        resolve(JSON.parse(payload));
      } catch (error) {
        reject(error);
      }
    };
    const onEnd = () => {
      cleanup();
      resolve(null);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.off("end", onEnd);
      process.stdin.off("error", onError);
    };
    process.stdin.on("data", onData);
    process.stdin.on("end", onEnd);
    process.stdin.on("error", onError);
  });
}

function writeMessage(value) {
  const payload = Buffer.from(JSON.stringify(value), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  process.stdout.write(Buffer.concat([header, payload]));
}

function run(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `${command} exited with ${code}`));
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function execute(message) {
  if (!message || message.version !== 1) {
    throw new Error("unsupported native protocol version");
  }
  const payload = Buffer.from(JSON.stringify(message), "utf8").toString(
    "base64",
  );
  if (process.platform === "win32") {
    await run("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(__dirname, "windows", "send-input.ps1"),
      "-PayloadBase64",
      payload,
    ]);
    return { ok: true, platform: "win32" };
  }
  if (process.platform === "darwin") {
    await run("osascript", [
      "-l",
      "JavaScript",
      path.join(__dirname, "macos", "send-input.js"),
      payload,
    ]);
    return { ok: true, platform: "darwin" };
  }
  throw new Error(`unsupported platform: ${os.platform()}`);
}

(async () => {
  for (;;) {
    const message = await readMessage();
    if (message == null) return;
    try {
      writeMessage(await execute(message));
    } catch (error) {
      writeMessage({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
