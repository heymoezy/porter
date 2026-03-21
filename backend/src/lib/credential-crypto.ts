import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;

function getDerivedKey(): Buffer {
  const secret = process.env.PORTER_SECRET;
  if (!secret) {
    throw new Error(
      'PORTER_SECRET env var is required for credential encryption — generate with: openssl rand -hex 32'
    );
  }
  return crypto.scryptSync(secret, 'porter-connections-salt', KEY_LEN) as Buffer;
}

export function encryptCredential(plaintext: string): string {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptCredential(encoded: string): string {
  const key = getDerivedKey();
  const parts = encoded.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted credential format');
  }
  const [ivHex, tagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}

export function validatePorterSecret(): boolean {
  const secret = process.env.PORTER_SECRET;
  return typeof secret === 'string' && secret.length > 0;
}
