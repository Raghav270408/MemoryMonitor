package com.example.memorymonitor

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.memorymonitor.ui.theme.MemoryMonitorTheme
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

enum class AppSortOrder {
    HIGHEST_RAM,
    LOWEST_RAM,
    NAME
}

@Composable
fun MemoryMonitorScreen(memoryStats: MemoryStats?, modifier: Modifier = Modifier) {
    var selectedTabIndex by remember { mutableIntStateOf(0) }

    Column(modifier = modifier.fillMaxSize()) {
        // Top Navigation Tabs
        TabRow(
            selectedTabIndex = selectedTabIndex,
            containerColor = MaterialTheme.colorScheme.surface,
            contentColor = MaterialTheme.colorScheme.primary
        ) {
            Tab(
                selected = selectedTabIndex == 0,
                onClick = { selectedTabIndex = 0 },
                text = { Text("System Overview", fontWeight = FontWeight.SemiBold) },
                icon = { Icon(Icons.Filled.Memory, contentDescription = null, modifier = Modifier.size(20.dp)) }
            )
            Tab(
                selected = selectedTabIndex == 1,
                onClick = { selectedTabIndex = 1 },
                text = {
                    val count = memoryStats?.apps?.size ?: 0
                    Text(if (count > 0) "Apps ($count)" else "Apps", fontWeight = FontWeight.SemiBold)
                },
                icon = { Icon(Icons.Filled.Apps, contentDescription = null, modifier = Modifier.size(20.dp)) }
            )
        }

        if (memoryStats != null) {
            when (selectedTabIndex) {
                0 -> SystemOverviewTab(
                    memoryStats = memoryStats,
                    onNavigateToApps = { selectedTabIndex = 1 }
                )
                1 -> ApplicationMemoryTab(
                    memoryStats = memoryStats
                )
            }
        } else {
            // Loading State
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "Fetching memory data…",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

/**
 * Tab 1: System-wide RAM and Storage overview (preserves complete original monitoring).
 */
@Composable
fun SystemOverviewTab(
    memoryStats: MemoryStats,
    onNavigateToApps: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 20.dp)
    ) {
        // Header
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Filled.Memory,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(28.dp)
            )
            Spacer(modifier = Modifier.width(10.dp))
            Column {
                Text(
                    text = "System Memory",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Hardware RAM & internal storage",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // Circular memory usage indicator
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp),
            contentAlignment = Alignment.Center
        ) {
            CircularProgressIndicator(
                progress = { 1f },
                modifier = Modifier.size(180.dp),
                strokeWidth = 12.dp,
                color = MaterialTheme.colorScheme.surfaceVariant
            )
            CircularProgressIndicator(
                progress = { memoryStats.usagePercentage / 100f },
                modifier = Modifier.size(180.dp),
                strokeWidth = 12.dp,
                color = MaterialTheme.colorScheme.primary
            )
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "${memoryStats.usagePercentage}%",
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
                Text(
                    text = "RAM Used",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Spacer(modifier = Modifier.height(20.dp))

        // Used / Available side-by-side
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            CompactStatCard(
                label = "Used Memory",
                value = "${memoryStats.usedMemoryMB} MB",
                modifier = Modifier.weight(1f)
            )
            CompactStatCard(
                label = "Available Memory",
                value = "${memoryStats.availableMemoryMB} MB",
                modifier = Modifier.weight(1f)
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // System Statistics
        StatRow(
            icon = Icons.Filled.Storage,
            label = "Total Memory",
            value = "${memoryStats.totalMemoryMB} MB"
        )
        StatRow(
            icon = Icons.Filled.Speed,
            label = "Memory Pressure",
            value = memoryStats.memoryPressure
        )
        StatRow(
            icon = Icons.Filled.Warning,
            label = "System Memory Status",
            value = if (memoryStats.lowMemoryStatus) "Low Memory" else "Normal"
        )
        StatRow(
            icon = Icons.Filled.Apps,
            label = "This App Memory Usage",
            value = "${memoryStats.appMemoryUsageMB} MB"
        )

        Spacer(modifier = Modifier.height(24.dp))
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Spacer(modifier = Modifier.height(20.dp))

        // Header Storage
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Filled.Storage,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(28.dp)
            )
            Spacer(modifier = Modifier.width(10.dp))
            Column {
                Text(
                    text = "Storage Monitor",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Internal storage overview (/data)",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "${memoryStats.usedStorageGB} GB / ${memoryStats.totalStorageGB} GB Used",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(modifier = Modifier.height(8.dp))
        LinearProgressIndicator(
            progress = { memoryStats.storageUsagePercentage / 100f },
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp),
            color = MaterialTheme.colorScheme.primary,
            trackColor = MaterialTheme.colorScheme.surfaceVariant
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "${memoryStats.storageUsagePercentage}% Used (${memoryStats.freeStorageGB} GB Free)",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary
        )

        Spacer(modifier = Modifier.height(24.dp))

        // Application Memory Summary Callout Card
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.surfaceVariant,
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Application Memory",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "${memoryStats.apps.size} applications cataloged locally",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    OutlinedButton(
                        onClick = onNavigateToApps,
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.primary)
                    ) {
                        Text("View Apps")
                        Spacer(modifier = Modifier.width(4.dp))
                        Icon(Icons.Filled.ArrowForward, contentDescription = null, modifier = Modifier.size(16.dp))
                    }
                }
            }
        }
    }
}

