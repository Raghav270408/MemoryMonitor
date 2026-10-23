# MemoryMonitor: Complete Technical Instruction Manual

> **System Version:** 1.0  
> **Target OS:** Android 7.0+ (API Level 24+) through Android 15 / UpsideDownCake+ (API Level 37)  
> **Desktop Environment:** Windows 10/11 (Node.js LTS, Chrome/Edge/Firefox)  
> **Physical Device Tested:** Android Physical Smartphone (`10BD3K0Q83000R6`)  
> **Repository Location:** `C:\Users\Raghav V\Projects\MemoryMonitor`

---

## 1. Project Overview

### 1.1 Purpose and Scope
**MemoryMonitor** is an end-to-end Operating Systems demonstration and monitoring system designed to collect physical memory (RAM) and internal storage metrics from a live Android device and visualize them continuously on a desktop web dashboard over a dedicated USB cable.

The project demonstrates core Operating Systems, Mobile Computing, and Distributed Systems concepts:
- **Operating Systems Memory Accounting:** Real-time extraction of total, available, and used system RAM, kernel low-memory conditions, and process-level Proportional Set Size (PSS) memory usage.
- **Filesystem Statistics:** Querying storage block counts and cluster sizes to compute disk capacity, free space, and storage utilization.
- **Inter-Device Socket Networking:** Establishing client-server TCP connections between two distinct Operating Systems (Linux/Android and Windows Desktop) using socket-level byte streams.
- **Stream Message Demarcation & Framing:** Handling stream fragmentation using newline-delimited JSON (`\n`) over persistent TCP sockets.
- **Hardware Tunneling:** Routing TCP traffic over a physical USB connection using Android Debug Bridge (`adb reverse`) without depending on local Wi-Fi networks, routers, or cloud intermediaries.
- **Reactive Visualization:** Bridging raw TCP socket data into a browser dashboard via WebSockets (Socket.IO) and Tailwind CSS with sub-second responsiveness.

---

### 1.2 System Architecture & High-Level Data Flow

```text
+----------------------------------------------------------------------------------------------------+
|                                      ANDROID DEVICE (SMARTPHONE)                                   |
|                                                                                                    |
|  [ Android OS Subsystems ]                                                                         |
|   - ActivityManager (Kernel totalMem, availMem, lowMemory)                                         |
|   - Debug.MemoryInfo (Process PSS App Memory)                                                      |
|   - StatFs /data (Filesystem block count, block size)                                              |
|            |                                                                                       |
|            v                                                                                       |
|  [ MemoryInfoReader.kt ]  ==> Instantiates MemoryStats data model                                  |
|            |                                                                                       |
|            v                                                                                       |
|  [ MemoryStats.toJsonString() ] ==> Serializes to Newline-Delimited JSON                           |
|            |                                                                                       |
|            v                                                                                       |
|  [ MainActivity.kt (produceState) ] ==> Updates Jetpack Compose UI locally                         |
|            |                                                                                       |
|            v                                                                                       |
|  [ TcpDataSender.kt ] (Dispatchers.IO)                                                             |
|   - Connects to Socket(127.0.0.1:8080)                                                             |
|   - tcpNoDelay = true (Nagle disabled)                                                             |
|   - Flushes payload + '\n'                                                                         |
+------------------------------------------------|---------------------------------------------------+
                                                 | TCP Client Connection (127.0.0.1:8080)
                                                 v
+----------------------------------------------------------------------------------------------------+
|                                    PHYSICAL USB CABLE (ADB TUNNEL)                                 |
|                                                                                                    |
|   Command: `adb reverse tcp:8080 tcp:8080`                                                         |
|   - Device Loopback (127.0.0.1:8080) is intercepted by adbd daemon                                 |
|   - Forwarded across USB bulk endpoints (UsbFfs) to PC adb host daemon                             |
|   - Delivered to PC Loopback (127.0.0.1:8080)                                                      |
+------------------------------------------------|---------------------------------------------------+
                                                 | TCP Stream Arrival
                                                 v
+----------------------------------------------------------------------------------------------------+
|                                    WINDOWS DESKTOP WORKSTATION                                     |
|                                                                                                    |
|  [ desktop/server.js ] (Node.js runtime)                                                           |
|   - TCP Server (net.createServer) listening on 127.0.0.1:8080                                      |
|   - Multi-socket tracking (activeSockets Set)                                                      |
|   - Buffer chunking & newline split ('\n')                                                         |
|   - Inactivity watchdog (4000ms timeout)                                                           |
|   - Express HTTP Server on port 3000 (serves static dashboard)                                     |
|   - Socket.IO WebSocket Engine (bridges TCP metrics to browser)                                    |
|   - REST Diagnostics endpoint: GET http://localhost:3000/api/status                                |
|            |                                                                                       |
|            v (WebSocket events: `device_status`, `monitoring_data`)                                |
|  [ desktop/public/js/app.js ] (Client-side JS)                                                     |
|   - Re-asserts connection status (green indicator dot)                                             |
|   - Visual pulse heartbeat trigger                                                                 |
|   - Last updated timestamp clock                                                                   |
|   - Conic-gradient dynamic RAM gauge calculation                                                   |
|   - Two-decimal precision metric formatting (formatBytes)                                          |
|            |                                                                                       |
|            v                                                                                       |
|  [ desktop/public/index.html ] (DOM Rendering)                                                     |
|   - Circular RAM Usage Gauge, Status Badges, Storage Progress Bar                                  |
+----------------------------------------------------------------------------------------------------+
```

