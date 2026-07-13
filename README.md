# Nexus Gaming Hub

A professional local gaming dashboard for Nintendo Switch 2 and Windows 11. The frontend can be published through GitHub Pages and installed as a Progressive Web App. An optional Windows companion keeps AI credentials and large gameplay recordings on your laptop.

## Included dashboards

- Main dashboard
- Game Library with Owned, Played, New This Month, and Upcoming Switch 2 views
- Backlog and completion board
- Session timer and session history
- Achievement goals
- Notes and strategies
- Clip and screenshot organizer
- AI strategy chat
- Controller battery reminders
- Release calendar
- Game guide links
- Separate player profiles
- AI Game Intelligence Lab for gameplay recordings
- Settings, export, import, and privacy controls

Each feature opens as its own routed dashboard rather than being crowded onto one screen.

## Important Nintendo login limitation

The opening screen links directly to Nintendo's official account website, but it does **not** collect Nintendo credentials and does **not** claim to verify the Nintendo session. A true “Sign in with Nintendo” integration would require an authorized Nintendo developer authentication flow. Never add Nintendo email/password fields to this project.

## Two operating modes

### 1. GitHub Pages / browser-only mode

Works immediately after publishing:

- Library, backlog, timer, goals, notes, releases, guides, profiles, and batteries
- Offline installation as a PWA
- JSON backups
- Screenshots and clips stored in the browser with IndexedDB
- Offline AI fallback that searches your saved notes

Browser data remains on that device and browser profile. GitHub Pages is static hosting, so it cannot safely hide an API key or process large gameplay recordings by itself.

### 2. Full local Windows mode

Run `start-nexus.bat` from the project folder. The companion serves the same dashboard at:

`http://localhost:8787`

It adds:

- Secure OpenAI API calls with the key stored only in `server/.env`
- Large gameplay recording uploads stored under `server/data/uploads`
- FFmpeg frame sampling
- Vision analysis of chronological gameplay frames
- A growing per-game knowledge base used by AI Strategy Chat

The recording system is retrieval-based learning: each analysis adds useful game knowledge to future chat context. It does not falsely claim to retrain model weights from raw video.

## Windows setup

1. Install Node.js 22 or newer.
2. Double-click `start-nexus.bat`.
3. On first run, it creates `server/.env` and opens it in Notepad.
4. Paste your OpenAI API key after `OPENAI_API_KEY=` and save.
5. Run `start-nexus.bat` again.
6. For gameplay frame analysis, install FFmpeg from PowerShell or Command Prompt:

```powershell
winget install --id Gyan.FFmpeg -e
```

7. Keep the command window open while using AI or video analysis.

The default model is `gpt-5.6`. Change `OPENAI_MODEL` in `server/.env` if your API project uses another compatible model.

## Publish to GitHub Pages

The connected GitHub account currently has no repository named for this project, so create one first.

1. Go to GitHub and create a public repository named `nexus-gaming-hub`.
2. Extract this project and upload everything except `server/node_modules` and `server/.env`.
3. Commit to the `main` branch.
4. Open the repository's **Settings → Pages**.
5. Set **Source** to **GitHub Actions**.
6. The included `.github/workflows/pages.yml` deploys the site.

Your normal project URL will be in this pattern:

`https://YOUR-GITHUB-USERNAME.github.io/nexus-gaming-hub/`

To connect a GitHub Pages copy to the local Windows companion, add the exact Pages origin to `ALLOWED_ORIGINS` in `server/.env`, separated by commas. Restart the companion after changing it.

For the most reliable AI and upload behavior, use the local address served by `start-nexus.bat`. The GitHub Pages version remains useful as the portable browser dashboard.

## Release calendar data

Release dates can be added manually or imported from JSON. See:

`data/release-feed.example.json`

Expected format:

```json
{
  "releases": [
    {
      "title": "Game title",
      "date": "2026-08-20",
      "platform": "Nintendo Switch 2",
      "url": "https://publisher.example/game"
    }
  ]
}
```

Imported dates automatically appear in the Game Library's **New This Month** and **Upcoming Switch 2** tabs.

## Controller batteries

The dashboard provides manual controller reminders. A normal webpage cannot currently read Switch 2 controller battery data through the dock, so levels must be updated manually.

## Data locations

Browser-only data:

- LocalStorage: dashboard records and settings
- IndexedDB: local screenshots and video files

Windows companion data:

- `server/data/uploads/`: uploaded recordings
- `server/data/uploads.json`: upload metadata
- `server/data/knowledge.json`: analyzed game knowledge

These companion data files are ignored by Git so private recordings and AI knowledge are not accidentally published.

## Security

- Never commit `server/.env`.
- Never put an API key in `assets/app.js` or browser LocalStorage.
- The local server binds only to `127.0.0.1` by default.
- CORS is restricted by `ALLOWED_ORIGINS`.
- Nintendo credentials are never requested or stored.

## Development checks

```powershell
node --check assets/app.js
node --check server/server.mjs
cd server
npm install
npm audit
npm start
```

Then open `http://localhost:8787` and verify `/api/health` returns JSON.
