package com.translater.android

import android.content.Context
import android.content.Intent
import com.translater.android.reader.WordExtractor

object ProcessTextRequest {
    const val ACTION_LOOKUP_TEXT = "com.translater.android.action.LOOKUP_TEXT"
    const val EXTRA_LOOKUP_TEXT = "com.translater.android.extra.LOOKUP_TEXT"

    fun lookupWordFromSelectedText(selectedText: CharSequence?): String? {
        val word = selectedText
            ?.toString()
            ?.trim()
            ?.trimWordBoundaryPunctuation()
            .orEmpty()
        return word.takeIf { WordExtractor.isProbablyWord(it) }
    }

    fun lookupWordFromInternalIntent(intent: Intent): String? {
        if (intent.action != ACTION_LOOKUP_TEXT) return null
        return lookupWordFromSelectedText(intent.getCharSequenceExtra(EXTRA_LOOKUP_TEXT))
    }

    fun mainActivityIntent(context: Context, word: String): Intent {
        return Intent(context, MainActivity::class.java).apply {
            action = ACTION_LOOKUP_TEXT
            putExtra(EXTRA_LOOKUP_TEXT, word)
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
    }
}

private fun String.trimWordBoundaryPunctuation(): String {
    return trim { char -> !char.isLetterOrDigit() && char != '\'' && char != '-' }
        .trim('\'', '-')
}
