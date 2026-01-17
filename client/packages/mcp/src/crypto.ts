import crypto from 'crypto';

export function hash(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export type KeyConfig = {
  keyId: number;
  value: string;
};

export function encrypt({
  key,
  aad,
  plaintext,
}: {
  key: KeyConfig;
  aad: string;
  plaintext: string;
}): string {
  const nonce = crypto.randomBytes(12);

  const aadBytes = Buffer.from(aad, 'utf-8');

  const cipher = crypto.createCipheriv('aes-192-ccm', key.value, nonce, {
    authTagLength: 16,
  });

  cipher.setAAD(aadBytes, {
    plaintextLength: Buffer.byteLength(plaintext),
  });
  const ciphertext = cipher.update(plaintext, 'utf8');
  cipher.final();
  const tag = cipher.getAuthTag();

  return `${key.keyId}:${ciphertext.toString('hex')}:${nonce.toString('hex')}:${tag.toString('hex')}`;
}

export function decrypt({
  enc,
  aad,
  key,
}: {
  enc: string;
  aad: string;
  key: KeyConfig;
}): string {
  const [keyId, ciphertextString, nonceString, tagString] = enc.split(':');
  if (key.keyId !== Number.parseInt(keyId)) {
    // In future, we should support multiple keys for key rotation
    throw new Error('Invalid key');
  }
  const ciphertext = Buffer.from(ciphertextString, 'hex');
  const nonce = Buffer.from(nonceString, 'hex');
  const tag = Buffer.from(tagString, 'hex');
  const aadBytes = Buffer.from(aad, 'utf-8');
  const decipher = crypto.createDecipheriv('aes-192-ccm', key.value, nonce, {
    authTagLength: 16,
  });
  decipher.setAuthTag(tag);
  decipher.setAAD(aadBytes, {
    plaintextLength: ciphertext.length,
  });
  const plaintext = decipher.update(ciphertext, undefined, 'utf8');

  try {
    decipher.final();
    return plaintext;
  } catch (err) {
    throw new Error('Authentication failed!', { cause: err });
  }
}
