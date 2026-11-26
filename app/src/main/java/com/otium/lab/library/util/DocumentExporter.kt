package com.otium.lab.library.util

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.otium.lab.pdf.store.AnnotationStore
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState
import java.io.File

object DocumentExporter {
    fun createAnnotatedCopyIfNeeded(context: Context, uri: Uri, title: String): File? {
        return try {
            val highlights = AnnotationStore(context).getAllHighlights(uri)
            if (highlights.isEmpty()) return null
            val input = if (uri.scheme == "file") {
                File(uri.path ?: "").takeIf { it.exists() }?.inputStream()
            } else {
                context.contentResolver.openInputStream(uri)
            } ?: return null

            val safeName = title.replace(Regex("[^a-zA-Z0-9_\\-\\u0600-\\u06FF]"), "_").ifBlank { "document" }
            val outFile = File(context.cacheDir, "annotated_${safeName}.pdf")
            input.use { stream ->
                PDDocument.load(stream).use { doc ->
                    val byPage = highlights.groupBy { it.pageIndex }
                    val gs = PDExtendedGraphicsState().apply { nonStrokingAlphaConstant = 0.35f }
                    for ((pageIndex, pageHls) in byPage) {
                        if (pageIndex !in 0 until doc.numberOfPages) continue
                        val page = doc.getPage(pageIndex)
                        val box = page.cropBox ?: page.mediaBox
                        val pw = box.width
                        val ph = box.height
                        PDPageContentStream(doc, page, PDPageContentStream.AppendMode.APPEND, true, true).use { cs ->
                            cs.setGraphicsStateParameters(gs)
                            for (hl in pageHls) {
                                val argb = hl.colorArgb.toInt()
                                val r = (argb shr 16) and 0xFF
                                val g = (argb shr 8) and 0xFF
                                val b = argb and 0xFF
                                cs.setNonStrokingColor(r, g, b)
                                for (rect in hl.bounds) {
                                    val x = box.lowerLeftX + rect.left * pw
                                    val w = ((rect.right - rect.left) * pw).coerceAtLeast(1f)
                                    val h = ((rect.bottom - rect.top) * ph).coerceAtLeast(1f)
                                    val y = box.lowerLeftY + (1f - rect.bottom) * ph
                                    cs.addRect(x, y, w, h)
                                    cs.fill()
                                }
                            }
                        }
                    }
                    doc.save(outFile)
                }
            }
            outFile
        } catch (_: Exception) {
            null
        }
    }

    fun exportToDownloads(context: Context, uri: Uri, title: String): Boolean {
        val annotatedTemp = createAnnotatedCopyIfNeeded(context, uri, title)
        return try {
            val resolver = context.contentResolver
            val inputStream = when {
                annotatedTemp != null && annotatedTemp.exists() -> annotatedTemp.inputStream()
                uri.scheme == "file" -> File(uri.path ?: "").inputStream()
                else -> resolver.openInputStream(uri)
            } ?: return false

            val filename = "${title.replace(Regex("[^a-zA-Z0-9_\\-\\u0600-\\u06FF]"), "_")}.pdf"

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                    put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                }
                val destUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return false
                resolver.openOutputStream(destUri)?.use { out ->
                    inputStream.use { it.copyTo(out) }
                }
                true
            } else {
                @Suppress("DEPRECATION")
                val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                if (!downloadsDir.exists()) downloadsDir.mkdirs()
                val destFile = File(downloadsDir, filename)
                destFile.outputStream().use { out ->
                    inputStream.use { it.copyTo(out) }
                }
                true
            }
        } catch (_: Exception) {
            false
        } finally {
            annotatedTemp?.delete()
        }
    }
}
