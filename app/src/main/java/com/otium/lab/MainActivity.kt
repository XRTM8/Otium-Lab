package com.otium.lab

import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.otium.lab.ui.OtiumApp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        enableHighRefreshRate()
        setContent {
            OtiumApp()
        }
    }

    private fun enableHighRefreshRate() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                window.attributes = window.attributes.apply {
                    preferredRefreshRate = 120f
                }
                display?.let { disp ->
                    val maxMode = disp.supportedModes.maxByOrNull { it.refreshRate }
                    if (maxMode != null && maxMode.refreshRate >= 90f) {
                        window.attributes = window.attributes.apply {
                            preferredDisplayModeId = maxMode.modeId
                        }
                    }
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                @Suppress("DEPRECATION")
                val display = windowManager.defaultDisplay
                val maxMode = display?.supportedModes?.maxByOrNull { it.refreshRate }
                if (maxMode != null && maxMode.refreshRate >= 90f) {
                    window.attributes = window.attributes.apply {
                        preferredDisplayModeId = maxMode.modeId
                    }
                }
            }
        } catch (_: Exception) {}
    }
}
