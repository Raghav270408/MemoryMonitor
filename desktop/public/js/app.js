const socket = typeof io !== 'undefined' ? io() : null;

// Format bytes to a human-readable string (MB or GB)
function formatBytes(bytes, decimals = 1) {
    if (bytes === undefined || bytes === null || isNaN(bytes) || bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) {
        return (mb / 1024).toFixed(decimals) + ' GB';
    }
    return mb.toFixed(0) + ' MB';
}

// Format memory in MB to readable string (MB or GB)
function formatMemoryMB(memoryMB) {
    if (memoryMB === null || memoryMB === undefined || isNaN(memoryMB)) return '—';
    const mb = Number(memoryMB);
    if (mb >= 1024) {
        return (mb / 1024).toFixed(2) + ' GB';
    }
    return mb.toFixed(1) + ' MB';
}

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

// Filters applications to exclude restricted/unavailable entries and sorts by RAM highest first
function filterAndSortApps(apps, searchQuery = '') {
    if (!apps || !Array.isArray(apps)) return [];

    // Requirement 2: Exclude restricted and unavailable entries; require valid, usable measurement
    let filtered = apps.filter(app => {
        if (!app) return false;
        if (app.status === 'restricted' || app.status === 'unavailable') return false;
        if (app.memoryBytes === null || app.memoryBytes === undefined || isNaN(app.memoryBytes) || app.memoryBytes <= 0) {
            return false;
        }

        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase().trim();
        const name = (app.displayName || '').toLowerCase();
        const pkg = (app.packageName || '').toLowerCase();
        return name.includes(q) || pkg.includes(q);
    });

    // Requirement 4: Always sort by RAM usage descending (highest first)
    filtered.sort((a, b) => (b.memoryBytes || 0) - (a.memoryBytes || 0));

    return filtered;
}

// Update Connection Status in UI
function updateConnectionStatus(connected) {
    if (typeof document === 'undefined') return;
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

// Local state for Applications List
let currentApps = [];
let searchQuery = '';
let latestAdbStatus = null;

// Setup search filter in browser environment
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        const searchInput = document.getElementById('apps-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                searchQuery = e.target.value.toLowerCase().trim();
                renderAppsTable();
            });
        }
    });
}

// Renders the Applications Table
function renderAppsTable() {
    if (typeof document === 'undefined') return;
    const tbody = document.getElementById('apps-table-body');
    const emptyState = document.getElementById('apps-empty-state');
    if (!tbody) return;

    const filtered = filterAndSortApps(currentApps, searchQuery);

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) {
            emptyState.classList.remove('hidden');
            const msgEl = document.getElementById('apps-empty-message');
            const subEl = document.getElementById('apps-empty-submessage');
            if (searchQuery) {
                if (msgEl) msgEl.textContent = `No applications matching "${searchQuery}"`;
                if (subEl) subEl.textContent = '';
            } else {
                if (latestAdbStatus && !latestAdbStatus.active) {
                    if (msgEl) msgEl.textContent = latestAdbStatus.message || 'ADB collector inactive';
                    if (subEl) subEl.textContent = 'Connect via USB to collect application RAM';
                } else {
                    if (msgEl) msgEl.textContent = 'No applications exceeding threshold';
                    if (subEl) subEl.textContent = '';
                }
            }
        }
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    let html = '';
    for (const app of filtered) {
        // Display friendly name as primary label; keep package identifier available internally
        const displayName = escapeHtml(app.displayName || app.packageName || 'Unknown');
        const safePkg = escapeHtml(app.packageName || '');
        const memFormatted = formatMemoryMB(app.memoryMB);

        html += `
        <tr class="hover:bg-gray-750/50" data-package="${safePkg}" title="${safePkg}">
            <td class="py-2 px-2 text-gray-200">
                <span class="font-medium">${displayName}</span>
            </td>
            <td class="py-2 px-2 text-right">
                <span class="font-medium text-white">${memFormatted}</span>
            </td>
        </tr>`;
    }

    tbody.innerHTML = html;
}

