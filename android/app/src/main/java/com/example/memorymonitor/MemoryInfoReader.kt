package com.example.memorymonitor

import android.app.ActivityManager
import android.content.Context
import android.os.Debug
import android.os.Environment
import android.os.StatFs

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
    val storageUsagePercentage: Int
)

class MemoryInfoReader(private val context: Context) {
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
            storageUsagePercentage = storagePercentage
        )
    }
}
