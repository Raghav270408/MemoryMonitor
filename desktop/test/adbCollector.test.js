const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    parseDumpsysMeminfo,
    filterByThreshold,
    aggregateApps,
    resolveDisplayName,
    getBasePackage,
    DEFAULT_DISPLAY_THRESHOLD_MB,
    AdbCollector
} = require('../adbCollector');

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

    it('resolves friendly app names from package identifiers using resolution mechanism', () => {
        const cache = new Map();
        cache.set('com.custom.app', 'Custom App Name');

        assert.equal(resolveDisplayName('com.instagram.android', cache), 'Instagram');
        assert.equal(resolveDisplayName('com.whatsapp', cache), 'WhatsApp');
        assert.equal(resolveDisplayName('com.google.android.youtube', cache), 'YouTube');
        assert.equal(resolveDisplayName('com.android.chrome', cache), 'Chrome');
        assert.equal(resolveDisplayName('com.android.systemui', cache), 'System UI');
        assert.equal(resolveDisplayName('system', cache), 'Android System');
        assert.equal(resolveDisplayName('surfaceflinger', cache), 'SurfaceFlinger');
        assert.equal(resolveDisplayName('com.custom.app', cache), 'Custom App Name');
    });

    it('uses cached lookups to avoid repeatedly querying package metadata', () => {
        const collector = new AdbCollector();
        collector.setLabel('com.foo.bar', 'Foo Bar App');

        // Lookups return cached label immediately
        assert.equal(collector.getLabel('com.foo.bar'), 'Foo Bar App');
        assert.equal(collector.getLabelCache().get('com.foo.bar'), 'Foo Bar App');

        // Subprocess also resolves to parent app's cached label
        assert.equal(collector.getLabel('com.foo.bar:service'), 'Foo Bar App');
    });

    it('falls back gracefully to package name for unknown packages without inventing fake names', () => {
        const cache = new Map();
        const unknownPkg = 'com.unknowncorp.specialservice123';

        // Does NOT invent fake friendly names like "Specialservice123"
        const resolved = resolveDisplayName(unknownPkg, cache);
        assert.equal(resolved, unknownPkg);
    });

    it('extracts base package from sub-process identifiers correctly', () => {
        assert.equal(getBasePackage('com.google.android.googlequicksearchbox:search'), 'com.google.android.googlequicksearchbox');
        assert.equal(getBasePackage('com.android.chrome:privileged_process0'), 'com.android.chrome');
        assert.equal(getBasePackage('system'), 'system');
        assert.equal(getBasePackage(''), '');
    });

    it('safely aggregates multiple processes of the same application without double-counting', () => {
        const rawProcesses = [
            { packageName: 'com.google.android.googlequicksearchbox:googleapp', pid: 1001, memoryBytes: 157286400, memoryMB: 150.0 },
            { packageName: 'com.google.android.googlequicksearchbox:search', pid: 1002, memoryBytes: 52428800, memoryMB: 50.0 },
            { packageName: 'com.whatsapp', pid: 2001, memoryBytes: 104857600, memoryMB: 100.0 },
            { packageName: 'com.whatsapp:sandboxed', pid: 2002, memoryBytes: 20971520, memoryMB: 20.0 },
            { packageName: 'com.standalone.app', pid: 3001, memoryBytes: 31457280, memoryMB: 30.0 }
        ];

        const aggregated = aggregateApps(rawProcesses);

        // 5 processes should be aggregated into 3 unique applications
        assert.equal(aggregated.length, 3);

        const gapp = aggregated.find(a => a.packageName === 'com.google.android.googlequicksearchbox');
        assert.ok(gapp);
        assert.equal(gapp.displayName, 'Google App');
        assert.equal(gapp.memoryMB, 200.0); // 150 + 50
        assert.equal(gapp.memoryBytes, 209715200);
        assert.equal(gapp.processCount, 2);
        assert.deepEqual(gapp.pids, [1001, 1002]);

        const wa = aggregated.find(a => a.packageName === 'com.whatsapp');
        assert.ok(wa);
        assert.equal(wa.displayName, 'WhatsApp');
        assert.equal(wa.memoryMB, 120.0); // 100 + 20
        assert.equal(wa.processCount, 2);

        // Verify sorted descending by memory
        assert.equal(aggregated[0].packageName, 'com.google.android.googlequicksearchbox');
        assert.equal(aggregated[1].packageName, 'com.whatsapp');
        assert.equal(aggregated[2].packageName, 'com.standalone.app');
    });

    it('removes restricted, unavailable, and invalid measurements during aggregation', () => {
        const mixedData = [
            { packageName: 'com.valid.app', memoryBytes: 52428800, memoryMB: 50.0, status: 'available' },
            { packageName: 'com.restricted.app', memoryBytes: null, memoryMB: null, status: 'restricted' },
            { packageName: 'com.unavailable.app', memoryBytes: 0, memoryMB: 0, status: 'unavailable' },
            { packageName: 'com.nan.app', memoryBytes: NaN, memoryMB: NaN },
            { packageName: 'com.negative.app', memoryBytes: -100, memoryMB: -1.0 }
        ];

        const result = aggregateApps(mixedData);
        assert.equal(result.length, 1);
        assert.equal(result[0].packageName, 'com.valid.app');
        assert.equal(result[0].memoryMB, 50.0);
    });
});
