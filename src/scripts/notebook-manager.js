import {CryptoUtils} from './crypto.js';
import {decompress, compress, debounce} from './utils.js';

export const ICONS = {
  PIN: (size = 14, fill = 'none') =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>`,
  RENAME: (size = 14) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`,
  DELETE: (size = 14) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`,
  CHECK: (size = 18) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
};

export class NotebookManager {
  constructor(config) {
    this.config = config;
    this.notebooks = JSON.parse(localStorage.getItem('notebooks') || '[]');
    this.activeId = localStorage.getItem('activeNotebookId');
    this.mode = config.mode;
    this.pendingId = null; // For rename/delete state
    this.paperTheme = 'classic'; // Active theme (not persisted globally)
    this.direction = 'ltr'; // Current active direction
    this.sessionKeys = new Map(); // Store CryptoKeys in memory for currently unlocked notes

    this.init();
  }

  async init() {
    this.migrateOldData();
    await this.handleUrlParam();
    this.ensureActiveNote();
    await this.loadActiveNote();
    this.searchQuery = '';
    this.activeTag = null;
    this.libraryMode = this.mode; // Default library view to current mode
    this.setupAutoSave();
    this.setupLibraryListeners();
    this.setupActionModalListeners();
    this.setupGalleryListeners();
    this.setupEncryptionListeners();
    this.updateStats();
    this.rebuildSearchIndex();
  }

  async rebuildSearchIndex() {
    // Background task to ensure all notes have searchableContent
    for (const note of this.notebooks) {
      if (
        !note.encrypted &&
        (!note.searchableContent || note.searchableContent.length === 0) &&
        note.content
      ) {
        try {
          const decompressed = await decompress(note.content);
          note.searchableContent = decompressed
            .replace(/!\[.*?\]\(data:image\/.*?;base64,.*?\)/g, '')
            .toLowerCase();
        } catch (e) {
          console.error('Failed to rebuild search index for note', note.id, e);
        }
      }
    }
    this.saveState();
  }

  migrateOldData() {
    const oldPlain = localStorage.getItem('plaintextHash');
    const oldMarkdown = localStorage.getItem('markdownHash');

    if (oldPlain && !this.notebooks.some((n) => n.content === oldPlain)) {
      this.addNotebook('My First Note', oldPlain, 'plain');
      localStorage.removeItem('plaintextHash');
    }
    if (oldMarkdown && !this.notebooks.some((n) => n.content === oldMarkdown)) {
      this.addNotebook('My First Markdown', oldMarkdown, 'markdown');
      localStorage.removeItem('markdownHash');
    }

    // Ensure all current notebooks have timestamps and required fields
    this.notebooks.forEach((n) => {
      if (!n.createdAt) n.createdAt = n.lastModified || Date.now();
      if (!n.lastModified) n.lastModified = n.createdAt || Date.now();
      if (n.encrypted === undefined) n.encrypted = false;
      if (n.pinned === undefined) n.pinned = false;
      if (n.tags === undefined) n.tags = [];
    });
    this.saveState();
  }

  async handleUrlParam() {
    const hash = window.location.hash.substring(1);
    if (hash && hash.length > 20) {
      try {
        const decompressed = await decompress(hash);
        let content,
          dir = 'ltr',
          theme = 'classic',
          created = Date.now(),
          modified = Date.now(),
          encrypted = false,
          salt = null,
          iv = null;

        try {
          const data = JSON.parse(decompressed);
          content = data.c;
          dir = data.d || 'ltr';
          theme = data.t || 'classic';
          created = data.ca || Date.now();
          modified = data.lm || Date.now();
          encrypted = data.enc || false;
          salt = data.salt || null;
          iv = data.iv || null;
        } catch (e) {
          // Fallback for old shared links (direct text)
          content = decompressed;
        }

        const existing = this.notebooks.find((n) => n.content === hash);
        if (existing) {
          this.activeId = existing.id;
        } else {
          const newNote = this.addNotebook('Shared Note', content, this.mode); // Use 'content' here, not 'hash'
          newNote.dir = dir;
          newNote.paperTheme = theme;
          newNote.createdAt = created;
          newNote.lastModified = modified;
          newNote.encrypted = encrypted;
          newNote.salt = salt;
          newNote.iv = iv;
          this.activeId = newNote.id;
        }
        this.saveState();
        // Clean URL after import
        window.history.replaceState(null, '', window.location.pathname);

        if (encrypted) {
          this.openUnlockModal(this.activeId);
        }
      } catch (e) {
        console.error('Failed to import from URL', e);
      }
    }
  }

  ensureActiveNote() {
    const filteredNotebooks = this.notebooks.filter(
      (n) => n.mode === this.mode,
    );

    if (filteredNotebooks.length === 0) {
      const newNote = this.addNotebook('Untitled Note', '', this.mode);
      this.activeId = newNote.id;
    } else if (
      !this.activeId ||
      !this.notebooks.find(
        (n) => n.id === this.activeId && n.mode === this.mode,
      )
    ) {
      // Default to the most recent note of the current mode
      const modeNotes = this.notebooks.filter((n) => n.mode === this.mode);
      this.activeId = modeNotes[modeNotes.length - 1].id;
    }
    this.saveState();
  }

  addNotebook(title, content = '', mode = this.mode) {
    const id = crypto.randomUUID();
    const notebook = {
      id,
      title,
      content,
      mode,
      dir: 'ltr',
      paperTheme: this.paperTheme || 'classic',
      createdAt: Date.now(),
      lastModified: Date.now(),
      encrypted: false,
      salt: null,
      iv: null,
      pinned: false,
      tags: [],
    };
    this.notebooks.push(notebook);
    this.saveState();
    return notebook;
  }

  async loadActiveNote() {
    const note = this.notebooks.find((n) => n.id === this.activeId);
    if (!note || !window.article) return;

    try {
      if (note.encrypted) {
        window.article.innerText =
          'This note is encrypted. Please unlock it to view its content.';
        window.article.contentEditable = 'false';
        this.openUnlockModal(note.id);
      } else {
        if (note.content) {
          window.article.innerText = await decompress(note.content);
        } else {
          window.article.innerText = '';
        }
        window.article.contentEditable = 'plaintext-only';
      }

      if (this.mode === 'markdown') {
        if (window.updateMarkdownPreview) window.updateMarkdownPreview();
      }
      this.updateDocumentTitle(note.title);

      // Apply per-note settings
      this.applyPaperTheme(note.paperTheme || 'classic', false);
      this.applyDirection(note.dir || 'ltr', false);
      this.updateStats();
    } catch (e) {
      console.error('Failed to load note', e);
    }
  }

  updateDocumentTitle(title) {
    document.title = `${title} | Portfolio Notebook`;
  }

  setupAutoSave() {
    const saveAction = debounce(500, async () => {
      const content = window.getNoteContent();
      const note = this.notebooks.find((n) => n.id === this.activeId);
      if (!note || window.article.contentEditable === 'false') return;

      if (note.encrypted) {
        const key = this.sessionKeys.get(note.id);
        if (key) {
          const {encryptedData} = await CryptoUtils.encryptWithKey(
            content,
            key,
            note.salt,
            note.iv,
          );
          note.content = encryptedData;
        } else {
          // If encrypted but no key (should not happen if editable), do not save over encrypted content!
          console.warn(
            'Attempted to save encrypted note without session key. Aborting save to prevent corruption.',
          );
          return;
        }
      } else {
        const compressed = await compress(content);
        note.content = compressed;
      }

      note.lastModified = Date.now();

      // Update tags (Extract from content + keep existing manual ones)
      const tagRegex = /#(\w+)/g;
      const contentTags = [...new Set(content.match(tagRegex) || [])].map((t) =>
        t.substring(1).toLowerCase(),
      );
      const currentTags = note.tags || [];
      // Merge content tags with existing ones, avoiding duplicates
      note.tags = [...new Set([...currentTags, ...contentTags])];

      // Update Searchable Content (Strip images to keep it light and searchable)
      note.searchableContent = content
        .replace(/!\[.*?\]\(data:image\/.*?;base64,.*?\)/g, '')
        .toLowerCase();

      // Auto-rename if title is "Untitled Note"
      if (note.title === 'Untitled Note' || note.title === 'Shared Note') {
        const firstLine = content.split('\n')[0].trim().substring(0, 30);
        if (firstLine && firstLine.length > 2) {
          note.title = firstLine;
          this.updateDocumentTitle(note.title);
        }
      }

      this.saveState();
      this.updateStats();
    });

    window.article.addEventListener('input', saveAction);
  }

  saveState() {
    localStorage.setItem('notebooks', JSON.stringify(this.notebooks));
    localStorage.setItem('activeNotebookId', this.activeId);
    if (window.updateLibraryList) window.updateLibraryList();
  }

  switchNote(id) {
    const note = this.notebooks.find((n) => n.id === id);
    if (!note) return;

    // If mode mismatch, redirect
    if (note.mode !== this.mode) {
      localStorage.setItem('activeNotebookId', id);
      window.location.href = note.mode === 'markdown' ? '/' : '/plain';
      return;
    }

    this.activeId = id;
    this.saveState();
    this.loadActiveNote();

    // Close library modal
    const libraryModal = document.getElementById(this.config.library.id);
    if (libraryModal) {
      libraryModal.style.display = 'none';
      document.body.style.overflow = '';
    }
  }

  togglePin(id, event) {
    event.stopPropagation();
    const note = this.notebooks.find((n) => n.id === id);
    if (note) {
      note.pinned = !note.pinned;
      this.saveState();
    }
  }

  deleteNote(id, event) {
    event.stopPropagation();
    this.pendingId = id;
    const modal = document.getElementById(this.config.delete_note.id);
    if (modal) {
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }
  }

  async confirmDelete() {
    if (!this.pendingId) return;

    this.notebooks = this.notebooks.filter((n) => n.id !== this.pendingId);
    if (this.activeId === this.pendingId) {
      this.activeId = null;
      this.ensureActiveNote();
      await this.loadActiveNote();
    } else {
      this.saveState();
    }

    this.closeModal(this.config.delete_note.id);
    this.pendingId = null;
  }

  renameNote(id, event) {
    event.stopPropagation();
    const note = this.notebooks.find((n) => n.id === id);
    if (!note) return;

    this.pendingId = id;
    const input = document.getElementById('rename-input');
    const tagsInput = document.getElementById('tags-input');
    if (input) input.value = note.title;
    if (tagsInput) tagsInput.value = (note.tags || []).join(', ');

    const modal = document.getElementById(this.config.rename.id);
    if (modal) {
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      if (input) {
        setTimeout(() => input.focus(), 100);
      }
    }
  }

  confirmRename() {
    if (!this.pendingId) return;
    const input = document.getElementById('rename-input');
    if (!input || !input.value.trim()) return;

    const note = this.notebooks.find((n) => n.id === this.pendingId);
    if (note) {
      note.title = input.value.trim();
      const tagsInput = document.getElementById('tags-input');
      if (tagsInput) {
        const manualTags = tagsInput.value
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter((t) => t.length > 0);
        note.tags = [...new Set(manualTags)]; // Set manual tags, then autosave will merge with content tags
      }
      if (this.activeId === this.pendingId) {
        this.updateDocumentTitle(note.title);
        this.updateStats();
      }
      this.saveState();
    }

    this.closeModal(this.config.rename.id);
    this.pendingId = null;
  }

  findNoteByTitle(title) {
    return this.notebooks.find(
      (n) => n.title.toLowerCase() === title.toLowerCase(),
    );
  }

  openLockModal(id, event) {
    if (event) event.stopPropagation();
    this.pendingId = id;
    document.getElementById(this.config.lock.id).style.display = 'flex';
    document.getElementById('lock-input').focus();
  }

  async confirmLock() {
    const password = document.getElementById('lock-input').value;
    if (!password) return;

    const note = this.notebooks.find((n) => n.id === this.pendingId);
    if (!note) return;

    try {
      const contentToEncrypt = note.encrypted
        ? await decompress(note.content)
        : window.article.innerText;
      const {encryptedData, salt, iv} = await CryptoUtils.encrypt(
        contentToEncrypt,
        password,
      );

      note.content = encryptedData;
      note.salt = salt;
      note.iv = iv;
      note.encrypted = true;
      note.lastModified = Date.now();
      note.searchableContent = ''; // Clear searchable content for encrypted notes

      // Store key for session
      const key = await CryptoUtils.deriveKey(password, salt);
      this.sessionKeys.set(note.id, key);

      this.saveState();
      this.closeLockModal();

      if (this.activeId === note.id) {
        window.article.innerText =
          'This note is encrypted. Please unlock it to view its content.';
        window.article.contentEditable = 'false';

        if (this.mode === 'markdown') {
          if (window.updateMarkdownPreview) window.updateMarkdownPreview();
        }
      }
    } catch (e) {
      console.error('Encryption failed', e);
      alert('Failed to encrypt note.');
    }
  }

  closeLockModal() {
    document.getElementById('lock-input').value = '';
    this.closeModal(this.config.lock.id);
    this.pendingId = null;
  }

  openUnlockModal(id, event) {
    if (event) event.stopPropagation();
    this.pendingId = id;
    document.getElementById(this.config.unlock.id).style.display = 'flex';
    document.getElementById('unlock-input').focus();
  }

  async confirmUnlock() {
    const password = document.getElementById('unlock-input').value;
    if (!password) return;

    const note = this.notebooks.find((n) => n.id === this.pendingId);
    if (!note) return;

    try {
      // First attempt: Actual decryption
      const key = await CryptoUtils.deriveKey(password, note.salt);
      const decrypted = await CryptoUtils.decryptWithKey(
        note.content,
        key,
        note.iv,
      );

      // Store key for session (auto-save support)
      this.sessionKeys.set(note.id, key);

      // If it's the active note, update UI
      if (this.activeId === note.id) {
        window.article.innerText = decrypted;
        window.article.contentEditable = 'plaintext-only';

        if (this.mode === 'markdown') {
          if (window.updateMarkdownPreview) window.updateMarkdownPreview();
        }
      }

      // Update searchable content after successful decryption
      note.searchableContent = decrypted
        .replace(/!\[.*?\]\(data:image\/.*?;base64,.*?\)/g, '')
        .toLowerCase();
      this.saveState(); // Save to persist searchableContent

      this.closeUnlockModal();
    } catch (e) {
      // SECOND ATTEMPT: Rescue logic for notes corrupted by the auto-save bug
      try {
        const decompressed = await decompress(note.content);
        if (decompressed && decompressed.length > 0) {
          console.warn(
            'Note appears to be corrupted by auto-save bug. Rescuing content...',
          );

          // If it's the active note, update UI and re-lock correctly
          if (this.activeId === note.id) {
            window.article.innerText = decompressed;
            window.article.contentEditable = 'plaintext-only';

            if (this.mode === 'markdown') {
              if (window.updateMarkdownPreview) window.updateMarkdownPreview();
            }

            // Re-encrypt immediately with the new password to fix corruption
            const {encryptedData, salt, iv} = await CryptoUtils.encrypt(
              decompressed,
              password,
            );
            note.content = encryptedData;
            note.salt = salt;
            note.iv = iv;
            note.searchableContent = ''; // Clear searchable content for re-encrypted notes
            this.saveState();

            // Store new key
            const newKey = await CryptoUtils.deriveKey(password, salt);
            this.sessionKeys.set(note.id, newKey);
          }

          this.closeUnlockModal();
          alert(
            'Success! Your note was recovered and re-secured. (It was affected by a minor sync bug that has now been fixed).',
          );
          return;
        }
      } catch (rescueError) {
        // Both decryption and decompression failed -> likely wrong password
      }

      alert('Incorrect password!');
    }
  }

  closeUnlockModal() {
    document.getElementById('unlock-input').value = '';
    this.closeModal(this.config.unlock.id);
    this.pendingId = null;
  }

  setupGalleryListeners() {
    const galleryBtn = document.getElementById('galleryBtn');
    if (galleryBtn) {
      galleryBtn.addEventListener('click', () => {
        const modal = document.getElementById(this.config.gallery.id);
        if (modal) {
          modal.style.display = 'flex';
          document.body.style.overflow = 'hidden';
          this.updateGalleryActiveTheme();
        }
      });
    }

    // Direction Toggle Logic (Centralized)
    const rtlBtn = document.getElementById('rtlBtn');
    if (rtlBtn) {
      rtlBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleDirection();
      });
    }

    // Theme card clicks
    document.addEventListener('click', (e) => {
      const card = e.target.closest('.theme-card');
      if (card) {
        const theme = card.dataset.theme;
        this.applyPaperTheme(theme, true);
      }
    });
  }

  setupEncryptionListeners() {
    // Lock Modal
    document
      .getElementById(this.config.lock.confirmId)
      .addEventListener('click', () => this.confirmLock());
    document
      .getElementById(this.config.lock.cancelId)
      .addEventListener('click', () => this.closeLockModal());

    // Unlock Modal
    document
      .getElementById(this.config.unlock.confirmId)
      .addEventListener('click', () => this.confirmUnlock());
    document
      .getElementById(this.config.unlock.cancelId)
      .addEventListener('click', () => this.closeUnlockModal());

    // Handle 'Enter' key in inputs
    document.getElementById('lock-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.confirmLock();
    });
    document
      .getElementById('unlock-input')
      .addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.confirmUnlock();
      });
  }

  toggleDirection() {
    const note = this.notebooks.find((n) => n.id === this.activeId);
    if (!note) return;

    const newDir = note.dir === 'rtl' ? 'ltr' : 'rtl';
    this.applyDirection(newDir, true);
  }

  applyDirection(dir, save = true) {
    const note = this.notebooks.find((n) => n.id === this.activeId);
    if (note && save) {
      note.dir = dir;
      this.saveState();
    }

    this.direction = dir;
    if (window.article) {
      window.article.setAttribute('dir', dir);
    }

    // Update icon if present (from page specific scripts)
    if (window.updateDirectionIcon) {
      window.updateDirectionIcon(dir);
    }

    // Trigger input to allow markdown renderers etc to see the change
    if (window.article) {
      const event = new Event('input', {bubbles: true});
      window.article.dispatchEvent(event);
    }
  }

  applyPaperTheme(theme, save = true) {
    const note = this.notebooks.find((n) => n.id === this.activeId);
    if (note && save) {
      note.paperTheme = theme;
      this.saveState();
    }

    this.paperTheme = theme;
    document.body.setAttribute('data-paper-theme', theme);
    this.updateGalleryActiveTheme();
  }

  updateGalleryActiveTheme() {
    const cards = document.querySelectorAll('.theme-card');
    cards.forEach((card) => {
      if (card.dataset.theme === this.paperTheme) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }
  }

  updateStats() {
    const note = this.notebooks.find((n) => n.id === this.activeId);
    const bar = document.getElementById('editorStatsBar');
    if (!note || !bar) return;

    const wordVal = document.getElementById('statsWordCount');
    const charVal = document.getElementById('statsCharCount');
    const readVal = document.getElementById('statsReadTime');

    if (note.encrypted && window.article.contentEditable === 'false') {
      wordVal.innerText = '-';
      charVal.innerText = '-';
      readVal.innerText = 'Locked';
      bar.classList.add('visible');
      return;
    }

    let text = window.article.innerText || '';
    const rawChars = text.length;

    // Strip Markdown for more accurate stats
    let cleanText = text
      .replace(/^#+\s+/gm, '') // Headers
      .replace(/^>\s+/gm, '') // Blockquotes
      .replace(/^[\s\t]*[*+-]\s+/gm, '') // Unordered lists
      .replace(/^[\s\t]*\d+\.\s+/gm, '') // Ordered lists
      .replace(/^([-*_])\1{2,}$/gm, '') // Horizontal rules (---, ***, ___)
      .replace(/[*_~`]{1,3}/g, '') // Bold, Italic, Strikethrough, Code
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Links [text](url) -> text
      .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '') // Images
      .replace(/&nbsp;/g, ' ')
      .trim();

    const chars = cleanText.length;
    const words = cleanText ? cleanText.split(/\s+/).length : 0;
    const readingTime = Math.ceil(words / 200); // Avg 200 wpm

    wordVal.innerText = words.toLocaleString();
    charVal.innerText = chars.toLocaleString();
    readVal.innerText = `${readingTime} min`;

    // Handle Tags Display
    const tagsWrapper = document.getElementById('statsTagsWrapper');
    const tagsVal = document.getElementById('statsTags');
    if (tagsWrapper && tagsVal) {
      if (note.tags && note.tags.length > 0) {
        tagsVal.innerText = note.tags.map((t) => `#${t}`).join(' ');
        tagsWrapper.style.display = 'contents'; // Use contents to keep flex styling of parent
      } else {
        tagsWrapper.style.display = 'none';
      }
    }

    if (rawChars > 0) {
      bar.classList.add('visible');
    } else {
      bar.classList.remove('visible');
    }
  }

  setupActionModalListeners() {
    // Rename Confirm
    const renameConfirm = document.getElementById(this.config.rename.confirmId);
    if (renameConfirm) {
      renameConfirm.addEventListener('click', () => this.confirmRename());
    }

    // Rename Input Enter Key
    const renameInput = document.getElementById('rename-input');
    if (renameInput) {
      renameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.confirmRename();
      });
    }

    // Delete Confirm
    const deleteConfirm = document.getElementById(
      this.config.delete_note.confirmId,
    );
    if (deleteConfirm) {
      deleteConfirm.addEventListener('click', () => this.confirmDelete());
    }

    // Reset generic cancels are handled by Modal component but we ensure pendingId cleanup
    [
      this.config.rename.cancelId,
      this.config.delete_note.cancelId,
      this.config.lock.cancelId,
      this.config.unlock.cancelId,
    ].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', () => {
          this.pendingId = null;
        });
      }
    });
  }

  openWikiCreateModal(title) {
    this.pendingWikiTitle = title;
    const preview = document.getElementById('wiki-target-preview');
    if (preview) preview.innerText = `Title: ${title}`;
    const modal = document.getElementById(this.config.wiki_create.id);
    if (modal) modal.style.display = 'flex';
  }

  async confirmWikiCreate() {
    if (!this.pendingWikiTitle) return;

    const note = this.addNotebook(this.pendingWikiTitle, '', this.mode);
    this.switchNote(note.id);
    this.closeWikiCreateModal();
  }

  async bulkExport() {
    if (typeof JSZip === 'undefined') {
      alert('Export library not loaded. Please check your connection.');
      return;
    }

    const zip = new JSZip();
    const notes = this.notebooks;

    if (notes.length === 0) {
      alert('No notes to export!');
      return;
    }

    for (const note of notes) {
      let content = note.content;
      if (note.encrypted) {
        const key = this.sessionKeys.get(note.id);
        if (key) {
          try {
            const decrypted = await CryptoUtils.decryptWithKey(
              note.content,
              key,
              note.iv,
            );
            content = decrypted;
          } catch (e) {
            content = `[Encrypted Content - Locked]`;
          }
        } else {
          content = `[Encrypted Content - Locked]`;
        }
      } else {
        try {
          content = await decompress(note.content);
        } catch (e) {
          content = note.content;
        }
      }

      const extension = note.mode === 'markdown' ? 'md' : 'txt';
      const fileName = `${note.title.replace(/[/\\?%*:|"<>]/g, '-')}.${extension}`;
      zip.file(fileName, content);
    }

    const blob = await zip.generateAsync({type: 'blob'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notebook-export-${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  closeWikiCreateModal() {
    this.closeModal(this.config.wiki_create.id);
    this.pendingWikiTitle = null;
  }

  setupLibraryListeners() {
    const libraryBtn = document.getElementById('libraryBtn');
    if (libraryBtn) {
      libraryBtn.addEventListener('click', () => {
        const modal = document.getElementById(this.config.library.id);
        if (modal) {
          this.searchQuery = '';
          this.activeTag = null;
          this.libraryMode = this.mode; // Reset to current page mode
          const searchInput = document.getElementById('library-search');
          if (searchInput) searchInput.value = '';

          // Reset Tab UI
          document.querySelectorAll('.lib-tab').forEach((t) => {
            t.classList.toggle('active', t.dataset.mode === this.libraryMode);
          });

          modal.style.display = 'flex';
          document.body.style.overflow = 'hidden';
          window.updateLibraryList();
        }
      });
    }

    const newPlainBtn = document.getElementById('new-plain-btn');
    if (newPlainBtn) {
      newPlainBtn.addEventListener('click', () => {
        const note = this.addNotebook('Untitled Note', '', 'plain');
        this.switchNote(note.id);
      });
    }

    const newMarkdownBtn = document.getElementById('new-markdown-btn');
    if (newMarkdownBtn) {
      newMarkdownBtn.addEventListener('click', () => {
        const note = this.addNotebook('Untitled Note', '', 'markdown');
        this.switchNote(note.id);
      });
    }
  }
}
