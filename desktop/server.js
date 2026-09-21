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
    connected: false
};

// WebSocket Connection (Frontend to Backend)
io.on('connection', (socket) => {
    console.log('Web client connected to dashboard');
    
    // Send the latest known data immediately upon connection
    socket.emit('device_status', { connected: latestData.connected });
    if (latestData.ram || latestData.storage) {
        socket.emit('monitoring_data', {
            ram: latestData.ram,
            storage: latestData.storage
        });
    }

    socket.on('disconnect', () => {
        console.log('Web client disconnected');
    });
});

// TCP Server (Android to Backend)
const tcpServer = net.createServer((socket) => {
    console.log(`Android device connected from ${socket.remoteAddress}:${socket.remotePort}`);
    
    latestData.connected = true;
    io.emit('device_status', { connected: true });

    let buffer = '';

    socket.on('data', (data) => {
        buffer += data.toString();
        
        try {
            // Split by newline in case multiple JSON objects are sent quickly.
            // It is standard practice for the TCP client (Android) to send a newline (\n) 
            // after each JSON payload to demarcate messages.
            let messages = buffer.split('\n');
            
            if (messages.length === 1) {
                // Try parsing the whole buffer if no newlines are present
                const parsedData = JSON.parse(buffer);
                if (parsedData.ram) latestData.ram = parsedData.ram;
                if (parsedData.storage) latestData.storage = parsedData.storage;
                io.emit('monitoring_data', parsedData);
                buffer = ''; // clear buffer after successful parse
            } else {
                buffer = messages.pop(); // Keep the last incomplete part in the buffer
                
                for (const msg of messages) {
                    if (msg.trim() === '') continue;
                    const parsedData = JSON.parse(msg);
                    if (parsedData.ram) latestData.ram = parsedData.ram;
                    if (parsedData.storage) latestData.storage = parsedData.storage;
                    io.emit('monitoring_data', parsedData);
                }
            }
        } catch (e) {
             // JSON might be incomplete, wait for more data in the buffer
             if (buffer.length > 100000) {
                 console.log('Buffer cleared to prevent overflow');
                 buffer = ''; 
             }
        }
    });

    socket.on('close', () => {
        console.log('Android device disconnected');
        latestData.connected = false;
        io.emit('device_status', { connected: false });
    });

    socket.on('error', (err) => {
        console.error('TCP Socket Error:', err.message);
    });
});

// Start servers
httpServer.listen(HTTP_PORT, () => {
    console.log(`Web Dashboard running at http://localhost:${HTTP_PORT}`);
});

tcpServer.listen(TCP_PORT, () => {
    console.log(`TCP Listener waiting for Android data on port ${TCP_PORT}`);
});
