const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Minimum PSS threshold in MB. Processes below this value are filtered
 * from the dashboard display to reduce clutter. Raw data is preserved
 * internally so totals remain accurate.
 *
 * Rationale: system daemons and idle background services typically use
 * 1-8 MB of PSS. Displaying them alongside apps using 100+ MB makes
 * the list hard to scan. 10 MB is a reasonable default that hides most
 * low-level daemons while keeping every user-visible app.
 */
const DEFAULT_DISPLAY_THRESHOLD_MB = 10;

/**
 * Locates the adb executable on the local desktop system.
 */
function findAdbExecutable() {
    if (process.env.ADB_PATH && fs.existsSync(process.env.ADB_PATH)) {
        return process.env.ADB_PATH;
    }

    if (process.platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA;
        if (localAppData) {
            const sdkAdb = path.join(localAppData, 'Android', 'Sdk', 'platform-tools', 'adb.exe');
            if (fs.existsSync(sdkAdb)) {
                return sdkAdb;
            }
        }
    }

    return 'adb';
}

/**
 * Parses raw `dumpsys meminfo` output from Android shell.
 * Extracts process names, PIDs, and PSS memory in KB, converting to bytes and MB.
 *
 * The "Total PSS by process" section already aggregates multiple processes
 * sharing the same package into a single entry, so no further grouping is
 * needed here. Each line represents independent PSS for that process name.
 *
 * @param {string} output - stdout from `adb shell dumpsys meminfo`
 * @param {number} [timestamp] - measurement timestamp in ms
 * @returns {Array<Object>} List of application memory records, sorted by PSS descending
 */
function parseDumpsysMeminfo(output, timestamp = Date.now()) {
    if (!output || typeof output !== 'string') return [];

    const results = [];
    const lines = output.split(/\r?\n/);
    let inProcessSection = false;

    // Matches lines like:
    // "    142,352K: com.android.systemui (pid 1420)"
    // "     85,120K: system (pid 980)"
    // "     64,300K: com.example.memorymonitor (pid 12345 / activities)"
    const processLineRegex = /^\s*([0-9,]+)\s*K:\s+([^\s(]+)(?:\s*\(pid\s*(\d+))?/i;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.includes('Total PSS by process:')) {
            inProcessSection = true;
            continue;
        }

        if (inProcessSection) {
            // End of process section when another section begins
            if (line.startsWith('Total PSS by OOM') ||
                line.startsWith('Total PSS by category') ||
                line.startsWith('Total RAM:') ||
                line.startsWith('Applications Memory Usage')) {
                break;
            }

            const match = line.match(processLineRegex);
            if (match) {
                const kbStr = match[1].replace(/,/g, '');
                const kb = parseInt(kbStr, 10);
                const packageName = match[2].trim();
                const pid = match[3] ? parseInt(match[3], 10) : null;

                if (!isNaN(kb) && packageName) {
                    const memoryBytes = kb * 1024;
                    const memoryMB = parseFloat((kb / 1024).toFixed(2));

                    results.push({
                        packageName: packageName,
                        pid: pid,
                        memoryBytes: memoryBytes,
                        memoryMB: memoryMB,
                        timestamp: timestamp
                    });
                }
            }
        }
    }

    // Sort descending by memory consumption
    results.sort((a, b) => (b.memoryBytes || 0) - (a.memoryBytes || 0));

    return results;
}

/**
 * Filters a parsed app list to only include entries above the given MB threshold.
 * Does not mutate the input array.
 *
 * @param {Array<Object>} apps - parsed app records from parseDumpsysMeminfo
 * @param {number} [thresholdMB] - minimum PSS in MB to include
 * @returns {Array<Object>} filtered subset, still sorted by memory descending
 */
function filterByThreshold(apps, thresholdMB = DEFAULT_DISPLAY_THRESHOLD_MB) {
    if (!apps || !Array.isArray(apps)) return [];
    return apps.filter(app => app.memoryMB >= thresholdMB);
}

/**
 * Manages periodic ADB-assisted collection of process memory metrics.
 */
