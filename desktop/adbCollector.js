const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Known human-friendly package names for Android applications and system daemons.
 */
const KNOWN_PACKAGE_LABELS = {
    'com.example.memorymonitor': 'Memory Monitor',
    'com.android.systemui': 'System UI',
    'system': 'Android System',
    'com.google.android.gms': 'Google Play Services',
    'com.google.android.gms.persistent': 'Google Play Services (Persistent)',
    'com.android.chrome': 'Google Chrome',
    'com.google.android.youtube': 'YouTube',
    'com.google.android.apps.photos': 'Google Photos',
    'com.google.android.apps.messaging': 'Messages',
    'com.google.android.dialer': 'Phone',
    'com.android.settings': 'Settings',
    'com.google.android.googlequicksearchbox': 'Google App',
    'com.google.android.calendar': 'Google Calendar',
    'com.google.android.apps.maps': 'Google Maps',
    'com.whatsapp': 'WhatsApp',
    'com.instagram.android': 'Instagram',
    'com.spotify.music': 'Spotify',
    'com.facebook.katana': 'Facebook',
    'com.twitter.android': 'X (Twitter)',
    'org.telegram.messenger': 'Telegram',
    'com.microsoft.emmx': 'Microsoft Edge',
    'org.mozilla.firefox': 'Firefox'
};

/**
 * Resolves a human-readable display label from a package identifier.
 */
function formatDisplayName(pkgName) {
    if (!pkgName || typeof pkgName !== 'string') return 'Unknown Application';
    const trimmed = pkgName.trim();
    if (KNOWN_PACKAGE_LABELS[trimmed]) {
        return KNOWN_PACKAGE_LABELS[trimmed];
    }
    // Clean package name fallback: e.g. com.example.camera -> Camera, surfaceflinger -> Surfaceflinger
    const parts = trimmed.split('.');
    const lastPart = parts[parts.length - 1];
    if (lastPart && lastPart.length > 0) {
        // Capitalize first letter
        return lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
    }
    return trimmed;
}

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
 * @param {string} output - stdout from `adb shell dumpsys meminfo`
 * @param {number} [timestamp] - measurement timestamp in ms
 * @returns {Array<Object>} List of application memory records
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
                        displayName: formatDisplayName(packageName),
                        pid: pid,
                        memoryBytes: memoryBytes,
                        memoryMB: memoryMB,
                        metric: 'PSS',
                        source: 'ADB dumpsys meminfo',
                        status: 'available',
                        statusMessage: null,
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
 * Manages periodic ADB-assisted collection of process memory metrics.
 */
class AdbCollector {
    constructor(options = {}) {
        this.adbPath = options.adbPath || findAdbExecutable();
        this.pollIntervalMs = options.pollIntervalMs || 3500;
        this.timer = null;
        this.isPolling = false;
        this.latestApps = [];
        this.latestStatus = {
            active: false,
            state: 'uninitialized',
            message: 'ADB collector initializing'
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
            // Check connected ADB devices
            const devicesOutput = await this.runAdb(['devices'], 4000);
            const lines = devicesOutput.stdout.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('List of devices'));

            if (lines.length === 0) {
                this.latestStatus = {
                    active: false,
                    state: 'no_device',
                    message: 'No ADB device detected via USB. Using In-App telemetry.'
                };
                return;
            }

            // Find first authorized device
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
                        message: 'Device unauthorized. Please unlock your phone and tap "Allow USB Debugging".'
                    };
                } else {
                    this.latestStatus = {
                        active: false,
                        state: 'device_offline',
                        message: 'ADB device is offline or busy.'
                    };
                }
                return;
            }

            // Execute dumpsys meminfo
            const meminfoArgs = ['-s', authorizedSerial, 'shell', 'dumpsys', 'meminfo'];
            const meminfoOutput = await this.runAdb(meminfoArgs, 7000);

            const parsedApps = parseDumpsysMeminfo(meminfoOutput.stdout, Date.now());

            if (parsedApps.length > 0) {
                this.latestApps = parsedApps;
                this.latestStatus = {
                    active: true,
                    state: 'connected',
                    deviceId: authorizedSerial,
                    appsCount: parsedApps.length,
                    message: `ADB connected (${authorizedSerial}). Real-time PSS memory available.`
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
    formatDisplayName,
    findAdbExecutable
};
