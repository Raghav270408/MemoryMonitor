const socket = io();

// Format bytes to a human-readable string (MB or GB)
function formatBytes(bytes, decimals = 1) {
    if (bytes === undefined || bytes === null || bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) {
        return (mb / 1024).toFixed(decimals) + ' GB';
    }
    return mb.toFixed(0) + ' MB';
}

// Update Connection Status in UI
function updateConnectionStatus(connected) {
    const indicator = document.getElementById('connection-indicator');
    const text = document.getElementById('connection-text');

    if (indicator) {
        indicator.className = connected
            ? 'w-2.5 h-2.5 rounded-full bg-emerald-500'
            : 'w-2.5 h-2.5 rounded-full bg-red-500';
    }
    if (text) {
        text.textContent = connected ? 'Connected' : 'Disconnected';
    }
}

// Socket.IO Device Status Event
socket.on('device_status', (data) => {
    updateConnectionStatus(!!data.connected);
});

socket.on('disconnect', () => {
    updateConnectionStatus(false);
});

socket.on('connect', () => {
    console.log('Connected to desktop server via WebSocket');
});

// Local state for Applications List
let currentApps = [];
let searchQuery = '';

// Setup search filter
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('apps-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
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

// Renders the Applications Table
function renderAppsTable() {
    const tbody = document.getElementById('apps-table-body');
    const emptyState = document.getElementById('apps-empty-state');
    if (!tbody) return;

    if (!currentApps || currentApps.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    // Filter by search query
    let filtered = currentApps.filter(app => {
        if (!searchQuery) return true;
        const pkg = (app.packageName || '').toLowerCase();
        return pkg.includes(searchQuery);
    });

    // Always sort by memory descending
    filtered.sort((a, b) => (b.memoryBytes || 0) - (a.memoryBytes || 0));

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) {
            emptyState.classList.remove('hidden');
            emptyState.innerHTML = `<p class="text-xs text-gray-500">No processes matching "${escapeHtml(searchQuery)}"</p>`;
        }
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    let html = '';
    for (const app of filtered) {
        const safePkg = escapeHtml(app.packageName || 'unknown');
        const pidStr = app.pid ? `<span class="text-gray-500 text-[11px] ml-1.5 font-mono">pid ${app.pid}</span>` : '';
        
        let memDisplay = '—';
        if (app.memoryMB !== null && app.memoryMB !== undefined) {
            if (app.memoryMB >= 1024) {
                memDisplay = `<span class="font-medium text-white">${(app.memoryMB / 1024).toFixed(2)} GB</span>`;
            } else {
                memDisplay = `<span class="font-medium text-white">${Number(app.memoryMB).toFixed(1)} MB</span>`;
            }
        }

        html += `
        <tr class="hover:bg-gray-750/50">
            <td class="py-1.5 px-2 font-mono text-gray-200">
                ${safePkg}${pidStr}
            </td>
            <td class="py-1.5 px-2 text-right">
                ${memDisplay}
            </td>
        </tr>`;
    }

    tbody.innerHTML = html;
}

// Receive Monitoring Data from Server
socket.on('monitoring_data', (data) => {
    if (!data) return;

    updateConnectionStatus(true);

    // Process RAM Data
    if (data.ram) {
        const r = data.ram;
        
        const pct = (r.totalBytes && r.totalBytes > 0)
            ? ((r.usedBytes / r.totalBytes) * 100).toFixed(1)
            : (r.usagePercentage !== undefined ? Number(r.usagePercentage).toFixed(0) : '0');

        document.getElementById('ram-percentage').textContent = `${pct}%`;
        
        let color = '#3b82f6'; // Blue
        if (r.memoryPressure === 'Moderate') color = '#eab308'; // Yellow
        if (r.memoryPressure === 'High') color = '#ef4444'; // Red
        
        document.getElementById('ram-circle').style.background = 
            `conic-gradient(${color} ${pct}%, #374151 ${pct}%, #374151 100%)`;

        document.getElementById('ram-used').textContent = formatBytes(r.usedBytes);
        document.getElementById('ram-available').textContent = formatBytes(r.availableBytes);
        document.getElementById('ram-total').textContent = formatBytes(r.totalBytes);
        document.getElementById('ram-app').textContent = formatBytes(r.appMemoryBytes);

        const pressureEl = document.getElementById('ram-pressure');
        if (pressureEl) {
            pressureEl.textContent = r.memoryPressure || '—';
            pressureEl.className = r.memoryPressure === 'Normal' ? 'font-medium text-emerald-400' :
                                  (r.memoryPressure === 'Moderate' ? 'font-medium text-amber-400' : 'font-medium text-rose-400');
        }

        const statusEl = document.getElementById('ram-status');
        if (statusEl) {
            statusEl.textContent = r.systemMemoryStatus || '—';
            statusEl.className = r.systemMemoryStatus === 'Normal' ? 'font-medium text-emerald-400' : 'font-medium text-rose-400';
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

        document.getElementById('storage-used-val').textContent = formatBytes(s.usedBytes);
        document.getElementById('storage-total-val').textContent = formatBytes(s.totalBytes);

        document.getElementById('storage-used').textContent = formatBytes(s.usedBytes);
        document.getElementById('storage-free').textContent = formatBytes(s.availableBytes);
    }

    // Process Applications Data and ADB status
    if (data.apps && Array.isArray(data.apps)) {
        currentApps = data.apps;
        renderAppsTable();
    }

    // Update Source Badge & Subtitle
    const sourceBadge = document.getElementById('apps-source-badge');
    const subtitle = document.getElementById('apps-subtitle');

    if (data.adbStatus && data.adbStatus.active) {
        if (sourceBadge) {
            sourceBadge.textContent = 'ADB Active';
            sourceBadge.className = 'text-[11px] px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300 font-mono';
        }
        if (subtitle && data.adbStatus.displayedProcesses !== undefined) {
            subtitle.textContent = `Showing ${data.adbStatus.displayedProcesses} of ${data.adbStatus.totalProcesses || data.adbStatus.displayedProcesses} processes (≥ ${data.adbStatus.thresholdMB || 10} MB) — via ADB PSS`;
        }
    } else {
        if (sourceBadge) {
            sourceBadge.textContent = data.adbStatus?.state === 'no_device' ? 'No ADB Device' : 'ADB Inactive';
            sourceBadge.className = 'text-[11px] px-2 py-0.5 rounded bg-gray-700 text-gray-400 font-mono';
        }
        if (subtitle) {
            subtitle.textContent = 'Connect via ADB USB to inspect individual process PSS';
        }
    }
});
