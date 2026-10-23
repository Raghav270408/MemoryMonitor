const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Minimum PSS threshold in MB. Processes below this value are filtered
 * from the dashboard display to reduce clutter. Raw data is preserved
 * internally so totals remain accurate.
 */
const DEFAULT_DISPLAY_THRESHOLD_MB = 10;

/**
 * Recognized system daemons and platform processes that do not have
 * a traditional application launcher or APK metadata.
 */
const KNOWN_SYSTEM_LABELS = {
    'system': 'Android System',
    'surfaceflinger': 'SurfaceFlinger',
    'com.android.systemui': 'System UI',
    'com.google.android.gms': 'Google Play Services',
    'com.google.android.gms.persistent': 'Google Play Services',
    'com.android.vending': 'Google Play Store',
    'com.android.settings': 'Settings',
    'com.android.phone': 'Phone',
    'com.android.camera': 'Camera',
    'com.android.gallery3d': 'Gallery',
    'com.android.deskclock': 'Clock',
    'com.android.calculator2': 'Calculator',
    'com.android.contacts': 'Contacts'
};

/**
 * Baseline fallback mapping for popular applications used when
 * local aapt/SDK resolution is unavailable or execution fails.
 */
const COMMON_APP_LABELS = {
    'com.instagram.android': 'Instagram',
    'com.whatsapp': 'WhatsApp',
    'com.google.android.youtube': 'YouTube',
    'com.android.chrome': 'Chrome',
    'com.spotify.music': 'Spotify',
    'com.google.android.apps.photos': 'Google Photos',
    'com.google.android.apps.messaging': 'Messages',
    'com.google.android.apps.maps': 'Google Maps',
    'com.google.android.calendar': 'Google Calendar',
    'com.google.android.googlequicksearchbox': 'Google App',
    'com.google.android.gm': 'Gmail',
    'com.facebook.katana': 'Facebook',
    'com.twitter.android': 'X',
    'org.telegram.messenger': 'Telegram',
    'com.microsoft.office.word': 'Microsoft Word',
    'com.microsoft.teams': 'Microsoft Teams',
    'com.example.memorymonitor': 'Memory Monitor'
};

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
 * Locates the aapt (Android Asset Packaging Tool) executable on the local system,
 * scanning standard Android SDK build-tools paths.
 */
function findAaptExecutable() {
    if (process.env.AAPT_PATH && fs.existsSync(process.env.AAPT_PATH)) {
        return process.env.AAPT_PATH;
    }

    const candidateRoots = [
        process.env.ANDROID_HOME,
        process.env.ANDROID_SDK_ROOT,
        process.platform === 'win32' && process.env.LOCALAPPDATA
            ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk')
            : null
    ].filter(Boolean);

    for (const sdk of candidateRoots) {
        const buildToolsDir = path.join(sdk, 'build-tools');
        if (fs.existsSync(buildToolsDir)) {
            try {
                const versions = fs.readdirSync(buildToolsDir).sort().reverse();
                for (const ver of versions) {
                    const aaptExe = path.join(
                        buildToolsDir,
                        ver,
                        process.platform === 'win32' ? 'aapt.exe' : 'aapt'
                    );
                    if (fs.existsSync(aaptExe)) {
                        return aaptExe;
                    }
                }
            } catch (_) {}
        }
    }

    return null;
}

/**
 * Extracts the base package name from a process or package identifier,
 * stripping sub-process qualifiers (e.g. "com.app:search" -> "com.app").
 *
 * @param {string} packageName
 * @returns {string} base package identifier
 */
function getBasePackage(packageName) {
    if (!packageName || typeof packageName !== 'string') return '';
    const colonIndex = packageName.indexOf(':');
    if (colonIndex > 0) {
        return packageName.substring(0, colonIndex);
    }
    return packageName.trim();
}

/**
 * Resolves a human-friendly display label from a package name.
 * Uses cached mappings first, then known system/popular fallbacks,
 * and finally defaults to the package identifier when unresolvable.
 * Never fabricates or guesses labels (e.g. doesn't guess "Android" for com.instagram.android).
 *
 * @param {string} packageName - package or process identifier
 * @param {Map|Object} [labelCache] - in-memory resolution cache
 * @returns {string} friendly label or package identifier fallback
 */
