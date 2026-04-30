package com.translater.android.settings

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.translater.android.domain.AppSettings
import com.translater.android.domain.PreferredPronunciation
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.translaterDataStore by preferencesDataStore(name = "translater_settings")

class SettingsRepository(private val context: Context) {
    val settings: Flow<AppSettings> = context.translaterDataStore.data.map { preferences ->
        AppSettings(
            deepLApiKey = preferences[Keys.deepLApiKey].orEmpty(),
            merriamWebsterApiKey = preferences[Keys.merriamWebsterApiKey].orEmpty(),
            preferredPronunciation = preferences[Keys.preferredPronunciation]
                ?.let { runCatching { PreferredPronunciation.valueOf(it) }.getOrNull() }
                ?: PreferredPronunciation.MW_AUDIO_FIRST,
            speechRate = preferences[Keys.speechRate] ?: 1.0f
        )
    }

    suspend fun saveDeepLApiKey(value: String) {
        context.translaterDataStore.edit { it[Keys.deepLApiKey] = value.trim() }
    }

    suspend fun saveMerriamWebsterApiKey(value: String) {
        context.translaterDataStore.edit { it[Keys.merriamWebsterApiKey] = value.trim() }
    }

    suspend fun saveSpeechRate(value: Float) {
        context.translaterDataStore.edit { it[Keys.speechRate] = value.coerceIn(0.5f, 1.8f) }
    }

    suspend fun savePreferredPronunciation(value: PreferredPronunciation) {
        context.translaterDataStore.edit { it[Keys.preferredPronunciation] = value.name }
    }

    private object Keys {
        val deepLApiKey: Preferences.Key<String> = stringPreferencesKey("deepl_api_key")
        val merriamWebsterApiKey: Preferences.Key<String> = stringPreferencesKey("mw_api_key")
        val preferredPronunciation: Preferences.Key<String> = stringPreferencesKey("preferred_pronunciation")
        val speechRate: Preferences.Key<Float> = floatPreferencesKey("speech_rate")
    }
}
