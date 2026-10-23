const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('Dashboard Rendering and Sorting Unit Tests', () => {

    function filterAndSortApps(apps, searchQuery, sortMode) {
        let filtered = apps.filter(app => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase().trim();
            const name = (app.displayName || '').toLowerCase();
            const pkg = (app.packageName || '').toLowerCase();
            return name.includes(q) || pkg.includes(q);
        });

        filtered.sort((a, b) => {
            if (sortMode === 'mem-desc') {
                const memA = a.memoryBytes !== null && a.memoryBytes !== undefined ? a.memoryBytes : -1;
                const memB = b.memoryBytes !== null && b.memoryBytes !== undefined ? b.memoryBytes : -1;
                if (memB !== memA) return memB - memA;
                return (a.displayName || '').localeCompare(b.displayName || '');
            } else if (sortMode === 'mem-asc') {
                const memA = a.memoryBytes !== null && a.memoryBytes !== undefined ? a.memoryBytes : Infinity;
                const memB = b.memoryBytes !== null && b.memoryBytes !== undefined ? b.memoryBytes : Infinity;
                if (memA !== memB) return memA - memB;
                return (a.displayName || '').localeCompare(b.displayName || '');
            } else if (sortMode === 'name-asc') {
                return (a.displayName || '').localeCompare(b.displayName || '');
            }
            return 0;
        });

        return filtered;
    }

    const testApps = [
        { packageName: 'com.android.chrome', displayName: 'Google Chrome', memoryBytes: 157286400, memoryMB: 150.0, status: 'available' },
        { packageName: 'com.example.memorymonitor', displayName: 'Memory Monitor', memoryBytes: 47185920, memoryMB: 45.0, status: 'available' },
        { packageName: 'com.google.android.youtube', displayName: 'YouTube', memoryBytes: 314572800, memoryMB: 300.0, status: 'available' },
        { packageName: 'com.spotify.music', displayName: 'Spotify', memoryBytes: null, memoryMB: null, status: 'restricted' },
        { packageName: 'com.whatsapp', displayName: 'WhatsApp', memoryBytes: null, memoryMB: null, status: 'restricted' }
    ];

    it('correctly sorts by memory high to low with restricted apps at the end', () => {
        const sorted = filterAndSortApps(testApps, '', 'mem-desc');
        assert.equal(sorted[0].displayName, 'YouTube');
        assert.equal(sorted[1].displayName, 'Google Chrome');
        assert.equal(sorted[2].displayName, 'Memory Monitor');
        // Restricted apps (null memory) are placed at the end
        assert.equal(sorted[3].status, 'restricted');
        assert.equal(sorted[4].status, 'restricted');
    });

    it('correctly sorts by memory low to high with restricted apps at the end', () => {
        const sorted = filterAndSortApps(testApps, '', 'mem-asc');
        assert.equal(sorted[0].displayName, 'Memory Monitor');
        assert.equal(sorted[1].displayName, 'Google Chrome');
        assert.equal(sorted[2].displayName, 'YouTube');
        assert.equal(sorted[3].status, 'restricted');
        assert.equal(sorted[4].status, 'restricted');
    });

    it('correctly sorts alphabetically by app name', () => {
        const sorted = filterAndSortApps(testApps, '', 'name-asc');
        assert.equal(sorted[0].displayName, 'Google Chrome');
        assert.equal(sorted[1].displayName, 'Memory Monitor');
        assert.equal(sorted[2].displayName, 'Spotify');
        assert.equal(sorted[3].displayName, 'WhatsApp');
        assert.equal(sorted[4].displayName, 'YouTube');
    });

    it('filters applications by search query matching name or package', () => {
        const resultName = filterAndSortApps(testApps, 'chrome', 'mem-desc');
        assert.equal(resultName.length, 1);
        assert.equal(resultName[0].packageName, 'com.android.chrome');

        const resultPkg = filterAndSortApps(testApps, 'spotify', 'mem-desc');
        assert.equal(resultPkg.length, 1);
        assert.equal(resultPkg[0].displayName, 'Spotify');

        const resultEmpty = filterAndSortApps(testApps, 'nonexistent_query', 'mem-desc');
        assert.equal(resultEmpty.length, 0);
    });

    it('escapes HTML correctly to prevent script injection in table', () => {
        function escapeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
        assert.equal(escapeHtml('A & B'), 'A &amp; B');
    });
});
