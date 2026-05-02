package com.translater.android.reader

import android.net.Uri
import com.translater.android.data.MarkdownFileCandidate
import com.translater.android.domain.AppSettings
import com.translater.android.domain.DictionaryEntry
import com.translater.android.domain.PreferredPronunciation
import com.translater.android.domain.PronunciationSource

sealed interface ReaderIntent {
    data object OpenFile : ReaderIntent
    data class FileSelected(val uri: Uri) : ReaderIntent
    data object ToggleLibrary : ReaderIntent
    data object RefreshMarkdownLibrary : ReaderIntent
    data object RequestWholeDeviceScanAccess : ReaderIntent
    data class SearchMarkdownFiles(val query: String) : ReaderIntent
    data object CycleMarkdownSort : ReaderIntent
    data class LookupWord(val word: String, val anchorX: Float, val anchorY: Float) : ReaderIntent
    data class SpeakWord(val word: String, val entry: DictionaryEntry?) : ReaderIntent
    data object DismissPopup : ReaderIntent
    data object ToggleSettings : ReaderIntent
    data class SaveDeepLKey(val value: String) : ReaderIntent
    data class SaveMerriamWebsterKey(val value: String) : ReaderIntent
    data class SaveSpeechRate(val value: Float) : ReaderIntent
    data class SavePreferredPronunciation(val value: PreferredPronunciation) : ReaderIntent
    data object ClearCache : ReaderIntent
}

data class ReaderUiState(
    val documentTitle: String = "No Markdown file opened",
    val markdown: String = "",
    val isLoadingDocument: Boolean = false,
    val popup: PopupState? = null,
    val settings: AppSettings = AppSettings(),
    val isSettingsOpen: Boolean = false,
    val isLibraryOpen: Boolean = true,
    val isScanningFiles: Boolean = false,
    val hasWholeDeviceScanAccess: Boolean = false,
    val markdownFiles: List<MarkdownFileCandidate> = emptyList(),
    val fileSearchQuery: String = "",
    val fileSortMode: MarkdownSortMode = MarkdownSortMode.RECENT,
    val lastError: String? = null,
    val localTtsStatus: String = "Not initialized"
)

enum class MarkdownSortMode {
    RECENT,
    NAME,
    FOLDER,
    SIZE
}

sealed interface PopupState {
    val word: String

    data class Loading(override val word: String, val anchorX: Float, val anchorY: Float) : PopupState
    data class Dictionary(override val word: String, val entry: DictionaryEntry, val anchorX: Float, val anchorY: Float) : PopupState
    data class Translation(override val word: String, val translated: String, val anchorX: Float, val anchorY: Float) : PopupState
    data class Error(override val word: String, val message: String, val anchorX: Float, val anchorY: Float) : PopupState
}

sealed interface ReaderEffect {
    data object LaunchMarkdownPicker : ReaderEffect
    data object LaunchAllFilesAccessSettings : ReaderEffect
    data class Toast(val message: String) : ReaderEffect
    data class Pronounced(val source: PronunciationSource) : ReaderEffect
}
