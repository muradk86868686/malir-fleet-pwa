/**
 * =========================================================================
 * Camera & HTML5 Canvas Photo Watermark Engine (v2.2)
 * =========================================================================
 * Mobile-first rear camera stream handler, torch control, full-res canvas
 * watermarking with AUTO-FITTING text (never cut off on mobile),
 * safe margins, and single-download detailed photo export.
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

  init(videoEl, canvasEl) {
    this.videoElement = videoEl;
    this.canvasElement = canvasEl || document.createElement('canvas');
  }

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

  async flipCamera() {
    this.currentFacingMode = (this.currentFacingMode === 'environment') ? 'user' : 'environment';
    return this.startCamera();
  }

  async toggleTorch() {
    if (!this.stream) return false;
    const track = this.stream.getVideoTracks()[0];
    if (!track) return false;

    const capabilities = track.getCapabilities ? track.getCapabilities() : {};
    if (!capabilities.torch) return false;

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
   * Capture raw photo frame from video for the Rapid Snap queue
   * (Does NOT download to phone storage yet — avoids duplicate photos!)
   */
  async captureRawFrame() {
    let sourceWidth, sourceHeight, drawSource;

    if (this.isCameraRunning && this.videoElement && this.videoElement.videoWidth > 0) {
      drawSource = this.videoElement;
      sourceWidth = this.videoElement.videoWidth;
      sourceHeight = this.videoElement.videoHeight;
    } else {
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

    // Thumbnail for in-app queue display
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
   * Capture photo, stamp clean auto-fitting watermark, auto-download to phone,
   * and store thumbnail in IndexedDB.
   */
  async captureAndWatermark(entryData, fallbackImgElement = null, rawBlobSource = null) {
    let sourceWidth, sourceHeight, drawSource;

    if (rawBlobSource) {
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

    // 1. Draw base photo frame
    ctx.drawImage(drawSource, 0, 0, sourceWidth, sourceHeight);

    // 2. Draw watermark with AUTO-FIT & SAFE MARGINS (never hidden on any phone)
    this.drawWatermark(ctx, sourceWidth, sourceHeight, entryData);

    // 3. Generate high-res JPEG blob
    const fullBlob = await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.88);
    });

    // 4. Generate lightweight thumbnail (~360px) for IndexedDB
    const thumbCanvas = document.createElement('canvas');
    const thumbWidth = 360;
    const thumbHeight = Math.round((sourceHeight / sourceWidth) * thumbWidth);
    thumbCanvas.width = thumbWidth;
    thumbCanvas.height = thumbHeight;
    const thumbCtx = thumbCanvas.getContext('2d');
    thumbCtx.drawImage(canvas, 0, 0, thumbWidth, thumbHeight);
    const thumbnailDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.75);

    // 5. Auto-download the ONE final detailed photo to phone storage
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
   * Multi-line, high-contrast, with auto-scaling so text NEVER gets cut off
   * or hidden on mobile portrait screens!
   */
  drawWatermark(ctx, width, height, entry) {
    ctx.save();

    const dim = Math.min(width, height);
    const isPortrait = height > width || width < 800;

    // Generous card safe margins: keeps clear of mobile phone navigation bars and gallery controls
    const marginSide = Math.max(16, Math.round(width * 0.03));
    const marginBottom = Math.max(24, Math.round(height * 0.035));
    const cardWidth = width - (marginSide * 2);
    const paddingInnerX = Math.max(16, Math.round(dim * 0.025));
    const maxContentWidth = cardWidth - (paddingInnerX * 2);
    const contentX = marginSide + paddingInnerX;

    const vNum = entry.vehicle_number || 'N/A';
    const vType = entry.vehicle_type || 'Petroleum';
    const ucNo = entry.uc_no || '-';
    const driver = entry.driver_name || '-';
    const helper = entry.helper_name || '-';
    const dateTimeStr = entry.gate_out_time || entry.date || new Date().toLocaleString();

    if (isPortrait) {
      // 4-LINE DEDICATED LAYOUT FOR MOBILE PORTRAIT
      // Line 1: Header Badge
      // Line 2: Prominent Timestamp
      // Line 3: Big Vehicle Number, Type & UC (NO Trip)
      // Line 4: Crew Details (Driver & Helper)
      const h1 = Math.max(12, Math.round(dim * 0.024));
      const h2 = Math.max(12, Math.round(dim * 0.024));
      const h3 = Math.max(16, Math.round(dim * 0.036));
      const h4 = Math.max(11, Math.round(dim * 0.022));

      const rowGap = Math.max(6, Math.round(dim * 0.012));
      const paddingInnerY = Math.max(14, Math.round(dim * 0.022));
      const totalContentHeight = h1 + h2 + h3 + h4 + (rowGap * 3);
      const cardHeight = totalContentHeight + (paddingInnerY * 2);
      const cardY = height - cardHeight - marginBottom;

      // 1. Semi-transparent dark slate backdrop with rounded corners
      ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
      this.drawRoundedRect(ctx, marginSide, cardY, cardWidth, cardHeight, Math.max(8, Math.round(dim * 0.014)));
      ctx.fill();

      // 2. Vibrant emerald accent line across top of card
      ctx.fillStyle = '#10b981';
      ctx.fillRect(marginSide, cardY, cardWidth, Math.max(4, Math.round(dim * 0.005)));

      // Shadow for extreme text contrast against bright backgrounds
      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 2;

      // Row 1: Header Badge
      const y1 = cardY + paddingInnerY;
      this.drawFittedText(ctx, 'DISTRICT MALIR FLEET • GATE EXIT VERIFIED', contentX, y1, maxContentWidth, h1, '800', '#38bdf8');

      // Row 2: Live Date & Time
      const y2 = y1 + h1 + rowGap;
      this.drawFittedText(ctx, `DATE & TIME: ${dateTimeStr}`, contentX, y2, maxContentWidth, h2, '700', '#facc15');

      // Row 3: Vehicle #, Type & UC (Clean, bold, NO Trip stamp!)
      const y3 = y2 + h2 + rowGap;
      const mainText = `VEHICLE #${vNum}   |   ${vType.toUpperCase()}   |   UC: ${ucNo}`;
      this.drawFittedText(ctx, mainText, contentX, y3, maxContentWidth, h3, '900', '#ffffff');

      // Row 4: Crew Details (Driver & Helper)
      const y4 = y3 + h3 + rowGap;
      const crewText = `Driver: ${driver}    •    Helper: ${helper}`;
      this.drawFittedText(ctx, crewText, contentX, y4, maxContentWidth, h4, '600', '#cbd5e1');

    } else {
      // 3-LINE WIDE LAYOUT FOR LANDSCAPE SCREENS
      const h1 = Math.max(14, Math.round(dim * 0.026));
      const h2 = Math.max(18, Math.round(dim * 0.038));
      const h3 = Math.max(12, Math.round(dim * 0.024));

      const rowGap = Math.max(7, Math.round(dim * 0.014));
      const paddingInnerY = Math.max(14, Math.round(dim * 0.024));
      const totalContentHeight = h1 + h2 + h3 + (rowGap * 2);
      const cardHeight = totalContentHeight + (paddingInnerY * 2);
      const cardY = height - cardHeight - marginBottom;

      // Backdrop
      ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
      this.drawRoundedRect(ctx, marginSide, cardY, cardWidth, cardHeight, Math.max(8, Math.round(dim * 0.014)));
      ctx.fill();

      // Top accent
      ctx.fillStyle = '#10b981';
      ctx.fillRect(marginSide, cardY, cardWidth, Math.max(4, Math.round(dim * 0.005)));

      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 2;

      // Row 1: Header (Left) + Timestamp (Right)
      const y1 = cardY + paddingInnerY;
      const headerText = 'DISTRICT MALIR FLEET • GATE EXIT VERIFIED';
      ctx.font = `800 ${h1}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      const headerWidth = ctx.measureText(headerText).width;

      this.drawFittedText(ctx, headerText, contentX, y1, maxContentWidth * 0.6, h1, '800', '#38bdf8');

      ctx.font = `700 ${h1}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      const timeWidth = ctx.measureText(dateTimeStr).width;
      const timeX = Math.max(contentX + headerWidth + 20, marginSide + cardWidth - paddingInnerX - timeWidth);
      ctx.fillStyle = '#facc15';
      ctx.textBaseline = 'top';
      ctx.fillText(dateTimeStr, timeX, y1);

      // Row 2: Vehicle Details (NO Trip)
      const y2 = y1 + h1 + rowGap;
      const mainText = `VEHICLE #${vNum}   |   ${vType.toUpperCase()}   |   UC: ${ucNo}`;
      this.drawFittedText(ctx, mainText, contentX, y2, maxContentWidth, h2, '900', '#ffffff');

      // Row 3: Crew Details
      const y3 = y2 + h2 + rowGap;
      const crewText = `Driver: ${driver}    •    Helper: ${helper}`;
      this.drawFittedText(ctx, crewText, contentX, y3, maxContentWidth, h3, '600', '#cbd5e1');
    }

    ctx.restore();
  }

  /**
   * Auto-Fitting Font Helper:
   * Measures text width and automatically reduces font size if necessary
   * so text NEVER gets clipped or hidden outside the image borders!
   */
  drawFittedText(ctx, text, x, y, maxWidth, baseSize, weight = 'bold', color = '#ffffff') {
    let fontSize = baseSize;
    ctx.font = `${weight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    let measuredWidth = ctx.measureText(text).width;

    // Scale font down proportionally if it exceeds maxWidth
    if (measuredWidth > maxWidth && maxWidth > 50) {
      const scale = maxWidth / measuredWidth;
      fontSize = Math.max(10, Math.floor(baseSize * scale));
      ctx.font = `${weight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    }

    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
  }

  drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  generateFilename(entry) {
    const datePart = entry.date || new Date().toISOString().slice(0, 10);
    const vNum = String(entry.vehicle_number || 'GateExit').replace(/[^a-zA-Z0-9]/g, '');

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const timePart = `${hh}${mm}`;

    return `${datePart}_${vNum}_${timePart}.jpg`;
  }

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
      }, 1500);
    } catch (e) {
      console.warn('Auto photo download failed:', e);
    }
  }

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
