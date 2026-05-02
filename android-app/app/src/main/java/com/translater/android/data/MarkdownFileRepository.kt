package com.translater.android.data

import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.OpenableColumns
import com.translater.android.reader.MarkdownSanitizer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

data class MarkdownDocument(
    val title: String,
    val markdown: String
)

data class MarkdownFileCandidate(
    val uri: Uri,
    val name: String,
    val folder: String,
    val path: String,
    val lastModified: Long,
    val sizeBytes: Long
)

class MarkdownFileRepository(private val context: Context) {
    suspend fun read(uri: Uri): MarkdownDocument = withContext(Dispatchers.IO) {
        val title = resolveDisplayName(uri) ?: uri.lastPathSegment ?: "Markdown"
        val content = context.contentResolver.openInputStream(uri)?.use { input ->
            input.bufferedReader(Charsets.UTF_8).readText()
        } ?: error("Unable to open Markdown file")

        MarkdownDocument(title = title, markdown = MarkdownSanitizer.sanitize(content))
    }

    fun hasWholeDeviceScanAccess(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.R || Environment.isExternalStorageManager()
    }

    suspend fun scanMarkdownFiles(): List<MarkdownFileCandidate> = withContext(Dispatchers.IO) {
        if (!hasWholeDeviceScanAccess()) return@withContext emptyList()

        val root = Environment.getExternalStorageDirectory()
        if (!root.exists() || !root.canRead()) return@withContext emptyList()

        root.walkTopDown()
            .onEnter { file -> file.canRead() && file.name != ".Trash" }
            .filter { file -> file.isFile && file.isMarkdownFile() }
            .map { file -> file.toCandidate(root) }
            .toList()
    }

    private fun resolveDisplayName(uri: Uri): String? {
        return context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }
    }

    private fun File.isMarkdownFile(): Boolean {
        val normalized = name.lowercase()
        return normalized.endsWith(".md") || normalized.endsWith(".markdown")
    }

    private fun File.toCandidate(root: File): MarkdownFileCandidate {
        val relativeParent = parentFile
            ?.relativeToOrNull(root)
            ?.path
            ?.takeIf { it.isNotBlank() && it != "." }
            ?: "Storage root"
        return MarkdownFileCandidate(
            uri = Uri.fromFile(this),
            name = name,
            folder = relativeParent,
            path = absolutePath,
            lastModified = lastModified(),
            sizeBytes = length()
        )
    }
}
