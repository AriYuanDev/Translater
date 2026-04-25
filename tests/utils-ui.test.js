import test from 'node:test';
import assert from 'node:assert/strict';

import {
    __resetUiStateForTests,
    __setStylesLoadedForTests,
    dismissTranslatorUiOnOutsideEvent,
    ensureShadowRoot,
    getShadowRoot,
    isTranslatorUiClickPath,
    setCurrentPopup,
    showSelectionToolbar
} from '../chrome-extension/utils.js';
import {
    installChromeStub,
    installSpeechSynthesisStub,
    setupDom,
    teardownDom
} from './helpers/dom-test-utils.js';

let dom;

test.beforeEach(() => {
    dom = setupDom();
    installChromeStub();
    installSpeechSynthesisStub();
    __resetUiStateForTests();
    __setStylesLoadedForTests();
});

test.afterEach(() => {
    __resetUiStateForTests();
    teardownDom(dom);
});

test('showSelectionToolbar renders the shared toolbar and isTranslatorUiClickPath recognizes its buttons', async () => {
    const translateCalls = [];

    await showSelectionToolbar({
        text: 'The quick brown fox',
        x: 180,
        y: 220,
        onTranslate: (text, x, y) => {
            translateCalls.push({ text, x, y });
        }
    });

    const shadowRoot = getShadowRoot();
    const toolbar = shadowRoot.querySelector('.translator-float-buttons');
    const translateButton = shadowRoot.querySelector('.translator-float-btn.translate-btn');
    const outsideElement = document.createElement('div');

    assert.ok(toolbar);
    assert.ok(translateButton);
    assert.equal(toolbar.style.left !== '', true);
    assert.equal(toolbar.style.top !== '', true);

    translateButton.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: true }));

    assert.deepEqual(translateCalls, [{
        text: 'The quick brown fox',
        x: 180,
        y: 220
    }]);
    assert.equal(isTranslatorUiClickPath([translateButton, toolbar]), true);
    assert.equal(isTranslatorUiClickPath([outsideElement]), false);
});

test('dismissTranslatorUiOnOutsideEvent closes popup during capture before page stops propagation', async () => {
    const shadowRoot = await ensureShadowRoot();
    const popup = document.createElement('div');
    popup.className = 'translator-popup';
    shadowRoot.appendChild(popup);
    setCurrentPopup(popup);

    const pageElement = document.createElement('button');
    document.body.appendChild(pageElement);
    pageElement.addEventListener('mousedown', event => {
        event.stopPropagation();
    });

    document.addEventListener('mousedown', dismissTranslatorUiOnOutsideEvent, true);
    pageElement.dispatchEvent(new window.MouseEvent('mousedown', {
        bubbles: true,
        composed: true
    }));
    document.removeEventListener('mousedown', dismissTranslatorUiOnOutsideEvent, true);

    assert.equal(shadowRoot.querySelector('.translator-popup'), null);
});
