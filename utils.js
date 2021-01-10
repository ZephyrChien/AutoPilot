'use strict';

var utils = {};
const fs = require('fs');
const config = require('./config');
const cmds = require('./cmds');

utils.auth = (headers) => {
   if (headers['user-agent'] != config.ua) {
       return false;
   }
   return true;
};

utils.ret404 = (resp) => {
    resp.statusCode = 404;
    resp.end();
};

utils.flush = (cache, fname) => {
    fs.writeFile(fname, JSON.stringify(cache), (err) => {
        if (err) {
            console.error('flush: error');
        }
    });
};

utils.make_json = (buf) => {
    let body = null;
    try {
        body = JSON.parse(buf);
    } catch (_) {
        console.error('invalid json');
    } finally {
        return body;
    }
};

utils.check_body = (body) => {
    let ret = false, msg = '';
    const t_list = ['ss','v2'];
    const cmd_list = ['new','mod','get','sub'];
    if (!body['t'] || t_list.indexOf(body['t']) == -1) {
        msg = 'api: unsupported t';
    } else if (!body['cmd'] || cmd_list.indexOf(body['cmd']) == -1) {
        msg = 'api: unsupported cmd';
    } else if (!body['data']) {
        msg = 'api: empty body';
    } else {ret = true;}
    return {ret, msg};
};

utils.make_resp = (resp, code, msg, resp_data) => {
    let resp_body = {
        code: code,
        msg: msg,
        data: resp_data
    };
    resp.setHeader('user-agent',config.ua);
    resp.setHeader('content-type','application/json');
    resp.write(JSON.stringify(resp_body,(key, val) => {
        if (val !== null) return val;
    }));
    resp.end();
};

utils.handler = (cache, resp, body) => {
    if (!(body.t in cache)) {
        const msg = 'cache: unknown t';
        utils.make_resp(resp, 0, msg, null);
        return;
    }
    switch (body.t) {
        case 'v2' :
            utils.handle_v2(cache['v2'], resp, body);
            break;
        case 'ss' :
            utils.handle_ss(cache['ss'], resp, body);
            break;
        default :
            break;
    }
};

utils.handle_v2 = (cache_v2, resp, body) => {
    if (body.cmd == 'sub') {
        let ret = cmds.gen_sub_v2(cache_v2, body.data);
        utils.make_resp(resp, ret.code, ret.msg, ret.data);
    } else {
        utils.handle_common(cache_v2, resp, body);
    }
};

utils.handle_ss = (cache_ss, resp, body) => {
    if (body.cmd == 'sub') {
        let ret = cmds.gen_sub_v2(cache_v2, body.data);
        utils.make_resp(resp, ret.code, ret.msg, ret.data);
    } else {
        utils.handle_common(cache_ss, resp, body);
    }
};

utils.handle_common = (cache, resp, body) => {
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
    utils.make_resp(resp, ret.code, ret.msg, ret.data);
    utils.flush(cache,config.swap_file[body.t]);
};

module.exports = utils;
