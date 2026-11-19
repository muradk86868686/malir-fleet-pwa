/**
 * =========================================================================
 * Application Core Orchestrator - District Malir Fleet Gate Exit PWA
 * =========================================================================
 * Handles tab navigation, dark/light theme toggle, settings modal,
 * Rapid Snap & Relax Later workflow, collapsible details for maximum camera size,
 * and service worker registration.
 */

class AppRouter {
  constructor() {
    this.currentTab = 'tab-camera';
    this.fallbackImg = null;
    this.isDetailsMinimized = false;
  }

  init() {
    this.setupTabNavigation();
    this.setupThemeToggle();
    this.setupSettingsModal();
    this.setupCaptureAction();
    this.setupRapidSnapAction();
    this.setupDetailsToggle();
    this.setupPhotoUploadFallback();
    this.registerServiceWorker();
    this.renderDraftSnapsList();
  }

  setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.nav-tab-btn');
    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        this.switchTab(targetTab);
      });
    });
  }

  switchTab(targetTab) {
    this.currentTab = targetTab;

    document.querySelectorAll('.tab-view').forEach((view) => {
      view.classList.add('hidden');
    });

    const activeView = document.getElementById(targetTab);
    if (activeView) {
      activeView.classList.remove('hidden');
    }

    document.querySelectorAll('.nav-tab-btn').forEach((btn) => {
      const isTarget = btn.getAttribute('data-tab') === targetTab;
      const text = btn.querySelector('.tab-label');

      if (isTarget) {
        btn.classList.add('text-blue-600', 'dark:text-blue-400');
        btn.classList.remove('text-slate-400', 'dark:text-slate-500');
        if (text) text.classList.add('font-bold');
      } else {
        btn.classList.remove('text-blue-600', 'dark:text-blue-400');
        btn.classList.add('text-slate-400', 'dark:text-slate-500');
        if (text) text.classList.remove('font-bold');
      }
    });

    if (targetTab === 'tab-camera') {
      window.cameraManager?.startCamera();
      this.renderDraftSnapsList();
    } else {
      window.cameraManager?.stopCamera();
    }

    if (targetTab === 'tab-sheet') {
      window.sheetViewController?.renderTodaySheet();
    } else if (targetTab === 'tab-dashboard') {
      window.dashboardController?.renderDashboard();
    }
  }

  /**
   * Minimize / Expand Details section to give maximum screen height to the Camera
   */
  setupDetailsToggle() {
    const toggleBtn = document.getElementById('btn-toggle-details');
    const detailsContainer = document.getElementById('details-collapsible-section');
    const toggleText = document.getElementById('details-toggle-text');
    const toggleIcon = document.getElementById('details-toggle-icon');

    if (toggleBtn && detailsContainer) {
      toggleBtn.addEventListener('click', () => {
        this.isDetailsMinimized = !this.isDetailsMinimized;
        if (this.isDetailsMinimized) {
          detailsContainer.classList.add('hidden');
          if (toggleText) toggleText.textContent = 'Expand Details 🔼';
          if (toggleIcon) toggleIcon.style.transform = 'rotate(180deg)';
        } else {
          detailsContainer.classList.remove('hidden');
          if (toggleText) toggleText.textContent = 'Minimize Details 🔽';
          if (toggleIcon) toggleIcon.style.transform = 'rotate(0deg)';
        }
      });
    }
  }

  setupThemeToggle() {
    const themeBtn = document.getElementById('btn-toggle-theme');
    const root = document.documentElement;

    const savedTheme = localStorage.getItem('fleet_theme') || 'dark';
    if (savedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    this.updateThemeIcon(savedTheme === 'dark');

    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const isCurrentlyDark = root.classList.contains('dark');
        const newTheme = isCurrentlyDark ? 'light' : 'dark';
        if (newTheme === 'dark') {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
        localStorage.setItem('fleet_theme', newTheme);
        this.updateThemeIcon(!isCurrentlyDark);

        if (window.dashboardController) {
          window.dashboardController.updateChartsTheme();
        }
      });
    }
  }

  updateThemeIcon(isDark) {
    const sunIcon = document.getElementById('theme-icon-sun');
    const moonIcon = document.getElementById('theme-icon-moon');
    if (!sunIcon || !moonIcon) return;

    if (isDark) {
      sunIcon.classList.remove('hidden');
      moonIcon.classList.add('hidden');
    } else {
      sunIcon.classList.add('hidden');
      moonIcon.classList.remove('hidden');
    }
  }

  setupSettingsModal() {
    const openBtn = document.getElementById('btn-open-settings');
    const closeBtn = document.getElementById('btn-close-settings');
    const modal = document.getElementById('modal-settings');
    const urlInput = document.getElementById('settings-script-url');
    const saveBtn = document.getElementById('btn-save-settings');
    const testBtn = document.getElementById('btn-test-connection');
    const testResultEl = document.getElementById('settings-test-result');
    const exportBtn = document.getElementById('btn-export-backup');

    if (openBtn && modal) {
      openBtn.addEventListener('click', async () => {
        if (urlInput) {
          urlInput.value = (await window.fleetDB.getSetting('script_url', '')) || '';
        }
        if (testResultEl) testResultEl.innerHTML = '';
        modal.classList.remove('hidden');
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    }

    if (saveBtn && urlInput) {
      saveBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        await window.syncManager.setScriptUrl(url);
        this.showToast('Settings saved successfully!');
        if (modal) modal.classList.add('hidden');
      });
    }

    if (testBtn && urlInput && testResultEl) {
      testBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url) {
          testResultEl.innerHTML = '<span class="text-amber-500 font-semibold text-xs">Please enter a URL first.</span>';
          return;
        }

        testResultEl.innerHTML = '<span class="text-blue-400 font-semibold text-xs animate-pulse">Testing connection to Google Sheets...</span>';
        const res = await window.syncManager.testConnection(url);

        if (res.success) {
          testResultEl.innerHTML = `
            <div class="p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
              <strong>✅ Connected successfully (${res.latency}ms)</strong><br>
              Workbook: <em>${res.spreadsheetName || 'District Malir Fleet'}</em><br>
              Today's Tab: <em>${res.todayTab || 'Active'}</em>
            </div>
          `;
        } else {
          testResultEl.innerHTML = `
            <div class="p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
              <strong>❌ Connection Error (${res.latency}ms)</strong><br>
              ${res.message}<br>
              <span class="text-slate-400 text-[11px]">Ensure "Execute as: Me" and "Who has access: Anyone" in Apps Script.</span>
            </div>
          `;
        }
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        const backup = await window.fleetDB.exportBackup();
        const jsonStr = JSON.stringify(backup, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `District_Malir_Fleet_Backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
      });
    }
  }

  /**
   * "RAPID SNAP & RELAX LATER" WORKFLOW
   * Gatekeeper rapidly snaps photo during busy gate exit rush without typing.
   * Auto-saves to mobile gallery and queues in Draft Snaps so they can fill
   * details with a relaxed mind later!
   */
  setupRapidSnapAction() {
    const rapidSnapBtn = document.getElementById('btn-rapid-snap');
    if (!rapidSnapBtn) return;

    rapidSnapBtn.addEventListener('click', async () => {
      try {
        if (navigator.vibrate) navigator.vibrate(50);

        // 1. Capture raw photo frame from camera
        const snap = await window.cameraManager.captureRawFrame();

        // 2. Save to IndexedDB draft_snaps ONLY (NO duplicate raw download to gallery!)
        await window.fleetDB.addDraftSnap(snap.rawBlob, snap.thumbnailDataUrl, Date.now());

        this.showToast('📸 Snap added to queue! Fill details when relaxed to save detailed photo.');
        await this.renderDraftSnapsList();
      } catch (err) {
        console.error('Rapid snap failed:', err);
        alert('Could not capture snap: ' + err.message);
      }
    });

    // Clear active staged snap button
    const clearDraftBtn = document.getElementById('btn-clear-staged-snap');
    if (clearDraftBtn) {
      clearDraftBtn.addEventListener('click', () => {
        window.entryGridController.activeDraftSnap = null;
        const banner = document.getElementById('staged-snap-banner');
        if (banner) banner.classList.add('hidden');
      });
    }
  }

  /**
   * Render horizontal list of draft snaps waiting to be filled
   */
  async renderDraftSnapsList() {
    const container = document.getElementById('draft-snaps-container');
    const badge = document.getElementById('badge-draft-snaps-count');
    if (!container) return;

    const drafts = await window.fleetDB.getDraftSnaps();
    if (badge) {
      if (drafts.length > 0) {
        badge.textContent = `${drafts.length} Waiting to Fill`;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    if (!drafts.length) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    const listEl = document.getElementById('draft-snaps-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    drafts.forEach((draft, idx) => {
      const card = document.createElement('div');
      card.className = 'shrink-0 relative cursor-pointer group rounded-lg overflow-hidden border-2 border-amber-400 hover:border-blue-500 shadow-sm transition-all';
      
      const timeStr = new Date(draft.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      card.innerHTML = `
        <img src="${draft.thumbnail}" class="w-16 h-12 object-cover">
        <div class="absolute bottom-0 inset-x-0 bg-black/75 text-[9px] text-white font-bold text-center px-0.5 truncate">
          ${timeStr}
        </div>
      `;

      card.addEventListener('click', () => {
        this.stageDraftSnapForFilling(draft);
      });

      listEl.appendChild(card);
    });
  }

  /**
   * Stage a draft snap into the entry form for filling
   */
  stageDraftSnapForFilling(draft) {
    window.entryGridController.activeDraftSnap = draft;

    const banner = document.getElementById('staged-snap-banner');
    const thumbImg = document.getElementById('staged-snap-thumb');
    const timeText = document.getElementById('staged-snap-time');

    if (banner && thumbImg && timeText) {
      thumbImg.src = draft.thumbnail;
      timeText.textContent = `Exit Photo taken at ${new Date(draft.timestamp).toLocaleTimeString()} - Enter vehicle number below:`;
      banner.classList.remove('hidden');
    }

    // Expand details if collapsed
    const detailsContainer = document.getElementById('details-collapsible-section');
    if (detailsContainer && detailsContainer.classList.contains('hidden')) {
      detailsContainer.classList.remove('hidden');
      this.isDetailsMinimized = false;
    }

    // Focus on vehicle number input
    const vInput = document.getElementById('grid-vehicle-number');
    if (vInput) {
      vInput.focus();
    }

    this.showToast('Photo staged! Enter vehicle # to auto-fill crew and save.');
  }

  /**
   * Main "CAPTURE & SAVE ENTRY" Action
   */
  setupCaptureAction() {
    const captureBtn = document.getElementById('btn-capture-save');
    if (!captureBtn) return;

    captureBtn.addEventListener('click', async () => {
      const entry = window.entryGridController.getFormEntry();
      if (!entry) return;

      const dupCheck = await window.entryGridController.checkDuplicateVehicle(entry.vehicle_number);
      if (!dupCheck || !dupCheck.proceed) {
        return;
      }

      captureBtn.disabled = true;
      const originalText = captureBtn.innerHTML;
      captureBtn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        Saving & Syncing...
      `;

      try {
        if (navigator.vibrate) navigator.vibrate(60);

        // Check if we are saving a staged draft snap or live camera frame
        const stagedDraft = window.entryGridController.activeDraftSnap;
        let photoResult;

        if (stagedDraft && stagedDraft.raw_blob) {
          // Watermark the staged draft snap photo
          photoResult = await window.cameraManager.captureAndWatermark(entry, null, stagedDraft.raw_blob);
          // Delete from draft queue
          await window.fleetDB.deleteDraftSnap(stagedDraft.id);
          const banner = document.getElementById('staged-snap-banner');
          if (banner) banner.classList.add('hidden');
        } else {
          // Live camera capture
          photoResult = await window.cameraManager.captureAndWatermark(entry, this.fallbackImg);
        }

        // Save to IndexedDB
        entry.id = `exit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        entry.sync_status = 'Pending';
        const savedEntry = await window.fleetDB.addEntry(entry, photoResult.fullBlob, photoResult.thumbnailDataUrl);

        // Background sync to Google Sheets
        window.syncManager.syncSingleEntry(savedEntry);

        // Reset form for next vehicle
        await window.entryGridController.resetAfterSave();

        // Refresh views
        window.sheetViewController?.renderTodaySheet();
        window.dashboardController?.renderDashboard();
        this.renderDraftSnapsList();

        this.showToast(`✅ Gate Exit #${savedEntry.s_no} Saved: Vehicle #${entry.vehicle_number}`);
      } catch (err) {
        console.error('Capture and save failed:', err);
        alert(`Error saving entry: ${err.message}`);
      } finally {
        captureBtn.disabled = false;
        captureBtn.innerHTML = originalText;
      }
    });

    const flipBtn = document.getElementById('btn-flip-camera');
    if (flipBtn) {
      flipBtn.addEventListener('click', () => {
        window.cameraManager?.flipCamera();
      });
    }

    const torchBtn = document.getElementById('btn-toggle-torch');
    if (torchBtn) {
      torchBtn.addEventListener('click', async () => {
        const active = await window.cameraManager?.toggleTorch();
        if (active) {
          torchBtn.classList.add('bg-amber-400', 'text-slate-900');
          torchBtn.classList.remove('bg-black/50', 'text-white');
        } else {
          torchBtn.classList.remove('bg-amber-400', 'text-slate-900');
          torchBtn.classList.add('bg-black/50', 'text-white');
        }
      });
    }
  }

  setupPhotoUploadFallback() {
    const fileInput = document.getElementById('camera-fallback-file');
    const uploadBtn = document.getElementById('btn-camera-upload-fallback');
    this.fallbackImg = null;

    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', () => fileInput.click());
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (loadEvent) => {
          const img = new Image();
          img.onload = () => {
            this.fallbackImg = img;
            this.showToast('Custom photo staged for watermark!');
            const statusEl = document.getElementById('camera-status-pill');
            if (statusEl) statusEl.textContent = 'Custom Photo Loaded';
          };
          img.src = loadEvent.target.result;
        };
        reader.readAsDataURL(file);
      });
    }
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => console.log('Service Worker registered with scope:', reg.scope))
          .catch((err) => console.warn('Service Worker registration failed:', err));
      });
    }
  }

  showToast(msg) {
    const toast = document.getElementById('grid-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('opacity-0', 'pointer-events-none');
    setTimeout(() => {
      toast.classList.add('opacity-0', 'pointer-events-none');
    }, 2800);
  }
}

window.appRouter = new AppRouter();

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await window.fleetDB.init();

    const videoEl = document.getElementById('camera-stream');
    const canvasEl = document.getElementById('camera-canvas');
    window.cameraManager.init(videoEl, canvasEl);

    await window.entryGridController.init();
    await window.syncManager.init();
    await window.sheetViewController.init();
    await window.dashboardController.init();

    window.appRouter.init();
    await window.cameraManager.startCamera();

    console.log('District Malir Fleet Gate Exit PWA v2.0 initialized successfully!');
  } catch (err) {
    console.error('Fatal initialization error:', err);
  }
});