function resolveDisplayName(packageName, labelCache = null) {
    if (!packageName || typeof packageName !== 'string') return 'Unknown';
    const base = getBasePackage(packageName);

    // 1. Check resolution cache
    if (labelCache) {
        if (typeof labelCache.get === 'function') {
            const cached = labelCache.get(base) || labelCache.get(packageName);
            if (cached) return cached;
        } else if (typeof labelCache === 'object') {
            const cached = labelCache[base] || labelCache[packageName];
            if (cached) return cached;
        }
    }

    // 2. Known system labels
    if (KNOWN_SYSTEM_LABELS[base]) return KNOWN_SYSTEM_LABELS[base];
    if (KNOWN_SYSTEM_LABELS[packageName]) return KNOWN_SYSTEM_LABELS[packageName];

    // 3. Common application labels fallback
    if (COMMON_APP_LABELS[base]) return COMMON_APP_LABELS[base];
    if (COMMON_APP_LABELS[packageName]) return COMMON_APP_LABELS[packageName];

    // 4. Fall back to the package name only when a label cannot be resolved.
    // Do NOT invent friendly names.
    return base;
}

/**
 * Uses aapt badging to extract application-label from a local APK file.
 *
 * @param {string} aaptPath
 * @param {string} apkFilePath
 * @returns {Promise<string|null>}
 */
function extractLabelWithAapt(aaptPath, apkFilePath) {
    return new Promise((resolve) => {
        execFile(aaptPath, ['dump', 'badging', apkFilePath], { timeout: 4000 }, (err, stdout) => {
            if (err || !stdout) return resolve(null);
            const m = stdout.match(/application-label(?:-[a-zA-Z0-9_-]+)?:'([^']+)'/) ||
                      stdout.match(/application:\s+label='([^']+)'/);
            if (m && m[1] && m[1].trim()) {
                return resolve(m[1].trim());
            }
            resolve(null);
        });
    });
}

/**
 * Resolves package label dynamically through ADB and Android package metadata.
 * Performs a general resolution via pm path and aapt if available, or
 * inspects cmd package resolve-activity metadata.
 *
 * @param {string} basePackage - base package identifier
 * @param {string|null} aaptPath - local path to aapt executable
 * @param {Function} runAdbFn - function to execute ADB commands
 * @param {string} deviceId - authorized target device serial
 * @returns {Promise<string|null>}
 */
