package com.translater.android.reader

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.translater.android.data.DictionaryRepository
import com.translater.android.data.MarkdownFileRepository
import com.translater.android.data.TranslationRepository
import com.translater.android.domain.Definition
import com.translater.android.domain.DictionaryEntry
import com.translater.android.domain.Meaning
import com.translater.android.settings.SettingsRepository
import com.translater.android.speech.PronunciationService
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

class ReaderViewModel(
    application: Application,
    private val markdownRepository: MarkdownFileRepository,
    private val dictionaryRepository: DictionaryRepository,
    private val translationRepository: TranslationRepository,
    private val settingsRepository: SettingsRepository,
    private val pronunciationService: PronunciationService
) : AndroidViewModel(application) {
    private val mutableState = MutableStateFlow(ReaderUiState())
    val state: StateFlow<ReaderUiState> = mutableState

    private val effects = Channel<ReaderEffect>(Channel.BUFFERED)
    val effectFlow = effects.receiveAsFlow()

    private val settingsState = settingsRepository.settings.stateIn(
        viewModelScope,
        SharingStarted.Eagerly,
        mutableState.value.settings
    )

    init {
        viewModelScope.launch {
            settingsRepository.settings.collect { settings ->
                mutableState.update {
                    it.copy(settings = settings, localTtsStatus = pronunciationService.localStatus)
                }
            }
        }
    }

    fun accept(intent: ReaderIntent) {
        when (intent) {
            ReaderIntent.OpenFile -> emitEffect(ReaderEffect.LaunchMarkdownPicker)
            is ReaderIntent.FileSelected -> loadMarkdown(intent)
            is ReaderIntent.LookupWord -> lookupWord(intent)
            is ReaderIntent.SpeakWord -> speak(intent)
            ReaderIntent.DismissPopup -> mutate(ReaderMutation.PopupChanged(null))
            ReaderIntent.ToggleSettings -> mutate(ReaderMutation.SettingsToggled)
            is ReaderIntent.SaveDeepLKey -> viewModelScope.launch { settingsRepository.saveDeepLApiKey(intent.value) }
            is ReaderIntent.SaveMerriamWebsterKey -> viewModelScope.launch { settingsRepository.saveMerriamWebsterApiKey(intent.value) }
            is ReaderIntent.SaveSpeechRate -> viewModelScope.launch { settingsRepository.saveSpeechRate(intent.value) }
            is ReaderIntent.SavePreferredPronunciation -> viewModelScope.launch {
                settingsRepository.savePreferredPronunciation(intent.value)
            }
            ReaderIntent.ClearCache -> {
                dictionaryRepository.clearCache()
                emitEffect(ReaderEffect.Toast("Dictionary cache cleared"))
            }
        }
    }

    private fun loadMarkdown(intent: ReaderIntent.FileSelected) {
        viewModelScope.launch {
            mutate(ReaderMutation.DocumentLoading)
            runCatching { markdownRepository.read(intent.uri) }
                .onSuccess { document ->
                    mutate(ReaderMutation.DocumentLoaded(document.title, document.markdown))
                }
                .onFailure { error ->
                    mutate(ReaderMutation.DocumentFailed(error.message ?: "Unable to read Markdown file"))
                }
        }
    }

    private fun lookupWord(intent: ReaderIntent.LookupWord) {
        val word = intent.word.trim()
        if (!WordExtractor.isProbablyWord(word)) return

        viewModelScope.launch {
            mutate(ReaderMutation.PopupChanged(PopupState.Loading(word, intent.anchorX, intent.anchorY)))

            val dictionary = runCatching { dictionaryRepository.fetch(word) }
                .onFailure { error ->
                    mutate(ReaderMutation.ErrorChanged(error.message))
                }
                .getOrNull()

            if (dictionary != null) {
                val translatedEntry = translateDefinitions(dictionary)
                mutate(ReaderMutation.PopupChanged(PopupState.Dictionary(word, translatedEntry, intent.anchorX, intent.anchorY)))
                speak(ReaderIntent.SpeakWord(word, translatedEntry))
                return@launch
            }

            runCatching { translationRepository.translate(word) }
                .onSuccess { translation ->
                    mutate(ReaderMutation.PopupChanged(PopupState.Translation(word, translation.translated, intent.anchorX, intent.anchorY)))
                    speak(ReaderIntent.SpeakWord(word, null))
                }
                .onFailure { error ->
                    mutate(ReaderMutation.PopupChanged(PopupState.Error(word, error.message ?: "Query failed", intent.anchorX, intent.anchorY)))
                }
        }
    }

    private suspend fun translateDefinitions(entry: DictionaryEntry): DictionaryEntry {
        val meanings = entry.meanings.map { meaning ->
            Meaning(
                partOfSpeech = meaning.partOfSpeech,
                definitions = meaning.definitions.map { definition ->
                    val translated = runCatching { translationRepository.translate(definition.definition).translated }
                        .getOrDefault("")
                    Definition(
                        definition = definition.definition,
                        translatedDefinition = translated,
                        example = definition.example
                    )
                }
            )
        }
        return entry.copy(meanings = meanings)
    }

    private fun speak(intent: ReaderIntent.SpeakWord) {
        viewModelScope.launch {
            val settings = settingsState.value
            runCatching {
                pronunciationService.speak(intent.word, intent.entry?.phonetics.orEmpty(), settings)
            }.onSuccess { source ->
                mutate(ReaderMutation.LocalTtsStatusChanged(pronunciationService.localStatus))
                effects.send(ReaderEffect.Pronounced(source))
            }.onFailure { error ->
                mutate(ReaderMutation.LocalTtsStatusChanged(pronunciationService.localStatus))
                effects.send(ReaderEffect.Toast(error.message ?: "Pronunciation failed"))
            }
        }
    }

    private fun mutate(mutation: ReaderMutation) {
        mutableState.update { ReaderReducer.reduce(it, mutation) }
    }

    private fun emitEffect(effect: ReaderEffect) {
        viewModelScope.launch { effects.send(effect) }
    }

    override fun onCleared() {
        pronunciationService.release()
        super.onCleared()
    }

    class Factory(private val application: Application) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            val client = OkHttpClient.Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(15, TimeUnit.SECONDS)
                .writeTimeout(15, TimeUnit.SECONDS)
                .build()
            val settingsRepository = SettingsRepository(application)
            return ReaderViewModel(
                application = application,
                markdownRepository = MarkdownFileRepository(application),
                dictionaryRepository = DictionaryRepository(client, settingsRepository),
                translationRepository = TranslationRepository(client, settingsRepository),
                settingsRepository = settingsRepository,
                pronunciationService = PronunciationService(application)
            ) as T
        }
    }
}
