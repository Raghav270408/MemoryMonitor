package com.example.memorymonitor

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.BufferedWriter
import java.io.IOException
import java.io.OutputStreamWriter
import java.net.InetSocketAddress
import java.net.Socket
import java.nio.charset.StandardCharsets

/**
 * Handles persistent TCP connection and message transmission to the desktop server.
 * Connects to 127.0.0.1 on the specified port (forwarded via ADB over USB).
 *
 * All network operations are executed on Dispatchers.IO.
 * Messages are delimited by newline (\n).
 */
class TcpDataSender(
    private val host: String = "127.0.0.1",
    private val port: Int = 8080,
    private val connectTimeoutMs: Int = 2000
) : AutoCloseable {

    companion object {
        private const val TAG = "TcpDataSender"
    }

    private val mutex = Mutex()
    private var socket: Socket? = null
    private var writer: BufferedWriter? = null

    private var transmitCount = 0L

    /**
     * Sends a newline-delimited JSON payload to the desktop server.
     * Re-establishes connection automatically if disconnected or on failure.
     * Returns true if sent successfully, false otherwise.
     */
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
                // Connection failed, broken pipe, or timeout. Reset socket so next send reconnects.
                Log.w(TAG, "Transmission failed to $host:$port: ${e.javaClass.simpleName}: ${e.message}")
                disconnectInternal()
                false
            }
        }
    }

    /**
     * Ensures an active, connected socket. If not connected or closed, attempts connection.
     */
    private fun ensureConnected() {
        val s = socket
        if (s == null || s.isClosed || !s.isConnected) {
            disconnectInternal()
            Log.d(TAG, "Attempting connection to desktop server at $host:$port (timeout: ${connectTimeoutMs}ms)...")
            val newSocket = Socket()
            newSocket.tcpNoDelay = true
            newSocket.connect(InetSocketAddress(host, port), connectTimeoutMs)
            socket = newSocket
            writer = BufferedWriter(OutputStreamWriter(newSocket.getOutputStream(), StandardCharsets.UTF_8))
            Log.i(TAG, "Connected to desktop server at $host:$port")
        }
    }

    /**
     * Closes socket and writer.
     */
    private fun disconnectInternal() {
        try {
            writer?.close()
        } catch (_: Exception) {}
        try {
            socket?.close()
        } catch (_: Exception) {}
        if (socket != null || writer != null) {
            Log.d(TAG, "Socket closed and reset to null")
        }
        writer = null
        socket = null
    }

    /**
     * Lifecycle-safe cleanup.
     */
    override fun close() {
        Log.i(TAG, "close() requested")
        disconnectInternal()
    }
}
