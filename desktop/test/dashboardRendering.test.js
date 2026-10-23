const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { filterAndSortApps, escapeHtml } = require('../public/js/app');

describe('Dashboard Rendering and Sorting Unit Tests', () => {

    const testApps = [
        { packageName: 'com.android.chrome', displayName: 'Chrome', memoryBytes: 157286400, memoryMB: 150.0, status: 'available' },
        { packageName: 'com.example.memorymonitor', displayName: 'Memory Monitor', memoryBytes: 47185920, memoryMB: 45.0, status: 'available' },
        { packageName: 'com.google.android.youtube', displayName: 'YouTube', memoryBytes: 314572800, memoryMB: 300.0, status: 'available' },
        { packageName: 'com.spotify.music', displayName: 'Spotify', memoryBytes: null, memoryMB: null, status: 'restricted' },
        { packageName: 'com.whatsapp', displayName: 'WhatsApp', memoryBytes: null, memoryMB: null, status: 'restricted' },
        { packageName: 'com.unavailable.app', displayName: 'Unavailable App', memoryBytes: 0, memoryMB: 0, status: 'unavailable' }
    ];

    it('correctly sorts by RAM usage descending (highest first) and removes restricted/unavailable rows', () => {
        const sorted = filterAndSortApps(testApps, '');

        // Restricted and unavailable entries must not appear in the per-app memory list
        assert.equal(sorted.length, 3);
        assert.equal(sorted[0].displayName, 'YouTube');
        assert.equal(sorted[0].memoryMB, 300.0);
        assert.equal(sorted[1].displayName, 'Chrome');
        assert.equal(sorted[1].memoryMB, 150.0);
        assert.equal(sorted[2].displayName, 'Memory Monitor');
        assert.equal(sorted[2].memoryMB, 45.0);

        // Ensure no restricted or unavailable apps are present
        const hasRestricted = sorted.some(a => a.status === 'restricted' || a.status === 'unavailable' || a.memoryBytes === null);
        assert.equal(hasRestricted, false);
    });

    it('filters applications by search query matching friendly name or package identifier', () => {
        const resultByName = filterAndSortApps(testApps, 'chrome');
        assert.equal(resultByName.length, 1);
        assert.equal(resultByName[0].packageName, 'com.android.chrome');
        assert.equal(resultByName[0].displayName, 'Chrome');

        const resultByPkg = filterAndSortApps(testApps, 'com.google.android.youtube');
        assert.equal(resultByPkg.length, 1);
        assert.equal(resultByPkg[0].displayName, 'YouTube');

        const resultEmpty = filterAndSortApps(testApps, 'nonexistent_app');
        assert.equal(resultEmpty.length, 0);
    });

    it('excludes invalid measurements (null, undefined, negative, or NaN memory)', () => {
        const invalidApps = [
            { packageName: 'valid.app', displayName: 'Valid App', memoryBytes: 52428800, memoryMB: 50.0 },
            { packageName: 'null.mem', displayName: 'Null Mem', memoryBytes: null, memoryMB: null },
            { packageName: 'undefined.mem', displayName: 'Undef Mem' },
            { packageName: 'zero.mem', displayName: 'Zero Mem', memoryBytes: 0, memoryMB: 0 },
            { packageName: 'negative.mem', displayName: 'Negative Mem', memoryBytes: -100, memoryMB: -1.0 },
            { packageName: 'nan.mem', displayName: 'NaN Mem', memoryBytes: NaN, memoryMB: NaN }
        ];

        const cleaned = filterAndSortApps(invalidApps, '');
        assert.equal(cleaned.length, 1);
        assert.equal(cleaned[0].packageName, 'valid.app');
        assert.equal(cleaned[0].displayName, 'Valid App');
    });

    it('escapes HTML correctly to prevent script injection in table', () => {
        assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
        assert.equal(escapeHtml('A & B'), 'A &amp; B');
        assert.equal(escapeHtml('\'test\''), '&#039;test&#039;');
        assert.equal(escapeHtml(''), '');
        assert.equal(escapeHtml(null), '');
    });

    it('displays friendly application name as primary label and retains package identifier', () => {
        const sorted = filterAndSortApps(testApps, '');
        for (const app of sorted) {
            assert.ok(app.displayName, 'displayName must be defined');
            assert.ok(app.packageName, 'packageName must remain available internally');
            // Friendly name should be human-readable, not a raw reverse-domain package name
            assert.ok(!app.displayName.startsWith('com.'), 'friendly name should not be a raw package name');
        }
    });
});
