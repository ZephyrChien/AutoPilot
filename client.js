'use strict';

const http = require('http');
const utils = require('./utils');

const cache = {'v2':null, 'ss':null};
const config = utils.load_config_sync('client.json');
const public_key = utils.load_key_sync(config.public_key);

function make_resp(resp, code, msg, resp_data) {
    const resp_body = {
        'code': code,
        'msg': msg,
        'data': resp_data
    };
    resp.setHeader('user-agent',config.ua);
    resp.setHeader('content-type','application/json');
    resp.write(utils.client_encrypt(public_key, Buffer.from(JSON.stringify(resp_body,(key, val) => {
        if (val !== null) return val;
    }))));
    resp.end();
};

// cmds
const cmds = {};

const gen_pre_process_func = (rules) => {
    const pre_process_func = (sub) => {
        for (const key in rules) {
            utils.replace(sub, key, rules[key]);
        }
    };
    return pre_process_func;
}

cmds.sub = (t) => {
    const sub_v2 = (_sub) => {
        const mapper = {
            'add': 'listen', // sub.add equals config.inbounds[0].listen
            'port': 'port',
            'id': 'id',
            'net': 'network',
            'path': 'path'
        }
        const buf = utils.clone(cache.v2.inbounds[0]);
        for (const key in mapper) {
            _sub[key] = utils.search(buf, mapper[key])[0].toString();
        }
    }
    const sub = {};
    if (t == 'v2') {
        sub_v2(sub);
    }
    return {'code':1, 'msg': 'success', 'data': sub};
};

cmds.new = (t, data) => {
    cache[t] = utils.clone(data);
    return {'code':1, 'msg': 'success', 'data': null};
};

cmds.mod = (cache_t, data) => {
    const d = {};
    for (const key in data) {
        const n = utils.replace(cache_t, key, data[key]);
        d[key] = n;
    }
    return {'code':1, 'msg': 'success', 'data': d};
};

cmds.get = (cache_t, data) => {
    const buf = cache_t;
    const d = {};
    for (let i=0,len=data.length; i<len; i++) {
        const key = data[i];
        d[key] = utils.search(buf, key);
    }
    return {'code':1, 'msg': 'success', 'data': d};
};

function handle_common(t, cmd, data) {
    let ret;
    switch (cmd) {
        case 'new':
            ret = cmds.new(t, data);
            break;
        case 'mod':
            ret = cmds.mod(cache[t], data);
            break;
        case 'get':
            ret = cmds.get(cache[t], data);
            break;
        default:
            ret = {'code': 0, 'msg': 'unknown', 'data': null};
            break;
    }
    utils.flush(cache, config.swap_file[t]);
    return ret;
};

const handler = (resp, body) => {
    const {t, cmd, data} = body;
    if (!cache[t]) {
        const msg = 'cache: unknown t';
        make_resp(resp, 0, msg, null);
        return;
    }
    let ret;
    if (cmd == 'sub') {
        ret = cmds.sub(t);
    } else {
        ret = handle_common(t, cmd, data);
    }
    make_resp(resp, ret.code, ret.msg, ret.data);
};

const server = http.createServer((req, resp) => {
    const buf = [];
    if (!utils.check_ua(req.headers, config.ua)) {
        utils.ret404(resp);
        //req.removeAllListeners();
        return;
    }
    req.on('error', (err) => {
        console.error(err);
    });
    req.on('data', (chunk) => {
        buf.push(chunk);
    });
    req.on('end', () => {
        const buff = Buffer.concat(buf).toString();
        const body = utils.make_json(utils.client_decrypt(public_key, Buffer.from(buff, 'base64')));
        if (!body) {
            make_resp(resp, 0, null, null);
            return;
        }
        const {ret, msg} = utils.check_req_body(body);
        if (!ret) {
            make_resp(resp, 0, msg, null);
            return;
        }
        handler(resp, body);
    });
});

function main() {
    for (const t in config.swap_file) {
        utils.load_swap(cache, t, config.swap_file[t]);
    }
    console.log('http: start to serve');
    server.listen(config.server_port, config.server_addr);
}

main();