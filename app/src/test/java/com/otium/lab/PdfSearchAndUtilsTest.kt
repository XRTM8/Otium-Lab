package com.otium.lab

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import com.otium.lab.library.DocumentStore
import com.otium.lab.library.util.DocumentNameResolver
import com.otium.lab.pdf.model.PdfTextSpan
import com.otium.lab.pdf.text.PdfSearchEngine
import com.otium.lab.scanner.PdfExporter
import com.otium.lab.scanner.util.ImageProcessingUtils
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.ByteArrayOutputStream
import java.io.File

@RunWith(RobolectricTestRunner::class)
class PdfSearchAndUtilsTest {

    @Test
    fun rotateJpegBytesSwapsDimensions() {
        val bmp = Bitmap.createBitmap(40, 20, Bitmap.Config.ARGB_8888)
        val out = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.JPEG, 90, out)
        bmp.recycle()

        val rotatedBytes = ImageProcessingUtils.rotateJpegBytes90Cw(out.toByteArray())
        assertNotNull(rotatedBytes)
        val decoded = BitmapFactory.decodeByteArray(rotatedBytes, 0, rotatedBytes!!.size)
        assertEquals(20, decoded.width)
        assertEquals(40, decoded.height)
        decoded.recycle()
    }

    @Test
    fun pdfTextSpanHitTestingAndSearchMatch() {
        val span = PdfTextSpan("الكتاب", pageIndex = 0, normLeft = 0.2f, normTop = 0.3f, normRight = 0.4f, normBottom = 0.35f)
        assertTrue(span.contains(0.3f, 0.32f))
        assertFalse(span.contains(0.8f, 0.8f))
        assertTrue(span.intersects(0.35f, 0.31f, 0.6f, 0.4f))
        assertTrue(PdfSearchEngine.matchesToken("الكتاب", "كتاب", "الكتاب"))
    }

    @Test
    fun pdfExporterRejectsEmptyAndCorruptInputs() {
        val context: Context = ApplicationProvider.getApplicationContext()
        assertThrows(IllegalArgumentException::class.java) {
            runBlocking { PdfExporter.exportImageFilesToPdf(context, emptyList(), "empty") }
        }
        val corrupt = File(context.cacheDir, "corrupt_page.jpg").apply { writeText("not-an-image") }
        assertThrows(IllegalStateException::class.java) {
            runBlocking { PdfExporter.exportImageFilesToPdf(context, listOf(corrupt), "corrupt") }
        }
        corrupt.delete()
    }

    @Test
    fun legacyPreferencesMigrateIntoSqliteAndResolveFileNames() {
        val context: Context = ApplicationProvider.getApplicationContext()
        val prefs = context.getSharedPreferences("otium_doc_store", Context.MODE_PRIVATE)
        prefs.edit().putString(
            "recent_docs",
            """[{"uri":"file:///tmp/sample_book.pdf","title":"كتاب_تجريبي","isScanned":false,"timestamp":123456,"lastPage":7,"totalPages":42,"scrollOffset":120}]"""
        ).commit()

        val store = DocumentStore(context)
        val uri = Uri.parse("file:///tmp/sample_book.pdf")
        assertEquals(7, store.getLastPage(uri))
        assertEquals(120, store.getLastScrollOffset(uri))
        assertEquals("sample_book", DocumentNameResolver.resolveDisplayName(context, uri))
        assertFalse(prefs.contains("recent_docs"))
    }
}
