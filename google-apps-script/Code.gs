/**
 * =========================================================================
 * DISTRICT MALIR FLEET GATE-EXIT SYSTEM - GOOGLE APPS SCRIPT BACKEND
 * =========================================================================
 * Workbook: Monthly Fleet Gate-Exit Workbook (Petroleum & EV Vehicles)
 * File: Code.gs
 * Description: Ready-to-deploy Web App backend handling gate-exit entries,
 * dynamic daily tab creation, text-only logging, and Master Dashboard sync.
 * =========================================================================
 */

// Configuration constants
var CONFIG = {
  TIMEZONE: 'Asia/Karachi', // Pakistan Standard Time (PKT)
  TEMPLATE_SHEET_NAME: 'Daily_Template',
  MASTER_SHEET_NAME: 'Master_Dashboard',
  HEADERS: [
    'S No',
    'UC No',
    'Vehicle Type',
    'Vehicle Number',
    'Driver Name',
    'Helper Name',
    'Trips',
    'Gate Out Time'
  ],
  VEHICLE_TYPES: ['Petroleum', 'Electric', 'Small EV'],
  ZONES: ['Malir', 'Landhi', 'Memon Goth', 'Gulshan Hadeed', 'Extra Work']
};

/**
 * Handle HTTP GET Requests
 * Used for connection testing (ping) and fetching current status/summary.
 */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'ping';
    var responseData = {};

    if (action === 'ping') {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var todayTab = getTodayTabName();
      var todaySheet = ss.getSheetByName(todayTab);
      var todayCount = todaySheet ? Math.max(0, todaySheet.getLastRow() - 1) : 0;

      responseData = {
        status: 'success',
        message: 'Connected to District Malir Fleet Google Sheets Backend',
        timestamp: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss'),
        spreadsheetName: ss.getName(),
        todayTab: todayTab,
        todayCount: todayCount
      };
    } else if (action === 'summary') {
      responseData = getWorkbookSummary();
    } else {
      responseData = {
        status: 'success',
        message: 'Google Apps Script Fleet API is active.',
        serverTime: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd-MMM-yyyy hh:mm a')
      };
    }

    return createJsonResponse(responseData);
  } catch (error) {
    return createJsonResponse({
      status: 'error',
      message: error.toString()
    });
  }
}

/**
 * Handle HTTP POST Requests
 * Main endpoint for receiving single entries or batch sync from the PWA.
 * Uses text/plain JSON payload parsing to bypass mobile CORS preflight issues.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  // Wait up to 30 seconds for concurrent write locks
  try {
    lock.waitLock(30000);
  } catch (e) {
    return createJsonResponse({
      status: 'error',
      message: 'Server is currently busy processing another request. Please retry.'
    });
  }

  try {
    var payload;
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e && e.parameter && e.parameter.data) {
      payload = JSON.parse(e.parameter.data);
    } else {
      throw new Error('No post data received in request');
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = payload.action || 'addEntry';
    var result = {};

    if (action === 'addEntry') {
      result = processSingleEntry(ss, payload.entry || payload);
    } else if (action === 'syncBatch') {
      result = processBatchEntries(ss, payload.entries || []);
    } else if (action === 'ping') {
      result = {
        status: 'success',
        message: 'Pong! Connection verified.',
        serverTime: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd-MMM-yyyy hh:mm a')
      };
    } else {
      throw new Error('Unknown action: ' + action);
    }

    // Refresh Master Dashboard aggregations
    updateMasterDashboard(ss);

    return createJsonResponse(result);
  } catch (err) {
    return createJsonResponse({
      status: 'error',
      message: err.toString()
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {
      // Lock already released
    }
  }
}

/**
 * Process a single entry and append to the appropriate daily sheet.
 */
