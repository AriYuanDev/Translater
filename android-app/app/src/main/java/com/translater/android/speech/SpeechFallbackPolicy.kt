package com.translater.android.speech

import com.translater.android.domain.PreferredPronunciation
import com.translater.android.domain.PronunciationSource

object SpeechFallbackPolicy {
    fun order(preferred: PreferredPronunciation, hasMwAudio: Boolean): List<PronunciationSource> {
        return when (preferred) {
            PreferredPronunciation.SYSTEM_TTS_ONLY -> listOf(PronunciationSource.SYSTEM_TTS)
            PreferredPronunciation.LOCAL_AI_FIRST -> listOf(
                PronunciationSource.LOCAL_AI,
                PronunciationSource.MW_AUDIO.takeIf { hasMwAudio },
                PronunciationSource.SYSTEM_TTS
            ).filterNotNull()
            PreferredPronunciation.MW_AUDIO_FIRST -> listOf(
                PronunciationSource.MW_AUDIO.takeIf { hasMwAudio },
                PronunciationSource.LOCAL_AI,
                PronunciationSource.SYSTEM_TTS
            ).filterNotNull()
        }
    }
}
