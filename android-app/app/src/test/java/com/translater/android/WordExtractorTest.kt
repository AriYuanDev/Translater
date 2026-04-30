package com.translater.android

import com.translater.android.reader.WordExtractor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WordExtractorTest {
    @Test
    fun extractsHyphenatedWord() {
        val text = "A well-known pattern"
        assertEquals("well-known", WordExtractor.wordAt(text, 4))
    }

    @Test
    fun extractsApostropheWord() {
        val text = "Don't stop"
        assertEquals("Don't", WordExtractor.wordAt(text, 2))
    }

    @Test
    fun ignoresChineseCharacter() {
        assertNull(WordExtractor.wordAt("中文 support", 0))
    }
}
