// assets/app.js
// Integrates the existing UI with the in-browser SQLite wrapper (window.DB)
(async function(){
  let isDbReady = false;
  let zipPreviewState = {
    fingerprint: '',
    entries: []
  };
  let zipPreviewFilter = '';

  function setDbUiState(enabled, reason) {
    const ids = ['uploadProjectBtn', 'exportDbBtn', 'manageDbBtn', 'dedupeAllBtn', 'permanentDeleteDbBtn', 'importDbBtn', 'importProjectZipBtn'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.disabled = !enabled;
      if (!enabled) {
        el.classList.add('opacity-60', 'cursor-not-allowed');
        if (reason) el.title = reason;
      } else {
        el.classList.remove('opacity-60', 'cursor-not-allowed');
        el.title = '';
      }
    });

    const status = document.getElementById('dbStatusText');
    if (status) {
      status.textContent = enabled ? 'Local DB ready' : (reason || 'Local DB initializing...');
      status.className = enabled ? 'text-xs text-green-700 bg-green-100 p-2 rounded-lg' : 'text-xs text-amber-700 bg-amber-100 p-2 rounded-lg';
    }
  }

  try {
    const readyResult = await window.sqliteReady;
    isDbReady = readyResult === true && !!window.DB;
  } catch (e) {
    console.error('SQLite failed to initialize in app.js:', e);
    isDbReady = false;
  }

  function notifyError(message) {
    if (typeof window.showErrorMessage === 'function') {
      window.showErrorMessage(message);
      return;
    }
    console.error(message);
  }

  function notifySuccess(message) {
    if (typeof window.showSuccessMessage === 'function') {
      window.showSuccessMessage(message);
      return;
    }
    console.log(message);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, power);
    return `${value.toFixed(power === 0 ? 0 : 2)} ${units[power]}`;
  }

  function setProgress(id, textId, fraction, text) {
    const bar = document.getElementById(id);
    const label = document.getElementById(textId);
    const safeFraction = Math.max(0, Math.min(1, fraction || 0));
    if (bar) bar.style.width = `${Math.round(safeFraction * 100)}%`;
    if (label) label.textContent = text || `${Math.round(safeFraction * 100)}%`;
  }

  async function checkStorageQuota(additionalBytes) {
    try {
      if (!navigator.storage || !navigator.storage.estimate) return { supported: false };
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const projected = usage + (additionalBytes || 0);
      const percent = quota > 0 ? (projected / quota) * 100 : 0;
      return { supported: true, usage, quota, projected, percent };
    } catch (e) {
      return { supported: false };
    }
  }

  async function refreshQuotaWarning(additionalBytes) {
    const box = document.getElementById('quotaWarningText');
    if (!box) return;
    const q = await checkStorageQuota(additionalBytes || 0);
    if (!q.supported || !q.quota) {
      box.textContent = 'Storage quota info unavailable in this browser.';
      box.className = 'text-xs text-gray-700 bg-gray-100 p-2 rounded-lg';
      return;
    }
    box.textContent = `Storage usage: ${formatBytes(q.usage)} / ${formatBytes(q.quota)} (projected: ${formatBytes(q.projected)})`;
    if (q.percent >= 90) {
      box.className = 'text-xs text-red-700 bg-red-100 p-2 rounded-lg';
    } else if (q.percent >= 75) {
      box.className = 'text-xs text-amber-700 bg-amber-100 p-2 rounded-lg';
    } else {
      box.className = 'text-xs text-green-700 bg-green-100 p-2 rounded-lg';
    }
  }

  function getFileFingerprint(file) {
    if (!file) return '';
    return `${file.name}|${file.size}|${file.lastModified || 0}`;
  }

  function renderZipPreviewTable() {
    const panel = document.getElementById('zipPreviewPanel');
    const body = document.getElementById('zipPreviewTableBody');
    const summary = document.getElementById('zipPreviewSummary');
    const filterInput = document.getElementById('zipPreviewFilterInput');
    if (!panel || !body || !summary) return;

    body.innerHTML = '';
    const entries = zipPreviewState.entries || [];
    if (entries.length === 0) {
      panel.classList.add('hidden');
      summary.textContent = 'ZIP preview: 0 files selected';
      return;
    }

    panel.classList.remove('hidden');
    if (filterInput && filterInput.value !== zipPreviewFilter) {
      zipPreviewFilter = filterInput.value;
    }

    const query = (zipPreviewFilter || '').trim().toLowerCase();
    const visibleEntries = entries
      .map((entry, index) => ({ entry, index }))
      .filter(item => {
        if (!query) return true;
        return item.entry.name.toLowerCase().includes(query);
      });

    const includedCount = entries.filter(e => e.include).length;
    summary.textContent = `ZIP preview: ${includedCount}/${entries.length} selected • showing ${visibleEntries.length}`;

    visibleEntries.forEach(({ entry, index }) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b';
      const ext = entry.name.includes('.') ? entry.name.split('.').pop().toLowerCase() : '-';
      tr.innerHTML = `
        <td class="p-2"><input type="checkbox" ${entry.include ? 'checked' : ''} data-zip-index="${index}" /></td>
        <td class="p-2 break-all text-gray-700">${entry.name}</td>
        <td class="p-2 text-gray-500">${ext}</td>
      `;
      body.appendChild(tr);
    });

    body.querySelectorAll('input[type="checkbox"][data-zip-index]').forEach((checkbox) => {
      checkbox.addEventListener('change', (e) => {
        const idx = Number(e.target.getAttribute('data-zip-index'));
        if (!Number.isNaN(idx) && zipPreviewState.entries[idx]) {
          zipPreviewState.entries[idx].include = !!e.target.checked;
          renderZipPreviewTable();
        }
      });
    });
  }

  function setZipPreviewAll(include) {
    if (!zipPreviewState.entries || zipPreviewState.entries.length === 0) return;
    const query = (zipPreviewFilter || '').trim().toLowerCase();
    zipPreviewState.entries.forEach((entry) => {
      if (!query || entry.name.toLowerCase().includes(query)) {
        entry.include = include;
      }
    });
    renderZipPreviewTable();
  }

  async function buildZipPreview(file) {
    if (!file) return;
    const fingerprint = getFileFingerprint(file);
    if (zipPreviewState.fingerprint === fingerprint && zipPreviewState.entries.length > 0) {
      renderZipPreviewTable();
      return;
    }

    setProgress('zipImportProgressBar', 'zipImportProgressText', 0.03, 'Reading ZIP for preview...');
    const zipBuffer = await readFileAsArrayBufferWithProgress(file, (fraction) => {
      setProgress('zipImportProgressBar', 'zipImportProgressText', fraction * 0.4, `Scanning ZIP... ${Math.round(fraction * 100)}%`);
    });

    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip not loaded');
    }
    const zip = await JSZip.loadAsync(zipBuffer);
    const entries = Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .map((entry) => ({ name: entry.name, include: true }));

    zipPreviewState = {
      fingerprint,
      entries
    };
    zipPreviewFilter = '';
    const filterInput = document.getElementById('zipPreviewFilterInput');
    if (filterInput) filterInput.value = '';
    renderZipPreviewTable();
    setProgress('zipImportProgressBar', 'zipImportProgressText', 0.45, `ZIP preview ready (${entries.length} files)`);
  }

  // Render existing projects from DB into the project list
  async function renderProjectCard(p) {
    const projectList = document.getElementById('projectList');
    if (!projectList) return;

    const card = document.createElement('div');
    card.className = 'bg-white p-6 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 animate-on-scroll border border-gray-100';

    let fileListHTML = '';
    const files = p.files || [];
    // files may reference stored blobs (fileId) or inline urls
    for (const fileInfo of files) {
      const fileSizeMB = (fileInfo.size / (1024 * 1024)).toFixed(2);
      let url = fileInfo.url || fileInfo.dataUrl || '';
      if (fileInfo.fileId && window.DB && window.DB.getFileBlob) {
        try {
          const blob = await window.DB.getFileBlob(fileInfo.fileId);
          if (blob) url = URL.createObjectURL(blob);
        } catch (e) {
          console.warn('Could not load blob for', fileInfo.fileId, e);
        }
      }
      fileListHTML += `
        <div class="flex items-center justify-between py-1 border-b border-gray-100 last:border-b-0">
          <span class="text-sm text-gray-600 truncate">${fileInfo.name}</span>
          <div class="flex items-center space-x-2">
            <span class="text-xs text-gray-500">${fileSizeMB}MB</span>
            <a href="${url}" target="_blank" class="text-blue-600 hover:text-blue-800 text-xs font-medium">View</a>
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="flex items-start justify-between mb-3">
        <h4 class="text-xl font-bold text-gray-900">${p.title}</h4>
        <span class="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">${p.type || ''}</span>
      </div>
      <div class="mb-4">
        <p class="text-sm text-gray-600 mb-2">Files (${files.length}):</p>
        <div class="max-h-32 overflow-y-auto bg-gray-50 rounded-lg p-2">
          ${fileListHTML}
        </div>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-xs text-gray-500">Uploaded: ${new Date(p.uploadedAt).toLocaleString()}</span>
      </div>
    `;

    // add Download Bundle button if project has an id
    const footer = card.querySelector('.flex.items-center.justify-between');
    const bundleBtn = document.createElement('button');
    bundleBtn.className = 'bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded ml-2';
    bundleBtn.innerText = 'Download Bundle';
    bundleBtn.onclick = function() {
      if (!p.id) { alert('Project ID not available yet. Reload to get latest projects.'); return; }
      exportProjectBundle(p.id, p.title || 'project');
    };
    if (footer) footer.appendChild(bundleBtn);
    projectList.prepend(card);
  }

  // Load and render existing projects
  async function loadProjectsFromDB() {
    try {
      await renderAllProjects();
    } catch (e) {
      console.error('Error loading projects from DB:', e);
    }
  }

  // Render all projects with optional filter
  function matchesFilter(p, filter) {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (p.title && p.title.toLowerCase().includes(q)) || (p.type && p.type.toLowerCase().includes(q)) || (p.description && p.description.toLowerCase().includes(q));
  }

  async function renderAllProjects(filter) {
    const projectList = document.getElementById('projectList');
    if (!projectList) return;
    projectList.innerHTML = '';
    try {
      const projects = window.DB ? window.DB.listProjects() : [];
      const filtered = projects.filter(p => matchesFilter(p, filter || ''));
      for (const project of filtered) {
        await renderProjectCard(project);
      }
    } catch (e) {
      console.error('renderAllProjects error', e);
    }
  }

  // Manage panel: list projects and stored files, allow deletion
  async function refreshManagePanel() {
    const projectsContainer = document.getElementById('manageProjectsList');
    const filesContainer = document.getElementById('manageFilesList');
    if (!projectsContainer || !filesContainer) return;
    projectsContainer.innerHTML = '';
    filesContainer.innerHTML = '';

    // Projects
      try {
        const projects = window.DB ? window.DB.listProjects() : [];
        const filterInput = document.getElementById('manageSearchInput');
        const filterValue = filterInput ? filterInput.value.trim().toLowerCase() : '';
        projects.forEach(p => {
          if (filterValue && !(p.title && p.title.toLowerCase().includes(filterValue)) && !(p.type && p.type.toLowerCase().includes(filterValue))) return;
        const el = document.createElement('div');
        el.className = 'p-3 border-b flex justify-between items-center';
        el.innerHTML = `<div><strong>${p.title}</strong><div class="text-xs text-gray-500">${p.type} • ${new Date(p.uploadedAt).toLocaleString()}</div></div>`;
        const btns = document.createElement('div');
        const del = document.createElement('button');
        del.className = 'ml-2 bg-red-600 text-white px-3 py-1 rounded';
        del.innerText = 'Delete';
        del.onclick = async () => {
          if (!confirm('Delete project "' + p.title + '"? This will remove db record.')) return;
          if (window.DB && window.DB.deleteProject) {
            await window.DB.deleteProject(p.id);
            await refreshManagePanel();
            location.reload();
          }
        };
        btns.appendChild(del);
        el.appendChild(btns);
        projectsContainer.appendChild(el);
      });
    } catch (e) { console.error('manage projects load error', e); }

    // Files
    try {
      const files = window.DB && window.DB.listFiles ? await window.DB.listFiles() : [];
      // get projects to compute references
      const projects = window.DB ? window.DB.listProjects() : [];
      for (const f of files) {
        const el = document.createElement('div');
        el.className = 'p-3 border-b flex justify-between items-center';
        const name = (f.meta && f.meta.name) || f.id;
        const size = (f.meta && f.meta.size) ? ((f.meta.size / (1024*1024)).toFixed(2) + 'MB') : '';
        const left = document.createElement('div');
        left.innerHTML = `<div class="text-sm">${name}</div><div class="text-xs text-gray-500">${size} • refs: ${f.meta && f.meta.refCount ? f.meta.refCount : 0}</div>`;

        // Inline list of referencing project titles directly below the file name
        const refs = projects.filter(p => (p.files || []).some(ff => ff.fileId === f.id)).map(p => ({ id: p.id, title: p.title }));
        const refsInline = document.createElement('div');
        refsInline.className = 'mt-1 flex flex-wrap gap-2';
        if (refs.length) {
          refs.forEach(r => {
            const pill = document.createElement('span');
            pill.className = 'text-xs bg-gray-100 px-2 py-1 rounded-full text-gray-700';
            pill.innerText = r.title || (`Project ${r.id}`);
            refsInline.appendChild(pill);
          });
        } else {
          const none = document.createElement('span');
          none.className = 'text-xs text-gray-400';
          none.innerText = 'No referencing projects';
          refsInline.appendChild(none);
        }

        const btns = document.createElement('div');
        const dl = document.createElement('button');
        dl.className = 'ml-2 bg-blue-600 text-white px-3 py-1 rounded';
        dl.innerText = 'Download';
        dl.onclick = async () => {
          const blob = await window.DB.getFileBlob(f.id);
          if (!blob) { alert('File not found'); return; }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = (f.meta && f.meta.name) || 'file';
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        };
        const del = document.createElement('button');
        del.className = 'ml-2 bg-red-600 text-white px-3 py-1 rounded';
        del.innerText = 'Delete';
        del.onclick = async () => {
          if (refs.length > 0) {
            alert('This file is still referenced by project(s). Delete those project references first.');
            return;
          }
          if (!confirm('Delete file ' + ((f.meta && f.meta.name) || f.id) + '?')) return;
          if (window.DB && window.DB.deleteFileBlob) {
            const ok = await window.DB.deleteFileBlob(f.id);
            if (!ok) alert('Failed to delete file');
          }
          refreshManagePanel();
        };

        // Merge duplicates action for this file: open dialog to pick a target or auto-merge
        const mergeBtn = document.createElement('button');
        mergeBtn.className = 'ml-2 bg-yellow-600 text-white px-3 py-1 rounded';
        mergeBtn.innerText = 'Find Duplicates';
        mergeBtn.onclick = async () => {
          await dedupeForFile(f.id);
          refreshManagePanel();
        };

        btns.appendChild(dl);
        btns.appendChild(del);
        btns.appendChild(mergeBtn);

        el.appendChild(left);
        left.appendChild(refsInline);
        el.appendChild(btns);
        filesContainer.appendChild(el);
      }
    } catch (e) { console.error('manage files load error', e); }
  }

  window.showManagePanel = function() {
    if (!isDbReady || !window.DB) {
      notifyError('Local database is not ready yet. Please wait and refresh if needed.');
      return;
    }
    const panel = document.getElementById('manageDbPanel');
    if (!panel) return;
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) refreshManagePanel();
  };

  // Dedupe by scanning all files, compute hashes, and merge duplicates (content-equal)
  async function dedupeAllByContent() {
    try {
      if (!confirm('Run automatic dedupe by content hash? This will merge identical files and update references.')) return;
      const files = window.DB && window.DB.listFiles ? await window.DB.listFiles() : [];
      const dedupeMode = document.getElementById('dedupeMode')?.value || 'content';
      const total = files.length;
      const progress = document.getElementById('dedupeProgress') || (() => { const d = document.createElement('div'); d.id = 'dedupeProgress'; d.className='my-2'; document.getElementById('manageDbPanel').prepend(d); return d; })();
      const hashMap = {};
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        progress.innerText = `Hashing file ${i+1}/${total}: ${f.id}`;
        const blob = await window.DB.getFileBlob(f.id);
        if (!blob) continue;
        const hash = await computeHashWithProgress(blob, (p)=>{});
        const fileName = (f.meta && f.meta.name) ? f.meta.name : '';
        const key = dedupeMode === 'filename' ? `${fileName}::${hash}` : hash;
        if (!hashMap[key]) hashMap[key] = [];
        hashMap[key].push(f.id);
      }
      let mergedCount = 0;
      for (const key in hashMap) {
        const ids = hashMap[key];
        if (ids.length > 1) {
          const target = ids[0];
          for (let k = 1; k < ids.length; k++) {
            const src = ids[k];
            progress.innerText = `Merging ${src} -> ${target}`;
            await window.DB.mergeFileBlobs(target, src);
            mergedCount++;
          }
        }
      }
      progress.innerText = `Dedupe complete. Merged ${mergedCount} files.`;
      refreshManagePanel();
    } catch (e) {
      console.error('dedupeAllByContent error', e);
      alert('Dedupe failed. See console.');
    }
  }

  async function dedupeForFile(fileId) {
    try {
      // scan all files and compute hashes to find matches for given fileId
      const files = window.DB && window.DB.listFiles ? await window.DB.listFiles() : [];
      const progress = document.getElementById('dedupeProgress') || (() => { const d = document.createElement('div'); d.id = 'dedupeProgress'; d.className='my-2'; document.getElementById('manageDbPanel').prepend(d); return d; })();
      const targetBlob = await window.DB.getFileBlob(fileId);
      if (!targetBlob) { alert('Target blob not found'); return; }
      const targetHash = await computeHashWithProgress(targetBlob,(p)=>{});
      const duplicates = [];
      for (const f of files) {
        if (f.id === fileId) continue;
        const b = await window.DB.getFileBlob(f.id);
        if (!b) continue;
        const h = await computeHashWithProgress(b,(p)=>{});
        if (h === targetHash) duplicates.push(f.id);
      }
      if (duplicates.length === 0) { alert('No duplicates found'); return; }
      if (!confirm(`Merge ${duplicates.length} duplicate(s) into ${fileId}?`)) return;
      for (const src of duplicates) {
        await window.DB.mergeFileBlobs(fileId, src);
      }
      alert('Merge complete');
    } catch (e) { console.error('dedupeForFile error', e); alert('Dedupe failed'); }
  }
  window.dedupeAllByContent = dedupeAllByContent;

  // Export project bundle (zip) using JSZip
  async function exportProjectBundle(projectId, projectTitle) {
    try {
      if (!window.DB || !window.DB.getProject) { alert('DB not ready'); return; }
      const proj = window.DB.getProject ? window.DB.getProject(projectId) : null;
      if (!proj) { alert('Project not found'); return; }
      const files = proj.files || [];
      if (typeof JSZip === 'undefined') {
        alert('JSZip is not loaded. Cannot create bundle.');
        return;
      }
      const zip = new JSZip();
      for (const f of files) {
        let blob = null;
        if (f.fileId && window.DB && window.DB.getFileBlob) {
          blob = await window.DB.getFileBlob(f.fileId);
        }
        if (!blob && f.dataUrl) {
          // convert dataURL to blob
          const res = await fetch(f.dataUrl); blob = await res.blob();
        }
        if (!blob && f.url) {
          try { const res = await fetch(f.url); blob = await res.blob(); } catch(e) { console.warn('fetch file url failed', e); }
        }
        const name = f.name || ('file-' + Math.random().toString(36).slice(2,8));
        if (blob) zip.file(name, blob);
        else zip.file(name + '.txt', 'Could not include original file (missing blob)');
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(content);
      a.download = `${(projectTitle||'project').replace(/[^a-z0-9-_\.]/ig, '_')}_bundle.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error('exportProjectBundle error', e);
      alert('Failed to create project bundle.');
    }
  }
  window.exportProjectBundle = exportProjectBundle;

  // Compute SHA-256 with chunked reads to show progress for large files
  async function computeHashWithProgress(file, onProgress) {
    return new Promise((resolve, reject) => {
      try {
        const chunkSize = 1024 * 1024; // 1MB chunks
        const chunks = Math.ceil(file.size / chunkSize);
        let current = 0;
        const reader = new FileReader();
        const buffers = [];

        reader.onerror = () => reject(reader.error || new Error('Read error'));
        reader.onload = async (e) => {
          buffers.push(e.target.result);
          current++;
          if (onProgress) onProgress(current / chunks);
          if (current < chunks) {
            readNext();
          } else {
            // concatenate
            const totalLen = buffers.reduce((s, b) => s + b.byteLength, 0);
            const tmp = new Uint8Array(totalLen);
            let offset = 0;
            for (const b of buffers) { tmp.set(new Uint8Array(b), offset); offset += b.byteLength; }
            try {
              const hashBuf = await crypto.subtle.digest('SHA-256', tmp.buffer);
              const hashArray = Array.from(new Uint8Array(hashBuf));
              const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
              if (onProgress) onProgress(1);
              resolve(hashHex);
            } catch (e) { reject(e); }
          }
        };

        function readNext() {
          const start = current * chunkSize;
          const end = Math.min(start + chunkSize, file.size);
          const blob = file.slice(start, end);
          reader.readAsArrayBuffer(blob);
        }

        readNext();
      } catch (e) { reject(e); }
    });
  }

  // Export confirmation showing DB size
  window.showExportConfirmation = function() {
    try {
      if (!isDbReady || !window.DB || !window.DB._raw) { notifyError('DB not initialized. Please wait for Local DB ready.'); return; }
      const data = window.DB.exportBytes ? window.DB.exportBytes() : window.DB._raw.export();
      if (!data) { notifyError('Could not read database bytes for export.'); return; }
      const size = data.length; // number of bytes
      const sizeMb = (size / (1024*1024)).toFixed(2);
      if (confirm(`Export SQLite DB — size: ${sizeMb} MB. Continue?`)) {
        downloadSqliteDb(data);
      }
    } catch (e) {
      console.error('Export confirm error', e);
      downloadSqliteDb();
    }
  };

  // Override global addProject to store projects into SQLite DB
  window.addProject = async function() {
    try {
      // Use the same DOM elements as the original implementation
      const adminUploadPanel = document.getElementById('adminUpload');
      const isLoggedIn = window.isAdminLoggedIn === true || (adminUploadPanel && !adminUploadPanel.classList.contains('hidden'));
      if (!isLoggedIn) {
        alert('Admin access required. Please log in first.');
        notifyError('Admin access required. Please log in first.');
        return;
      }

      if (!isDbReady || !window.DB) {
        notifyError('Local DB is not ready yet. Please wait a moment and try again.');
        return;
      }

      const titleInput = document.getElementById('projectTitle');
      const typeSelect = document.getElementById('projectType');
      const fileInput = document.getElementById('projectFile');

      if (!titleInput || !typeSelect || !fileInput) {
        notifyError('Required form elements not found.');
        return;
      }

      const title = titleInput.value.trim();
      const type = typeSelect.value;
      const files = fileInput.files;

      if (!title) { notifyError('Please enter a project title.'); return; }
      if (!files || files.length === 0) { notifyError('Please select project file(s).'); return; }

      const softLargeFileSize = 500 * 1024 * 1024;
      const uploadedFiles = [];
      const totalBytes = Array.from(files).reduce((sum, f) => sum + f.size, 0);
      await refreshQuotaWarning(totalBytes);
      const quotaInfo = await checkStorageQuota(totalBytes);
      if (quotaInfo.supported && quotaInfo.quota && quotaInfo.projected > quotaInfo.quota) {
        notifyError('Upload exceeds browser storage quota. Reduce file size or number of files.');
        return;
      }

      // prepare progress UI
      const progressContainer = document.getElementById('hashProgress') || (() => {
        const c = document.createElement('div'); c.id = 'hashProgress'; c.className = 'my-2 text-xs text-gray-700'; document.getElementById('adminUpload').prepend(c); return c; })();
      setProgress('uploadOverallProgressBar', 'uploadOverallProgressText', 0, 'Preparing upload...');

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > softLargeFileSize) {
          const proceedLarge = confirm(`File "${file.name}" is very large (${formatBytes(file.size)}). Continue with upload?`);
          if (!proceedLarge) return;
        }

        const url = URL.createObjectURL(file);
        // compute hash with progress
        let fileHash = null;
        try {
          const useNoHash = file.size > 150 * 1024 * 1024;
          fileHash = await computeHashWithProgress(file, (p) => {
            progressContainer.innerText = `Processing ${file.name}: ${Math.round(p*100)}%`;
            setProgress('uploadCurrentProgressBar', 'uploadCurrentProgressText', p, `Current file: ${file.name} (${Math.round(p*100)}%)`);
          });
          if (useNoHash) {
            fileHash = 'NO_HASH';
            progressContainer.innerText = `Skipped full hash for very large file ${file.name} (no-dedupe mode)`;
          }
        } catch (e) {
          console.warn('Hash compute failed, proceeding without precomputed hash', e);
          fileHash = 'NO_HASH';
        }

        // Persist file blob into IndexedDB via DB.saveFileBlob, providing precomputed hash when available
        let fileId = null;
        if (window.DB && window.DB.saveFileBlob) {
          try {
            fileId = await window.DB.saveFileBlob(file, fileHash);
          } catch (e) {
            console.warn('Failed to persist file blob:', e);
          }
        }

        uploadedFiles.push({ name: file.name, size: file.size, type: file.type || 'unknown', url, fileId });
        progressContainer.innerText = '';
        setProgress('uploadOverallProgressBar', 'uploadOverallProgressText', (i + 1) / files.length, `Uploaded ${i + 1}/${files.length} file(s)`);
      }


      const projectData = {
        title,
        type,
        description: `A ${type.toLowerCase()} project uploaded via admin panel`,
        files: uploadedFiles,
        uploadedAt: new Date().toISOString()
      };

      if (window.DB && await window.DB.addProject(projectData)) {
        // reload projects to get IDs and updated data
        await renderAllProjects(document.getElementById('projectSearchInput')?.value?.trim() || '');
        titleInput.value = '';
        fileInput.value = '';
        alert(`Project "${title}" with ${uploadedFiles.length} file(s) added successfully!`);
        notifySuccess(`Project "${title}" added and saved to local SQLite DB.`);
        setProgress('uploadCurrentProgressBar', 'uploadCurrentProgressText', 1, 'Current file: done');
        setProgress('uploadOverallProgressBar', 'uploadOverallProgressText', 1, `Upload complete (${formatBytes(totalBytes)})`);
        await refreshQuotaWarning(0);
      } else {
        notifyError('Failed to save project to local DB.');
        setProgress('uploadOverallProgressBar', 'uploadOverallProgressText', 0, 'Upload failed');
      }
    } catch (e) {
      console.error('Override addProject error:', e);
      notifyError('An error occurred while adding the project.');
    }
  };

  // Provide a download link for the whole SQLite DB
  window.downloadSqliteDb = function(existingBytes) {
    try {
      if (!isDbReady || !window.DB) { notifyError('DB not initialized'); return; }
      const bytes = existingBytes || (window.DB.exportBytes ? window.DB.exportBytes() : null);
      if (!bytes) { notifyError('Failed to export DB'); return; }

      const total = bytes.length;
      const chunkSize = 1024 * 1024 * 2;
      const parts = [];
      for (let offset = 0; offset < total; offset += chunkSize) {
        const end = Math.min(offset + chunkSize, total);
        parts.push(bytes.slice(offset, end));
        setProgress('exportProgressBar', 'exportProgressText', end / total, `Exporting DB... ${Math.round((end / total) * 100)}%`);
      }

      const blob = new Blob(parts, { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'projects.sqlite';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setProgress('exportProgressBar', 'exportProgressText', 1, `Export complete (${formatBytes(total)})`);
      notifySuccess('SQLite DB exported (download started).');
    } catch (e) {
      console.error('downloadSqliteDb error:', e);
      notifyError('Failed to export DB.');
      setProgress('exportProgressBar', 'exportProgressText', 0, 'Export failed');
    }
  };

  window.importSqliteDb = async function() {
    try {
      if (!isDbReady || !window.DB || !window.DB.importDatabaseBytes) {
        notifyError('DB not initialized');
        return;
      }
      const input = document.getElementById('importDbFile');
      const file = input && input.files ? input.files[0] : null;
      if (!file) {
        notifyError('Select a .sqlite database file to import.');
        return;
      }

      const quotaInfo = await checkStorageQuota(file.size);
      if (quotaInfo.supported && quotaInfo.quota && quotaInfo.projected > quotaInfo.quota) {
        notifyError('Import exceeds browser storage quota.');
        return;
      }

      const buffer = await readFileAsArrayBufferWithProgress(file, (fraction) => {
        setProgress('importProgressBar', 'importProgressText', fraction, `Importing DB... ${Math.round(fraction * 100)}%`);
      });

      const ok = await window.DB.importDatabaseBytes(buffer);
      if (!ok) {
        notifyError('DB import failed. File may be invalid.');
        setProgress('importProgressBar', 'importProgressText', 0, 'Import failed');
        return;
      }

      setProgress('importProgressBar', 'importProgressText', 1, `Import complete (${formatBytes(file.size)})`);
      await refreshQuotaWarning(0);
      await loadProjectsFromDB();
      notifySuccess('Database imported successfully.');
      if (input) input.value = '';
    } catch (e) {
      console.error('importSqliteDb error:', e);
      notifyError('DB import failed.');
      setProgress('importProgressBar', 'importProgressText', 0, 'Import failed');
    }
  };

  window.importProjectZip = async function() {
    const savedFileIds = [];
    const zipInput = document.getElementById('projectZipFile');
    const selectedZip = zipInput && zipInput.files ? zipInput.files[0] : null;
    if (!selectedZip) {
      notifyError('Select a ZIP file to import as a project.');
      return;
    }

    try {
      const adminUploadPanel = document.getElementById('adminUpload');
      const isLoggedIn = window.isAdminLoggedIn === true || (adminUploadPanel && !adminUploadPanel.classList.contains('hidden'));
      if (!isLoggedIn) {
        notifyError('Admin access required. Please log in first.');
        return;
      }
      if (!isDbReady || !window.DB || !window.DB.saveFileBlob || !window.DB.addProject) {
        notifyError('Local DB is not ready yet.');
        return;
      }
      if (typeof JSZip === 'undefined') {
        notifyError('JSZip not loaded. Please check network and reload.');
        return;
      }

      await buildZipPreview(selectedZip);
      const includedNames = new Set((zipPreviewState.entries || []).filter(e => e.include).map(e => e.name));
      if (includedNames.size === 0) {
        notifyError('No ZIP files selected. Use include toggles in preview.');
        setProgress('zipImportProgressBar', 'zipImportProgressText', 0, 'ZIP import canceled');
        return;
      }

      const quotaInfo = await checkStorageQuota(selectedZip.size * 3);
      if (quotaInfo.supported && quotaInfo.quota && quotaInfo.projected > quotaInfo.quota) {
        notifyError('ZIP import likely exceeds browser storage quota.');
        return;
      }

      setProgress('zipImportProgressBar', 'zipImportProgressText', 0.02, 'Reading ZIP file...');
      const zipBuffer = await readFileAsArrayBufferWithProgress(selectedZip, (fraction) => {
        setProgress('zipImportProgressBar', 'zipImportProgressText', fraction * 0.35, `Reading ZIP... ${Math.round(fraction * 100)}%`);
      });

      const zip = await JSZip.loadAsync(zipBuffer);
      const entries = Object.values(zip.files).filter((entry) => !entry.dir && includedNames.has(entry.name));
      if (entries.length === 0) {
        notifyError('ZIP has no importable files.');
        setProgress('zipImportProgressBar', 'zipImportProgressText', 0, 'ZIP import failed');
        return;
      }

      const typedTitle = document.getElementById('projectTitle')?.value?.trim();
      const title = typedTitle || selectedZip.name.replace(/\.zip$/i, '');
      const type = document.getElementById('projectType')?.value || 'Software Project';
      const uploadedFiles = [];

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const blob = await entry.async('blob', (metadata) => {
          const entryPart = (metadata.percent || 0) / 100;
          const overall = 0.35 + ((i + entryPart) / entries.length) * 0.55;
          setProgress('zipImportProgressBar', 'zipImportProgressText', overall, `Importing ${entry.name} (${Math.round(entryPart * 100)}%)`);
        });

        const safeFile = new File([blob], entry.name, { type: blob.type || 'application/octet-stream' });
        let hashOrFlag = null;
        if (safeFile.size > 150 * 1024 * 1024) {
          hashOrFlag = 'NO_HASH';
        } else {
          hashOrFlag = await computeHashWithProgress(safeFile, () => {});
        }

        const fileId = await window.DB.saveFileBlob(safeFile, hashOrFlag);
        if (!fileId) {
          throw new Error(`Failed to save file ${entry.name}`);
        }

        savedFileIds.push(fileId);
        window.__lastZipImportSavedIds = savedFileIds;
        uploadedFiles.push({
          name: entry.name,
          size: safeFile.size,
          type: safeFile.type || 'application/octet-stream',
          fileId
        });
      }

      const projectData = {
        title,
        type,
        description: `Imported from ZIP package: ${selectedZip.name}`,
        files: uploadedFiles,
        uploadedAt: new Date().toISOString()
      };

      const added = await window.DB.addProject(projectData);
      if (!added) {
        throw new Error('Failed to create project from ZIP');
      }

      setProgress('zipImportProgressBar', 'zipImportProgressText', 1, `ZIP import complete (${entries.length} files)`);
      if (zipInput) zipInput.value = '';
      await renderAllProjects(document.getElementById('projectSearchInput')?.value?.trim() || '');
      await refreshQuotaWarning(0);
      notifySuccess(`ZIP imported successfully as project "${title}".`);
    } catch (error) {
      console.error('importProjectZip error:', error);
      setProgress('zipImportProgressBar', 'zipImportProgressText', 0, 'ZIP import failed. Rolling back...');

      try {
        for (const id of savedFileIds) {
          if (window.DB && window.DB.decrementFileRef) {
            await window.DB.decrementFileRef(id);
          }
        }
      } catch (rollbackErr) {
        console.error('ZIP rollback error:', rollbackErr);
      }

      notifyError('ZIP import failed and rollback attempted.');
    } finally {
      window.__lastZipImportSavedIds = [];
    }
  };

  function readFileAsArrayBufferWithProgress(file, onProgress) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
      reader.onprogress = (evt) => {
        if (evt.lengthComputable && onProgress) {
          onProgress(evt.loaded / evt.total);
        }
      };
      reader.onload = () => {
        if (onProgress) onProgress(1);
        resolve(reader.result);
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // Run initial load
  document.addEventListener('DOMContentLoaded', () => {
    setDbUiState(false, 'Local DB initializing...');

    const projectSearchInput = document.getElementById('projectSearchInput');
    const projectSearchBtn = document.getElementById('projectSearchBtn');
    const manageSearchInput = document.getElementById('manageSearchInput');
    const importDbBtn = document.getElementById('importDbBtn');
    const importProjectZipBtn = document.getElementById('importProjectZipBtn');
    const projectZipDropZone = document.getElementById('projectZipDropZone');
    const projectZipFile = document.getElementById('projectZipFile');
    const zipIncludeAllBtn = document.getElementById('zipIncludeAllBtn');
    const zipExcludeAllBtn = document.getElementById('zipExcludeAllBtn');
    const zipPreviewFilterInput = document.getElementById('zipPreviewFilterInput');

    if (projectSearchInput) {
      projectSearchInput.addEventListener('input', async () => {
        await renderAllProjects(projectSearchInput.value.trim());
      });
      projectSearchInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          await renderAllProjects(projectSearchInput.value.trim());
        }
      });
    }

    if (projectSearchBtn) {
      projectSearchBtn.addEventListener('click', async () => {
        await renderAllProjects(projectSearchInput?.value?.trim() || '');
      });
    }

    if (manageSearchInput) {
      manageSearchInput.addEventListener('input', async () => {
        await refreshManagePanel();
      });
    }

    if (importDbBtn) {
      importDbBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await window.importSqliteDb();
      });
    }

    if (importProjectZipBtn) {
      importProjectZipBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        window.__lastZipImportSavedIds = [];
        await window.importProjectZip();
      });
    }

    if (projectZipFile) {
      projectZipFile.addEventListener('change', async () => {
        const f = projectZipFile.files && projectZipFile.files[0];
        if (!f) return;
        if (!f.name.toLowerCase().endsWith('.zip')) {
          notifyError('Only .zip files are supported for ZIP import.');
          return;
        }
        try {
          await buildZipPreview(f);
        } catch (e) {
          console.error('ZIP preview error:', e);
          notifyError('Failed to preview ZIP contents.');
          setProgress('zipImportProgressBar', 'zipImportProgressText', 0, 'Preview failed');
        }
      });
    }

    if (zipIncludeAllBtn) {
      zipIncludeAllBtn.addEventListener('click', (e) => {
        e.preventDefault();
        setZipPreviewAll(true);
      });
    }

    if (zipExcludeAllBtn) {
      zipExcludeAllBtn.addEventListener('click', (e) => {
        e.preventDefault();
        setZipPreviewAll(false);
      });
    }

    if (zipPreviewFilterInput) {
      zipPreviewFilterInput.addEventListener('input', () => {
        zipPreviewFilter = zipPreviewFilterInput.value || '';
        renderZipPreviewTable();
      });
    }

    if (projectZipDropZone && projectZipFile) {
      ['dragenter', 'dragover'].forEach(evt => {
        projectZipDropZone.addEventListener(evt, (e) => {
          e.preventDefault();
          projectZipDropZone.classList.add('border-blue-500', 'bg-blue-100');
        });
      });

      ['dragleave', 'drop'].forEach(evt => {
        projectZipDropZone.addEventListener(evt, (e) => {
          e.preventDefault();
          projectZipDropZone.classList.remove('border-blue-500', 'bg-blue-100');
        });
      });

      projectZipDropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;
        const first = files[0];
        if (!first.name.toLowerCase().endsWith('.zip')) {
          notifyError('Only .zip files are accepted in the drop zone.');
          return;
        }
        const dt = new DataTransfer();
        dt.items.add(first);
        projectZipFile.files = dt.files;
        setProgress('zipImportProgressBar', 'zipImportProgressText', 0, `Ready: ${first.name}`);
        buildZipPreview(first).catch((err) => {
          console.error('ZIP preview error:', err);
          notifyError('Failed to preview dropped ZIP contents.');
        });
      });
    }

    const uploadBtn = document.getElementById('uploadProjectBtn');
    if (uploadBtn) {
      const cloned = uploadBtn.cloneNode(true);
      uploadBtn.parentNode.replaceChild(cloned, uploadBtn);
      cloned.addEventListener('click', async (e) => {
        e.preventDefault();
        await window.addProject();
      });
    }

    Promise.resolve(window.sqliteReady)
      .then(async (ok) => {
        isDbReady = ok === true && !!window.DB;
        if (!isDbReady) {
          setDbUiState(false, 'Local DB failed to initialize');
          notifyError('Local DB failed to initialize. Check network and reload.');
          return;
        }
        setDbUiState(true);
        await refreshQuotaWarning(0);
        await loadProjectsFromDB();
      })
      .catch((err) => {
        console.error('sqliteReady failure:', err);
        isDbReady = false;
        setDbUiState(false, 'Local DB failed to initialize');
        notifyError('Local DB failed to initialize. Check network and reload.');
      });
  });

})();
