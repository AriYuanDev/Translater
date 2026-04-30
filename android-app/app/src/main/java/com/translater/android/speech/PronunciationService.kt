package com.translater.android.speech

import android.content.Context
import android.media.MediaPlayer
import com.translater.android.domain.AppSettings
import com.translater.android.domain.Phonetic
import com.translater.android.domain.PronunciationSource
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume

class PronunciationService(context: Context) {
    private val appContext = context.applicationContext
    private val localTts = LocalNeuralTtsEngine(appContext)
    private val systemTts = AndroidSystemTtsEngine(appContext)

    val localStatus: String get() = localTts.lastStatus

    suspend fun speak(word: String, phonetics: List<Phonetic>, settings: AppSettings): PronunciationSource {
        val audioUrl = phonetics.firstOrNull { it.audio.isNotBlank() }?.audio.orEmpty()
        val order = SpeechFallbackPolicy.order(settings.preferredPronunciation, audioUrl.isNotBlank())

        for (source in order) {
            val ok = when (source) {
                PronunciationSource.MW_AUDIO -> playRemoteAudio(audioUrl)
                PronunciationSource.LOCAL_AI -> localTts.speak(word, settings.speechRate)
                PronunciationSource.SYSTEM_TTS -> systemTts.speak(word, settings.speechRate)
            }
            if (ok) return source
        }
        error("No pronunciation engine is available")
    }

    private suspend fun playRemoteAudio(url: String): Boolean = withContext(Dispatchers.Main) {
        if (url.isBlank()) return@withContext false
        suspendCancellableCoroutine { continuation ->
            val player = MediaPlayer()
            continuation.invokeOnCancellation {
                runCatching {
                    player.stop()
                    player.release()
                }
            }
            runCatching {
                player.setDataSource(url)
                player.setOnPreparedListener { it.start() }
                player.setOnCompletionListener {
                    it.release()
                    if (continuation.isActive) continuation.resume(true)
                }
                player.setOnErrorListener { mp, _, _ ->
                    mp.release()
                    if (continuation.isActive) continuation.resume(false)
                    true
                }
                player.prepareAsync()
            }.onFailure {
                player.release()
                if (continuation.isActive) continuation.resume(false)
            }
        }
    }

    fun release() {
        localTts.release()
        systemTts.shutdown()
    }
}
