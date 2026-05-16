import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function deriveKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.trim() === "") {
    throw new Error("Missing ENCRYPTION_KEY environment variable");
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

/** Returns `ivHex:tagHex:cipherHex` (hex segments) for storage in Postgres. */
export function encryptSecret(plainText: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/** Decrypt payload produced by `encryptSecret` (for future use). */
export function decryptSecret(payload: string): string {
  const key = deriveKey();
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Invalid encrypted payload format");
  }
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(dataHex, "hex");
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
