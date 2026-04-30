package com.translater.android

import com.translater.android.data.MerriamWebsterParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class MerriamWebsterParserTest {
    @Test
    fun parsesLearnersEntry() {
        val raw = """
            [{
              "meta": {"id": "support:1"},
              "hwi": {"prs": [{"ipa": "səˈpɔːrt", "sound": {"audio": "support001"}}]},
              "fl": "verb",
              "shortdef": ["to agree with someone", "to hold up something"]
            }]
        """.trimIndent()

        val entry = MerriamWebsterParser.parse(raw, "support")

        assertNotNull(entry)
        assertEquals("support", entry!!.word)
        assertEquals("/səˈpɔːrt/", entry.phonetic)
        assertEquals("verb", entry.meanings.first().partOfSpeech)
        assertEquals("to agree with someone", entry.meanings.first().definitions.first().definition)
    }

    @Test
    fun returnsNullForSuggestionList() {
        assertNull(MerriamWebsterParser.parse("""["suppose", "support"]""", "suport"))
    }
}
