package com.example.memorymonitor

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.os.Debug
import android.os.Environment
import android.os.StatFs
import java.util.Locale

/**
 * Represents memory and process metrics for an individual application.
 *
 * Designed to represent authentic measurements when available, or explicit status
 * and limitations when Android OS security sandboxing restricts inspection of other processes.
 */
data class AppMemoryInfo(
    val packageName: String,
    val displayName: String,
    val pid: Int? = null,
    val memoryBytes: Long? = null,
    val memoryMB: Double? = null,
    val metric: String = "PSS",
    val source: String,
    val status: String, // "available", "restricted", "unavailable"
    val statusMessage: String? = null,
    val timestamp: Long = System.currentTimeMillis()
) {
    fun toJsonString(): String {
        val pidStr = pid?.toString() ?: "null"
        val bytesStr = memoryBytes?.toString() ?: "null"
        val mbStr = memoryMB?.let { String.format(Locale.US, "%.2f", it) } ?: "null"
        val msgStr = statusMessage?.let { "\"${escapeJson(it)}\"" } ?: "null"
        val safeDisplayName = escapeJson(displayName)
        val safePkgName = escapeJson(packageName)
        val safeMetric = escapeJson(metric)
        val safeSource = escapeJson(source)
        val safeStatus = escapeJson(status)
        return """{"packageName":"$safePkgName","displayName":"$safeDisplayName","pid":$pidStr,"memoryBytes":$bytesStr,"memoryMB":$mbStr,"metric":"$safeMetric","source":"$safeSource","status":"$safeStatus","statusMessage":$msgStr,"timestamp":$timestamp}"""
    }

    companion object {
        fun escapeJson(str: String): String {
            val sb = StringBuilder(str.length + 16)
            for (ch in str) {
                when (ch) {
                    '\\' -> sb.append("\\\\")
                    '"' -> sb.append("\\\"")
                    '\b' -> sb.append("\\b")
                    '\n' -> sb.append("\\n")
                    '\r' -> sb.append("\\r")
                    '\t' -> sb.append("\\t")
                    else -> {
                        if (ch.code < 32) {
                            sb.append(String.format(Locale.US, "\\u%04x", ch.code))
                        } else {
                            sb.append(ch)
                        }
                    }
                }
            }
            return sb.toString()
        }
    }
}

data class MemoryStats(
    val totalMemoryMB: Long,
    val availableMemoryMB: Long,
    val usedMemoryMB: Long,
    val usagePercentage: Int,
    val memoryPressure: String,
    val lowMemoryStatus: Boolean,
    val appMemoryUsageMB: Long,
    val totalStorageGB: Long,
    val freeStorageGB: Long,
    val usedStorageGB: Long,
    val storageUsagePercentage: Int,
    val totalMemoryBytes: Long = totalMemoryMB * 1024L * 1024L,
    val availableMemoryBytes: Long = availableMemoryMB * 1024L * 1024L,
    val usedMemoryBytes: Long = usedMemoryMB * 1024L * 1024L,
    val appMemoryBytes: Long = appMemoryUsageMB * 1024L * 1024L,
    val totalStorageBytes: Long = totalStorageGB * 1024L * 1024L * 1024L,
    val freeStorageBytes: Long = freeStorageGB * 1024L * 1024L * 1024L,
    val usedStorageBytes: Long = usedStorageGB * 1024L * 1024L * 1024L,
    val apps: List<AppMemoryInfo> = emptyList()
) {
    fun toJsonString(): String {
        val appsJson = apps.joinToString(separator = ",", prefix = "[", postfix = "]") { it.toJsonString() }
        return """{"ram":{"totalBytes":$totalMemoryBytes,"availableBytes":$availableMemoryBytes,"usedBytes":$usedMemoryBytes,"usagePercentage":$usagePercentage,"memoryPressure":"$memoryPressure","systemMemoryStatus":"${if (lowMemoryStatus) "Low Memory" else "Normal"}","appMemoryBytes":$appMemoryBytes},"storage":{"totalBytes":$totalStorageBytes,"availableBytes":$freeStorageBytes,"usedBytes":$usedStorageBytes,"usagePercentage":$storageUsagePercentage},"apps":$appsJson}"""
    }
}

class MemoryInfoReader(private val context: Context) {

    // Cache discovered application packages to avoid heavy PackageManager queries every second
    private var cachedOtherApps: List<Pair<String, String>> = emptyList()
    private var lastPackageScanTime: Long = 0L
    private val packageScanIntervalMs: Long = 30000L // Rescan installed packages every 30 seconds

