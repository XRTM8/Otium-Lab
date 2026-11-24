package com.otium.lab.pdf.model

data class PdfSearchMatch(
    val pageIndex: Int,
    val matchText: String,
    val startOffset: Int = 0,
    val endOffset: Int = 0
)
