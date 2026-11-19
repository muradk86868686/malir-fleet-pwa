/**
 * =========================================================================
 * Monthly & Daily Fleet Dashboard Analytics Controller
 * =========================================================================
 * Summary KPI cards, Zone-wise deployment matrix, Petroleum vs EV fleet metrics,
 * date picker inspector, and responsive Chart.js visual charts.
 * (Updated: Fleet size 155 = 92 Petroleum + 53 Electric + 10 Small EV).
 */

class DashboardController {
  constructor() {
    this.selectedDateStr = this.getTodayDateString();
    this.vehiclesMaster = [];
    this.zones = ['Malir', 'Landhi', 'Memon Goth', 'Gulshan Hadeed', 'Extra Work'];
    this.fleetStats = {
      totalVehicles: 155,
      totalPetroleum: 92,
      totalEV: 63,
      byType: { Petroleum: 92, Electric: 53, 'Small EV': 10 }
    };
    this.chartFleetMix = null;
    this.chartHourly = null;
    this.chartZones = null;
  }

  getTodayDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async init() {
    await this.loadVehiclesData();
    this.setupDateSelector();
    await this.renderDashboard();
  }

  async loadVehiclesData() {
    if (window.entryGridController && window.entryGridController.vehiclesMaster.length) {
      this.vehiclesMaster = window.entryGridController.vehiclesMaster;
      this.zones = window.entryGridController.zones || this.zones;
    } else {
      try {
        const resp = await fetch('./vehicles_master.json');
        const data = await resp.json();
        this.vehiclesMaster = data.vehicles || [];
        this.zones = data.zones || this.zones;
      } catch (e) {
        console.error('Failed to load vehicles master for dashboard:', e);
      }
    }

    this.fleetStats.totalVehicles = this.vehiclesMaster.length || 155;
    this.fleetStats.byType = { Petroleum: 0, Electric: 0, 'Small EV': 0 };
    this.vehiclesMaster.forEach((v) => {
      const t = v.vehicle_type || 'Petroleum';
      this.fleetStats.byType[t] = (this.fleetStats.byType[t] || 0) + 1;
    });
    this.fleetStats.totalPetroleum = this.fleetStats.byType['Petroleum'] || 92;
    this.fleetStats.totalEV = (this.fleetStats.byType['Electric'] || 0) + (this.fleetStats.byType['Small EV'] || 0);
  }

  setupDateSelector() {
    const dateInput = document.getElementById('dashboard-date-picker');
    const todayBtn = document.getElementById('btn-dashboard-today');

    if (dateInput) {
      dateInput.value = this.selectedDateStr;
      dateInput.addEventListener('change', async (e) => {
        this.selectedDateStr = e.target.value;
        await this.renderDashboard();
      });
    }

    if (todayBtn) {
      todayBtn.addEventListener('click', async () => {
        this.selectedDateStr = this.getTodayDateString();
        if (dateInput) dateInput.value = this.selectedDateStr;
        await this.renderDashboard();
      });
    }
  }

  async renderDashboard() {
    const entries = await window.fleetDB.getEntriesByDate(this.selectedDateStr);
    this.renderKPIs(entries);
    this.renderTypeBreakdownCards(entries);
    this.renderZoneTable(entries);
    this.renderCharts(entries);
  }

