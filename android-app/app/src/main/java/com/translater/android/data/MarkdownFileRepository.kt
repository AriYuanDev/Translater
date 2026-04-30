package com.translater.android.data

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.translater.android.reader.MarkdownSanitizer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class MarkdownDocument(
    val title: String,
    val markdown: String
)

class MarkdownFileRepository(private val context: Context) {
    suspend fun read(uri: Uri): MarkdownDocument = withContext(Dispatchers.IO) {
        val title = resolveDisplayName(uri) ?: uri.lastPathSegment ?: "Markdown"
        val content = context.contentResolver.openInputStream(uri)?.use { input ->
            input.bufferedReader(Charsets.UTF_8).readText()
        } ?: error("Unable to open Markdown file")

        MarkdownDocument(title = title, markdown = MarkdownSanitizer.sanitize(content))
    }

    private fun resolveDisplayName(uri: Uri): String? {
        return context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }
    }
}
