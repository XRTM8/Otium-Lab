package com.otium.lab.library

import android.net.Uri

data class StoredDocument(
    val uriString: String,
    val title: String,
    val isScanned: Boolean,
    val timestamp: Long,
    val lastPage: Int = 1,
    val totalPages: Int = 0,
    val scrollOffset: Int = 0
) {
    val uri: Uri get() = Uri.parse(uriString)
}
