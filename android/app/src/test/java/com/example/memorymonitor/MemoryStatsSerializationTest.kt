package com.example.memorymonitor

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MemoryStatsSerializationTest {

    @Test
    fun testJsonSerializationMatchesSchema() {
        val stats = MemoryStats(
            totalMemoryMB = 8192,
            availableMemoryMB = 3200,
            usedMemoryMB = 4992,
            usagePercentage = 60,
            memoryPressure = "Normal",
            lowMemoryStatus = false,
            appMemoryUsageMB = 45,
            totalStorageGB = 256,
            freeStorageGB = 164,
            usedStorageGB = 92,
            storageUsagePercentage = 36,
            totalMemoryBytes = 8589934592L,
            availableMemoryBytes = 3355443200L,
            usedMemoryBytes = 5234688000L,
            appMemoryBytes = 47185920L,
            totalStorageBytes = 274877906944L,
            freeStorageBytes = 176093659136L,
            usedStorageBytes = 98784247808L
        )

        val jsonString = stats.toJsonString()
        assertNotNull(jsonString)
        assertTrue(jsonString.startsWith("{"))
        assertTrue(jsonString.endsWith("}"))

        // Verify all RAM fields are serialized with exact names and values
        assertTrue(jsonString.contains("\"ram\":{"))
        assertTrue(jsonString.contains("\"totalBytes\":8589934592"))
        assertTrue(jsonString.contains("\"availableBytes\":3355443200"))
        assertTrue(jsonString.contains("\"usedBytes\":5234688000"))
        assertTrue(jsonString.contains("\"usagePercentage\":60"))
        assertTrue(jsonString.contains("\"memoryPressure\":\"Normal\""))
        assertTrue(jsonString.contains("\"systemMemoryStatus\":\"Normal\""))
        assertTrue(jsonString.contains("\"appMemoryBytes\":47185920"))

        // Verify all Storage fields are serialized with exact names and values
        assertTrue(jsonString.contains("\"storage\":{"))
        assertTrue(jsonString.contains("\"totalBytes\":274877906944"))
        assertTrue(jsonString.contains("\"availableBytes\":176093659136"))
        assertTrue(jsonString.contains("\"usedBytes\":98784247808"))
        assertTrue(jsonString.contains("\"usagePercentage\":36"))
    }

    @Test
    fun testLowMemoryStatusString() {
        val stats = MemoryStats(
            totalMemoryMB = 8192,
            availableMemoryMB = 500,
            usedMemoryMB = 7692,
            usagePercentage = 94,
            memoryPressure = "High",
            lowMemoryStatus = true,
            appMemoryUsageMB = 50,
            totalStorageGB = 128,
            freeStorageGB = 10,
            usedStorageGB = 118,
            storageUsagePercentage = 92
        )

        val jsonString = stats.toJsonString()
        assertTrue(jsonString.contains("\"systemMemoryStatus\":\"Low Memory\""))
        assertTrue(jsonString.contains("\"memoryPressure\":\"High\""))
    }
}