  renderKPIs(entries) {
    const uniqueVehicles = new Set(entries.map((e) => String(e.vehicle_number).trim()));
    const deployedUniqueCount = uniqueVehicles.size;

    let totalTrips = 0;
    entries.forEach((e) => {
      const tNum = parseInt(e.trips, 10);
      if (!isNaN(tNum) && tNum > 0) {
        totalTrips += tNum;
      }
    });

    let petrolDeployedSet = new Set();
    let evDeployedSet = new Set();

    entries.forEach((e) => {
      const vNum = String(e.vehicle_number).trim();
      if (e.vehicle_type === 'Petroleum') {
        petrolDeployedSet.add(vNum);
      } else {
        evDeployedSet.add(vNum);
      }
    });

    const petrolDeployed = petrolDeployedSet.size;
    const evDeployed = evDeployedSet.size;
    const petrolPending = Math.max(0, this.fleetStats.totalPetroleum - petrolDeployed);
    const evPending = Math.max(0, this.fleetStats.totalEV - evDeployed);

    const kpiTotal = document.getElementById('kpi-total-deployed');
    const kpiPetrol = document.getElementById('kpi-petrol-deployed');
    const kpiPetrolPending = document.getElementById('kpi-petrol-pending');
    const kpiEV = document.getElementById('kpi-ev-deployed');
    const kpiEVPending = document.getElementById('kpi-ev-pending');
    const kpiTrips = document.getElementById('kpi-total-trips');

    if (kpiTotal) kpiTotal.textContent = `${deployedUniqueCount} / ${this.fleetStats.totalVehicles}`;
    if (kpiPetrol) kpiPetrol.textContent = petrolDeployed;
    if (kpiPetrolPending) kpiPetrolPending.textContent = `${petrolPending} Pending`;
    if (kpiEV) kpiEV.textContent = evDeployed;
    if (kpiEVPending) kpiEVPending.textContent = `${evPending} Pending`;
    if (kpiTrips) kpiTrips.textContent = totalTrips || entries.length;
  }

  renderTypeBreakdownCards(entries) {
    const typeDeployed = {
      'Petroleum': 0,
      'Electric': 0,
      'Small EV': 0
    };

    entries.forEach((e) => {
      const t = e.vehicle_type || 'Petroleum';
      if (typeDeployed.hasOwnProperty(t)) {
        typeDeployed[t]++;
      } else {
        typeDeployed['Petroleum']++;
      }
    });

    const petroEl = document.getElementById('card-type-petroleum');
    const elecEl = document.getElementById('card-type-electric');
    const smallEl = document.getElementById('card-type-smallev');

    if (petroEl) petroEl.textContent = `${typeDeployed['Petroleum']} / ${this.fleetStats.byType['Petroleum'] || 92}`;
    if (elecEl) elecEl.textContent = `${typeDeployed['Electric']} / ${this.fleetStats.byType['Electric'] || 53}`;
    if (smallEl) smallEl.textContent = `${typeDeployed['Small EV']} / ${this.fleetStats.byType['Small EV'] || 10}`;
  }

