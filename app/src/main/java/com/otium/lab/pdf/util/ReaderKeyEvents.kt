package com.otium.lab.pdf.util

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect

object ReaderKeyEvents {
    var onNextPage: (() -> Unit)? = null
    var onPrevPage: (() -> Unit)? = null
}

@Composable
fun BindReaderVolumeKeys(
    enabled: Boolean,
    currentPage: Int,
    pageCount: Int,
    onNext: () -> Unit,
    onPrev: () -> Unit
) {
    DisposableEffect(enabled, currentPage, pageCount) {
        if (enabled) {
            ReaderKeyEvents.onNextPage = { if (currentPage < pageCount) onNext() }
            ReaderKeyEvents.onPrevPage = { if (currentPage > 1) onPrev() }
        }
        onDispose {
            ReaderKeyEvents.onNextPage = null
            ReaderKeyEvents.onPrevPage = null
        }
    }
}
