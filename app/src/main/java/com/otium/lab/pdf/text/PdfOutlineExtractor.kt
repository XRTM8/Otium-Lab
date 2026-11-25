package com.otium.lab.pdf.text

import android.net.Uri
import com.otium.lab.pdf.model.PdfOutlineItem
import com.tom_roush.pdfbox.pdmodel.interactive.action.PDActionGoTo
import com.tom_roush.pdfbox.pdmodel.interactive.documentnavigation.destination.PDPageDestination
import com.tom_roush.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object PdfOutlineExtractor {

    suspend fun extractOutline(
        extractor: PdfTextExtractor,
        uri: Uri
    ): List<PdfOutlineItem> = withContext(Dispatchers.IO) {
        extractor.withDocument(uri) { doc ->
            val list = mutableListOf<PdfOutlineItem>()
            val outline = doc.documentCatalog.documentOutline ?: return@withDocument list

            fun traverse(item: PDOutlineItem?, level: Int) {
                var current = item
                while (current != null) {
                    val title = current.title?.trim() ?: ""
                    var pageIndex = -1

                    val dest = current.destination
                    if (dest is PDPageDestination) {
                        pageIndex = dest.retrievePageNumber()
                    } else {
                        val action = current.action
                        if (action is PDActionGoTo && action.destination is PDPageDestination) {
                            pageIndex = (action.destination as PDPageDestination).retrievePageNumber()
                        }
                    }

                    if (title.isNotEmpty() && pageIndex >= 0) {
                        list.add(PdfOutlineItem(title = title, pageIndex = pageIndex, level = level))
                    }
                    current.firstChild?.let { traverse(it, level + 1) }
                    current = current.nextSibling
                }
            }
            traverse(outline.firstChild, 0)
            list
        } ?: emptyList()
    }
}
