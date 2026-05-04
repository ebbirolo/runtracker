class RunTracker {
  constructor() {
    this.isTracking = false;
    this.isPaused = false;
    this.runMode = 'track';
    this.startTime = null;
    this.pauseTime = null;
    this.totalPauseTime = 0;
    this.positions = [];
    this.totalDistance = 0;
    this.watchId = null;
    this.currentRoute = null;
    this.ghostData = null;
    this.sectors = { s1: null, s2: null, s3: null };
    this.currentSector = 0;
    this.sectorStartTime = 0;
    this.laps = [];
    this.currentLap = 0;
    this.lapStartTime = null;
    this.lapDistance = 0;
    this.bestLapTime = null;
    this.hasLeftStart = false;
    this.routeToSave = null;

    this.map = null;
    this.routeLayer = null;
    this.currentLayer = null;
    this.ghostLayer = null;
    this.sectorMarkers = [];
    this.userMarker = null;

    this.initMap();
    this.bindEvents();
    this.loadSavedRoutes();
  }

  initMap() {
    this.map = L.map('map', {
      zoomControl: false,
      attributionControl: false,
      doubleClickZoom: false
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(this.map);

    this.map.locate({ setView: true, maxZoom: 16 });
    this.map.on('locationfound', (e) => {
      if (!this.isTracking && this.positions.length === 0) {
        this.map.setView(e.latlng, 16);
      }
    });
  }

  bindEvents() {
    document.getElementById('startBtn').addEventListener('click', () => this.start());
    document.getElementById('pauseBtn').addEventListener('click', () => this.togglePause());
    document.getElementById('stopBtn').addEventListener('click', () => this.stop());
    document.getElementById('saveRouteBtn').addEventListener('click', () => this.showSaveModal());
    document.getElementById('loadRouteBtn').addEventListener('click', () => this.showLoadModal());
    document.getElementById('closeModalBtn').addEventListener('click', () => this.hideModals());
    document.getElementById('confirmSaveBtn').addEventListener('click', () => this.saveRoute());
    document.getElementById('cancelSaveBtn').addEventListener('click', () => this.hideModals());
    document.getElementById('circuitMode').addEventListener('click', () => this.setMode('circuit'));
    document.getElementById('trackMode').addEventListener('click', () => this.setMode('track'));
    document.getElementById('settingsBtn').addEventListener('click', () => this.showSettings());
    document.getElementById('closeSettingsBtn').addEventListener('click', () => this.hideModals());
    document.getElementById('darkModeToggle').addEventListener('change', (e) => this.toggleDarkMode(e));
    document.getElementById('clearDataBtn').addEventListener('click', () => this.clearAllData());
  }

  setMode(mode) {
    this.runMode = mode;
    document.getElementById('circuitMode').classList.toggle('active', mode === 'circuit');
    document.getElementById('trackMode').classList.toggle('active', mode === 'track');
    document.getElementById('lapDisplay').style.display = mode === 'circuit' ? 'flex' : 'none';
    this.clearSectors();
  }

  start() {
    if (!('geolocation' in navigator)) {
      alert('Geolocation is not supported');
      return;
    }

    this.isTracking = true;
    this.isPaused = false;
    this.startTime = Date.now();
    this.totalPauseTime = 0;
    this.positions = [];
    this.totalDistance = 0;
    this.currentSector = 0;
    this.sectorStartTime = Date.now();
    this.laps = [];
    this.currentLap = 0;
    this.lapStartTime = Date.now();
    this.lapDistance = 0;
    this.hasLeftStart = false;
    this.startPos = null;
    this.telemetryActive = false;
    this.countdown = 3;

    this.updateButtonStates();
    this.setStatus('Get ready... 3');

    // Countdown before tracking starts (larger numbers: 3, 2, 1)
    const countdownInterval = setInterval(() => {
      this.countdown--;
      if (this.countdown > 0) {
        this.setStatus(`Get ready... ${this.countdown}`);
      } else {
        clearInterval(countdownInterval);
        this.startTracking();
      }
    }, 500);
  }

  startTracking() {
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onPosition(pos),
      (err) => this.onError(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    this.timerInterval = setInterval(() => this.updateTimer(), 1000);

    if (this.currentRoute && this.currentRoute.ghost) {
      this.startGhostRun();
    }

    // Show fullscreen timer when tracking starts
    document.getElementById('fullscreenTimer').style.display = 'flex';
  }

  startGhostRun() {
    const bestRun = this.currentRoute.ghost;
    this.ghostData = {
      startTime: Date.now(),
      positions: bestRun.positions,
      totalDistance: bestRun.distance
    };

    if (this.ghostLayer) {
      this.map.removeLayer(this.ghostLayer);
    }

    const ghostCoords = bestRun.positions.map(p => [p.latitude, p.longitude]);
    this.ghostLayer = L.polyline(ghostCoords, {
      color: '#FF3B30',
      opacity: 0.5,
      weight: 4,
      dashArray: '10, 10'
    }).addTo(this.map);

    this.ghostMarker = L.marker(ghostCoords[0], {
      icon: L.divIcon({
        className: 'ghost-marker',
        html: '<div style="width:20px;height:20px;background:#FF3B30;border-radius:50%;border:3px solid white;"></div>',
        iconSize: [20, 20]
      })
    }).addTo(this.map);

    if (ghostCoords.length > 1) {
      this.map.fitBounds(L.latLngBounds(ghostCoords), { padding: [50, 50] });
    }
  }

  togglePause() {
    if (this.isPaused) {
      this.isPaused = false;
      this.startTime += Date.now() - this.pauseTime;
      document.getElementById('pauseBtn').textContent = 'Pause';
      this.setStatus('Tracking...');
      this.timerInterval = setInterval(() => this.updateTimer(), 1000);
    } else {
      this.isPaused = true;
      this.pauseTime = Date.now();
      document.getElementById('pauseBtn').textContent = 'Resume';
      this.setStatus('Paused');
      clearInterval(this.timerInterval);
    }
  }

  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    clearInterval(this.timerInterval);

    // Hide fullscreen timer when stopped
    document.getElementById('fullscreenTimer').style.display = 'none';

    this.isTracking = false;
    this.telemetryActive = false;
    this.updateButtonStates();
    this.setStatus('Run saved');

    this.saveRun();

    if (this.ghostLayer) {
      this.map.removeLayer(this.ghostLayer);
      this.ghostLayer = null;
    }
    if (this.ghostMarker) {
      this.map.removeLayer(this.ghostMarker);
      this.ghostMarker = null;
    }
    this.ghostData = null;
  }

  onPosition(position) {
    const { latitude, longitude, speed } = position.coords;
    const timestamp = Date.now();
    const elapsed = timestamp - this.startTime - this.totalPauseTime;
    const speedKmh = (speed || 0) * 3.6;

    // Calculate distance for this position
    let segmentDist = 0;
    if (this.positions.length > 0) {
      const lastPos = this.positions[this.positions.length - 1];
      segmentDist = this.haversineDistance(
        lastPos.latitude, lastPos.longitude,
        latitude, longitude
      );
    }

    // Check if telemetry should activate (0.05km, 15s, or 1km/h)
    if (!this.telemetryActive) {
      this.totalDistance += segmentDist;
      const shouldActivate =
        this.totalDistance >= 50 ||           // 0.05km = 50m
        elapsed >= 15000 ||                   // 15 seconds
        speedKmh >= 1;                        // 1 km/h

      if (shouldActivate) {
        this.telemetryActive = true;
        this.setStatus('Tracking...');
        // Reset distance for actual run tracking
        this.totalDistance = 0;
      } else {
        // Still collecting positions but not tracking telemetry
        const newPos = { latitude, longitude, speed: speed || 0, timestamp, elapsed, cumulativeDistance: this.totalDistance };
        this.positions.push(newPos);
        this.startPos = this.startPos || { latitude, longitude };
        this.updateMap(latitude, longitude);
        return;
      }
    }

    const newPos = { latitude, longitude, speed: speed || 0, timestamp, elapsed };

    if (this.positions.length > 0 && this.telemetryActive) {
      this.totalDistance += segmentDist;
      newPos.cumulativeDistance = this.totalDistance;
    } else {
      newPos.cumulativeDistance = 0;
      this.startPos = this.startPos || { latitude, longitude };
    }

    this.positions.push(newPos);

    if (this.runMode === 'circuit') {
      this.detectLap(latitude, longitude);
    } else {
      this.detectSectorsTrackMode();
    }

    document.getElementById('distance').textContent = (this.totalDistance / 1000).toFixed(2);

    if (speed && speed > 0) {
      document.getElementById('speed').textContent = speedKmh.toFixed(1);
    }

    this.updateMap(latitude, longitude);
    this.updateGhostComparison(elapsed, this.totalDistance);

    if (this.positions.length >= 10 && !this.routeToSave) {
      this.routeToSave = this.positions.slice();
      document.getElementById('saveRouteBtn').disabled = false;
    }
  }

  detectLap(lat, lng) {
    if (!this.startPos) return;

    const distFromStart = this.haversineDistance(this.startPos.latitude, this.startPos.longitude, lat, lng);

    if (!this.hasLeftStart && distFromStart > 15) {
      this.hasLeftStart = true;
    }

    if (this.hasLeftStart && distFromStart < 15) {
      const lapTime = Date.now() - this.lapStartTime;
      this.laps.push(lapTime);
      this.currentLap++;
      this.lapStartTime = Date.now();
      this.lapDistance = 0;
      this.currentSector = 0;
      this.sectorStartTime = Date.now();

      document.getElementById('lapCount').textContent = this.currentLap;

      if (this.bestLapTime === null || lapTime < this.bestLapTime) {
        this.bestLapTime = lapTime;
        document.getElementById('bestLap').textContent = this.formatTime(lapTime);
      }

      this.clearSectors();
      this.calculateCircuitSectors();
      this.setStatus(`Lap ${this.currentLap} started`);
    }
  }

  calculateCircuitSectors() {
    if (this.lapDistance === 0) return;

    const sectorDist = this.lapDistance / 3;
    const cumulative = this.positions.slice(-Math.min(50, this.positions.length));

    let s1Dist = Infinity, s2Dist = Infinity;
    for (let i = 0; i < cumulative.length; i++) {
      const d = cumulative[i].cumulativeDistance - (this.totalDistance - this.lapDistance);
      if (Math.abs(d - sectorDist) < s1Dist) { s1Dist = Math.abs(d - sectorDist); this.sectors.s1 = cumulative[i]; }
      if (Math.abs(d - sectorDist * 2) < s2Dist) { s2Dist = Math.abs(d - sectorDist * 2); this.sectors.s2 = cumulative[i]; }
    }
    this.sectors.s3 = cumulative[cumulative.length - 1];

    this.drawSectorMarkers();
  }

  detectSectorsTrackMode() {
    if (!this.currentRoute || !this.currentRoute.distance) return;

    const totalDist = this.currentRoute.distance * 1000;
    const s1Dist = totalDist / 3;
    const s2Dist = totalDist * 2 / 3;

    if (this.currentSector < 1 && this.totalDistance >= s1Dist) {
      this.sectorComplete(1);
    } else if (this.currentSector < 2 && this.totalDistance >= s2Dist) {
      this.sectorComplete(2);
    } else if (this.currentSector < 3 && this.totalDistance >= totalDist * 0.95) {
      this.sectorComplete(3);
    }
  }

  sectorComplete(num) {
    this.currentSector = num;
    const sectorTime = Date.now() - this.sectorStartTime;
    this.sectorStartTime = Date.now();

    const el = document.getElementById(`sector${num}`);
    el.textContent = this.formatTime(sectorTime);

    if (this.currentRoute && this.currentRoute.bestSectors && this.currentRoute.bestSectors[num - 1]) {
      const best = this.currentRoute.bestSectors[num - 1];
      const diff = sectorTime - best;
      el.classList.toggle('ahead', diff < 0);
      el.classList.toggle('behind', diff > 0);
    }
  }

  drawSectorMarkers() {
    this.clearSectors();

    Object.values(this.sectors).forEach((sector, idx) => {
      if (sector) {
        const marker = L.circleMarker([sector.latitude, sector.longitude], {
          radius: 8,
          color: ['#007AFF', '#FF9500', '#34C759'][idx],
          fillColor: ['#007AFF', '#FF9500', '#34C759'][idx],
          fillOpacity: 0.8,
          weight: 2
        }).addTo(this.map);
        this.sectorMarkers.push(marker);
      }
    });
  }

  clearSectors() {
    this.sectorMarkers.forEach(m => this.map.removeLayer(m));
    this.sectorMarkers = [];
  }

  updateGhostComparison(elapsed, distance) {
    if (!this.ghostData) return;

    const ghostPos = this.interpolateGhost(elapsed);
    if (!ghostPos) return;

    const ghostElapsed = this.getGhostTimeAtDistance(distance);
    if (ghostElapsed === null) return;

    const diff = elapsed - ghostElapsed;
    const sign = diff >= 0 ? '+' : '-';
    const absDiff = Math.abs(diff);

    const splitEl = document.getElementById('splitDisplay');
    const splitText = document.getElementById('splitText');

    if (absDiff < 1000) {
      splitText.textContent = `${sign}${(absDiff / 1000).toFixed(1)}s vs ghost`;
      splitEl.className = `split-display ${diff < 0 ? 'ahead' : 'behind'}`;
    } else {
      const mins = Math.floor(absDiff / 60000);
      const secs = (absDiff % 60000) / 1000;
      splitText.textContent = `${sign}${mins}:${String(Math.floor(secs)).padStart(2, '0')} vs ghost`;
      splitEl.className = `split-display ${diff < 0 ? 'ahead' : 'behind'}`;
    }

    if (this.ghostMarker && ghostPos) {
      this.ghostMarker.setLatLng([ghostPos.latitude, ghostPos.longitude]);
    }
  }

  interpolateGhost(elapsed) {
    const positions = this.ghostData.positions;
    for (let i = 0; i < positions.length - 1; i++) {
      if (positions[i].elapsed <= elapsed && positions[i + 1].elapsed >= elapsed) {
        const ratio = (elapsed - positions[i].elapsed) / (positions[i + 1].elapsed - positions[i].elapsed);
        return {
          latitude: positions[i].latitude + (positions[i + 1].latitude - positions[i].latitude) * ratio,
          longitude: positions[i].longitude + (positions[i + 1].longitude - positions[i].longitude) * ratio
        };
      }
    }
    return positions[positions.length - 1];
  }

  getGhostTimeAtDistance(distance) {
    const positions = this.ghostData.positions;
    for (let i = positions.length - 1; i >= 0; i--) {
      if (positions[i].cumulativeDistance !== undefined && positions[i].cumulativeDistance <= distance) {
        return positions[i].elapsed;
      }
    }
    return positions[0]?.elapsed || null;
  }

  onError(error) {
    console.error('GPS Error:', error);
    this.setStatus('GPS signal lost');
  }

  updateTimer() {
    if (!this.startTime || this.isPaused) return;

    const elapsed = Date.now() - this.startTime - this.totalPauseTime;
    document.getElementById('time').textContent = this.formatTime(elapsed);

    if (this.totalDistance > 0) {
      const distanceKm = this.totalDistance / 1000;
      const paceSeconds = elapsed / 1000 / distanceKm;
      const paceMin = Math.floor(paceSeconds / 60);
      const paceSec = Math.floor(paceSeconds % 60);
      document.getElementById('pace').textContent = `${String(paceMin).padStart(2, '0')}:${String(paceSec).padStart(2, '0')}`;
    }

    if (this.runMode === 'circuit' && this.hasLeftStart) {
      const lapElapsed = Date.now() - this.lapStartTime;
      const sectorElapsed = Date.now() - this.sectorStartTime;

      if (this.currentSector === 0 && lapElapsed > 0) {
        document.getElementById('sector1').textContent = this.formatTime(sectorElapsed);
      } else if (this.currentSector === 1) {
        document.getElementById('sector2').textContent = this.formatTime(sectorElapsed);
      } else if (this.currentSector === 2) {
        document.getElementById('sector3').textContent = this.formatTime(sectorElapsed);
      }
    }
  }

  updateMap(lat, lng) {
    if (this.userMarker) {
      this.userMarker.setLatLng([lat, lng]);
    } else {
      this.userMarker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'user-marker',
          html: '<div style="width:16px;height:16px;background:#34C759;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>',
          iconSize: [16, 16]
        })
      }).addTo(this.map);
    }

    if (this.currentLayer) {
      this.map.removeLayer(this.currentLayer);
    }

    const coords = this.positions.map(p => [p.latitude, p.longitude]);
    this.currentLayer = L.polyline(coords, {
      color: '#34C759',
      opacity: 0.8,
      weight: 5
    }).addTo(this.map);

    if (this.positions.length > 5) {
      this.map.setView([lat, lng], 17);
    }
  }

  saveRun() {
    const run = {
      id: Date.now(),
      date: new Date().toISOString(),
      routeId: this.currentRoute?.id,
      mode: this.runMode,
      distance: this.totalDistance,
      time: this.totalDistance / 1000 > 0 ? this.totalPauseTime : Date.now() - this.startTime - this.totalPauseTime,
      positions: this.positions.map(p => ({ ...p })),
      laps: this.laps,
      sectors: this.sectors
    };

    let runs = JSON.parse(localStorage.getItem('runHistory') || '[]');
    runs.unshift(run);
    runs = runs.slice(0, 20);
    localStorage.setItem('runHistory', JSON.stringify(runs));

    if (this.currentRoute) {
      this.updateBestTime(run);
    }
  }

  updateBestTime(run) {
    const routes = JSON.parse(localStorage.getItem('routes') || '[]');
    const routeIdx = routes.findIndex(r => r.id === this.currentRoute.id);
    if (routeIdx === -1) return;

    const elapsed = Date.now() - this.startTime - this.totalPauseTime;
    const currentBest = routes[routeIdx].bestTime;

    if (!currentBest || elapsed < currentBest) {
      routes[routeIdx].bestTime = elapsed;
      routes[routeIdx].ghost = {
        positions: run.positions,
        distance: run.distance
      };
      localStorage.setItem('routes', JSON.stringify(routes));
      this.setStatus('New best time!');
    }
  }

  showSaveModal() {
    if (!this.routeToSave) return;
    document.getElementById('saveModal').style.display = 'flex';
    document.getElementById('routeName').focus();
  }

  saveRoute() {
    const name = document.getElementById('routeName').value.trim();
    if (!name) return;

    const route = {
      id: Date.now(),
      name,
      mode: this.runMode,
      coords: this.routeToSave.map(p => ({ latitude: p.latitude, longitude: p.longitude })),
      distance: this.totalDistance,
      bestTime: null,
      bestSectors: null
    };

    let routes = JSON.parse(localStorage.getItem('routes') || '[]');
    routes.push(route);
    localStorage.setItem('routes', JSON.stringify(routes));

    this.hideModals();
    this.setStatus(`Route "${name}" saved`);
    this.routeToSave = null;
    document.getElementById('saveRouteBtn').disabled = true;
  }

  showLoadModal() {
    const routes = JSON.parse(localStorage.getItem('routes') || '[]');
    const list = document.getElementById('routeList');

    if (routes.length === 0) {
      list.innerHTML = '<li style="color:#8E8E93;justify-content:center;">No saved routes</li>';
    } else {
      list.innerHTML = routes.map(r => `
        <li onclick="window.tracker.loadRoute(${r.id})">
          <span>${r.name}</span>
          <span style="color:#8E8E93;font-size:12px;">${r.mode} • ${(r.distance/1000).toFixed(2)}km</span>
        </li>
      `).join('');
    }

    document.getElementById('loadModal').style.display = 'flex';
  }

  loadRoute(routeId) {
    const routes = JSON.parse(localStorage.getItem('routes') || '[]');
    const route = routes.find(r => r.id === routeId);
    if (!route) return;

    this.currentRoute = route;
    this.hideModals();

    if (this.routeLayer) {
      this.map.removeLayer(this.routeLayer);
    }

    const coords = route.coords.map(c => [c.latitude, c.longitude]);
    this.routeLayer = L.polyline(coords, {
      color: '#007AFF',
      opacity: 0.6,
      weight: 3,
      dashArray: '5, 10'
    }).addTo(this.map);

    if (coords.length > 1) {
      this.map.fitBounds(L.latLngBounds(coords), { padding: [50, 50] });
    }

    if (route.bestTime) {
      this.setStatus(`Loaded "${route.name}" - Best: ${this.formatTime(route.bestTime)}`);
    } else {
      this.setStatus(`Loaded "${route.name}"`);
    }

    this.drawSectorMarkersForRoute();
  }

  drawSectorMarkersForRoute() {
    this.clearSectors();
    if (!this.currentRoute || !this.currentRoute.coords) return;

    const coords = this.currentRoute.coords;
    const total = coords.length;
    const s1Idx = Math.floor(total / 3);
    const s2Idx = Math.floor(total * 2 / 3);

    [s1Idx, s2Idx, total - 1].forEach((idx, i) => {
      if (coords[idx]) {
        const marker = L.circleMarker([coords[idx].latitude, coords[idx].longitude], {
          radius: 8,
          color: ['#007AFF', '#FF9500', '#34C759'][i],
          fillColor: ['#007AFF', '#FF9500', '#34C759'][i],
          fillOpacity: 0.8,
          weight: 2
        }).addTo(this.map);
        this.sectorMarkers.push(marker);
      }
    });
  }

  hideModals() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  }

  loadSavedRoutes() {
    const routes = JSON.parse(localStorage.getItem('routes') || '[]');
    if (routes.length > 0) {
      document.getElementById('saveRouteBtn').disabled = true;
    }
  }

  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  toRad(deg) { return deg * (Math.PI / 180); }

  formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  updateButtonStates() {
    document.getElementById('startBtn').disabled = this.isTracking;
    document.getElementById('pauseBtn').disabled = !this.isTracking;
    document.getElementById('stopBtn').disabled = !this.isTracking;
  }

  setStatus(msg) {
    document.getElementById('statusBar').textContent = msg;
  }

  showSettings() {
    const modal = document.getElementById('settingsModal');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const isDarkMode = document.body.classList.contains('light-mode');
    darkModeToggle.checked = !isDarkMode;
    modal.style.display = 'flex';
  }

  hideModals() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  }

  toggleDarkMode(e) {
    if (e.target.checked) {
      document.body.classList.remove('light-mode');
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
      document.body.classList.add('light-mode');
    }
  }

  clearAllData() {
    if (confirm('Are you sure you want to delete all saved data? This cannot be undone.')) {
      localStorage.removeItem('runHistory');
      localStorage.removeItem('routes');
      document.getElementById('clearDataBtn').textContent = 'Data deleted!';
      document.getElementById('clearDataBtn').style.background = '#2EA44F';
      setTimeout(() => {
        document.getElementById('clearDataBtn').textContent = 'Delete All Data';
        document.getElementById('clearDataBtn').style.background = '';
      }, 3000);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.tracker = new RunTracker();
});

window.tracker.loadRoute = (id) => window.tracker.loadRoute(id);
""