async function resolveLabelFromMetadata(basePackage, aaptPath, runAdbFn, deviceId) {
    if (!basePackage || !runAdbFn || !deviceId) return null;

    try {
        // Query APK path via ADB: pm path <package>
        const pathOutput = await runAdbFn(['-s', deviceId, 'shell', 'pm', 'path', basePackage], 4000);
        if (pathOutput && pathOutput.stdout) {
            const lines = pathOutput.stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            let targetApkOnDevice = null;

            for (const line of lines) {
                if (line.startsWith('package:')) {
                    const p = line.replace('package:', '').trim();
                    // System partition packages often have a clean directory name matching the app
                    const sysMatch = p.match(/\/(?:system|product|system_ext)\/(?:priv-app|app)\/([^/]+)\/([^/]+)\.apk/i);
                    if (sysMatch && sysMatch[1]) {
                        return sysMatch[1];
                    }
                    if (!targetApkOnDevice && p.endsWith('.apk')) {
                        targetApkOnDevice = p;
                    }
                }
            }

            // If aapt is available on the desktop host, pull the APK temporarily to inspect metadata
            if (aaptPath && targetApkOnDevice) {
                const tempApk = path.join(os.tmpdir(), `mm_${basePackage.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.apk`);
                try {
                    await runAdbFn(['-s', deviceId, 'pull', targetApkOnDevice, tempApk], 8000);
                    if (fs.existsSync(tempApk)) {
                        const label = await extractLabelWithAapt(aaptPath, tempApk);
                        if (label) return label;
                    }
                } catch (_) {
                    // Pull or aapt inspection failed
                } finally {
                    if (fs.existsSync(tempApk)) {
                        try { fs.unlinkSync(tempApk); } catch (_) {}
                    }
                }
            }
        }

        // Check cmd package resolve-activity for nonLocalizedLabel
        try {
            const resolveOutput = await runAdbFn(
                ['-s', deviceId, 'shell', 'cmd', 'package', 'resolve-activity', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', basePackage],
                4000
            );
            if (resolveOutput && resolveOutput.stdout) {
                const labelMatch = resolveOutput.stdout.match(/nonLocalizedLabel=([^\s]+)/);
                if (labelMatch && labelMatch[1] && labelMatch[1] !== 'null') {
                    return labelMatch[1];
                }
            }
        } catch (_) {}

    } catch (_) {}

    return null;
}

/**
 * Parses raw `dumpsys meminfo` output from Android shell.
 * Extracts process names, PIDs, and PSS memory in KB, converting to bytes and MB.
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

    results.sort((a, b) => (b.memoryBytes || 0) - (a.memoryBytes || 0));
    return results;
}

/**
 * Aggregates processes belonging to the same application by base package identifier.
 * - Prevents duplicate app rows while ensuring memory measurements are safely summed
 *   without double-counting (each process line in dumpsys meminfo represents independent PSS).
 * - Filters out restricted, unavailable, and invalid measurements.
 * - Assigns friendly display names via labelCache.
 *
 * @param {Array<Object>} apps - raw process records
 * @param {Map|Object} [labelCache] - resolved labels cache
 * @returns {Array<Object>} aggregated application entries sorted descending by memory
 */
function aggregateApps(apps, labelCache = null) {
    if (!apps || !Array.isArray(apps)) return [];

    const appMap = new Map();

    for (const app of apps) {
        if (!app || !app.packageName) continue;

        // Requirement 2: Exclude restricted and unavailable entries
        if (app.status === 'restricted' || app.status === 'unavailable') continue;

        // Validate usable measurement (exclude null, undefined, NaN, and non-positive memory)
        if (app.memoryBytes === null || app.memoryBytes === undefined || isNaN(app.memoryBytes) || app.memoryBytes <= 0) {
            continue;
        }

        const basePackage = getBasePackage(app.packageName);
        const resolvedName = resolveDisplayName(basePackage, labelCache);

        if (!appMap.has(basePackage)) {
            appMap.set(basePackage, {
                packageName: basePackage,
                displayName: resolvedName,
                pid: app.pid || null,
                pids: app.pid ? [app.pid] : [],
                memoryBytes: app.memoryBytes,
                memoryMB: app.memoryMB || parseFloat((app.memoryBytes / (1024 * 1024)).toFixed(2)),
                timestamp: app.timestamp || Date.now(),
                processCount: 1
            });
        } else {
            const existing = appMap.get(basePackage);
            existing.memoryBytes += app.memoryBytes;
            existing.memoryMB = parseFloat((existing.memoryBytes / (1024 * 1024)).toFixed(2));
            if (app.pid && !existing.pids.includes(app.pid)) {
                existing.pids.push(app.pid);
            }
            existing.processCount += 1;
            if (existing.displayName === basePackage && resolvedName !== basePackage) {
                existing.displayName = resolvedName;
            }
        }
    }

    const aggregated = Array.from(appMap.values());
    aggregated.sort((a, b) => (b.memoryBytes || 0) - (a.memoryBytes || 0));
    return aggregated;
}

/**
 * Filters an app list to only include entries above the given MB threshold.
 * Excludes restricted and unavailable records. Does not mutate the input array.
 *
 * @param {Array<Object>} apps - app records
 * @param {number} [thresholdMB] - minimum PSS in MB to include
 * @returns {Array<Object>} filtered subset, still sorted by memory descending
 */
function filterByThreshold(apps, thresholdMB = DEFAULT_DISPLAY_THRESHOLD_MB) {
    if (!apps || !Array.isArray(apps)) return [];
    return apps.filter(app => {
        if (!app) return false;
        if (app.status === 'restricted' || app.status === 'unavailable') return false;
        if (typeof app.memoryMB !== 'number' || isNaN(app.memoryMB) || app.memoryMB <= 0) return false;
        return app.memoryMB >= thresholdMB;
    });
}

/**
 * Manages periodic ADB-assisted collection of process memory metrics.
 */
class AdbCollector {
    constructor(options = {}) {
        this.adbPath = options.adbPath || findAdbExecutable();
        this.aaptPath = options.aaptPath !== undefined ? options.aaptPath : findAaptExecutable();
        this.pollIntervalMs = options.pollIntervalMs || 3500;
        this.displayThresholdMB = options.displayThresholdMB || DEFAULT_DISPLAY_THRESHOLD_MB;
        this.timer = null;
        this.isPolling = false;
        this.latestAppsRaw = [];    // Unfiltered, complete list
        this.latestApps = [];       // Filtered and aggregated for display
        this.latestStatus = {
            active: false,
            state: 'uninitialized',
            message: 'ADB collector not started'
        };
        this.onUpdateCallback = options.onUpdate || null;

        // Label resolution & caching
        this.labelCache = new Map();
        for (const [pkg, label] of Object.entries(KNOWN_SYSTEM_LABELS)) {
            this.labelCache.set(pkg, label);
        }
        for (const [pkg, label] of Object.entries(COMMON_APP_LABELS)) {
            this.labelCache.set(pkg, label);
        }
        if (options.initialLabels) {
            for (const [pkg, label] of Object.entries(options.initialLabels)) {
                this.labelCache.set(pkg, label);
            }
        }
        this.pendingResolutions = new Set();
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

    getLabelCache() {
        return this.labelCache;
    }

    /**
     * Registers a known friendly label in the cache.
     *
     * @param {string} packageName
     * @param {string} displayName
     */
    setLabel(packageName, displayName) {
        if (!packageName || !displayName) return;
        const base = getBasePackage(packageName);
        this.labelCache.set(base, displayName);
        this.labelCache.set(packageName, displayName);

        // Update any matching displayed apps
        for (const app of this.latestApps) {
            if (app.packageName === base || app.packageName === packageName) {
                app.displayName = displayName;
            }
        }
    }

    /**
     * Resolves the friendly label for a package from cache or fallback.
     *
     * @param {string} packageName
     * @returns {string}
     */
    getLabel(packageName) {
        return resolveDisplayName(packageName, this.labelCache);
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
     * Queues asynchronous ADB-assisted package metadata resolution in the background.
     * Avoids blocking or slowing down periodic polling.
     *
     * @param {string} basePackage
     * @param {string} deviceId
     */
    queueLabelResolution(basePackage, deviceId) {
        if (!basePackage || !deviceId) return;
        if (this.labelCache.has(basePackage) || this.pendingResolutions.has(basePackage)) {
            return;
        }

        this.pendingResolutions.add(basePackage);

        resolveLabelFromMetadata(basePackage, this.aaptPath, this.runAdb.bind(this), deviceId)
            .then(label => {
                this.pendingResolutions.delete(basePackage);
                if (label) {
                    this.labelCache.set(basePackage, label);
                    let changed = false;
                    for (const app of this.latestApps) {
                        if (app.packageName === basePackage && app.displayName !== label) {
                            app.displayName = label;
                            changed = true;
                        }
                    }
                    if (changed && this.onUpdateCallback) {
                        this.onUpdateCallback(this.latestApps, this.latestStatus);
                    }
                } else {
                    // Mark as resolved to avoid querying repeatedly
                    this.labelCache.set(basePackage, basePackage);
                }
            })
            .catch(() => {
                this.pendingResolutions.delete(basePackage);
                this.labelCache.set(basePackage, basePackage);
            });
    }

    /**
     * Performs a single collection cycle:
     * 1. Check connected authorized devices via `adb devices`
     * 2. Query `dumpsys meminfo` if authorized device is present
     * 3. Aggregate processes by application, filter by threshold, and resolve labels
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
                const aggregated = aggregateApps(rawApps, this.labelCache);
                this.latestApps = filterByThreshold(aggregated, this.displayThresholdMB);

                // Asynchronously resolve friendly labels in the background for visible apps
                for (const app of this.latestApps) {
                    this.queueLabelResolution(app.packageName, authorizedSerial);
                }

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
    aggregateApps,
    filterByThreshold,
    resolveDisplayName,
    resolveLabelFromMetadata,
    extractLabelWithAapt,
    getBasePackage,
    findAdbExecutable,
    findAaptExecutable,
    DEFAULT_DISPLAY_THRESHOLD_MB,
    KNOWN_SYSTEM_LABELS,
    COMMON_APP_LABELS
};
