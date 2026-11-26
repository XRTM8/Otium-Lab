package com.otium.lab.pdf

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.util.LruCache
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileNotFoundException
import java.util.concurrent.Executors

class NativePdfRenderer(private val context: Context) : AutoCloseable {

    private var fileDescriptor: ParcelFileDescriptor? = null
    private var renderer: PdfRenderer? = null
    private var renderExecutor = Executors.newSingleThreadExecutor()
    private var renderDispatcher = renderExecutor.asCoroutineDispatcher()

    // Byte-size bounded page cache (up to 96 MB or 1/6 of heap) to prevent OOM at high zoom
    private val maxCacheKb = ((Runtime.getRuntime().maxMemory() / 1024L) / 6L)
        .toInt()
        .coerceIn(24 * 1024, 96 * 1024)
    private val pageCache = object : LruCache<Int, Bitmap>(maxCacheKb) {
        override fun sizeOf(key: Int, value: Bitmap): Int =
            (value.allocationByteCount / 1024).coerceAtLeast(1)
    }

    var pageCount by mutableIntStateOf(0)
        private set

    var documentUri: Uri? = null
        private set

    var documentName: String = ""
        private set

    fun open(uri: Uri, name: String = "مستند بدون عنوان") {
        close()
        renderExecutor = Executors.newSingleThreadExecutor()
        renderDispatcher = renderExecutor.asCoroutineDispatcher()
        this.documentUri = uri
        this.documentName = name

        val pfd = if (uri.scheme == "file") {
            val file = uri.path?.let(::File)
                ?: throw FileNotFoundException("مسار الملف غير صالح")
            if (!file.exists()) throw FileNotFoundException("الملف غير موجود: ${file.name}")
            ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
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

    suspend fun renderPage(pageIndex: Int, targetWidth: Int = 1080): Bitmap {
        val clampedWidth = targetWidth.coerceIn(300, 2400)
        val cached = pageCache.get(pageIndex)
        if (cached != null && !cached.isRecycled && cached.width >= (clampedWidth * 0.85f).toInt()) {
            return cached
        }
        if (renderExecutor.isShutdown) {
            throw IllegalStateException("PdfRenderer مغلق")
        }
        return withContext(renderDispatcher) {
            val cachedInside = pageCache.get(pageIndex)
            if (cachedInside != null && !cachedInside.isRecycled && cachedInside.width >= (clampedWidth * 0.85f).toInt()) {
                return@withContext cachedInside
            }

            val r = renderer ?: throw IllegalStateException("PdfRenderer غير مفتوح")
            if (pageIndex < 0 || pageIndex >= pageCount) {
                throw IndexOutOfBoundsException("رقم الصفحة $pageIndex غير صالح (عدد الصفحات: $pageCount)")
            }

            val page = r.openPage(pageIndex)
            try {
                val aspect = page.height.toFloat() / page.width.toFloat().coerceAtLeast(1f)
                val width = clampedWidth
                val height = (width * aspect).toInt().coerceIn(300, 4000)

                val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                bitmap.eraseColor(Color.WHITE)

                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                pageCache.put(pageIndex, bitmap)
                bitmap
            } finally {
                try { page.close() } catch (_: Exception) {}
            }
        }
    }

    suspend fun prefetchPage(pageIndex: Int, targetWidth: Int = 1080) {
        if (pageIndex !in 0 until pageCount) return
        val cached = pageCache.get(pageIndex)
        if (cached != null && !cached.isRecycled) return
        runCatching { renderPage(pageIndex, targetWidth) }
    }

    override fun close() {
        try {
            pageCache.evictAll()
            renderer?.close()
            fileDescriptor?.close()
            renderExecutor.shutdown()
        } catch (_: Exception) {}
        renderer = null
        fileDescriptor = null
        pageCount = 0
    }
}
