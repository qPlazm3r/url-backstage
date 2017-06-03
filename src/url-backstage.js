"use strict";

console.log("URL-BACKSTAGE INJECTED");

// Can get hidden link directly from arguments
// Purpose: hiding original HTTP referer header
const dereferers = [
    /^https?:\/\/vk\.com\/away\.php.*?[?&]to=([a-z]+%[^&]+)/
];

// Can get hidden link only after visiting short link or via special services
// Purpose: making short link from long one, collecting statistics
const shorteners = [
    /^https?:\/\/vk\.cc\/[0-9A-Za-z_-]+/,
    /^https?:\/\/goo\.gl\/[0-9A-Za-z_-]+/,
    /^https?:\/\/tinyurl\.com\/[0-9A-Za-z_-]+/
];

const initCache = () => new Promise(onCacheReady => {
    const dbrq = indexedDB.open('UrlBackstage', 1);
    dbrq.onupgradeneeded = event => {
        let db = event.target.result;
        let store = db.createObjectStore('Links', { keyPath: 'shortUrl' });
        store.createIndex('longUrl', 'longUrl', {'unique': false});
    };
    dbrq.onsuccess = event => {
        let db = event.target.result;
        onCacheReady(db);
    };
});


const cache_getOrLoad = (db, url, loader) => new Promise(resolve => {
    let url_noprotocol = url.match(/^[a-z]+:\/\/(.+)/)[1];
    let tr = db.transaction('Links', 'readonly');
    let store = tr.objectStore('Links');
    let urlRequest = store.get(url_noprotocol);
    urlRequest.onsuccess = event => {
        let result = event.target.result;
        if (result) {
            resolve(result.longUrl);
            return;
        }
        loader(url).then(r => {
            let tr = db.transaction('Links', 'readwrite');
            let store = tr.objectStore('Links');
            store.add({ shortUrl:url_noprotocol, longUrl:r });
            resolve(r);
        });
    };
});

const decodeURIWithCharset = uri => {
    const decoder = new TextDecoder(document.characterSet);
    let parts = uri.match(/(%[0-9a-f]{2}|.)/ig);
    let data = Uint8Array.from(parts, c => ((c[0] === '%') 
        ? parseInt(c.substr(1), 16) 
        : c.charCodeAt(0)));
    return decoder.decode(data);
};

const decodeHTMLEntities = str => {
    const decoder = document.createElement('div');
    decoder.innerHTML = str;
    return decoder.innerText;
};

const initLinksWatcher = db => {
    const url_pattern = /^[0-9a-z]+?:\/\//;

    const vkcc_checkLink = href => new Promise(resolve => {
        if (typeof href !== 'string') throw new TypeError('URL should be a string');
        if (!url_pattern.test(href)) throw new TypeError('Invalid URL: '+ href);
        const vk_api = 'https://api.vk.com/method/utils.checkLink?url=';
        let xhr = new XMLHttpRequest();
        xhr.open('GET', vk_api + encodeURIComponent(href));
        xhr.onreadystatechange = () => {
            if (xhr.readyState !== xhr.DONE) return;
            if (xhr.status !== 200) throw 'VK API response code ' + xhr.status;
            let r = JSON.parse(xhr.responseText);
            if (r.error) throw 'VK API error ' + r.error.error_code +
                ': ' + r.error.error_msg;
            if (!r.response) throw 'VK API bad response ' + xhr.responseText;
            if (r.response.status === 'processing') {
                setTimeout(() => {
                    cache_getOrLoad(db, href, vkcc_checkLink).then(resolve);
                    }, 2500);
            } else {
                r.response.link = decodeHTMLEntities(r.response.link);
                resolve(r.response);
            }
        };
        xhr.send();
    });

    const inspectHref = href => new Promise(resolve => {
        if (!href) return;
        let changed = false;
        for (let d of dereferers) {
            let m = href.match(d);
            if (!m) continue;
            href = url_pattern.test(m[1]) ? m[1] : decodeURIWithCharset(m[1]);
            changed = true;
            break;
        }
        for (let s of shorteners) {
            if (!s.test(href)) continue;
            cache_getOrLoad(db, href, vkcc_checkLink).then(resolve);
            return;
        }
        if (changed) resolve({link: href});
    });

    const findLinks = el => {
        let links = el.querySelectorAll('a[href]');
        for (let a of links) inspectHref(a.href).then(r => {
            a.title = r.link;
            // console.log(r);
        });
    };

    const mutobs = new MutationObserver(mutations => {
        for (let m of mutations) findLinks(m.target);
    });

    findLinks(document.body);
    mutobs.observe(document.body, {subtree: true, childList: true});
    console.log("URL-BACKSTAGE OK");
};

initCache().then(initLinksWatcher);