import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mdViewerCss = readFileSync(new URL('../chrome-extension/mdviewer.css', import.meta.url), 'utf8');

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
