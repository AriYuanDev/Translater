import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const contentCss = readFileSync(new URL('../chrome-extension/styles.css', import.meta.url), 'utf8');
const mdViewerCss = readFileSync(new URL('../chrome-extension/mdviewer.css', import.meta.url), 'utf8');
const pdfViewerCss = readFileSync(new URL('../chrome-extension/pdfviewer.css', import.meta.url), 'utf8');

function getRuleBody(selector, css) {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
    return match ? match[1] : '';
}

test('Markdown zoom uses static transform without animated drift', () => {
    const mdContentRule = getRuleBody('.md-content', mdViewerCss);

    assert.match(mdContentRule, /transition:\s*none\s*;/);
    assert.doesNotMatch(mdContentRule, /transition:\s*transform\b/);
});

test('Markdown viewer disables native scroll anchoring during manual zoom restore', () => {
    const viewerContainerRule = getRuleBody('.viewer-container', mdViewerCss);

    assert.match(viewerContainerRule, /overflow-anchor:\s*none\s*;/);
});

test('Markdown viewer does not flex-center oversized zoomed content', () => {
    const viewerContainerRule = getRuleBody('.viewer-container', mdViewerCss);

    assert.match(viewerContainerRule, /display:\s*block\s*;/);
    assert.doesNotMatch(viewerContainerRule, /align-items:\s*center\s*;/);
});

test('Google search floating button uses the same dimensions as the translation button', () => {
    for (const css of [contentCss, mdViewerCss, pdfViewerCss]) {
        const baseButtonRule = getRuleBody('.translator-float-btn', css);
        const googleButtonRule = getRuleBody('.translator-float-btn.google-search-btn', css);

        assert.match(baseButtonRule, /width:\s*32px\s*;/);
        assert.match(baseButtonRule, /height:\s*32px\s*;/);
        assert.doesNotMatch(googleButtonRule, /width:\s*24px\s*;/);
        assert.doesNotMatch(googleButtonRule, /height:\s*24px\s*;/);
    }
});

test('Sentence popup content owns a readable foreground color', () => {
    const sentenceContentRule = getRuleBody('.translator-sentence-content', contentCss);

    assert.match(sentenceContentRule, /color:\s*#1a1a2e\s*;/);
});
