package com.translater.android

import com.translater.android.domain.PreferredPronunciation
import com.translater.android.domain.PronunciationSource
import com.translater.android.speech.SpeechFallbackPolicy
import org.junit.Assert.assertEquals
import org.junit.Test

class SpeechFallbackPolicyTest {
    @Test
    fun mwAudioFirstUsesDictionaryAudioThenLocalAiThenSystem() {
        assertEquals(
            listOf(PronunciationSource.MW_AUDIO, PronunciationSource.LOCAL_AI, PronunciationSource.SYSTEM_TTS),
            SpeechFallbackPolicy.order(PreferredPronunciation.MW_AUDIO_FIRST, hasMwAudio = true)
        )
    }

    @Test
    fun mwAudioFirstSkipsMissingAudio() {
        assertEquals(
            listOf(PronunciationSource.LOCAL_AI, PronunciationSource.SYSTEM_TTS),
            SpeechFallbackPolicy.order(PreferredPronunciation.MW_AUDIO_FIRST, hasMwAudio = false)
        )
    }
}
