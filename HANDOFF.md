# Memory Monitor - Project Handoff

## 1. Project Overview

Memory Monitor is an Android + JavaFX system monitoring application.

The Android application monitors RAM and internal storage on an Android device.

The desktop application will receive the monitoring data from Android over the local network using TCP sockets and display it through a JavaFX dashboard.

The project is intended to demonstrate practical Mobile/Operating System concepts such as:

- Main memory monitoring
- Memory availability and utilization
- Low-memory system state
- Process-level memory usage
- Persistent storage monitoring
- Inter-device communication
- JSON data exchange
- TCP sockets
- Desktop visualization using JavaFX

---

## 2. Project Structure

```text
MemoryMonitor/
├── android/       # Android application
├── desktop/       # JavaFX desktop application
└── HANDOFF.md     # Project handoff and integration specification
```

The Android side is being completed first.

The desktop and communication portions will be implemented separately after the Android application is finalized.

---

## 3. Technology Stack

### Android

- Android Studio
- Kotlin
- Android SDK
- Jetpack Compose
- Material 3
- Standard Android system APIs

### Desktop

- Java
- JavaFX
- Gradle
- IntelliJ IDEA

### Communication

- TCP sockets
- JSON

### JSON Library

Use Jackson for JSON serialization/deserialization.

Do not manually parse JSON strings.

---

## 4. Android Application Status

The Android application is the source of the monitoring data.

The Android application currently monitors two categories:

1. RAM
2. Internal Storage

The Android application should remain simple and should not be expanded into a general-purpose phone diagnostics application.

---

## 5. Final Android Feature Scope

### RAM Monitor

The Android application displays:

- Total RAM
- Used RAM
- Available RAM
- RAM Usage Percentage
- Memory Pressure
- System Memory Status
- This App Memory Usage

### RAM Usage

Use Android's:

```text
ActivityManager.MemoryInfo
```

Relevant values:

```text
totalMem
availMem
lowMemory
threshold
```

Calculate:

```text
used RAM = total RAM - available RAM
```

and:

```text
usage percentage = used RAM / total RAM × 100
```

### Memory Pressure

Memory Pressure is an application-defined classification based on RAM usage percentage.

Use:

```text
Below 60%        → Normal
60% to <80%      → Moderate
80% and above    → High
```

Important:

This is a classification created by the application.

It is NOT an official Android memory-pressure API value.

### System Memory Status

Use:

```text
ActivityManager.MemoryInfo.lowMemory
```

Display:

```text
false → Normal
true  → Low Memory
```

### This App Memory Usage

Display the memory currently used by the Memory Monitor application/process.

Use a standard Android API such as:

```text
Debug.MemoryInfo
Debug.getMemoryInfo()
```

Do not confuse this value with total device RAM usage.

---

## 6. Storage Monitor

The Android application also monitors internal device storage.

Display:

- Total Storage
- Used Storage
- Available/Free Storage
- Storage Usage Percentage

Use Android's:

```text
StatFs
```

Use the appropriate internal storage/filesystem path.

Calculate:

```text
used storage = total storage - available storage
```

and:

```text
storage usage percentage = used storage / total storage × 100
```

Display storage values using readable units such as:

- MB
- GB

The Storage Monitor section should use the Google/Material `Storage` icon.

Do not use a SIM card icon or a custom replacement icon.

---

## 7. Android UI

The Android UI should remain simple and clean.

The RAM section contains a large circular usage indicator.

The RAM percentage must appear physically inside the circular indicator.

Example:

```text
        ┌─────────────┐
      /                 \
     |       68%         |
     |     RAM Used      |
      \                 /
        └─────────────┘
```

The RAM section should show:

- Used RAM
- Available RAM
- Total RAM
- Memory Pressure
- System Memory Status
- This App Memory Usage

The Storage section should show:

- Storage Usage
- Used Storage
- Available Storage
- Total Storage

The UI should use:

- Jetpack Compose
- Material 3
- Google/Material icons

Avoid:

- Gradients
- Glassmorphism
- Excessive shadows
- Excessive cards
- Decorative animations
- Complex charts
- Unnecessary screens
- Navigation
- Settings screens

The application should remain easy to understand and explain in a college viva.

---

## 8. Android Live Monitoring

The Android application updates monitoring information approximately once per second.

The following should update:

- RAM values
- RAM usage percentage
- Memory Pressure
- System Memory Status
- This App Memory Usage
- Storage values

Do not display unnecessary text such as:

```text
Monitoring Active
Updates every second
```

