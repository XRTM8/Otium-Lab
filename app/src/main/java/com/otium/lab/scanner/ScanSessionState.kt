package com.otium.lab.scanner

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.util.Log
import android.widget.Toast
import androidx.compose.runtime.*
import com.otium.lab.library.DocumentStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

@Stable
class ScanSessionState(
    private val context: Context,
    private val scope: CoroutineScope,
    private val documentStore: DocumentStore
) {
    var capturedImageBytes by mutableStateOf<ByteArray?>(null)
    val accumulatedPageFiles = mutableStateListOf<File>()
    var isExportingPdf by mutableStateOf(false)
        private set
    var isStagingPage by mutableStateOf(false)
        private set
    var isReviewingBatch by mutableStateOf(false)
        private set
    private var sessionGeneration = 0

    fun clearSession() {
        sessionGeneration++
        val snapshot = accumulatedPageFiles.toList()
        accumulatedPageFiles.clear()
        capturedImageBytes = null
        isReviewingBatch = false
        scope.launch(Dispatchers.IO) {
            snapshot.forEach { runCatching { it.delete() } }
        }
    }

    private fun compressBitmapToBytes(bitmap: Bitmap): ByteArray {
        val stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 92, stream)
        return stream.toByteArray()
    }

    fun addPageAndContinue(bitmap: Bitmap) {
        if (isStagingPage || isExportingPdf) return
        isStagingPage = true
        val generation = sessionGeneration
        scope.launch {
            try {
                val tempFile = withContext(Dispatchers.IO) {
                    val jpegBytes = compressBitmapToBytes(bitmap)
                    val tempDir = File(context.cacheDir, "scan_session").apply { if (!exists()) mkdirs() }
                    File(tempDir, "page_${UUID.randomUUID()}.jpg").also { file ->
                        FileOutputStream(file).use { out -> out.write(jpegBytes) }
                    }
                }
                if (generation == sessionGeneration) {
                    accumulatedPageFiles.add(tempFile)
                    capturedImageBytes = null
                } else tempFile.delete()
            } catch (t: Throwable) {
                Log.e("ScanSession", "Failed to stage scanned page", t)
                Toast.makeText(context, "تعذر حفظ الصفحة المؤقتة", Toast.LENGTH_SHORT).show()
            } finally {
                isStagingPage = false
            }
        }
    }

    fun saveWithLastPage(
        bitmap: Bitmap,
        title: String,
        onExported: (Uri, String) -> Unit
    ) {
        if (isExportingPdf || isStagingPage) return
        isExportingPdf = true
        scope.launch {
            try {
                val tempFile = withContext(Dispatchers.IO) {
                    val jpegBytes = compressBitmapToBytes(bitmap)
                    val tempDir = File(context.cacheDir, "scan_session").apply { if (!exists()) mkdirs() }
                    File(tempDir, "page_${UUID.randomUUID()}.jpg").also { file ->
                        FileOutputStream(file).use { out -> out.write(jpegBytes) }
                    }
                }
                accumulatedPageFiles.add(tempFile)
                capturedImageBytes = null
                exportAccumulatedInternal(customTitle = title, onExported = onExported)
            } catch (t: Throwable) {
                Log.e("ScanSession", "Failed to export scanned PDF", t)
                isExportingPdf = false
                Toast.makeText(context, "تعذر إنشاء ملف الـ PDF: ${t.localizedMessage ?: ""}", Toast.LENGTH_LONG).show()
            }
        }
    }

    fun reviewBatch() {
        if (!isStagingPage && !isExportingPdf && accumulatedPageFiles.isNotEmpty()) {
            isReviewingBatch = true
        }
    }

    fun closeReview() { isReviewingBatch = false }

    fun movePage(from: Int, to: Int) {
        if (from !in accumulatedPageFiles.indices || to !in accumulatedPageFiles.indices) return
        accumulatedPageFiles.add(to, accumulatedPageFiles.removeAt(from))
    }

    fun removePage(index: Int) {
        if (index !in accumulatedPageFiles.indices || isExportingPdf) return
        val file = accumulatedPageFiles.removeAt(index)
        scope.launch(Dispatchers.IO) { file.delete() }
        if (accumulatedPageFiles.isEmpty()) isReviewingBatch = false
    }

    fun saveBatch(title: String, onExported: (Uri, String) -> Unit) {
        if (isExportingPdf || isStagingPage || accumulatedPageFiles.isEmpty()) return
        isExportingPdf = true
        scope.launch {
            try {
                exportAccumulatedInternal(customTitle = title, onExported = onExported)
                isReviewingBatch = false
            } catch (t: Throwable) {
                Log.e("ScanSession", "Failed to export batch PDF", t)
                isExportingPdf = false
                Toast.makeText(context, "تعذر تصدير المستند: ${t.localizedMessage ?: ""}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private suspend fun exportAccumulatedInternal(
        customTitle: String?,
        onExported: (Uri, String) -> Unit
    ) {
        val filesSnapshot = accumulatedPageFiles.toList()
        val (file, uri) = withContext(Dispatchers.IO) {
            val exported = PdfExporter.exportImageFilesToPdf(context, filesSnapshot, customTitle = customTitle)
            val fileUri = Uri.fromFile(exported)
            documentStore.addOrUpdateDocument(fileUri, exported.nameWithoutExtension, isScanned = true)
            filesSnapshot.forEach { it.delete() }
            exported to fileUri
        }
        accumulatedPageFiles.clear()
        isExportingPdf = false
        onExported(uri, file.nameWithoutExtension)
    }
}
