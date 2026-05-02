package com.translater.android

import android.app.Application
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ViewGroup
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.viewModel
import com.translater.android.data.MarkdownFileCandidate
import com.translater.android.domain.AppSettings
import com.translater.android.domain.DictionaryEntry
import com.translater.android.domain.PreferredPronunciation
import com.translater.android.reader.MarkdownSortMode
import com.translater.android.reader.PopupState
import com.translater.android.reader.ReaderEffect
import com.translater.android.reader.ReaderIntent
import com.translater.android.reader.ReaderUiState
import com.translater.android.reader.ReaderViewModel
import com.translater.android.reader.WordExtractor
import io.noties.markwon.Markwon
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : ComponentActivity() {
    private val externalMarkdownUri = mutableStateOf<Uri?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        externalMarkdownUri.value = intent.markdownUri()
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    TranslaterApp(
                        externalUri = externalMarkdownUri.value,
                        onExternalUriConsumed = { externalMarkdownUri.value = null }
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        externalMarkdownUri.value = intent.markdownUri()
    }
}

@Composable
private fun TranslaterApp(
    externalUri: Uri?,
    onExternalUriConsumed: () -> Unit
) {
    val context = LocalContext.current
    val viewModel: ReaderViewModel = viewModel(
        factory = ReaderViewModel.Factory(context.applicationContext as Application)
    )
    val state by viewModel.state.collectAsState()
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            runCatching {
                context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            viewModel.accept(ReaderIntent.FileSelected(uri))
        }
    }
    val allFilesAccessLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        viewModel.accept(ReaderIntent.RefreshMarkdownLibrary)
    }

    LaunchedEffect(externalUri) {
        if (externalUri != null) {
            persistReadPermissionIfAllowed(context.contentResolver, externalUri)
            viewModel.accept(ReaderIntent.FileSelected(externalUri))
            onExternalUriConsumed()
        }
    }

    LaunchedEffect(Unit) {
        viewModel.effectFlow.collect { effect ->
            when (effect) {
                ReaderEffect.LaunchMarkdownPicker -> launcher.launch(arrayOf("text/markdown", "text/plain", "application/octet-stream"))
                ReaderEffect.LaunchAllFilesAccessSettings -> {
                    runCatching { allFilesAccessLauncher.launch(createAllFilesAccessIntent(context.packageName)) }
                        .onFailure { Toast.makeText(context, "Unable to open file access settings", Toast.LENGTH_SHORT).show() }
                }
                is ReaderEffect.Toast -> Toast.makeText(context, effect.message, Toast.LENGTH_SHORT).show()
                is ReaderEffect.Pronounced -> Unit
            }
        }
    }

    ReaderScreen(
        state = state,
        onIntent = viewModel::accept
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReaderScreen(
    state: ReaderUiState,
    onIntent: (ReaderIntent) -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (state.isLibraryOpen) "Markdown Library" else state.documentTitle, maxLines = 1) },
                actions = {
                    TextButton(onClick = { onIntent(ReaderIntent.ToggleLibrary) }) { Text("Files") }
                    TextButton(onClick = { onIntent(ReaderIntent.OpenFile) }) { Text("Open") }
                    TextButton(onClick = { onIntent(ReaderIntent.ToggleSettings) }) { Text("Settings") }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
        ) {
            state.lastError?.let {
                Text(it, color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(8.dp))
            }
            if (state.isLoadingDocument) {
                CircularProgressIndicator()
            } else if (state.isLibraryOpen || state.markdown.isBlank()) {
                ReaderHome(state = state, onIntent = onIntent)
            } else {
                MarkdownReader(state.markdown, onIntent)
            }
        }
    }

    state.popup?.let { popup ->
        WordPopup(popup = popup, onIntent = onIntent)
    }

    if (state.isSettingsOpen) {
        SettingsSheet(state.settings, state.localTtsStatus, onIntent)
    }
}

@Composable
private fun ReaderHome(
    state: ReaderUiState,
    onIntent: (ReaderIntent) -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        if (state.markdown.isBlank()) {
            EmptyReader(onOpen = { onIntent(ReaderIntent.OpenFile) })
        }
        MarkdownLibrary(state = state, onIntent = onIntent)
    }
}

@Composable
private fun EmptyReader(onOpen: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Open a Markdown file to start reading.")
        Button(onClick = onOpen) { Text("Open Markdown") }
    }
}

