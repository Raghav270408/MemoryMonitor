const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseDumpsysMeminfo, filterByThreshold, DEFAULT_DISPLAY_THRESHOLD_MB } = require('../adbCollector');

describe('AdbCollector Unit Tests', () => {

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

        // Verify top consumer (System UI process)
        assert.equal(apps[0].packageName, 'com.android.systemui');
        assert.equal(apps[0].pid, 1420);
        assert.equal(apps[0].memoryBytes, 245760 * 1024);
        assert.equal(apps[0].memoryMB, 240.0);
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

    it('filters small/negligible entries below the configurable threshold', () => {
        const apps = [
            { packageName: 'heavy.app', memoryMB: 150.0, memoryBytes: 150 * 1024 * 1024 },
            { packageName: 'medium.app', memoryMB: 25.0, memoryBytes: 25 * 1024 * 1024 },
            { packageName: 'threshold.app', memoryMB: 10.0, memoryBytes: 10 * 1024 * 1024 },
            { packageName: 'small.daemon', memoryMB: 8.5, memoryBytes: 8.5 * 1024 * 1024 },
            { packageName: 'tiny.service', memoryMB: 1.2, memoryBytes: 1.2 * 1024 * 1024 }
        ];

        // Default threshold (10 MB)
        const filteredDefault = filterByThreshold(apps);
        assert.equal(filteredDefault.length, 3);
        assert.equal(filteredDefault[0].packageName, 'heavy.app');
        assert.equal(filteredDefault[1].packageName, 'medium.app');
        assert.equal(filteredDefault[2].packageName, 'threshold.app');

        // Custom threshold boundary testing
        const filteredCustom = filterByThreshold(apps, 20.0);
        assert.equal(filteredCustom.length, 2);
        assert.equal(filteredCustom[0].packageName, 'heavy.app');
        assert.equal(filteredCustom[1].packageName, 'medium.app');

        // Retains raw data intact (non-mutating)
        assert.equal(apps.length, 5);
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
