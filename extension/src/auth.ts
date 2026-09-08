// 设备身份与会话 JWT 颁发/签名模块。
//
// 设计：插件自己生成 RSA 密钥对，私钥仅存 chrome.storage.local，
// 公钥通过 /auth/devices/register 上报后端。之后每次请求用私钥签 JWT，
// 后端用已注册的公钥验签，解析出 source + userId 用于数据隔离。

const DEVICE_ID_KEY = "auth.deviceId";
const KEY_PAIR_KEY = "auth.keyPair";
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

// 导出供调试使用
export const SOURCE_NAME = SOURCE;

/** 读取当前 deviceId，若不存在则生成。 */
export async function getOrCreateDeviceId(): Promise<string> {
  const stored = await chrome.storage.local.get(DEVICE_ID_KEY);
  if (typeof stored[DEVICE_ID_KEY] === "string" && stored[DEVICE_ID_KEY]) {
    return stored[DEVICE_ID_KEY];
  }
  const deviceId = crypto.randomUUID();
  await chrome.storage.local.set({ [DEVICE_ID_KEY]: deviceId });
  return deviceId;
}

/** 读取或生成 RSA 密钥对（PKCS8 存储在 chrome.storage.local）。 */
interface StoredKey {
  publicKey: JsonWebKey;
  privateKey: string; // base64
}

async function getOrCreateKeyPair(): Promise<CryptoKeyPair> {
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
  deviceId: string,
  publicKey: CryptoKey,
): Promise<{ userId: string }> {
  const jwk = await crypto.subtle.exportKey("jwk", publicKey);
  const response = await fetch(`${apiBase}/api/v1/auth/devices/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId,
      publicKeyJwk: jwk,
      source: SOURCE,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Device register failed: ${response.status} ${await response
        .text()
        .catch(() => "")}`,
    );
  }
  const data = (await response.json()) as { userId: string };
  return { userId: data.userId };
}

/**
 * 启动鉴权：确保 deviceId/密钥对已生成 + 已注册。
 * 返回 authedFetch 用于后续所有受保护请求。
 */
export async function bootstrapAuth(apiBase: string): Promise<AuthBootstrap> {
  const deviceId = await getOrCreateDeviceId();
  const keyPair = await getOrCreateKeyPair();
  try {
    await registerDevice(apiBase, deviceId, keyPair.publicKey);
  } catch (error) {
    // 公钥可能丢失或被禁用，重置本地密钥对后重试一次
    console.warn("auth: device register failed, resetting keys", error);
    await chrome.storage.local.remove(KEY_PAIR_KEY);
    const fresh = await getOrCreateKeyPair();
    await registerDevice(apiBase, deviceId, fresh.publicKey);
    return {
      deviceId,
      authedFetch: makeAuthedFetch(apiBase, fresh.privateKey, deviceId, () =>
        registerDevice(apiBase, deviceId, fresh.publicKey),
      ),
    };
  }
  return {
    deviceId,
    authedFetch: makeAuthedFetch(apiBase, keyPair.privateKey, deviceId, () =>
      registerDevice(apiBase, deviceId, keyPair.publicKey),
    ),
  };
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
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    let response = await fetch(`${apiBase}${path}`, { ...init, headers });
    if (response.status === 401) {
      // 后端认为设备未注册/被禁用，重注册一次后重试一次
      try {
        await onAuthFailed();
        const retryToken = await signJwt(privateKey, deviceId);
        const retryHeaders = new Headers(init.headers);
        retryHeaders.set("Authorization", `Bearer ${retryToken}`);
        if (init.body && !retryHeaders.has("Content-Type")) {
          retryHeaders.set("Content-Type", "application/json");
        }
        response = await fetch(`${apiBase}${path}`, {
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
