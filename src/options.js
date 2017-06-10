"use strict";

console.log('URL BACKSTAGE OPTIONS');

const ge = id => document.getElementById(id);
const msg_ = (message, callback) => (() => { chrome.runtime.sendMessage(message, callback); });

window.addEventListener('load', () => {
    let outCountDB = ge('db-count');
    let btnExportDB = ge('db-export-btn');

    msg_({
        type: 'countDB'
    }, response => {
        outCountDB.innerHTML = response.count;
    })();
    btnExportDB.addEventListener('click', msg_({
        type: 'exportDB'
    }, response => {
        if (!response) return;
        let a = document.createElement('A');
        let json = encodeURIComponent(JSON.stringify(response, null, '\t'));
        a.setAttribute('download', `UrlBackstage-${new Date().toISOString().match(/\w/g).join('')}.json`);
        a.setAttribute('href', `data:text/json;charset=utf-8,${json}`);
        a.click();
    }));
});