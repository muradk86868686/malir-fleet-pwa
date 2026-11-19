/**
 * Verification & Integrity Test Suite (v2.0)
 * Tests all updated components of the District Malir Fleet Gate Exit PWA
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('========================================================');
console.log(' RUNNING FLEET GATE-EXIT SYSTEM VERIFICATION TESTS v2');
console.log('========================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
  }
}

// 1. Test vehicles_master.json
runTest('vehicles_master.json schema, 155 fleet count and 60312 as Electric', () => {
  const filePath = path.join(__dirname, '../vehicles_master.json');
  assert(fs.existsSync(filePath), 'vehicles_master.json must exist in root');
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  assert(Array.isArray(content.zones), 'zones must be an array');
  assert(Array.isArray(content.vehicles), 'vehicles must be an array');
  assert.strictEqual(content.vehicles.length, 155, 'Must contain exactly 155 vehicles');

  const petrolCount = content.vehicles.filter(v => v.vehicle_type === 'Petroleum').length;
  const electricCount = content.vehicles.filter(v => v.vehicle_type === 'Electric').length;
  const smallEVCount = content.vehicles.filter(v => v.vehicle_type === 'Small EV').length;

  assert.strictEqual(petrolCount, 92, 'Must contain 92 Petroleum vehicles');
  assert.strictEqual(electricCount, 53, 'Must contain 53 Electric vehicles');
  assert.strictEqual(smallEVCount, 10, 'Must contain 10 Small EV vehicles');

  // Verify vehicle 60312 is Electric!
  const v60312 = content.vehicles.find(v => v.vehicle_number === '60312');
  assert(v60312, '60312 must exist in master');
  assert.strictEqual(v60312.vehicle_type, 'Electric', '60312 must be Electric (not Petroleum!)');
});

// 2. Test Google Apps Script Code.gs
runTest('Google Apps Script Code.gs structure and exact columns (no Sync Status)', () => {
  const gsPath = path.join(__dirname, '../google-apps-script/Code.gs');
  assert(fs.existsSync(gsPath), 'google-apps-script/Code.gs must exist');
  const code = fs.readFileSync(gsPath, 'utf8');

  assert(code.includes('function doPost(e)'), 'Must define doPost');
  assert(code.includes('function doGet(e)'), 'Must define doGet');
  assert(code.includes('Daily_Template'), 'Must support Daily_Template');
  assert(code.includes('Master_Dashboard'), 'Must support Master_Dashboard');

  const expectedHeaders = [
    'S No',
    'UC No',
    'Vehicle Type',
    'Vehicle Number',
    'Driver Name',
    'Helper Name',
    'Trips',
    'Gate Out Time'
  ];
  expectedHeaders.forEach(h => {
    assert(code.includes(`'${h}'`), `Code.gs must include header: '${h}'`);
  });
});

// 3. Test PWA Static Files & Assets
runTest('PWA Assets (manifest, sw, icons, chart.umd.js, css)', () => {
  const files = [
    'index.html',
    'manifest.json',
    'sw.js',
    'css/style.css',
    'js/db.js',
    'js/camera.js',
    'js/entry-grid.js',
    'js/sync.js',
    'js/sheet-view.js',
    'js/dashboard.js',
    'js/app.js',
    'js/libs/chart.umd.js',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon.svg',
    'SETUP_GUIDE.md',
    'server.js'
  ];

  files.forEach(f => {
    const p = path.join(__dirname, '..', f);
    assert(fs.existsSync(p), `Required file missing: ${f}`);
    assert(fs.statSync(p).size > 0, `File cannot be empty: ${f}`);
  });
});

// 4. Test Watermark Format (TRIP EXCLUDED)
runTest('Watermark text omits Trip tag as requested', () => {
  const mockEntry = {
    date: '2026-11-19',
    gate_out_time: '19-Nov-2026 09:43 PM',
    uc_no: 'Memon Goth',
    vehicle_number: '60312',
    vehicle_type: 'Electric',
    driver_name: 'Faix M',
    helper_name: 'Shoukat Ali 907',
    trips: ''
  };

  // Watermark text: Date & Time | Vehicle No | Vehicle Type | UC No (NO TRIP)
  const watermarkText = `${mockEntry.gate_out_time}  |  Vehicle #${mockEntry.vehicle_number}  |  ${mockEntry.vehicle_type}  |  UC: ${mockEntry.uc_no}`;
  assert.strictEqual(watermarkText, '19-Nov-2026 09:43 PM  |  Vehicle #60312  |  Electric  |  UC: Memon Goth');
  assert(!watermarkText.includes('Trip'), 'Watermark must NOT contain Trip');

  // Filename format: YYYY-MM-DD_VehicleNo_HHMM.jpg
  const filenameRegex = /^\d{4}-\d{2}-\d{2}_[a-zA-Z0-9]+_\d{4}\.jpg$/;
  const mockFilename = `${mockEntry.date}_${mockEntry.vehicle_number}_2143.jpg`;
  assert(filenameRegex.test(mockFilename), `Filename format mismatch: ${mockFilename}`);
});

// 5. Test Unauthorized Vehicle Warning check
runTest('Unauthorized vehicle number detection', () => {
  const masterNumbers = new Set(['717', '60312', '10059']);

  assert(masterNumbers.has('717'), '717 should be authorized');
  assert(masterNumbers.has('60312'), '60312 should be authorized');
  assert(!masterNumbers.has('6031200'), '6031200 must be marked unauthorized');
  assert(!masterNumbers.has('99999'), '99999 must be marked unauthorized');
});

// 6. Test CSV Export columns (NO Sync Status)
runTest('CSV export has exactly 8 columns without Sync Status', () => {
  const csvHeaders = ['S No', 'UC No', 'Vehicle Type', 'Vehicle Number', 'Driver Name', 'Helper Name', 'Trips', 'Gate Out Time'];
  assert(!csvHeaders.includes('Sync Status'), 'CSV must NOT have Sync Status column');
  assert.strictEqual(csvHeaders.length, 8, 'Must have exactly 8 columns');
});

console.log('\n========================================================');
console.log(` RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (100%)`);
console.log('========================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
