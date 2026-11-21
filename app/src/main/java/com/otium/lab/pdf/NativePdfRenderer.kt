package com.otium.lab.pdf

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.util.LruCache
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.Executors

class NativePdfRenderer(private val context: Context) : AutoCloseable {

    private var fileDescriptor: ParcelFileDescriptor? = null
    private var renderer: PdfRenderer? = null
    private val renderDispatcher = Executors.newSingleThreadExecutor().asCoroutineDispatcher()

    // Cache up to 35 rendered pages in memory to ensure 120fps butter-smooth scrolling
    private val pageCache = object : LruCache<Int, Bitmap>(35) {
        override fun entryRemoved(evicted: Boolean, key: Int?, oldValue: Bitmap?, newValue: Bitmap?) {
            // Let GC collect recycled bitmaps
        }
    }

    var pageCount: Int = 0
        private set

    var documentUri: Uri? = null
        private set

    var documentName: String = ""
        private set

    fun open(uri: Uri, name: String = "مستند بدون عنوان") {
        close()
        this.documentUri = uri
        this.documentName = name

        val pfd = if (uri.scheme == "file") {
            ParcelFileDescriptor.open(File(uri.path!!), ParcelFileDescriptor.MODE_READ_ONLY)
        } else {
            context.contentResolver.openFileDescriptor(uri, "r")
                ?: throw IllegalArgumentException("تعذر فتح ملف المستند من المسار: $uri")
        }

        this.fileDescriptor = pfd
        val r = PdfRenderer(pfd)
        this.renderer = r
        this.pageCount = r.pageCount
        pageCache.evictAll()
    }

    suspend fun renderPage(pageIndex: Int, targetWidth: Int = 1080): Bitmap = withContext(renderDispatcher) {
        val cached = pageCache.get(pageIndex)
        if (cached != null && !cached.isRecycled) {
            return@withContext cached
        }

        val r = renderer ?: throw IllegalStateException("PdfRenderer غير مفتوح")
        if (pageIndex < 0 || pageIndex >= pageCount) {
            throw IndexOutOfBoundsException("رقم الصفحة $pageIndex غير صالح (عدد الصفحات: $pageCount)")
        }

        val page = r.openPage(pageIndex)
        val aspect = page.height.toFloat() / page.width.toFloat()
        val width = targetWidth.coerceIn(300, 2400)
        val height = (width * aspect).toInt().coerceIn(300, 4000)

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        bitmap.eraseColor(Color.WHITE)

        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
        page.close()

        pageCache.put(pageIndex, bitmap)
        bitmap
    }

    override fun close() {
        try {
            pageCache.evictAll()
            renderer?.close()
            fileDescriptor?.close()
        } catch (_: Exception) {}
        renderer = null
        fileDescriptor = null
        pageCount = 0
    }
}
