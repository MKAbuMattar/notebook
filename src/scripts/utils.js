// --- Utility Functions ---

export function debounce(ms, fn) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export async function processImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Max dimension for sharing optimization (URL length vs quality)
        const MAX_DIM = 800;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height *= MAX_DIM / width;
            width = MAX_DIM;
          } else {
            width *= MAX_DIM / height;
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Compress as JPEG to keep payload small for sharing
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function compress(string) {
  const byteArray = new TextEncoder().encode(string);
  const stream = new CompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  writer.write(byteArray);
  writer.close();
  const buffer = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buffer)
    .toBase64()
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export async function decompress(b64) {
  const byteArray = Uint8Array.fromBase64(
    b64.replace(/-/g, '+').replace(/_/g, '/'),
  );
  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  writer.write(byteArray);
  writer.close();
  const buffer = await new Response(stream.readable).arrayBuffer();
  return new TextDecoder().decode(buffer);
}

// --- Polyfills / Prototypes ---
export function setupPolyfills() {
  if (!Uint8Array.prototype.toBase64) {
    Uint8Array.prototype.toBase64 = function () {
      let binary = '';
      const len = this.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(this[i]);
      }
      return window.btoa(binary);
    };
  }
  if (!Uint8Array.fromBase64) {
    Uint8Array.fromBase64 = function (base64) {
      const binary_string = window.atob(base64);
      const len = binary_string.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
      }
      return bytes;
    };
  }
}

// --- Text Insertion ---
let lastSelection = null;

// Initialize selection tracking
export function initSelectionTracking() {
  document.addEventListener('selectionchange', () => {
    if (!window.article) return;
    const sel = window.getSelection();
    if (
      sel.rangeCount > 0 &&
      window.article.contains(sel.getRangeAt(0).commonAncestorContainer)
    ) {
      lastSelection = sel.getRangeAt(0).cloneRange();
    }
  });
}

export function insertTextAtCursor(text) {
  if (!window.article) return;

  // Ensure we are in edit mode
  if (window.article.contentEditable === 'false') {
    window.article.click(); // Trigger edit mode
  }

  window.article.focus();
  const sel = window.getSelection();
  let range;

  if (
    sel.rangeCount > 0 &&
    window.article.contains(sel.getRangeAt(0).commonAncestorContainer)
  ) {
    range = sel.getRangeAt(0);
  } else if (
    lastSelection &&
    window.article.contains(lastSelection.commonAncestorContainer)
  ) {
    range = lastSelection;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  if (range) {
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);

    // Move cursor to end of inserted text
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    sel.removeAllRanges();
    sel.addRange(range);
    lastSelection = range.cloneRange();
  } else {
    // Fallback: append to end
    const textNode = document.createTextNode(text);
    window.article.appendChild(textNode);

    // Move cursor to end
    const newRange = document.createRange();
    newRange.selectNodeContents(window.article);
    newRange.collapse(false);
    sel.removeAllRanges();
    sel.addRange(newRange);
    lastSelection = newRange.cloneRange();
  }
}
