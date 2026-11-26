package com.otium.lab

import android.content.Context
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import com.otium.lab.pdf.model.NormalizedRect
import com.otium.lab.pdf.model.PdfHighlight
import com.otium.lab.pdf.store.AnnotationStore
import com.otium.lab.library.DocumentStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File

@RunWith(RobolectricTestRunner::class)
class DocumentStoreAndAnnotationsTest {

    private lateinit var context: Context
    private lateinit var documentStore: DocumentStore
    private lateinit var annotationStore: AnnotationStore

    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        documentStore = DocumentStore(context)
        annotationStore = AnnotationStore(context)
    }

    @Test
    fun renameScannedDocumentMigratesHighlightsAndHandlesCollisions() {
        val scansDir = File(context.filesDir, "scans").apply { mkdirs() }
        val fileA = File(scansDir, "scan_alpha.pdf").apply { writeText("%PDF-1.4\n") }
        val fileB = File(scansDir, "target_name.pdf").apply { writeText("%PDF-1.4\n") }
        val uriA = Uri.fromFile(fileA)

        documentStore.addOrUpdateDocument(uriA, "scan_alpha", isScanned = true, page = 3, total = 10)
        annotationStore.saveHighlight(
            uriA,
            PdfHighlight(
                id = "hl-1",
                pageIndex = 2,
                text = "اقتباس تجريبي",
                colorArgb = 0xFFFACC15L,
                bounds = listOf(NormalizedRect(0.1f, 0.2f, 0.5f, 0.25f))
            )
        )

        val docsBefore = documentStore.getDocuments()
        val storedA = docsBefore.first { it.uriString == uriA.toString() }
        documentStore.updateFolder(uriA, "كتب_مختارة")
        assertEquals("كتب_مختارة", documentStore.getDocuments().first { it.uriString == uriA.toString() }.folder)

        // Rename to an already existing filename -> should auto-disambiguate & migrate highlights
        assertTrue(documentStore.renameDocument(storedA, "target_name"))

        val docsAfter = documentStore.getDocuments()
        val renamedDoc = docsAfter.first { it.title == "target_name" && it.uriString != Uri.fromFile(fileB).toString() }
        assertTrue(File(renamedDoc.uri.path!!).exists())
        assertFalse(fileA.exists())
        assertEquals(3, renamedDoc.lastPage)
        assertEquals(10, renamedDoc.totalPages)

        val migratedHighlights = annotationStore.getAllHighlights(renamedDoc.uri)
        assertEquals(1, migratedHighlights.size)
        assertEquals("اقتباس تجريبي", migratedHighlights.first().text)
        assertTrue(annotationStore.getAllHighlights(uriA).isEmpty())

        // Delete removes document, file, and highlights
        assertTrue(documentStore.deleteDocument(renamedDoc))
        assertFalse(File(renamedDoc.uri.path!!).exists())
        assertTrue(annotationStore.getAllHighlights(renamedDoc.uri).isEmpty())
    }
}
