import {NotebookManager, ICONS} from './notebook-manager.js';
import {
  processImage,
  insertTextAtCursor,
  compress,
  decompress,
  initSelectionTracking,
  setupPolyfills,
} from './utils.js';

// --- Global helper for SVG to PNG ---
async function svgToPngBlob(svgString) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const svgBlob = new Blob([svgString], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      canvas.width = img.width * 2; // Higher resolution
      canvas.height = img.height * 2;
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          resolve(blob);
        }, 'image/png');
      }
    };
    img.onerror = reject;
    img.src = url;
  });
}

// --- UI Logic Class ---
class UIManager {
  constructor(config) {
    this.config = config;
    this.currentQRData = '';
  }

  init() {
    window.article = document.querySelector('.paper');
    window.notebookConfig = this.config;

    // Attach globals required for inline HTML onclick handlers
    window.processImage = processImage;
    window.insertTextAtCursor = insertTextAtCursor;
    window.compress = compress;
    window.decompress = decompress; // Used in some old paths? Safe to keep.

    // Attach library functions
    window.updateLibraryList = this.updateLibraryList.bind(this);
    window.setLibraryTag = this.setLibraryTag.bind(this);
    window.openShareModal = this.openShareModal.bind(this);
    window.updateDirectionIcon = this.updateDirectionIcon.bind(this);

    // Content Getter
    window.getNoteContent = () =>
      window.article ? window.article.innerText : '';

    // Initialize Helpers
    setupPolyfills();
    initSelectionTracking();

    // Instantiate NotebookManager
    window.notebookManager = new NotebookManager(this.config);

    this.setupGlobalListeners();
    this.setupShareListeners();
    this.setupDownloadListeners();
    this.setupScrollListeners();

    // Initial UI Sync
    if (window.article) {
      window.updateDirectionIcon(window.article.getAttribute('dir') || 'ltr');
    }
  }

  updateLibraryList() {
    const listContainer = document.getElementById('notebook-list');
    const tagContainer = document.getElementById('tag-filter-container');
    if (!listContainer || !window.notebookManager) return; // Wait for manager init

    // Re-select container if needed (sometimes DOM updates)
    const listContainerReal = document.getElementById('notebook-list');
    if (!listContainerReal) return;

    const manager = window.notebookManager;
    let notebooks = [...manager.notebooks];

    // 0. Update Tab UI
    document.querySelectorAll('.lib-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.mode === manager.libraryMode);
      if (!t.onclick) {
        t.onclick = (e) => {
          manager.libraryMode = e.target.dataset.mode;
          window.updateLibraryList();
        };
      }
    });

    // 1. Extract and render All Tags
    const allTags = [
      ...new Set(
        notebooks
          .filter((n) => n.mode === manager.libraryMode)
          .flatMap((n) => n.tags || []),
      ),
    ].sort();

    if (tagContainer) {
      tagContainer.innerHTML = `
        <div class="tag-item ${!manager.activeTag ? 'active' : ''}" onclick="window.setLibraryTag(null)">All</div>
        ${allTags
          .map(
            (tag) => `
          <div class="tag-item ${manager.activeTag === tag ? 'active' : ''}" onclick="window.setLibraryTag('${tag}')">#${tag}</div>
        `,
          )
          .join('')}
      `;
    }

    // 2. Filter by Mode
    if (!manager.searchQuery) {
      notebooks = notebooks.filter((n) => n.mode === manager.libraryMode);
    }

    // 3. Filter by Search Query
    if (manager.searchQuery) {
      const query = manager.searchQuery.toLowerCase();
      notebooks = notebooks.filter(
        (n) =>
          n.title.toLowerCase().includes(query) ||
          (n.searchableContent && n.searchableContent.includes(query)) ||
          (n.tags && n.tags.some((t) => t.toLowerCase().includes(query))),
      );
    }

    // 4. Filter by Tag
    if (manager.activeTag) {
      notebooks = notebooks.filter(
        (n) => n.tags && n.tags.includes(manager.activeTag),
      );
    }

    // 5. Sort
    notebooks.sort((a, b) => {
      if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
      return b.lastModified - a.lastModified;
    });

    if (notebooks.length === 0) {
      listContainerReal.innerHTML = `<div class="loading-state">${manager.searchQuery || manager.activeTag ? 'No matches found.' : 'Your ' + manager.libraryMode + ' collection is empty.'}</div>`;
      return;
    }

