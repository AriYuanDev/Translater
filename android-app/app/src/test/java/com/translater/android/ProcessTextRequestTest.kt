package com.translater.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ProcessTextRequestTest {
    @Test
    fun selectedProcessTextBecomesLookupWord() {
        assertEquals("support", ProcessTextRequest.lookupWordFromSelectedText(" support\n"))
    }

    @Test
    fun selectedProcessTextTrimsBoundaryPunctuation() {
        assertEquals("support", ProcessTextRequest.lookupWordFromSelectedText("support."))
    }

    @Test
    fun selectedProcessTextRejectsMultiWordText() {
        assertNull(ProcessTextRequest.lookupWordFromSelectedText("support network"))
    }

    @Test
    fun selectedProcessTextRejectsNonEnglishText() {
        assertNull(ProcessTextRequest.lookupWordFromSelectedText("中文"))
    }
}
