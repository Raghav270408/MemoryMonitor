const express = require('express');
const http = require('http');
const net = require('net');
const { Server } = require('socket.io');
const path = require('path');
const { AdbCollector } = require('./adbCollector');

// Configuration
const HTTP_PORT = 3000;
const TCP_PORT = 8080;

// Initialize Express and HTTP server
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Store latest data to send to newly connected web clients
let latestData = {
    ram: null,
    storage: null,
    apps: [],
    connected: false,
    lastUpdated: null
};

// Set of active Android TCP sockets
const activeSockets = new Set();
let watchdogTimer = null;

// Initialize ADB collector for per-process PSS measurements
const adbCollector = new AdbCollector({
    pollIntervalMs: 3500,
    onUpdate: (apps, status) => {
        latestData.apps = apps;
        if (latestData.connected) {
            io.emit('monitoring_data', {
                ram: latestData.ram,
                storage: latestData.storage,
                apps: latestData.apps,
                adbStatus: status,
                timestamp: Date.now()
            });
        }
    }
});

adbCollector.start();

// API endpoint for diagnostics
app.get('/api/status', (req, res) => {
    res.json({
        connected: latestData.connected,
        lastUpdated: latestData.lastUpdated,
        activeSockets: activeSockets.size,
        ram: latestData.ram,
        storage: latestData.storage,
        appsCount: (latestData.apps || []).length,
        adbStatus: adbCollector.getStatus()
    });
});

function setDeviceConnected(connected) {
    if (latestData.connected !== connected) {
        latestData.connected = connected;
        io.emit('device_status', { connected });
        console.log(`[Status] Android device ${connected ? 'CONNECTED' : 'DISCONNECTED'}`);
    }
}

function resetWatchdog() {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(() => {
        if (latestData.connected) {
            console.log('[Watchdog] No data for 4s — marking disconnected');
            setDeviceConnected(false);
        }
    }, 4000);
}

// WebSocket: browser dashboard connections
io.on('connection', (socket) => {
    console.log('[Web] Browser connected');

    socket.emit('device_status', { connected: latestData.connected });
    if (latestData.ram || latestData.storage) {
        socket.emit('monitoring_data', {
            ram: latestData.ram,
            storage: latestData.storage,
            apps: latestData.apps,
            adbStatus: adbCollector.getStatus(),
            timestamp: latestData.lastUpdated || Date.now()
        });
    }

    socket.on('disconnect', () => {
        console.log('[Web] Browser disconnected');
    });
});

// Process incoming JSON from Android
function handleIncomingPayload(parsedData) {
    if (!parsedData || typeof parsedData !== 'object') return false;
    if (!parsedData.ram && !parsedData.storage) return false;

    if (parsedData.ram && typeof parsedData.ram === 'object') latestData.ram = parsedData.ram;
    if (parsedData.storage && typeof parsedData.storage === 'object') latestData.storage = parsedData.storage;

    // Ingest authentic display names reported by Android package manager if available
    if (parsedData.apps && Array.isArray(parsedData.apps)) {
        for (const app of parsedData.apps) {
            if (app && app.packageName && app.displayName && app.displayName !== app.packageName) {
                adbCollector.setLabel(app.packageName, app.displayName);
            }
        }
    }

    latestData.lastUpdated = Date.now();
    parsedData.timestamp = latestData.lastUpdated;

    // Use ADB per-process PSS when available; otherwise omit per-app data
    const adbStatus = adbCollector.getStatus();
    if (adbStatus.active && latestData.apps && latestData.apps.length > 0) {
        parsedData.apps = latestData.apps;
    } else {
        parsedData.apps = [];
    }
    parsedData.adbStatus = adbStatus;

    setDeviceConnected(true);
    resetWatchdog();
    io.emit('monitoring_data', parsedData);
    return true;
}

// TCP Server: Android → Desktop
const tcpServer = net.createServer((socket) => {
    activeSockets.add(socket);
    socket.setKeepAlive(true, 5000);
    console.log(`[TCP] Android connected from ${socket.remoteAddress}:${socket.remotePort}`);

    setDeviceConnected(true);
    resetWatchdog();

    let buffer = '';

    socket.on('data', (data) => {
        buffer += data.toString();

        let messages = buffer.split('\n');

        if (messages.length === 1) {
            const trimmed = buffer.trim();
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                try {
                    const parsedData = JSON.parse(trimmed);
                    if (handleIncomingPayload(parsedData)) {
                        buffer = '';
                    }
                } catch (_) {
                    // Incomplete JSON, continue accumulating
                }
            }
        } else {
            buffer = messages.pop() || '';
            for (const msg of messages) {
                const trimmed = msg.trim();
                if (!trimmed) continue;
                try {
                    const parsedData = JSON.parse(trimmed);
                    handleIncomingPayload(parsedData);
                } catch (parseErr) {
                    console.warn('[TCP] Malformed message:', parseErr.message);
                }
            }
        }

        if (buffer.length > 200000) {
            console.log('[TCP] Buffer overflow — cleared');
            buffer = '';
        }
    });

    socket.on('close', () => {
        activeSockets.delete(socket);
        console.log(`[TCP] Socket closed (remaining: ${activeSockets.size})`);
        if (activeSockets.size === 0) {
            if (watchdogTimer) clearTimeout(watchdogTimer);
            setDeviceConnected(false);
        }
    });

    socket.on('error', (err) => {
        console.error('[TCP] Error:', err.message);
        activeSockets.delete(socket);
        if (activeSockets.size === 0) {
            if (watchdogTimer) clearTimeout(watchdogTimer);
            setDeviceConnected(false);
        }
    });
});

// Start servers
httpServer.listen(HTTP_PORT, () => {
    console.log(`Web Dashboard running at http://localhost:${HTTP_PORT}`);
});

tcpServer.listen(TCP_PORT, () => {
    console.log(`TCP Listener waiting for Android data on port ${TCP_PORT}`);
});