@Composable
private fun MarkdownLibrary(
    state: ReaderUiState,
    onIntent: (ReaderIntent) -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { onIntent(ReaderIntent.RefreshMarkdownLibrary) }) {
                Text("Refresh")
            }
            Button(onClick = { onIntent(ReaderIntent.CycleMarkdownSort) }) {
                Text("Sort: ${state.fileSortMode.label()}")
            }
        }

        if (!state.hasWholeDeviceScanAccess) {
            Text("Grant all files access to scan Markdown files across device storage.")
            Button(onClick = { onIntent(ReaderIntent.RequestWholeDeviceScanAccess) }) {
                Text("Grant File Access")
            }
        }

        OutlinedTextField(
            value = state.fileSearchQuery,
            onValueChange = { onIntent(ReaderIntent.SearchMarkdownFiles(it)) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            label = { Text("Search name or folder") }
        )

        if (state.isScanningFiles) {
            CircularProgressIndicator()
        }

        val groupedFiles = remember(state.markdownFiles, state.fileSearchQuery, state.fileSortMode) {
            groupedVisibleFiles(state)
        }
        Text("${groupedFiles.values.sumOf { it.size }} Markdown files")

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            groupedFiles.forEach { (folder, files) ->
                item(key = "folder-$folder") {
                    Text(folder, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
                }
                items(files, key = { it.path }) { file ->
                    MarkdownFileRow(file = file, onClick = { onIntent(ReaderIntent.FileSelected(file.uri)) })
                }
            }
        }
    }
}

@Composable
private fun MarkdownFileRow(
    file: MarkdownFileCandidate,
    onClick: () -> Unit
) {
    val context = LocalContext.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp)
    ) {
        Text(file.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(
            "${formatModifiedTime(file.lastModified)} · ${android.text.format.Formatter.formatFileSize(context, file.sizeBytes)}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.secondary
        )
    }
}

@Composable
private fun MarkdownReader(
    markdown: String,
    onIntent: (ReaderIntent) -> Unit
) {
    val context = LocalContext.current
    val markwon = remember { Markwon.create(context) }

    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { viewContext ->
            val textView = TextView(viewContext).apply {
                textSize = 18f
                setLineSpacing(4f, 1.05f)
                setTextIsSelectable(false)
                val detector = GestureDetector(viewContext, object : GestureDetector.SimpleOnGestureListener() {
                    override fun onDoubleTap(event: MotionEvent): Boolean {
                        val offset = offsetForEvent(this@apply, event)
                        val word = WordExtractor.wordAt(text, offset) ?: return false
                        onIntent(ReaderIntent.LookupWord(word, event.rawX, event.rawY))
                        return true
                    }
                })
                setOnTouchListener { _, event ->
                    detector.onTouchEvent(event)
                    false
                }
            }
            ScrollView(viewContext).apply {
                isFillViewport = true
                addView(
                    textView,
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                    )
                )
            }
        },
        update = { scrollView ->
            val textView = scrollView.getChildAt(0) as TextView
            if (textView.tag != markdown) {
                textView.tag = markdown
                markwon.setMarkdown(textView, markdown)
                scrollView.post { scrollView.scrollTo(0, 0) }
            }
        }
    )
}

private fun offsetForEvent(textView: TextView, event: MotionEvent): Int {
    val layout = textView.layout ?: return -1
    val x = event.x.toInt() - textView.totalPaddingLeft + textView.scrollX
    val y = event.y.toInt() - textView.totalPaddingTop + textView.scrollY
    val line = layout.getLineForVertical(y.coerceAtLeast(0))
    return layout.getOffsetForHorizontal(line, x.toFloat())
}

@Composable
private fun WordPopup(
    popup: PopupState,
    onIntent: (ReaderIntent) -> Unit
) {
    AlertDialog(
        onDismissRequest = { onIntent(ReaderIntent.DismissPopup) },
        confirmButton = {
            TextButton(onClick = { onIntent(ReaderIntent.DismissPopup) }) { Text("Close") }
        },
        title = { Text(popup.word) },
        text = {
            when (popup) {
                is PopupState.Loading -> CircularProgressIndicator()
                is PopupState.Dictionary -> DictionaryPopupContent(popup.entry, popup.word, onIntent)
                is PopupState.Translation -> Text(popup.translated)
                is PopupState.Error -> Text(popup.message, color = MaterialTheme.colorScheme.error)
            }
        }
    )
}