class AdbCollector {
    constructor(options = {}) {
        this.adbPath = options.adbPath || findAdbExecutable();
        this.pollIntervalMs = options.pollIntervalMs || 3500;
        this.displayThresholdMB = options.displayThresholdMB || DEFAULT_DISPLAY_THRESHOLD_MB;
        this.timer = null;
        this.isPolling = false;
        this.latestAppsRaw = [];    // Unfiltered, complete list
        this.latestApps = [];       // Filtered for display
        this.latestStatus = {
            active: false,
            state: 'uninitialized',
            message: 'ADB collector not started'
        };
        this.onUpdateCallback = options.onUpdate || null;
    }

    start() {
        if (this.timer) return;
        this.poll();
        this.timer = setInterval(() => this.poll(), this.pollIntervalMs);
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.latestStatus = {
            active: false,
            state: 'stopped',
            message: 'ADB collector stopped'
        };
    }

    getStatus() {
        return this.latestStatus;
    }

    getLatestApps() {
        return this.latestApps;
    }

    getRawApps() {
        return this.latestAppsRaw;
    }

    /**
     * Executes ADB command with timeout and buffer protection.
     */
    runAdb(args, timeoutMs = 8000) {
        return new Promise((resolve, reject) => {
            execFile(this.adbPath, args, { timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) => {
                if (err) {
                    return reject(err);
                }
                resolve({ stdout, stderr });
            });
        });
    }

    /**
     * Performs a single collection cycle:
     * 1. Check connected authorized devices via `adb devices`
     * 2. Query `dumpsys meminfo` if authorized device is present
     */
    async poll() {
        if (this.isPolling) return;
        this.isPolling = true;

        try {
            const devicesOutput = await this.runAdb(['devices'], 4000);
            const lines = devicesOutput.stdout.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('List of devices'));

            if (lines.length === 0) {
                this.latestStatus = {
                    active: false,
                    state: 'no_device',
                    message: 'No ADB device detected'
                };
                return;
            }

            let authorizedSerial = null;
            let unauthorized = false;

            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 2) {
                    const serial = parts[0];
                    const state = parts[1];
                    if (state === 'device') {
                        authorizedSerial = serial;
                        break;
                    } else if (state === 'unauthorized') {
                        unauthorized = true;
                    }
                }
            }

            if (!authorizedSerial) {
                if (unauthorized) {
                    this.latestStatus = {
                        active: false,
                        state: 'unauthorized',
                        message: 'Device unauthorized — allow USB debugging on the phone'
                    };
                } else {
                    this.latestStatus = {
                        active: false,
                        state: 'device_offline',
                        message: 'ADB device is offline or busy'
                    };
                }
                return;
            }

            const meminfoArgs = ['-s', authorizedSerial, 'shell', 'dumpsys', 'meminfo'];
            const meminfoOutput = await this.runAdb(meminfoArgs, 7000);

            const rawApps = parseDumpsysMeminfo(meminfoOutput.stdout, Date.now());

            if (rawApps.length > 0) {
                this.latestAppsRaw = rawApps;
                this.latestApps = filterByThreshold(rawApps, this.displayThresholdMB);
                this.latestStatus = {
                    active: true,
                    state: 'connected',
                    deviceId: authorizedSerial,
                    totalProcesses: rawApps.length,
                    displayedProcesses: this.latestApps.length,
                    thresholdMB: this.displayThresholdMB,
                    message: `ADB connected (${authorizedSerial})`
                };

                if (this.onUpdateCallback) {
                    this.onUpdateCallback(this.latestApps, this.latestStatus);
                }
            }
        } catch (err) {
            this.latestStatus = {
                active: false,
                state: 'error',
                message: `ADB error: ${err.message || 'Execution failed'}`
            };
        } finally {
            this.isPolling = false;
        }
    }
}

module.exports = {
    AdbCollector,
    parseDumpsysMeminfo,
    filterByThreshold,
    findAdbExecutable,
    DEFAULT_DISPLAY_THRESHOLD_MB
};
