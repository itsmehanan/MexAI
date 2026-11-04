# Hanex & Shumex

The React + Express AI companion chat, available in a browser or an Electron desktop window.

## Run on Windows

Use Windows 10/11 (64-bit). To run from source, install Node.js 22.12 or newer (including npm), then run in PowerShell from the project folder:

```powershell
npm install
npm run electron:dev
```

This starts the existing Express/Vite server and opens the unchanged chat in a desktop window. Configure provider API keys in the existing Settings panel; a root `.env` file is also supported during development. Closing or minimizing the window keeps the app running in the system tray and shows the floating island. Click the island or press Ctrl+Shift+Space to reopen the chat. Drag the island to reposition it; its position is remembered. Use the tray menu to quit. The tray menu also offers demo island states; approval buttons are illustrative only and do not authorize real tasks.

The web version still works independently:

```powershell
npm run dev
```

Open **http://localhost:3000** in your browser. The desktop app uses a separate, fixed loopback port (3737), so its chat history and settings persist between launches.

### Build the Windows installer

On Windows, with dependencies installed:

```powershell
npm run electron:build
```

The x64 NSIS installer is written to `release\Hanex-Shumex-Setup-0.0.0.exe`. Run it to install the app. The installed app includes Electron and the server; end users do **not** need Node.js, npm, or a separate terminal. The first build downloads Electron and packaging tools from the internet. The installer is unsigned unless you configure your own code-signing certificate.

### API keys

In the Electron app, save provider keys in Settings. Electron's `safeStorage` encrypts them using the operating system's secure storage; Settings displays only a mask and can replace or remove a key. The server receives decrypted keys directly from the Electron main process, not from the chat UI. Existing desktop keys in this app's browser storage are migrated on launch and removed from that storage only after secure saving succeeds. If secure storage is unavailable, migration is not performed and the original data is retained; resolve the OS secure-storage issue and reopen the app.

The browser version cannot use Electron safeStorage and no longer saves keys in browser storage. Configure server-side environment variables for the web version. Browser and desktop local storage have separate origins, so legacy keys saved in a browser cannot be migrated automatically by the desktop app: remove them from that browser's site storage after moving them to the desktop Settings or environment variables. Keys already present in a `.env` file remain there; safeStorage does not encrypt that file.
