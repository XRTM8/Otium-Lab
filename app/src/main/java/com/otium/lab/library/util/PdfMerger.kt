package com.otium.lab.library.util

import android.content.Context
import android.net.Uri
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.multipdf.PDFMergerUtility
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.InputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object PdfMerger {
    suspend fun mergePdfUris(
        context: Context,
        uris: List<Uri>,
        customTitle: String? = null
    ): File = withContext(Dispatchers.IO) {
        if (uris.size < 2) throw IllegalArgumentException("اختر ملفين على الأقل للدمج")
        val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
        val title = customTitle?.ifBlank { null } ?: "مستند_مدمج_$timeStamp"
        val safeName = "${title.replace(Regex("[^a-zA-Z0-9_\\-\\u0600-\\u06FF]"), "_")}.pdf"
        val docsDir = File(context.filesDir, "scans").apply { if (!exists()) mkdirs() }
        var outputFile = File(docsDir, safeName)
        var suffix = 2
        while (outputFile.exists()) {
            outputFile = File(docsDir, "${safeName.removeSuffix(".pdf")}_$suffix.pdf")
            suffix++
        }
        val stagingFile = File(docsDir, ".${outputFile.name}.partial")
        val streams = mutableListOf<InputStream>()
        try {
            val merger = PDFMergerUtility()
            merger.destinationFileName = stagingFile.absolutePath
            for (uri in uris) {
                val input = if (uri.scheme == "file") {
                    File(uri.path ?: "").inputStream()
                } else {
                    context.contentResolver.openInputStream(uri)
                        ?: throw IllegalStateException("تعذر فتح أحد الملفات للدمج")
                }
                streams.add(input)
                merger.addSource(input)
            }
            merger.mergeDocuments(MemoryUsageSetting.setupTempFileOnly())
            if (!stagingFile.renameTo(outputFile)) throw IllegalStateException("تعذر حفظ الملف المدمج")
            outputFile
        } finally {
            streams.forEach { runCatching { it.close() } }
            if (stagingFile.exists()) stagingFile.delete()
        }
    }
}
