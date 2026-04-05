import { JSDOM } from 'jsdom';

function setGlobal(name, value) {
    Object.defineProperty(globalThis, name, {
        value,
        configurable: true,
        writable: true
    });
}

export function setupDom(html = '<!doctype html><html><body></body></html>', url = 'https://example.com/') {
    const dom = new JSDOM(html, {
        url,
        pretendToBeVisual: true
    });

    setGlobal('window', dom.window);
    setGlobal('document', dom.window.document);
    setGlobal('navigator', dom.window.navigator);
    setGlobal('Node', dom.window.Node);
    setGlobal('NodeFilter', dom.window.NodeFilter);
    setGlobal('DOMParser', dom.window.DOMParser);
    setGlobal('HTMLElement', dom.window.HTMLElement);
    setGlobal('Event', dom.window.Event);
    setGlobal('MouseEvent', dom.window.MouseEvent);
    setGlobal('Range', dom.window.Range);

    Object.defineProperty(dom.window, 'innerWidth', {
        value: 1280,
        configurable: true,
        writable: true
    });
    Object.defineProperty(dom.window, 'innerHeight', {
        value: 720,
        configurable: true,
        writable: true
    });

    return dom;
}

export function teardownDom(dom) {
    dom?.window?.close();
    [
        'window',
        'document',
        'navigator',
        'Node',
        'NodeFilter',
        'DOMParser',
        'HTMLElement',
        'Event',
        'MouseEvent',
        'Range',
        'chrome',
        'Audio',
        'speechSynthesis'
    ].forEach(key => {
        delete globalThis[key];
    });
}

export function installChromeStub(sendMessageHandler = async () => undefined) {
    const chrome = {
        runtime: {
            id: 'test-extension',
            getURL(path) {
                return `chrome-extension://test/${path}`;
            },
            async sendMessage(message) {
                return sendMessageHandler(message);
            }
        },
        tabs: {
            create() {}
        }
    };

    setGlobal('chrome', chrome);
    return chrome;
}

export function installSpeechSynthesisStub() {
    const speechSynthesisStub = {
        speaking: false,
        speakCalls: [],
        cancelCalls: 0,
        getVoices() {
            return [{ name: 'Samantha', lang: 'en-US' }];
        },
        speak(utterance) {
            this.speakCalls.push(utterance);
        },
        cancel() {
            this.cancelCalls += 1;
        },
        addEventListener() {},
        removeEventListener() {}
    };

    window.speechSynthesis = speechSynthesisStub;
    setGlobal('speechSynthesis', speechSynthesisStub);
    return speechSynthesisStub;
}

export function installAudioStub({ reject = false } = {}) {
    class FakeAudio {
        static playCalls = [];

        constructor(url) {
            this.url = url;
        }

        play() {
            FakeAudio.playCalls.push(this.url);
            return reject ? Promise.reject(new Error('Audio failed')) : Promise.resolve();
        }
    }

    window.Audio = FakeAudio;
    setGlobal('Audio', FakeAudio);
    return FakeAudio;
}

export function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return { promise, resolve, reject };
}