    /**
     * Gathers a bounded snapshot of application memory measurements.
     *
     * In accordance with Android 10+ (API 29+) security sandboxing, unprivileged applications
     * can only inspect their own process memory (via Debug.MemoryInfo). Other installed applications
     * are reported with their genuine package and display names, but their memory is marked
     * with status="restricted" to avoid fabricating numbers.
     */
    fun getAppMemoryList(): List<AppMemoryInfo> {
        val result = mutableListOf<AppMemoryInfo>()
        val currentTime = System.currentTimeMillis()

        // 1. Host Application: authentic PSS memory read directly from Android kernel/Debug
        try {
            val debugMemoryInfo = Debug.MemoryInfo()
            Debug.getMemoryInfo(debugMemoryInfo)
            val pssBytes = debugMemoryInfo.totalPss * 1024L
            val pssMB = debugMemoryInfo.totalPss / 1024.0
            val appLabel = try {
                context.packageManager.getApplicationLabel(context.applicationInfo).toString()
            } catch (_: Exception) {
                "Memory Monitor"
            }

            result.add(
                AppMemoryInfo(
                    packageName = context.packageName,
                    displayName = appLabel,
                    pid = android.os.Process.myPid(),
                    memoryBytes = pssBytes,
                    memoryMB = pssMB,
                    metric = "PSS",
                    source = "Debug.MemoryInfo",
                    status = "available",
                    statusMessage = null,
                    timestamp = currentTime
                )
            )
        } catch (e: Exception) {
            result.add(
                AppMemoryInfo(
                    packageName = context.packageName,
                    displayName = "Memory Monitor",
                    pid = android.os.Process.myPid(),
                    memoryBytes = null,
                    memoryMB = null,
                    metric = "PSS",
                    source = "Debug.MemoryInfo",
                    status = "unavailable",
                    statusMessage = "Debug.MemoryInfo query failed: ${e.message}",
                    timestamp = currentTime
                )
            )
        }

        // 2. Discover user-visible installed applications (bounded snapshot)
        try {
            if (currentTime - lastPackageScanTime > packageScanIntervalMs || cachedOtherApps.isEmpty()) {
                val pm = context.packageManager
                val intent = Intent(Intent.ACTION_MAIN).apply {
                    addCategory(Intent.CATEGORY_LAUNCHER)
                }
                val activities = pm.queryIntentActivities(intent, 0)
                val apps = activities
                    .map { resolveInfo ->
                        val pkg = resolveInfo.activityInfo.packageName
                        val label = resolveInfo.loadLabel(pm).toString()
                        Pair(pkg, label)
                    }
                    .filter { it.first != context.packageName }
                    .distinctBy { it.first }
                    .take(20) // Bounded to 20 apps to maintain light TCP payloads

                cachedOtherApps = apps
                lastPackageScanTime = currentTime
            }

            // For other applications, Android OS sandboxing restricts unprivileged memory inspection
            for ((pkg, label) in cachedOtherApps) {
                result.add(
                    AppMemoryInfo(
                        packageName = pkg,
                        displayName = label,
                        pid = null,
                        memoryBytes = null,
                        memoryMB = null,
                        metric = "PSS",
                        source = "Android OS (In-App)",
                        status = "restricted",
                        statusMessage = "Restricted by Android OS (API 29+ security sandboxing)",
                        timestamp = currentTime
                    )
                )
            }
        } catch (_: Exception) {
            // Protect system-wide collection from failing if package query is blocked
        }

        return result
    }

    fun getMemoryStats(): MemoryStats {
        val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val memoryInfo = ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(memoryInfo)

        val totalBytes = memoryInfo.totalMem
        val availableBytes = memoryInfo.availMem
        val usedBytes = totalBytes - availableBytes

        val totalMB = totalBytes / (1024 * 1024)
        val availableMB = availableBytes / (1024 * 1024)
        val usedMB = usedBytes / (1024 * 1024)
        
        val percentage = if (totalBytes > 0) {
            ((usedBytes.toDouble() / totalBytes.toDouble()) * 100).toInt()
        } else {
            0
        }

        val memoryPressure = when {
            percentage < 60 -> "Normal"
            percentage < 80 -> "Moderate"
            else -> "High"
        }

        val debugMemoryInfo = Debug.MemoryInfo()
        Debug.getMemoryInfo(debugMemoryInfo)
        val appMemoryBytes = debugMemoryInfo.totalPss * 1024L
        val appMemoryMB = (debugMemoryInfo.totalPss / 1024).toLong()

        val path = Environment.getDataDirectory().path
        val stat = StatFs(path)
        val blockSize = stat.blockSizeLong
        val totalBlocks = stat.blockCountLong
        val availableBlocks = stat.availableBlocksLong
        
        val totalStorageBytes = totalBlocks * blockSize
        val freeStorageBytes = availableBlocks * blockSize
        val usedStorageBytes = totalStorageBytes - freeStorageBytes

        val totalStorageGB = totalStorageBytes / (1024 * 1024 * 1024)
        val freeStorageGB = freeStorageBytes / (1024 * 1024 * 1024)
        val usedStorageGB = usedStorageBytes / (1024 * 1024 * 1024)

        val storagePercentage = if (totalStorageBytes > 0) {
            ((usedStorageBytes.toDouble() / totalStorageBytes.toDouble()) * 100).toInt()
        } else {
            0
        }

        val apps = getAppMemoryList()

        return MemoryStats(
            totalMemoryMB = totalMB,
            availableMemoryMB = availableMB,
            usedMemoryMB = usedMB,
            usagePercentage = percentage,
            memoryPressure = memoryPressure,
            lowMemoryStatus = memoryInfo.lowMemory,
            appMemoryUsageMB = appMemoryMB,
            totalStorageGB = totalStorageGB,
            freeStorageGB = freeStorageGB,
            usedStorageGB = usedStorageGB,
            storageUsagePercentage = storagePercentage,
            totalMemoryBytes = totalBytes,
            availableMemoryBytes = availableBytes,
            usedMemoryBytes = usedBytes,
            appMemoryBytes = appMemoryBytes,
            totalStorageBytes = totalStorageBytes,
            freeStorageBytes = freeStorageBytes,
            usedStorageBytes = usedStorageBytes,
            apps = apps
        )
    }
}
