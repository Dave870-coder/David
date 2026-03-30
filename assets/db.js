// assets/db.js
// Lightweight wrapper for sql.js (SQLite compiled to WASM) running in-browser.
(async function(){
  // initSqlJs locateFile points to the wasm binary on CDN
  window.sqliteReady = (async () => {
    try {
      const SQL = await initSqlJs({
        locateFile: filename => 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.6.2/sql-wasm.wasm'
      });

      window.SQL = SQL;

      // Helper: simple IndexedDB wrapper for storing the sqlite file and blobs
      function openIDB() {
        return new Promise((resolve, reject) => {
          const r = indexedDB.open('local-sqlite-store', 2);
          r.onupgradeneeded = function(e) {
            const idb = e.target.result;
            if (!idb.objectStoreNames.contains('sqlite')) idb.createObjectStore('sqlite');
            if (!idb.objectStoreNames.contains('files')) idb.createObjectStore('files');
            if (!idb.objectStoreNames.contains('libs')) idb.createObjectStore('libs');
          };
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error || new Error('IndexedDB open failed'));
        });
      }

      async function idbGet(store, key) {
        const idb = await openIDB();
        return new Promise((resolve, reject) => {
          const tx = idb.transaction(store, 'readonly');
          const os = tx.objectStore(store);
          const req = os.get(key);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      }

      async function idbGetAll(store) {
        const idb = await openIDB();
        return new Promise((resolve, reject) => {
          const tx = idb.transaction(store, 'readonly');
          const os = tx.objectStore(store);
          const req = os.getAllKeys();
          req.onsuccess = async () => {
            try {
              const keys = req.result || [];
              const items = [];
              for (const k of keys) {
                const r = os.get(k);
                // wrap in promise
                items.push(new Promise((res, rej) => { r.onsuccess = () => res({ key: k, value: r.result }); r.onerror = () => rej(r.error); }));
              }
              const resolved = await Promise.all(items);
              resolve(resolved);
            } catch (e) { reject(e); }
          };
          req.onerror = () => reject(req.error);
        });
      }

      async function idbDelete(store, key) {
        const idb = await openIDB();
        return new Promise((resolve, reject) => {
          const tx = idb.transaction(store, 'readwrite');
          const os = tx.objectStore(store);
          const req = os.delete(key);
          req.onsuccess = () => resolve(true);
          req.onerror = () => reject(req.error);
        });
      }

      async function idbClear(store) {
        const idb = await openIDB();
        return new Promise((resolve, reject) => {
          const tx = idb.transaction(store, 'readwrite');
          const os = tx.objectStore(store);
          const req = os.clear();
          req.onsuccess = () => resolve(true);
          req.onerror = () => reject(req.error);
        });
      }

      async function idbPut(store, key, value) {
        const idb = await openIDB();
        return new Promise((resolve, reject) => {
          const tx = idb.transaction(store, 'readwrite');
          const os = tx.objectStore(store);
          const req = os.put(value, key);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      }

      // Migration: if localStorage has legacy sqlite blob, move to IndexedDB
      if (localStorage.getItem('sqlite-db-v1')) {
        try {
          const saved = localStorage.getItem('sqlite-db-v1');
          const binaryString = atob(saved);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
          const buffer = bytes.buffer;
          await idbPut('sqlite', 'dbfile', buffer);
          localStorage.removeItem('sqlite-db-v1');
          console.info('Migrated sqlite-db-v1 from localStorage to IndexedDB');
        } catch (e) {
          console.warn('Migration from localStorage failed:', e);
        }
      }

      // Load persisted DB from IndexedDB if present
      let db;
      try {
        const saved = await idbGet('sqlite', 'dbfile');
        if (saved && (saved instanceof ArrayBuffer || saved.buffer)) {
          const buffer = saved instanceof ArrayBuffer ? saved : saved.buffer || saved;
          const bytes = new Uint8Array(buffer);
          db = new SQL.Database(bytes);
        } else {
          db = new SQL.Database();
        }
      } catch (e) {
        console.warn('Could not load persisted sqlite from IndexedDB, creating new DB', e);
        db = new SQL.Database();
      }

      // Ensure projects table exists
      db.run(`
        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          type TEXT,
          description TEXT,
          files TEXT,
          uploadedAt TEXT
        );
      `);

      // Helper to persist DB to localStorage (base64)
      async function persist() {
        try {
          const data = db.export();
          // store raw ArrayBuffer in IndexedDB
          const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
          await idbPut('sqlite', 'dbfile', buffer);
        } catch (e) {
          console.error('Failed to persist SQLite DB to IndexedDB:', e);
        }
      }

      // File storage helpers in IndexedDB
      // saveFileBlob accepts an optional precomputed hash to avoid re-reading the blob
      async function saveFileBlob(blob, precomputedHash) {
        // Deduplicate by SHA-256 hash of content. Use hash hex as key.
        try {
          if (precomputedHash === 'NO_HASH') {
            const id = `${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
            const entry = {
              blob: blob,
              name: blob.name || ('file-' + id),
              size: blob.size || 0,
              type: blob.type || 'application/octet-stream',
              createdAt: new Date().toISOString(),
              refCount: 1
            };
            await idbPut('files', id, entry);
            return id;
          }

          let hashHex = precomputedHash;
          let buffer = null;
          if (!hashHex) {
            // get ArrayBuffer and compute hash
            buffer = await (blob.arrayBuffer ? blob.arrayBuffer() : new Response(blob).arrayBuffer());
            const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
            const hashArray = Array.from(new Uint8Array(hashBuf));
            hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          }

          // if exists, increment refCount and return hash
          const existing = await idbGet('files', hashHex);
          if (existing) {
            existing.refCount = (existing.refCount || 0) + 1;
            await idbPut('files', hashHex, existing);
            return hashHex;
          }

          // prepare entry; try to avoid reusing buffer if we didn't compute it here
          const entry = {
            blob: blob,
            name: blob.name || ('file-' + hashHex.slice(0,8)),
            size: blob.size || (buffer ? buffer.byteLength : 0),
            type: blob.type || 'application/octet-stream',
            createdAt: new Date().toISOString(),
            refCount: 1
          };
          await idbPut('files', hashHex, entry);
          return hashHex;
        } catch (e) {
          console.error('saveFileBlob error:', e);
          // fallback: create random id (no dedupe)
          try {
            const id = `${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
            const entry = { blob: blob, name: blob.name || ('file-' + id), size: blob.size || 0, type: blob.type || 'application/octet-stream', createdAt: new Date().toISOString(), refCount: 1 };
            await idbPut('files', id, entry);
            return id;
          } catch (e2) {
            console.error('saveFileBlob fallback failed:', e2);
            return null;
          }
        }
      }

      async function getFileBlob(id) {
        try {
          const b = await idbGet('files', id);
          if (!b) return null;
          // b may be an object with blob
          if (b.blob) return b.blob;
          return b;
        } catch (e) {
          console.error('getFileBlob error:', e);
          return null;
        }
      }

      async function deleteFileBlob(id) {
        try {
          await idbDelete('files', id);
          return true;
        } catch (e) {
          console.error('deleteFileBlob error:', e);
          return false;
        }
      }

      async function listFiles() {
        try {
          const entries = await idbGetAll('files');
          // entries are {key, value}
          return entries.map(e => {
            const v = e.value || null;
            return {
              id: e.key,
              meta: v ? { name: v.name, size: v.size, type: v.type, createdAt: v.createdAt, refCount: v.refCount || 0 } : null
            };
          });
        } catch (e) {
          console.error('listFiles error:', e);
          return [];
        }
      }

      // Reference counting helpers
      async function incFileRef(id) {
        try {
          const entry = await idbGet('files', id);
          if (!entry) return false;
          entry.refCount = (entry.refCount || 0) + 1;
          await idbPut('files', id, entry);
          return true;
        } catch (e) { console.error('incFileRef error', e); return false; }
      }

      async function decFileRef(id) {
        try {
          const entry = await idbGet('files', id);
          if (!entry) return false;
          entry.refCount = (entry.refCount || 1) - 1;
          if (entry.refCount <= 0) {
            await idbDelete('files', id);
            return true;
          }
          await idbPut('files', id, entry);
          return true;
        } catch (e) { console.error('decFileRef error', e); return false; }
      }

      // API exposed on window.DB
      window.DB = {
        addProject: async function(project) {
          try {
            const filesArr = project.files || [];
            // ensure referenced fileIds have refCount incremented
            for (const f of filesArr) {
              if (f.fileId) await incFileRef(f.fileId);
            }
            const filesJSON = JSON.stringify(filesArr);
            const stmt = db.prepare("INSERT INTO projects (title, type, description, files, uploadedAt) VALUES (?,?,?,?,?)");
            stmt.run([project.title, project.type || '', project.description || '', filesJSON, project.uploadedAt || new Date().toISOString()]);
            stmt.free();
            await persist();
            return true;
          } catch (e) {
            console.error('DB.addProject error:', e);
            return false;
          }
        },
        listProjects: function() {
          try {
            const res = db.exec("SELECT id, title, type, description, files, uploadedAt FROM projects ORDER BY id DESC");
            if (!res || res.length === 0) return [];
            const values = res[0].values;
            const cols = res[0].columns;
            return values.map(row => {
              const out = {};
              cols.forEach((c, i) => out[c] = row[i]);
              try { out.files = JSON.parse(out.files); } catch(e) { out.files = []; }
              return out;
            });
          } catch (e) {
            console.error('DB.listProjects error:', e);
            return [];
          }
        },
        getProject: function(id) {
          try {
            const stmt = db.prepare("SELECT id, title, type, description, files, uploadedAt FROM projects WHERE id = ?");
            stmt.bind([id]);
            if (stmt.step()) {
              const row = stmt.getAsObject();
              try { row.files = JSON.parse(row.files); } catch(e) { row.files = []; }
              stmt.free();
              return row;
            }
            stmt.free();
            return null;
          } catch (e) {
            console.error('DB.getProject error:', e);
            return null;
          }
        },
        deleteProject: async function(id) {
          try {
            // fetch project row to find referenced files
            const sel = db.exec("SELECT files FROM projects WHERE id = " + id);
            if (sel && sel[0] && sel[0].values && sel[0].values[0]) {
              const filesJson = sel[0].values[0][0];
              let files = [];
              try { files = JSON.parse(filesJson); } catch(e) { files = []; }
              for (const f of files) {
                if (f.fileId) await decFileRef(f.fileId);
              }
            }
            const stmt = db.prepare("DELETE FROM projects WHERE id = ?");
            stmt.run([id]);
            stmt.free();
            await persist();
            return true;
          } catch (e) {
            console.error('DB.deleteProject error:', e);
            return false;
          }
        },
        exportFileUrl: function() {
          try {
            const data = db.export();
            const blob = new Blob([data], { type: 'application/octet-stream' });
            return URL.createObjectURL(blob);
          } catch (e) {
            console.error('DB.exportFileUrl error:', e);
            return null;
          }
        },
        exportBytes: function() {
          try {
            return db.export();
          } catch (e) {
            console.error('DB.exportBytes error:', e);
            return null;
          }
        },
        importDatabaseBytes: async function(arrayBuffer) {
          try {
            if (!arrayBuffer) return false;
            const imported = new SQL.Database(new Uint8Array(arrayBuffer));
            imported.run(`
              CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                type TEXT,
                description TEXT,
                files TEXT,
                uploadedAt TEXT
              );
            `);
            try { db.close(); } catch (e) {}
            db = imported;
            await persist();
            return true;
          } catch (e) {
            console.error('DB.importDatabaseBytes error:', e);
            return false;
          }
        },
        // Save a file blob into IndexedDB and return generated id
        saveFileBlob: async function(blob, precomputedHash) {
          return await saveFileBlob(blob, precomputedHash);
        },
        // Retrieve a file blob by id (returns Promise<Blob|null>)
        getFileBlob: async function(id) {
          return await getFileBlob(id);
        },
        // Delete a file blob by id
        deleteFileBlob: async function(id) {
          return await deleteFileBlob(id);
        },
        // List files with basic metadata
        listFiles: async function() {
          return await listFiles();
        },
        // Permanently delete the entire IndexedDB and reset in-memory DB
        deleteDatabase: async function() {
          try {
            // close in-memory DB
            try { db.close(); } catch (e) {}
            // delete the indexedDB database
            await new Promise((resolve, reject) => {
              const req = indexedDB.deleteDatabase('local-sqlite-store');
              req.onsuccess = () => resolve(true);
              req.onerror = () => reject(req.error || new Error('deleteDatabase failed'));
              req.onblocked = () => { /* ignore */ };
            });
            // recreate empty in-memory DB and table
            db = new SQL.Database();
            db.run(`
              CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                type TEXT,
                description TEXT,
                files TEXT,
                uploadedAt TEXT
              );
            `);
            await persist();
            return true;
          } catch (e) {
            console.error('deleteDatabase error:', e);
            return false;
          }
        },
        // Merge two file entries: replace all references of sourceId with targetId in projects,
        // update refCounts, and delete the source file entry.
        mergeFileBlobs: async function(targetId, sourceId) {
          try {
            if (targetId === sourceId) return true;
            // 1) Update projects: replace occurrences in files JSON
            const res = db.exec("SELECT id, files FROM projects");
            if (res && res[0] && res[0].values) {
              const cols = res[0].columns;
              const rows = res[0].values;
              const updateStmt = db.prepare("UPDATE projects SET files = ? WHERE id = ?");
              for (const row of rows) {
                const idIndex = cols.indexOf('id');
                const filesIndex = cols.indexOf('files');
                const projId = row[idIndex];
                let filesJson = row[filesIndex];
                let filesArr = [];
                try { filesArr = JSON.parse(filesJson); } catch (e) { filesArr = []; }
                let changed = false;
                for (const f of filesArr) {
                  if (f.fileId && f.fileId === sourceId) { f.fileId = targetId; changed = true; }
                }
                if (changed) {
                  updateStmt.run([JSON.stringify(filesArr), projId]);
                }
              }
              updateStmt.free();
            }

            // 2) Update refCounts: add source refCount to target, then delete source
            const sourceEntry = await idbGet('files', sourceId);
            const targetEntry = await idbGet('files', targetId);
            const sourceCount = (sourceEntry && sourceEntry.refCount) ? sourceEntry.refCount : 0;
            if (targetEntry) {
              targetEntry.refCount = (targetEntry.refCount || 0) + sourceCount;
              await idbPut('files', targetId, targetEntry);
            }
            // delete source entry
            await idbDelete('files', sourceId);

            // persist DB after modifications
            await persist();
            return true;
          } catch (e) {
            console.error('mergeFileBlobs error:', e);
            return false;
          }
        },
        _raw: db,
        _persist: persist
      };

      return true;
    } catch (err) {
      console.error('sqliteReady init error:', err);
      return false;
    }
  })();
})();
/* Simple IndexedDB wrapper for storing projects locally (no API). */
(function(){
  const DB_NAME = 'projectsDB';
  const DB_VERSION = 1;
  const STORE = 'projects';

  function openDB(){
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function(e){
        const db = e.target.result;
        if(!db.objectStoreNames.contains(STORE)){
          db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = function(e){ resolve(e.target.result); };
      req.onerror = function(e){ reject(e.target.error); };
    });
  }

  async function initDB(){
    const db = await openDB();
    db.close();
  }

  async function addProject(project){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.add(project);
      req.onsuccess = e => { resolve(e.target.result); db.close(); };
      req.onerror = e => { reject(e.target.error); db.close(); };
    });
  }

  async function getAllProjects(){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = e => { resolve(e.target.result); db.close(); };
      req.onerror = e => { reject(e.target.error); db.close(); };
    });
  }

  async function updateProject(project){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.put(project);
      req.onsuccess = e => { resolve(e.target.result); db.close(); };
      req.onerror = e => { reject(e.target.error); db.close(); };
    });
  }

  async function deleteProject(id){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.delete(id);
      req.onsuccess = () => { resolve(); db.close(); };
      req.onerror = e => { reject(e.target.error); db.close(); };
    });
  }

  window.LocalProjectDB = {
    initDB,
    addProject,
    getAllProjects,
    updateProject,
    deleteProject
  };
})();
