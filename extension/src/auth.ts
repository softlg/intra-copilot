// 设备身份与会话 JWT 颁发/签名模块。
//
// 设计：插件自己生成 RSA 密钥对，私钥仅存 chrome.storage.local，
// 公钥通过 /auth/devices/register 上报后端。之后每次请求用私钥签 JWT，
// 后端用已注册的公钥验签，解析出 source + userId 用于数据隔离。

const DEVICE_ID_KEY = "auth.deviceId";
const KEY_PAIR_KEY = "auth.keyPair";
const KEY_PAIR_LOCK_KEY = "auth.keyPair.lock";
const AUTH_BOOTSTRAP_LOCK_KEY = "auth.bootstrap.lock";
const SOURCE = "extension";
const TOKEN_TTL_SECONDS = 60 * 55; // 55 分钟：留 5 分钟提前续签余地

export type AuthedFetch = (
  path: string,
  init?: RequestInit,
) => Promise<Response>;

export interface AuthBootstrap {
  authedFetch: AuthedFetch;
  deviceId: string;
}

export function apiOriginPattern(apiBase: string): string {
  return `${new URL(apiBase).origin}/*`;
}

export async function hasApiHostPermission(apiBase: string): Promise<boolean> {
  return chrome.permissions.contains({ origins: [apiOriginPattern(apiBase)] });
}

// 导出供调试使用
export const SOURCE_NAME = SOURCE;

/** 读取或生成 RSA 密钥对（PKCS8 存储在 chrome.storage.local）。 */
interface StoredKey {
  publicKey: JsonWebKey;
  privateKey: string; // base64
}

async function getOrCreateKeyPair(): Promise<CryptoKeyPair> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const existing = await readStoredKeyPair();
    if (existing) return existing;
    const lock = (await chrome.storage.local.get(KEY_PAIR_LOCK_KEY))[
      KEY_PAIR_LOCK_KEY
    ] as { owner?: unknown; expiresAt?: unknown } | undefined;
    const now = Date.now();
    if (!lock || typeof lock.expiresAt !== "number" || lock.expiresAt < now) {
      const owner = crypto.randomUUID();
      await chrome.storage.local.set({
        [KEY_PAIR_LOCK_KEY]: { owner, expiresAt: now + 10_000 },
      });
      const confirmed = (await chrome.storage.local.get(KEY_PAIR_LOCK_KEY))[
        KEY_PAIR_LOCK_KEY
      ] as { owner?: unknown } | undefined;
      if (confirmed?.owner !== owner) {
        await delay(100);
        continue;
      }
      try {
        const raced = await readStoredKeyPair();
        if (raced) return raced;
        const keyPair = await generateAndStoreKeyPair();
        return keyPair;
      } finally {
        const current = (await chrome.storage.local.get(KEY_PAIR_LOCK_KEY))[
          KEY_PAIR_LOCK_KEY
        ] as { owner?: unknown } | undefined;
        if (current?.owner === owner) {
          await chrome.storage.local.remove(KEY_PAIR_LOCK_KEY);
        }
      }
    }
    await delay(100);
  }
  throw new Error("Timed out while initializing the device key pair");
}

async function readStoredKeyPair(): Promise<CryptoKeyPair | null> {
  const stored = (await chrome.storage.local.get(KEY_PAIR_KEY)) as Record<
    string,
    StoredKey | undefined
  >;
  if (stored[KEY_PAIR_KEY]) {
    return {
      privateKey: await crypto.subtle.importKey(
        "pkcs8",
        base64ToArrayBuffer(stored[KEY_PAIR_KEY].privateKey),
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        true,
        ["sign"],
      ),
      publicKey: await crypto.subtle.importKey(
        "jwk",
        stored[KEY_PAIR_KEY].publicKey,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        true,
        ["verify"],
      ),
    };
  }
  return null;
}

async function generateAndStoreKeyPair(): Promise<CryptoKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyPkcs8 = await crypto.subtle.exportKey(
    "pkcs8",
    keyPair.privateKey,
  );
  await chrome.storage.local.set({
    [KEY_PAIR_KEY]: {
      publicKey: publicKeyJwk,
      privateKey: arrayBufferToBase64(privateKeyPkcs8),
    },
  });
  return keyPair;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** 用私钥对 payload 签 RS256，输出 base64url JWT。 */
async function signJwt(
  privateKey: CryptoKey,
  deviceId: string,
): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "intra-copilot-extension",
    sub: deviceId,
    source: SOURCE,
    scope: "chat:read chat:write",
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
    jti: crypto.randomUUID(),
  };
  const headerB64 = base64urlEncode(
    new TextEncoder().encode(JSON.stringify(header)),
  );
  const payloadB64 = base64urlEncode(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  const sigB64 = base64urlEncode(new Uint8Array(signature));
  return `${signingInput}.${sigB64}`;
}

