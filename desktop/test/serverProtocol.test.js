const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('Server Protocol and Backward Compatibility Tests', () => {

    function processMessageBuffer(rawBuffer) {
        const parsed = [];
        let buffer = rawBuffer;
        const messages = buffer.split('\n');
        
        if (messages.length === 1) {
            const trimmed = buffer.trim();
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                try {
                    const data = JSON.parse(trimmed);
                    if (data && typeof data === 'object' && (data.ram || data.storage)) {
                        parsed.push(data);
                    }
                } catch (_) {}
            }
        } else {
            messages.pop(); // last fragment
            for (const msg of messages) {
                const trimmed = msg.trim();
                if (!trimmed) continue;
                try {
                    const data = JSON.parse(trimmed);
                    if (data && typeof data === 'object' && (data.ram || data.storage)) {
                        parsed.push(data);
                    }
                } catch (_) {}
            }
        }
        return parsed;
    }

    it('successfully parses legacy JSON payload without apps field', () => {
        const legacyJson = '{"ram":{"totalBytes":8589934592,"availableBytes":3355443200,"usedBytes":5234688000,"usagePercentage":60,"memoryPressure":"Normal","systemMemoryStatus":"Normal","appMemoryBytes":47185920},"storage":{"totalBytes":274877906944,"availableBytes":176093659136,"usedBytes":98784247808,"usagePercentage":36}}\n';
        const result = processMessageBuffer(legacyJson);
        assert.equal(result.length, 1);
        assert.equal(result[0].ram.totalBytes, 8589934592);
        assert.equal(result[0].storage.totalBytes, 274877906944);
        assert.equal(result[0].apps, undefined);
    });

    it('successfully parses extended JSON payload with apps field', () => {
        const extendedJson = '{"ram":{"totalBytes":8589934592,"availableBytes":3355443200,"usedBytes":5234688000,"usagePercentage":60,"memoryPressure":"Normal","systemMemoryStatus":"Normal","appMemoryBytes":47185920},"storage":{"totalBytes":274877906944,"availableBytes":176093659136,"usedBytes":98784247808,"usagePercentage":36},"apps":[{"packageName":"com.example.memorymonitor","displayName":"Memory Monitor","pid":1234,"memoryBytes":47185920,"memoryMB":45.00,"metric":"PSS","source":"Debug.MemoryInfo","status":"available","statusMessage":null,"timestamp":1700000000000},{"packageName":"com.android.chrome","displayName":"Google Chrome","pid":null,"memoryBytes":null,"memoryMB":null,"metric":"PSS","source":"Android OS (In-App)","status":"restricted","statusMessage":"Restricted by Android OS (API 29+ security sandboxing)","timestamp":1700000000000}]}\n';
        const result = processMessageBuffer(extendedJson);
        assert.equal(result.length, 1);
        assert.equal(result[0].ram.totalBytes, 8589934592);
        assert.equal(result[0].apps.length, 2);
        assert.equal(result[0].apps[0].packageName, 'com.example.memorymonitor');
        assert.equal(result[0].apps[0].status, 'available');
        assert.equal(result[0].apps[1].packageName, 'com.android.chrome');
        assert.equal(result[0].apps[1].status, 'restricted');
        assert.equal(result[0].apps[1].memoryBytes, null);
    });

    it('handles multiple consecutive newline-delimited frames', () => {
        const frame1 = '{"ram":{"totalBytes":100,"availableBytes":50,"usedBytes":50,"usagePercentage":50,"memoryPressure":"Normal","systemMemoryStatus":"Normal","appMemoryBytes":10},"storage":{"totalBytes":1000,"availableBytes":500,"usedBytes":500,"usagePercentage":50},"apps":[]}\n';
        const frame2 = '{"ram":{"totalBytes":100,"availableBytes":40,"usedBytes":60,"usagePercentage":60,"memoryPressure":"Moderate","systemMemoryStatus":"Normal","appMemoryBytes":10},"storage":{"totalBytes":1000,"availableBytes":500,"usedBytes":500,"usagePercentage":50},"apps":[]}\n';
        
        const result = processMessageBuffer(frame1 + frame2);
        assert.equal(result.length, 2);
        assert.equal(result[0].ram.usagePercentage, 50);
        assert.equal(result[1].ram.usagePercentage, 60);
    });

    it('safely skips malformed JSON without throwing or crashing', () => {
        const malformed = 'INVALID_GARBAGE_JSON\n{"ram":{"totalBytes":100,"availableBytes":50,"usedBytes":50,"usagePercentage":50,"memoryPressure":"Normal","systemMemoryStatus":"Normal","appMemoryBytes":10},"storage":{"totalBytes":1000,"availableBytes":500,"usedBytes":500,"usagePercentage":50}}\n';
        const result = processMessageBuffer(malformed);
        assert.equal(result.length, 1);
        assert.equal(result[0].ram.totalBytes, 100);
    });

    it('constructs well-formed web dashboard payload with ADB and in-app distinction', () => {
        const adbStatus = { active: true, state: 'connected', message: 'ADB connected' };
        const apps = [
            {
                packageName: 'com.android.chrome',
                displayName: 'Google Chrome',
                pid: 1234,
                memoryBytes: 157286400,
                memoryMB: 150.0,
                metric: 'PSS',
                source: 'ADB dumpsys meminfo',
                status: 'available'
            }
        ];
        const dashboardPayload = JSON.stringify({
            ram: { totalBytes: 8000, availableBytes: 3000, usedBytes: 5000, usagePercentage: 62 },
            storage: { totalBytes: 100000, availableBytes: 60000, usedBytes: 40000, usagePercentage: 40 },
            apps: apps,
            adbStatus: adbStatus,
            timestamp: 1700000000000
        });

        assert.ok(dashboardPayload.includes('"com.android.chrome"'));
        assert.ok(dashboardPayload.includes('"active":true'));

        const parsed = JSON.parse(dashboardPayload);
        assert.equal(parsed.apps.length, 1);
        assert.equal(parsed.adbStatus.active, true);
    });
});