    listContainerReal.innerHTML = notebooks
      .map(
        (note) => `
      <div class="notebook-item ${note.id === manager.activeId ? 'active' : ''}" onclick="window.notebookManager.switchNote('${note.id}')">
        <div class="notebook-icon">
          ${note.pinned ? `<div class="pin-badge">${ICONS.PIN(10, 'currentColor')}</div>` : ''}
          <div class="moleskine-notebook">
            <div class="notebook-cover ${note.mode === 'markdown' ? 'blue' : 'red'}">
              <div class="notebook-skin"></div>
            </div>
            <div class="notebook-page ${note.mode === 'markdown' ? 'ruled' : ''}"></div>
          </div>
        </div>
        <div class="notebook-info">
          <span class="notebook-title">${note.title}</span>
          <div class="notebook-tags">
            ${(note.tags || []).map((t) => `<span class="mini-tag">#${t}</span>`).join('')}
          </div>
          <span class="notebook-meta">
            <span title="Last Modified">${new Date(note.lastModified).toLocaleDateString()}</span>
            <span class="mode-badge" style="background: ${note.mode === 'markdown' ? '#2e95aa' : '#cc4b48'}; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 0.65rem;">${note.mode.toUpperCase()}</span>
            ${note.encrypted ? '<span class="lock-status" title="Encrypted">🔒</span>' : ''}
          </span>
          <div class="notebook-actions">
            <button class="action-btn pin-btn ${note.pinned ? 'active' : ''}" onclick="window.notebookManager.togglePin('${note.id}', event)" title="${note.pinned ? 'Unpin' : 'Pin'}">${ICONS.PIN(14, note.pinned ? 'currentColor' : 'none')}</button>
            <button class="action-btn rename-btn" onclick="window.notebookManager.renameNote('${note.id}', event)" title="Rename">${ICONS.RENAME(14)}</button>
            <button class="action-btn delete-btn" onclick="window.notebookManager.deleteNote('${note.id}', event)" title="Delete">${ICONS.DELETE(14)}</button>
          </div>
        </div>
      </div>
    `,
      )
      .join('');
  }

  setLibraryTag(tag) {
    if (window.notebookManager) {
      window.notebookManager.activeTag = tag;
      this.updateLibraryList();
    }
  }

  async openShareModal() {
    const shareModal = document.getElementById(this.config.share.id);
    if (!shareModal || !window.notebookManager) return;

    const activeNote = window.notebookManager.notebooks.find(
      (n) => n.id === window.notebookManager.activeId,
    );
    if (!activeNote) return;

    const rawContent = window.getNoteContent();

    // --- Calculate Sizes ---
    const imgRegex = /!\[.*?\]\((data:image\/[a-z]+;base64,.*?)\)/g;
    let imgSizeRaw = 0;
    let match;
    while ((match = imgRegex.exec(rawContent)) !== null) {
      imgSizeRaw += match[1].length;
    }

    const textOnly = rawContent.replace(imgRegex, '');
    const textSizeRaw = textOnly.length;

    let contentToShare = activeNote.content;
    if (!activeNote.encrypted) {
      contentToShare = await compress(rawContent);
    }

    const payload = JSON.stringify({
      c: contentToShare,
      d: activeNote.dir || 'ltr',
      t: activeNote.paperTheme || 'classic',
      ca: activeNote.createdAt,
      lm: activeNote.lastModified,
      enc: activeNote.encrypted || false,
      salt: activeNote.salt || null,
      iv: activeNote.iv || null,
    });
    const compressed = await compress(payload);
    const url = `${window.location.origin}${window.location.pathname}#${compressed}`;

    // --- Update UI Stats ---
    const totalRaw = textSizeRaw + imgSizeRaw;
    const totalKB = Math.round(compressed.length / 1024);
    const textKB = Math.round(
      (compressed.length * (textSizeRaw / (totalRaw || 1))) / 1024,
    );
    const imgKB = totalKB - textKB;

    const SAFE_LIMIT_KB = 200;
    const percent = Math.min(Math.round((totalKB / SAFE_LIMIT_KB) * 100), 100);

    const txtSizeEl = document.getElementById('payload-text-size');
    const imgSizeEl = document.getElementById('payload-image-size');
    const totSizeEl = document.getElementById('payload-total-size');
    const barEl = document.getElementById('payload-progress-bar');
    const warnEl = document.getElementById('payload-warning');

    if (txtSizeEl) txtSizeEl.innerText = `Text: ${textKB} KB`;
    if (imgSizeEl) imgSizeEl.innerText = `Images: ${imgKB} KB`;
    if (totSizeEl)
      totSizeEl.innerText = `Total: ${totalKB} / ${SAFE_LIMIT_KB} KB`;

    if (barEl) {
      barEl.style.width = `${percent}%`;
      barEl.classList.remove('warning', 'danger');
      if (percent >= 100) barEl.classList.add('danger');
      else if (percent >= 70) barEl.classList.add('warning');
    }

    if (warnEl) {
      if (totalKB >= SAFE_LIMIT_KB) {
        warnEl.innerText = `Note is too large (${totalKB}KB). Search engines and some apps limit URLs to 200KB. Try removing large base64 images to ensure your link works for everyone.`;
        warnEl.classList.add('visible');
      } else if (totalKB >= SAFE_LIMIT_KB * 0.7) {
        warnEl.innerText =
          "Heads up: your note is getting large. It's still shareable, but you're approaching the limit for robust sharing.";
        warnEl.classList.add('visible');
        warnEl.style.color = '#ff9800';
      } else {
        warnEl.classList.remove('visible');
        warnEl.style.color = '';
      }
    }

    const urlInput = document.getElementById('share-url');
    if (urlInput) urlInput.value = url;

    this.renderQRCode(url);
    this.checkShareSupport();

    shareModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  renderQRCode(url) {
    const qrcodeContainer = document.getElementById('qrcode-container');
    const qrcodeSection = document.querySelector('.qrcode-section');
    if (qrcodeContainer && qrcodeSection && typeof qrcode !== 'undefined') {
      try {
        const qr = qrcode(0, 'L');
        qr.addData(url);
        qr.make();
        this.currentQRData = qr.createSvgTag({cellSize: 8, margin: 4});
        qrcodeContainer.innerHTML = this.currentQRData;
        qrcodeSection.style.display = 'flex';
      } catch (e) {
        console.error('QR code generation failed:', e);
        qrcodeContainer.innerHTML =
          '<div style="text-align:center; font-size:0.8rem; color:#f44336; padding:20px;">URL is too long for a QR code.</div>';
        this.currentQRData = '';

        const qrActions = document.querySelector('.qrcode-actions');
        if (qrActions) qrActions.style.display = 'none';
      }
    }
  }

  checkShareSupport() {
    // Check for copy support
    const copyQRBtn = document.getElementById('copy-qr-btn');
    if (copyQRBtn && window.ClipboardItem) {
      copyQRBtn.style.display = 'flex';
    }

    // Check for share support
    const shareQRBtn = document.getElementById('share-qr-btn');
    if (shareQRBtn && navigator.canShare) {
      shareQRBtn.style.display = 'flex';
    }

    const systemShareSection = document.getElementById('system-share-section');
    if (systemShareSection) {
      systemShareSection.style.display = navigator.share ? 'block' : 'none';
    }
  }

  updateDirectionIcon(dir) {
    const rtlBtn = document.getElementById('rtlBtn');
    if (!rtlBtn) return;
    const rtlIcon = rtlBtn.querySelector('.rtl-icon');
    if (!rtlIcon) return;

    const alignRightSVG =
      '<path d="M21 9.5H7M21 4.5H3M21 14.5H3M21 19.5H7"></path>';
    const alignLeftSVG =
      '<path d="M17 9.5H3M21 4.5H3M21 14.5H3M17 19.5H3"></path>';

    rtlIcon.innerHTML = dir === 'rtl' ? alignLeftSVG : alignRightSVG;
  }

  setupGlobalListeners() {
    // Global Image Upload Trigger
    window.triggerImageUpload = function () {
      if (window.article && window.article.contentEditable === 'false') {
        window.article.click();
      }
      const input = document.getElementById('globalImgInput');
      if (input) input.click();
    };

    const globalImgInput = document.getElementById('globalImgInput');
    if (globalImgInput) {
      globalImgInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
          const base64 = await processImage(file);
          insertTextAtCursor(`\n![image](${base64})\n`);
          globalImgInput.value = ''; // Reset selection

          const inputEvent = new Event('input', {bubbles: true});
          window.article.dispatchEvent(inputEvent);
        } catch (err) {
          console.error('Global image processing failed:', err);
          alert('Failed to process image. It might be too large.');
        }
      });
    }

    // Paste Listener
    if (window.article) {
      window.article.addEventListener('paste', async (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let item of items) {
          if (item.type.indexOf('image') !== -1) {
            e.preventDefault();
            const file = item.getAsFile();
            try {
              const base64 = await processImage(file);
              insertTextAtCursor(`\n![image](${base64})\n`);
              const inputEvent = new Event('input', {bubbles: true});
              window.article.dispatchEvent(inputEvent);
            } catch (err) {
              console.error('Pasted image processing failed:', err);
            }
          }
        }
      });
    }

    // Navbar Buttons
    document.addEventListener('mousedown', (e) => {
      const imgBtn = e.target.closest('#imageBtn');
      if (imgBtn) {
        e.preventDefault();
        window.triggerImageUpload();
      }
    });

    // Library Search
    document.addEventListener('input', (e) => {
      if (e.target.id === 'library-search') {
        if (window.notebookManager) {
          window.notebookManager.searchQuery = e.target.value;
          this.updateLibraryList();
        }
      }
    });

    // Wiki Links
    document.addEventListener('click', (e) => {
      const wikiLink = e.target.closest('.wiki-link');
      if (wikiLink && window.notebookManager) {
        e.preventDefault();
        const title = wikiLink.getAttribute('data-title');
        const note = window.notebookManager.findNoteByTitle(title);
        if (note) {
          window.notebookManager.switchNote(note.id);
        } else {
          window.notebookManager.openWikiCreateModal(title);
        }
      }
    });

    // Info/About
    const infoBtn = document.getElementById('infoBtn');
    if (infoBtn) {
      infoBtn.addEventListener('click', () => {
        const modal = document.getElementById(this.config.info.id);
        if (modal) {
          modal.style.display = 'flex';
          document.body.style.overflow = 'hidden';
        }
      });
    }

    // Reset Modal Logic
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        const modal = document.getElementById(this.config.reset.id);
        if (modal) {
          modal.style.display = 'flex';
          document.body.style.overflow = 'hidden';
        }
      });
    }
    const resetConfirm = document.getElementById(this.config.reset.confirmId);
    if (resetConfirm) {
      resetConfirm.addEventListener('click', () => {
        if (window.article) {
          window.article.innerText = '';
          const event = new Event('input', {bubbles: true});
          window.article.dispatchEvent(event);

          const resetModal = document.getElementById(this.config.reset.id);
          if (resetModal) {
            resetModal.style.display = 'none';
            document.body.style.overflow = '';
          }
        }
      });
    }

    // Bulk Export
    document.addEventListener('click', (e) => {
      if (
        e.target.id === 'bulk-export-btn' ||
        e.target.closest('#bulk-export-btn')
      ) {
        if (window.notebookManager) window.notebookManager.bulkExport();
      }
    });
  }

  setupShareListeners() {
    // Share Button
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
      shareBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.openShareModal();
      });
    }

    // Copy QR
    const copyQRBtn = document.getElementById('copy-qr-btn');
    if (copyQRBtn) {
      copyQRBtn.addEventListener('click', async () => {
        if (!this.currentQRData) return;
        try {
          const blob = await svgToPngBlob(this.currentQRData);
          if (blob) {
            await navigator.clipboard.write([
              new ClipboardItem({'image/png': blob}),
            ]);
            const originalHTML = copyQRBtn.innerHTML;
            copyQRBtn.innerHTML = `${ICONS.CHECK(18)} Copied!`;
            setTimeout(() => {
              copyQRBtn.innerHTML = originalHTML;
            }, 2000);
          }
        } catch (err) {
          console.error('Copying failed', err);
        }
      });
    }

    // Download QR
    const downloadQRBtn = document.getElementById('download-qr-btn');
    if (downloadQRBtn) {
      downloadQRBtn.addEventListener('click', () => {
        if (!this.currentQRData || !window.notebookManager) return;

        const activeNote = window.notebookManager.notebooks.find(
          (n) => n.id === window.notebookManager.activeId,
        );
        const title = activeNote ? activeNote.title : document.title;
        const cleanTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const mode = this.config.mode || 'notebook';
        const domain = window.location.hostname.replace(/\./g, '_');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${cleanTitle}_${mode}_${domain}_${timestamp}.svg`;

        const blob = new Blob([this.currentQRData], {type: 'image/svg+xml'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }

    // Share QR
    const shareQRBtn = document.getElementById('share-qr-btn');
    if (shareQRBtn) {
      shareQRBtn.addEventListener('click', async () => {
        if (!this.currentQRData || !navigator.share) return;
        try {
          const blob = await svgToPngBlob(this.currentQRData);
          if (blob) {
            const file = new File([blob], 'qrcode.png', {type: 'image/png'});
            if (navigator.canShare({files: [file]})) {
              await navigator.share({
                files: [file],
                title: 'Notebook QR Code',
              });
            } else {
              await navigator.share({
                title: 'Notebook QR Code',
                url: window.location.href,
              });
            }
          }
        } catch (err) {
          console.error('Sharing failed', err);
        }
      });
    }

    // Copy Link
    const copyLinkBtn = document.getElementById('copy-link-btn');
    if (copyLinkBtn) {
      copyLinkBtn.addEventListener('click', async () => {
        const urlInput = document.getElementById('share-url');
        if (urlInput) {
          try {
            await navigator.clipboard.writeText(urlInput.value);
            const originalHTML = copyLinkBtn.innerHTML;
            copyLinkBtn.innerHTML = ICONS.CHECK(20);
            setTimeout(() => {
              copyLinkBtn.innerHTML = originalHTML;
            }, 2000);
          } catch (err) {}
        }
      });
    }
  }

  setupDownloadListeners() {
    // Download Text
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        if (!window.article || !window.notebookManager) return;
        const activeNote = window.notebookManager.notebooks.find(
          (n) => n.id === window.notebookManager.activeId,
        );
        if (activeNote.encrypted) {
          alert(
            'Cannot download encrypted notes directly. Please unlock the note first.',
          );
          return;
        }
        const title = activeNote ? activeNote.title : 'note';
        const cleanTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const mode = this.config.mode || 'plain';
        const extension = mode === 'markdown' ? 'md' : 'txt';
        const filename = `${cleanTitle}.${extension}`;

        const blob = new Blob([window.getNoteContent()], {type: 'text/plain'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }

    // Download PDF
    const downloadPdfBtn = document.getElementById('downloadPdfBtn');
    if (downloadPdfBtn) {
      downloadPdfBtn.addEventListener('click', async () => {
        if (
          !window.article ||
          !window.notebookManager ||
          typeof html2pdf === 'undefined'
        )
          return;

        const activeNote = window.notebookManager.notebooks.find(
          (n) => n.id === window.notebookManager.activeId,
        );
        if (activeNote.encrypted) {
          alert(
            'Cannot export encrypted notes to PDF directly. Please unlock the note first.',
          );
          return;
        }
        const title = activeNote ? activeNote.title : 'note';
        const cleanTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${cleanTitle}_${timestamp}.pdf`;

        const opt = {
          margin: [15, 15, 15, 15],
          filename: filename,
          image: {type: 'jpeg', quality: 0.98},
          html2canvas: {scale: 2, useCORS: true},
          jsPDF: {unit: 'mm', format: 'a4', orientation: 'portrait'},
        };

        const element = window.article.cloneNode(true);
        element.style.color = '#333';
        element.style.backgroundColor = '#fff';
        element.style.padding = '20px';
        element.style.boxShadow = 'none';
        element.style.width = '100%';
        element.style.maxWidth = 'none';
        element.style.fontSize = '12pt';
        element.style.lineHeight = '1.6';
        element.style.fontFamily = '"Inter", sans-serif';

        if (this.config.mode === 'plain') {
          element.style.whiteSpace = 'pre-wrap';
        }

        try {
          await html2pdf().set(opt).from(element).save();
        } catch (error) {
          console.error('PDF Export failed:', error);
        }
      });
    }
  }

  setupScrollListeners() {
    // Progress Bar
    const updateProgressBar = () => {
      const progressBar = document.getElementById('progress-bar');
      if (!window.article || !progressBar) return;

      const articleRect = window.article.getBoundingClientRect();
      const articleTop = articleRect.top + window.scrollY;
      const articleBottom = articleTop + articleRect.height;
      const scrollPosition = window.scrollY;
      const windowHeight = window.innerHeight;

      const startPoint = 0;
      const endPoint = articleBottom - windowHeight;
      const scrollRange = endPoint - startPoint;

      let progress = 0;
      if (scrollPosition > 0 && scrollPosition <= endPoint) {
        progress = scrollPosition / scrollRange;
      } else if (scrollPosition <= 0) {
        progress = 0;
      } else if (scrollPosition > endPoint) {
        progress = 1;
      }

      progressBar.style.width = `${progress * 100}%`;
    };

    window.addEventListener('scroll', updateProgressBar);
    window.addEventListener('resize', updateProgressBar);
    updateProgressBar(); // Init

    // Scroll Top Button
    const scrollTopBtn = document.getElementById('scrollTopBtnStandalone');
    const toggleScrollTopButton = () => {
      if (!scrollTopBtn) return;
      if (window.scrollY > 300) {
        scrollTopBtn.classList.add('visible');
      } else {
        scrollTopBtn.classList.remove('visible');
      }
    };

    if (scrollTopBtn) {
      scrollTopBtn.addEventListener('click', () => {
        window.scrollTo({
          top: 0,
          behavior: 'smooth',
        });
      });
    }

    window.addEventListener('scroll', toggleScrollTopButton);
    toggleScrollTopButton();
  }
}

export function initUI(config) {
  const ui = new UIManager(config);
  ui.init();
}
