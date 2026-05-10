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
    this.pendingRun = null;

    this.map = null;
    this.routeLayer = null;
    this.currentLayer = null;
    this.ghostLayer = null;
    this.sectorMarkers = [];
    this.userMarker = null;

    this.initMap();
    this.bindEvents();
    this.updateMenuStates();
    this.showScreen('menuScreen');
  }

  // ======== SCREEN NAVIGATION ====
  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('visible'));
    document.getElementById('trackingOverlay').classList.remove('visible');
    const el = document.getElementById(id);
    if (el) el.classList.add('visible');
  }

  showModal(id) {
    document.getElementById(id).style.display = 'flex';
  }

  hideModals() {
    this.hideSettingsModal();
    this.hideSaveModal();
  }

  hideSettingsModal() {
    const el = document.getElementById('settingsModal');
    if (el) el.style.display = 'none';
  }

  hideSaveModal() {
    const el = document.getElementById('saveModal');
    if (el) el.style.display = 'none';
  }

  // ======== MENU ========
  updateMenuStates() {
    const runs = JSON.parse(localStorage.getItem('runHistory') || '[]');
    const routes = JSON.parse(localStorage.getItem('routes') || '[]');

    const historyBtn = document.getElementById('historyBtn');
    const routesBtn = document.getElementById('routesBtn');

    if (runs.length > 0) {
      historyBtn.disabled = false;
      document.getElementById('historyHint').textContent = `${runs.length} run${runs.length > 1 ? 's' : ''}`;
    } else {
      historyBtn.disabled = true;
      document.getElementById('historyHint').textContent = 'No runs yet';
    }

    if (routes.length > 0) {
      routesBtn.disabled = false;
      document.getElementById('routesHint').textContent = `${routes.length} rout${routes.length > 1 ? 'es' : 'e'}`;
    } else {
      routesBtn.disabled = true;
      document.getElementById('routesHint').textContent = 'No saved routes';
    }
  }

  // ======== HISTORY SCREEN ========
  showHistory() {
    const runs = JSON.parse(localStorage.getItem('runHistory') || '[]');
    const list = document.getElementById('historyList');

    if (runs.length === 0) {
      list.innerHTML = '<li style="color:#8E8E93;justify-content:center;">No runs yet</li>';
    } else {
      list.innerHTML = runs.map(r => `
        <li>
          <span class="history-date">${new Date(r.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          <span class="history-details">
            <span><span class="history-detail-val">${(r.distance / 1000).toFixed(2)}</span> km</span>
            <span>·</span>
            <span><span class="history-detail-val">${this.formatTime(r.time)}</span></span>
            ${r.mode ? `<span>·</span><span>${r.mode}</span>` : ''}
          </span>
        </li>
      `).join('');
    }

    this.showScreen('historyScreen');
  }

  // ======== ROUTES SCREEN ========
  showRoutes() {
    const routes = JSON.parse(localStorage.getItem('routes') || '[]');
    const list = document.getElementById('routesList');

    if (routes.length === 0) {
      list.innerHTML = '<li style="color:#8E8E93;justify-content:center;">No saved routes</li>';
    } else {
      list.innerHTML = routes.map(r => `
        <li onclick="window.tracker.useRoute(${r.id})">
          <span>${r.name}</span>
          <span style="color:#8E8E93;font-size:12px;">${r.mode} · ${(r.distance/1000).toFixed(2)}km</span>
        </li>
      `).join('');
    }

    this.showScreen('routesScreen');
  }

  useRoute(routeId) {
    const routes = JSON.parse(localStorage.getItem('routes') || '[]');
    const route = routes.find(r => r.id === routeId);
    if (!route) return;

    this.currentRoute = route;
    this.hideModals();
    this.runMode = route.mode || 'track';
    this.showScreen('menuScreen');
    this.setStatus(`Loaded "${route.name}" — tap Start Run to begin`);
  }

  // ======== MAP ========
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

  // ======== EVENTS ========
  bindEvents() {
    // Menu
    document.getElementById('startRunBtn').addEventListener('click', () => this.showScreen('typeScreen'));
    document.getElementById('historyBtn').addEventListener('click', () => this.showHistory());
    document.getElementById('routesBtn').addEventListener('click', () => this.showRoutes());
    document.getElementById('settingsBtn').addEventListener('click', () => this.showSettings());

    // Type selector
    document.getElementById('backToMenu').addEventListener('click', () => this.showScreen('menuScreen'));
    document.getElementById('startTrackingBtn').addEventListener('click', () => this.onStartTracking());

    // Type card selection
    document.querySelectorAll('.type-card').forEach(card => {
      const radio = card.querySelector('input[type="radio"]');
      const inner = card.querySelector('.card-inner');
      inner.addEventListener('click', () => {
        radio.checked = true;
        this.runMode = radio.value;
        document.querySelectorAll('.type-card').forEach(c => c.querySelector('.card-inner').style.borderColor = 'rgba(255,255,255,0.1)');
        inner.style.borderColor = 'var(--success)';
        inner.style.background = 'rgba(52, 199, 89, 0.08)';
      });
    });

    // Post-run
    document.getElementById('backToMenu2').addEventListener('click', () => this.showScreen('menuScreen'));
    document.getElementById('backToMenu3').addEventListener('click', () => this.showScreen('menuScreen'));
    document.getElementById('saveRunBtn').addEventListener('click', () => this.finalizeRun(true));
    document.getElementById('discardRunBtn').addEventListener('click', () => this.finalizeRun(false));
    document.getElementById('newRunBtn').addEventListener('click', () => {
      this.hideModals();
      this.showScreen('typeScreen');
    });

    // Modals
    document.getElementById('closeSettingsBtn').addEventListener('click', () => this.hideModals());
    document.getElementById('confirmSaveBtn').addEventListener('click', () => this.saveRoute());
    document.getElementById('cancelSaveBtn').addEventListener('click', () => this.hideModals());
    document.getElementById('clearDataBtn').addEventListener('click', () => this.clearAllData());
    document.getElementById('darkModeToggle').addEventListener('change', (e) => this.toggleDarkMode(e));

    // Tracking
    document.getElementById('pauseBtn').addEventListener('click', () => this.togglePause());
    document.getElementById('finishBtn').addEventListener('click', () => this.finishTracking());
  }

  // ======== TYPE SELECTOR -> TRACKING ========
  onStartTracking() {
    const selected = document.querySelector('input[name="runType"]:checked');
    this.runMode = selected ? selected.value : 'track';

    // Load ghost data if route selected
    if (this.currentRoute && this.currentRoute.ghost) {
      this.ghostData = {
        startTime: Date.now(),
        positions: this.currentRoute.ghost.positions,
        totalDistance: this.currentRoute.ghost.distance
      };
    }

    // Reset state
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
    this.bestLapTime = null;
    this.hasLeftStart = false;
    this.startPos = null;
    this.routeToSave = null;

    // Switch to tracking UI
    this.hideSettingsModal();
    this.hideSaveModal();
    document.getElementById('menuScreen').classList.remove('visible');
    document.getElementById('trackingOverlay').classList.add('visible');
    document.getElementById('fullscreenTimer').classList.add('visible');

    // Countdown
    const countdownOverlay = document.getElementById('countdownOverlay');
    const countdownNumber = document.getElementById('countdownNumber');
    countdownOverlay.style.display = 'flex';
    let count = 3;
    countdownNumber.textContent = count;
    const countInterval = setInterval(() => {
      count--;
      if (count > 0) {
        countdownNumber.textContent = count;
        countdownNumber.style.animation = 'none';
        countdownNumber.offsetHeight; // reflow
        countdownNumber.style.animation = 'countPop 0.5s ease-out';
      } else {
        clearInterval(countInterval);
        countdownOverlay.style.display = 'none';
        this.startTracking();
      }
    }, 500);
  }

  // ======== TRACKING ========
  startTracking() {
    if (!('geolocation' in navigator)) {
      alert('Geolocation is not supported');
      this.finishTracking();
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onPosition(pos),
      (err) => this.onError(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    this.timerInterval = setInterval(() => this.updateTimer(), 1000);

    if (this.ghostData) this.startGhostRun();

    document.getElementById('bigStatus').textContent = 'Tracking';
  }

  startGhostRun() {
    if (this.ghostLayer) this.map.removeLayer(this.ghostLayer);
    if (this.ghostMarker) this.map.removeLayer(this.ghostMarker);

    const ghostCoords = this.ghostData.positions.map(p => [p.latitude, p.longitude]);
    this.ghostLayer = L.polyline(ghostCoords, {
      color: '#FF3B30', opacity: 0.5, weight: 4, dashArray: '10, 10'
    }).addTo(this.map);

    this.ghostMarker = L.marker(ghostCoords[0], {
      icon: L.divIcon({ className: 'ghost-marker', html: '<div style="width:20px;height:20px;background:#FF3B30;border-radius:50%;border:3px solid white;"></div>', iconSize: [20, 20] })
    }).addTo(this.map);
  }

  onPosition(position) {
    const { latitude, longitude, speed } = position.coords;
    const timestamp = Date.now();
    const elapsed = timestamp - this.startTime - this.totalPauseTime;
    const speedKmh = (speed || 0) * 3.6;

    let segmentDist = 0;
    if (this.positions.length > 0) {
      const lastPos = this.positions[this.positions.length - 1];
      segmentDist = this.haversineDistance(lastPos.latitude, lastPos.longitude, latitude, longitude);
    }

    this.totalDistance += segmentDist;

    const newPos = { latitude, longitude, speed: speed || 0, timestamp, elapsed, cumulativeDistance: this.totalDistance };
    if (this.positions.length === 0) this.startPos = { latitude, longitude };
    this.positions.push(newPos);

    if (this.runMode === 'circuit') {
      this.detectLap(latitude, longitude);
    } else {
      this.detectSectorsTrackMode();
    }

    document.getElementById('distance').textContent = (this.totalDistance / 1000).toFixed(2);
    if (speed && speed > 0) document.getElementById('speed').textContent = speedKmh.toFixed(1);
    this.updateMap(latitude, longitude);
    this.updateGhostComparison(elapsed, this.totalDistance);

    if (this.positions.length >= 10 && !this.routeToSave) {
      this.routeToSave = this.positions.slice();
    }
  }

  detectLap(lat, lng) {
    if (!this.startPos) return;
    const distFromStart = this.haversineDistance(this.startPos.latitude, this.startPos.longitude, lat, lng);
    if (!this.hasLeftStart && distFromStart > 15) this.hasLeftStart = true;
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
    }
  }

  calculateCircuitSectors() {
    if (!this.startPos) return;
    const recent = this.positions.slice(-Math.min(50, this.positions.length));
    let lapDist = 0;
    for (let i = Math.max(1, recent.length - 20); i < recent.length; i++) {
      lapDist += this.haversineDistance(recent[i - 1].latitude, recent[i - 1].longitude, recent[i].latitude, recent[i].longitude);
    }
    if (lapDist < 10) return;
    this.lapDistance = lapDist;

    const sectorDist = lapDist / 3;
    const lapStartDist = this.totalDistance - lapDist;
    let s1Dist = Infinity, s2Dist = Infinity;
    for (let i = recent.length - 20; i < recent.length; i++) {
      const pos = this.positions[i];
      const d = pos.cumulativeDistance - lapStartDist;
      if (Math.abs(d - sectorDist) < s1Dist) { s1Dist = Math.abs(d - sectorDist); this.sectors.s1 = pos; }
      if (Math.abs(d - sectorDist * 2) < s2Dist) { s2Dist = Math.abs(d - sectorDist * 2); this.sectors.s2 = pos; }
    }
    this.sectors.s3 = recent[recent.length - 1];
    this.drawSectorMarkers();
  }

  detectSectorsTrackMode() {
    if (!this.currentRoute || !this.currentRoute.distance) return;
    const totalDist = this.currentRoute.distance * 1000;
    const s1Dist = totalDist / 3;
    const s2Dist = totalDist * 2 / 3;
    if (this.currentSector < 1 && this.totalDistance >= s1Dist) this.sectorComplete(1);
    else if (this.currentSector < 2 && this.totalDistance >= s2Dist) this.sectorComplete(2);
    else if (this.currentSector < 3 && this.totalDistance >= totalDist * 0.95) this.sectorComplete(3);
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
          radius: 8, color: ['#007AFF', '#FF9500', '#34C759'][idx],
          fillColor: ['#007AFF', '#FF9500', '#34C759'][idx], fillOpacity: 0.8, weight: 2
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
    splitEl.className = `split-display ${diff < 0 ? 'ahead' : 'behind'}`;
    if (absDiff < 1000) {
      splitText.textContent = `${sign}${(absDiff / 1000).toFixed(1)}s vs ghost`;
    } else {
      const mins = Math.floor(absDiff / 60000);
      const secs = (absDiff % 60000) / 1000;
      splitText.textContent = `${sign}${mins}:${String(Math.floor(secs)).padStart(2, '0')} vs ghost`;
    }

    if (this.ghostMarker) this.ghostMarker.setLatLng([ghostPos.latitude, ghostPos.longitude]);
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
    if (this.isTracking && !this.isPaused) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => this.onPosition(pos),
        (err) => this.onError(err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  }

  updateTimer() {
    if (!this.startTime || this.isPaused) return;
    const elapsed = Date.now() - this.startTime - this.totalPauseTime;
    document.getElementById('time').textContent = this.formatTime(elapsed);
    document.getElementById('bigTime').textContent = this.formatTime(elapsed);

    if (this.totalDistance > 0) {
      const distanceKm = this.totalDistance / 1000;
      const paceSeconds = elapsed / 1000 / distanceKm;
      const paceMin = Math.floor(paceSeconds / 60);
      const paceSec = Math.floor(paceSeconds % 60);
      document.getElementById('pace').textContent = `${String(paceMin).padStart(2, '0')}:${String(paceSec).padStart(2, '0')}`;
      document.getElementById('bigDistance').textContent = `${distanceKm.toFixed(2)} km`;
    }

    if (this.runMode === 'circuit' && this.hasLeftStart) {
      const lapElapsed = Date.now() - this.lapStartTime;
      const sectorElapsed = Date.now() - this.sectorStartTime;
      if (this.currentSector === 0 && lapElapsed > 0) document.getElementById('sector1').textContent = this.formatTime(sectorElapsed);
      else if (this.currentSector === 1) document.getElementById('sector2').textContent = this.formatTime(sectorElapsed);
      else if (this.currentSector === 2) document.getElementById('sector3').textContent = this.formatTime(sectorElapsed);
    }
  }

  updateMap(lat, lng) {
    if (this.userMarker) {
      this.userMarker.setLatLng([lat, lng]);
    } else {
      this.userMarker = L.marker([lat, lng], {
        icon: L.divIcon({ className: 'user-marker', html: '<div style="width:16px;height:16px;background:#34C759;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>', iconSize: [16, 16] })
      }).addTo(this.map);
    }

    // Update breadcrumb trail (polyline)
    if (!this.currentLayer) {
      this.currentLayer = L.polyline([this.positions[0] ? [this.positions[0].latitude, this.positions[0].longitude] : [lat, lng]], { color: '#34C759', opacity: 0.8, weight: 5 }).addTo(this.map);
    }
    if (this.positions.length > 0) {
      this.currentLayer.addLatLng([lat, lng]);
    }

    if (this.positions.length > 5) this.map.setView([lat, lng], 17);
  }

  setStatus(msg) {
    document.getElementById('statusBar').textContent = msg;
    document.getElementById('bigStatus').textContent = msg;
  }

  // ======== TRACKING CONTROLS ========
  togglePause() {
    if (this.isPaused) {
      this.isPaused = false;
      this.startTime += Date.now() - this.pauseTime;
      document.getElementById('pauseBtn').textContent = 'Pause';
      document.getElementById('bigStatus').textContent = 'Tracking';
      this.timerInterval = setInterval(() => this.updateTimer(), 1000);
    } else {
      this.isPaused = true;
      this.pauseTime = Date.now();
      document.getElementById('pauseBtn').textContent = 'Resume';
      document.getElementById('bigStatus').textContent = 'Paused';
      clearInterval(this.timerInterval);
    }
  }

  finishTracking() {
    if (this.watchId !== null) { navigator.geolocation.clearWatch(this.watchId); this.watchId = null; }
    clearInterval(this.timerInterval);

    this.isTracking = false;
    this.isPaused = false;
    this.timerInterval = null;

    document.getElementById('fullscreenTimer').classList.remove('visible');
    document.getElementById('trackingOverlay').classList.remove('visible');

    // Save pending run for post-run screen
    const elapsed = Date.now() - this.startTime - this.totalPauseTime;
    this.pendingRun = {
      id: Date.now(),
      date: new Date().toISOString(),
      routeId: this.currentRoute?.id,
      mode: this.runMode,
      distance: this.totalDistance,
      time: elapsed,
      positions: this.positions.map(p => ({ ...p })),
      laps: [...this.laps],
      sectors: { ...this.sectors },
      bestLapTime: this.bestLapTime
    };

    // Show post-run screen
    document.getElementById('postTime').textContent = this.formatTime(elapsed);
    document.getElementById('postDistance').textContent = (this.totalDistance / 1000).toFixed(2);
    document.getElementById('postSpeed').textContent = elapsed > 0 ? ((this.totalDistance / 1000) / (elapsed / 3600000)).toFixed(1) : '0.0';

    const distanceKm = this.totalDistance / 1000;
    if (distanceKm > 0) {
      const paceSeconds = elapsed / 1000 / distanceKm;
      const paceMin = Math.floor(paceSeconds / 60);
      const paceSec = Math.floor(paceSeconds % 60);
      document.getElementById('postPace').textContent = `${String(paceMin).padStart(2, '0')}:${String(paceSec).padStart(2, '0')}`;
    } else {
      document.getElementById('postPace').textContent = '--:--';
    }

    if (this.runMode === 'circuit' && this.laps.length > 0) {
      document.getElementById('postLaps').textContent = this.laps.length;
      document.getElementById('postLapBlock').style.display = 'flex';
    } else {
      document.getElementById('postLapBlock').style.display = 'none';
    }

    // Enable save only if we have data
    document.getElementById('saveRunBtn').disabled = this.totalDistance < 10 || this.positions.length < 5;
    this.showScreen('postRunScreen');
  }

  // ======== POST-RUN ========
  finalizeRun(save) {
    if (save && this.pendingRun) {
      let runs = JSON.parse(localStorage.getItem('runHistory') || '[]');
      runs.unshift(this.pendingRun);
      runs = runs.slice(0, 20);
      localStorage.setItem('runHistory', JSON.stringify(runs));

      if (this.currentRoute) this.updateBestTime(this.pendingRun);

      // Save route if collected
      if (this.routeToSave) {
        this.showSaveModal();
      } else {
        this.cleanupAfterRun();
      }
    } else {
      this.cleanupAfterRun();
    }
  }

  cleanupAfterRun() {
    if (this.ghostLayer) { this.map.removeLayer(this.ghostLayer); this.ghostLayer = null; }
    if (this.ghostMarker) { this.map.removeLayer(this.ghostMarker); this.ghostMarker = null; }
    if (this.userMarker) { this.map.removeLayer(this.userMarker); this.userMarker = null; }
    if (this.routeLayer) { this.map.removeLayer(this.routeLayer); this.routeLayer = null; }
    this.sectorMarkers.forEach(m => this.map.removeLayer(m));
    this.sectorMarkers = [];
    if (this.currentLayer) { this.map.removeLayer(this.currentLayer); this.currentLayer = null; }
    this.ghostData = null;
    this.currentRoute = null;
    this.routeToSave = null;
    this.pendingRun = null;

    this.updateMenuStates();
    this.showScreen('menuScreen');
  }

  showSaveModal() {
    document.getElementById('saveModal').style.display = 'flex';
    document.getElementById('routeName').focus();
  }

  saveRoute() {
    const name = document.getElementById('routeName').value.trim();
    if (!name) return;

    const route = {
      id: Date.now(), name, mode: this.runMode,
      coords: this.routeToSave.map(p => ({ latitude: p.latitude, longitude: p.longitude })),
      distance: this.totalDistance, bestTime: null, bestSectors: null
    };

    let routes = JSON.parse(localStorage.getItem('routes') || '[]');
    routes.push(route);
    localStorage.setItem('routes', JSON.stringify(routes));

    this.hideModals();
    this.routeToSave = null;
    this.cleanupAfterRun();
  }

  updateBestTime(run) {
    const routes = JSON.parse(localStorage.getItem('routes') || '[]');
    const routeIdx = routes.findIndex(r => r.id === this.currentRoute.id);
    if (routeIdx === -1) return;
    const elapsed = Date.now() - this.startTime - this.totalPauseTime;
    const currentBest = routes[routeIdx].bestTime;
    if (!currentBest || elapsed < currentBest) {
      routes[routeIdx].bestTime = elapsed;
      routes[routeIdx].ghost = { positions: run.positions, distance: run.distance };
      localStorage.setItem('routes', JSON.stringify(routes));
    }
  }

  // ======== SETTINGS ========
  showSettings() {
    const modal = document.getElementById('settingsModal');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const isDarkMode = !document.body.classList.contains('light-mode');
    darkModeToggle.checked = isDarkMode;
    this.showModal('settingsModal');
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
      this.updateMenuStates();
    }
  }

  // ======== UTILITIES ========
  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  toRad(deg) { return deg * (Math.PI / 180); }

  formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.tracker = new RunTracker();
});


if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js');
  });
}
