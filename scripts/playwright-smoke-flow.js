async page => {
    const webUrl = page.url();
    const baseUrl = webUrl.replace(/\/manual-tests\/web-smoke\.html$/, '');
    const artifactsDir = 'output/playwright/smoke/artifacts';

    const assert = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };

    const screenshotPath = name => `${artifactsDir}/${name}`;
    const hasHost = targetPage => targetPage.evaluate(() => !!document.getElementById('translator-extension-host'));

    await page.waitForURL(webUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.getByText('metamorphosis', { exact: true }).dblclick();
    await page.waitForFunction(() => !!document.getElementById('translator-extension-host'));
    await page.screenshot({ path: screenshotPath('web-smoke.png'), fullPage: true });

    const currentContext = page.context();
    await page.getByRole('link', { name: 'Open the Markdown smoke file' }).click();
    await page.waitForURL(/mdviewer\.html/);
    await page.waitForFunction(() => document.title === 'reader-smoke.md');
    await page.waitForFunction(() => document.body.innerText.includes('reference-note.markdown'));

    const markdownChecks = await page.evaluate(() => ({
        onclickRemoved: document.querySelector('#mdContent button')?.getAttribute('onclick') === null,
        javascriptHrefRemoved: document.querySelector('#mdContent a[href^="javascript:"]') === null,
        scriptExecuted: window.translaterMdScriptExecuted === true,
        imageSrc: document.querySelector('#mdContent img')?.src || '',
        fileBrowserText: document.getElementById('fileBrowserContainer')?.innerText || ''
    }));

    assert(markdownChecks.onclickRemoved, 'Markdown sanitization did not remove inline onclick.');
    assert(markdownChecks.javascriptHrefRemoved, 'Markdown sanitization did not remove javascript: href.');
    assert(markdownChecks.scriptExecuted === false, 'Markdown script tag executed unexpectedly.');
    assert(markdownChecks.imageSrc === `${baseUrl}/manual-tests/diagram.svg`, 'Markdown relative image did not resolve correctly.');
    assert(markdownChecks.fileBrowserText.includes('viewer-smoke.pdf'), 'Markdown file browser is missing the PDF entry.');

    await page.getByText('metamorphosis', { exact: true }).dblclick();
    await page.waitForFunction(() => !!document.getElementById('translator-extension-host'));
    await page.screenshot({ path: screenshotPath('markdown-smoke.png'), fullPage: true });

    const popupPromise = currentContext.waitForEvent('page');
    await page.getByRole('link', { name: 'Open the PDF smoke file' }).click();
    const pdfPage = await popupPromise;

    await pdfPage.waitForLoadState('domcontentloaded');
    await pdfPage.waitForURL(/pdfviewer\.html/);
    await pdfPage.waitForFunction(() => document.title === 'viewer-smoke.pdf');
    await pdfPage.waitForFunction(() => document.body.innerText.includes('viewer-smoke.pdf'));
    await pdfPage.waitForFunction(() => document.getElementById('totalPages')?.textContent?.trim() === '2');

    const pdfChecks = await pdfPage.evaluate(() => {
        document.querySelector('[data-sidebar-panel="contents"]')?.click();
        return {
            fileBrowserText: document.getElementById('fileBrowserContainer')?.innerText || '',
            bodyText: document.body.innerText
        };
    });

    assert(pdfChecks.fileBrowserText.includes('reader-smoke.md'), 'PDF file browser is missing the primary Markdown file.');
    assert(pdfChecks.fileBrowserText.includes('reference-note.markdown'), 'PDF file browser is missing the sibling Markdown file.');
    assert(pdfChecks.bodyText.includes('Overview'), 'PDF outline is missing the Overview bookmark.');
    assert(pdfChecks.bodyText.includes('Notes'), 'PDF outline is missing the Notes bookmark.');

    await pdfPage.screenshot({ path: screenshotPath('pdf-smoke.png'), fullPage: true });

    assert(await hasHost(page), 'Markdown viewer did not expose the translator host after interaction.');

    return {
        webUrl,
        markdownUrl: page.url(),
        pdfUrl: pdfPage.url(),
        screenshots: [
            screenshotPath('web-smoke.png'),
            screenshotPath('markdown-smoke.png'),
            screenshotPath('pdf-smoke.png')
        ],
        checks: [
            'web content script injection',
            'markdown viewer redirect',
            'markdown sanitization and relative paths',
            'pdf viewer redirect',
            'pdf outline and sibling file list'
        ]
    };
}
