package com.otium.lab

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.otium.lab.library.DocumentStore
import com.otium.lab.ui.OtiumApp

class MainActivity : ComponentActivity() {

    private var incomingPdfUri by mutableStateOf<Uri?>(null)
    private var incomingPdfTitle by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleIntent(intent)
        setContent {
            OtiumApp(
                initialPdfUri = incomingPdfUri,
                initialPdfTitle = incomingPdfTitle
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val uri = intent?.data ?: return
        try {
            if (uri.scheme == "content") {
                contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        } catch (_: Exception) {}
        incomingPdfTitle = DocumentStore.resolveDisplayName(this, uri)
        incomingPdfUri = uri
    }

    override fun onKeyDown(keyCode: Int, event: android.view.KeyEvent?): Boolean {
        if (keyCode == android.view.KeyEvent.KEYCODE_VOLUME_DOWN && com.otium.lab.pdf.util.ReaderKeyEvents.onNextPage != null) {
            com.otium.lab.pdf.util.ReaderKeyEvents.onNextPage?.invoke()
            return true
        }
        if (keyCode == android.view.KeyEvent.KEYCODE_VOLUME_UP && com.otium.lab.pdf.util.ReaderKeyEvents.onPrevPage != null) {
            com.otium.lab.pdf.util.ReaderKeyEvents.onPrevPage?.invoke()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }
}
