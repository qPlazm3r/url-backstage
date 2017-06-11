"use strict";

class Cache {
    constructor(){
        this.dbName = 'UrlBackstage';
        this.dbVersion = 1;
        this.dbStore = 'Links';
        this.dbKey = 'shortUrl';
        this.dbIndex = ['longUrl', 'longUrl', { unique:false }];

        let rqst = indexedDB.open(this.dbName, this.dbVersion);
        rqst.onupgradeneeded = event => {
            this._db = event.target.result;
            let store = this._db.createObjectStore(this.dbStore, {keypath: this.dbKey});
            store.createIndex.apply(null, this.dbIndex);
        };
        rqst.onsuccess = event => {
            this._db = event.target.result;
        };
        rqst.onerror = event => {
            throw event.target.error;
        }
    }

    /**
     * General database read request
     * @param method {string} Request method
     * @param mode {'readonly','readwrite'} Transaction mode
     * @param args {Array} Request arguments
     * @return {Promise}
     */
    query(method, mode, ...args) {
        return new Promise(callback => {
            let store = this._db.transaction(this.dbStore, mode).objectStore(this.dbStore);
            let rqst = null;
            if (args.length) { rqst = store[method].apply(store, args); }
            else { rqst = store[method](); }
            rqst.onerror = event => {
                throw event.target.error;
            };
            rqst.onsuccess = event => {
                callback(event.target.result);
            };
        });
    }

    count() { return this.query('count', 'readonly'); }
    get(key) { return this.query('get', 'readonly', key); }
    all() { return this.query('getAll', 'readonly'); }
    add(obj) { return this.query('add', 'readwrite', obj); }
    update(obj) { return this.query('put', 'readwrite', obj); }
    clear() { return this.query('clear', 'readwrite'); }
    remove(key) { return this.query('delete', 'readwrite', key); }
    load(objects) {
        return new Promise((resolve, reject) => {
            for (let obj of objects) {
                this.update(obj).catch(reject);
            }
            this.count().then(resolve).catch(reject);
        });
    }
}

/** Database */
const cache = new Cache();

/**
 * Get data from DB
 * If no such key, load and store it
 * @param url {string} Short URL to lookup
 * @param loader {Function} Function to load data if not exists
 */
const getFromDBOrLoad = (url, loader) => new Promise((resolve, reject) => {
    let url_noprotocol = url.match(/^[a-z]+:\/\/(.+)/)[1];
    cache.get(url_noprotocol).then(result => {
        if (result) {
            result.longUrl.getter = 'cache';
            resolve(result.longUrl);
        } else loader(url).then(r => {
            cache.update({ shortUrl:url_noprotocol, longUrl:r }).catch(reject);
            r.getter = 'vkapi';
            resolve(r);
        }).catch(reject);
    }).catch(reject);
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
const vkApiCheckLink = href => new Promise((resolve, reject) => {
    const vk_api = 'https://api.vk.com/method/utils.checkLink?url=';
    let xhr = new XMLHttpRequest();
    // No UTF-8 =(
    xhr.overrideMimeType('text/plain; charset=windows-1251');
    xhr.open('GET', vk_api + encodeURIComponent(href));
    xhr.onreadystatechange = () => {
        if (xhr.readyState !== xhr.DONE) return;
        if (xhr.status !== 200) {
            reject({ name: 'HTTP', code: xhr.status, message: xhr.statusText });
            return;
        }
        let r = JSON.parse(xhr.responseText);
        if (r.error) {
            reject({ name: 'VK API', code: r.error.error_code, message: r.error.error_msg });
            return;
        }
        if (r.response.status === 'processing') {
            reject({ name: 'Timeout', message: 'Try again later' });
            return;
        }
        r.response.link = decodeHTMLEntities(r.response.link);
        resolve(r.response);
    };
    xhr.send();
});

/**
 * Test if error may disappear after some time
 * @param error {Error} Error to test
 * @return {number|boolean}
 */
const vkNeedRelaunch = error => {
    // console.log(error);
    if ((error.name === 'HTTP') && (error.code >= 500)) return 2000;
    if (error.name === 'VK API') return 3000;
    if (error.name === 'Timeout') return 3000;
    return false;
};

// -- Action --

console.log("URL BACKSTAGE BACKGROUND");
// chrome.runtime.onInstalled.addListener(initDB);
// chrome.runtime.onStartup.addListener(initDB);
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
        case 'getLongUrl':
            const getLoop = () => {
                getFromDBOrLoad(request.shortUrl, vkApiCheckLink)
                    .then(sendResponse)
                    .catch(error => {
                        let timeout = vkNeedRelaunch(error);
                        if (timeout) setTimeout(getLoop, timeout);
                        else sendResponse({error});
                    });
            };
            getLoop();
            break;

        case 'countDB':
            cache.count().then(count => sendResponse({count}));
            break;

        case 'importDB':
            cache.load(request.objects).then(count => { sendResponse({count}); });
            break;

        case 'exportDB':
            cache.all().then(sendResponse);
            break;

        case 'clearDB':
            cache.clear().then(sendResponse);
            break;

        default:
            sendResponse({error: 'Unknown request type in message: ' + request.type});
    }
    // For async response
    return true;
});
