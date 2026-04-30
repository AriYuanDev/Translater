package com.translater.android.reader

import android.net.Uri
import com.translater.android.domain.AppSettings
import com.translater.android.domain.DictionaryEntry
import com.translater.android.domain.PreferredPronunciation
import com.translater.android.domain.PronunciationSource

sealed interface ReaderIntent {
    data object OpenFile : ReaderIntent
    data class FileSelected(val uri: Uri) : ReaderIntent
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
    val lastError: String? = null,
    val localTtsStatus: String = "Not initialized"
)

sealed interface PopupState {
    val word: String

    data class Loading(override val word: String, val anchorX: Float, val anchorY: Float) : PopupState
    data class Dictionary(override val word: String, val entry: DictionaryEntry, val anchorX: Float, val anchorY: Float) : PopupState
    data class Translation(override val word: String, val translated: String, val anchorX: Float, val anchorY: Float) : PopupState
    data class Error(override val word: String, val message: String, val anchorX: Float, val anchorY: Float) : PopupState
}

sealed interface ReaderEffect {
    data object LaunchMarkdownPicker : ReaderEffect
    data class Toast(val message: String) : ReaderEffect
    data class Pronounced(val source: PronunciationSource) : ReaderEffect
}
