'use strict';

const http = require('http');
const utils = require('./utils');

const cache = {'v2':null, 'ss':null};
const config = utils.load_config_sync('client.json');
const public_key = utils.load_key_sync(config.public_key);

const logger = new utils.logger(config.log_file, true, false);

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

const gen_pre_process_func = (rules) => {
    const pre_process_func = (sub) => {
        for (const key in rules) {
            utils.replace(sub, key, rules[key]);
        }
    };
    return pre_process_func;
}

// cmds
const cmds = {};

cmds.sub = (t) => {
    const sub_v2 = (_sub) => {
        const buf = utils.clone(cache.v2.inbounds[0]);
        const mapper = {
            'add': 'listen', // sub.add equals config.inbounds[0].listen
            'port': 'port',
            'id': 'id',
            'net': 'network',
            'path': 'path'
        }
        for (const key in mapper) {
            const v = utils.search(buf, mapper[key]);
            if (!v.length) {
                if (key == 'net') _sub[key] = 'tcp';
                if (key == 'path') _sub[key] = '';
                continue
            }
            _sub[key] = v[0].toString();
        }
    }
    const sub_ss = (_sub) => {
        const buf = utils.clone(cache.ss);
        const keys = ['server', 'server_port', 'method', 'password'];
        for (const key of keys) {
            _sub[key] = buf[key];
        }
    }
    const sub = {};
    if (t == 'v2') {
        sub_v2(sub);
    } else if (t == 'ss') {
        sub_ss(sub);
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

const handler = (resp, body) => {
    const {t, cmd, data} = body;
    if (!cache[t]) {
        const msg = 'unsupported t';
        make_resp(resp, 0, msg, null);
        return;
    }
    let ret;
    switch (cmd) {
        case 'sub':
            ret = cmds.sub(t);
            break;
        case 'new':
            ret = cmds.new(t, data);
            break;
        case 'get':
            ret = cmds.get(cache[t], data);
            break;
        case 'mod':
            ret = cmds.mod(cache[t], data);
            utils.flush(cache[t], config.swap_file[t]);
            break;
        default:
            ret = {'code': 0, 'msg': 'unsupported cmd', 'data': null};
            break;
    }
    make_resp(resp, ret.code, ret.msg, ret.data);
};

const server = http.createServer((req, resp) => {
    // write log
    const ip = utils.get_real_ip(req);
    const url = new URL(req.url, 'http://' + req.headers.host).href;
    logger.write(`http: ${ip} ${req.method} ${url}`);
    //
    const buf = [];
    if (!utils.check_ua(req.headers, config.ua) || req.method != 'POST') {
        utils.ret404(resp);
        //req.removeAllListeners();
        return;
    }
    req.on('error', (_) => {
        logger.write('http: bad request');
    });
    req.on('data', (chunk) => {
        const plain = utils.client_decrypt(public_key, Buffer.from(chunk.toString(),'base64'));
        if(plain === null) {
            utils.ret404(resp);
            req.removeAllListeners();
        }
        buf.push(plain);
    });
    req.on('end', () => {
        const buff = Buffer.concat(buf).toString();
        //const body = utils.make_json(utils.client_decrypt(public_key, Buffer.from(buff, 'base64')));
        const body = utils.make_json(buff);
        if (!body) {
            logger.write('api: corrupted data');
            make_resp(resp, 0, null, null);
            return;
        }
        const {ret, msg} = utils.check_req_body(body);
        if (!ret) {
            make_resp(resp, 0, msg, null);
            logger.write(`api: request body error, ${msg}`);
            return;
        }
        handler(resp, body);
        logger.write(`api: ${body.cmd} ${body.t}`);
    });
});

function main() {
    logger.write('app: start to serve');
    for (const t in config.swap_file) {
        utils.load_swap(cache, t, config.swap_file[t]);
    }
    server.listen(config.server_port, config.server_addr);
}

main();