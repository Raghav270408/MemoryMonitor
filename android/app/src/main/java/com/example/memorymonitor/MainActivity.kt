package com.example.memorymonitor

import android.os.Bundle
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
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        
        val memoryInfoReader = MemoryInfoReader(this)
        
        setContent {
            MemoryMonitorTheme {
                val lifecycleOwner = LocalLifecycleOwner.current
                val memoryStats by produceState<MemoryStats?>(initialValue = null, lifecycleOwner) {
                    lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
                        while (true) {
                            try {
                                value = memoryInfoReader.getMemoryStats()
                            } catch (e: Exception) {
                                // Ignore exceptions to prevent crashing if memory values cannot be obtained temporarily
                                value = null
                            }
                            delay(1000)
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
}