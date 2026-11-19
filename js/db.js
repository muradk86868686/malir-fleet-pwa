/**
 * =========================================================================
 * IndexedDB Database Layer - Malir Fleet Gate Exit System
 * =========================================================================
 * Provides persistent local storage for fleet exit entries, photo thumbnails,
 * draft snaps (for rapid gate-rush snapping), crew auto-learning, and settings.
 */

const DB_NAME = 'MalirFleetGateDB';
const DB_VERSION = 2; // Upgraded for draft snaps support

class FleetDatabase {
  constructor() {
    this.db = null;
    this.initPromise = null;
  }

  async init() {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Entries store
        if (!db.objectStoreNames.contains('entries')) {
          const entryStore = db.createObjectStore('entries', { keyPath: 'id' });
          entryStore.createIndex('date', 'date', { unique: false });
          entryStore.createIndex('vehicle_number', 'vehicle_number', { unique: false });
          entryStore.createIndex('sync_status', 'sync_status', { unique: false });
          entryStore.createIndex('created_at', 'created_at', { unique: false });
          entryStore.createIndex('date_vehicle', ['date', 'vehicle_number'], { unique: false });
        }

        // 2. Photos store
        if (!db.objectStoreNames.contains('photos')) {
          db.createObjectStore('photos', { keyPath: 'id' });
        }

        // 3. Draft Snaps store (for Rapid Snap & Relax Later workflow)
        if (!db.objectStoreNames.contains('draft_snaps')) {
          const draftStore = db.createObjectStore('draft_snaps', { keyPath: 'id' });
          draftStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // 4. Crew Learning store
        if (!db.objectStoreNames.contains('crew_learning')) {
          db.createObjectStore('crew_learning', { keyPath: 'vehicle_number' });
        }

        // 5. Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open error:', event.target.error);
        reject(event.target.error);
      };
    });

    return this.initPromise;
  }

  async addEntry(entry, photoBlob = null, thumbnailDataUrl = null) {
    const db = await this.init();
    const entryId = entry.id || `entry_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const fullEntry = {
      ...entry,
      id: entryId,
      has_photo: Boolean(photoBlob || thumbnailDataUrl),
      thumbnail: thumbnailDataUrl || null,
      sync_status: entry.sync_status || 'Pending',
      created_at: entry.created_at || Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(['entries', 'photos', 'crew_learning'], 'readwrite');
      const entryStore = tx.objectStore('entries');
      const photoStore = tx.objectStore('photos');
      const crewStore = tx.objectStore('crew_learning');

      entryStore.put(fullEntry);

      if (photoBlob || thumbnailDataUrl) {
        photoStore.put({
          id: entryId,
          vehicle_number: fullEntry.vehicle_number,
          date: fullEntry.date,
          thumbnail: thumbnailDataUrl,
          full_blob: photoBlob,
          created_at: fullEntry.created_at
        });
      }

      if (fullEntry.vehicle_number) {
        crewStore.put({
          vehicle_number: String(fullEntry.vehicle_number).trim(),
          driver: fullEntry.driver_name || '',
          helper: fullEntry.helper_name || '',
          uc: fullEntry.uc_no || '',
          vehicle_type: fullEntry.vehicle_type || '',
          last_updated: Date.now()
        });
      }

      tx.oncomplete = () => resolve(fullEntry);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // Draft snaps methods for Rapid Snap workflow
  async addDraftSnap(rawBlob, thumbnailDataUrl, timestamp = Date.now()) {
    const db = await this.init();
    const id = `snap_${timestamp}_${Math.random().toString(36).substr(2, 5)}`;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['draft_snaps'], 'readwrite');
      const store = tx.objectStore('draft_snaps');
      const record = { id, raw_blob: rawBlob, thumbnail: thumbnailDataUrl, timestamp };
      store.put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async getDraftSnaps() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['draft_snaps'], 'readonly');
      const store = tx.objectStore('draft_snaps');
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => b.timestamp - a.timestamp); // newest first
        resolve(list);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteDraftSnap(id) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['draft_snaps'], 'readwrite');
      const store = tx.objectStore('draft_snaps');
      store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async getEntriesByDate(dateStr) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['entries'], 'readonly');
      const store = tx.objectStore('entries');
      const index = store.index('date');
      const request = index.getAll(IDBKeyRange.only(dateStr));

      request.onsuccess = () => {
        const list = request.result || [];
        list.sort((a, b) => (a.s_no || 0) - (b.s_no || 0));
        resolve(list);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getAllEntries() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['entries'], 'readonly');
      const store = tx.objectStore('entries');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getPendingEntries() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['entries'], 'readonly');
      const store = tx.objectStore('entries');
      const index = store.index('sync_status');
      const request = index.getAll(IDBKeyRange.only('Pending'));

      request.onsuccess = () => {
        const list = request.result || [];
        list.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
        resolve(list);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async markEntriesSynced(ids) {
    if (!ids || !ids.length) return;
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['entries'], 'readwrite');
      const store = tx.objectStore('entries');

      ids.forEach((id) => {
        const req = store.get(id);
        req.onsuccess = () => {
          if (req.result) {
            const updated = {
              ...req.result,
              sync_status: 'Synced',
              synced_at: Date.now()
            };
            store.put(updated);
          }
        };
      });

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async getPhoto(entryId) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['photos'], 'readonly');
      const store = tx.objectStore('photos');
      const request = store.get(entryId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getTodayEntriesForVehicle(dateStr, vehicleNumber) {
    const vNum = String(vehicleNumber || '').trim();
    if (!vNum) return [];

    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['entries'], 'readonly');
      const store = tx.objectStore('entries');
      const index = store.index('date_vehicle');
      const request = index.getAll(IDBKeyRange.only([dateStr, vNum]));

      request.onsuccess = () => {
        const list = request.result || [];
        resolve(list);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getNextDailySerial(dateStr) {
    const entries = await this.getEntriesByDate(dateStr);
    if (!entries || entries.length === 0) {
      return 1;
    }
    const maxSerial = entries.reduce((max, e) => Math.max(max, e.s_no || 0), 0);
    return maxSerial + 1;
  }

  async getCrewLearning(vehicleNumber) {
    const vNum = String(vehicleNumber || '').trim();
    if (!vNum) return null;

    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['crew_learning'], 'readonly');
      const store = tx.objectStore('crew_learning');
      const request = store.get(vNum);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getSetting(key, defaultValue = null) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['settings'], 'readonly');
      const store = tx.objectStore('settings');
      const request = store.get(key);

      request.onsuccess = () => {
        if (request.result && request.result.value !== undefined) {
          resolve(request.result.value);
        } else {
          resolve(defaultValue);
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async setSetting(key, value) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['settings'], 'readwrite');
      const store = tx.objectStore('settings');
      const request = store.put({ key, value, updated_at: Date.now() });

      request.onsuccess = () => resolve(value);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async exportBackup() {
    const entries = await this.getAllEntries();
    return {
      exported_at: new Date().toISOString(),
      app: 'District Malir Fleet Gate Exit PWA',
      version: '2.0',
      total_entries: entries.length,
      entries: entries
    };
  }
}

window.fleetDB = new FleetDatabase();