function processSingleEntry(ss, entry) {
  if (!entry) {
    throw new Error('Invalid entry payload');
  }

  // Determine tab name based on entry date or today
  var tabName = getTabNameForDate(entry.date);
  var sheet = getOrCreateDailySheet(ss, tabName);

  var sNo = entry.s_no || (sheet.getLastRow()); // next serial if not provided
  var ucNo = entry.uc_no || '-';
  var vehicleType = entry.vehicle_type || 'Petroleum';
  var vehicleNumber = String(entry.vehicle_number || '').trim();
  var driverName = entry.driver_name || '-';
  var helperName = entry.helper_name || '-';
  var trips = (entry.trips !== undefined && entry.trips !== null) ? entry.trips : '';
  var gateOutTime = entry.gate_out_time || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd-MMM-yyyy hh:mm a');

  // Exact row structure:
  // S No | UC No | Vehicle Type | Vehicle Number | Driver Name | Helper Name | Trips | Gate Out Time
  var rowData = [
    sNo,
    ucNo,
    vehicleType,
    vehicleNumber,
    driverName,
    helperName,
    trips,
    gateOutTime
  ];

  sheet.appendRow(rowData);

  // Apply row formatting
  var lastRow = sheet.getLastRow();
  formatDataRow(sheet, lastRow, vehicleType);

  return {
    status: 'success',
    action: 'addEntry',
    message: 'Entry logged successfully for vehicle ' + vehicleNumber,
    dateTab: tabName,
    row: lastRow,
    id: entry.id || null
  };
}

/**
 * Process a batch of pending entries in order.
 */
function processBatchEntries(ss, entries) {
  if (!entries || !entries.length) {
    return {
      status: 'success',
      action: 'syncBatch',
      message: 'No entries to sync',
      syncedCount: 0,
      syncedIds: []
    };
  }

  var syncedIds = [];
  var tabRowMap = {};

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var tabName = getTabNameForDate(entry.date);
    var sheet = getOrCreateDailySheet(ss, tabName);

    var sNo = entry.s_no || sheet.getLastRow();
    var ucNo = entry.uc_no || '-';
    var vehicleType = entry.vehicle_type || 'Petroleum';
    var vehicleNumber = String(entry.vehicle_number || '').trim();
    var driverName = entry.driver_name || '-';
    var helperName = entry.helper_name || '-';
    var trips = (entry.trips !== undefined && entry.trips !== null) ? entry.trips : '';
    var gateOutTime = entry.gate_out_time || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd-MMM-yyyy hh:mm a');

    var rowData = [
      sNo,
      ucNo,
      vehicleType,
      vehicleNumber,
      driverName,
      helperName,
      trips,
      gateOutTime
    ];

    sheet.appendRow(rowData);
    var lastRow = sheet.getLastRow();
    formatDataRow(sheet, lastRow, vehicleType);

    if (entry.id) {
      syncedIds.push(entry.id);
    }
    tabRowMap[tabName] = (tabRowMap[tabName] || 0) + 1;
  }

  return {
    status: 'success',
    action: 'syncBatch',
    message: 'Synced ' + syncedIds.length + ' entries successfully',
    syncedCount: syncedIds.length,
    syncedIds: syncedIds,
    summary: tabRowMap
  };
}

/**
 * Get or create daily sheet.
 * If sheet doesn't exist:
 *   1. Duplicates Daily_Template if it exists.
 *   2. Or creates new sheet with standard header and styling.
 */
function getOrCreateDailySheet(ss, tabName) {
  var sheet = ss.getSheetByName(tabName);
  if (sheet) {
    return sheet;
  }

  var template = ss.getSheetByName(CONFIG.TEMPLATE_SHEET_NAME);
  if (template) {
    sheet = template.copyTo(ss);
    sheet.setName(tabName);
    sheet.showSheet();
    // Clear any sample data in rows >= 2
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    }
  } else {
    // Create new sheet from scratch
    sheet = ss.insertSheet(tabName);
    setupDailySheetHeaders(sheet);
  }

  // Move sheet towards the right
  try {
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(ss.getNumSheets());
  } catch (e) {
    // Ignore move error
  }

  return sheet;
}

/**
 * Format headers for a fresh daily sheet
 */
