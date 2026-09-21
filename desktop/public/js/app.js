const socket = io();

// Format bytes to a human-readable string (MB or GB)
function formatBytes(bytes) {
    if (bytes === undefined || bytes === null || bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb > 1000) {
        return (mb / 1024).toFixed(1) + ' GB';
    }
    return mb.toFixed(0) + ' MB';
}

// Update Connection Status
socket.on('device_status', (data) => {
    const indicator = document.getElementById('connection-indicator');
    const text = document.getElementById('connection-text');
    
    if (data.connected) {
        indicator.classList.remove('bg-red-500');
        indicator.classList.add('bg-green-500');
        text.textContent = 'Android Device: Connected';
    } else {
        indicator.classList.remove('bg-green-500');
        indicator.classList.add('bg-red-500');
        text.textContent = 'Android Device: Disconnected';
    }
});

// Receive Monitoring Data
socket.on('monitoring_data', (data) => {
    
    // Process RAM Data
    if (data.ram) {
        const r = data.ram;
        
        const pct = r.usagePercentage.toFixed(0);
        document.getElementById('ram-percentage').textContent = `${pct}%`;
        
        let color = '#3b82f6'; // Default Blue
        if (r.memoryPressure === 'Moderate') color = '#eab308'; // Yellow
        if (r.memoryPressure === 'High') color = '#ef4444'; // Red
        
        document.getElementById('ram-circle').style.background = 
            `conic-gradient(${color} ${pct}%, #374151 ${pct}%, #374151 100%)`;

        document.getElementById('ram-used').textContent = formatBytes(r.usedBytes);
        document.getElementById('ram-available').textContent = formatBytes(r.availableBytes);
        document.getElementById('ram-total').textContent = formatBytes(r.totalBytes);
        document.getElementById('ram-app').textContent = formatBytes(r.appMemoryBytes);

        const pressureEl = document.getElementById('ram-pressure');
        pressureEl.textContent = r.memoryPressure;
        pressureEl.className = r.memoryPressure === 'Normal' ? 'font-semibold text-green-400' :
                              (r.memoryPressure === 'Moderate' ? 'font-semibold text-yellow-400' : 'font-semibold text-red-400');

        const statusEl = document.getElementById('ram-status');
        statusEl.textContent = r.systemMemoryStatus;
        statusEl.className = r.systemMemoryStatus === 'Normal' ? 'font-semibold text-green-400' : 'font-semibold text-red-400';
    }

    // Process Storage Data
    if (data.storage) {
        const s = data.storage;
        
        const pct = s.usagePercentage.toFixed(0);
        document.getElementById('storage-percentage').textContent = `${pct}%`;
        document.getElementById('storage-bar').style.width = `${pct}%`;

        document.getElementById('storage-used-val').textContent = formatBytes(s.usedBytes);
        document.getElementById('storage-total-val').textContent = formatBytes(s.totalBytes);

        document.getElementById('storage-used').textContent = formatBytes(s.usedBytes);
        document.getElementById('storage-free').textContent = formatBytes(s.availableBytes);
    }
});
