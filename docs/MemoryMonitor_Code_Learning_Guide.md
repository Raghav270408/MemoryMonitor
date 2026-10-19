# MemoryMonitor: Source-Code Learning Guide & Technical Walkthrough

> **Educational Scope:** Complete deep dive into the Android system architecture, low-level metrics extraction, socket networking, desktop server, browser visualization, and Operating Systems concepts.  
> **Audience:** Developers, engineering students, viva examiners, and technical evaluators.  
> **Source Repository:** `C:\Users\Raghav V\Projects\MemoryMonitor`

---

## 1. Introduction to the Codebase

The **MemoryMonitor** project bridges two distinct computing tiers:
1. **The Mobile Producer (80% Focus):** A modern Android native application authored in Kotlin and Jetpack Compose. It reads hardware and kernel data directly from the Linux `/proc` filesystem and Android runtime APIs, updates its local UI, serializes the data into standard JSON, and streams it across a low-level TCP socket.
2. **The Desktop Receiver & Visualizer (20% Focus):** A Node.js backend that ingests the raw TCP stream over physical USB via ADB reverse port forwarding, handles stream framing, tracks active connections, and relays the metrics to a browser dashboard using Socket.IO and reactive Tailwind CSS.

---

## 2. Android Application Architecture in Depth

```text
+----------------------------------------------------------------------------------------------------+
|                                    ANDROID APPLICATION PROCESS                                     |
|                                                                                                    |
|  [ Android OS Activity Lifecycle ]                                                                 |
|         |                                                                                          |
|         v                                                                                          |
|  MainActivity.kt                                                                                   |
|    - Extends ComponentActivity()                                                                   |
|    - FLAG_KEEP_SCREEN_ON (prevents lock screen while monitoring)                                   |
|    - setContent { MemoryMonitorTheme { ... } }                                                     |
|         |                                                                                          |
|         v                                                                                          |
|  produceState(initialValue = null, lifecycleOwner)                                                 |
|    - Tied to lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED)                                  |
|    - Pauses coroutine when app leaves foreground; cleans up socket in finally block                |
|         |                                                                                          |
|         +----------------------------------+----------------------------------+                    |
|         |                                                                     |                    |
|         v (Every 1000ms on Dispatchers.IO)                                    v                    |
|  MemoryInfoReader.getMemoryStats()                                 MemoryMonitorScreen(...)        |
|    - ActivityManager.getMemoryInfo()                                 - Jetpack Compose UI          |
|    - Debug.getMemoryInfo() (PSS)                                     - CircularProgressIndicator   |
|    - StatFs("/data")                                                 - CompactStatCards            |
|         |                                                            - StatRows                    |
|         v                                                                                          |
|  MemoryStats.toJsonString()                                                                        |
|    - Formats contract JSON payload                                                                 |
|         |                                                                                          |
|         v                                                                                          |
|  TcpDataSender.send(payload)                                                                       |
|    - Mutex synchronization                                                                         |
|    - Socket(127.0.0.1:8080)                                                                        |
|    - BufferedWriter.write(json + "\n")                                                             |
|    - Dispatches across USB via ADB reverse                                                         |
+----------------------------------------------------------------------------------------------------+
```

---

### 2.1 Application Entry Point & UI Lifecycle: `MainActivity.kt`

