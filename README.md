# Hanex & Shumex

The React + Express AI companion chat, available in a browser or an Electron desktop window.

## Run on Windows

Use Windows 10/11 (64-bit). To run from source, install Node.js 22.12 or newer (including npm), then run in PowerShell from the project folder:

```powershell
npm install
npm run electron:dev
```

This starts the existing Express/Vite server and opens the unchanged chat in a desktop window. Configure provider API keys in the existing Settings panel; a root `.env` file is also supported during development. Closing or minimizing the window keeps the app running in the system tray and shows the floating island. Hover over the island to expand the command bar, choose Hanex or Shumex, and press Enter to send a command to that agent’s existing chat. The island shows progress and a short result; click it to reopen the full chat, or press Ctrl+Shift+Space. It collapses after the mouse leaves if no draft remains. Use the microphone button in the island or main chat to start recording, then press it again to stop. Audio is sent to Gemini using your saved Gemini key for transcription; it is kept in memory, not saved as an audio file. Recordings stop automatically after 60 seconds or at 4 MB. By default the transcript is placed in the input for review; enable “Send voice commands immediately” in Settings → Audio & Speech to send it instead. A Gemini key, network connection, and microphone permission are required. Drag the island by its faces to reposition it; its position is remembered. Use the tray menu to quit. The tray menu also offers demo island states; its demo approval does not authorize a task. Real file-action approvals appear separately in the same island state.

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

In Settings, add and reorder fallback provider/model entries. Only enabled providers are tried. A 429, 503, or empty reply is retried once; other model or network failures advance to the next entry; missing or invalid API keys stop fallback. The conversation is sent to each provider tried, so check its privacy and billing terms. Interrupted partial answers are replaced, not combined. The chat identifies the provider and model that responded or lists what was tried. OpenRouter’s dropdown can refresh its live zero-priced catalog; manually entered or previously selected IDs may not be free. If a free OpenRouter model fails, other live free models are tried after the configured fallback list.

### File tools (desktop only)

In Settings → Preferences → Allowed folders, choose folders the agent may use; the default is none. Gemini and OpenRouter models whose live catalog advertises tool support can read UTF-8 files, list folders, and search file names and contents. Write, move and delete require approval in the main chat or the island; delete uses the system Recycle Bin. The approval shows the full proposed action and, for writes, the exact content. “Always allow” persists for that action type and folder (for moves, the source/destination folder pair). Remove a folder in Settings to revoke its saved permissions. No full-access bypass is enabled.

Each call appears in the chat as a card, and a local JSON-lines audit log is written to `tool-activity.jsonl` in Electron's user-data folder (on Windows, typically `%APPDATA%\Hanex & Shumex`). The agent can make at most 15 calls per request. The log records paths and action decisions but replaces written file content with its size and a SHA-256 hash. Files read by a model are sent to that provider and are subject to its privacy policy. Search is bounded to 500 entries and reads text files up to 256 KiB.

**Known limitations:** Path components are checked with `lstat` and resolved with `realpath` immediately before access, but a theoretical symlink-swap race remains. Node's checks reject symbolic links and junctions, but may not identify every Windows reparse-point type. This feature is intended for a single-user personal environment, not a hostile multi-user sandbox.

#### Try on Windows

1. From a PowerShell prompt in the updated repository, run `npm install` and then `npm run electron:dev`. Alternatively rebuild and install with `npm run electron:build`. Save a Gemini API key in Settings and select a supported Gemini model, or enable an OpenRouter model whose live catalog lists tool support. Manually entered paid models may incur charges.
2. Create a disposable folder, e.g. `C:\MexAI-Tool-Test`, and put a text file `hello.txt` containing `hello world` in it. Under Settings → Preferences → Allowed folders, choose that folder.
3. **Read-only stage:** Ask “Read hello.txt in my allowed folder”, then ask to list the folder and search for `hello world`. Check the tool cards and the log. Remove the folder and repeat: tools should no longer be offered. Re-add it for the next test.
4. **Write stage:** Ask “Create draft.txt containing test draft in my allowed folder.” Verify the exact content in the approval popup and click Approve; check the file and card. Ask to move it to `moved.txt` and approve. Ask to delete `moved.txt`, approve, and verify it appears in Windows Recycle Bin. Try Deny on another write and check no file was created. To test the island, minimize the app, submit a write request from the island, and use its approval buttons.
5. To test persistent permission, choose “Always allow this kind of action in this folder” for a write, then ask for a second write in that folder. Remove the allowed folder to revoke its permissions. Inspect `%APPDATA%\Hanex & Shumex\tool-activity.jsonl` for requested actions, approvals, denials and outcomes.

### Publish a Windows update

1. Bump `version` in `package.json` to a higher semantic version and update the lockfile (`bun install --lockfile-only`, if using Bun).
2. On Windows, run `npm install` and `npm run electron:build`. This builds locally without automatically publishing.
3. Create a **published, non-prerelease** GitHub Release in `itsmehanan/MexAI` tagged `v` followed by the same version (for example, `v1.2.3`). Upload the NSIS installer, its `.blockmap`, and `latest.yml` from `release/` as release assets. Keep the asset names unchanged.

Installed Windows builds check for updates at startup and every four hours. They download in the background and only install when the user chooses Restart. The web app and source/dev Electron runs do not perform update checks. Publishing requires GitHub permissions configured outside the app; no credentials belong in the repository. For production, sign installers consistently with a trusted Windows code-signing certificate: unsigned releases do not provide independent publisher authentication even though update downloads have integrity checks.
