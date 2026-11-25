package com.otium.lab.scanner

import android.net.Uri
import androidx.compose.runtime.Composable

@Composable
fun ScannerRouteScreen(
    useNativeScanner: Boolean,
    pageCount: Int,
    onPagesCaptured: (List<Uri>) -> Unit,
    onFallback: () -> Unit,
    onCancel: () -> Unit,
    onImageCaptured: (ByteArray) -> Unit,
    onFinishBatch: () -> Unit,
    onClose: () -> Unit
) {
    if (useNativeScanner) {
        CameraScannerScreen(pageCount, onImageCaptured, onFinishBatch, onClose)
    } else {
        GmsScannerScreen(onPagesCaptured, onFallback, onCancel)
    }
}
