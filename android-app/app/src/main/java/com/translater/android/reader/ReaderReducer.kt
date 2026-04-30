package com.translater.android.reader

object ReaderReducer {
    fun reduce(state: ReaderUiState, mutation: ReaderMutation): ReaderUiState {
        return when (mutation) {
            ReaderMutation.DocumentLoading -> state.copy(isLoadingDocument = true, lastError = null, popup = null)
            is ReaderMutation.DocumentLoaded -> state.copy(
                documentTitle = mutation.title,
                markdown = mutation.markdown,
                isLoadingDocument = false,
                lastError = null
            )
            is ReaderMutation.DocumentFailed -> state.copy(
                isLoadingDocument = false,
                lastError = mutation.message
            )
            is ReaderMutation.PopupChanged -> state.copy(popup = mutation.popup, lastError = null)
            is ReaderMutation.ErrorChanged -> state.copy(lastError = mutation.message)
            ReaderMutation.SettingsToggled -> state.copy(isSettingsOpen = !state.isSettingsOpen)
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
    data class LocalTtsStatusChanged(val status: String) : ReaderMutation
}
