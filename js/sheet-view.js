/**
 * =========================================================================
 * Today's Sheet View & Pending Vehicles Drawer Controller
 * =========================================================================
 * Live spreadsheet table of today's exits, photo viewer modal, clean CSV export
 * (NO sync status column, manual trips), and the Pending Vehicles drawer
 * updated for the exact 155 District Malir fleet.
 */

class SheetViewController {
  constructor() {
    this.currentDateStr = this.getTodayDateString();
    this.allEntriesToday = [];
    this.filteredEntries = [];
    this.vehiclesMaster = [];
    this.filterType = 'all';
    this.searchQuery = '';
    this.pendingFilterType = 'all';
    this.pendingSearchQuery = '';
  }

  getTodayDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async init() {
    await this.loadVehiclesMaster();
    this.setupListeners();
    await this.renderTodaySheet();
  }

  async loadVehiclesMaster() {
    if (window.entryGridController && window.entryGridController.vehiclesMaster.length) {
      this.vehiclesMaster = window.entryGridController.vehiclesMaster;
    } else {
      try {
        const resp = await fetch('./vehicles_master.json');
        const data = await resp.json();
        this.vehiclesMaster = data.vehicles || [];
      } catch (e) {
        console.error('Failed to load vehicles master for sheet view:', e);
      }
    }
  }

