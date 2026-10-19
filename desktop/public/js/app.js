const socket = io();

// Format bytes to a human-readable string (MB or GB) with customizable decimal precision
function formatBytes(bytes, decimals = 2) {
    if (bytes === undefined || bytes === null || bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1000) {
        return (mb / 1024).toFixed(decimals) + ' GB';
    }
    return mb.toFixed(0) + ' MB';
}

// Client-side watchdog to detect when data stream stops
let clientWatchdog = null;
function pingClientWatchdog() {
    clearTimeout(clientWatchdog);
    clientWatchdog = setTimeout(() => {
        updateConnectionStatus(false);
    }, 4500);
}

// Update Connection Status in UI
function updateConnectionStatus(connected) {
    const indicator = document.getElementById('connection-indicator');
    const text = document.getElementById('connection-text');
    const lastUpdateEl = document.getElementById('last-updated');

    if (connected) {
        if (indicator) {
            indicator.classList.remove('bg-red-500');
            indicator.classList.add('bg-green-500');
        }
        if (text) {
            text.textContent = 'Android Device: Connected';
        }
        if (lastUpdateEl) {
            lastUpdateEl.classList.remove('hidden');
        }
    } else {
        if (indicator) {
            indicator.classList.remove('bg-green-500');
            indicator.classList.add('bg-red-500');
        }
        if (text) {
            text.textContent = 'Android Device: Disconnected';
        }
    }
}

// Socket.IO Device Status Event
socket.on('device_status', (data) => {
    updateConnectionStatus(!!data.connected);
});

// Socket.IO Connection Lifecycle Events
socket.on('disconnect', () => {
    updateConnectionStatus(false);
    const text = document.getElementById('connection-text');
    if (text) text.textContent = 'Server: Disconnected';
});

socket.on('connect', () => {
    console.log('Connected to desktop server via WebSocket');
});

// Receive Monitoring Data from Server
socket.on('monitoring_data', (data) => {
    if (!data) return;

    // Receiving data proves the device is actively transmitting
    updateConnectionStatus(true);
    pingClientWatchdog();

    // Visual heartbeat pulse on connection indicator
    const indicator = document.getElementById('connection-indicator');
    if (indicator) {
        indicator.classList.add('scale-125');
        setTimeout(() => indicator.classList.remove('scale-125'), 180);
    }

    // Update timestamp
    const lastUpdateEl = document.getElementById('last-updated');
    if (lastUpdateEl) {
        const timeObj = data.timestamp ? new Date(data.timestamp) : new Date();
        lastUpdateEl.textContent = `Last update: ${timeObj.toLocaleTimeString()}`;
        lastUpdateEl.classList.remove('hidden');
    }

    // Process RAM Data
    if (data.ram) {
        const r = data.ram;
        
        // Calculate percentage with 1 decimal place to reflect real-time memory usage
        const pct = (r.totalBytes && r.totalBytes > 0)
            ? ((r.usedBytes / r.totalBytes) * 100).toFixed(1)
            : (r.usagePercentage !== undefined ? Number(r.usagePercentage).toFixed(0) : '0');

        document.getElementById('ram-percentage').textContent = `${pct}%`;
        
        let color = '#3b82f6'; // Default Blue
        if (r.memoryPressure === 'Moderate') color = '#eab308'; // Yellow
        if (r.memoryPressure === 'High') color = '#ef4444'; // Red
        
        document.getElementById('ram-circle').style.background = 
            `conic-gradient(${color} ${pct}%, #374151 ${pct}%, #374151 100%)`;

        document.getElementById('ram-used').textContent = formatBytes(r.usedBytes, 2);
        document.getElementById('ram-available').textContent = formatBytes(r.availableBytes, 2);
        document.getElementById('ram-total').textContent = formatBytes(r.totalBytes, 2);
        document.getElementById('ram-app').textContent = formatBytes(r.appMemoryBytes);

        const pressureEl = document.getElementById('ram-pressure');
        if (pressureEl) {
            pressureEl.textContent = r.memoryPressure || '-';
            pressureEl.className = r.memoryPressure === 'Normal' ? 'font-semibold text-green-400' :
                                  (r.memoryPressure === 'Moderate' ? 'font-semibold text-yellow-400' : 'font-semibold text-red-400');
        }

        const statusEl = document.getElementById('ram-status');
        if (statusEl) {
            statusEl.textContent = r.systemMemoryStatus || '-';
            statusEl.className = r.systemMemoryStatus === 'Normal' ? 'font-semibold text-green-400' : 'font-semibold text-red-400';
        }
    }

    // Process Storage Data
    if (data.storage) {
        const s = data.storage;
        
        const pct = (s.totalBytes && s.totalBytes > 0)
            ? ((s.usedBytes / s.totalBytes) * 100).toFixed(1)
            : (s.usagePercentage !== undefined ? Number(s.usagePercentage).toFixed(0) : '0');

        document.getElementById('storage-percentage').textContent = `${pct}%`;
        document.getElementById('storage-bar').style.width = `${pct}%`;

        document.getElementById('storage-used-val').textContent = formatBytes(s.usedBytes, 2);
        document.getElementById('storage-total-val').textContent = formatBytes(s.totalBytes, 2);

        document.getElementById('storage-used').textContent = formatBytes(s.usedBytes, 2);
        document.getElementById('storage-free').textContent = formatBytes(s.availableBytes, 2);
    }
});