/**
 * Tab 2: Dedicated Per-Application Memory view with Search, Sort, and Status Badges.
 */
@Composable
fun ApplicationMemoryTab(
    memoryStats: MemoryStats,
    modifier: Modifier = Modifier
) {
    var searchQuery by remember { mutableStateOf("") }
    var sortOrder by remember { mutableStateOf(AppSortOrder.HIGHEST_RAM) }

    val filteredApps = remember(memoryStats.apps, searchQuery, sortOrder) {
        val list = memoryStats.apps
        val queried = if (searchQuery.isBlank()) list else {
            list.filter {
                it.displayName.contains(searchQuery, ignoreCase = true) ||
                it.packageName.contains(searchQuery, ignoreCase = true)
            }
        }
        when (sortOrder) {
            AppSortOrder.HIGHEST_RAM -> queried.sortedWith(
                compareByDescending<AppMemoryInfo> { it.memoryBytes ?: -1L }
                    .thenBy { it.displayName.lowercase() }
            )
            AppSortOrder.LOWEST_RAM -> queried.sortedWith(
                compareBy<AppMemoryInfo> { it.memoryBytes ?: Long.MAX_VALUE }
                    .thenBy { it.displayName.lowercase() }
            )
            AppSortOrder.NAME -> queried.sortedBy { it.displayName.lowercase() }
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 16.dp)
    ) {
        // Status & Telemetry Source Banner
        TelemetryStatusBanner(memoryStats)

        Spacer(modifier = Modifier.height(16.dp))

        // Search Field
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Search application or package...") },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = "Search") },
            trailingIcon = {
                if (searchQuery.isNotEmpty()) {
                    IconButton(onClick = { searchQuery = "" }) {
                        Icon(Icons.Filled.Clear, contentDescription = "Clear search")
                    }
                }
            },
            singleLine = true,
            shape = RoundedCornerShape(12.dp)
        )

        Spacer(modifier = Modifier.height(12.dp))

        // Sort Options Row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            FilterChip(
                selected = sortOrder == AppSortOrder.HIGHEST_RAM,
                onClick = { sortOrder = AppSortOrder.HIGHEST_RAM },
                label = { Text("Highest RAM", fontSize = 12.sp) }
            )
            FilterChip(
                selected = sortOrder == AppSortOrder.LOWEST_RAM,
                onClick = { sortOrder = AppSortOrder.LOWEST_RAM },
                label = { Text("Lowest RAM", fontSize = 12.sp) }
            )
            FilterChip(
                selected = sortOrder == AppSortOrder.NAME,
                onClick = { sortOrder = AppSortOrder.NAME },
                label = { Text("Name (A-Z)", fontSize = 12.sp) }
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Applications List
        if (filteredApps.isNotEmpty()) {
            filteredApps.forEach { app ->
                AppMemoryCard(app = app)
                Spacer(modifier = Modifier.height(10.dp))
            }
        } else {
            // Empty State
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 48.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = Icons.Filled.Apps,
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = if (searchQuery.isNotEmpty()) "No applications match \"$searchQuery\"" else "No applications reported",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

/**
 * Information banner explaining data source and Android security sandboxing.
 */
@Composable
fun TelemetryStatusBanner(memoryStats: MemoryStats) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(10.dp)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.Top
        ) {
            Icon(
                imageVector = Icons.Filled.Info,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier
                    .size(20.dp)
                    .padding(top = 2.dp)
            )
            Spacer(modifier = Modifier.width(10.dp))
            Column {
                Text(
                    text = "In-App Application Memory",
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.primary
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "Android 10+ OS sandboxing restricts unprivileged apps from inspecting other processes' memory. Memory Monitor's own PSS is authentically reported via Debug.MemoryInfo. Other apps are listed with package identifiers and marked Restricted by OS.",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

/**
 * Individual Application Memory Card.
 */
@Composable
fun AppMemoryCard(app: AppMemoryInfo) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            // Row 1: App Name & Status Badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = app.displayName,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f)
                )

                // Status Badge
                StatusBadge(status = app.status)
            }

            Spacer(modifier = Modifier.height(4.dp))

            // Row 2: Package name & PID
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = app.packageName,
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f)
                )
                if (app.pid != null) {
                    Text(
                        text = "PID: ${app.pid}",
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
            Spacer(modifier = Modifier.height(8.dp))

            // Row 3: Memory & Source
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text(
                        text = "Metric: ${app.metric} • ${app.source}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 11.sp
                    )
                    val timeFormat = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
                    Text(
                        text = "Updated: ${timeFormat.format(Date(app.timestamp))}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                        fontSize = 10.sp
                    )
                }

                // Memory display (Never shows 0 for missing values)
                if (app.memoryMB != null) {
                    Text(
                        text = if (app.memoryMB >= 1024) {
                            String.format(Locale.US, "%.2f GB", app.memoryMB / 1024.0)
                        } else {
                            String.format(Locale.US, "%.1f MB", app.memoryMB)
                        },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                } else if (app.status == "restricted") {
                    Text(
                        text = "Restricted",
                        style = MaterialTheme.typography.bodyMedium,
                        fontStyle = FontStyle.Italic,
                        color = Color(0xFFFFB74D)
                    )
                } else {
                    Text(
                        text = "Unavailable",
                        style = MaterialTheme.typography.bodyMedium,
                        fontStyle = FontStyle.Italic,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

/**
 * Visual status badge.
 */
@Composable
fun StatusBadge(status: String) {
    val (text, bgColor, textColor) = when (status) {
        "available" -> Triple("Available", Color(0xFF1E3A24), Color(0xFF81C784))
        "restricted" -> Triple("Restricted (OS)", Color(0xFF3E2F1E), Color(0xFFFFB74D))
        else -> Triple("Unavailable", MaterialTheme.colorScheme.surface, MaterialTheme.colorScheme.onSurfaceVariant)
    }

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(bgColor)
            .padding(horizontal = 8.dp, vertical = 3.dp)
    ) {
        Text(
            text = text,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            color = textColor
        )
    }
}

@Composable
fun CompactStatCard(label: String, value: String, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = MaterialTheme.shapes.medium
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
        }
    }
}

@Composable
fun StatRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(18.dp)
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f)
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Preview(showBackground = true, showSystemUi = true)
@Composable
fun MemoryMonitorScreenPreview() {
    MemoryMonitorTheme {
        Surface {
            MemoryMonitorScreen(
                memoryStats = MemoryStats(
                    totalMemoryMB = 8192,
                    availableMemoryMB = 3200,
                    usedMemoryMB = 4992,
                    usagePercentage = 60,
                    memoryPressure = "Moderate",
                    lowMemoryStatus = false,
                    appMemoryUsageMB = 45,
                    totalStorageGB = 256,
                    freeStorageGB = 164,
                    usedStorageGB = 92,
                    storageUsagePercentage = 36,
                    apps = listOf(
                        AppMemoryInfo(
                            packageName = "com.example.memorymonitor",
                            displayName = "Memory Monitor",
                            pid = 12345,
                            memoryBytes = 47185920L,
                            memoryMB = 45.0,
                            metric = "PSS",
                            source = "Debug.MemoryInfo",
                            status = "available"
                        ),
                        AppMemoryInfo(
                            packageName = "com.android.chrome",
                            displayName = "Google Chrome",
                            pid = 6789,
                            memoryBytes = 157286400L,
                            memoryMB = 150.0,
                            metric = "PSS",
                            source = "ADB dumpsys meminfo",
                            status = "available"
                        ),
                        AppMemoryInfo(
                            packageName = "com.spotify.music",
                            displayName = "Spotify",
                            pid = null,
                            memoryBytes = null,
                            memoryMB = null,
                            metric = "PSS",
                            source = "Android OS (In-App)",
                            status = "restricted",
                            statusMessage = "Restricted by Android OS (API 29+ security sandboxing)"
                        )
                    )
                )
            )
        }
    }
}

@Preview(showBackground = true)
@Composable
fun MemoryMonitorScreenLoadingPreview() {
    MemoryMonitorTheme {
        Surface {
            MemoryMonitorScreen(memoryStats = null)
        }
    }
}