  setupListeners() {
    const searchInput = document.getElementById('sheet-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.applyFilterAndRender();
      });
    }

    const filterPills = document.querySelectorAll('.sheet-filter-pill');
    filterPills.forEach((pill) => {
      pill.addEventListener('click', (e) => {
        filterPills.forEach((p) => {
          p.classList.remove('bg-blue-600', 'text-white', 'dark:bg-blue-500');
          p.classList.add('bg-slate-200', 'text-slate-700', 'dark:bg-slate-800', 'dark:text-slate-300');
        });
        pill.classList.remove('bg-slate-200', 'text-slate-700', 'dark:bg-slate-800', 'dark:text-slate-300');
        pill.classList.add('bg-blue-600', 'text-white', 'dark:bg-blue-500');

        this.filterType = pill.getAttribute('data-filter') || 'all';
        this.applyFilterAndRender();
      });
    });

    const exportBtn = document.getElementById('btn-export-csv');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportTodayCSV());
    }

    const openPendingBtn = document.getElementById('btn-open-pending-drawer');
    const closePendingBtn = document.getElementById('btn-close-pending-drawer');
    const drawerBackdrop = document.getElementById('pending-drawer-backdrop');

    if (openPendingBtn) {
      openPendingBtn.addEventListener('click', () => this.openPendingDrawer());
    }
    if (closePendingBtn) {
      closePendingBtn.addEventListener('click', () => this.closePendingDrawer());
    }
    if (drawerBackdrop) {
      drawerBackdrop.addEventListener('click', () => this.closePendingDrawer());
    }

    const pendingSearch = document.getElementById('pending-search-input');
    if (pendingSearch) {
      pendingSearch.addEventListener('input', (e) => {
        this.pendingSearchQuery = e.target.value.toLowerCase().trim();
        this.renderPendingVehiclesList();
      });
    }

    const pendingPills = document.querySelectorAll('.pending-filter-pill');
    pendingPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        pendingPills.forEach((p) => {
          p.classList.remove('bg-emerald-600', 'text-white', 'dark:bg-emerald-500');
          p.classList.add('bg-slate-200', 'text-slate-700', 'dark:bg-slate-800', 'dark:text-slate-300');
        });
        pill.classList.remove('bg-slate-200', 'text-slate-700', 'dark:bg-slate-800', 'dark:text-slate-300');
        pill.classList.add('bg-emerald-600', 'text-white', 'dark:bg-emerald-500');

        this.pendingFilterType = pill.getAttribute('data-pending-filter') || 'all';
        this.renderPendingVehiclesList();
      });
    });

    if (window.syncManager) {
      window.syncManager.subscribe((event) => {
        if (event === 'sync-complete' || event === 'entry-synced') {
          this.renderTodaySheet();
        }
      });
    }

    const closePhotoModal = document.getElementById('btn-close-photo-modal');
    const photoModal = document.getElementById('modal-photo-viewer');
    if (closePhotoModal && photoModal) {
      closePhotoModal.addEventListener('click', () => photoModal.classList.add('hidden'));
      photoModal.addEventListener('click', (e) => {
        if (e.target === photoModal) photoModal.classList.add('hidden');
      });
    }
  }

  async renderTodaySheet() {
    this.currentDateStr = this.getTodayDateString();
    this.allEntriesToday = await window.fleetDB.getEntriesByDate(this.currentDateStr);

    this.updateHeaderSummary();
    this.applyFilterAndRender();
    this.updatePendingCountBadge();
  }

  updateHeaderSummary() {
    const totalCountEl = document.getElementById('sheet-count-total');
    const syncedCountEl = document.getElementById('sheet-count-synced');
    const pendingCountEl = document.getElementById('sheet-count-pending');

    const total = this.allEntriesToday.length;
    const synced = this.allEntriesToday.filter((e) => e.sync_status === 'Synced').length;
    const pending = total - synced;

    if (totalCountEl) totalCountEl.textContent = total;
    if (syncedCountEl) syncedCountEl.textContent = synced;
    if (pendingCountEl) pendingCountEl.textContent = pending;
  }

  applyFilterAndRender() {
    let list = [...this.allEntriesToday];

    if (this.filterType === 'petroleum') {
      list = list.filter((e) => e.vehicle_type === 'Petroleum');
    } else if (this.filterType === 'ev') {
      list = list.filter((e) => e.vehicle_type !== 'Petroleum');
    } else if (this.filterType === 'pending') {
      list = list.filter((e) => e.sync_status === 'Pending');
    }

    if (this.searchQuery) {
      list = list.filter((e) => {
        const vNum = String(e.vehicle_number || '').toLowerCase();
        const driver = String(e.driver_name || '').toLowerCase();
        const uc = String(e.uc_no || '').toLowerCase();
        const helper = String(e.helper_name || '').toLowerCase();
        return vNum.includes(this.searchQuery) || driver.includes(this.searchQuery) || uc.includes(this.searchQuery) || helper.includes(this.searchQuery);
      });
    }

    this.filteredEntries = list;
    this.renderTable(list);
  }

  renderTable(entries) {
    const tbody = document.getElementById('today-sheet-tbody');
    const emptyState = document.getElementById('sheet-empty-state');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!entries.length) {
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }
    if (emptyState) emptyState.classList.add('hidden');

    entries.forEach((entry) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-xs sm:text-sm';

      const isSynced = entry.sync_status === 'Synced';
      const statusBadge = isSynced
        ? '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400">Synced</span>'
        : '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400">Pending</span>';

      let typeBadgeClass = 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
      if (entry.vehicle_type === 'Electric') {
        typeBadgeClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
      } else if (entry.vehicle_type === 'Small EV') {
        typeBadgeClass = 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
      }

      let thumbHtml = '<div class="w-8 h-8 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-400 text-xs">📷</div>';
      if (entry.thumbnail) {
        thumbHtml = `<img src="${entry.thumbnail}" alt="Thumb" class="w-9 h-9 object-cover rounded shadow-sm border border-slate-300 dark:border-slate-700 cursor-pointer hover:scale-105 transition-transform" data-photo-id="${entry.id}">`;
      }

      let displayTime = entry.gate_out_time || '-';
      if (displayTime.includes(' ')) {
        const parts = displayTime.split(' ');
        if (parts.length >= 3) {
          displayTime = `${parts[1]} ${parts[2]}`;
        }
      }

      // Display trips if user typed it, otherwise empty dash
      const displayTrips = (entry.trips && String(entry.trips).trim() !== '') ? entry.trips : '-';

      tr.innerHTML = `
        <td class="px-2.5 py-2 text-center font-bold text-slate-500 dark:text-slate-400">${entry.s_no}</td>
        <td class="px-2 py-2 text-center">${statusBadge}</td>
        <td class="px-2 py-2 text-center photo-thumb-cell">${thumbHtml}</td>
        <td class="px-2.5 py-2 whitespace-nowrap font-medium text-slate-700 dark:text-slate-300">${displayTime}</td>
        <td class="px-2.5 py-2 font-bold text-slate-900 dark:text-white">${entry.vehicle_number}</td>
        <td class="px-2.5 py-2 whitespace-nowrap"><span class="px-2 py-0.5 rounded-full text-xs font-semibold ${typeBadgeClass}">${entry.vehicle_type}</span></td>
        <td class="px-2.5 py-2 text-slate-800 dark:text-slate-200">${entry.uc_no || '-'}</td>
        <td class="px-2.5 py-2 text-slate-700 dark:text-slate-300">${entry.driver_name || '-'}</td>
        <td class="px-2.5 py-2 text-slate-600 dark:text-slate-400">${entry.helper_name || '-'}</td>
        <td class="px-2.5 py-2 text-center font-bold text-slate-800 dark:text-slate-200">${displayTrips}</td>
      `;

      const thumbImg = tr.querySelector('img[data-photo-id]');
      if (thumbImg) {
        thumbImg.addEventListener('click', () => {
          this.viewFullPhoto(entry.id, entry);
        });
      }

      tbody.appendChild(tr);
    });
  }

  async viewFullPhoto(entryId, entry) {
    const modal = document.getElementById('modal-photo-viewer');
    const imgEl = document.getElementById('modal-photo-img');
    const titleEl = document.getElementById('modal-photo-title');
    const detailsEl = document.getElementById('modal-photo-details');
    const downloadBtn = document.getElementById('btn-download-modal-photo');

    if (!modal || !imgEl) return;

    titleEl.textContent = `Gate Exit Photo: Vehicle #${entry.vehicle_number}`;
    detailsEl.textContent = `${entry.gate_out_time} | UC: ${entry.uc_no} | Driver: ${entry.driver_name} | Helper: ${entry.helper_name}`;

    const photoData = await window.fleetDB.getPhoto(entryId);
    let photoUrl = '';

    if (photoData && photoData.full_blob) {
      photoUrl = URL.createObjectURL(photoData.full_blob);
    } else if (photoData && photoData.thumbnail) {
      photoUrl = photoData.thumbnail;
    } else if (entry.thumbnail) {
      photoUrl = entry.thumbnail;
    }

    if (photoUrl) {
      imgEl.src = photoUrl;
      modal.classList.remove('hidden');

      if (downloadBtn) {
        downloadBtn.onclick = () => {
          const a = document.createElement('a');
          a.href = photoUrl;
          a.download = `${entry.date}_${entry.vehicle_number}_photo.jpg`;
          a.click();
        };
      }
    } else {
      alert('Photo is not available in local storage.');
    }
  }

  openPendingDrawer() {
    const drawer = document.getElementById('drawer-pending-vehicles');
    const backdrop = document.getElementById('pending-drawer-backdrop');
    if (!drawer) return;

    this.renderPendingVehiclesList();
    drawer.classList.remove('translate-x-full');
    if (backdrop) backdrop.classList.remove('hidden');
  }

  closePendingDrawer() {
    const drawer = document.getElementById('drawer-pending-vehicles');
    const backdrop = document.getElementById('pending-drawer-backdrop');
    if (drawer) drawer.classList.add('translate-x-full');
    if (backdrop) backdrop.classList.add('hidden');
  }

  updatePendingCountBadge() {
    const badge = document.getElementById('badge-pending-vehicles-count');
    if (!badge || !this.vehiclesMaster.length) return;

    const exitedSet = new Set(this.allEntriesToday.map((e) => String(e.vehicle_number).trim()));
    const pendingVehicles = this.vehiclesMaster.filter((v) => !exitedSet.has(String(v.vehicle_number).trim()));

    badge.textContent = `${pendingVehicles.length} Pending`;
  }

  renderPendingVehiclesList() {
    const container = document.getElementById('pending-vehicles-list');
    const statsEl = document.getElementById('pending-vehicles-stats');
    if (!container) return;

    const exitedSet = new Set(this.allEntriesToday.map((e) => String(e.vehicle_number).trim()));
    const pendingAll = this.vehiclesMaster.filter((v) => !exitedSet.has(String(v.vehicle_number).trim()));

    const pendingPetrol = pendingAll.filter((v) => v.vehicle_type === 'Petroleum').length;
    const pendingEV = pendingAll.filter((v) => v.vehicle_type !== 'Petroleum').length;

    if (statsEl) {
      statsEl.innerHTML = `
        <div class="grid grid-cols-3 gap-2 text-center">
          <div class="p-2 bg-slate-100 dark:bg-slate-800 rounded">
            <div class="text-[10px] text-slate-500">Not Exited</div>
            <div class="text-base font-bold text-slate-900 dark:text-white">${pendingAll.length} / 155</div>
          </div>
          <div class="p-2 bg-blue-50 dark:bg-blue-950/40 rounded">
            <div class="text-[10px] text-blue-500">Petrol Pending</div>
            <div class="text-base font-bold text-blue-600 dark:text-blue-400">${pendingPetrol} / 92</div>
          </div>
          <div class="p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded">
            <div class="text-[10px] text-emerald-500">EV Pending</div>
            <div class="text-base font-bold text-emerald-600 dark:text-emerald-400">${pendingEV} / 63</div>
          </div>
        </div>
      `;
    }

    let filteredList = pendingAll;
    if (this.pendingFilterType === 'petroleum') {
      filteredList = filteredList.filter((v) => v.vehicle_type === 'Petroleum');
    } else if (this.pendingFilterType === 'ev') {
      filteredList = filteredList.filter((v) => v.vehicle_type !== 'Petroleum');
    }

    if (this.pendingSearchQuery) {
      filteredList = filteredList.filter((v) => {
        const num = String(v.vehicle_number || '').toLowerCase();
        const driver = String(v.default_driver || '').toLowerCase();
        const uc = String(v.default_uc || '').toLowerCase();
        return num.includes(this.pendingSearchQuery) || driver.includes(this.pendingSearchQuery) || uc.includes(this.pendingSearchQuery);
      });
    }

    container.innerHTML = '';

    if (!filteredList.length) {
      container.innerHTML = `
        <div class="text-center py-12 text-slate-400 text-sm">
          No pending vehicles matching your criteria!
        </div>
      `;
      return;
    }

    filteredList.forEach((veh) => {
      const card = document.createElement('div');
      card.className = 'p-3 bg-white dark:bg-slate-800/90 rounded-lg border border-slate-200 dark:border-slate-700/80 shadow-sm flex items-center justify-between gap-3 hover:border-blue-400 dark:hover:border-blue-500 transition-colors';

      let typeBadgeClass = 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300';
      if (veh.vehicle_type === 'Electric') {
        typeBadgeClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300';
      } else if (veh.vehicle_type === 'Small EV') {
        typeBadgeClass = 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300';
      }

      card.innerHTML = `
        <div>
          <div class="flex items-center gap-2">
            <span class="font-extrabold text-base text-slate-900 dark:text-white">#${veh.vehicle_number}</span>
            <span class="px-2 py-0.5 text-xs font-semibold rounded-full ${typeBadgeClass}">${veh.vehicle_type}</span>
          </div>
          <div class="text-xs text-slate-600 dark:text-slate-400 mt-1">
            <span><strong>UC:</strong> ${veh.default_uc || '-'}</span> •
            <span><strong>Driver:</strong> ${veh.default_driver || '-'}</span>
          </div>
        </div>
        <button class="btn-quick-gateout px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1 transition-transform active:scale-95" data-vnum="${veh.vehicle_number}">
          Gate Out ➜
        </button>
      `;

      const btn = card.querySelector('.btn-quick-gateout');
      btn.addEventListener('click', async () => {
        const vNum = btn.getAttribute('data-vnum');
        await this.handleQuickGateOut(vNum);
      });

      container.appendChild(card);
    });
  }

  async handleQuickGateOut(vNum) {
    this.closePendingDrawer();
    if (window.appRouter) {
      window.appRouter.switchTab('tab-camera');
    }
    if (window.entryGridController) {
      await window.entryGridController.prefillVehicle(vNum);
    }
  }

  /**
   * Export Today's Entries to clean CSV
   * (UPDATED: Removed Sync Status column completely, Trips manual)
   */
  exportTodayCSV() {
    if (!this.allEntriesToday.length) {
      alert('No entries to export for today.');
      return;
    }

    // EXACT 8 COLUMNS: S No, UC No, Vehicle Type, Vehicle Number, Driver Name, Helper Name, Trips, Gate Out Time
    const headers = ['S No', 'UC No', 'Vehicle Type', 'Vehicle Number', 'Driver Name', 'Helper Name', 'Trips', 'Gate Out Time'];
    const rows = this.allEntriesToday.map((e) => [
      e.s_no,
      `"${(e.uc_no || '').replace(/"/g, '""')}"`,
      `"${e.vehicle_type || ''}"`,
      `"${e.vehicle_number || ''}"`,
      `"${(e.driver_name || '').replace(/"/g, '""')}"`,
      `"${(e.helper_name || '').replace(/"/g, '""')}"`,
      `"${e.trips || ''}"`, // Manual trips or blank!
      `"${e.gate_out_time || ''}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const filename = `Malir_Fleet_Exit_${this.currentDateStr}.csv`;

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

window.sheetViewController = new SheetViewController();