---

### 1.3 Verified Metrics Inventory
The following metrics are genuinely collected from Android APIs and transmitted through the pipeline:

| Category | Field Name | Unit | Source API | Description |
| :--- | :--- | :--- | :--- | :--- |
| **RAM** | `totalBytes` | Bytes | `ActivityManager.MemoryInfo.totalMem` | Total physical RAM kernel detected on device. |
| **RAM** | `availableBytes` | Bytes | `ActivityManager.MemoryInfo.availMem` | Kernel free memory + cached background process memory. |
| **RAM** | `usedBytes` | Bytes | Derived (`totalMem - availMem`) | Kernel memory actively reserved by processes and system. |
| **RAM** | `usagePercentage` | % (0–100) | Derived (`usedBytes / totalBytes * 100`) | Relative consumption of device RAM. |
| **RAM** | `memoryPressure` | String | Application Classification | `"Normal"` (<60%), `"Moderate"` (60–79%), `"High"` (≥80%). |
| **RAM** | `systemMemoryStatus` | String | `ActivityManager.MemoryInfo.lowMemory` | `"Normal"` if false, `"Low Memory"` if true. |
| **RAM** | `appMemoryBytes` | Bytes | `Debug.MemoryInfo.totalPss * 1024L` | Proportional Set Size (PSS) memory of the monitor app process. |
| **Storage** | `totalBytes` | Bytes | `StatFs.blockCountLong * blockSizeLong` | Total capacity of internal storage (`/data`). |
| **Storage** | `availableBytes` | Bytes | `StatFs.availableBlocksLong * blockSizeLong` | Storage space available to non-root applications. |
| **Storage** | `usedBytes` | Bytes | Derived (`totalBytes - availableBytes`) | Consumed internal storage on `/data`. |
| **Storage** | `usagePercentage` | % (0–100) | Derived (`usedBytes / totalBytes * 100`) | Relative storage consumption. |

---

## 2. Complete Repository Map

