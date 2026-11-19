/**
 * =========================================================================
 * Camera & HTML5 Canvas Photo Watermark Engine
 * =========================================================================
 * Mobile-first rear camera stream handler, torch control, full-res canvas
 * watermarking, auto-download to phone storage, and thumbnail generation.
 * (Updated: Removed Trip from photo watermark as requested).
 */

class CameraManager {
  constructor() {
    this.videoElement = null;
    this.canvasElement = null;
    this.stream = null;
    this.currentFacingMode = 'environment';
    this.torchActive = false;
    this.isCameraRunning = false;
    this.cameraBlocked = false;
    this.capturedBlob = null;
    this.lastCapturedPhoto = null;
  }

  /**
   * Bind DOM elements and listeners
   */
  init(videoEl, canvasEl) {
    this.videoElement = videoEl;
    this.canvasElement = canvasEl || document.createElement('canvas');
  }

  /**
   * Start camera with rear-facing preference
   */
  async startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('getUserMedia not supported in this browser');
      this.updateStatus('Camera not supported. Use manual photo upload.', 'error');
      this.cameraBlocked = true;
      return false;
    }

    this.stopCamera();

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: this.currentFacingMode },
        width: { ideal: 1920, min: 640 },
        height: { ideal: 1080, min: 480 }
      }
    };

    try {
      this.updateStatus('Starting camera...', 'loading');
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (this.videoElement) {
        this.videoElement.srcObject = this.stream;
        await this.videoElement.play();
      }
      this.isCameraRunning = true;
      this.cameraBlocked = false;
      this.updateStatus('Live Camera Ready', 'ready');

      // Check torch capability
      this.checkTorchCapability();
      return true;
    } catch (err) {
      console.warn('Environment camera failed, falling back to any video device:', err);
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (this.videoElement) {
          this.videoElement.srcObject = this.stream;
          await this.videoElement.play();
        }
        this.isCameraRunning = true;
        this.cameraBlocked = false;
        this.updateStatus('Camera Ready', 'ready');
        return true;
      } catch (fallbackErr) {
        console.error('All camera attempts failed:', fallbackErr);
        this.cameraBlocked = true;
        this.isCameraRunning = false;
        this.updateStatus('Camera permission blocked. Tap to upload photo.', 'error');
        return false;
      }
    }
  }

  /**
   * Stop active camera stream
   */
  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.isCameraRunning = false;
    this.torchActive = false;
  }

  /**
   * Flip between rear and front camera
   */
  async flipCamera() {
    this.currentFacingMode = (this.currentFacingMode === 'environment') ? 'user' : 'environment';
    return this.startCamera();
  }

  /**
   * Toggle flashlight/torch if supported by hardware
   */
  async toggleTorch() {
    if (!this.stream) return false;
    const track = this.stream.getVideoTracks()[0];
    if (!track) return false;

    const capabilities = track.getCapabilities ? track.getCapabilities() : {};
    if (!capabilities.torch) {
      return false;
    }

    try {
      this.torchActive = !this.torchActive;
      await track.applyConstraints({
        advanced: [{ torch: this.torchActive }]
      });
      return this.torchActive;
    } catch (e) {
      console.warn('Torch toggle failed:', e);
      return false;
    }
  }

  checkTorchCapability() {
    if (!this.stream) return false;
    const track = this.stream.getVideoTracks()[0];
    if (!track || !track.getCapabilities) return false;
    const caps = track.getCapabilities();
    const torchBtn = document.getElementById('btn-toggle-torch');
    if (torchBtn) {
      if (caps.torch) {
        torchBtn.classList.remove('hidden');
      } else {
        torchBtn.classList.add('hidden');
      }
    }
    return Boolean(caps.torch);
  }

  /**
   * Capture raw photo frame from video (for Rapid Snap / Relaxed Mind workflow)
   */
  async captureRawFrame() {
    let sourceWidth, sourceHeight, drawSource;

    if (this.isCameraRunning && this.videoElement && this.videoElement.videoWidth > 0) {
      drawSource = this.videoElement;
      sourceWidth = this.videoElement.videoWidth;
      sourceHeight = this.videoElement.videoHeight;
    } else {
      // Placeholder if camera is not active
      sourceWidth = 1280;
      sourceHeight = 720;
    }

    const canvas = document.createElement('canvas');
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    const ctx = canvas.getContext('2d');

    if (drawSource) {
      ctx.drawImage(drawSource, 0, 0, sourceWidth, sourceHeight);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, sourceWidth, sourceHeight);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText('District Malir Fleet Gate Exit', 50, 100);
    }

    const rawBlob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.90));

    // Thumbnail
    const thumbCanvas = document.createElement('canvas');
    const thumbWidth = 360;
    const thumbHeight = Math.round((sourceHeight / sourceWidth) * thumbWidth);
    thumbCanvas.width = thumbWidth;
    thumbCanvas.height = thumbHeight;
    const thumbCtx = thumbCanvas.getContext('2d');
    thumbCtx.drawImage(canvas, 0, 0, thumbWidth, thumbHeight);
    const thumbnailDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.75);

    return {
      rawBlob,
      thumbnailDataUrl,
      width: sourceWidth,
      height: sourceHeight
    };
  }

  /**
   * Capture photo from live video (or existing raw frame/uploaded image),
   * apply clean watermark (WITHOUT TRIP), auto-download to phone storage,
   * and generate thumbnail.
   */
  async captureAndWatermark(entryData, fallbackImgElement = null, rawBlobSource = null) {
    let sourceWidth, sourceHeight, drawSource;

    if (rawBlobSource) {
      // Load raw blob into an Image
      const img = await this.loadImageFromBlob(rawBlobSource);
      drawSource = img;
      sourceWidth = img.naturalWidth;
      sourceHeight = img.naturalHeight;
    } else if (this.isCameraRunning && this.videoElement && this.videoElement.videoWidth > 0) {
      drawSource = this.videoElement;
      sourceWidth = this.videoElement.videoWidth;
      sourceHeight = this.videoElement.videoHeight;
    } else if (fallbackImgElement && fallbackImgElement.naturalWidth > 0) {
      drawSource = fallbackImgElement;
      sourceWidth = fallbackImgElement.naturalWidth;
      sourceHeight = fallbackImgElement.naturalHeight;
    } else {
      return this.generatePlaceholderPhoto(entryData);
    }

    const canvas = this.canvasElement;
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    const ctx = canvas.getContext('2d');

    // 1. Draw camera video frame / image
    ctx.drawImage(drawSource, 0, 0, sourceWidth, sourceHeight);

    // 2. Draw auto photo watermark (CLEAN: NO TRIP TAG)
    this.drawWatermark(ctx, sourceWidth, sourceHeight, entryData);

    // 3. Generate high-res JPEG blob for phone download
    const fullBlob = await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.88);
    });

    // 4. Generate lightweight thumbnail (~360px wide) for in-app storage
    const thumbCanvas = document.createElement('canvas');
    const thumbWidth = 360;
    const thumbHeight = Math.round((sourceHeight / sourceWidth) * thumbWidth);
    thumbCanvas.width = thumbWidth;
    thumbCanvas.height = thumbHeight;
    const thumbCtx = thumbCanvas.getContext('2d');
    thumbCtx.drawImage(canvas, 0, 0, thumbWidth, thumbHeight);
    const thumbnailDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.75);

    // 5. Auto-download watermarked photo locally to phone storage
    const filename = this.generateFilename(entryData);
    this.triggerLocalDownload(fullBlob, filename);

    return {
      fullBlob,
      thumbnailDataUrl,
      filename
    };
  }

  loadImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  /**
   * Draw the auto-watermark banner:
   * Format: Date & Time | Vehicle No | Vehicle Type | UC No
   * (NOTE: Trip is intentionally EXCLUDED as requested by user)
   */
  drawWatermark(ctx, width, height, entry) {
    ctx.save();

    // Scale strip height relative to image resolution
    const stripHeight = Math.max(100, Math.round(height * 0.14));
    const stripY = height - stripHeight;

    // Dark semi-transparent strip
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(0, stripY, width, stripHeight);

    // Vibrant emerald top accent bar
    ctx.fillStyle = '#10b981';
    ctx.fillRect(0, stripY, width, Math.max(4, Math.round(height * 0.005)));

    // Header Badge
    const headerFontSize = Math.max(13, Math.round(stripHeight * 0.17));
    ctx.font = `800 ${headerFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = '#38bdf8'; // Sky blue
    ctx.textBaseline = 'top';
    const paddingX = Math.max(20, Math.round(width * 0.03));
    const headerY = stripY + Math.round(stripHeight * 0.12);
    ctx.fillText('DISTRICT MALIR FLEET  •  GATE EXIT VERIFIED', paddingX, headerY);

    // Main Stamp Text: Date & Time | Vehicle No | Vehicle Type | UC No (NO TRIP)
    const mainFontSize = Math.max(16, Math.round(stripHeight * 0.28));
    ctx.font = `bold ${mainFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = '#ffffff';

    // Drop shadow for legibility
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    const vNum = entry.vehicle_number || 'N/A';
    const vType = entry.vehicle_type || 'Petroleum';
    const ucNo = entry.uc_no || '-';
    const dateTimeStr = entry.gate_out_time || entry.date || new Date().toLocaleString();

    // CLEAN: NO TRIP TAG ON PHOTO WATERMARK
    const mainStampText = `${dateTimeStr}  |  Vehicle #${vNum}  |  ${vType}  |  UC: ${ucNo}`;
    const mainY = headerY + headerFontSize + Math.round(stripHeight * 0.08);
    ctx.fillText(mainStampText, paddingX, mainY);

    // Crew Sub-line
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    const crewFontSize = Math.max(12, Math.round(stripHeight * 0.16));
    ctx.font = `600 ${crewFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = '#cbd5e1';
    const driver = entry.driver_name || '-';
    const helper = entry.helper_name || '-';
    const crewText = `Driver: ${driver}   |   Helper: ${helper}`;
    const crewY = mainY + mainFontSize + Math.round(stripHeight * 0.08);
    ctx.fillText(crewText, paddingX, crewY);

    ctx.restore();
  }

  /**
   * Generate filename format: YYYY-MM-DD_VehicleNo_HHMM.jpg (NO TRIP TAG)
   */
  generateFilename(entry) {
    const datePart = entry.date || new Date().toISOString().slice(0, 10);
    const vNum = String(entry.vehicle_number || 'GateExit').replace(/[^a-zA-Z0-9]/g, '');

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const timePart = `${hh}${mm}`;

    return `${datePart}_${vNum}_${timePart}.jpg`;
  }

  /**
   * Auto-download photo locally to phone storage
   */
  triggerLocalDownload(blob, filename) {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1200);
    } catch (e) {
      console.warn('Auto photo download failed:', e);
    }
  }

  /**
   * Placeholder photo generator if camera not active
   */
  async generatePlaceholderPhoto(entryData) {
    const canvas = this.canvasElement;
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 1280, 720);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1280, 720);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DISTRICT MALIR FLEET GATE EXIT', 640, 280);

    ctx.font = 'bold 34px sans-serif';
    ctx.fillStyle = '#10b981';
    ctx.fillText(`VEHICLE # ${entryData.vehicle_number || ''} (${entryData.vehicle_type || 'Fleet'})`, 640, 360);

    ctx.textAlign = 'left';
    this.drawWatermark(ctx, 1280, 720, entryData);

    const fullBlob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.6);
    const filename = this.generateFilename(entryData);
    this.triggerLocalDownload(fullBlob, filename);

    return { fullBlob, thumbnailDataUrl, filename };
  }

  updateStatus(message, type = 'ready') {
    const statusEl = document.getElementById('camera-status-pill');
    if (!statusEl) return;
    statusEl.textContent = message;

    if (type === 'ready') {
      statusEl.className = 'px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5';
    } else if (type === 'loading') {
      statusEl.className = 'px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1.5';
    } else if (type === 'error') {
      statusEl.className = 'px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1.5';
    }
  }
}

window.cameraManager = new CameraManager();
