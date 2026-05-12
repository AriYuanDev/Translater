export async function resetCurrentTabBrowserZoom(chromeApi = globalThis.chrome) {
    try {
        if (!chromeApi?.tabs?.getCurrent || !chromeApi?.tabs?.setZoom) {
            return;
        }

        const tab = await chromeApi.tabs.getCurrent();
        if (!tab?.id) return;

        await chromeApi.tabs.setZoom(tab.id, 1);
    } catch (error) {
        console.warn('[Translater] Unable to reset browser page zoom:', error);
    }
}
