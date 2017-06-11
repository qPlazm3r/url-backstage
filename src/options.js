"use strict";

console.log('URL BACKSTAGE OPTIONS');

const ge = id => document.getElementById(id);
const msg = (message, callback) => { chrome.runtime.sendMessage(message, callback); };

window.addEventListener('load', () => {
    let outCountDB = ge('db-count');
    let btnExportDB = ge('db-export-btn');
    let btnImportDB = ge('db-import-btn');
    let btnClearDB = ge('db-clear-btn');

    msg({
        type: 'countDB'
    }, response => {
        outCountDB.innerHTML = response.count;
    });
    btnExportDB.addEventListener('click', () => msg({
        type: 'exportDB'
    }, response => {
        if (!response) return;
        let a = document.createElement('A');
        let json = encodeURIComponent(JSON.stringify(response, null, '\t'));
        a.setAttribute('download', `UrlBackstage-${new Date().toISOString().match(/\w/g).join('')}.json`);
        a.setAttribute('href', `data:text/json;charset=utf-8,${json}`);
        a.click();
    }));
    btnImportDB.addEventListener('change', event => {
        let file = event.target.files[0];
        if (!file) return;
        let fr = new FileReader();
        fr.onload = event => msg({
            type: 'importDB',
            objects: JSON.parse(event.target.result)
        }, response => {
            outCountDB.innerHTML = response.count;
        });
        fr.readAsText(file);
    });
    btnClearDB.addEventListener('click', event => {
        let yes = confirm('Delete all data from database?');
        if (yes) msg({
            type: 'clearDB'
        }, response => {
            outCountDB.innerHTML = 0;
        });
    });
});