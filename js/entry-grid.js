/**
 * =========================================================================
 * Excel-Style Fast Entry Grid & Auto-Fill / Auto-Learn Controller
 * =========================================================================
 * Manages the fast mobile entry form, S.No auto-increment, live timestamp,
 * vehicles_master.json validation (Warning on unauthorized numbers),
 * manual Trips input (no auto 1), and crew learning.
 */

class EntryGridController {
  constructor() {
    this.vehiclesMaster = [];
    this.authorizedVehicleNumbers = new Set();
    this.zones = [];
    this.allUCs = [];
    this.currentDateStr = this.getTodayDateString();
    this.currentSerial = 1;
    this.clockInterval = null;
    this.duplicateModalActive = false;
    this.pendingDuplicateResolve = null;
    this.isManualTimeOverridden = false;
    this.activeDraftSnap = null; // Staged photo for Relaxed Mind mode
  }

  /**
   * Load vehicles_master.json and initialize grid
   */
  async init() {
    await this.loadVehiclesMaster();
    this.setupLiveClock();
    await this.updateDailySerial();
    this.setupAutocomplete();
    this.setupTypeSelector();
    this.setupDuplicateModal();
  }

  /**
   * Fetch vehicles_master.json directly
   */
  async loadVehiclesMaster() {
    try {
      const response = await fetch('./vehicles_master.json');
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      const data = await response.json();
      this.zones = data.zones || ['Malir', 'Landhi', 'Memon Goth', 'Gulshan Hadeed', 'Extra Work'];
      this.vehiclesMaster = data.vehicles || [];

      // Build Set of authorized vehicle numbers for instant validation
      this.authorizedVehicleNumbers = new Set(
        this.vehiclesMaster.map((v) => String(v.vehicle_number).trim())
      );

      // Extract unique UCs
      const ucSet = new Set(this.zones);
      this.vehiclesMaster.forEach((v) => {
        if (v.default_uc && v.default_uc.trim()) {
          ucSet.add(v.default_uc.trim());
        }
      });
      ['1', '2', '3', '5', '6', '7', '8', '9', '10', '11', '12', '13 A'].forEach((uc) => ucSet.add(uc));
      this.allUCs = Array.from(ucSet);

      this.populateUCDropdown();
      console.log(`Loaded ${this.vehiclesMaster.length} authorized vehicles from vehicles_master.json`);
    } catch (err) {
      console.error('Failed to load vehicles_master.json:', err);
    }
  }

  getTodayDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatDateTime(dateObj = new Date()) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = months[dateObj.getMonth()];
    const year = dateObj.getFullYear();

    let hours = dateObj.getHours();
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strHours = String(hours).padStart(2, '0');

