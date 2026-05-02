package com.translater.android.reader

object ReaderReducer {
    fun reduce(state: ReaderUiState, mutation: ReaderMutation): ReaderUiState {
        return when (mutation) {
            ReaderMutation.DocumentLoading -> state.copy(isLoadingDocument = true, lastError = null, popup = null)
            is ReaderMutation.DocumentLoaded -> state.copy(
                documentTitle = mutation.title,
                markdown = mutation.markdown,
                isLoadingDocument = false,
                isLibraryOpen = false,
                lastError = null
            )
            is ReaderMutation.DocumentFailed -> state.copy(
                isLoadingDocument = false,
                lastError = mutation.message
            )
            is ReaderMutation.PopupChanged -> state.copy(popup = mutation.popup, lastError = null)
            is ReaderMutation.ErrorChanged -> state.copy(lastError = mutation.message)
            ReaderMutation.SettingsToggled -> state.copy(isSettingsOpen = !state.isSettingsOpen)
            ReaderMutation.LibraryToggled -> state.copy(isLibraryOpen = !state.isLibraryOpen)
            is ReaderMutation.FileLibraryLoading -> state.copy(
                isScanningFiles = true,
                hasWholeDeviceScanAccess = mutation.hasAccess,
                lastError = null
            )
            is ReaderMutation.FileLibraryLoaded -> state.copy(
                isScanningFiles = false,
                hasWholeDeviceScanAccess = mutation.hasAccess,
                markdownFiles = mutation.files,
                lastError = null
            )
            is ReaderMutation.FileSearchChanged -> state.copy(fileSearchQuery = mutation.query)
            is ReaderMutation.FileSortModeChanged -> state.copy(fileSortMode = mutation.mode)
            is ReaderMutation.LocalTtsStatusChanged -> state.copy(localTtsStatus = mutation.status)
        }
    }
}

sealed interface ReaderMutation {
    data object DocumentLoading : ReaderMutation
    data class DocumentLoaded(val title: String, val markdown: String) : ReaderMutation
    data class DocumentFailed(val message: String) : ReaderMutation
    data class PopupChanged(val popup: PopupState?) : ReaderMutation
    data class ErrorChanged(val message: String?) : ReaderMutation
    data object SettingsToggled : ReaderMutation
    data object LibraryToggled : ReaderMutation
    data class FileLibraryLoading(val hasAccess: Boolean) : ReaderMutation
    data class FileLibraryLoaded(
        val files: List<com.translater.android.data.MarkdownFileCandidate>,
        val hasAccess: Boolean
    ) : ReaderMutation
    data class FileSearchChanged(val query: String) : ReaderMutation
    data class FileSortModeChanged(val mode: MarkdownSortMode) : ReaderMutation
    data class LocalTtsStatusChanged(val status: String) : ReaderMutation
}