```text
MemoryMonitor/
├── .gitignore                                   # Root git exclusion file
├── HANDOFF.md                                   # Original architecture specification & JSON contract
├── start_monitor.bat                            # Windows one-click desktop & ADB reverse launcher
├── start_monitor.ps1                            # PowerShell automation script for reverse tunnel & server
├── android/                                     # Android application module root
│   ├── build.gradle.kts                         # Root Gradle build configuration
│   ├── gradle.properties                        # Gradle JVM and caching parameters
│   ├── gradlew                                  # Unix/macOS Gradle wrapper launcher
│   ├── gradlew.bat                              # Windows Gradle wrapper launcher
│   ├── local.properties                         # Android SDK local filesystem directory
│   ├── settings.gradle.kts                      # Module inclusion and plugin repositories
│   ├── app/                                     # Android application source module
│   │   ├── build.gradle.kts                     # App-level build config, SDK versions, dependencies
│   │   ├── src/
│   │   │   ├── main/
│   │   │   │   ├── AndroidManifest.xml          # App manifest, permissions, activity registration
│   │   │   │   ├── java/com/example/memorymonitor/
│   │   │   │   │   ├── MainActivity.kt          # UI initialization, lifecycle state, coroutine loop
│   │   │   │   │   ├── MemoryInfoReader.kt      # Android OS metrics collection & JSON serialization
│   │   │   │   │   ├── MemoryMonitorScreen.kt   # Jetpack Compose UI layout, cards, circular gauge
│   │   │   │   │   ├── TcpDataSender.kt         # Persistent TCP client, mutex locking, network I/O
│   │   │   │   │   └── ui/theme/
│   │   │   │   │       ├── Color.kt             # Material 3 color definitions
│   │   │   │   │       ├── Theme.kt             # Theme wrapper, dynamic color support
│   │   │   │   │       └── Type.kt              # Typography definitions
│   │   │   │   └── res/                         # Android XML drawables, mipmaps, strings, styles
│   │   │   ├── test/java/com/example/memorymonitor/
│   │   │   │   ├── ExampleUnitTest.kt           # Basic local unit test
│   │   │   │   └── MemoryStatsSerializationTest.kt # JSON contract & schema unit test
│   │   │   └── androidTest/                     # Instrumented Android on-device tests
│   │   └── keepRules/rules.keep                 # Code shrinker keep rules
│   └── gradle/
│       ├── gradle-daemon-jvm.properties         # Daemon JDK version & toolchain configuration
│       ├── libs.versions.toml                   # Centralized dependency catalog (AGP, Kotlin, Compose)
│       └── wrapper/
│           ├── gradle-wrapper.jar               # Gradle distribution bootstrapper
│           └── gradle-wrapper.properties        # Gradle version (9.5.0) configuration
└── desktop/                                     # Desktop dashboard backend & frontend
    ├── package.json                             # Node.js dependencies (express, socket.io) & scripts
    ├── package-lock.json                        # Locked npm dependency versions
    ├── server.js                                # Node.js TCP receiver (8080), Express, Socket.IO (3000)
    └── public/                                  # Static web frontend assets
        ├── index.html                           # Dashboard structure, Tailwind layout, cards, canvas
        ├── css/
        │   └── style.css                        # Circular gauge conic-gradient styling
        └── js/
            └── app.js                           # Socket.IO client, DOM updater, heartbeat, watchdog
```

---

### Detailed File Responsibilities

#### `android/app/src/main/java/com/example/memorymonitor/MainActivity.kt`
- **Role:** Main application entry point and lifecycle orchestrator.
- **Inputs:** Android OS Activity lifecycle events (`onCreate`, `onStart`, `onStop`, `onDestroy`).
- **Outputs:** Renders `MemoryMonitorScreen` via Jetpack Compose; initiates periodic metric reads and TCP transmission.
- **Dependencies:** Calls `MemoryInfoReader.getMemoryStats()`, invokes `TcpDataSender.send()`.
- **Key Implementation Details:**
  - `window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)` keeps the phone display awake to prevent background pauses during monitoring.
  - `produceState` tied to `lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED)` runs an infinite `while (true)` loop with `delay(1000)`.
  - Automatically suspends transmission and closes the socket when the app leaves the foreground (`finally { tcpSender.close() }`).

#### `android/app/src/main/java/com/example/memorymonitor/MemoryInfoReader.kt`
- **Role:** System hardware metrics reader and serialization engine.
- **Inputs:** Android application `Context`.
- **Outputs:** `MemoryStats` object containing raw bytes and derived statistics; produces newline-delimited JSON string via `toJsonString()`.
- **Dependencies:** Android framework classes `ActivityManager`, `StatFs`, `Debug.MemoryInfo`.
- **Where to look if broken:** If metric values appear incorrect (e.g., negative bytes or 0% storage), inspect the `StatFs` path and `ActivityManager.MemoryInfo` field mappings.

