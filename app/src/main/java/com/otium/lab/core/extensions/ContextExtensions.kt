package com.otium.lab.core.extensions

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper

/**
 * Traverses ContextWrapper hierarchy to resolve the hosting Activity safely.
 */
fun Context.findActivity(): Activity? {
    var ctx = this
    while (ctx is ContextWrapper) {
        if (ctx is Activity) return ctx
        ctx = ctx.baseContext
    }
    return null
}
