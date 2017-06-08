"use strict";

/** Database */
let db = null;

/** Initialize database on startup */
const initDB = () => {
    if (db) return;
    let dbrq = indexedDB.open('UrlBackstage', 1);
    dbrq.onupgradeneeded = event => {
        db = event.target.result;
        let store = db.createObjectStore('Links', { keyPath: 'shortUrl' });
        store.createIndex('longUrl', 'longUrl', { 'unique': false });
    };
    dbrq.onsuccess = event => {
        db = event.target.result;
    };
};

/**
 * Get data from DB
 * If no such key, load and store it
 * @param url {string} Short URL to lookup
 * @param loader {Function} Function to load data if not exists
 */
const getFromDBOrLoad = (url, loader) => new Promise(resolve => {
    let url_noprotocol = url.match(/^[a-z]+:\/\/(.+)/)[1];
    if (!db) throw {name: 'NO DB =(', message: 'DA BLYAT'};
    let store = db.transaction('Links', 'readonly').objectStore('Links');
    let urlRequest = store.get(url_noprotocol);
    urlRequest.onsuccess = event => {
        let result = event.target.result;
        if (result) {
            result.longUrl.getter = 'cache';
            resolve(result.longUrl);
        }
        else loader(url).then(r => {
            let store = db.transaction('Links', 'readwrite').objectStore('Links');
            store.add({ shortUrl:url_noprotocol, longUrl:r });
            r.getter = 'vkapi';
            resolve(r);
        });
    };
});

/**
 * Try to do action, if error pass the test - relaunch later
 * @param action {Function} Promise to launch
 * @param test {Function} Which kinds of errors should relaunch promise
 */
const tryAgain = (action, test) => new Promise(resolve => {
    action().then(resolve).catch(error => {
        let timeout = test(error);
        if (typeof timeout !== 'number') throw error;
        setTimeout(() => {
            tryAgain(action, test).then(resolve);
            }, timeout);
    });
});

/**
 * Decodes HTML junk like &wtf;
 * @param str {string} String to decode
 * @return {string}
 */
const decodeHTMLEntities = str => {
    const decoder = document.createElement('div');
    decoder.innerHTML = str;
    return decoder.innerText;
};

/**
 * Resolve long URL using VK API
 * @param href {string} Link to resolve
 */
const vkApiCheckLink = href => new Promise(onlinkready => {
    const vk_api = 'https://api.vk.com/method/utils.checkLink?url=';
    let xhr = new XMLHttpRequest();
    // No UTF-8 =(
    xhr.overrideMimeType('text/plain; charset=windows-1251');
    xhr.open('GET', vk_api + encodeURIComponent(href));
    xhr.onreadystatechange = () => {
        if (xhr.readyState !== xhr.DONE) return;
        if (xhr.status !== 200) throw { name: 'HTTP', code: xhr.status, message: xhr.statusText };
        let r = JSON.parse(xhr.responseText);
        if (r.error) throw { name: 'VK API', code: r.error.error_code, message: r.error.error_msg };
        if (r.response.status === 'processing') throw { name: 'Timeout', message: 'Try again later' };
        r.response.link = decodeHTMLEntities(r.response.link);
        onlinkready(r.response);
    };
    xhr.send();
});

/**
 * Test if error may disappear after some time
 * @param error {Error} Error to test
 * @return {number|boolean}
 */
const vkNeedRelaunch = error => {
    console.log(error);
    if ((error.name === 'HTTP') && (error.code >= 500)) return 5000;
    if (error.name === 'VK API') return 3000;
    if (error.name === 'Timeout') return 2000;
    return false;
};

// -- Action --

console.log("URL BACKSTAGE BACKGROUND");
chrome.runtime.onInstalled.addListener(initDB);
chrome.runtime.onStartup.addListener(initDB);
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!db) {
        sendResponse({error:'BLEAT NO DB'});
        return;
    }
    // console.log('Rqst', request);
    if (request.type === 'getLongUrl') {
        tryAgain(() => {
            return getFromDBOrLoad(request.shortUrl, vkApiCheckLink);
            }, vkNeedRelaunch
        // getFromDBOrLoad(request.shortUrl, vkApiCheckLink
        ).then(response => {
            // console.log("RSP", response);
            sendResponse(response);
        }).catch(error => {
            console.log("ERR", error);
            sendResponse({error});
        });
    }
    // For async response
    return true;
});
