/**
 * =========================================================================
 * Offline Mode & Auto-Sync Queue Engine
 * =========================================================================
 * Manages network listeners, IndexedDB pending queue, auto-syncing with
 * Google Apps Script Web App, retry backoff, and live top-bar status badges.
 */

class SyncManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.isSyncing = false;
    this.scriptUrl = '';
    this.pendingCount = 0;
    this.listeners = [];
  }

  /**
   * Initialize sync listeners and fetch configured URL
   */
  async init() {
    this.scriptUrl = await window.fleetDB.getSetting('script_url', '');
    this.setupNetworkListeners();
    await this.updatePendingCount();

    // Auto-sync if online and configured
    if (this.isOnline && this.scriptUrl && this.pendingCount > 0) {
      setTimeout(() => this.syncPendingQueue(), 1500);
    }
  }

  /**
   * Add listener for sync status updates
   */
  subscribe(callback) {
    this.listeners.push(callback);
  }

  notifyListeners(event, data) {
    this.listeners.forEach((cb) => {
      try {
        cb(event, data);
      } catch (e) {
        console.error('Sync listener error:', e);
      }
    });
  }

  /**
   * Setup window online/offline listeners
   */
  setupNetworkListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.updateStatusBadge();
      console.log('Network status: ONLINE. Checking pending queue...');
      this.syncPendingQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.updateStatusBadge();
      console.log('Network status: OFFLINE. Offline queuing active.');
    });

    // Manual sync button in top bar and elsewhere
    const syncButtons = document.querySelectorAll('.btn-sync-trigger');
    syncButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.syncPendingQueue(true);
      });
    });
  }

  /**
   * Update pending count from IndexedDB
   */
  async updatePendingCount() {
    try {
      const pending = await window.fleetDB.getPendingEntries();
      this.pendingCount = pending.length;
      this.updateStatusBadge();
      return this.pendingCount;
    } catch (e) {
      console.error('Error counting pending entries:', e);
      return 0;
    }
  }

  /**
   * Update top-bar network and sync badge
   */
  updateStatusBadge() {
    const badge = document.getElementById('badge-sync-status');
    const dot = document.getElementById('sync-status-dot');
    const text = document.getElementById('sync-status-text');

    if (!badge || !text) return;

    if (this.isSyncing) {
      badge.className = 'px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center gap-1.5 cursor-pointer';
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-blue-400 animate-pulse';
      text.textContent = `Syncing (${this.pendingCount})...`;
      return;
    }

    if (!this.isOnline) {
      badge.className = 'px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1.5 cursor-pointer';
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-400';
      text.textContent = `Offline (${this.pendingCount} Pending)`;
      return;
    }

    if (!this.scriptUrl) {
      badge.className = 'px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30 flex items-center gap-1.5 cursor-pointer';
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-slate-400';
      text.textContent = 'Set Sheets URL';
      return;
    }

    if (this.pendingCount > 0) {
      badge.className = 'px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1.5 cursor-pointer hover:bg-amber-500/25';
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse';
      text.textContent = `${this.pendingCount} Pending Sync`;
    } else {
      badge.className = 'px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 cursor-pointer';
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
      text.textContent = 'Online • Synced';
    }
  }

  /**
   * Set Google Apps Script Web App URL
   */
  async setScriptUrl(url) {
    const cleanUrl = String(url || '').trim();
    this.scriptUrl = cleanUrl;
    await window.fleetDB.setSetting('script_url', cleanUrl);
    await this.updatePendingCount();
    return cleanUrl;
  }

  /**
   * Push all pending entries to Google Sheets
   */
  async syncPendingQueue(isUserInitiated = false) {
    if (this.isSyncing) {
      console.log('Sync already in progress...');
      return { success: false, message: 'Sync in progress' };
    }

    if (!this.isOnline) {
      if (isUserInitiated) alert('You are currently OFFLINE. Entries are safely queued in IndexedDB and will sync once network is restored.');
      return { success: false, message: 'Offline' };
    }

    if (!this.scriptUrl) {
      if (isUserInitiated) {
        alert('Please configure your Google Apps Script Web App URL in Settings first.');
        document.getElementById('modal-settings')?.classList.remove('hidden');
      }
      return { success: false, message: 'No script URL' };
    }

    const pending = await window.fleetDB.getPendingEntries();
    if (!pending.length) {
      await this.updatePendingCount();
      if (isUserInitiated) {
        this.showToast('All entries are already synced to Google Sheets!');
      }
      return { success: true, count: 0 };
    }

    this.isSyncing = true;
    this.updateStatusBadge();
    this.notifyListeners('sync-start', { count: pending.length });

    try {
      // Prepare text-only payload (Photos are NEVER sent to Sheets)
      const cleanEntries = pending.map((e) => ({
        id: e.id,
        s_no: e.s_no,
        date: e.date,
        gate_out_time: e.gate_out_time,
        uc_no: e.uc_no,
        vehicle_type: e.vehicle_type,
        vehicle_number: e.vehicle_number,
        driver_name: e.driver_name,
        helper_name: e.helper_name,
        trips: e.trips
      }));

      const payload = {
        action: 'syncBatch',
        entries: cleanEntries
      };

      // Send to Apps Script using text/plain to avoid mobile preflight CORS blocks
      const response = await fetch(this.scriptUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const resData = await response.json();

      if (resData.status === 'success') {
        const syncedIds = resData.syncedIds || cleanEntries.map((e) => e.id);
        await window.fleetDB.markEntriesSynced(syncedIds);
        await this.updatePendingCount();
        this.notifyListeners('sync-complete', { count: syncedIds.length });

        this.showToast(`Synced ${syncedIds.length} entries to Google Sheets!`);
        return { success: true, count: syncedIds.length };
      } else {
        throw new Error(resData.message || 'Unknown server response');
      }
    } catch (err) {
      console.error('Batch sync failed:', err);
      this.notifyListeners('sync-error', { error: err.message });
      if (isUserInitiated) {
        alert(`Sync failed: ${err.message}\nEntries remain safely queued in local storage.`);
      }
      return { success: false, error: err.message };
    } finally {
      this.isSyncing = false;
      await this.updatePendingCount();
    }
  }

  /**
   * Sync a single entry immediately (called right after saving in form if online)
   */
  async syncSingleEntry(entry) {
    if (!this.isOnline || !this.scriptUrl) {
      // Safely queued as Pending
      await this.updatePendingCount();
      return { queued: true };
    }

    try {
      const payload = {
        action: 'addEntry',
        entry: {
          id: entry.id,
          s_no: entry.s_no,
          date: entry.date,
          gate_out_time: entry.gate_out_time,
          uc_no: entry.uc_no,
          vehicle_type: entry.vehicle_type,
          vehicle_number: entry.vehicle_number,
          driver_name: entry.driver_name,
          helper_name: entry.helper_name,
          trips: entry.trips
        }
      };

      const response = await fetch(this.scriptUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const resData = await response.json();
        if (resData.status === 'success') {
          await window.fleetDB.markEntriesSynced([entry.id]);
          await this.updatePendingCount();
          this.notifyListeners('entry-synced', { id: entry.id });
          return { success: true, synced: true };
        }
      }
    } catch (e) {
      console.warn('Single sync deferred to queue:', e);
    }

    await this.updatePendingCount();
    return { queued: true };
  }

  /**
   * Test connection to Google Apps Script Web App
   */
  async testConnection(url) {
    const targetUrl = url || this.scriptUrl;
    if (!targetUrl) {
      return { success: false, message: 'Please enter a URL to test.' };
    }

    const startTime = Date.now();
    try {
      // Use GET with action=ping
      const pingUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + 'action=ping';
      const response = await fetch(pingUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      const latency = Date.now() - startTime;

      if (!response.ok) {
        return { success: false, message: `Server returned HTTP ${response.status}`, latency };
      }

      const data = await response.json();
      return {
        success: data.status === 'success',
        message: data.message || 'Connected successfully',
        spreadsheetName: data.spreadsheetName || 'District Malir Fleet Workbook',
        todayTab: data.todayTab || 'N/A',
        latency
      };
    } catch (err) {
      // Fallback: try POST ping in case GET is restricted
      try {
        const postResp = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'ping' })
        });
        const latency = Date.now() - startTime;
        const data = await postResp.json();
        return {
          success: data.status === 'success',
          message: 'Connected successfully via POST',
          latency
        };
      } catch (postErr) {
        return {
          success: false,
          message: `Connection failed: ${err.message}. Check deployment permissions ("Anyone").`,
          latency: Date.now() - startTime
        };
      }
    }
  }

  showToast(msg) {
    const toast = document.getElementById('grid-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('opacity-0', 'pointer-events-none');
    setTimeout(() => {
      toast.classList.add('opacity-0', 'pointer-events-none');
    }, 2500);
  }
}

window.syncManager = new SyncManager();
