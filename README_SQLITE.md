SQLite-in-browser setup (sql.js)

What this adds
- `assets/db.js` — initializes an in-browser SQLite database (sql.js WASM) and persists the DB to `localStorage`.
- `assets/app.js` — integrates your existing admin upload UI to save projects into the SQLite DB and renders stored projects.

Notes
- The SQLite engine runs in the browser (sql.js). The DB is persisted to `localStorage` as a base64 blob under key `sqlite-db-v1`.
- To export the DB file, call `downloadSqliteDb()` from the console or wire a button to it.
- The wasm binary is loaded from CDN; for full offline use, download the wasm and adjust `locateFile` in `assets/db.js`.

Quick test (serve and open site)
1. From the repo root run a simple HTTP server (recommended, because wasm may not load via `file://`):

```powershell
# Python 3
python -m http.server 8080

# or using npm's http-server if installed
npx http-server -p 8080
```

2. Open `http://localhost:8080` in your browser.
3. Login with admin password `David@ikechi`, upload a project and verify it persists across reloads.

If things fail
- Check the browser console for errors about loading `sql-wasm.wasm` (CORS / file serving issues).
- If persistence fails due to localStorage size limits, consider switching persistence to IndexedDB.
