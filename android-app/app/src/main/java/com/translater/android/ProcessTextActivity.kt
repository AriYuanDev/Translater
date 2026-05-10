package com.translater.android

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Toast

class ProcessTextActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (intent.action != Intent.ACTION_PROCESS_TEXT) {
            finish()
            return
        }

        val word = ProcessTextRequest.lookupWordFromSelectedText(
            intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)
        )
        if (word == null) {
            Toast.makeText(this, "Select one English word", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        startActivity(ProcessTextRequest.mainActivityIntent(this, word))
        finish()
    }
}
