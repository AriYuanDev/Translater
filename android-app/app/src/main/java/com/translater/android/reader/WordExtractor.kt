package com.translater.android.reader

object WordExtractor {
    private val wordRegex = Regex("[A-Za-z0-9'-]+")

    fun isProbablyWord(text: String): Boolean {
        val trimmed = text.trim()
        return trimmed.isNotEmpty() && wordRegex.matches(trimmed) && !trimmed.any { it.isWhitespace() }
    }

    fun wordAt(text: CharSequence, offset: Int): String? {
        if (text.isEmpty() || offset !in 0 until text.length) return null
        if (!isWordChar(text[offset])) return null

        var start = offset
        while (start > 0 && isWordChar(text[start - 1])) start--

        var end = offset + 1
        while (end < text.length && isWordChar(text[end])) end++

        val candidate = text.subSequence(start, end).toString().trim('\'', '-')
        return candidate.takeIf { isProbablyWord(it) }
    }

    private fun isWordChar(char: Char): Boolean {
        return char.isLetterOrDigit() || char == '\'' || char == '-'
    }
}
