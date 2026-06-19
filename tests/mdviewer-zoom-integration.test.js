import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mdViewerSource = readFileSync(new URL('../chrome-extension/mdviewer.js', import.meta.url), 'utf8');

test('Markdown viewer applies zoom through the shared layout zoom helper', () => {
    assert.match(mdViewerSource, /applyElementZoom\(mdContent,\s*currentZoom\);/);
    assert.doesNotMatch(mdViewerSource, /mdContent\.style\.transform\s*=/);
    assert.doesNotMatch(mdViewerSource, /mdContent\.style\.transformOrigin\s*=/);
    assert.doesNotMatch(mdViewerSource, /mdContent\.style\.marginBottom\s*=/);
});
