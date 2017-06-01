"use strict";

console.log("URL-BACKSTAGE INJECTED");

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

const cache_getOrLoad = (db, url, loader) => new Promise((resolve, reject) => {
    let url_noprotocol = url.match(/^[a-z]+:\/\/(.+)/)[1];
    let tr = db.transaction('Links', 'readonly');
    let store = tr.objectStore('Links');
    let urlRequest = store.get(url_noprotocol);
    urlRequest.onsuccess = event => {
        let result = event.target.result;
        if (result) {
            resolve(result.longUrl);
        } else {
            loader(url).then(r => {
                let tr = db.transaction('Links', 'readwrite');
                let store = tr.objectStore('Links');
                store.add({ shortUrl:url_noprotocol, longUrl:r });
                resolve(r);
            });
        }
    };
});

const decodeURIWithCharset = uri => {
    const decoder = new TextDecoder(document.characterSet);
    let parts = uri.match(/(%[0-9a-f]{2}|.)/ig);
    let data = Uint8Array.from(parts, c => ((c[0] === '%') 
        ? parseInt(c.substr(1), 16) 
        : c.charCodeAt(0)));
    return decoder.decode(data);
}

const decodeHTMLEntities = str => {
    const decoder = document.createElement('div');
    decoder.innerHTML = str;
    return decoder.innerText;
}

const initLinksWatcher = (db) => {
    const url_pattern = /^https?:\/\/[\w.-]+\w+\//;

    const vkcc_checkLink = url => new Promise((resolve, reject) => {
        if (typeof url !== 'string') throw new TypeError('URL should be a string');
        if (!url_pattern.test(url)) throw new TypeError('Invalid URL: '+ url);
        const vk_api = 'https://api.vk.com/method/utils.checkLink?url=';
        let xhr = new XMLHttpRequest();
        xhr.open('GET', vk_api + encodeURIComponent(url));
        xhr.onreadystatechange = () => {
            if (xhr.readyState === xhr.DONE) {
                if (xhr.status === 200) {
                    let r = JSON.parse(xhr.responseText);
                    if (r.response) {
                        if (r.response.status === 'processing') {
                            setTimeout(() => { vkcc_checkLink(url); }, 2000);
                        } else {
                            r.response.link = decodeHTMLEntities(r.response.link);
                            resolve(r.response);
                        }
                    } else if (r.error) {
                        throw 'VK API error ' + r.error.error_code + 
                            ': ' + r.error.error_msg;
                    } else { 
                        throw 'VK API bad response ' + xhr.responseText;
                    }
                } else {
                    throw 'VK API response code ' + xhr.status;
                }
            }
        }
        xhr.send();
    });

    const findLinks = el => {
        let links = el.querySelectorAll('a[href^="/away.php"]');
        for (let a of links) {
            let to_enc = a.href.match(/[?&]to=([^&]+)/)[1];
            let search = decodeURIWithCharset(to_enc);
            if (/:\/\/vk\.cc\//.test(search)) {
                cache_getOrLoad(db, search, vkcc_checkLink).then(r => {
                    a.title = r.link;
                    // console.log(r);
                });
            } else {
                a.title = search;
            }
        }
    }

    const mutobs = new MutationObserver(mutations => {
        for (let m of mutations) {
            findLinks(m.target);
        }
    });

    findLinks(document.body);
    mutobs.observe(document.body, {subtree: true, childList: true});
    console.log("URL-BACKSTAGE OK");
}

initCache().then(initLinksWatcher);