The application entry point is [`MainActivity.kt`](file:///c:/Users/Raghav%20V/Projects/MemoryMonitor/android/app/src/main/java/com/example/memorymonitor/MainActivity.kt).

#### Inheritance & Window Configuration
```kotlin
class MainActivity : ComponentActivity() {
    companion object {
        private const val TAG = "MemoryMonitor"
    }

    private val tcpSender = TcpDataSender()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        enableEdgeToEdge()
        Log.i(TAG, "MainActivity created (FLAG_KEEP_SCREEN_ON enabled)")
        
        val memoryInfoReader = MemoryInfoReader(this)
```

1. **`ComponentActivity` vs `AppCompatActivity`:** `MainActivity` inherits from `ComponentActivity`, which is the lightweight base class for Jetpack Compose apps. It omits legacy `ActionBar` or `Fragment` support code, minimizing memory footprint.
2. **`FLAG_KEEP_SCREEN_ON`:** When monitoring memory, users place their phone on a desk plugged into USB. Android's default 30-second screen timeout would transition the activity to `onStop()`, halting metric streaming. Adding this window flag instructs the Android PowerManager to keep the display illuminated while this window is active.
3. **Single Persistent Instance of `TcpDataSender`:** `private val tcpSender = TcpDataSender()` is instantiated at the Activity level. This ensures the TCP socket connection is maintained across recompositions rather than being destroyed and recreated on each UI update.

#### Reactive State Loop: `produceState` & `repeatOnLifecycle`
Lines 37–68 illustrate modern Android reactive architecture:

```kotlin
val memoryStats by produceState<MemoryStats?>(initialValue = null, lifecycleOwner) {
    lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
        Log.i(TAG, "Memory monitor loop STARTED")
        try {
            while (true) {
                val stats = withContext(Dispatchers.IO) {
                    try {
                        val currentStats = memoryInfoReader.getMemoryStats()
                        val sent = tcpSender.send(currentStats.toJsonString())
                        if (!sent) {
                            Log.d(TAG, "Metric transmission returned false")
                        }
                        currentStats
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed reading memory stats: ${e.message}", e)
                        null
                    }
                }
                value = stats
                delay(1000)
            }
        } finally {
            Log.i(TAG, "Memory monitor loop STOPPED (lifecycle changed), closing TCP connection")
            tcpSender.close()
        }
    }
}
```

**Why this design is critical for Operating Systems:**
- **`produceState`:** Bridges imperative background loops into Compose's reactive snapshot state system. When `value = stats` executes, Compose detects that `memoryStats` has changed and triggers a recomposition of any Composable reading that state.
- **`repeatOnLifecycle(Lifecycle.State.STARTED)`:** This is standard Android best practice for resource hygiene. When the user presses Home or switches apps, the Activity transitions from `STARTED` to `STOPPED`. `repeatOnLifecycle` immediately cancels the child coroutine.
- **Clean Socket Termination in `finally`:** When the loop is canceled, execution flows into the `finally` block, invoking `tcpSender.close()`. This sends an orderly TCP `FIN` packet across USB to the desktop, allowing the desktop server to detect disconnection immediately rather than hanging.
- **`CancellationException` Handling:** In Kotlin Coroutines, cooperative cancellation works by throwing a `CancellationException`. If caught by a generic `catch (e: Exception)`, cancellation fails. The explicit `catch (e: CancellationException) { throw e }` guarantees that coroutine cancellation propagates correctly.
- **Thread Switching (`withContext(Dispatchers.IO)`):** Network calls and filesystem operations (`StatFs`) must **never** run on the main UI thread. Executing on `Dispatchers.IO` offloads disk and socket work to a thread pool designed for blocking I/O, completely eliminating UI stutter (jank) and avoiding `NetworkOnMainThreadException`.

---

### 2.2 Deep Dive into Metrics Collection: `MemoryInfoReader.kt`

The heart of the metric collection is [`MemoryInfoReader.kt`](file:///c:/Users/Raghav%20V/Projects/MemoryMonitor/android/app/src/main/java/com/example/memorymonitor/MemoryInfoReader.kt).

#### 1. System-Wide RAM: `ActivityManager.MemoryInfo`
```kotlin
val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
val memoryInfo = ActivityManager.MemoryInfo()
activityManager.getMemoryInfo(memoryInfo)

val totalBytes = memoryInfo.totalMem
val availableBytes = memoryInfo.availMem
val usedBytes = totalBytes - availableBytes
```

- **`totalMem`:** Read from the Linux kernel `/proc/meminfo` (`MemTotal`). Represents total physical RAM accessible to the kernel (excluding memory reserved for kernel binary, radio baseband, and hardware DMA buffers).
- **`availMem`:** In Linux/Android, `availMem` is **not** simply unallocated RAM. If an OS kept unallocated RAM idle, memory would be wasted. Instead, the Linux kernel uses free RAM for disk caches (`Cached`) and kernel buffers (`Buffers`). `availMem` represents RAM that the kernel could immediately reclaim without swapping or killing processes (clean cache + free pages + inactive file pages).
- **`usedBytes`:** Calculated as $totalMem - availMem$. This represents all memory actively committed to running processes, system daemons, Android ART runtime, and dirty kernel memory that cannot be discarded without writeback.
- **`lowMemory`:** A critical boolean flag set by the kernel. When `true`, the system has crossed its low-memory threshold (`threshold`), meaning background processes are actively being terminated by the Low Memory Killer (`lmkd`).

#### 2. Process-Level Memory Accounting: `Debug.MemoryInfo` & PSS
```kotlin
val debugMemoryInfo = Debug.MemoryInfo()
Debug.getMemoryInfo(debugMemoryInfo)
val appMemoryBytes = debugMemoryInfo.totalPss * 1024L
val appMemoryMB = (debugMemoryInfo.totalPss / 1024).toLong()
```

**Why PSS is used instead of RSS or VSS:**
- **VSS (Virtual Set Size):** Total virtual address space mapped by the process. Includes allocated but untouched pages and shared libraries. VSS is completely misleading (often multiple gigabytes).
- **RSS (Resident Set Size):** Total physical pages currently in RAM for the process. However, if two processes share a 10 MB system library (like `framework.jar`), RSS counts that 10 MB for *both* processes. Summing the RSS of all processes produces a number greater than total physical device RAM!
- **PSS (Proportional Set Size):** The gold standard of operating systems memory accounting. PSS accounts for shared libraries proportionally. If a 10 MB shared library is mapped by 5 processes, each process is charged exactly $10 / 5 = 2\text{ MB}$ of PSS. `totalPss` provides the true physical footprint of the MemoryMonitor application.

#### 3. Storage Accounting: `StatFs`
```kotlin
val path = Environment.getDataDirectory().path // returns "/data"
val stat = StatFs(path)
val blockSize = stat.blockSizeLong
val totalBlocks = stat.blockCountLong
val availableBlocks = stat.availableBlocksLong

val totalStorageBytes = totalBlocks * blockSize
val freeStorageBytes = availableBlocks * blockSize
val usedStorageBytes = totalStorageBytes - freeStorageBytes
```

- **`Environment.getDataDirectory()`:** Resolves to `/data`, the primary ext4 or F2FS internal partition where user files, apps, and private application caches reside.
- **Filesystem Block Math:** Storage is organized into fixed-size allocation clusters (blocks), typically 4096 bytes (4 KB). Total bytes is computed as $totalBlocks \times blockSize$.
- **`availableBlocksLong` vs `freeBlocksLong`:** `StatFs` provides two methods: `getFreeBlocksLong()` and `getAvailableBlocksLong()`. `getAvailableBlocksLong()` is used because it accounts for reserved root blocks. Ordinary applications cannot write into reserved root space; hence, `availableBlocksLong` represents genuine usable free capacity.

#### 4. Derived Classifications
```kotlin
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
```
`memoryPressure` is an application-level classification designed to provide human-readable evaluation of system load.

---

### 2.3 Data Models & Wire Serialization

The data model is defined in [`MemoryInfoReader.kt`](file:///c:/Users/Raghav%20V/Projects/MemoryMonitor/android/app/src/main/java/com/example/memorymonitor/MemoryInfoReader.kt):

```kotlin
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
    val usedStorageBytes: Long = usedStorageGB * 1024L * 1024L * 1024L
) {
    fun toJsonString(): String =
        """{"ram":{"totalBytes":$totalMemoryBytes,"availableBytes":$availableMemoryBytes,"usedBytes":$usedMemoryBytes,"usagePercentage":$usagePercentage,"memoryPressure":"$memoryPressure","systemMemoryStatus":"${if (lowMemoryStatus) "Low Memory" else "Normal"}","appMemoryBytes":$appMemoryBytes},"storage":{"totalBytes":$totalStorageBytes,"availableBytes":$freeStorageBytes,"usedBytes":$usedStorageBytes,"usagePercentage":$storageUsagePercentage}}"""
}
```

**Key Design Decisions:**
1. **Dual Representation (MB/GB and Bytes):** The data class accepts both human-friendly units (used by the Android Compose UI) and high-precision raw byte counts (used for wire transmission).
2. **Deterministic String Templating:** Instead of pulling in a heavy reflection-based serialization library like Jackson or Gson on Android, `toJsonString()` uses a raw Kotlin multi-line string. This produces exact, zero-overhead JSON without reflection, reducing app size and startup latency.
3. **Strict Wire Schema:** The output adheres strictly to the contract agreed with the desktop server:
   ```json
   {
     "ram": {
       "totalBytes": 5713772544,
       "availableBytes": 1805639680,
       "usedBytes": 3908132864,
       "usagePercentage": 68,
       "memoryPressure": "Moderate",
       "systemMemoryStatus": "Normal",
       "appMemoryBytes": 150822912
     },
     "storage": {
       "totalBytes": 113165217792,
       "availableBytes": 45953335296,
       "usedBytes": 67211882496,
       "usagePercentage": 59
     }
   }
   ```

---

### 2.4 Low-Level TCP Sender: `TcpDataSender.kt`

[`TcpDataSender.kt`](file:///c:/Users/Raghav%20V/Projects/MemoryMonitor/android/app/src/main/java/com/example/memorymonitor/TcpDataSender.kt) implements the persistent client socket engine:

```kotlin
class TcpDataSender(
    private val host: String = "127.0.0.1",
    private val port: Int = 8080,
    private val connectTimeoutMs: Int = 2000
) : AutoCloseable {

    private val mutex = Mutex()
    private var socket: Socket? = null
    private var writer: BufferedWriter? = null
    private var transmitCount = 0L

    suspend fun send(jsonPayload: String): Boolean = withContext(Dispatchers.IO) {
        mutex.withLock {
            try {
                ensureConnected()
                val currentWriter = writer ?: throw IOException("Socket output writer is null")
                currentWriter.write(jsonPayload)
                currentWriter.write("\n")
                currentWriter.flush()
                transmitCount++
                if (transmitCount == 1L || transmitCount % 10L == 0L) {
                    Log.i(TAG, "Transmission active (#$transmitCount): successfully sent payload to $host:$port")
                } else {
                    Log.d(TAG, "Successfully transmitted metrics payload to $host:$port")
                }
                true
            } catch (e: Exception) {
                Log.w(TAG, "Transmission failed to $host:$port: ${e.javaClass.simpleName}: ${e.message}")
                disconnectInternal()
                false
            }
        }
    }
```

**Deep Dive into Socket Mechanics:**
1. **Thread-Safe Synchronization via `Mutex`:** Kotlin's coroutine `Mutex` ensures that even if concurrent coroutines attempt to transmit data, write operations and socket reconnections are strictly sequential, preventing data interleaving.
2. **`ensureConnected()` with `tcpNoDelay = true`:**
   ```kotlin
   val newSocket = Socket()
   newSocket.tcpNoDelay = true
   newSocket.connect(InetSocketAddress(host, port), connectTimeoutMs)
   ```
   By default, TCP stacks enable **Nagle's Algorithm** (RFC 896), which buffers small outgoing packets to combine them into full MSS (Maximum Segment Size) frames before transmitting. In our real-time monitoring system, Nagle's algorithm would introduce noticeable buffering lag. Setting `tcpNoDelay = true` disables Nagle's algorithm, instructing the kernel to send packets immediately upon `flush()`.
3. **Newline Delimitation (`\n`):** TCP is an unstructured byte-stream protocol without message boundaries. Appending `\n` provides unambiguous framing so the receiver knows exactly where one JSON payload ends and the next begins.
4. **Resilient Reconnection:** If the desktop server restarts or the cable is momentarily disrupted, `writer.flush()` throws a `SocketException: Broken pipe`. The catch block calls `disconnectInternal()`, resetting `socket = null`. On the very next 1-second iteration, `ensureConnected()` executes cleanly and restores communication without requiring the app to be restarted.
5. **Logcat Throttling Prevention:** OEM Android kernels aggressively rate-limit `Log.d` logs. By emitting `Log.i` on the 1st frame and every 10th frame, `adb logcat` provides permanent proof of healthy transmission.

---

### 2.5 Declarative UI Layer: `MemoryMonitorScreen.kt`

[`MemoryMonitorScreen.kt`](file:///c:/Users/Raghav%20V/Projects/MemoryMonitor/android/app/src/main/java/com/example/memorymonitor/MemoryMonitorScreen.kt) builds the Jetpack Compose visual presentation:

- **Circular RAM Gauge:** Utilizes two overlapping `CircularProgressIndicator` instances:
  - Background track: `CircularProgressIndicator(progress = { 1f }, color = MaterialTheme.colorScheme.surfaceVariant, strokeWidth = 12.dp)`
  - Active fill: `CircularProgressIndicator(progress = { memoryStats.usagePercentage / 100f }, color = MaterialTheme.colorScheme.primary, strokeWidth = 12.dp)`
  - Center label: Displays `${memoryStats.usagePercentage}%` in bold headline typography.
- **Card-Based Metrics:** Renders `CompactStatCard` surfaces for Used and Available memory, followed by `StatRow` components for Memory Pressure, Low Memory System Status, and App PSS Memory.
- **Linear Storage Indicator:** Renders `LinearProgressIndicator(progress = { memoryStats.storageUsagePercentage / 100f })` accompanied by used/total GB text.
- **Preview Support:** Includes `@Preview fun MemoryMonitorScreenPreview()` populated with realistic mock data, permitting rapid visual layout testing inside Android Studio without running an emulator or device.

---

## 3. Data Transfer & Networking Mechanics (The 20% Pipe)

### 3.1 Physical USB & ADB Reverse Port Forwarding

A primary project requirement is communication over a physical USB cable **without Wi-Fi, LAN routers, or cloud servers**.

```text
+-----------------------+                    +------------------------+
|     ANDROID PHONE     |                    |    DESKTOP COMPUTER    |
|                       |                    |                        |
| App connects to:      |                    | Server listens on:     |
| 127.0.0.1:8080        |                    | 127.0.0.1:8080         |
|         |             |                    |           ^            |
|         v             |                    |           |            |
| Android Kernel        |                    | PC Loopback Adapter    |
| Loopback Interface    |                    |           ^            |
|         |             |                    |           |            |
|         v             |                    |           |            |
| adbd (ADB Daemon)     |                    | adb host server        |
|         |             |                    |           ^            |
+---------|-------------+                    +-----------|------------+
          |                                              |
          |       PHYSICAL USB CABLE (Bulk Endpoint)     |
          +==============================================+
```

#### Understanding `adb reverse` vs `adb forward`
- **`adb forward tcp:PORT1 tcp:PORT2`:** Routes connections from the **PC** to the **phone**. The PC connects to `localhost:PORT1`, and ADB forwards the connection to a server listening on the phone at `PORT2`.
- **`adb reverse tcp:PORT1 tcp:PORT2`:** Routes connections from the **phone** to the **PC**. This is what MemoryMonitor requires!
  When the Android app connects to `127.0.0.1:8080` (phone loopback), the Android ADB daemon (`adbd`) intercepts the socket connection, encapsulates the TCP packets over the USB bulk transfer pipe (using the UsbFfs interface), and delivers them to the PC ADB server daemon. The PC ADB server then establishes a local TCP connection to `127.0.0.1:8080` on the desktop workstation.

---

### 3.2 TCP Stream Framing & Buffer Reassembly: `desktop/server.js`

In TCP, data is transmitted as an uninterrupted stream of bytes. If Android sends two 250-byte JSON messages quickly, the desktop operating system's TCP stack may combine them into a single 500-byte `data` event (packet coalescing). Alternatively, a large packet may be split across two separate `data` events (fragmentation).

Lines 93–155 of [`desktop/server.js`](file:///c:/Users/Raghav%20V/Projects/MemoryMonitor/desktop/server.js) resolve this:

```javascript
let buffer = '';

socket.on('data', (data) => {
    buffer += data.toString();
    
    // Split by newline to demarcate JSON messages
    let messages = buffer.split('\n');
    
    if (messages.length === 1) {
        // No newline present yet; only parse if buffer looks like a complete JSON object
        const trimmed = buffer.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
                const parsedData = JSON.parse(trimmed);
                processPayload(parsedData);
                buffer = ''; // clear buffer after successful parse
            } catch (_) {
                // Incomplete JSON fragment, continue accumulating in buffer
            }
        }
    } else {
        // Keep the last incomplete fragment in the buffer
        buffer = messages.pop() || '';
        
        for (const msg of messages) {
            const trimmed = msg.trim();
            if (!trimmed) continue;
            try {
                const parsedData = JSON.parse(trimmed);
                processPayload(parsedData);
            } catch (parseErr) {
                console.warn('[TCP] Ignored malformed message from Android:', parseErr.message);
            }
        }
    }

    // Buffer overflow protection
    if (buffer.length > 100000) {
        console.log('[TCP] Buffer cleared to prevent overflow');
        buffer = '';
    }
});
```

**Algorithmic Walkthrough:**
1. **Accumulation:** Incoming byte chunks are appended to the string `buffer`.
2. **`buffer.split('\n')`:**
   - If two messages arrived (`MSG1\nMSG2\n`), splitting yields `["MSG1", "MSG2", ""]`.
   - `messages.pop()` extracts the trailing incomplete element (`""` or a partial chunk) back into `buffer`.
   - The loop iterates over all complete messages, parses them via `JSON.parse()`, and emits them.
3. **Overflow Guard:** If corrupted bytes without newlines arrive, the buffer length is capped at 100 KB to prevent unbounded memory growth (Denial of Service).

---

### 3.3 Multi-Socket Management & Watchdog Architecture

A frequent pitfall in socket programming is handling reconnections. If Android disconnects and opens a new socket while an old socket is closing, a naive implementation will flag the device as disconnected.

[`desktop/server.js`](file:///c:/Users/Raghav%20V/Projects/MemoryMonitor/desktop/server.js) implements robust socket lifecycle tracking:

```javascript
const activeSockets = new Set();
let watchdogTimer = null;

function setDeviceConnected(connected) {
    if (latestData.connected !== connected) {
        latestData.connected = connected;
        io.emit('device_status', { connected: latestData.connected });
        console.log(`[Status] Android device is now ${connected ? 'CONNECTED' : 'DISCONNECTED'}`);
    }
}

function resetWatchdog() {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    // If no metrics payload is received for 4 seconds, mark device as disconnected
    watchdogTimer = setTimeout(() => {
        if (latestData.connected) {
            console.log('[Watchdog] No metrics received for 4 seconds, marking Android device as DISCONNECTED');
            setDeviceConnected(false);
        }
    }, 4000);
}
```

1. **`activeSockets` (`Set<net.Socket>`):** When a socket connects, it is added to the Set. When `close` or `error` triggers, it is deleted from the Set. `setDeviceConnected(false)` is invoked **only when `activeSockets.size === 0`**.
2. **Watchdog Timer:** If the USB cable is abruptly unplugged without a clean TCP FIN handshake, the socket might linger in a half-open state. The 4-second watchdog timer guarantees that if Android stops transmitting, the UI automatically transitions to disconnected within 4 seconds.
3. **State Re-Assertion on Data:** Whenever a valid payload arrives, `setDeviceConnected(true)` and `resetWatchdog()` are called, ensuring the server status remains synchronized with data arrival.

---

## 4. Desktop Dashboard Implementation in Depth

### 4.1 HTML & CSS Structure: `desktop/public/index.html`
The user interface is built using semantic HTML5 and styled with Tailwind CSS.

- **Header Section:**
  - `<div id="connection-indicator" class="w-3 h-3 rounded-full bg-red-500 transition-transform duration-200"></div>`
  - `<span id="connection-text">Android Device: Disconnected</span>`
  - `<span id="last-updated" class="text-xs text-gray-400 font-mono hidden bg-gray-700 px-2 py-1 rounded">Last update: --</span>`
- **RAM Section:**
  - Dynamic circular gauge container: `<div id="ram-circle">`
  - Inner center label: `<span id="ram-percentage">0%</span>`
  - Cards: Used (`#ram-used`), Available (`#ram-available`), Total (`#ram-total`), App Memory (`#ram-app`)
  - Badges: Memory Pressure (`#ram-pressure`), System Status (`#ram-status`)
- **Storage Section:**
  - Percentage: `<span id="storage-percentage">0%</span>`
  - Text ratio: `<span id="storage-used-val">0 GB</span> / <span id="storage-total-val">0 GB</span>`
  - Progress bar track: `<div id="storage-bar" style="width: 0%"></div>`
  - Detailed counters: Used (`#storage-used`), Free (`#storage-free`)

---

### 4.2 Reactive Controller: `desktop/public/js/app.js`

[`desktop/public/js/app.js`](file:///c:/Users/Raghav%20V/Projects/MemoryMonitor/desktop/public/js/app.js) translates WebSocket events into DOM state updates.

#### 1. High-Precision Formatting (`formatBytes`)
```javascript
function formatBytes(bytes, decimals = 2) {
    if (bytes === undefined || bytes === null || bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1000) {
        return (mb / 1024).toFixed(decimals) + ' GB';
    }
    return mb.toFixed(0) + ' MB';
}
```
**Why this matters:** When displaying gigabytes, formatting to 1 decimal place (`toFixed(1)`) rounds 4,110,000,000 bytes and 4,140,000,000 bytes both to `3.8 GB`. Users perceived the dashboard as frozen. Expanding precision to 2 decimal places (`toFixed(2)`) reveals live 10–30 MB memory fluctuations (`3.83 GB` $\rightarrow$ `3.86 GB`), confirming real-time operation.

#### 2. Dynamic Circular Conic-Gradient Gauge
Lines 83–95 calculate the gauge:
```javascript
const pct = (r.totalBytes && r.totalBytes > 0)
    ? ((r.usedBytes / r.totalBytes) * 100).toFixed(1)
    : (r.usagePercentage !== undefined ? Number(r.usagePercentage).toFixed(0) : '0');

document.getElementById('ram-percentage').textContent = `${pct}%`;

let color = '#3b82f6'; // Blue (Normal)
if (r.memoryPressure === 'Moderate') color = '#eab308'; // Yellow (Moderate)
if (r.memoryPressure === 'High') color = '#ef4444';     // Red (High)

document.getElementById('ram-circle').style.background = 
    `conic-gradient(${color} ${pct}%, #374151 ${pct}%, #374151 100%)`;
```
Instead of loading a heavy canvas library, the circular gauge is rendered natively by CSS using `conic-gradient`. The CSS sweeps an arc from 0% to `${pct}%` in the active color, and fills the remainder with dark gray (`#374151`).

#### 3. Heartbeat Pulse & Timestamp Clock
```javascript
// Visual heartbeat pulse on connection indicator
const indicator = document.getElementById('connection-indicator');
if (indicator) {
    indicator.classList.add('scale-125');
    setTimeout(() => indicator.classList.remove('scale-125'), 180);
}

// Update timestamp
const lastUpdateEl = document.getElementById('last-updated');
if (lastUpdateEl) {
    const timeObj = data.timestamp ? new Date(data.timestamp) : new Date();
    lastUpdateEl.textContent = `Last update: ${timeObj.toLocaleTimeString()}`;
    lastUpdateEl.classList.remove('hidden');
}
```
Every second when a packet arrives, the green dot expands by 25% for 180ms and returns to normal size, creating a visual heartbeat. The timestamp displays the exact second of data arrival.

---

## 5. Comprehensive Oral Viva & Technical Interview Preparation Guide

This section prepares you to answer deep technical questions about Operating Systems, Android internals, and Distributed Networking.

### Question 1: What is the fundamental difference between Virtual Memory, Physical RAM, and Internal Storage?
**Answer:**
- **Physical RAM:** High-speed, volatile hardware memory (DDR4/DDR5) where the CPU directly executes instructions and accesses data via physical address lines.
- **Virtual Memory:** An abstraction provided by the CPU's Memory Management Unit (MMU) and operating system kernel. Each application runs in its own private 64-bit virtual address space, mapped to physical RAM via page tables. Virtual memory provides memory protection (processes cannot inspect or corrupt other processes' memory) and allows contiguous virtual allocations even if physical RAM is fragmented.
- **Internal Storage:** Non-volatile, block-based persistent storage (eMMC or UFS NAND flash). Storage is organized into partitions and formatted with filesystems (ext4 or F2FS) to persist files across reboots. RAM operates in nanoseconds; storage access takes microseconds to milliseconds.

---

### Question 2: In Android, why does `ActivityManager.MemoryInfo.availMem` not equal the free RAM shown by desktop OS task managers?
**Answer:**
In modern Linux and Android, unused RAM is considered wasted RAM. The Linux kernel aggressively uses unallocated memory to cache recently read disk blocks (`Cached`) and filesystem metadata (`Buffers`). When an application requests memory, the kernel instantly drops clean file caches to satisfy the allocation. Therefore, `availMem` is calculated as:
$$\text{availMem} = \text{Free Pages} + \text{Reclaimable Cached Pages} + \text{Inactive File Pages} - \text{Kernel Reserved Margins}$$
It represents the memory the kernel can make available without terminating running processes.

---

### Question 3: What is the Android Low Memory Killer (LMK / lmkd) and how does our application monitor it?
**Answer:**
Standard Linux utilizes Swap space on disk when physical RAM is exhausted. Mobile devices avoid standard swap to disk because excessive writes wear out flash memory and cause severe thermal and battery degradation.
Instead, Android uses the **Low Memory Killer daemon (`lmkd`)**. When available memory drops below predefined thresholds (`threshold`), `lmkd` terminates background processes based on their `oom_adj_score` (Out-Of-Memory adjustment score), starting with cached empty background processes and moving toward foreground services.
Our app monitors this condition through:
1. `memoryInfo.lowMemory`: A boolean flag directly set by the kernel when available memory has breached the low-memory barrier and active process culling has commenced.
2. `memoryPressure`: Our application classification (`Normal`, `Moderate`, `High`) derived from usage percentage.

---

### Question 4: What is the difference between PSS, RSS, and VSS, and why did we choose PSS for measuring "This App Memory"?
**Answer:**
- **VSS (Virtual Set Size):** Total virtual addresses mapped, including unloaded shared libraries. It does not represent physical memory footprint.
- **RSS (Resident Set Size):** Physical memory held in RAM by the process, but shared libraries are counted in full for every process using them.
- **PSS (Proportional Set Size):** Accounts for shared memory proportionally. If the Android framework runtime (`boot.art`) occupies 30 MB in RAM and is shared across 30 running apps, each app is charged exactly 1 MB of PSS.
We use `Debug.getMemoryInfo(debugMemoryInfo).totalPss` because PSS is the only statistically accurate metric for measuring an individual process's true contribution to device RAM consumption.

---

### Question 5: Why did we use TCP sockets instead of HTTP polling or WebSockets between Android and the PC?
**Answer:**
- **Protocol Overhead:** HTTP is a request-response protocol. Each HTTP request requires sending HTTP headers, method tokens, user-agent strings, and handling TCP connection teardown, creating high bandwidth overhead for 1-second metric streaming.
- **Directionality:** In our architecture, the Android device is a client pushing telemetry. Running an HTTP server inside an Android app requires handling background server lifecycles, power management locks, and firewall restrictions.
- **Lightweight Stream:** Raw TCP socket programming (`net.Socket`) establishes a single, lightweight byte pipe. Once connected, raw JSON strings are sent with zero header overhead, minimizing mobile CPU cycles and power consumption.

---

### Question 6: Explain how `adb reverse` works at the operating system network stack level.
**Answer:**
Under standard networking, connecting to `127.0.0.1` hits the device's local loopback network interface (`lo`). Because no desktop server is running on the phone, the connection fails with `ECONNREFUSED`.
`adb reverse tcp:8080 tcp:8080` instructs the Android Debug Bridge:
1. The on-device ADB daemon (`adbd`) opens a listening socket on loopback port 8080.
2. When our app calls `socket.connect("127.0.0.1", 8080)`, `adbd` accepts the connection.
3. `adbd` multiplexes the TCP stream into USB packets using the UsbFfs (USB Function Filesystem) driver.
4. The USB host controller on the desktop reads the packets and routes them to the desktop `adb.exe` server daemon.
5. The desktop ADB daemon initiates a local TCP connection to desktop `127.0.0.1:8080` where `desktop/server.js` is listening, splicing the streams together transparently.

---

### Question 7: Why is TCP message demarcation necessary, and how does our implementation handle stream fragmentation?
**Answer:**
TCP is a byte-stream protocol, not a datagram protocol (like UDP). TCP guarantees in-order, reliable delivery of bytes, but guarantees nothing about message boundaries. A sender calling `write()` three times may result in the receiver getting all three messages in one `data` event, or getting half of a message across two `data` events.
Our application implements **newline-delimited framing**:
- **Sender (`TcpDataSender.kt`):** Appends a newline byte (`\n`) after every complete JSON payload: `writer.write(payload); writer.write("\n")`.
- **Receiver (`desktop/server.js`):** Buffers incoming chunks and splits on `\n`. It pops the last incomplete fragment back into the buffer and only parses elements that were terminated by a newline.

---

### Question 8: Why is `newSocket.tcpNoDelay = true` configured in `TcpDataSender.kt`?
**Answer:**
By default, TCP sockets enable **Nagle's Algorithm** (RFC 896). Nagle's algorithm buffers small outgoing packets and waits for either a full TCP Maximum Segment Size (MSS, typically ~1460 bytes) or an acknowledgment (ACK) from the receiver before transmitting.
Because our JSON telemetry payloads are approximately 300–400 bytes, Nagle's algorithm would introduce 40–200 ms of artificial buffering latency. Setting `tcpNoDelay = true` sets the `TCP_NODELAY` socket option, disabling Nagle's algorithm and forcing the OS network stack to flush packets immediately.

---

### Question 9: Why did we use Kotlin Coroutines and `produceState` instead of a standard Java `Thread.sleep(1000)`?
**Answer:**
- **Thread Blocking:** A traditional Java thread executing `Thread.sleep()` blocks the underlying OS thread, consuming stack memory (~1 MB) and kernel scheduling resources.
- **Coroutines:** Coroutines are lightweight virtual execution units. Calling `delay(1000)` is non-blocking; it suspends the coroutine, freeing the underlying thread in `Dispatchers.IO` to execute other tasks.
- **Lifecycle Awareness:** Standard threads do not respect Android Activity lifecycles. A background thread running `while(true)` will continue executing even if the user leaves the app, causing severe memory leaks and battery drain. Combining `produceState` with `repeatOnLifecycle` automatically starts and stops the coroutine in lockstep with the UI visibility.

---

### Question 10: How does `desktop/server.js` handle multiple concurrent sockets and avoid premature disconnection?
**Answer:**
When Android reconnects, a brief overlap occurs where a new TCP socket opens while the old socket is closing.
`server.js` maintains a `Set` of active sockets: `const activeSockets = new Set()`.
- On connection: `activeSockets.add(socket)`.
- On close: `activeSockets.delete(socket)`.
The server only broadcasts `device_status: { connected: false }` if `activeSockets.size === 0`. Additionally, whenever a valid metrics frame arrives from *any* socket, the server re-asserts `connected: true` and resets a 4-second watchdog timer.

---

## 6. Architectural Extensions & Future Roadmap

*(Note: The following architectural improvements are separated from the current verified implementation to guide future work.)*

1. **Historical Time-Series Telemetry (Sparklines):**
   - *Current Implementation:* Displays instantaneous point-in-time metrics.
   - *Proposed Extension:* Integrate a lightweight charting library (such as Chart.js) or HTML5 `<canvas>` to maintain a 60-second sliding window of RAM and storage utilization, plotting paging spikes and memory pressure transitions.
2. **Wi-Fi / Network Service Discovery (mDNS):**
   - *Current Implementation:* Relies on physical USB tunneling via `adb reverse`.
   - *Proposed Extension:* Implement Android Network Service Discovery (NSD / Bonjour) so the phone can broadcast a `_memorymonitor._tcp` service over local Wi-Fi, allowing the desktop to discover and connect to the device wirelessly without manual ADB commands.
3. **Binary Serialization (Protocol Buffers):**
   - *Current Implementation:* Plaintext JSON with newline framing.
   - *Proposed Extension:* Replace JSON with Protocol Buffers (Protobuf). A compiled binary schema would reduce the payload from ~380 bytes to ~45 bytes, reducing serialization CPU overhead and power consumption.
4. **Per-Process Process Table:**
   - *Current Implementation:* Measures overall system RAM and the monitor app's own PSS footprint.
   - *Proposed Extension:* Query `UsageStatsManager` or read non-restricted fields from `/proc` to display the top 5 memory-consuming applications currently running in the background.