// WebSocket Listeners
if (socket) {
    socket.on('device_status', (data) => {
        updateConnectionStatus(!!data.connected);
    });

    socket.on('disconnect', () => {
        updateConnectionStatus(false);
    });

    socket.on('connect', () => {
        console.log('Connected to desktop server via WebSocket');
    });

    socket.on('monitoring_data', (data) => {
        if (!data) return;

        updateConnectionStatus(true);

        // Process RAM Data
        if (data.ram) {
            const r = data.ram;

            const pct = (r.totalBytes && r.totalBytes > 0)
                ? ((r.usedBytes / r.totalBytes) * 100).toFixed(1)
                : (r.usagePercentage !== undefined ? Number(r.usagePercentage).toFixed(0) : '0');

            const pctEl = document.getElementById('ram-percentage');
            if (pctEl) pctEl.textContent = `${pct}%`;

            let color = '#3b82f6';
            if (r.memoryPressure === 'Moderate') color = '#eab308';
            if (r.memoryPressure === 'High') color = '#ef4444';

            const circleEl = document.getElementById('ram-circle');
            if (circleEl) {
                circleEl.style.background = `conic-gradient(${color} ${pct}%, #374151 ${pct}%, #374151 100%)`;
            }

            const usedEl = document.getElementById('ram-used');
            if (usedEl) usedEl.textContent = formatBytes(r.usedBytes);

            const availEl = document.getElementById('ram-available');
            if (availEl) availEl.textContent = formatBytes(r.availableBytes);

            const totalEl = document.getElementById('ram-total');
            if (totalEl) totalEl.textContent = formatBytes(r.totalBytes);

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

            const storagePct = document.getElementById('storage-percentage');
            if (storagePct) storagePct.textContent = `${pct}%`;

            const bar = document.getElementById('storage-bar');
            if (bar) bar.style.width = `${pct}%`;

            const usedVal = document.getElementById('storage-used-val');
            if (usedVal) usedVal.textContent = formatBytes(s.usedBytes);

            const totalVal = document.getElementById('storage-total-val');
            if (totalVal) totalVal.textContent = formatBytes(s.totalBytes);

            const sUsed = document.getElementById('storage-used');
            if (sUsed) sUsed.textContent = formatBytes(s.usedBytes);

            const sFree = document.getElementById('storage-free');
            if (sFree) sFree.textContent = formatBytes(s.availableBytes);
        }

        // Process Applications Data and ADB status
        if (data.adbStatus) {
            latestAdbStatus = data.adbStatus;
        }

        if (data.apps && Array.isArray(data.apps)) {
            currentApps = data.apps;
            renderAppsTable();
        }

        // Update Source Badge & Subtitle
        const sourceBadge = document.getElementById('apps-source-badge');
        const subtitle = document.getElementById('apps-subtitle');

        if (data.adbStatus && data.adbStatus.active) {
            if (sourceBadge) {
                sourceBadge.textContent = 'ADB Connected';
                sourceBadge.className = 'text-[11px] px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300 font-mono';
            }
            if (subtitle) {
                const count = (currentApps && currentApps.length) || data.adbStatus.displayedProcesses || 0;
                subtitle.textContent = `Applications (≥ ${data.adbStatus.thresholdMB || 10} MB) — ${count} active`;
            }
        } else {
            if (sourceBadge) {
                sourceBadge.textContent = data.adbStatus?.state === 'no_device' ? 'No Device' : 'ADB Inactive';
                sourceBadge.className = 'text-[11px] px-2 py-0.5 rounded bg-gray-700 text-gray-400 font-mono';
            }
            if (subtitle) {
                subtitle.textContent = data.adbStatus?.message || 'Connect via ADB to monitor application RAM';
            }
        }
    });
}

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        formatBytes,
        formatMemoryMB,
        escapeHtml,
        filterAndSortApps
    };
}
