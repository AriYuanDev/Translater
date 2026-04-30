package com.translater.android.data

import com.translater.android.domain.DictionaryEntry
import com.translater.android.settings.SettingsRepository
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.LinkedHashMap
import java.util.concurrent.TimeUnit

class DictionaryRepository(
    private val client: OkHttpClient,
    private val settingsRepository: SettingsRepository
) {
    private val cache = TtlLruCache<String, DictionaryEntry>(maxSize = 100, ttlMillis = TimeUnit.MINUTES.toMillis(30))
    private val mutex = Mutex()
    private val pending = mutableMapOf<String, Deferred<DictionaryEntry?>>()

    suspend fun fetch(word: String): DictionaryEntry? {
        val normalized = word.trim().lowercase()
        if (normalized.isBlank()) return null
        cache.get(normalized)?.let { return it }

        return coroutineScope {
            val request = mutex.withLock {
                pending[normalized] ?: async(Dispatchers.IO) {
                    fetchFromNetwork(normalized)?.also { cache.put(normalized, it) }
                }.also { pending[normalized] = it }
            }

            try {
                request.await()
            } finally {
                mutex.withLock { pending.remove(normalized) }
            }
        }
    }

    fun clearCache() {
        cache.clear()
    }

    private suspend fun fetchFromNetwork(word: String): DictionaryEntry? = withContext(Dispatchers.IO) {
        val key = settingsRepository.settings.first().merriamWebsterApiKey
        if (key.isBlank()) error("Please configure Merriam-Webster API Key")

        val request = Request.Builder()
            .url("https://www.dictionaryapi.com/api/v3/references/learners/json/${word}?key=$key")
            .get()
            .build()

        client.newCall(request).execute().use { response ->
            if (response.code == 403) error("Merriam-Webster API Key invalid or expired")
            if (!response.isSuccessful) error("Dictionary service temporarily unavailable")
            val body = response.body?.string() ?: error("Dictionary service returned empty response")
            MerriamWebsterParser.parse(body, word)
        }
    }
}

private class TtlLruCache<K, V>(
    private val maxSize: Int,
    private val ttlMillis: Long
) {
    private val entries = object : LinkedHashMap<K, CacheEntry<V>>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<K, CacheEntry<V>>?): Boolean {
            return size > maxSize
        }
    }

    @Synchronized
    fun get(key: K): V? {
        val entry = entries[key] ?: return null
        if (System.currentTimeMillis() - entry.timestamp > ttlMillis) {
            entries.remove(key)
            return null
        }
        return entry.value
    }

    @Synchronized
    fun put(key: K, value: V) {
        entries[key] = CacheEntry(value, System.currentTimeMillis())
    }

    @Synchronized
    fun clear() {
        entries.clear()
    }

    private data class CacheEntry<V>(val value: V, val timestamp: Long)
}