#### `android/app/src/main/java/com/example/memorymonitor/TcpDataSender.kt`
- **Role:** Low-level TCP socket client.
- **Inputs:** Raw JSON payload strings.
- **Outputs:** Network transmission over TCP socket to `127.0.0.1:8080`; boolean success/failure flag; Logcat logs.
- **Dependencies:** Kotlin Coroutines (`Dispatchers.IO`, `Mutex`), Java Sockets (`java.net.Socket`, `BufferedWriter`).
- **Key Implementation Details:**
  - Thread-safe transmission protected by a coroutine `Mutex`.
  - Configures `newSocket.tcpNoDelay = true` to disable Nagle's algorithm.
  - Features automatic reconnection upon `SocketException` or broken pipe.
  - Logs `Log.i` on frame 1 and every 10 frames to bypass OEM Logcat rate-limiting.

#### `android/app/src/main/java/com/example/memorymonitor/MemoryMonitorScreen.kt`
- **Role:** Declarative Jetpack Compose UI.
- **Inputs:** `MemoryStats?` nullable state object.
- **Outputs:** Compose layout displaying circular RAM gauge, used/available cards, system memory status badges, and storage progress bar.
- **Dependencies:** Material 3 components (`CircularProgressIndicator`, `LinearProgressIndicator`, `Card`, `Icon`).

#### `desktop/server.js`
- **Role:** Desktop communication hub.
- **Inputs:** TCP byte stream on port 8080 from Android; WebSocket connections on port 3000 from browsers.
- **Outputs:** Socket.IO events (`device_status`, `monitoring_data`); REST endpoint (`/api/status`); HTTP static file server.
- **Dependencies:** `express`, `http`, `net`, `socket.io`, `path`.
- **Key Implementation Details:**
  - Manages `activeSockets` (`Set<net.Socket>`) to prevent multi-socket race conditions.
  - Splits incoming TCP buffers by newline (`\n`) to parse fragmented or combined JSON payloads.
  - Runs a 4-second inactivity watchdog that flips `device_status` to disconnected if packets stop.
  - Attaches `timestamp: Date.now()` to each outbound payload.

#### `desktop/public/js/app.js`
- **Role:** Frontend dashboard controller.
- **Inputs:** Socket.IO events (`monitoring_data`, `device_status`, `connect`, `disconnect`).
- **Outputs:** Live DOM updates across 16 element IDs; dynamic CSS `conic-gradient` calculations; connection dot pulsing.
- **Dependencies:** Client-side `socket.io.js`, modern browser DOM APIs.

---

## 3. Environment Setup & Prerequisites

### 3.1 Software Requirements
| Component | Verified Project Version | Requirement Notes |
| :--- | :--- | :--- |
| **Operating System** | Windows 10/11 x64 | PowerShell 5.1+ or PowerShell 7+ |
| **Android SDK Platform** | Android 15 / UpsideDownCake (API 37) | Installed via Android Studio SDK Manager |
| **Android Build Tools** | 37.0.0 | Compatible with AGP 9.3.2 |
| **Android Gradle Plugin** | 9.3.2 | Specified in `libs.versions.toml` |
| **Gradle** | 9.5.0 | Packaged via `gradle-wrapper.properties` |
| **Java Development Kit** | JDK 21 or JDK 25 | Foojay toolchain resolver configured in `settings.gradle.kts` |
| **Node.js** | Node.js v18.0.0+ LTS (Tested on v20+) | Required for `desktop/server.js` |
| **npm** | npm v9.0.0+ | Ships bundled with Node.js |
| **ADB (Platform Tools)** | Version 35.0.0+ | Located at `%LOCALAPPDATA%\Android\Sdk\platform-tools` |

### 3.2 Environment Verification Commands

Verify Node.js and npm:
```powershell
node -v
npm -v
```

Verify Android Debug Bridge (ADB):
```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" version
```

Verify Physical Phone Connection:
```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
```
*Expected output:* Device ID followed by the word `device` (e.g. `10BD3K0Q83000R6  device`). If it says `unauthorized`, unlock your phone and tap **Allow USB Debugging**.

---

## 4. Step-by-Step Startup Guide

### Method A: One-Click Automated Launch (Recommended)
We provide an automated script that configures ADB reverse port forwarding and launches the desktop server simultaneously.

1. Connect your Android phone to your PC with a physical USB cable.
2. In File Explorer, navigate to `C:\Users\Raghav V\Projects\MemoryMonitor`.
3. Double-click `start_monitor.bat` (or execute `./start_monitor.ps1` in PowerShell).
4. Open your browser and navigate to:
   ```text
   http://localhost:3000
   ```
