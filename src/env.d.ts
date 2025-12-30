/// <reference types="astro/client" />

interface Window {
  article: HTMLElement;
  notebookConfig: any;
  notebookManager: any;
  processImage: (file: File) => Promise<string>;
  insertTextAtCursor: (text: string) => void;
  compress: (text: string) => Promise<string>;
  decompress: (compressed: string) => Promise<string>;
  updateLibraryList: () => void;
  setLibraryTag: (tag: string | null) => void;
  openShareModal: () => void;
  updateDirectionIcon: (dir: string) => void;
  getNoteContent: () => string;
  updateMarkdownPreview?: () => void;
  markedWikiConfigured?: boolean;
  updateToCItems?: () => void;
}

declare var marked: any;
declare var html2pdf: any;
declare var qrcode: any;
