# Notebook

A high-performance personal notebook web application built with Astro, featuring encryption, wiki-links, and seamless markdown editing. Write, preview, and share notes directly in your browser with instant synchronization.

## Features

- **Dual Mode Editing**: Switch between plain text and rich markdown modes
- **Real-time Preview**: Instant markdown rendering with live preview
- **Encryption**: Secure notes with AES-GCM encryption using PBKDF2 key derivation
- **URL Sharing**: Share encrypted notes via URL parameters
- **PWA Support**: Install as a progressive web app for offline access
- **Local Storage**: All data stored locally in your browser
- **Auto-save**: Automatic saving with compression to preserve space
- **Search & Tags**: Full-text search with tag-based organization
- **Themes**: Multiple paper themes and dark/light mode support
- **Export Options**: Download notes as text files or PDF
- **RTL Support**: Right-to-left text direction for multilingual content
- **Wiki Links**: Internal linking between notes
- **Gallery**: Browse and apply different visual themes
- **Statistics**: Track your writing with editor statistics

## Tech Stack

- **Framework**: Astro
- **Language**: TypeScript
- **Styling**: CSS with custom themes
- **Encryption**: Web Crypto API (AES-GCM)
- **Compression**: Custom compression utilities
- **Markdown**: Marked.js for rendering
- **PWA**: Service Worker with manifest

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── editor-stats/    # Writing statistics component
│   ├── icons/           # SVG icon components
│   ├── markdown-toolbar/# Markdown editing toolbar
│   ├── modal/           # Modal dialogs (share, library, etc.)
│   ├── navbar/          # Navigation bar
│   └── toc/             # Table of contents
├── configs/             # Configuration files
│   ├── menu.json        # Navigation menu definitions
│   └── modal.json       # Modal dialog configurations
├── layouts/             # Astro page layouts
├── pages/               # Route pages (index, plain)
├── scripts/             # JavaScript modules
│   ├── crypto.js        # Encryption utilities
│   ├── notebook-manager.js # Core notebook logic
│   ├── ui.js            # UI interaction handlers
│   └── utils.js         # Utility functions
├── styles/              # Global stylesheets
└── types/               # TypeScript type definitions
```

## Getting Started

### Prerequisites

- Node.js >= 22
- pnpm (recommended) or npm

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/MKAbuMattar/notebook.git
   cd notebook
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Start the development server:

   ```bash
   pnpm dev
   ```

4. Open [http://localhost:4321](http://localhost:4321) in your browser

### Build for Production

```bash
pnpm build
pnpm preview
```

### Code Formatting

```bash
pnpm fmt
```

## Usage

### Creating Notes

- Click the "New Note" button in the library to create a new notebook
- Switch between plain text and markdown modes using the toggle button
- Content is automatically saved to local storage

### Encryption

- Use the lock button to encrypt notes with a password
- Encrypted notes can be shared via URL while maintaining security
- Password is required to unlock and view encrypted content

### Sharing

- Share notes by copying the URL (works with encrypted notes)
- Recipients can access the shared note directly in their browser

### Exporting

- Download notes as plain text files
- Export as PDF for printing or archiving
- All exports preserve formatting and content

## Configuration

The app uses JSON configuration files for menus and modals:

- `src/configs/menu.json`: Defines navigation buttons and their actions
- `src/configs/modal.json`: Configures modal dialogs and their behavior

## Browser Support

- Modern browsers with Web Crypto API support
- Progressive Web App (PWA) capabilities
- Offline functionality through service worker

## Inspiration

This project draws inspiration from:

- [antonmedv/textarea](https://github.com/antonmedv/textarea) - A simple textarea component with advanced features

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run formatting: `pnpm fmt`
5. Test thoroughly
6. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details

## Repository

[https://github.com/MKAbuMattar/notebook](https://github.com/MKAbuMattar/notebook)

## Live Demo

[https://notebook.mkabumattar.com/](https://notebook.mkabumattar.com/)
