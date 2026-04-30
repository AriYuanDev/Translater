package com.translater.android.speech

import android.content.Context
import android.speech.tts.TextToSpeech
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.Locale
import kotlin.coroutines.resume

class AndroidSystemTtsEngine(context: Context) {
    private val appContext = context.applicationContext
    private var tts: TextToSpeech? = null

    suspend fun speak(text: String, rate: Float): Boolean {
        val engine = ensureEngine() ?: return false
        engine.language = Locale.US
        engine.setSpeechRate(rate)
        return engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "translater-${System.nanoTime()}") == TextToSpeech.SUCCESS
    }

    private suspend fun ensureEngine(): TextToSpeech? {
        tts?.let { return it }
        return suspendCancellableCoroutine { continuation ->
            var local: TextToSpeech? = null
            local = TextToSpeech(appContext) { status ->
                if (status == TextToSpeech.SUCCESS) {
                    tts = local
                    continuation.resume(local)
                } else {
                    continuation.resume(null)
                }
            }
        }
    }

    fun shutdown() {
        tts?.shutdown()
        tts = null
    }
}