function setupDailySheetHeaders(sheet) {
  sheet.clear();
  sheet.appendRow(CONFIG.HEADERS);

  var headerRange = sheet.getRange(1, 1, 1, CONFIG.HEADERS.length);
  headerRange.setBackground('#0f172a'); // Slate 900
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(10);
  headerRange.setFontFamily('Arial');
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');
  sheet.setRowHeight(1, 38);

  // Set standard column widths
  sheet.setColumnWidth(1, 60);  // S No
  sheet.setColumnWidth(2, 130); // UC No
  sheet.setColumnWidth(3, 120); // Vehicle Type
  sheet.setColumnWidth(4, 110); // Vehicle Number
  sheet.setColumnWidth(5, 160); // Driver Name
  sheet.setColumnWidth(6, 160); // Helper Name
  sheet.setColumnWidth(7, 70);  // Trips
  sheet.setColumnWidth(8, 170); // Gate Out Time

  // Freeze top row
  sheet.setFrozenRows(1);
}

/**
 * Format an appended data row
 */
function formatDataRow(sheet, row, vehicleType) {
  var range = sheet.getRange(row, 1, 1, CONFIG.HEADERS.length);
  range.setFontFamily('Arial');
  range.setFontSize(9.5);
  range.setVerticalAlignment('middle');
  sheet.setRowHeight(row, 28);

  // Alternating light row backgrounds
  var isEven = (row % 2 === 0);
  var bgColor = isEven ? '#f8fafc' : '#ffffff';
  range.setBackground(bgColor);

  // Alignments:
  // S No: Center
  sheet.getRange(row, 1).setHorizontalAlignment('center').setFontWeight('bold');
  // UC No: Left
  sheet.getRange(row, 2).setHorizontalAlignment('left');
  // Vehicle Type: Center with slight tint
  var typeCell = sheet.getRange(row, 3).setHorizontalAlignment('center');
  if (vehicleType === 'Electric' || vehicleType === 'Small EV' || vehicleType === 'New Electric') {
    typeCell.setFontColor('#047857'); // Emerald green
    typeCell.setFontWeight('bold');
  } else {
    typeCell.setFontColor('#1e40af'); // Blue for Petroleum
    typeCell.setFontWeight('bold');
  }
  // Vehicle Number: Center bold
  sheet.getRange(row, 4).setHorizontalAlignment('center').setFontWeight('bold');
  // Driver: Left
  sheet.getRange(row, 5).setHorizontalAlignment('left');
  // Helper: Left
  sheet.getRange(row, 6).setHorizontalAlignment('left');
  // Trips: Center
  sheet.getRange(row, 7).setHorizontalAlignment('center').setFontWeight('bold');
  // Gate Out Time: Center
  sheet.getRange(row, 8).setHorizontalAlignment('center');
}

/**
 * Update or generate the Master_Dashboard tab with Zone & Vehicle Type aggregates.
 */
