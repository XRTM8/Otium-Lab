package com.otium.lab.library.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.util.LruCache
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest

object PdfThumbnailLoader {

    // In-memory cache for up to 60 fast document thumbnails (only ~50KB per thumbnail)
    private val memoryCache = LruCache<String, Bitmap>(60)

    private fun getCacheKey(uri: Uri): String {
        val bytes = MessageDigest.getInstance("MD5").digest(uri.toString().toByteArray())
        return bytes.joinToString("") { "%02x".format(it) }
    }

    suspend fun loadThumbnail(context: Context, uri: Uri, targetWidth: Int = 220): Bitmap? = withContext(Dispatchers.IO) {
        val key = getCacheKey(uri)
        val memBitmap = memoryCache.get(key)
        if (memBitmap != null && !memBitmap.isRecycled) {
            return@withContext memBitmap
        }

        val thumbDir = File(context.cacheDir, "pdf_thumbnails").apply { if (!exists()) mkdirs() }
        val diskFile = File(thumbDir, "$key.jpg")

        // 1. Try loading from disk cache
        if (diskFile.exists() && diskFile.length() > 0) {
            try {
                val diskBitmap = BitmapFactory.decodeFile(diskFile.absolutePath)
                if (diskBitmap != null) {
                    memoryCache.put(key, diskBitmap)
                    return@withContext diskBitmap
                }
            } catch (_: Exception) {}
        }

        // 2. Render page 0 using Android PdfRenderer
        var pfd: ParcelFileDescriptor? = null
        var renderer: PdfRenderer? = null
        try {
            pfd = if (uri.scheme == "file") {
                ParcelFileDescriptor.open(File(uri.path ?: ""), ParcelFileDescriptor.MODE_READ_ONLY)
            } else {
                context.contentResolver.openFileDescriptor(uri, "r")
            } ?: return@withContext null

            renderer = PdfRenderer(pfd)
            if (renderer.pageCount <= 0) return@withContext null

            val page = renderer.openPage(0)
            val aspect = page.height.toFloat() / page.width.toFloat()
            val width = targetWidth.coerceIn(120, 400)
            val height = (width * aspect).toInt().coerceIn(120, 600)

            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            bitmap.eraseColor(Color.WHITE)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            page.close()

            // Save to disk cache
            try {
                FileOutputStream(diskFile).use { out ->
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 85, out)
                }
            } catch (_: Exception) {}

            memoryCache.put(key, bitmap)
            bitmap
        } catch (_: Exception) {
            null
        } finally {
            try { renderer?.close() } catch (_: Exception) {}
            try { pfd?.close() } catch (_: Exception) {}
        }
    }
}
