package com.translater.android.domain

data class DictionaryEntry(
    val word: String,
    val searchedWord: String,
    val phonetic: String = "",
    val phonetics: List<Phonetic> = emptyList(),
    val meanings: List<Meaning> = emptyList()
)

data class Phonetic(
    val text: String = "",
    val audio: String = ""
)

data class Meaning(
    val partOfSpeech: String,
    val definitions: List<Definition>
)

data class Definition(
    val definition: String,
    val translatedDefinition: String = "",
    val example: String = ""
)

data class TranslationResult(
    val original: String,
    val translated: String,
    val sourceLang: String = "auto",
    val engine: String = "DeepL"
)

enum class PronunciationSource {
    MW_AUDIO,
    LOCAL_AI,
    SYSTEM_TTS
}

enum class PreferredPronunciation {
    MW_AUDIO_FIRST,
    LOCAL_AI_FIRST,
    SYSTEM_TTS_ONLY
}

data class AppSettings(
    val deepLApiKey: String = "",
    val merriamWebsterApiKey: String = "",
    val preferredPronunciation: PreferredPronunciation = PreferredPronunciation.MW_AUDIO_FIRST,
    val speechRate: Float = 1.0f,
    val localVoiceName: String = "vits-piper-en_US-amy-low"
) {
    val hasDeepLKey: Boolean get() = deepLApiKey.isNotBlank()
    val hasMerriamWebsterKey: Boolean get() = merriamWebsterApiKey.isNotBlank()
}