function updateMasterDashboard(ss) {
  try {
    var dashboard = ss.getSheetByName(CONFIG.MASTER_SHEET_NAME);
    if (!dashboard) {
      dashboard = ss.insertSheet(CONFIG.MASTER_SHEET_NAME, 0);
    }

    dashboard.clear();

    // Scan all daily sheets
    var sheets = ss.getSheets();
    var dailySheets = [];
    var totalExits = 0;
    var totalTrips = 0;
    var typeCounts = {
      'Petroleum': 0,
      'Electric': 0,
      'Small EV': 0,
      'New Electric': 0
    };
    var zoneCounts = {
      'Malir': { petroleum: 0, ev: 0, total: 0 },
      'Landhi': { petroleum: 0, ev: 0, total: 0 },
      'Memon Goth': { petroleum: 0, ev: 0, total: 0 },
      'Gulshan Hadeed': { petroleum: 0, ev: 0, total: 0 },
      'Extra Work': { petroleum: 0, ev: 0, total: 0 },
      'Other': { petroleum: 0, ev: 0, total: 0 }
    };

    // Regex matching "19-Nov", "1-Dec", etc.
    var dateSheetPattern = /^\d{1,2}-[A-Za-z]{3}$/;

    for (var s = 0; s < sheets.length; s++) {
      var sName = sheets[s].getName();
      if (dateSheetPattern.test(sName)) {
        dailySheets.push(sheets[s]);
        var lastRow = sheets[s].getLastRow();
        if (lastRow > 1) {
          var data = sheets[s].getRange(2, 1, lastRow - 1, 8).getValues();
          for (var r = 0; r < data.length; r++) {
            totalExits++;
            var uc = String(data[r][1] || '').trim();
            var vType = String(data[r][2] || 'Petroleum').trim();
            var tripNum = parseInt(data[r][6], 10) || 1;
            totalTrips += tripNum;

            if (typeCounts.hasOwnProperty(vType)) {
              typeCounts[vType]++;
            } else {
              typeCounts['Petroleum']++;
            }

            var isEV = (vType !== 'Petroleum');
            var matchedZone = 'Other';
            for (var z = 0; z < CONFIG.ZONES.length; z++) {
              if (uc.toLowerCase().indexOf(CONFIG.ZONES[z].toLowerCase()) !== -1) {
                matchedZone = CONFIG.ZONES[z];
                break;
              }
            }

            zoneCounts[matchedZone].total++;
            if (isEV) {
              zoneCounts[matchedZone].ev++;
            } else {
              zoneCounts[matchedZone].petroleum++;
            }
          }
        }
      }
    }

    // Render Master Dashboard styling
    var nowFormatted = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd-MMM-yyyy hh:mm a');

    // Title Banner
    dashboard.getRange('A1:F1').merge()
      .setValue('DISTRICT MALIR - MONTHLY FLEET GATE-EXIT MASTER DASHBOARD')
      .setBackground('#0f172a')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setFontSize(14)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
    dashboard.setRowHeight(1, 42);

    dashboard.getRange('A2:F2').merge()
      .setValue('Last Updated: ' + nowFormatted + ' | Total Daily Sheets: ' + dailySheets.length)
      .setFontColor('#64748b')
      .setFontSize(9)
      .setHorizontalAlignment('center');

    // Summary Metric Cards
    var totalEV = (typeCounts['Electric'] || 0) + (typeCounts['Small EV'] || 0) + (typeCounts['New Electric'] || 0);

    var kpis = [
      ['Total Gate Exits', totalExits],
      ['Total Trips Logged', totalTrips],
      ['Petroleum Exits', typeCounts['Petroleum'] || 0],
      ['EV Fleet Exits', totalEV]
    ];

    dashboard.getRange('A4:D4').setValues([[kpis[0][0], kpis[1][0], kpis[2][0], kpis[3][0]]])
      .setBackground('#1e293b')
      .setFontColor('#cbd5e1')
      .setFontWeight('bold')
      .setFontSize(10)
      .setHorizontalAlignment('center');

    dashboard.getRange('A5:D5').setValues([[kpis[0][1], kpis[1][1], kpis[2][1], kpis[3][1]]])
      .setBackground('#f8fafc')
      .setFontColor('#0f172a')
      .setFontWeight('bold')
      .setFontSize(16)
      .setHorizontalAlignment('center');

    dashboard.setRowHeight(4, 26);
    dashboard.setRowHeight(5, 36);

    // Section 1: Fleet Breakdown by Vehicle Type
    dashboard.getRange('A7:C7').merge().setValue('MONTHLY VEHICLE TYPE SUMMARY')
      .setFontWeight('bold').setFontSize(11).setFontColor('#0f172a');

    var typeHeader = [['Vehicle Type', 'Total Deployments', 'Share (%)']];
    dashboard.getRange('A8:C8').setValues(typeHeader)
      .setBackground('#334155').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');

    var typeRows = [
      ['Petroleum', typeCounts['Petroleum'] || 0, totalExits > 0 ? Math.round((typeCounts['Petroleum'] / totalExits) * 100) + '%' : '0%'],
      ['Electric', typeCounts['Electric'] || 0, totalExits > 0 ? Math.round((typeCounts['Electric'] / totalExits) * 100) + '%' : '0%'],
      ['Small EV', typeCounts['Small EV'] || 0, totalExits > 0 ? Math.round((typeCounts['Small EV'] / totalExits) * 100) + '%' : '0%'],
      ['New Electric', typeCounts['New Electric'] || 0, totalExits > 0 ? Math.round((typeCounts['New Electric'] / totalExits) * 100) + '%' : '0%'],
      ['TOTAL', totalExits, '100%']
    ];
    dashboard.getRange('A9:C13').setValues(typeRows).setHorizontalAlignment('center');
    dashboard.getRange('A13:C13').setFontWeight('bold').setBackground('#f1f5f9');

    // Section 2: Zone-wise Deployment Summary
    dashboard.getRange('A15:D15').merge().setValue('ZONE-WISE DEPLOYMENT SUMMARY')
      .setFontWeight('bold').setFontSize(11).setFontColor('#0f172a');

    var zoneHeader = [['Zone', 'Petroleum', 'EV Fleet', 'Total Exits']];
    dashboard.getRange('A16:D16').setValues(zoneHeader)
      .setBackground('#334155').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');

    var zoneData = [];
    var sumPetro = 0, sumEV = 0, sumTotal = 0;
    var allZoneKeys = CONFIG.ZONES.concat(['Other']);

    for (var k = 0; k < allZoneKeys.length; k++) {
      var zName = allZoneKeys[k];
      var zObj = zoneCounts[zName];
      sumPetro += zObj.petroleum;
      sumEV += zObj.ev;
      sumTotal += zObj.total;
      zoneData.push([zName, zObj.petroleum, zObj.ev, zObj.total]);
    }
    zoneData.push(['TOTAL', sumPetro, sumEV, sumTotal]);

    dashboard.getRange(17, 1, zoneData.length, 4).setValues(zoneData).setHorizontalAlignment('center');
    dashboard.getRange(17 + zoneData.length - 1, 1, 1, 4).setFontWeight('bold').setBackground('#f1f5f9');

    // Column widths
    dashboard.setColumnWidth(1, 160);
    dashboard.setColumnWidth(2, 140);
    dashboard.setColumnWidth(3, 140);
    dashboard.setColumnWidth(4, 140);
    dashboard.setColumnWidth(5, 120);
    dashboard.setColumnWidth(6, 120);

  } catch (err) {
    Logger.log('Dashboard update error: ' + err.toString());
  }
}

