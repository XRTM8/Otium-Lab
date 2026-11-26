package com.otium.lab.scanner

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Rect
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
import uniffi.otium_bridge.bridgeDeskewAndClean
import uniffi.otium_bridge.bridgeDewarpBook
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
    var editingPageIndex by mutableStateOf<Int?>(null)
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
        editingPageIndex = null
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
        val replaceIdx = editingPageIndex
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
                    if (replaceIdx != null && replaceIdx in accumulatedPageFiles.indices) {
                        val old = accumulatedPageFiles[replaceIdx]
                        rawOriginals[old.absolutePath]?.let { raw ->
                            rawOriginals.remove(old.absolutePath)
                            rawOriginals[tempFile.absolutePath] = raw
                        }
                        old.delete()
                        accumulatedPageFiles[replaceIdx] = tempFile
                        editingPageIndex = null
                        capturedImageBytes = null
                        isReviewingBatch = true
                    } else {
                        accumulatedPageFiles.add(tempFile)
                        capturedImageBytes = null
                    }
                } else tempFile.delete()
            } catch (t: Throwable) {
                Log.e("ScanSession", "Failed to stage scanned page", t)
                Toast.makeText(context, "تعذر حفظ الصفحة المؤقتة", Toast.LENGTH_SHORT).show()
            } finally {
                isStagingPage = false
            }
        }
    }

    fun startReEditPage(index: Int) {
        if (index !in accumulatedPageFiles.indices || isStagingPage || isExportingPdf) return
        val currentFile = accumulatedPageFiles[index]
        val sourceFile = rawOriginals[currentFile.absolutePath]?.takeIf { it.exists() } ?: currentFile
        scope.launch {
            val bytes = withContext(Dispatchers.IO) { runCatching { sourceFile.readBytes() }.getOrNull() }
            if (bytes != null) {
                editingPageIndex = index
                isReviewingBatch = false
                capturedImageBytes = bytes
            } else {
                Toast.makeText(context, "تعذر قراءة الصفحة للتعديل", Toast.LENGTH_SHORT).show()
            }
        }
    }

    fun cancelCropOrEdit() {
        if (isStagingPage) return
        capturedImageBytes = null
        if (editingPageIndex != null) {
            editingPageIndex = null
            if (accumulatedPageFiles.isNotEmpty()) isReviewingBatch = true
        }
    }

    fun importGalleryImages(uris: List<Uri>) {
        if (uris.isEmpty() || isStagingPage || isExportingPdf) return
        if (uris.size == 1) {
            scope.launch(Dispatchers.IO) {
                val processed = ImageProcessingUtils.processUriImage(context, uris.first())
                if (processed != null) withContext(Dispatchers.Main) { capturedImageBytes = processed }
            }
            return
        }
        val generation = sessionGeneration
        isStagingPage = true
        scope.launch {
            try {
                val staged = withContext(Dispatchers.Default) {
                    val tempDir = File(context.cacheDir, "scan_session").apply { if (!exists()) mkdirs() }
                    uris.mapNotNull { uri ->
                        val raw = ImageProcessingUtils.processUriImage(context, uri) ?: return@mapNotNull null
                        val dims = ImageProcessingUtils.imageDimensions(raw)
                        val det = DocumentEdgeDetector.detectBytes(raw)
                        val outBytes = if (det != null && dims != null) {
                            val q = det.quad
                            val corners = CornerPoints(
                                q.topLeft.x * dims.first, q.topLeft.y * dims.second,
                                q.topRight.x * dims.first, q.topRight.y * dims.second,
                                q.bottomRight.x * dims.first, q.bottomRight.y * dims.second,
                                q.bottomLeft.x * dims.first, q.bottomLeft.y * dims.second
                            )
                            runCatching { bridgeWarpAndFilter(raw, corners, ScanFilter.MAGIC_COLOR.mode) }
                                .getOrElse { ImageProcessingUtils.applyFallbackFilter(raw, ScanFilter.MAGIC_COLOR) }
                        } else {
                            runCatching { bridgeApplyScanFilter(raw, ScanFilter.MAGIC_COLOR.mode) }
                                .getOrElse { ImageProcessingUtils.applyFallbackFilter(raw, ScanFilter.MAGIC_COLOR) }
                        }
                        val pFile = File(tempDir, "page_${UUID.randomUUID()}.jpg").also { f ->
                            FileOutputStream(f).use { it.write(outBytes) }
                        }
                        val rFile = File(tempDir, "raw_${UUID.randomUUID()}.jpg").also { f ->
                            FileOutputStream(f).use { it.write(raw) }
                        }
                        pFile to rFile
                    }
                }
                if (generation == sessionGeneration && staged.isNotEmpty()) {
                    staged.forEach { (p, r) ->
                        rawOriginals[p.absolutePath] = r
                        accumulatedPageFiles.add(p)
                    }
                    isReviewingBatch = true
                } else {
                    staged.forEach { (p, r) -> p.delete(); r.delete() }
                }
            } catch (t: Throwable) {
                Log.e("ScanSession", "Failed multi-gallery import", t)
                Toast.makeText(context, "تعذر استيراد الصور", Toast.LENGTH_SHORT).show()
            } finally {
                isStagingPage = false
            }
        }
    }

    fun stitchIdCardAndStage(frontBytes: ByteArray, backBytes: ByteArray) {
        if (isStagingPage || isExportingPdf) return
        val generation = sessionGeneration
        isStagingPage = true
        scope.launch {
            try {
                val stagedFile = withContext(Dispatchers.Default) {
                    fun processSide(raw: ByteArray): Bitmap? {
                        val dims = ImageProcessingUtils.imageDimensions(raw)
                        val det = DocumentEdgeDetector.detectBytes(raw)
                        val processed = if (det != null && dims != null) {
                            val q = det.quad
                            val corners = CornerPoints(
                                q.topLeft.x * dims.first, q.topLeft.y * dims.second,
                                q.topRight.x * dims.first, q.topRight.y * dims.second,
                                q.bottomRight.x * dims.first, q.bottomRight.y * dims.second,
                                q.bottomLeft.x * dims.first, q.bottomLeft.y * dims.second
                            )
                            runCatching { bridgeWarpAndFilter(raw, corners, ScanFilter.MAGIC_COLOR.mode) }
                                .getOrElse { ImageProcessingUtils.applyFallbackFilter(raw, ScanFilter.MAGIC_COLOR) }
                        } else {
                            runCatching { bridgeApplyScanFilter(raw, ScanFilter.MAGIC_COLOR.mode) }
                                .getOrElse { ImageProcessingUtils.applyFallbackFilter(raw, ScanFilter.MAGIC_COLOR) }
                        }
                        return BitmapFactory.decodeByteArray(processed, 0, processed.size)
                    }

                    val frontBmp = processSide(frontBytes) ?: return@withContext null
                    val backBmp = processSide(backBytes) ?: run { frontBmp.recycle(); return@withContext null }

                    val pageW = 1654
                    val pageH = 2339
                    val canvasBmp = Bitmap.createBitmap(pageW, pageH, Bitmap.Config.ARGB_8888)
                    val canvas = Canvas(canvasBmp)
                    canvas.drawColor(Color.WHITE)

                    fun drawCentered(bmp: Bitmap, topY: Int, slotH: Int) {
                        val maxW = (pageW * 0.78f).toInt()
                        val maxH = (slotH * 0.84f).toInt()
                        val scale = minOf(maxW.toFloat() / bmp.width, maxH.toFloat() / bmp.height)
                        val dw = (bmp.width * scale).toInt().coerceAtLeast(1)
                        val dh = (bmp.height * scale).toInt().coerceAtLeast(1)
                        val left = (pageW - dw) / 2
                        val top = topY + (slotH - dh) / 2
                        canvas.drawBitmap(bmp, null, Rect(left, top, left + dw, top + dh), null)
                    }

                    drawCentered(frontBmp, 80, 1060)
                    drawCentered(backBmp, 1180, 1060)
                    frontBmp.recycle()
                    backBmp.recycle()

                    val jpeg = compressBitmapToBytes(canvasBmp)
                    canvasBmp.recycle()

                    val tempDir = File(context.cacheDir, "scan_session").apply { if (!exists()) mkdirs() }
                    File(tempDir, "idcard_${UUID.randomUUID()}.jpg").also { f ->
                        FileOutputStream(f).use { it.write(jpeg) }
                    }
                }
                if (stagedFile != null && generation == sessionGeneration) {
                    accumulatedPageFiles.add(stagedFile)
                    isReviewingBatch = true
                } else {
                    stagedFile?.delete()
                }
            } catch (t: Throwable) {
                Log.e("ScanSession", "Failed to stitch ID card", t)
                Toast.makeText(context, "تعذر دمج وجهي البطاقة", Toast.LENGTH_SHORT).show()
            } finally {
                isStagingPage = false
            }
        }
    }

    fun saveWithLastPage(
        bitmap: Bitmap,
        title: String,
        quality: PdfExportQuality = PdfExportQuality.BALANCED,
        pageSize: PdfPageSize = PdfPageSize.A4,
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
                exportAccumulatedInternal(customTitle = title, quality = quality, pageSize = pageSize, onExported = onExported)
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

    fun deskewAndCleanPage(index: Int) {
        if (index !in accumulatedPageFiles.indices || isStagingPage || isExportingPdf) return
        val file = accumulatedPageFiles[index]
        isStagingPage = true
        scope.launch {
            try {
                val updatedFile = withContext(Dispatchers.Default) {
                    val raw = file.readBytes()
                    val processed = bridgeDeskewAndClean(raw)
                    withContext(Dispatchers.IO) {
                        val nextFile = File(file.parentFile, "page_${UUID.randomUUID()}.jpg")
                        FileOutputStream(nextFile).use { it.write(processed) }
                        file.delete()
                        nextFile
                    }
                }
                if (index in accumulatedPageFiles.indices) {
                    accumulatedPageFiles[index] = updatedFile
                }
                Toast.makeText(context, "تم تعديل الميلان وتنظيف الحواف", Toast.LENGTH_SHORT).show()
            } catch (t: Throwable) {
                Log.e("ScanSession", "Failed to deskew page", t)
                Toast.makeText(context, "تعذر تعديل ميلان الصفحة", Toast.LENGTH_SHORT).show()
            } finally {
                isStagingPage = false
            }
        }
    }

    fun dewarpBookPage(index: Int) {
        if (index !in accumulatedPageFiles.indices || isStagingPage || isExportingPdf) return
        val file = accumulatedPageFiles[index]
        isStagingPage = true
        scope.launch {
            try {
                val updatedFile = withContext(Dispatchers.Default) {
                    val raw = file.readBytes()
                    val processed = bridgeDewarpBook(raw)
                    withContext(Dispatchers.IO) {
                        val nextFile = File(file.parentFile, "page_${UUID.randomUUID()}.jpg")
                        FileOutputStream(nextFile).use { it.write(processed) }
                        file.delete()
                        nextFile
                    }
                }
                if (index in accumulatedPageFiles.indices) {
                    accumulatedPageFiles[index] = updatedFile
                }
                Toast.makeText(context, "تم تسطيح انحناء الصفحة", Toast.LENGTH_SHORT).show()
            } catch (t: Throwable) {
                Log.e("ScanSession", "Failed to dewarp book page", t)
                Toast.makeText(context, "تعذر تسطيح الصفحة", Toast.LENGTH_SHORT).show()
            } finally {
                isStagingPage = false
            }
        }
    }

    fun stampSignatureOnPage(
        index: Int,
        signatureBitmap: Bitmap,
        normX: Float = 0.64f,
        normY: Float = 0.80f,
        normW: Float = 0.28f
    ) {
        if (index !in accumulatedPageFiles.indices || isStagingPage || isExportingPdf) return
        val file = accumulatedPageFiles[index]
        isStagingPage = true
        scope.launch {
            try {
                val updatedFile = withContext(Dispatchers.Default) {
                    val pageBmp = BitmapFactory.decodeFile(file.absolutePath)
                        ?: return@withContext null
                    val mutable = pageBmp.copy(Bitmap.Config.ARGB_8888, true)
                    pageBmp.recycle()
                    val canvas = Canvas(mutable)
                    val sigW = (mutable.width * normW.coerceIn(0.10f, 0.70f)).toInt().coerceAtLeast(60)
                    val sigH = (sigW * (signatureBitmap.height.toFloat() / signatureBitmap.width.coerceAtLeast(1))).toInt().coerceAtLeast(25)
                    val left = (mutable.width * normX).toInt().coerceIn(0, (mutable.width - sigW).coerceAtLeast(0))
                    val top = (mutable.height * normY).toInt().coerceIn(0, (mutable.height - sigH).coerceAtLeast(0))
                    canvas.drawBitmap(signatureBitmap, null, Rect(left, top, left + sigW, top + sigH), null)
                    val bytes = compressBitmapToBytes(mutable)
                    mutable.recycle()
                    withContext(Dispatchers.IO) {
                        val nextFile = File(file.parentFile, "page_${UUID.randomUUID()}.jpg")
                        FileOutputStream(nextFile).use { it.write(bytes) }
                        file.delete()
                        nextFile
                    }
                }
                if (updatedFile != null && index in accumulatedPageFiles.indices) {
                    accumulatedPageFiles[index] = updatedFile
                    Toast.makeText(context, "تم إدراج التوقيع", Toast.LENGTH_SHORT).show()
                }
            } catch (t: Throwable) {
                Log.e("ScanSession", "Failed to stamp signature", t)
                Toast.makeText(context, "تعذر إدراج التوقيع", Toast.LENGTH_SHORT).show()
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

    fun saveBatch(
        title: String,
        quality: PdfExportQuality = PdfExportQuality.BALANCED,
        pageSize: PdfPageSize = PdfPageSize.A4,
        onExported: (Uri, String) -> Unit
    ) {
        if (isExportingPdf || isStagingPage || accumulatedPageFiles.isEmpty()) return
        isExportingPdf = true
        scope.launch {
            try {
                exportAccumulatedInternal(customTitle = title, quality = quality, pageSize = pageSize, onExported = onExported)
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
        quality: PdfExportQuality = PdfExportQuality.BALANCED,
        pageSize: PdfPageSize = PdfPageSize.A4,
        onExported: (Uri, String) -> Unit
    ) {
        val filesSnapshot = accumulatedPageFiles.toList()
        val (file, uri) = withContext(Dispatchers.IO) {
            val exported = PdfExporter.exportImageFilesToPdf(context, filesSnapshot, customTitle = customTitle, quality = quality, pageSize = pageSize)
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
