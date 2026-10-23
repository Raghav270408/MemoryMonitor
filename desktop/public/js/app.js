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

// Local state for Applications List
let currentApps = [];
let searchQuery = '';
let sortMode = 'mem-desc';

// Setup search and sort controls
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('apps-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
            renderAppsTable();
        });
    }

    const sortSelect = document.getElementById('apps-sort');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            sortMode = e.target.value;
            renderAppsTable();
        });
    }
});

// Helper to escape HTML characters in dynamic strings
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Renders the Applications Table based on currentApps, filter, and sort
function renderAppsTable() {
    const tbody = document.getElementById('apps-table-body');
    const emptyState = document.getElementById('apps-empty-state');
    if (!tbody) return;

    if (!currentApps || currentApps.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    // Filter
    let filtered = currentApps.filter(app => {
        if (!searchQuery) return true;
        const name = (app.displayName || '').toLowerCase();
        const pkg = (app.packageName || '').toLowerCase();
        return name.includes(searchQuery) || pkg.includes(searchQuery);
    });

    // Sort
    filtered.sort((a, b) => {
        if (sortMode === 'mem-desc') {
            const memA = a.memoryBytes !== null && a.memoryBytes !== undefined ? a.memoryBytes : -1;
            const memB = b.memoryBytes !== null && b.memoryBytes !== undefined ? b.memoryBytes : -1;
            if (memB !== memA) return memB - memA;
            return (a.displayName || '').localeCompare(b.displayName || '');
        } else if (sortMode === 'mem-asc') {
            const memA = a.memoryBytes !== null && a.memoryBytes !== undefined ? a.memoryBytes : Infinity;
            const memB = b.memoryBytes !== null && b.memoryBytes !== undefined ? b.memoryBytes : Infinity;
            if (memA !== memB) return memA - memB;
            return (a.displayName || '').localeCompare(b.displayName || '');
        } else if (sortMode === 'name-asc') {
            return (a.displayName || '').localeCompare(b.displayName || '');
        }
        return 0;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) {
            emptyState.classList.remove('hidden');
            const emptyText = emptyState.querySelector('p');
            if (emptyText) emptyText.textContent = `No applications match "${escapeHtml(searchQuery)}"`;
        }
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    let html = '';
    for (const app of filtered) {
        const safeName = escapeHtml(app.displayName || 'Unknown');
        const safePkg = escapeHtml(app.packageName || '');
        const pidDisplay = app.pid !== null && app.pid !== undefined ? app.pid : '—';
        
        let memDisplay = '—';
        if (app.memoryMB !== null && app.memoryMB !== undefined) {
            if (app.memoryMB >= 1024) {
                memDisplay = `<span class="font-bold text-white">${(app.memoryMB / 1024).toFixed(2)}</span> <span class="text-xs text-gray-400">GB</span>`;
            } else {
                memDisplay = `<span class="font-bold text-white">${Number(app.memoryMB).toFixed(1)}</span> <span class="text-xs text-gray-400">MB</span>`;
            }
        } else if (app.status === 'restricted') {
            memDisplay = '<span class="text-xs text-amber-400/90 italic font-sans" title="Restricted by Android OS">Restricted</span>';
        } else {
            memDisplay = '<span class="text-xs text-gray-500 italic font-sans">Unavailable</span>';
        }

        let statusBadge = '';
        if (app.status === 'available') {
            statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-sans font-medium bg-green-900/50 text-green-300 border border-green-700/40">Available</span>';
        } else if (app.status === 'restricted') {
            statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-sans font-medium bg-amber-900/40 text-amber-300 border border-amber-700/40" title="Restricted by Android 10+ sandboxing">Restricted (OS)</span>';
        } else {
            statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-sans font-medium bg-gray-700 text-gray-300">${escapeHtml(app.status || 'Unknown')}</span>`;
        }

        const metric = escapeHtml(app.metric || 'PSS');

        html += `
        <tr class="hover:bg-gray-750 transition-colors">
            <td class="py-2.5 px-3">
                <div class="font-sans font-medium text-gray-100">${safeName}</div>
                <div class="text-xs text-gray-500 truncate max-w-xs font-mono" title="${safePkg}">${safePkg}</div>
            </td>
            <td class="py-2.5 px-3 text-gray-400 text-xs">${pidDisplay}</td>
            <td class="py-2.5 px-3 text-right">${memDisplay}</td>
            <td class="py-2.5 px-3 text-xs text-gray-400 font-sans">${metric}</td>
            <td class="py-2.5 px-3">${statusBadge}</td>
        </tr>`;
    }

    tbody.innerHTML = html;
}

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

    // Process Applications Data and ADB status
    if (data.apps && Array.isArray(data.apps)) {
        currentApps = data.apps;
        renderAppsTable();
    }

    // Update Source Badge & Informational Text
    const sourceBadge = document.getElementById('apps-source-badge');
    const infoText = document.getElementById('apps-info-text');

    if (data.adbStatus && data.adbStatus.active) {
        if (sourceBadge) {
            sourceBadge.textContent = 'Source: ADB Shell (Live PSS)';
            sourceBadge.className = 'text-xs px-2.5 py-1 rounded-full font-medium bg-blue-900/60 text-blue-300 border border-blue-700/50';
        }
        if (infoText) {
            infoText.textContent = `Real-time physical Proportional Set Size (PSS) retrieved directly via ADB dumpsys (${data.adbStatus.deviceId || 'USB'}).`;
        }
    } else {
        if (sourceBadge) {
            sourceBadge.textContent = 'Source: In-App Telemetry';
            sourceBadge.className = 'text-xs px-2.5 py-1 rounded-full font-medium bg-gray-700 text-gray-300';
        }
        if (infoText) {
            infoText.textContent = 'Android 10+ OS security sandboxing restricts ordinary apps from inspecting other processes\' memory. Memory Monitor\'s own memory is authentically reported via Debug.MemoryInfo. Connect via ADB over USB for device-wide process PSS measurements.';
        }
    }
});