/**
 * Helper to determine tab name for a given date
 * format: dd-MMM (e.g. 19-Nov, 20-Nov)
 */
function getTabNameForDate(dateStr) {
  if (dateStr) {
    var parts = dateStr.split('-');
    if (parts.length === 3) {
      var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      if (!isNaN(d.getTime())) {
        return Utilities.formatDate(d, CONFIG.TIMEZONE, 'dd-MMM');
      }
    }
  }
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd-MMM');
}

/**
 * Returns today's tab name
 */
function getTodayTabName() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd-MMM');
}

/**
 * Create JSON HTTP Response with appropriate headers
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * One-click Setup Function
 * Run this function directly in Google Apps Script editor to initialize the workbook.
 */
function setupWorkbook() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Create Template sheet if not existing
  var template = ss.getSheetByName(CONFIG.TEMPLATE_SHEET_NAME);
  if (!template) {
    template = ss.insertSheet(CONFIG.TEMPLATE_SHEET_NAME);
    setupDailySheetHeaders(template);
    // Add sample guidance note
    template.getRange('A2').setNote('This is the template sheet. Daily tabs will duplicate this layout.');
  }

  // Create Today's tab
  var todayTab = getTodayTabName();
  getOrCreateDailySheet(ss, todayTab);

  // Create or refresh Master Dashboard
  updateMasterDashboard(ss);

  Logger.log('District Malir Fleet Workbook initialized successfully!');
  SpreadsheetApp.getUi().alert('District Malir Fleet Workbook Initialized Successfully!\n\n1. Template tab: ' + CONFIG.TEMPLATE_SHEET_NAME + '\n2. Today tab: ' + todayTab + '\n3. Master Dashboard: ' + CONFIG.MASTER_SHEET_NAME);
}

/**
 * Standalone Test Function
 * Run this in Apps Script editor to simulate a POST entry from the PWA.
 */
function testDoPost() {
  var mockEvent = {
    postData: {
      contents: JSON.stringify({
        action: 'addEntry',
        entry: {
          s_no: 1,
          date: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd'),
          gate_out_time: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd-MMM-yyyy hh:mm a'),
          uc_no: 'Gulshan Hadeed',
          vehicle_number: '717',
          vehicle_type: 'Petroleum',
          driver_name: 'M Kareem',
          helper_name: 'Lal M',
          trips: 1
        }
      })
    }
  };

  var response = doPost(mockEvent);
  Logger.log('testDoPost response: ' + response.getContent());
}
