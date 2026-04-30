package com.translater.android.speech

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.getOfflineTtsConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

class LocalNeuralTtsEngine(private val context: Context) {
    private var offlineTts: OfflineTts? = null
    var lastStatus: String = "Not initialized"
        private set

    suspend fun speak(text: String, speed: Float): Boolean = withContext(Dispatchers.IO) {
        runCatching {
            val tts = ensureTts()
            val audio = tts.generate(text = text, sid = 0, speed = speed)
            if (audio.samples.isEmpty()) return@withContext false
            playFloatPcm(audio.samples, audio.sampleRate)
            true
        }.onFailure { error ->
            lastStatus = error.message ?: error::class.java.simpleName
        }.getOrDefault(false)
    }

    private fun ensureTts(): OfflineTts {
        offlineTts?.let { return it }

        val modelDir = "vits-piper-en_US-amy-low"
        val dataDir = "$modelDir/espeak-ng-data"
        val copiedDataDir = copyAssetDirectory(dataDir)
        val config = getOfflineTtsConfig(
            modelDir = modelDir,
            modelName = "en_US-amy-low.onnx",
            acousticModelName = "",
            vocoder = "",
            voices = "",
            lexicon = "",
            dataDir = copiedDataDir.absolutePath,
            dictDir = "",
            ruleFsts = "",
            ruleFars = "",
            numThreads = 2
        )

        return OfflineTts(assetManager = context.assets, config = config).also {
            offlineTts = it
            lastStatus = "Ready: $modelDir"
        }
    }

    private fun copyAssetDirectory(assetPath: String): File {
        val target = File(context.filesDir, "sherpa-assets/$assetPath")
        if (target.exists()) return target
        target.mkdirs()
        copyRecursive(assetPath, target)
        return target
    }

    private fun copyRecursive(assetPath: String, target: File) {
        val children = context.assets.list(assetPath).orEmpty()
        if (children.isEmpty()) {
            target.parentFile?.mkdirs()
            context.assets.open(assetPath).use { input ->
                target.outputStream().use { output -> input.copyTo(output) }
            }
            return
        }

        target.mkdirs()
        children.forEach { child ->
            copyRecursive("$assetPath/$child", File(target, child))
        }
    }

    private fun playFloatPcm(samples: FloatArray, sampleRate: Int) {
        val minBuffer = AudioTrack.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_FLOAT
        )
        val track = AudioTrack(
            AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .build(),
            AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .setSampleRate(sampleRate)
                .build(),
            minBuffer.coerceAtLeast(samples.size * 4),
            AudioTrack.MODE_STREAM,
            AudioManager.AUDIO_SESSION_ID_GENERATE
        )
        track.play()
        track.write(samples, 0, samples.size, AudioTrack.WRITE_BLOCKING)
        track.stop()
        track.release()
    }

    fun release() {
        offlineTts?.release()
        offlineTts = null
    }
}
