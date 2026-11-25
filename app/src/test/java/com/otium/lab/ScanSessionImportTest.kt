package com.otium.lab

import android.content.Context
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import com.otium.lab.library.DocumentStore
import com.otium.lab.scanner.ScanSessionState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File

@RunWith(RobolectricTestRunner::class)
class ScanSessionImportTest {
    @Test fun importedPagesKeepTheirOrderAndOpenReview() = runBlocking {
        val context: Context = ApplicationProvider.getApplicationContext()
        val first = File(context.cacheDir, "scan_input_1.jpg").apply { writeText("page-one") }
        val second = File(context.cacheDir, "scan_input_2.jpg").apply { writeText("page-two") }
        val session = ScanSessionState(context, CoroutineScope(Dispatchers.Unconfined), DocumentStore(context))
        var failed = false
        session.importProcessedPages(listOf(Uri.fromFile(first), Uri.fromFile(second))) { failed = true }
        withTimeout(5000) { while (session.isStagingPage) delay(10) }
        assertTrue(!failed)
        assertTrue(session.isReviewingBatch)
        assertEquals(listOf("page-one", "page-two"), session.accumulatedPageFiles.map { it.readText() })
        session.clearSession()
        first.delete()
        second.delete()
        Unit
    }
}