/** 上报公钥到后端。重复调用幂等。 */
async function registerDevice(
  apiBase: string,
  requestedDeviceId: string | undefined,
  publicKey: CryptoKey,
  privateKey: CryptoKey,
): Promise<{ deviceId: string; userId: string }> {
  const jwk = await crypto.subtle.exportKey("jwk", publicKey);
  const challengeResponse = await fetch(
    `${apiBase}/api/v1/auth/devices/challenge`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: requestedDeviceId,
        publicKeyJwk: jwk,
        source: SOURCE,
      }),
    },
  );
  if (!challengeResponse.ok) {
    throw new Error(
      `Device challenge failed: ${challengeResponse.status} ${await challengeResponse
        .text()
        .catch(() => "")}`,
    );
  }
  const challenge = (await challengeResponse.json()) as {
    deviceId: string;
    challengeId: string;
    nonce: string;
  };
  const canonical = [
    "intra-copilot-device-registration",
    challenge.challengeId,
    challenge.nonce,
    SOURCE,
    challenge.deviceId,
  ].join("\n");
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(canonical),
  );
  const response = await fetch(`${apiBase}/api/v1/auth/devices/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId: challenge.deviceId,
      publicKeyJwk: jwk,
      source: SOURCE,
      challengeId: challenge.challengeId,
      signature: base64urlEncode(new Uint8Array(signature)),
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Device register failed: ${response.status} ${await response
        .text()
        .catch(() => "")}`,
    );
  }
  const data = (await response.json()) as { deviceId: string; userId: string };
  return { deviceId: data.deviceId, userId: data.userId };
}

/**
 * 启动鉴权：确保 deviceId/密钥对已生成 + 已注册。
 * 返回 authedFetch 用于后续所有受保护请求。
 */
export async function bootstrapAuth(apiBase: string): Promise<AuthBootstrap> {
  if (!(await hasApiHostPermission(apiBase))) {
    throw new Error(`缺少后端访问权限：${new URL(apiBase).origin}`);
  }
  let deviceId = await storedDeviceId();
  const keyPair = await getOrCreateKeyPair();
  if (!deviceId) {
    for (let attempt = 0; attempt < 100 && !deviceId; attempt++) {
      const lock = (await chrome.storage.local.get(AUTH_BOOTSTRAP_LOCK_KEY))[
        AUTH_BOOTSTRAP_LOCK_KEY
      ] as { owner?: unknown; expiresAt?: unknown } | undefined;
      const now = Date.now();
      if (!lock || typeof lock.expiresAt !== "number" || lock.expiresAt < now) {
        const owner = crypto.randomUUID();
        await chrome.storage.local.set({
          [AUTH_BOOTSTRAP_LOCK_KEY]: { owner, expiresAt: now + 20_000 },
        });
        const confirmed = (
          await chrome.storage.local.get(AUTH_BOOTSTRAP_LOCK_KEY)
        )[AUTH_BOOTSTRAP_LOCK_KEY] as { owner?: unknown } | undefined;
        if (confirmed?.owner !== owner) {
          await delay(100);
          continue;
        }
        try {
          deviceId = await storedDeviceId();
          if (!deviceId) {
            const registered = await registerDevice(
              apiBase,
              undefined,
              keyPair.publicKey,
              keyPair.privateKey,
            );
            deviceId = registered.deviceId;
            await chrome.storage.local.set({ [DEVICE_ID_KEY]: deviceId });
          }
        } finally {
          const current = (
            await chrome.storage.local.get(AUTH_BOOTSTRAP_LOCK_KEY)
          )[AUTH_BOOTSTRAP_LOCK_KEY] as { owner?: unknown } | undefined;
          if (current?.owner === owner) {
            await chrome.storage.local.remove(AUTH_BOOTSTRAP_LOCK_KEY);
          }
        }
        break;
      }
      await delay(100);
      deviceId = await storedDeviceId();
    }
  }
  if (!deviceId) throw new Error("Timed out while registering the device");
  return {
    deviceId,
    authedFetch: makeAuthedFetch(apiBase, keyPair.privateKey, deviceId, () =>
      registerDevice(apiBase, deviceId, keyPair.publicKey, keyPair.privateKey),
    ),
  };
}

async function storedDeviceId(): Promise<string | undefined> {
  const stored = await chrome.storage.local.get(DEVICE_ID_KEY);
  const value = stored[DEVICE_ID_KEY];
  return typeof value === "string" && !value.startsWith("pending-")
    ? value
    : undefined;
}

function makeAuthedFetch(
  apiBase: string,
  privateKey: CryptoKey,
  deviceId: string,
  onAuthFailed: () => Promise<unknown>,
): AuthedFetch {
  return async (path: string, init: RequestInit = {}) => {
    const token = await signJwt(privateKey, deviceId);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (
      init.body &&
      !headers.has("Content-Type") &&
      !(init.body instanceof FormData)
    ) {
      headers.set("Content-Type", "application/json");
    }
    let response = await fetch(`${apiBase}/api/v1${path}`, {
      ...init,
      headers,
    });
    if (response.status === 401) {
      // 后端认为设备未注册/被禁用，重注册一次后重试一次
      try {
        await onAuthFailed();
        const retryToken = await signJwt(privateKey, deviceId);
        const retryHeaders = new Headers(init.headers);
        retryHeaders.set("Authorization", `Bearer ${retryToken}`);
        if (
          init.body &&
          !retryHeaders.has("Content-Type") &&
          !(init.body instanceof FormData)
        ) {
          retryHeaders.set("Content-Type", "application/json");
        }
        response = await fetch(`${apiBase}/api/v1${path}`, {
          ...init,
          headers: retryHeaders,
        });
      } catch (error) {
        console.error("auth: re-register failed", error);
      }
    }
    return response;
  };
}

// --- 工具函数 ---

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