5. Launch the **MemoryMonitor** application on your smartphone.

---

### Method B: Manual Step-by-Step Procedure

#### Step 1: Install Desktop Dependencies
Open PowerShell and navigate to the `desktop` directory:
```powershell
cd "C:\Users\Raghav V\Projects\MemoryMonitor\desktop"
npm install
```

#### Step 2: Establish the ADB Reverse Port Forwarding
Configure the ADB daemon to forward Android TCP requests on port 8080 across USB to desktop port 8080:
```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" reverse tcp:8080 tcp:8080
```
Verify the rule is active:
```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" reverse --list
```
*Expected output:* `UsbFfs tcp:8080 tcp:8080`.

#### Step 3: Start the Desktop Server
From the `desktop` folder, launch `server.js`:
```powershell
node server.js
```
*Console output:*
```text
Web Dashboard running at http://localhost:3000
TCP Listener waiting for Android data on port 8080
```

#### Step 4: Open the Web Dashboard
Open any modern web browser (Chrome, Edge, Firefox) and navigate to:
```text
http://localhost:3000
```
Initially, the dashboard will display a red indicator: **`Android Device: Disconnected`**.

#### Step 5: Build and Run the Android Application
In Android Studio:
1. Open the project root `C:\Users\Raghav V\Projects\MemoryMonitor\android`.
2. Select your connected physical device in the device toolbar.
3. Click the **Run ('app')** button (Shift + F10).

Or build and deploy via CLI:
```powershell
cd "C:\Users\Raghav V\Projects\MemoryMonitor\android"
.\gradlew.bat installDebug
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell "am start -n com.example.memorymonitor/.MainActivity"
```

#### Step 6: Verify Operation
- In the desktop console, you will see:
  ```text
  [TCP] Android connected from ::ffff:127.0.0.1:XXXXX (Active sockets: 1)
  [Status] Android device is now CONNECTED
  [Metrics] Total frames received: 10. RAM usage: 68% (3924488192 bytes), Storage: 59%
  ```
- In the web browser:
  - The status dot changes to **green** and displays **`Android Device: Connected`**.
  - A subtle pulse animation beats on the green dot on every frame.
  - The `Last update: HH:MM:SS` timestamp updates every second.
  - The circular gauge and numerical cards dynamically fluctuate.

#### Step 7: Teardown & Clean Up
To stop monitoring:
1. Close the browser tab.
2. In the Node.js terminal, press `Ctrl + C`.
3. Clear the ADB reverse port mapping:
   ```powershell
   & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" reverse --remove tcp:8080
   ```

---

## 5. Normal Operating Procedure & Runtime Behaviors

### 5.1 Verification Matrix for Runtime Events

| Event | System Behavior | Visual Indication | Recovery Action |
| :--- | :--- | :--- | :--- |
| **Normal Streaming** | Android transmits JSON every 1s. Node.js relays to Socket.IO. | Green dot, pulsing heartbeat, ticking timestamp clock. | None required; operating nominally. |
| **App Minimized / Phone Locked** | Android lifecycle calls `onStop()`. Coroutine loop exits, `finally` closes TCP socket. | Dashboard watchdog triggers after 4.5s; turns **Red** ("Disconnected"). | Bring app back to foreground; auto-reconnects in 1s. |
| **USB Cable Unplugged** | ADB reverse tunnel breaks immediately. Android gets `ECONNREFUSED`. Node detects TCP close or 4s watchdog timeout. | Status turns **Red** ("Disconnected"). Timestamps stop advancing. | Reconnect cable, run `adb reverse tcp:8080 tcp:8080`, reopen app. |
| **Desktop Server Restarted** | Node server dies and restarts. Android encounters broken pipe, resets socket, and reconnects on next 1s tick. | Status temporarily blips red, then returns to **Green** within 1–2s. | Fully automatic; no manual intervention needed. |
| **Browser Refreshed (F5)** | Browser reconnects to Socket.IO. Server immediately emits cached `latestData` and active `connected: true`. | Dashboard immediately renders current metrics without interruption. | Fully automatic; Android TCP stream is unaffected. |

---

## 6. Testing Guide

### 6.1 Android Unit Tests
Location: `android/app/src/test/java/com/example/memorymonitor/MemoryStatsSerializationTest.kt`