The monitoring should happen without cluttering the UI.

---

## 9. Android Preview

The existing Compose Preview should remain available.

The preview should use realistic sample/mock values.

It must NOT depend on actual device APIs.

The preview should demonstrate:

- RAM usage
- Used RAM
- Available RAM
- Total RAM
- Memory Pressure
- System Memory Status
- This App Memory Usage
- Storage usage
- Used Storage
- Available Storage
- Total Storage

The preview should remain clearly named:

```text
MemoryMonitorScreenPreview()
```

---

## 10. Features Intentionally NOT Included

The following features are NOT part of the final Android scope:

- Process Importance
- Low Memory Threshold
- CPU monitoring
- Battery monitoring
- Thermal monitoring
- Network monitoring
- Per-app RAM monitoring
- Installed-app scanning
- Process lists
- Historical graphs
- Notifications
- Background monitoring services
- Storage cleanup
- File browser
- SD card management
- Cloud services

Do not add these features unless the project scope is explicitly changed.

In particular, do NOT attempt to monitor the RAM usage of arbitrary other Android applications.

Modern Android versions restrict ordinary applications from freely inspecting other applications' detailed memory usage.

---

## 11. Android APIs Used

Expected Android APIs include:

```text
ActivityManager.MemoryInfo
StatFs
Debug.MemoryInfo
Debug.getMemoryInfo()
```

Use standard Android APIs wherever possible.

Do not add third-party monitoring libraries.

---

## 12. Desktop Development Requirements

The desktop application will be implemented using:

```text
Java
JavaFX
Gradle
TCP Sockets
Jackson
```

### Required Software

The desktop developer should have:

- JDK 25.0.1 LTS or another compatible JDK
- IntelliJ IDEA
- Git

A global Gradle installation is NOT required if the project uses the Gradle Wrapper.

The project should use the Gradle Wrapper.

### Optional Tool

Gluon Scene Builder may be used for JavaFX/FXML development.

It is optional.

The JavaFX UI can also be created directly in Java without FXML.

---

## 13. Desktop Application Responsibilities

The desktop application is responsible for:

1. Starting a TCP server/listener.
2. Waiting for the Android device to connect.
3. Receiving JSON monitoring data.
4. Deserializing the JSON using Jackson.
5. Converting the received data into simple Java model objects.
6. Updating the JavaFX dashboard.
7. Showing connection status.
8. Handling connection loss without crashing.
9. Allowing another connection when appropriate.

The desktop application should NOT independently attempt to obtain Android device RAM/storage information.

Android is the source of the Android device monitoring data.

---

## 14. Recommended Desktop Architecture

The architecture should remain simple:

```text
Android APIs
     ↓
Android monitoring data
     ↓
JSON
     ↓
TCP Socket
     ↓
Desktop TCP Listener
     ↓
Jackson JSON Parsing
     ↓
Java Data Model
     ↓
JavaFX Dashboard
```

JSON is the data format.

TCP is the transport mechanism.

They are complementary and should not be treated as alternatives.

---

## 15. Desktop Dashboard

The JavaFX dashboard should display the same main categories as the Android application.

### RAM

Display:

- RAM Usage Percentage
- Used RAM
- Available RAM
- Total RAM
- Memory Pressure
- System Memory Status
- Android App Memory Usage

### Storage

Display:

- Storage Usage Percentage
- Used Storage
- Available Storage
- Total Storage

The desktop UI does not need to copy the Android UI exactly.

It should simply provide a clean desktop representation of the same monitoring information.

---

## 16. Recommended Desktop Layout

A simple layout could be:

```text
┌──────────────────────────────────────────────┐
│              MEMORY MONITOR                  │
│          Android Device: Connected           │
├──────────────────────────────────────────────┤
│                                              │
│                 RAM USAGE                    │
│                                              │
│                   68%                        │
│                 RAM Used                     │
│                                              │
│       Used              Available            │
│       4.1 GB              1.9 GB             │
│                                              │
│              Total RAM: 6 GB                 │
│                                              │
│        Memory Pressure: Moderate             │
│        System Status: Normal                 │
│        This App: 42 MB                       │
│                                              │
├──────────────────────────────────────────────┤
│                  STORAGE                     │
│                                              │
│                 36% Used                     │
│                                              │
│              92 GB / 256 GB                  │
│                                              │
│       Used: 92 GB      Free: 164 GB          │
│                                              │
└──────────────────────────────────────────────┘
```

The exact UI can differ as long as it remains clean and consistent with the project.

