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

        // Verify apps field is present as empty array when not populated
        assertTrue(jsonString.contains("\"apps\":[]"))
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

    @Test
    fun testAppMemoryInfoAvailableSerialization() {
        val app = AppMemoryInfo(
            packageName = "com.example.memorymonitor",
            displayName = "Memory Monitor",
            pid = 1234,
            memoryBytes = 47185920L,
            memoryMB = 45.0,
            metric = "PSS",
            source = "Debug.MemoryInfo",
            status = "available",
            statusMessage = null,
            timestamp = 1700000000000L
        )

        val json = app.toJsonString()
        assertTrue(json.contains("\"packageName\":\"com.example.memorymonitor\""))
        assertTrue(json.contains("\"displayName\":\"Memory Monitor\""))
        assertTrue(json.contains("\"pid\":1234"))
        assertTrue(json.contains("\"memoryBytes\":47185920"))
        assertTrue(json.contains("\"memoryMB\":45.00"))
        assertTrue(json.contains("\"metric\":\"PSS\""))
        assertTrue(json.contains("\"source\":\"Debug.MemoryInfo\""))
        assertTrue(json.contains("\"status\":\"available\""))
        assertTrue(json.contains("\"statusMessage\":null"))
        assertTrue(json.contains("\"timestamp\":1700000000000"))
    }

    @Test
    fun testAppMemoryInfoRestrictedSerialization() {
        val app = AppMemoryInfo(
            packageName = "com.android.chrome",
            displayName = "Google Chrome",
            pid = null,
            memoryBytes = null,
            memoryMB = null,
            metric = "PSS",
            source = "Android OS (In-App)",
            status = "restricted",
            statusMessage = "Restricted by Android OS (API 29+ security sandboxing)",
            timestamp = 1700000000000L
        )

        val json = app.toJsonString()
        assertTrue(json.contains("\"packageName\":\"com.android.chrome\""))
        assertTrue(json.contains("\"displayName\":\"Google Chrome\""))
        assertTrue(json.contains("\"pid\":null"))
        assertTrue(json.contains("\"memoryBytes\":null"))
        assertTrue(json.contains("\"memoryMB\":null"))
        assertTrue(json.contains("\"status\":\"restricted\""))
        assertTrue(json.contains("\"statusMessage\":\"Restricted by Android OS (API 29+ security sandboxing)\""))
    }

    @Test
    fun testAppMemoryInfoSpecialCharacterEscaping() {
        val app = AppMemoryInfo(
            packageName = "com.example.quote\"test",
            displayName = "Quotes \"&\" Backslash \\ and newline \n test",
            pid = 999,
            memoryBytes = 1048576L,
            memoryMB = 1.0,
            source = "Test",
            status = "available"
        )

        val json = app.toJsonString()
        assertTrue(json.contains("\"packageName\":\"com.example.quote\\\"test\""))
        assertTrue(json.contains("\"displayName\":\"Quotes \\\"&\\\" Backslash \\\\ and newline \\n test\""))
    }

    @Test
    fun testMemoryStatsWithMultipleAppsSerialization() {
        val hostApp = AppMemoryInfo(
            packageName = "com.example.memorymonitor",
            displayName = "Memory Monitor",
            pid = 2800,
            memoryBytes = 44040192L,
            memoryMB = 42.0,
            metric = "PSS",
            source = "Debug.MemoryInfo",
            status = "available"
        )
        val otherApp = AppMemoryInfo(
            packageName = "com.google.android.youtube",
            displayName = "YouTube",
            pid = null,
            memoryBytes = null,
            memoryMB = null,
            metric = "PSS",
            source = "Android OS (In-App)",
            status = "restricted",
            statusMessage = "Restricted by Android OS (API 29+ security sandboxing)"
        )

        val stats = MemoryStats(
            totalMemoryMB = 8192,
            availableMemoryMB = 3000,
            usedMemoryMB = 5192,
            usagePercentage = 63,
            memoryPressure = "Moderate",
            lowMemoryStatus = false,
            appMemoryUsageMB = 42,
            totalStorageGB = 256,
            freeStorageGB = 150,
            usedStorageGB = 106,
            storageUsagePercentage = 41,
            apps = listOf(hostApp, otherApp)
        )

        val jsonString = stats.toJsonString()
        assertTrue(jsonString.contains("\"ram\":{"))
        assertTrue(jsonString.contains("\"storage\":{"))
        assertTrue(jsonString.contains("\"apps\":["))
        assertTrue(jsonString.contains("\"com.example.memorymonitor\""))
        assertTrue(jsonString.contains("\"com.google.android.youtube\""))
    }

    @Test
    fun testMemoryConversionAccuracy() {
        val kbValue = 153600L // 150 MB
        val bytes = kbValue * 1024L
        val mb = kbValue / 1024.0

        assertEquals(157286400L, bytes)
        assertEquals(150.0, mb, 0.001)
    }

    @Test
    fun testAppSortingLogic() {
        val app1 = AppMemoryInfo(
            packageName = "com.medium",
            displayName = "Medium RAM",
            memoryBytes = 104857600L,
            memoryMB = 100.0,
            source = "Test",
            status = "available"
        )
        val app2 = AppMemoryInfo(
            packageName = "com.high",
            displayName = "High RAM",
            memoryBytes = 524288000L,
            memoryMB = 500.0,
            source = "Test",
            status = "available"
        )
        val app3 = AppMemoryInfo(
            packageName = "com.restricted",
            displayName = "Restricted App",
            memoryBytes = null,
            memoryMB = null,
            source = "Test",
            status = "restricted"
        )

        val list = listOf(app1, app3, app2)

        // Sort Highest RAM
        val highest = list.sortedWith(
            compareByDescending<AppMemoryInfo> { it.memoryBytes ?: -1L }
                .thenBy { it.displayName }
        )
        assertEquals("High RAM", highest[0].displayName)
        assertEquals("Medium RAM", highest[1].displayName)
        assertEquals("Restricted App", highest[2].displayName)

        // Sort Lowest RAM (restricted at end)
        val lowest = list.sortedWith(
            compareBy<AppMemoryInfo> { it.memoryBytes ?: Long.MAX_VALUE }
                .thenBy { it.displayName }
        )
        assertEquals("Medium RAM", lowest[0].displayName)
        assertEquals("High RAM", lowest[1].displayName)
        assertEquals("Restricted App", lowest[2].displayName)

        // Sort Name (A-Z)
        val byName = list.sortedBy { it.displayName.lowercase() }
        assertEquals("High RAM", byName[0].displayName)
        assertEquals("Medium RAM", byName[1].displayName)
        assertEquals("Restricted App", byName[2].displayName)
    }
}