- **Purpose:** Validates the exact JSON contract required by the desktop server. Checks field naming, presence of nested objects (`ram`, `storage`), and conditional text outputs (`"Normal"` vs `"Low Memory"`).
- **Execution Command:**
  ```powershell
  cd "C:\Users\Raghav V\Projects\MemoryMonitor\android"
  .\gradlew.bat testDebugUnitTest
  ```
- **Interpreting Results:**
  - `BUILD SUCCESSFUL`: All assertions passed.
  - If it fails with `AssertionError: expected <...> but was <...>`, a JSON key name or data type in `MemoryInfoReader.kt` was modified and violates the contract.

### 6.2 Android Instrumented Tests
Location: `android/app/src/androidTest/java/com/example/memorymonitor/ExampleInstrumentedTest.kt`
- **Execution Command:**
  ```powershell
  .\gradlew.bat connectedDebugAndroidTest
  ```
- **Requirements:** Physical device must be unlocked and connected.

### 6.3 End-to-End Pipeline Diagnostic Query
The desktop server provides a REST status API. You can test data flow without a web browser:
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/status" | ConvertTo-Json -Depth 5
```
Verify that `connected` is `true` and `totalFramesReceived` increments between successive queries.

---

## 7. Comprehensive Troubleshooting Guide

### Issue 1: Gradle Build Failure (`jlink.exe does not exist` or JDK Incompatibility)
- **Symptom:** Gradle build fails with configuration cache or toolchain errors pointing to a non-existent JDK path.
- **Diagnostic Command:**
  ```powershell
  cd android
  .\gradlew.bat --version
  ```
- **Root Cause:** Gradle is referencing a stale JDK location from an IDE extension rather than the system JDK.
- **Fix:** Verify `android/gradle/gradle-daemon-jvm.properties` specifies `toolchainVersion=25` or `toolchainVersion=21`, and ensure Android Studio is set to use the Embedded JDK (Settings $\rightarrow$ Build $\rightarrow$ Build Tools $\rightarrow$ Gradle $\rightarrow$ Gradle JDK).

### Issue 2: Phone Not Detected by ADB
- **Symptom:** `adb devices` shows an empty list.
- **Diagnosis:**
  - Faulty USB cable (charging-only cable).
  - USB Debugging disabled in Android Developer Options.
  - Missing OEM USB drivers on Windows.
- **Fix:**
  1. Open Android **Settings** $\rightarrow$ **Developer Options** $\rightarrow$ Toggle **USB Debugging** OFF and ON.
  2. Change USB mode from "Charging only" to "File Transfer (MTP)".
  3. Accept the RSA fingerprint prompt on the phone screen.

### Issue 3: TCP Connection Refused (`ECONNREFUSED`)
- **Symptom:** Android Logcat outputs:
  `Transmission failed to 127.0.0.1:8080: ConnectException: isConnected failed: ECONNREFUSED`
- **Root Cause:** The `adb reverse` mapping is missing. Android is attempting to connect to its own local loopback on port 8080 where nothing is listening.
- **Fix:** Re-run the reverse command:
  ```powershell
  & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" reverse tcp:8080 tcp:8080
  ```

### Issue 4: Dashboard Status Says "Disconnected" While Android Reports "Transmission active"
- **Symptom:** The phone is sending packets, but the dashboard indicator remains red.
- **Diagnosis:** Check the desktop server logs. If `[Watchdog]` is firing, the packets are not reaching port 8080, or the JSON parsing is throwing exceptions.
- **Fix:** Query `http://localhost:3000/api/status`. If `activeSockets` is 0, check Windows Firewall to ensure Node.js is permitted to listen on local TCP ports.

### Issue 5: Metrics Appear Static / Numbers Do Not Change
- **Symptom:** The connection shows connected, but numbers appear frozen.
- **Root Cause:** In earlier versions, formatting truncated values to single decimals (`5.1 GB`), concealing 20 MB changes.
- **Fix:** Verify that `desktop/public/js/app.js` is updated with `formatBytes(bytes, 2)`. Observe the `#last-updated` timestamp in the header to confirm the 1-second heartbeat.


---

## 8. Per-Application Memory Monitoring Feature

