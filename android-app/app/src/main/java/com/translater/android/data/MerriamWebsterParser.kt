package com.translater.android.data

import com.translater.android.domain.Definition
import com.translater.android.domain.DictionaryEntry
import com.translater.android.domain.Meaning
import com.translater.android.domain.Phonetic
import org.json.JSONArray
import org.json.JSONObject

object MerriamWebsterParser {
    fun parse(rawJson: String, searchedWord: String): DictionaryEntry? {
        val data = JSONArray(rawJson)
        if (data.length() == 0) return null
        if (data.opt(0) is String) return null

        val first = data.optJSONObject(0) ?: return null
        val headword = first.optJSONObject("meta")?.optString("id")
            ?.replace(Regex(":\\d+$"), "")
            ?.ifBlank { searchedWord }
            ?: searchedWord

        val pronunciation = first.optJSONObject("hwi")
            ?.optJSONArray("prs")
            ?.optJSONObject(0)

        val phonetic = pronunciation?.optString("ipa")
            ?.takeIf { it.isNotBlank() }
            ?.let { "/$it/" }
            .orEmpty()

        val audio = pronunciation?.optJSONObject("sound")
            ?.optString("audio")
            ?.takeIf { it.isNotBlank() }
            ?.let { buildAudioUrl(it) }
            .orEmpty()

        val meanings = mutableListOf<Meaning>()
        collectMeaning(first)?.let { meanings += it }

        for (index in 1 until minOf(data.length(), 3)) {
            val other = data.optJSONObject(index) ?: continue
            val otherHeadword = other.optJSONObject("meta")?.optString("id")
                ?.replace(Regex(":\\d+$"), "")
                .orEmpty()
            if (!otherHeadword.equals(searchedWord, ignoreCase = true)) continue
            collectMeaning(other)?.takeIf { meaning -> meanings.none { it.partOfSpeech == meaning.partOfSpeech } }
                ?.let { meanings += it }
        }

        if (meanings.isEmpty()) return null

        return DictionaryEntry(
            word = headword,
            searchedWord = searchedWord,
            phonetic = phonetic,
            phonetics = if (phonetic.isNotBlank() || audio.isNotBlank()) listOf(Phonetic(phonetic, audio)) else emptyList(),
            meanings = meanings
        )
    }

    private fun collectMeaning(entry: JSONObject): Meaning? {
        val definitions = mutableListOf<Definition>()
        val shortDefs = entry.optJSONArray("shortdef")
        if (shortDefs != null) {
            for (index in 0 until minOf(shortDefs.length(), 3)) {
                shortDefs.optString(index).takeIf { it.isNotBlank() }?.let { definitions += Definition(it) }
            }
        }

        if (definitions.isEmpty()) return null
        return Meaning(
            partOfSpeech = entry.optString("fl").ifBlank { "word" },
            definitions = definitions
        )
    }

    private fun buildAudioUrl(audioFileName: String): String {
        val directory = when {
            audioFileName.startsWith("bix") -> "bix"
            audioFileName.startsWith("gg") -> "gg"
            audioFileName.firstOrNull()?.let { it.isDigit() || it == '_' } == true -> "number"
            else -> audioFileName.first().toString()
        }
        return "https://media.merriam-webster.com/audio/prons/en/us/mp3/$directory/$audioFileName.mp3"
    }
}
