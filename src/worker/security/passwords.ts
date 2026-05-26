const ITERATIONS = 210_000;
const KEY_LENGTH = 32;
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 600_000;

function bytesToBase64(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(String.fromCharCode(...view));
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits"
  ]);
  const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations }, key, KEY_LENGTH * 8);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return "v1$pbkdf2_sha256$" + ITERATIONS + "$" + bytesToBase64(salt) + "$" + bytesToBase64(hash);
}

export async function verifyPassword(password: string, stored: string) {
  const fields = stored.split("$");
  if (fields.length !== 5) return false;

  const [version, scheme, iterationText, saltText, hashText] = fields;
  const iterations = Number(iterationText);
  if (
    version !== "v1" ||
    scheme !== "pbkdf2_sha256" ||
    !Number.isSafeInteger(iterations) ||
    iterations < MIN_ITERATIONS ||
    iterations > MAX_ITERATIONS ||
    !saltText ||
    !hashText
  ) {
    return false;
  }

  try {
    const expected = base64ToBytes(hashText);
    const actual = new Uint8Array(await pbkdf2(password, base64ToBytes(saltText), iterations));
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}
