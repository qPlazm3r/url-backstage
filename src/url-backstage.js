"use strict";

console.log("URL-BACKSTAGE INJECTED");

// Can get hidden link directly from arguments
// Purpose: hiding original HTTP referer header
const dereferers = [
    /^https?:\/\/tjournal\.ru\/redirect.*?[?&]url=([a-z]+%[^&]+)/,
    /^https?:\/\/vk\.com\/away\.php.*?[?&]to=([a-z]+%[^&]+)/,
];

// Can get hidden link only after visiting short link or via special services
// Purpose: making short link from long one, collecting statistics
const shorteners = [
    /^https?:\/\/bitly\.com\/[0-9A-Za-z_.-]+/,
    /^https?:\/\/bit\.ly\/[0-9A-Za-z_.-]+/,
    /^https?:\/\/clck\.ru\/[0-9A-Za-z_.-]+/,
    /^https?:\/\/fb\.me\/[0-9A-Za-z_.-]+/,
    /^https?:\/\/goo\.gl\/[0-9A-Za-z_.-]+/,
    /^https?:\/\/link\.ac\/[0-9A-Za-z_.-]+/,
    /^https?:\/\/ow\.ly\/[0-9A-Za-z_.-]+/,
    /^https?:\/\/tinyurl\.com\/[0-9A-Za-z_.-]+/,
    /^https?:\/\/u\.to\/[0-9A-Za-z_.-]+/,
    /^https?:\/\/vk\.cc\/[0-9A-Za-z_.-]+/,
];

const decodeURIWithCharset = uri => {
    const decoder = new TextDecoder(document.characterSet);
    let parts = uri.match(/(%[0-9a-f]{2}|.)/ig);
    let data = Uint8Array.from(parts, c => ((c[0] === '%') 
        ? parseInt(c.substr(1), 16) 
        : c.charCodeAt(0)));
    return decoder.decode(data);
};


const inspectHref = href => new Promise(resolve => {
    if (!href) return;
    let changed = false;
    for (let d of dereferers) {
        let m = href.match(d);
        if (!m) continue;
        href = /^[a-z]+:\/\//.test(m[1]) ? m[1] : decodeURIWithCharset(m[1]);
        changed = true;
        break;
    }
    for (let s of shorteners) {
        if (!s.test(href)) continue;
        chrome.runtime.sendMessage({
            type: 'getLongUrl',
            shortUrl: href
        }, response => {
            console.log(response);
            //if (!response) throw chrome.runtime.lastError;
            resolve(response);
        });
        return;
    }
    if (changed) resolve({link: href});
});

const findLinks = el => {
    let links = el.querySelectorAll('a[href]:not(.urlbs-found)');
    for (let a of links) {
        a.classList.add('urlbs-found');
        inspectHref(a.href).then(r => {
            a.title = r && r.link;
            a.classList.add('urlbs-done');
            // console.log(r);
        });
    }
};

const mutobs = new MutationObserver(mutations => {
    for (let m of mutations) findLinks(m.target);
});

// -- Action --

findLinks(document.body);
mutobs.observe(document.body, {subtree: true, childList: true});
console.log("URL-BACKSTAGE OK");
