const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseDumpsysMeminfo, formatDisplayName } = require('../adbCollector');

describe('AdbCollector Unit Tests', () => {

    it('formats known package names into human-friendly display labels', () => {
        assert.equal(formatDisplayName('com.example.memorymonitor'), 'Memory Monitor');
        assert.equal(formatDisplayName('com.android.chrome'), 'Google Chrome');
        assert.equal(formatDisplayName('com.google.android.youtube'), 'YouTube');
        assert.equal(formatDisplayName('system'), 'Android System');
        assert.equal(formatDisplayName('com.android.systemui'), 'System UI');
        assert.equal(formatDisplayName('com.spotify.music'), 'Spotify');
        // Unknown packages derive clean capitalized name from last segment
        assert.equal(formatDisplayName('com.vendor.camera'), 'Camera');
        assert.equal(formatDisplayName('net.custom.superapp'), 'Superapp');
    });

    it('parses typical dumpsys meminfo output with comma-separated KB values and PIDs', () => {
        const sampleOutput = `
Applications Memory Usage (in Kilobytes):
Uptime: 2452145 Realtime: 2452145

Total PSS by process:
    245,760K: com.android.systemui (pid 1420)
    122,880K: system (pid 980)
     61,440K: com.google.android.youtube (pid 23412 / activities)
     45,056K: com.example.memorymonitor (pid 10500)
     10,240K: com.android.phone (pid 2100)

Total PSS by OOM adjustment:
    ...
`;
        const apps = parseDumpsysMeminfo(sampleOutput, 1700000000000);

        assert.equal(apps.length, 5);

        // Verify top consumer (System UI)
        assert.equal(apps[0].packageName, 'com.android.systemui');
        assert.equal(apps[0].displayName, 'System UI');
        assert.equal(apps[0].pid, 1420);
        assert.equal(apps[0].memoryBytes, 245760 * 1024);
        assert.equal(apps[0].memoryMB, 240.0);
        assert.equal(apps[0].metric, 'PSS');
        assert.equal(apps[0].source, 'ADB dumpsys meminfo');
        assert.equal(apps[0].status, 'available');
        assert.equal(apps[0].timestamp, 1700000000000);

        // Verify memory monitor app record
        const monitorApp = apps.find(a => a.packageName === 'com.example.memorymonitor');
        assert.ok(monitorApp);
        assert.equal(monitorApp.pid, 10500);
        assert.equal(monitorApp.memoryBytes, 45056 * 1024);
        assert.equal(monitorApp.memoryMB, 44.0);

        // Verify sorting: highest to lowest memory
        for (let i = 0; i < apps.length - 1; i++) {
            assert.ok(apps[i].memoryBytes >= apps[i + 1].memoryBytes);
        }
    });

    it('handles lines without PID or with non-standard formatting safely', () => {
        const sampleOutput = `
Total PSS by process:
    10,240K: surfaceflinger
     5,120K: logd (pid 450)

Total PSS by category:
`;
        const apps = parseDumpsysMeminfo(sampleOutput);
        assert.equal(apps.length, 2);
        assert.equal(apps[0].packageName, 'surfaceflinger');
        assert.equal(apps[0].pid, null);
        assert.equal(apps[0].memoryMB, 10.0);
        assert.equal(apps[1].packageName, 'logd');
        assert.equal(apps[1].pid, 450);
        assert.equal(apps[1].memoryMB, 5.0);
    });

    it('returns empty array when output is empty or missing Total PSS section', () => {
        assert.deepEqual(parseDumpsysMeminfo(''), []);
        assert.deepEqual(parseDumpsysMeminfo(null), []);
        assert.deepEqual(parseDumpsysMeminfo('Device unauthorized or command failed'), []);
    });

    it('accurately converts KB to Bytes and MB', () => {
        const sampleOutput = `
Total PSS by process:
    153,600K: com.test.app (pid 100)
Total PSS by OOM:
`;
        const apps = parseDumpsysMeminfo(sampleOutput);
        assert.equal(apps.length, 1);
        assert.equal(apps[0].memoryBytes, 157286400); // 153600 * 1024
        assert.equal(apps[0].memoryMB, 150.0);       // 153600 / 1024
    });
});
