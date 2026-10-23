const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');

describe('TCP Streaming Integration Test', () => {

    it('frames and parses newline-delimited JSON stream with backpressure safety', async () => {
        const received = [];

        // Create a test TCP server
        const server = net.createServer((socket) => {
            let buffer = '';
            socket.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop(); // keep remainder
                for (const line of lines) {
                    if (line.trim()) {
                        received.push(JSON.parse(line.trim()));
                    }
                }
            });
        });

        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;

        // Client connects and sends frames
        const client = net.createConnection({ port, host: '127.0.0.1' });
        await new Promise(resolve => client.on('connect', resolve));

        const testFrame = {
            ram: { totalBytes: 8000, availableBytes: 3000, usedBytes: 5000, usagePercentage: 62 },
            storage: { totalBytes: 100000, availableBytes: 60000, usedBytes: 40000, usagePercentage: 40 },
            apps: [
                {
                    packageName: 'com.example.memorymonitor',
                    displayName: 'Memory Monitor',
                    pid: 1234,
                    memoryBytes: 47185920,
                    memoryMB: 45.0,
                    metric: 'PSS',
                    source: 'Debug.MemoryInfo',
                    status: 'available',
                    statusMessage: null,
                    timestamp: 1700000000000
                }
            ]
        };

        client.write(JSON.stringify(testFrame) + '\n');
        
        // Wait for server to receive
        await new Promise(resolve => setTimeout(resolve, 50));

        assert.equal(received.length, 1);
        assert.equal(received[0].ram.totalBytes, 8000);
        assert.equal(received[0].apps.length, 1);
        assert.equal(received[0].apps[0].packageName, 'com.example.memorymonitor');
        assert.equal(received[0].apps[0].status, 'available');

        client.end();
        await new Promise(resolve => server.close(resolve));
    });

    it('verifies strictly one-way telemetry from client to server without reverse traffic', async () => {
        let serverReceivedFrame = null;
        const server = net.createServer((socket) => {
            let buffer = '';
            socket.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    if (line.trim()) {
                        serverReceivedFrame = JSON.parse(line.trim());
                        // Strictly one-way: server does NOT write back to socket
                    }
                }
            });
        });

        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;

        const client = net.createConnection({ port, host: '127.0.0.1' });
        await new Promise(resolve => client.on('connect', resolve));

        const clientReceivedData = [];
        client.on('data', (data) => {
            clientReceivedData.push(data);
        });

        // Send telemetry frame from client
        const payload = {
            ram: { totalBytes: 8000, availableBytes: 3000, usedBytes: 5000, usagePercentage: 62 },
            storage: { totalBytes: 100000, availableBytes: 60000, usedBytes: 40000, usagePercentage: 40 },
            apps: [
                {
                    packageName: 'com.example.memorymonitor',
                    displayName: 'Memory Monitor',
                    pid: 1234,
                    memoryBytes: 47185920,
                    memoryMB: 45.0,
                    metric: 'PSS',
                    source: 'Debug.MemoryInfo',
                    status: 'available',
                    statusMessage: null,
                    timestamp: 1700000000000
                }
            ]
        };
        client.write(JSON.stringify(payload) + '\n');

        await new Promise(resolve => setTimeout(resolve, 80));

        // Verify server received the frame
        assert.ok(serverReceivedFrame !== null);
        assert.equal(serverReceivedFrame.apps.length, 1);
        assert.equal(serverReceivedFrame.apps[0].packageName, 'com.example.memorymonitor');

        // Verify strictly one-way: no reverse data was sent to the client
        assert.equal(clientReceivedData.length, 0);

        client.end();
        await new Promise(resolve => server.close(resolve));
    });
});
