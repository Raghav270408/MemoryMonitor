const express = require('express');
const http = require('http');
const net = require('net');
const { Server } = require('socket.io');
const path = require('path');

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
    connected: false,
    lastUpdated: null,
    totalFramesReceived: 0
};

// API endpoint for health check and diagnostics
app.get('/api/status', (req, res) => {
    res.json({
        connected: latestData.connected,
        lastUpdated: latestData.lastUpdated,
        totalFramesReceived: latestData.totalFramesReceived,
        activeSockets: activeSockets.size,
        ram: latestData.ram,
        storage: latestData.storage
    });
});

// Set of active Android TCP sockets
const activeSockets = new Set();
let watchdogTimer = null;

function setDeviceConnected(connected) {
    if (latestData.connected !== connected) {
        latestData.connected = connected;
        io.emit('device_status', { connected: latestData.connected });
        console.log(`[Status] Android device is now ${connected ? 'CONNECTED' : 'DISCONNECTED'}`);
    }
}

function resetWatchdog() {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    // If no metrics payload is received for 4 seconds, mark device as disconnected
    watchdogTimer = setTimeout(() => {
        if (latestData.connected) {
            console.log('[Watchdog] No metrics received for 4 seconds, marking Android device as DISCONNECTED');
            setDeviceConnected(false);
        }
    }, 4000);
}

// WebSocket Connection (Frontend Browser Dashboard to Server)
io.on('connection', (socket) => {
    console.log('[Web] Browser client connected to dashboard');
    
    // Send the latest known status and data immediately upon connection
    socket.emit('device_status', { connected: latestData.connected });
    if (latestData.ram || latestData.storage) {
        socket.emit('monitoring_data', {
            ram: latestData.ram,
            storage: latestData.storage,
            timestamp: latestData.lastUpdated
        });
    }

    socket.on('disconnect', () => {
        console.log('[Web] Browser client disconnected');
    });
});

// TCP Server (Android App to Server)
const tcpServer = net.createServer((socket) => {
    activeSockets.add(socket);
    socket.setKeepAlive(true, 5000);
    console.log(`[TCP] Android connected from ${socket.remoteAddress}:${socket.remotePort} (Active sockets: ${activeSockets.size})`);
    
    setDeviceConnected(true);
    resetWatchdog();

    let buffer = '';

    socket.on('data', (data) => {
        buffer += data.toString();
        
        // Split by newline to demarcate JSON messages.
        // Android client sends newline-delimited JSON (\n).
        let messages = buffer.split('\n');
        
        if (messages.length === 1) {
            // No newline present yet; only try parsing if buffer looks like a complete JSON object
            const trimmed = buffer.trim();
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                try {
                    const parsedData = JSON.parse(trimmed);
                    if (parsedData && typeof parsedData === 'object' && (parsedData.ram || parsedData.storage)) {
                        if (parsedData.ram && typeof parsedData.ram === 'object') latestData.ram = parsedData.ram;
                        if (parsedData.storage && typeof parsedData.storage === 'object') latestData.storage = parsedData.storage;
                        latestData.totalFramesReceived++;
                        latestData.lastUpdated = Date.now();
                        parsedData.timestamp = latestData.lastUpdated;

                        setDeviceConnected(true);
                        resetWatchdog();
                        io.emit('monitoring_data', parsedData);
                        buffer = ''; // clear buffer after successful parse
                    }
                } catch (_) {
                    // Incomplete JSON fragment, continue accumulating in buffer
                }
            }
        } else {
            // Keep the last incomplete fragment in the buffer
            buffer = messages.pop() || '';
            
            for (const msg of messages) {
                const trimmed = msg.trim();
                if (!trimmed) continue;
                try {
                    const parsedData = JSON.parse(trimmed);
                    if (parsedData && typeof parsedData === 'object' && (parsedData.ram || parsedData.storage)) {
                        if (parsedData.ram && typeof parsedData.ram === 'object') latestData.ram = parsedData.ram;
                        if (parsedData.storage && typeof parsedData.storage === 'object') latestData.storage = parsedData.storage;
                        latestData.totalFramesReceived++;
                        latestData.lastUpdated = Date.now();
                        parsedData.timestamp = latestData.lastUpdated;

                        if (latestData.totalFramesReceived % 10 === 0) {
                            console.log(`[Metrics] Total frames received: ${latestData.totalFramesReceived}. RAM usage: ${parsedData.ram?.usagePercentage}% (${parsedData.ram?.usedBytes} bytes), Storage: ${parsedData.storage?.usagePercentage}%`);
                        }

                        setDeviceConnected(true);
                        resetWatchdog();
                        io.emit('monitoring_data', parsedData);
                    }
                } catch (parseErr) {
                    console.warn('[TCP] Ignored malformed message from Android:', parseErr.message);
                }
            }
        }

        // Buffer overflow protection
        if (buffer.length > 100000) {
            console.log('[TCP] Buffer cleared to prevent overflow');
            buffer = '';
        }
    });

    socket.on('close', () => {
        activeSockets.delete(socket);
        console.log(`[TCP] Android socket closed (${socket.remoteAddress}:${socket.remotePort}). Remaining active: ${activeSockets.size}`);
        if (activeSockets.size === 0) {
            if (watchdogTimer) clearTimeout(watchdogTimer);
            setDeviceConnected(false);
        }
    });

    socket.on('error', (err) => {
        console.error('[TCP] Socket Error:', err.message);
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
