package com.otium.lab.pdf.util

object ReaderKeyEvents {
    var onNextPage: (() -> Unit)? = null
    var onPrevPage: (() -> Unit)? = null
}
