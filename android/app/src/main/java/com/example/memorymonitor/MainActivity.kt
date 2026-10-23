package com.example.memorymonitor

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import com.example.memorymonitor.ui.theme.MemoryMonitorTheme
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

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
        
        setContent {
            MemoryMonitorTheme {
                val lifecycleOwner = LocalLifecycleOwner.current
                val memoryStats by produceState<MemoryStats?>(initialValue = null, lifecycleOwner) {
                    lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
                        Log.i(TAG, "Memory monitor loop STARTED")
                        try {
                            while (true) {
                                val stats = withContext(Dispatchers.IO) {
                                    try {
                                        val currentStats = memoryInfoReader.getMemoryStats()
                                        // One-way outbound transmission to desktop over TCP
                                        val sent = tcpSender.send(currentStats.toJsonString())
                                        if (!sent) {
                                            Log.d(TAG, "Outbound metric transmission returned false (desktop server not reachable)")
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
                
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    MemoryMonitorScreen(
                        memoryStats = memoryStats,
                        modifier = Modifier.padding(innerPadding)
                    )
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.i(TAG, "MainActivity destroyed, closing TCP sender")
        tcpSender.close()
    }
}