### 8.1 What the Feature Measures
The Per-Application Memory Monitoring feature visualizes process-level memory consumption across active applications on the target Android device.
- **Primary Metric:** Proportional Set Size (**PSS**), measured in Megabytes (MB).
- **Metric Accounting:** PSS accounts for private physical RAM pages allocated exclusively to a process, plus a proportional share of shared libraries mapped across multiple processes.
- **Attributes Tracked per Application:**
  - `packageName`: Unique Android package identifier (e.g., `com.android.chrome`, `com.example.memorymonitor`).
  - `displayName`: Human-readable application label.
  - `pid`: Process identifier (integer) when available.
  - `memoryMB`: Physical PSS memory in MB (with documented conversion: $\text{KB} / 1024.0$).
  - `memoryBytes`: Exact memory in bytes ($\text{KB} \times 1024$).
  - `metric`: Memory classification (`"PSS"`).
  - `source`: Collector mechanism (`"Debug.MemoryInfo"` or `"ADB dumpsys meminfo"`).
  - `status`: Authenticity indicator (`"available"`, `"restricted"`, or `"unavailable"`).
  - `statusMessage`: Diagnostic reason when data is restricted.
  - `timestamp`: Epoch millisecond timestamp of collection.

---

### 8.2 Android OS Sandboxing Constraints & API Restrictions
On modern Android versions, Linux kernel security policies (SELinux `hidepid=2`) and Android application sandboxing enforce strict process isolation:
1. **`ActivityManager.getProcessMemoryInfo(int[] pids)`:** Starting with **Android 10 (API Level 29)**, unprivileged third-party apps querying this API for PIDs belonging to other applications receive zeroed-out structures (0 bytes) or encounter security exceptions.
2. **`ActivityManager.getRunningAppProcesses()`:** Starting with Android 5.1 (API 22) and Android 7.0 (API 24), this returns only the calling application's own process.
3. **`UsageStatsManager`:** While queryable with `PACKAGE_USAGE_STATS` granted in Settings, `UsageStatsManager` provides execution duration and launch timestamps, **not** physical RAM metrics.
4. **Truthfulness Guarantee:** In compliance with project guidelines, the monitor never reports zero as proof of zero RAM, nor does it label usage time or heap space as another app's RAM. Measurements that cannot be obtained by an unprivileged app are explicitly reported as `status: "restricted"`.

---

### 8.3 Dual Collection Engine Architecture

To provide authentic data while keeping the Android application standalone:

```text
[ Android Device ]
  │
  ├─ In-App Telemetry (MemoryInfoReader.kt)
  │    ├─ Debug.getMemoryInfo()  ==> Memory Monitor PSS (status: "available")
  │    ├─ PackageManager         ==> User app labels (status: "restricted")
  │    └─ TCP Socket (port 8080) ==> Newline-delimited JSON stream
  │
  └─ ADB Shell Channel (desktop/adbCollector.js)
       ├─ adb shell dumpsys meminfo (UID 2000 / Shell)
       ├─ Extracts true PSS for all OS processes (Chrome, YouTube, System UI)
       └─ Merges into Desktop Dashboard (status: "available")
```

1. **In-App Standalone Telemetry:**
   - Always measures `com.example.memorymonitor` via `Debug.getMemoryInfo()` with full physical PSS accuracy.
   - Discovers installed launchable apps via `PackageManager.queryIntentActivities()` with a 30-second cache to eliminate CPU overhead.
   - Bounded to 20 applications to keep network payloads lightweight over TCP.
   - Declares `QUERY_ALL_PACKAGES` permission in `AndroidManifest.xml` for visibility on Android 11+ (API 30+).
   - Marks third-party apps as `status: "restricted"` with explanation `"Restricted by Android OS (API 29+ security sandboxing)"`.

2. **Desktop ADB-Assisted Collector (`desktop/adbCollector.js`):**
   - Automatically detects connected Android devices via `adb devices`.
   - Runs under Android's `shell` UID (UID 2000), which possesses the `DUMP` permission.
   - Samples `dumpsys meminfo` at conservative 3.5-second intervals.
   - Parses the `Total PSS by process:` table, extracting verified physical PSS memory for every running process and background service.
   - Graceful fallback: If ADB is absent, unauthorized, or disconnected, the desktop server immediately falls back to In-App telemetry with zero crashes or pipeline interruptions.

---