@Composable
private fun DictionaryPopupContent(
    entry: DictionaryEntry,
    originalWord: String,
    onIntent: (ReaderIntent) -> Unit
) {
    Column(
        modifier = Modifier
            .verticalScroll(rememberScrollState())
            .fillMaxWidth()
    ) {
        Row {
            Text(entry.word, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.width(8.dp))
            if (entry.phonetic.isNotBlank()) Text(entry.phonetic)
            Spacer(Modifier.weight(1f))
            TextButton(onClick = { onIntent(ReaderIntent.SpeakWord(originalWord, entry)) }) {
                Text("Speak")
            }
        }
        entry.meanings.take(3).forEach { meaning ->
            Text(meaning.partOfSpeech, color = MaterialTheme.colorScheme.primary)
            meaning.definitions.take(2).forEach { definition ->
                Text(definition.definition)
                if (definition.translatedDefinition.isNotBlank()) {
                    Text(definition.translatedDefinition, color = MaterialTheme.colorScheme.secondary)
                }
                if (definition.example.isNotBlank()) {
                    Text("\"${definition.example}\"", style = MaterialTheme.typography.bodySmall)
                }
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SettingsSheet(
    settings: AppSettings,
    localTtsStatus: String,
    onIntent: (ReaderIntent) -> Unit
) {
    var deepl by remember(settings.deepLApiKey) { mutableStateOf("") }
    var mw by remember(settings.merriamWebsterApiKey) { mutableStateOf("") }

    ModalBottomSheet(onDismissRequest = { onIntent(ReaderIntent.ToggleSettings) }) {
        Column(
            modifier = Modifier
                .padding(16.dp)
                .fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text("Settings", style = MaterialTheme.typography.titleLarge)
            Text("DeepL: ${if (settings.hasDeepLKey) "Configured" else "Missing"}")
            OutlinedTextField(value = deepl, onValueChange = { deepl = it }, label = { Text("DeepL API Key") })
            Button(onClick = { onIntent(ReaderIntent.SaveDeepLKey(deepl)) }) { Text("Save DeepL Key") }

            Text("Merriam-Webster: ${if (settings.hasMerriamWebsterKey) "Configured" else "Missing"}")
            OutlinedTextField(value = mw, onValueChange = { mw = it }, label = { Text("Merriam-Webster API Key") })
            Button(onClick = { onIntent(ReaderIntent.SaveMerriamWebsterKey(mw)) }) { Text("Save Merriam-Webster Key") }

            Text("Speech rate: ${"%.2f".format(settings.speechRate)}")
            Slider(
                value = settings.speechRate,
                onValueChange = { onIntent(ReaderIntent.SaveSpeechRate(it)) },
                valueRange = 0.5f..1.8f
            )
            Text("Default pronunciation source")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PronunciationChoice("MW first", settings.preferredPronunciation == PreferredPronunciation.MW_AUDIO_FIRST) {
                    onIntent(ReaderIntent.SavePreferredPronunciation(PreferredPronunciation.MW_AUDIO_FIRST))
                }
                PronunciationChoice("Local AI", settings.preferredPronunciation == PreferredPronunciation.LOCAL_AI_FIRST) {
                    onIntent(ReaderIntent.SavePreferredPronunciation(PreferredPronunciation.LOCAL_AI_FIRST))
                }
                PronunciationChoice("System", settings.preferredPronunciation == PreferredPronunciation.SYSTEM_TTS_ONLY) {
                    onIntent(ReaderIntent.SavePreferredPronunciation(PreferredPronunciation.SYSTEM_TTS_ONLY))
                }
            }
            Text("Built-in AI voice: ${settings.localVoiceName}")
            Text("Local TTS status: $localTtsStatus")
            Button(onClick = { onIntent(ReaderIntent.ClearCache) }) { Text("Clear Cache") }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun PronunciationChoice(label: String, selected: Boolean, onClick: () -> Unit) {
    if (selected) {
        Button(onClick = onClick) { Text(label) }
    } else {
        TextButton(onClick = onClick) { Text(label) }
    }
}

private fun Intent.markdownUri(): Uri? {
    return data?.takeIf { action == Intent.ACTION_VIEW }
}

private fun persistReadPermissionIfAllowed(contentResolver: android.content.ContentResolver, uri: Uri) {
    runCatching {
        contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
}

private fun createAllFilesAccessIntent(packageName: String): Intent {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
            data = Uri.parse("package:$packageName")
        }
    } else {
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.parse("package:$packageName")
        }
    }
}

private fun groupedVisibleFiles(state: ReaderUiState): Map<String, List<MarkdownFileCandidate>> {
    val query = state.fileSearchQuery.trim().lowercase()
    val filtered = state.markdownFiles.filter { file ->
        query.isBlank() ||
            file.name.lowercase().contains(query) ||
            file.folder.lowercase().contains(query) ||
            file.path.lowercase().contains(query)
    }
    val sorted = when (state.fileSortMode) {
        MarkdownSortMode.RECENT -> filtered.sortedWith(compareByDescending<MarkdownFileCandidate> { it.lastModified }.thenBy { it.name.lowercase() })
        MarkdownSortMode.NAME -> filtered.sortedBy { it.name.lowercase() }
        MarkdownSortMode.FOLDER -> filtered.sortedWith(compareBy<MarkdownFileCandidate> { it.folder.lowercase() }.thenBy { it.name.lowercase() })
        MarkdownSortMode.SIZE -> filtered.sortedWith(compareByDescending<MarkdownFileCandidate> { it.sizeBytes }.thenBy { it.name.lowercase() })
    }
    return sorted.groupBy { it.folder }
}

private fun MarkdownSortMode.label(): String {
    return when (this) {
        MarkdownSortMode.RECENT -> "Recent"
        MarkdownSortMode.NAME -> "Name"
        MarkdownSortMode.FOLDER -> "Folder"
        MarkdownSortMode.SIZE -> "Size"
    }
}

private fun formatModifiedTime(lastModified: Long): String {
    return SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()).format(Date(lastModified))
}
