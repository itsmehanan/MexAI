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

### Custom provider and fallback

In desktop Settings, enable **Custom (OpenAI-compatible)**, enter its display name and model, save the base URL (for example `https://example.com/v1`), and save its API key. Select its model in the chat model menu. HTTPS is required except for localhost HTTP. The saved endpoint is managed by Electron rather than accepted from chat requests, and redirects are not followed when sending credentials. Browser deployments can configure `CUSTOM_BASE_URL` and `CUSTOM_API_KEY` on the server; the browser cannot save desktop credentials or change that server endpoint.

In Settings, add and reorder fallback provider/model entries. Only enabled providers are tried. A 429, 503, or empty response causes one retry before moving to the next entry; the conversation is sent to that provider, so check its privacy and billing terms. If a response has already started, an interruption is reported rather than combining answers. The chat identifies the provider and model that responded.

### Publish a Windows update

1. Bump `version` in `package.json` to a higher semantic version and update the lockfile (`bun install --lockfile-only`, if using Bun).
2. On Windows, run `npm install` and `npm run electron:build`. This builds locally without automatically publishing.
3. Create a **published, non-prerelease** GitHub Release in `itsmehanan/MexAI` tagged `v` followed by the same version (for example, `v1.2.3`). Upload the NSIS installer, its `.blockmap`, and `latest.yml` from `release/` as release assets. Keep the asset names unchanged.

Installed Windows builds check for updates at startup and every four hours. They download in the background and only install when the user chooses Restart. The web app and source/dev Electron runs do not perform update checks. Publishing requires GitHub permissions configured outside the app; no credentials belong in the repository. For production, sign installers consistently with a trusted Windows code-signing certificate: unsigned releases do not provide independent publisher authentication even though update downloads have integrity checks.