    return `${day}-${month}-${year} ${strHours}:${minutes} ${ampm}`;
  }

  setupLiveClock() {
    const timeInput = document.getElementById('grid-time');
    const updateTime = () => {
      if (!this.isManualTimeOverridden && timeInput) {
        timeInput.value = this.formatDateTime(new Date());
      }
    };
    updateTime();
    this.clockInterval = setInterval(updateTime, 1000);

    if (timeInput) {
      timeInput.addEventListener('focus', () => {
        this.isManualTimeOverridden = true;
      });
    }

    const resetTimeBtn = document.getElementById('btn-reset-time');
    if (resetTimeBtn) {
      resetTimeBtn.addEventListener('click', () => {
        this.isManualTimeOverridden = false;
        updateTime();
      });
    }
  }

  async updateDailySerial() {
    const today = this.getTodayDateString();
    this.currentDateStr = today;
    const nextSerial = await window.fleetDB.getNextDailySerial(today);
    this.currentSerial = nextSerial;

    const snoEl = document.getElementById('grid-sno');
    if (snoEl) {
      snoEl.value = nextSerial;
    }
    const snoBadge = document.getElementById('badge-daily-sno');
    if (snoBadge) {
      snoBadge.textContent = `#${nextSerial}`;
    }
  }

  populateUCDropdown() {
    const datalist = document.getElementById('uc-options');
    if (!datalist) return;
    datalist.innerHTML = '';

    this.allUCs.forEach((uc) => {
      const option = document.createElement('option');
      option.value = uc;
      datalist.appendChild(option);
    });
  }

  /**
   * Setup autocomplete for Vehicle Number input with unauthorized warning
   */
  setupAutocomplete() {
    const input = document.getElementById('grid-vehicle-number');
    const suggestionsBox = document.getElementById('vehicle-autocomplete-list');
    const warningBox = document.getElementById('vehicle-warning-banner');
    if (!input) return;

    const filterAndRender = (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) {
        if (suggestionsBox) suggestionsBox.classList.add('hidden');
        if (warningBox) warningBox.classList.add('hidden');
        return;
      }

      // Filter from master list
      const matches = this.vehiclesMaster.filter((v) => {
        const num = String(v.vehicle_number || '').toLowerCase();
        return num.includes(q);
      }).slice(0, 8);

      if (matches.length > 0) {
        if (suggestionsBox) {
          suggestionsBox.innerHTML = '';
          matches.forEach((veh) => {
            const item = document.createElement('div');
            item.className = 'px-3 py-2 text-sm flex items-center justify-between cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/70 border-b border-slate-200 dark:border-slate-700 last:border-0 transition-colors';

            let typeBadgeClass = 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300';
            if (veh.vehicle_type === 'Electric') {
              typeBadgeClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300';
            } else if (veh.vehicle_type === 'Small EV') {
              typeBadgeClass = 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300';
            }

            item.innerHTML = `
              <div class="flex items-center gap-2">
                <span class="font-bold text-slate-900 dark:text-white text-base">${veh.vehicle_number}</span>
                <span class="text-xs px-2 py-0.5 rounded-full font-medium ${typeBadgeClass}">${veh.vehicle_type}</span>
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400">
                UC: ${veh.default_uc || '-'} • ${veh.default_driver || '-'}
              </div>
            `;

            item.addEventListener('mousedown', (e) => {
              e.preventDefault();
              this.selectVehicle(veh);
              suggestionsBox.classList.add('hidden');
            });

            suggestionsBox.appendChild(item);
          });
          suggestionsBox.classList.remove('hidden');
        }
      } else {
        if (suggestionsBox) suggestionsBox.classList.add('hidden');
      }

      // VALIDATION: Check if exact query is unauthorized
      this.validateVehicleNumber(q);
    };

    input.addEventListener('input', (e) => {
      filterAndRender(e.target.value);
      this.checkExactVehicleMatch(e.target.value);
    });

    input.addEventListener('focus', (e) => {
      filterAndRender(e.target.value);
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (suggestionsBox) suggestionsBox.classList.add('hidden');
        this.validateVehicleNumber(input.value);
      }, 200);
    });

    const clearBtn = document.getElementById('btn-clear-vehicle');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        input.focus();
        this.resetVehicleDependentFields();
        if (suggestionsBox) suggestionsBox.classList.add('hidden');
        if (warningBox) warningBox.classList.add('hidden');
      });
    }
  }

  /**
   * Validate vehicle number against authorized fleet
   * Shows warning if typed number is not in the 155 vehicles list
   */
  validateVehicleNumber(val) {
    const q = String(val || '').trim();
    const warningBox = document.getElementById('vehicle-warning-banner');
    const input = document.getElementById('grid-vehicle-number');
    if (!warningBox) return;

    if (!q) {
      warningBox.classList.add('hidden');
      if (input) input.classList.remove('border-red-500', 'text-red-500');
      return;
    }

    // Check if number exists in master
    const isAuthorized = this.authorizedVehicleNumbers.has(q);

    if (!isAuthorized && q.length >= 2) {
      warningBox.innerHTML = `
        <div class="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-bold">
          <span>⚠️</span>
          <span>Vehicle #${q} is NOT in District Malir fleet list! Please check the number.</span>
        </div>
      `;
      warningBox.classList.remove('hidden');
      if (input) input.classList.add('text-red-500');
    } else {
      warningBox.classList.add('hidden');
      if (input) input.classList.remove('text-red-500');
    }
  }

  async checkExactVehicleMatch(query) {
    const q = String(query || '').trim();
    if (!q) return;

    const matched = this.vehiclesMaster.find((v) => String(v.vehicle_number).trim() === q);
    if (matched) {
      await this.fillVehicleDetails(matched);
    }
  }

  async selectVehicle(veh) {
    const input = document.getElementById('grid-vehicle-number');
    if (input) {
      input.value = veh.vehicle_number;
    }
    await this.fillVehicleDetails(veh);
  }

  /**
   * Auto-fill Vehicle Type, Driver Name, Helper Name, and UC
   */
  async fillVehicleDetails(veh) {
    const vNum = String(veh.vehicle_number).trim();

    // 1. Set Vehicle Type immediately (Petroleum, Electric, Small EV)
    this.setVehicleType(veh.vehicle_type || 'Petroleum');

    // 2. Check crew learning
    const learned = await window.fleetDB.getCrewLearning(vNum);

    const ucInput = document.getElementById('grid-uc');
    const driverInput = document.getElementById('grid-driver');
    const helperInput = document.getElementById('grid-helper');

    if (learned && (learned.driver || learned.helper || learned.uc)) {
      if (driverInput) driverInput.value = learned.driver || veh.default_driver || '';
      if (helperInput) helperInput.value = learned.helper || veh.default_helper || '-';
      if (ucInput) ucInput.value = learned.uc || veh.default_uc || '';
    } else {
      if (driverInput) driverInput.value = veh.default_driver || '';
      if (helperInput) helperInput.value = veh.default_helper || '-';
      if (ucInput) ucInput.value = veh.default_uc || '';
    }

    this.validateVehicleNumber(vNum);
  }

  setupTypeSelector() {
    const select = document.getElementById('grid-vehicle-type');
    if (!select) return;

    select.addEventListener('change', (e) => {
      this.updateTypeBadgeColors(e.target.value);
    });
  }

  setVehicleType(type) {
    const select = document.getElementById('grid-vehicle-type');
    if (select) {
      select.value = type;
      this.updateTypeBadgeColors(type);
    }
  }

  updateTypeBadgeColors(type) {
    const container = document.getElementById('vehicle-type-container');
    if (!container) return;

    container.classList.remove('border-blue-500', 'border-emerald-500', 'border-amber-500', 'border-purple-500');
    if (type === 'Petroleum') {
      container.classList.add('border-blue-500');
    } else if (type === 'Electric') {
      container.classList.add('border-emerald-500');
    } else if (type === 'Small EV') {
      container.classList.add('border-amber-500');
    }
  }

  resetVehicleDependentFields() {
    const driverInput = document.getElementById('grid-driver');
    const helperInput = document.getElementById('grid-helper');
    const ucInput = document.getElementById('grid-uc');
    const tripsInput = document.getElementById('grid-trips');

    if (driverInput) driverInput.value = '';
    if (helperInput) helperInput.value = '-';
    if (ucInput) ucInput.value = '';
    if (tripsInput) tripsInput.value = ''; // Trips stays empty for manual entry!
  }

  setupDuplicateModal() {
    const modal = document.getElementById('modal-duplicate-vehicle');
    const cancelBtn = document.getElementById('btn-dup-cancel');
    const proceedBtn = document.getElementById('btn-dup-proceed');

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        if (modal) modal.classList.add('hidden');
        if (this.pendingDuplicateResolve) {
          this.pendingDuplicateResolve({ proceed: false });
          this.pendingDuplicateResolve = null;
        }
      });
    }

    if (proceedBtn) {
      proceedBtn.addEventListener('click', () => {
        if (modal) modal.classList.add('hidden');
        if (this.pendingDuplicateResolve) {
          this.pendingDuplicateResolve({ proceed: true });
          this.pendingDuplicateResolve = null;
        }
      });
    }
  }

  /**
   * Duplicate vehicle check
   */
  async checkDuplicateVehicle(vehicleNumber) {
    const today = this.getTodayDateString();
    const existingEntries = await window.fleetDB.getTodayEntriesForVehicle(today, vehicleNumber);

    if (!existingEntries || existingEntries.length === 0) {
      return { proceed: true };
    }

    const tripCount = existingEntries.length;
    const nextTrip = tripCount + 1;
    const lastEntry = existingEntries[existingEntries.length - 1];

    const modal = document.getElementById('modal-duplicate-vehicle');
    const titleEl = document.getElementById('dup-modal-title');
    const bodyEl = document.getElementById('dup-modal-body');
    const proceedBtn = document.getElementById('btn-dup-proceed');

    if (titleEl) {
      titleEl.textContent = `Duplicate Exit Warning: Vehicle #${vehicleNumber}`;
    }

    if (bodyEl) {
      bodyEl.innerHTML = `
        <div class="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg text-sm text-amber-900 dark:text-amber-200 space-y-2">
          <p class="font-semibold text-base flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
            <span>⚠️</span> Vehicle <strong>${vehicleNumber}</strong> has already exited today!
          </p>
          <div class="text-xs space-y-1 bg-white/70 dark:bg-slate-900/60 p-2.5 rounded border border-amber-200 dark:border-amber-800">
            <div><strong>Previous Exit:</strong> ${lastEntry.gate_out_time || 'Earlier Today'}</div>
            <div><strong>Driver:</strong> ${lastEntry.driver_name || '-'} | <strong>UC:</strong> ${lastEntry.uc_no || '-'}</div>
            <div><strong>Helper:</strong> ${lastEntry.helper_name || '-'}</div>
          </div>
          <p class="text-xs text-slate-600 dark:text-slate-300">
            Is this a 2nd trip exit or an accidental duplicate entry?
          </p>
        </div>
      `;
    }

    if (proceedBtn) {
      proceedBtn.textContent = `Save as Trip #${nextTrip}`;
    }

    if (modal) {
      modal.classList.remove('hidden');
    }

    return new Promise((resolve) => {
      this.pendingDuplicateResolve = resolve;
    });
  }

  /**
   * Read and validate current form entry
   */
  getFormEntry() {
    const vNum = (document.getElementById('grid-vehicle-number')?.value || '').trim();
    if (!vNum) {
      alert('Please enter or select a Vehicle Number.');
      document.getElementById('grid-vehicle-number')?.focus();
      return null;
    }

    // Warning check for unauthorized vehicle
    if (!this.authorizedVehicleNumbers.has(vNum)) {
      const confirmSave = confirm(`⚠️ Warning: Vehicle #${vNum} is NOT in the authorized District Malir fleet list (92 Petroleum, 53 Electric, 10 Small EV).\n\nDo you still want to proceed?`);
      if (!confirmSave) {
        document.getElementById('grid-vehicle-number')?.focus();
        return null;
      }
    }

    const sNo = parseInt(document.getElementById('grid-sno')?.value, 10) || this.currentSerial;
    const timeVal = (document.getElementById('grid-time')?.value || '').trim() || this.formatDateTime(new Date());
    const ucNo = (document.getElementById('grid-uc')?.value || '').trim() || '-';
    const vType = document.getElementById('grid-vehicle-type')?.value || 'Petroleum';
    const driver = (document.getElementById('grid-driver')?.value || '').trim() || '-';
    const helper = (document.getElementById('grid-helper')?.value || '').trim() || '-';

    // MANUAL TRIPS INPUT: Read what the user wrote, or empty string (NO AUTO 1!)
    const userTrips = (document.getElementById('grid-trips')?.value || '').trim();

    return {
      s_no: sNo,
      date: this.getTodayDateString(),
      gate_out_time: timeVal,
      uc_no: ucNo,
      vehicle_number: vNum,
      vehicle_type: vType,
      driver_name: driver,
      helper_name: helper,
      trips: userTrips // User manual trips or blank!
    };
  }

  async resetAfterSave() {
    document.getElementById('grid-vehicle-number').value = '';
    const warningBox = document.getElementById('vehicle-warning-banner');
    if (warningBox) warningBox.classList.add('hidden');

    this.resetVehicleDependentFields();
    this.isManualTimeOverridden = false;
    this.activeDraftSnap = null;
    await this.updateDailySerial();
  }

  async prefillVehicle(vehicleNumber) {
    const veh = this.vehiclesMaster.find((v) => String(v.vehicle_number) === String(vehicleNumber));
    if (veh) {
      document.getElementById('grid-vehicle-number').value = veh.vehicle_number;
      await this.fillVehicleDetails(veh);
    } else {
      document.getElementById('grid-vehicle-number').value = vehicleNumber;
      this.validateVehicleNumber(vehicleNumber);
    }
  }

  showAutoFillToast(msg) {
    const toast = document.getElementById('grid-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('opacity-0', 'pointer-events-none');
    setTimeout(() => {
      toast.classList.add('opacity-0', 'pointer-events-none');
    }, 2200);
  }
}

window.entryGridController = new EntryGridController();
