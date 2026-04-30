package com.translater.android.reader

object MarkdownSanitizer {
    private val scriptBlock = Regex("<script[\\s\\S]*?</script>", RegexOption.IGNORE_CASE)
    private val dangerousHref = Regex("(?i)\\]\\(\\s*javascript:[^)]+\\)")
    private val inlineEvent = Regex("(?i)\\s+on[a-z]+\\s*=\\s*(['\"]).*?\\1")

    fun sanitize(markdown: String): String {
        return markdown
            .replace(scriptBlock, "")
            .replace(dangerousHref, "](#)")
            .replace(inlineEvent, "")
    }
}