---

## 17. JSON Contract

The Android and desktop implementations must agree on the JSON structure before TCP integration.

Recommended structure:

```json
{
  "ram": {
    "totalBytes": 6442450944,
    "usedBytes": 4294967296,
    "availableBytes": 2147483648,
    "usagePercentage": 66.67,
    "memoryPressure": "Moderate",
    "systemMemoryStatus": "Normal",
    "appMemoryBytes": 44040192
  },
  "storage": {
    "totalBytes": 274877906944,
    "usedBytes": 98784247808,
    "availableBytes": 176093659136,
    "usagePercentage": 35.94
  }
}
```

### Important

Prefer sending raw numeric values in bytes.

For example:

```text
totalBytes
usedBytes
availableBytes
appMemoryBytes
```

Do NOT send values such as:

```text
"4.1 GB"
"1.9 GB"
```

as the primary data values.

The desktop application should perform its own formatting.

This keeps the communication layer independent of the UI.

Percentages can be sent as numeric values.

Strings such as:

```text
"Moderate"
"Normal"
"Low Memory"
```

can be sent directly.

---

## 18. Communication Requirements

Use:

```text
TCP sockets
```

for Android ↔ desktop communication.

Do NOT use:

- REST APIs
- HTTP servers
- WebSockets
- Firebase
- Cloud services
- Databases
- Authentication systems

The communication should occur over the local network.

The Android device and desktop computer should be connected to the same local network for the initial implementation.

---

## 19. Recommended Development Order

Do NOT implement everything simultaneously.

Follow this order:

### Step 1: JavaFX Skeleton

Create:

```text
JavaFX window
        ↓
Dashboard layout
        ↓
Static/sample RAM data
        ↓
Static/sample storage data
```

First verify that the JavaFX desktop application works.

### Step 2: Data Model

Create simple Java classes representing:

- RAM data
- Storage data

### Step 3: JSON

Use Jackson to deserialize sample JSON into the Java data model.

Test JSON parsing independently.

### Step 4: TCP

Create the TCP server/listener.

Test Android-to-desktop communication using sample JSON first.

### Step 5: Integration

Connect the real Android monitoring data to the TCP layer.

Then:

```text
Android
  ↓
Real monitoring data
  ↓
JSON
  ↓
TCP
  ↓
JavaFX
```

### Step 6: Connection Handling

Handle:

- Android disconnecting
- Desktop waiting for a connection
- Invalid/incomplete data
- Connection errors

The application should not crash simply because the phone disconnects.

### Step 7: Final Testing

Test the complete system on:

- Android physical device
- Desktop computer
- Same local network

---

## 20. Handoff Boundary

### Android Developer

Responsible for:

- Android application
- RAM monitoring
- Storage monitoring
- Android UI
- Compose Preview
- Android data model
- Android-side testing

### Desktop Developer

Responsible for:

- JavaFX application
- Desktop dashboard
- TCP server/listener
- JSON serialization/deserialization
- Jackson integration
- Desktop data model
- Connection handling
- Android ↔ desktop integration
- Final end-to-end testing

The Android implementation should remain stable while the desktop and communication layers are developed.

---

## 21. Important Project Constraints

Keep the entire project simple and explainable.

Avoid unnecessary:

- Design patterns
- Abstraction layers
- Dependency injection
- Repositories
- Use-case layers
- Third-party monitoring libraries
- Cloud infrastructure
- Databases
- Complex concurrency
- Complex networking frameworks

The project should demonstrate the concepts clearly rather than hiding them behind excessive architecture.

---

## 22. Current Android Completion Criteria

The Android portion can be considered complete when:

- RAM monitoring works
- Storage monitoring works
- RAM values update approximately every second
- Storage values are correct
- Memory Pressure works
- System Memory Status works
- This App Memory Usage works
- Circular RAM percentage is displayed inside the indicator
- Storage uses the Material Storage icon
- Compose Preview works
- Launcher icon is correct
- The application builds successfully
- The application runs correctly on a physical Android device
- No unnecessary permissions or dependencies were introduced

---

## 23. Final Project Goal

The completed project should demonstrate:

```text
Android Device
      │
      │ Monitor RAM + Storage
      │
      ▼
Android Application
      │
      │ JSON over TCP
      │
      ▼
JavaFX Desktop Application
      │
      ▼
Desktop Monitoring Dashboard
```

The purpose is to demonstrate Android resource monitoring combined with practical client-server communication and desktop visualization.

Keep the implementation focused, understandable, and reliable.
