# 🚛 District Malir Fleet - Gate Exit PWA Setup & Deployment Guide

This guide explains how to set up and deploy the **100% FREE Mobile-First Progressive Web App (PWA)** for daily gate-exit tracking (District Malir - Petroleum & EV Vehicles), synced directly to your **Monthly Google Sheets Workbook**.

---

## 📑 Table of Contents
1. [Google Sheets Backend Setup (`Code.gs`)](#1-google-sheets-backend-setup-codegs)
2. [Publishing to GitHub Pages (Free HTTPS Camera Access)](#2-publishing-to-github-pages-free-https-camera-access)
3. [Connecting the App to Google Sheets](#3-connecting-the-app-to-google-sheets)
4. [Installing the PWA on Android & iPhone](#4-installing-the-pwa-on-android--iphone)
5. [Gatekeeper Quick Reference Workflow](#5-gatekeeper-quick-reference-workflow)
6. [Offline Mode & Data Privacy Architecture](#6-offline-mode--data-privacy-architecture)

---

## 1. Google Sheets Backend Setup (`Code.gs`)

The backend script automatically handles:
- Dynamic creation of daily date tabs (e.g., `19-Nov`, `20-Nov`) from a template.
- Appending text-only rows: `S No | UC No | Vehicle Type | Vehicle Number | Driver Name | Helper Name | Trips | Gate Out Time`.
- Real-time updates to the `Master_Dashboard` tab with Zone-wise and Vehicle-Type-wise monthly aggregates.

### Step 1.1: Create your Monthly Google Sheet
1. Open [Google Sheets](https://sheets.new) in your web browser.
2. Name the workbook: `District Malir Fleet - Gate Exit Log (Nov 2026)` (or current month).

### Step 1.2: Add `Code.gs` to Apps Script
1. In Google Sheets, click the top menu: **Extensions** > **Apps Script**.
2. Delete any existing template code in `Code.gs`.
3. Open `google-apps-script/Code.gs` from this project folder, copy all code, and paste it into the Apps Script editor.
4. Click the **Save** floppy disk icon (or press `Ctrl + S`).

### Step 1.3: Initialize Workbook Tabs (One-Click)
1. At the top of the Apps Script editor, locate the function dropdown (next to "Debug" and "Run").
2. Select `setupWorkbook` and click **Run**.
3. Google will ask for authorization on the first run:
   - Click **Review Permissions**.
   - Select your Google account.
   - Click **Advanced** > **Go to Untitled project (unsafe)**.
   - Click **Allow**.
4. Once completed, return to your Google Sheet:
   - You will see 3 tabs automatically created and styled:
     1. `Daily_Template` (standard headers: navy background, frozen header row).
     2. Today's tab (e.g., `19-Nov`).
     3. `Master_Dashboard` (KPI summary cards and Zone-wise aggregate tables).

### Step 1.4: Deploy as a Web App
1. At the top right of the Apps Script editor, click the blue **Deploy** button > **New deployment**.
2. Click the gear icon ⚙️ next to "Select type" and select **Web app**.
3. Configure the deployment settings:
   - **Description**: `Malir Fleet Gate Exit API v1`
   - **Execute as**: **Me (`your-email@gmail.com`)**
   - **Who has access**: **Anyone** *(CRITICAL: Must be "Anyone" so mobile gatekeepers can sync entries without needing Google sign-in accounts)*.
4. Click **Deploy**.
5. Copy the **Web App URL** (looks like `https://script.google.com/macros/s/AKfycbx.../exec`). Save this URL for Step 3.

---

## 2. Publishing to GitHub Pages (Free HTTPS Camera Access)

> [!IMPORTANT]
> Mobile browsers (Chrome and Safari) **strictly require HTTPS** to access the rear camera (`navigator.mediaDevices.getUserMedia`). GitHub Pages provides 100% free HTTPS hosting with zero server setup.

### Option A: Automated GitHub Actions Deployment (Recommended)
1. Create a new repository on [GitHub](https://github.com/new) named `malir-fleet-pwa` (Public or Private).
2. In your GitHub repository:
   - Go to **Settings** > **Pages** (in the left sidebar).
   - Under **Build and deployment** > **Source**, select **GitHub Actions**. (That's it! GitHub Actions is now enabled).
3. Open your terminal in this project folder and run the exact commands:
   ```bash
   git init
   git add .
   git commit -m "feat: complete District Malir Gate Exit PWA v2 with GitHub Actions & Vite"
   git branch -M main
   git remote add origin https://github.com/<YOUR_USERNAME>/malir-fleet-pwa.git
   git push -u origin main
   ```
4. GitHub Actions will automatically run `.github/workflows/deploy.yml`:
   - Runs integrity verification tests
   - Builds production PWA with Vite (`base: './'`)
   - Deploys automatically to free HTTPS GitHub Pages!
5. In ~60 seconds, your live HTTPS PWA is available at:
   `https://<YOUR_USERNAME>.github.io/malir-fleet-pwa/`

### Option B: Free Alternative (Netlify Drop / Cloudflare Pages)
- You can also drag-and-drop this entire folder into [Netlify Drop](https://app.netlify.com/drop) or Cloudflare Pages for instant HTTPS hosting.

---

## 3. Connecting the App to Google Sheets

1. Open your live app URL on your phone or computer.
2. In the top bar, tap the **Settings** ⚙️ icon.
3. Paste your deployed Google Apps Script Web App URL into the **Google Apps Script Web App URL** input.
4. Tap **Test Connection**:
   - The app pings your Apps Script and displays:
     `✅ Connected successfully (Spreadsheet: District Malir Fleet ...)`
5. Tap **Save Settings**.
6. The app is now permanently connected. Any pending or new gate exits will automatically sync to Google Sheets!

---

## 4. Installing the PWA on Android & iPhone

The app is a Progressive Web App (PWA) with full offline caching and standalone display (no browser address bar).

### On Android (Google Chrome):
1. Open your HTTPS URL in Chrome.
2. An **"Add to Home screen"** or **"Install app"** banner will appear at the bottom.
3. Tap **Install**. (If the banner doesn't appear, tap Chrome's three-dots menu ⋮ > **Add to Home screen**).
4. The app icon appears on your home screen with the District Malir logo.

### On iPhone / iPad (Safari):
1. Open your HTTPS URL in Safari.
2. Tap the **Share** button (box with an upward arrow at the bottom).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add** in the top right.

---

## 5. Gatekeeper Quick Reference Workflow

```
       [ GATEKEEPER PHONE WORKFLOW ]
                   │
    1. Point Camera at Vehicle
                   │
    2. Type Vehicle # (e.g. 717)
       ├─ Auto-fills Type (Petroleum / Electric / Small EV / New Electric)
       ├─ Auto-fills UC & Driver & Helper (From master or Auto-Learned crew)
       └─ Checks Duplicate:
          └─ If exited earlier today ➜ Prompts "Save as Trip #2"
                   │
    3. Tap Big "CAPTURE & SAVE ENTRY" Button
       ├─ Auto-stamps Watermark on Photo:
       │  "Date & Time | Vehicle No | Vehicle Type | UC No | Trip #"
       ├─ Auto-downloads watermarked JPG to Phone Storage
       ├─ Saves locally to IndexedDB with Thumbnail
       └─ Pushes text row to Google Sheets:
          "S No | UC No | Vehicle Type | Vehicle Number | Driver | Helper | Trips | Gate Out Time"
                   │
         [ READY FOR NEXT VEHICLE ]
```

---

## 6. Offline Mode & Data Privacy Architecture

- **100% Offline Capability:**
  The Gatekeeper can operate with **zero internet or weak 3G signals** at remote gates.
  - Entries are stored instantly in the phone's **IndexedDB**.
  - Photo is watermarked on-device via HTML5 Canvas and saved to local phone storage.
  - When the phone regains internet (or gatekeeper reconnects to depot WiFi), all queued entries automatically push to Google Sheets in chronological order.
- **Lightning-Fast Google Sheets Performance:**
  **Photos are NEVER uploaded to Google Sheets**. Only clean text data is synced (`S.No`, `UC`, `Vehicle Type`, `Vehicle Number`, `Driver`, `Helper`, `Trips`, `Gate Out Time`). This keeps your Google Sheets responsive, lightweight, and prevents quota exhaustion.
- **Auto-Learning Crew Engine:**
  If a vehicle gets assigned a new driver or helper at the gate, the gatekeeper simply edits the field and saves. The app remembers this updated pairing locally and auto-fills it for the next trip!

---

## 7. Local Development & Testing

To test locally on your computer and mobile phone via local WiFi:
```bash
# Start the local zero-dependency server
npm start
```
The terminal will display your local IP address:
```
========================================================
 DISTRICT MALIR FLEET GATE-EXIT PWA RUNNING LOCALLY
========================================================
 Local URL:     http://localhost:3000
 Phone on WiFi: http://192.168.1.5:3000
========================================================
```
Open the `http://192.168.x.x:3000` URL on your phone connected to the same WiFi network to test!
