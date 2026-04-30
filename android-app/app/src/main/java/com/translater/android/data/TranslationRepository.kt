package com.translater.android.data

import com.translater.android.domain.TranslationResult
import com.translater.android.settings.SettingsRepository
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.FormBody
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

class TranslationRepository(
    private val client: OkHttpClient,
    private val settingsRepository: SettingsRepository
) {
    private val mutex = Mutex()
    private val pending = mutableMapOf<String, Deferred<TranslationResult>>()

    suspend fun translate(text: String, targetLang: String = "zh-CN"): TranslationResult {
        val trimmed = text.trim()
        if (trimmed.isBlank()) error("No text to translate")
        val cacheKey = "$targetLang:$trimmed"

        return coroutineScope {
            val request = mutex.withLock {
                pending[cacheKey] ?: async(Dispatchers.IO) {
                    translateWithDeepL(trimmed, targetLang)
                }.also { pending[cacheKey] = it }
            }
            try {
                request.await()
            } finally {
                mutex.withLock { pending.remove(cacheKey) }
            }
        }
    }

    private suspend fun translateWithDeepL(text: String, targetLang: String): TranslationResult = withContext(Dispatchers.IO) {
        val key = settingsRepository.settings.first().deepLApiKey
        if (key.isBlank()) error("Please configure DeepL API Key")

        val endpoint = if (key.endsWith(":fx")) {
            "https://api-free.deepl.com/v2/translate"
        } else {
            "https://api.deepl.com/v2/translate"
        }

        val request = Request.Builder()
            .url(endpoint)
            .header("Authorization", "DeepL-Auth-Key $key")
            .post(
                FormBody.Builder()
                    .add("text", text)
                    .add("target_lang", convertToDeepLLang(targetLang))
                    .build()
            )
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val message = runCatching { JSONObject(body).optString("message") }.getOrNull()
                error("DeepL Translation Failed: ${message?.ifBlank { "HTTP ${response.code}" } ?: "HTTP ${response.code}"}")
            }
            val translation = JSONObject(body)
                .getJSONArray("translations")
                .getJSONObject(0)
            TranslationResult(
                original = text,
                translated = translation.getString("text"),
                sourceLang = translation.optString("detected_source_language", "auto")
            )
        }
    }

    internal fun convertToDeepLLang(lang: String): String {
        return when (lang) {
            "zh-CN", "zh-TW", "zh" -> "ZH"
            "en" -> "EN"
            "en-US" -> "EN-US"
            "en-GB" -> "EN-GB"
            "pt-BR" -> "PT-BR"
            "pt" -> "PT-PT"
            else -> lang.uppercase().substringBefore("-")
        }
    }
}
