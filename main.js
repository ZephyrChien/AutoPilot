'use strict';

const fs = require('fs');
const http = require('http');
const utils = require('./utils')
const config = require('./config');

var cache = {};

const server = http.createServer((req, resp) => {
    let buf = [];
    let body;
    req.on('error', (err) => {
        console.error(err);
    });
    req.on('data', (chunk) => {
        buf.push(chunk);
    });
    req.on('end', () => {
        Buffer.concat(buf);
        body = utils.make_json(buf);
        const {ret, msg} = utils.check_body(body);
        if (!ret) {
            utils.make_resp(resp, 0, msg, null);
            return;
        }
        utils.handler(cache, resp, body);
    });
    if (!utils.auth(req.headers)) {
        utils.ret404(resp);
        req.removeAllListeners();
    }
});

const load_swap = (tag, fname) => {
    fs.readFile(fname, (err, buf) => {
        if (err) {
            console.error(err);
            process.exit(1);
        }
        if (!(cache[tag] = utils.make_json(buf))) {
            console.error('swap: load failed');
            process.exit(1);
        }
        console.log('swap: load %s',fname);
    })
}

function main() {
    for (const key in config.swap_file) {
        load_swap(key, config.swap_file[key]);
    }
    console.log('http: start to serve');
    server.listen(config.server_port,config.server_ip);
}

main();