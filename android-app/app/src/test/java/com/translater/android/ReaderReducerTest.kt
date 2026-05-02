package com.translater.android

import com.translater.android.reader.MarkdownSortMode
import com.translater.android.reader.PopupState
import com.translater.android.reader.ReaderMutation
import com.translater.android.reader.ReaderReducer
import com.translater.android.reader.ReaderUiState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReaderReducerTest {
    @Test
    fun documentLoadingClearsPopupAndError() {
        val state = ReaderUiState(
            popup = PopupState.Loading("test", 0f, 0f),
            lastError = "old"
        )

        val next = ReaderReducer.reduce(state, ReaderMutation.DocumentLoading)

        assertTrue(next.isLoadingDocument)
        assertEquals(null, next.popup)
        assertEquals(null, next.lastError)
    }

    @Test
    fun documentLoadedSetsContentAndStopsLoading() {
        val next = ReaderReducer.reduce(
            ReaderUiState(isLoadingDocument = true),
            ReaderMutation.DocumentLoaded("note.md", "# Title")
        )

        assertFalse(next.isLoadingDocument)
        assertFalse(next.isLibraryOpen)
        assertEquals("note.md", next.documentTitle)
        assertEquals("# Title", next.markdown)
    }

    @Test
    fun fileLibraryLoadedStoresScanAccessAndFiles() {
        val next = ReaderReducer.reduce(
            ReaderUiState(isScanningFiles = true),
            ReaderMutation.FileLibraryLoaded(emptyList(), hasAccess = true)
        )

        assertFalse(next.isScanningFiles)
        assertTrue(next.hasWholeDeviceScanAccess)
        assertEquals(emptyList<Any>(), next.markdownFiles)
    }

    @Test
    fun fileSortModeCanChangeWithoutTouchingDocument() {
        val next = ReaderReducer.reduce(
            ReaderUiState(documentTitle = "note.md"),
            ReaderMutation.FileSortModeChanged(MarkdownSortMode.FOLDER)
        )

        assertEquals("note.md", next.documentTitle)
        assertEquals(MarkdownSortMode.FOLDER, next.fileSortMode)
    }
}