  renderZoneTable(entries) {
    const tbody = document.getElementById('dashboard-zone-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const zoneStats = {};
    const allZones = [...this.zones, 'Other'];

    allZones.forEach((z) => {
      zoneStats[z] = { petroleum: 0, ev: 0, trips: 0, total: 0 };
    });

    entries.forEach((e) => {
      const uc = String(e.uc_no || '').toLowerCase();
      const vType = e.vehicle_type || 'Petroleum';
      const isEV = vType !== 'Petroleum';
      const trips = parseInt(e.trips, 10) || 1;

      let matchedZone = 'Other';
      for (const z of this.zones) {
        if (uc.includes(z.toLowerCase())) {
          matchedZone = z;
          break;
        }
      }

      zoneStats[matchedZone].total++;
      zoneStats[matchedZone].trips += trips;
      if (isEV) {
        zoneStats[matchedZone].ev++;
      } else {
        zoneStats[matchedZone].petroleum++;
      }
    });

    let grandPetro = 0, grandEV = 0, grandTrips = 0, grandTotal = 0;

    allZones.forEach((z) => {
      const s = zoneStats[z];
      grandPetro += s.petroleum;
      grandEV += s.ev;
      grandTrips += s.trips;
      grandTotal += s.total;

      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-200 dark:border-slate-800 text-xs sm:text-sm hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors';
      tr.innerHTML = `
        <td class="px-3 py-2 font-bold text-slate-800 dark:text-slate-200">${z}</td>
        <td class="px-3 py-2 text-center text-blue-600 dark:text-blue-400 font-semibold">${s.petroleum}</td>
        <td class="px-3 py-2 text-center text-emerald-600 dark:text-emerald-400 font-semibold">${s.ev}</td>
        <td class="px-3 py-2 text-center font-bold text-slate-700 dark:text-slate-300">${s.trips}</td>
        <td class="px-3 py-2 text-center font-extrabold text-slate-900 dark:text-white">${s.total}</td>
      `;
      tbody.appendChild(tr);
    });

    const totalRow = document.createElement('tr');
    totalRow.className = 'bg-slate-100 dark:bg-slate-800 font-bold text-xs sm:text-sm';
    totalRow.innerHTML = `
      <td class="px-3 py-2 text-slate-900 dark:text-white uppercase font-black">TOTAL</td>
      <td class="px-3 py-2 text-center text-blue-600 dark:text-blue-400 font-black">${grandPetro}</td>
      <td class="px-3 py-2 text-center text-emerald-600 dark:text-emerald-400 font-black">${grandEV}</td>
      <td class="px-3 py-2 text-center font-black">${grandTrips}</td>
      <td class="px-3 py-2 text-center font-black text-slate-900 dark:text-white">${grandTotal}</td>
    `;
    tbody.appendChild(totalRow);
  }

  renderCharts(entries) {
    if (typeof Chart === 'undefined') return;

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#cbd5e1' : '#334155';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';

    const typeDeployed = {
      'Petroleum': 0,
      'Electric': 0,
      'Small EV': 0
    };
    entries.forEach((e) => {
      const t = e.vehicle_type || 'Petroleum';
      if (typeDeployed.hasOwnProperty(t)) typeDeployed[t]++;
      else typeDeployed['Petroleum']++;
    });

    const ctxMix = document.getElementById('chart-fleet-mix')?.getContext('2d');
    if (ctxMix) {
      if (this.chartFleetMix) this.chartFleetMix.destroy();
      this.chartFleetMix = new Chart(ctxMix, {
        type: 'doughnut',
        data: {
          labels: ['Petroleum', 'Electric', 'Small EV'],
          datasets: [{
            data: [
              typeDeployed['Petroleum'],
              typeDeployed['Electric'],
              typeDeployed['Small EV']
            ],
            backgroundColor: ['#2563eb', '#10b981', '#f59e0b'],
            borderWidth: 2,
            borderColor: isDark ? '#1e293b' : '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: textColor, font: { size: 11, weight: 'bold' }, padding: 12 }
            }
          },
          cutout: '65%'
        }
      });
    }

    const hours = ['05:00', '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'];
    const hourlyCounts = new Array(hours.length).fill(0);

    entries.forEach((e) => {
      const timeStr = String(e.gate_out_time || '');
      const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      if (match) {
        let hour = parseInt(match[1], 10);
        const ampm = (match[3] || '').toUpperCase();
        if (ampm === 'PM' && hour < 12) hour += 12;
        if (ampm === 'AM' && hour === 12) hour = 0;

        const idx = hour - 5;
        if (idx >= 0 && idx < hours.length) {
          hourlyCounts[idx]++;
        }
      }
    });

    const ctxHourly = document.getElementById('chart-hourly-trend')?.getContext('2d');
    if (ctxHourly) {
      if (this.chartHourly) this.chartHourly.destroy();
      this.chartHourly = new Chart(ctxHourly, {
        type: 'bar',
        data: {
          labels: hours,
          datasets: [{
            label: 'Gate Exits',
            data: hourlyCounts,
            backgroundColor: '#0ea5e9',
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              ticks: { color: textColor, font: { size: 10 } },
              grid: { display: false }
            },
            y: {
              ticks: { color: textColor, precision: 0, font: { size: 10 } },
              grid: { color: gridColor },
              beginAtZero: true
            }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });
    }

    const zoneCounts = this.zones.map((z) => {
      return entries.filter((e) => (e.uc_no || '').toLowerCase().includes(z.toLowerCase())).length;
    });

    const ctxZones = document.getElementById('chart-zones-distribution')?.getContext('2d');
    if (ctxZones) {
      if (this.chartZones) this.chartZones.destroy();
      this.chartZones = new Chart(ctxZones, {
        type: 'bar',
        data: {
          labels: this.zones,
          datasets: [{
            label: 'Vehicles Deployed',
            data: zoneCounts,
            backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'],
            borderRadius: 4
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              ticks: { color: textColor, precision: 0 },
              grid: { color: gridColor },
              beginAtZero: true
            },
            y: {
              ticks: { color: textColor, font: { weight: 'bold' } },
              grid: { display: false }
            }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });
    }
  }

  updateChartsTheme() {
    this.renderCharts(this.lastEntries || []);
  }
}

window.dashboardController = new DashboardController();
