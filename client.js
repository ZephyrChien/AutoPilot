'use strict';

const http = require('http');
const utils = require('./utils');

var cache = {};
var config = {};

const make_resp = (resp, code, msg, resp_data) => {
    let resp_body = {
        code: code,
        msg: msg,
        data: resp_data
    };
    resp.setHeader('user-agent',config.ua);
    resp.setHeader('content-type','application/json');
    resp.write(utils.client_encrypt(config.public_key, JSON.stringify(resp_body,(key, val) => {
        if (val !== null) return val;
    })));
    resp.end();
};

// cmds
var cmds = {};

const gen_pre_process_func = (rules) => {
    const pre_process_func = (sub) => {
        for (const key in rules) {
            utils.replace(sub, key, rules[key]);
        }
    };
    return pre_process_func;
}

cmds.sub = (cache) => {
    /*
        'v': '2',
        'ps': '',
        'add': '',
        'port': '',
        'id': '',
        'aid': '1',
        'net': '',
        'type': 'none',
        'host': '',
        'path': '',
        'tls': 'tls'
    }
    */
    let sub = {};
    let mapper = {
        'add': 'listen', // sub.add equals config.inbounds[0].listen
        'port': 'port',
        'id': 'id',
        'net': 'network',
        'path': 'path'
    }
    let buf = utils.clone(cache);
    let inbounds = utils.search(buf, 'inbounds');
    if (!inbounds.length) {
        return {'code':0, 'msg': 'no available inbounds', 'data': null};
    }
    let buff = inbounds[0][0];
    for (const key in mapper) {
        sub[key] = utils.search(buff, mapper[key])[0].toString();
    }
    //gen_pre_process_func(data)(sub);
    //let b = Buffer.from(JSON.stringify(sub));
    //let sub_base64 = 'vmess://' + b.toString('base64');
    return {'code':1, 'msg': 'success', 'data': sub};
};

cmds.new = (cache, data) => {
    cache = utils.clone(data);
    return {'code':1, 'msg': 'success', 'data': null};
};

cmds.mod = (cache, data) => {
    let d = {};
    for (const key in data) {
        let n = utils.replace(cache, key, data[key]);
        d[key] = n;
    }
    cache = utils.clone(cache);
    return {'code':1, 'msg': 'success', 'data': d};
};

cmds.get = (cache, data) => {
    let buf = utils.clone(cache);
    let d = {};
    for (let i=0,len=data.length; i<len; i++) {
        let key = data[i];
        d[key] = utils.search(buf,key);
    }
    return {'code':1, 'msg': 'success', 'data': d};
};

// handlers
const handler = (cache, resp, body) => {
    if (!(body.t in cache)) {
        const msg = 'cache: unknown t';
        make_resp(resp, 0, msg, null);
        return;
    }
    switch (body.t) {
        case 'v2' :
            handle_v2(cache['v2'], resp, body);
            break;
        case 'ss' :
            handle_ss(cache['ss'], resp, body);
            break;
        default :
            break;
    }
};

const handle_v2 = (cache_v2, resp, body) => {
    if (body.cmd == 'sub') {
        let ret = cmds.sub(cache_v2);
        make_resp(resp, ret.code, ret.msg, ret.data);
    } else {
        handle_common(cache_v2, resp, body);
    }
};

const handle_ss = (cache_ss, resp, body) => {
    if (body.cmd == 'sub') {
        let ret = cmds.sub(cache_v2, body.data);
        make_resp(resp, ret.code, ret.msg, ret.data);
    } else {
        handle_common(cache_ss, resp, body);
    }
};

const handle_common = (cache, resp, body) => {
    let ret = {};
    switch (body.cmd) {
        case 'new':
            ret = cmds.new(cache, body.data);
            break;
        case 'mod':
            ret = cmds.mod(cache, body.data);
            break;
        case 'get':
            ret = cmds.get(cache, body.data);
            break;
        default:
            ret = {'code': 0, 'msg': 'unknown', 'data': null};
            break;
    }
    make_resp(resp, ret.code, ret.msg, ret.data);
    utils.flush(cache, config.swap_file[body.t]);
};

const server = http.createServer((req, resp) => {
    let buf = [];
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
        const buff = Buffer.concat(buf);
        const body = utils.make_json(utils.client_decrypt(config.public_key, buff));
        if (!body) {
            make_resp(resp, 0, msg, null);
            return;
        }
        const {ret, msg} = utils.check_req_body(body);
        if (!ret) {
            make_resp(resp, 0, msg, null);
            return;
        }
        handler(cache, resp, body);
    });
});

function main() {
    config = utils.read_config_sync('client.json');
    for (const key in config.swap_file) {
        utils.load_swap(cache, key, config.swap_file[key]);
    }
    console.log('http: start to serve');
    server.listen(config.server_port, config.server_addr);
}

main();