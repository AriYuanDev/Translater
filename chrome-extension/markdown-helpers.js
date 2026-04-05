export function sanitizeMarkdownHtml(html, documentRef = document) {
    const template = documentRef.createElement('template');
    template.innerHTML = html;

    template.content.querySelectorAll('script, iframe, object, embed, link, meta, style, base, form').forEach(node => {
        node.remove();
    });

    template.content.querySelectorAll('*').forEach(element => {
        Array.from(element.attributes).forEach(attribute => {
            const name = attribute.name.toLowerCase();
            const value = attribute.value.trim();
            if (name.startsWith('on') || name === 'srcdoc') {
                element.removeAttribute(attribute.name);
                return;
            }
            if ((name === 'href' || name === 'src' || name === 'xlink:href' || name === 'formaction') && /^javascript:/i.test(value)) {
                element.removeAttribute(attribute.name);
            }
        });
    });

    return template.innerHTML;
}

export function rewriteRelativePaths(container, baseUrl) {
    container.querySelectorAll('img[src]').forEach(img => {
        const src = img.getAttribute('src');
        if (src && !src.match(/^(https?:|data:|file:)/i)) {
            img.src = new URL(src, baseUrl).href;
        }
    });

    container.querySelectorAll('a[href]').forEach(anchor => {
        const href = anchor.getAttribute('href');
        if (href && !href.match(/^(https?:|data:|file:|#|mailto:|javascript:)/i)) {
            anchor.href = new URL(href, baseUrl).href;
        }
        if (href && !href.startsWith('#')) {
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
        }
    });

    return container;
}
