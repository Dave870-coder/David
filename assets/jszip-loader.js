// assets/jszip-loader.js
// Loads JSZip into the page and caches it in IndexedDB (store 'libs' / key 'jszip') for offline reuse.
(async function(){
  const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js';
  function openIDB(){
    return new Promise((resolve,reject)=>{
      const r = indexedDB.open('local-sqlite-store',1);
      r.onupgradeneeded = e=>{
        const idb = e.target.result;
        if(!idb.objectStoreNames.contains('libs')) idb.createObjectStore('libs');
      };
      r.onsuccess = ()=>resolve(r.result);
      r.onerror = ()=>reject(r.error||new Error('idb open failed'));
    });
  }
  async function idbGet(key){
    const idb = await openIDB();
    return new Promise((resolve,reject)=>{
      const tx = idb.transaction('libs','readonly');
      const os = tx.objectStore('libs');
      const req = os.get(key);
      req.onsuccess = ()=>resolve(req.result);
      req.onerror = ()=>reject(req.error);
    });
  }
  async function idbPut(key, val){
    const idb = await openIDB();
    return new Promise((resolve,reject)=>{
      const tx = idb.transaction('libs','readwrite');
      const os = tx.objectStore('libs');
      const req = os.put(val,key);
      req.onsuccess = ()=>resolve(true);
      req.onerror = ()=>reject(req.error);
    });
  }

  try {
    const cached = await idbGet('jszip');
    if(cached){
      try{ eval(cached); return; }catch(e){ console.warn('eval cached jszip failed', e); }
    }
    // fetch from CDN then cache
    const res = await fetch(CDN);
    if(!res.ok) throw new Error('Failed to fetch JSZip');
    const text = await res.text();
    try{ eval(text); }catch(e){ console.error('eval jszip failed', e); }
    try{ await idbPut('jszip', text); }catch(e){ console.warn('caching jszip failed', e); }
  } catch (e) {
    console.error('jszip-loader error', e);
  }
})();