### 8.4 Desktop Dashboard Per-App View
The desktop web interface includes an **APPLICATION MEMORY USAGE** panel featuring:
- **Live Search & Filter:** Filter applications by package name or display label in real time.
- **Dynamic Sorting:**
  - `Memory: High to Low` (places highest RAM consumers at top, restricted apps at bottom)
  - `Memory: Low to High`
  - `Name: A to Z`
- **Source Indicator Badge:** Clearly identifies whether metrics originate from `ADB Shell (Live PSS)` or `In-App Telemetry`.
- **Status Badges:** Distinct visual styles for `Available` (green), `Restricted (OS)` (amber), and `Unavailable` (gray).
- **Empty State:** Clean placeholder when no telemetry has arrived.

---

### 8.5 Verification & Tested Platforms
- **Android Platform Tested:** Android SDK API Level 37 (`compileSdk = 37`, `minSdk = 24`, `targetSdk = 37`).
- **Android Build & Unit Tests:** Gradle 9.5.0, Android Gradle Plugin 9.3.2, Kotlin 2.2.10. Verified with `.\gradlew.bat test`, `.\gradlew.bat check`, and `.\gradlew.bat assembleDebug`.
- **Desktop Runtime Tested:** Node.js v24.15.0 LTS on Windows 11. Verified with `npm test` (15 unit & integration tests covering ADB output parsing, unit conversions, JSON backward compatibility, streaming framing, and dashboard rendering).
- **Physical Device Compatibility:** Designed for USB-tethered Android smartphones with USB Debugging enabled. Fully compatible with standalone Wi-Fi connections via In-App fallback.


---

### 8.6 Android In-App Application Memory View
The Android application provides direct visualization of application memory allocations on the phone screen:
1. **How to Open the Screen:**
   - Tap the **Apps** tab in the top navigation bar (`MemoryMonitorScreen.kt`), or
   - Tap the **View Apps** button located on the Application Memory summary card at the bottom of the System Overview screen.
2. **User Interface Controls:**
   - **Search:** Instant text filter by application display label or package name (e.g. `chrome`, `youtube`).
   - **Sorting:** Dedicated filter chips supporting `Highest RAM`, `Lowest RAM`, and `Name (A-Z)`.
   - **Status Badges:** Distinct visual badges for `Available` (green), `Restricted (OS)` (amber), and `Unavailable` (gray).
   - **Telemetry Banner:** Informs the user that metrics reflect local in-app sandboxed telemetry.
   - **Zero-Fabrication Guarantee:** Missing measurements are explicitly labeled `Restricted (OS)` in amber italics; they are never rendered as 0 MB.

---

### 8.7 Strictly One-Way Telemetry Pipeline (Android $\rightarrow$ Desktop)
1. **Network Architecture:**
   - Communication uses the standard reverse tunnel on `tcp:8080` established by `adb reverse tcp:8080 tcp:8080`.
   - Eliminates the need for auxiliary ports, firewall rules, or reverse socket servers.
2. **Strictly One-Way Streaming Protocol:**
   - **Outbound Stream (Android $\rightarrow$ Desktop Only):** Android collects system RAM/storage metrics and locally accessible process metrics (`Debug.MemoryInfo` for host PSS, `PackageManager` for installed packages with `restricted` status). Android serializes this payload to newline-delimited JSON and pushes it across `127.0.0.1:8080` via `TcpDataSender.send()`.
   - **No Reverse Traffic:** The desktop server functions strictly as an ingestion listener. It does not send reverse telemetry packets, polling requests, or response payloads back across the TCP socket to the phone.
3. **Desktop ADB Role:**
   - The desktop ADB collector (`desktop/adbCollector.js`) operates independently on the host workstation, polling `dumpsys meminfo` via ADB shell UID 2000.
   - ADB-collected process PSS measurements power the desktop browser dashboard and remain strictly on the desktop. They are not transmitted back to the mobile device.
4. **Resilience & Fault Tolerance:**
   - The Android network loop operates asynchronously in coroutine context (`Dispatchers.IO`) with zero blocking on the Compose UI main thread.
   - If the desktop server is closed or the USB connection drops, `TcpDataSender` gracefully catches the socket exception, disconnects, and automatically attempts reconnection on the next sampling cycle without crashing.
