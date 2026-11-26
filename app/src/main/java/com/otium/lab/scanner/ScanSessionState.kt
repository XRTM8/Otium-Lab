package com.otium.lab.scanner

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.util.Log
import android.widget.Toast
import androidx.compose.runtime.*
import com.otium.lab.library.DocumentStore
import com.otium.lab.scanner.model.ScanFilter
import com.otium.lab.scanner.util.DocumentEdgeDetector
import com.otium.lab.scanner.util.ImageProcessingUtils
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uniffi.otium_bridge.CornerPoints
import uniffi.otium_bridge.bridgeApplyScanFilter
import uniffi.otium_bridge.bridgeWarpAndFilter
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
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
    private val rawOriginals = mutableMapOf<String, File>()

    fun clearSession() {
        sessionGeneration++
        val snapshot = accumulatedPageFiles.toList()
        val rawSnapshot = rawOriginals.values.toList()
        accumulatedPageFiles.clear()
        rawOriginals.clear()
        capturedImageBytes = null
        isReviewingBatch = false
        scope.launch(Dispatchers.IO) {
            snapshot.forEach { runCatching { it.delete() } }
            rawSnapshot.forEach { runCatching { it.delete() } }
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

    fun quickProcessAndStagePage(rawBytes: ByteArray, defaultFilter: ScanFilter = ScanFilter.MAGIC_COLOR) {
        val generation = sessionGeneration
        isStagingPage = true
        scope.launch {
            try {
                val (processedFile, rawFile) = withContext(Dispatchers.Default) {
                    val dims = ImageProcessingUtils.imageDimensions(rawBytes)
                    val detection = DocumentEdgeDetector.detectBytes(rawBytes)
                    val processedBytes = if (detection != null && dims != null) {
                        val q = detection.quad
                        val corners = CornerPoints(
                            topLeftX = q.topLeft.x * dims.first,
                            topLeftY = q.topLeft.y * dims.second,
                            topRightX = q.topRight.x * dims.first,
                            topRightY = q.topRight.y * dims.second,
                            bottomRightX = q.bottomRight.x * dims.first,
                            bottomRightY = q.bottomRight.y * dims.second,
                            bottomLeftX = q.bottomLeft.x * dims.first,
                            bottomLeftY = q.bottomLeft.y * dims.second
                        )
                        runCatching { bridgeWarpAndFilter(rawBytes, corners, defaultFilter.mode) }
                            .getOrElse { ImageProcessingUtils.applyFallbackFilter(rawBytes, defaultFilter) }
                    } else {
                        runCatching { bridgeApplyScanFilter(rawBytes, defaultFilter.mode) }
                            .getOrElse { ImageProcessingUtils.applyFallbackFilter(rawBytes, defaultFilter) }
                    }
                    withContext(Dispatchers.IO) {
                        val tempDir = File(context.cacheDir, "scan_session").apply { if (!exists()) mkdirs() }
                        val pFile = File(tempDir, "page_${UUID.randomUUID()}.jpg").also { f ->
                            FileOutputStream(f).use { it.write(processedBytes) }
                        }
                        val rFile = File(tempDir, "raw_${UUID.randomUUID()}.jpg").also { f ->
                            FileOutputStream(f).use { it.write(rawBytes) }
                        }
                        pFile to rFile
                    }
                }
                if (generation == sessionGeneration) {
                    rawOriginals[processedFile.absolutePath] = rawFile
                    accumulatedPageFiles.add(processedFile)
                } else {
                    processedFile.delete()
                    rawFile.delete()
                }
            } catch (t: Throwable) {
                Log.e("ScanSession", "Failed to quick-process page", t)
                Toast.makeText(context, "تعذر معالجة الصفحة", Toast.LENGTH_SHORT).show()
            } finally {
                isStagingPage = false
            }
        }
    }

    fun applyFilterToAllPages(filter: ScanFilter) {
        if (accumulatedPageFiles.isEmpty() || isStagingPage || isExportingPdf) return
        val generation = sessionGeneration
        isStagingPage = true
        val snapshot = accumulatedPageFiles.toList()
        scope.launch {
            try {
                val updated = withContext(Dispatchers.Default) {
                    val tempDir = File(context.cacheDir, "scan_session").apply { if (!exists()) mkdirs() }
                    snapshot.map { currentFile ->
                        val sourceFile = rawOriginals[currentFile.absolutePath]?.takeIf { it.exists() } ?: currentFile
                        val sourceBytes = sourceFile.readBytes()
                        val dims = ImageProcessingUtils.imageDimensions(sourceBytes)
                        val detection = if (sourceFile !== currentFile) DocumentEdgeDetector.detectBytes(sourceBytes) else null
                        val outBytes = if (detection != null && dims != null) {
                            val q = detection.quad
                            val corners = CornerPoints(
                                topLeftX = q.topLeft.x * dims.first,
                                topLeftY = q.topLeft.y * dims.second,
                                topRightX = q.topRight.x * dims.first,
                                topRightY = q.topRight.y * dims.second,
                                bottomRightX = q.bottomRight.x * dims.first,
                                bottomRightY = q.bottomRight.y * dims.second,
                                bottomLeftX = q.bottomLeft.x * dims.first,
                                bottomLeftY = q.bottomLeft.y * dims.second
                            )
                            runCatching { bridgeWarpAndFilter(sourceBytes, corners, filter.mode) }
                                .getOrElse { ImageProcessingUtils.applyFallbackFilter(sourceBytes, filter) }
                        } else {
                            runCatching { bridgeApplyScanFilter(sourceBytes, filter.mode) }
                                .getOrElse { ImageProcessingUtils.applyFallbackFilter(sourceBytes, filter) }
                        }
                        val nextFile = File(tempDir, "page_${UUID.randomUUID()}.jpg")
                        FileOutputStream(nextFile).use { it.write(outBytes) }
                        Triple(currentFile, nextFile, rawOriginals[currentFile.absolutePath])
                    }
                }
                if (generation == sessionGeneration) {
                    accumulatedPageFiles.clear()
                    updated.forEach { (oldFile, newFile, rawFile) ->
                        if (rawFile != null) {
                            rawOriginals.remove(oldFile.absolutePath)
                            rawOriginals[newFile.absolutePath] = rawFile
                        }
                        oldFile.delete()
                        accumulatedPageFiles.add(newFile)
                    }
                } else {
                    updated.forEach { (_, newFile, _) -> newFile.delete() }
                }
            } catch (t: Throwable) {
                Log.e("ScanSession", "Failed to apply filter to batch", t)
                Toast.makeText(context, "تعذر تطبيق الفلتر", Toast.LENGTH_SHORT).show()
            } finally {
                isStagingPage = false
            }
        }
    }

    fun reviewBatch() {
        if (!isStagingPage && !isExportingPdf && accumulatedPageFiles.isNotEmpty()) {
            isReviewingBatch = true
        }
    }

    fun importProcessedPages(pageUris: List<Uri>, onFailure: () -> Unit) {
        if (pageUris.isEmpty() || isStagingPage || isExportingPdf) return
        isStagingPage = true
        val generation = sessionGeneration
        scope.launch {
            val staged = mutableListOf<File>()
            try {
                withContext(Dispatchers.IO) {
                    val tempDir = File(context.cacheDir, "scan_session").apply { mkdirs() }
                    for (uri in pageUris) {
                        val file = File(tempDir, "page_${UUID.randomUUID()}.jpg")
                        staged.add(file)
                        context.contentResolver.openInputStream(uri)?.use { input ->
                            FileOutputStream(file).use { output -> input.copyTo(output) }
                        } ?: throw IOException("تعذر قراءة إحدى الصفحات")
                    }
                }
                if (generation == sessionGeneration) {
                    accumulatedPageFiles.addAll(staged)
                    isReviewingBatch = true
                } else staged.forEach { it.delete() }
            } catch (t: Throwable) {
                withContext(Dispatchers.IO) { staged.forEach { it.delete() } }
                Log.e("ScanSession", "Failed to import scanned pages", t)
                Toast.makeText(context, "تعذر استيراد الصفحات: ${t.localizedMessage ?: ""}", Toast.LENGTH_LONG).show()
                onFailure()
            } finally {
                isStagingPage = false
            }
        }
    }

    fun closeReview() { isReviewingBatch = false }

    fun movePage(from: Int, to: Int) {
        if (from !in accumulatedPageFiles.indices || to !in accumulatedPageFiles.indices) return
        accumulatedPageFiles.add(to, accumulatedPageFiles.removeAt(from))
    }

    fun rotatePage(index: Int) {
        if (index !in accumulatedPageFiles.indices || isStagingPage || isExportingPdf) return
        val file = accumulatedPageFiles[index]
        isStagingPage = true
        scope.launch {
            try {
                val rotatedFile = withContext(Dispatchers.IO) {
                    val raw = file.readBytes()
                    val rotatedBytes = com.otium.lab.scanner.util.ImageProcessingUtils.rotateJpegBytes90Cw(raw)
                        ?: return@withContext null
                    val nextFile = File(file.parentFile, "page_${UUID.randomUUID()}.jpg")
                    FileOutputStream(nextFile).use { it.write(rotatedBytes) }
                    file.delete()
                    nextFile
                }
                if (rotatedFile != null && index in accumulatedPageFiles.indices) {
                    accumulatedPageFiles[index] = rotatedFile
                }
            } catch (t: Throwable) {
                Log.e("ScanSession", "Failed to rotate page", t)
                Toast.makeText(context, "تعذر تدوير الصفحة", Toast.LENGTH_SHORT).show()
            } finally {
                isStagingPage = false
            }
        }
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
