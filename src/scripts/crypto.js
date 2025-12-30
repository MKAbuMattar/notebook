export const CryptoUtils = {
  async deriveKey(password, salt) {
    const encoder = new TextEncoder();
    const baseKey = await window.crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveKey'],
    );

    let saltBytes;
    if (typeof salt === 'string') {
      saltBytes = Uint8Array.fromBase64(
        salt.replace(/-/g, '+').replace(/_/g, '/'),
      );
    } else {
      saltBytes = salt;
    }

    return window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: 100000,
        hash: 'SHA-256',
      },
      baseKey,
      {name: 'AES-GCM', length: 256},
      true,
      ['encrypt', 'decrypt'],
    );
  },

  async encrypt(text, password) {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(password, salt);
    return this.encryptWithKey(text, key, salt, iv);
  },

  async encryptWithKey(text, key, salt, iv) {
    const encoder = new TextEncoder();
    const encrypted = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv:
          typeof iv === 'string'
            ? Uint8Array.fromBase64(iv.replace(/-/g, '+').replace(/_/g, '/'))
            : iv,
      },
      key,
      encoder.encode(text),
    );

    const saltB64 =
      typeof salt === 'string'
        ? salt
        : new Uint8Array(salt)
            .toBase64()
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
    const ivB64 =
      typeof iv === 'string'
        ? iv
        : new Uint8Array(iv).toBase64().replace(/\+/g, '-').replace(/\//g, '_');

    return {
      encryptedData: new Uint8Array(encrypted)
        .toBase64()
        .replace(/\+/g, '-')
        .replace(/\//g, '_'),
      salt: saltB64,
      iv: ivB64,
    };
  },

  async decrypt(encryptedB64, password, saltB64, ivB64) {
    const key = await this.deriveKey(password, saltB64);
    return this.decryptWithKey(encryptedB64, key, ivB64);
  },

  async decryptWithKey(encryptedB64, key, ivB64) {
    try {
      const encrypted = Uint8Array.fromBase64(
        encryptedB64.replace(/-/g, '+').replace(/_/g, '/'),
      );
      const iv = Uint8Array.fromBase64(
        ivB64.replace(/-/g, '+').replace(/_/g, '/'),
      );
      const decrypted = await window.crypto.subtle.decrypt(
        {name: 'AES-GCM', iv},
        key,
        encrypted,
      );
      return new TextDecoder().decode(decrypted);
    } catch (e) {
      throw new Error('Decryption failed');
    }
  },
};
