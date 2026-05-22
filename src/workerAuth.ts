const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

export type GoogleAuthUrlInput = {
  clientId: string;
  redirectUri: string;
  state: string;
};

export type EncryptedRefreshToken = {
  ciphertext: string;
  iv: string;
};

export function buildGoogleAuthUrl(input: GoogleAuthUrlInput): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", ["openid", "email", CALENDAR_SCOPE].join(" "));
  return url.toString();
}

export async function encryptRefreshToken(refreshToken: string, secret: string): Promise<EncryptedRefreshToken> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(secret);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, TEXT_ENCODER.encode(refreshToken));

  return {
    ciphertext: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv)
  };
}

export async function decryptRefreshToken(encrypted: EncryptedRefreshToken, secret: string): Promise<string> {
  const key = await importAesKey(secret);
  const iv = fromBase64(encrypted.iv);
  const ciphertext = fromBase64(encrypted.ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(ciphertext)
  );

  return TEXT_DECODER.decode(decrypted);
}

async function importAesKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest("SHA-256", TEXT_ENCODER.encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
