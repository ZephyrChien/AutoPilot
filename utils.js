'use strict';

var utils = {};
const fs = require('fs');
const uuid = require('uuid');
const crypto = require('crypto');

utils.uuid = () => {
    return uuid.v4();
}

utils.md5sum = (buf) => {
    return crypto.createHash('md5').update(buf).digest('hex');
};

utils.base64 = (buf) => {
    let buff;
    if (typeof buf == 'string') {
        buff = Buffer.from(buf);
    } else {
        buff = Buffer.from(JSON.stringify(buf));
    }
    return buff.toString('base64');
};

utils.client_encrypt = (pub, buf) => {
    const enc =  crypto.publicEncrypt({
        'key': pub,
        'padding': crypto.constants.RSA_PKCS1_PADDING
    }, buf);
    return enc.toString('base64');
}

utils.client_decrypt = (pub, buf) => {
    let plain = null;
    try {
        plain = crypto.publicDecrypt({
            'key': pub,
            'padding': crypto.constants.RSA_PKCS1_PADDING,
            'encoding': 'base64'
        }, buf);
    } catch(_) {
    } finally {
        return plain;
    }
}

utils.server_encrypt = (key, buf) => {
    const enc =  crypto.privateEncrypt({
        'key': key,
        'padding': crypto.constants.RSA_PKCS1_PADDING
    }, buf);
    return enc.toString('base64');
}

utils.server_decrypt = (key, buf) => {
    let plain = null;
    try {
        plain = crypto.privateDecrypt({
            'key': key,
            'padding': crypto.constants.RSA_PKCS1_PADDING,
            'encoding': 'base64'
        }, buf);
    } catch(_) {
    } finally {
        return plain;
    }
}

utils.clone = (buf) => {
    return JSON.parse(JSON.stringify(buf));
};

utils.search = (buf, key) => {
    let v = [];
    const s = (b,k,v) => {
        if (b instanceof Array) {
            for (let i=0,len=b.length; i<len; i++){
                s(b[i],k,v);
            }
        } else if (b instanceof Object) {
            if (k in b) {
                v.push(b[k]);
            }
            for (const kk in b) {
                s(b[kk],k,v);
            }
        }
    }
    s(buf,key,v);
    return v;
};

utils.replace = (buf, key, val) => {
    let flag = 0;
    const s = (b,k,v) => {
        if (b instanceof Array) {
            for (let i=0,len=b.length; i<len; i++){
                s(b[i],k,v);
            }
        } else if (b instanceof Object) {
            if (k in b) {
                b[k] = v;
                flag += 1;
            }
            for (const kk in b) {
                s(b[kk],k,v);
            }
        }
    }
    s(buf,key,val);
    return flag;
};

utils.check_ua = (headers, ua) => {
   if (headers['user-agent'] != ua) {
       return false;
   }
   return true;
};

utils.check_date = (t) => {
    let month = new Date().getMonth() + 1;
    let token = utils.md5sum(month.toString());
    if (t != token) {
        return false;
    }
    return true;
}

utils.check_req_body = (body) => {
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

utils.check_form = (form) => {
    let ret = false, msg = '';
    const t = form.get('proto');
    const ch = form.get('channel');
    const t_list = ['ss','v2'];
    const ch_list = ['cmcc', 'cucc', 'ctcc', 'auto'];
    if (!t || t_list.indexOf(t) == -1) {
        msg = 'sub: unsupported t';
    } else if (!ch || ch_list.indexOf(ch) == -1) {
        msg = 'sub: unsupported ch';
    } else {ret = true;}
    return {ret, msg};
};

utils.ret404 = (resp) => {
    resp.statusCode = 404;
    resp.end();
};

utils.read_config_sync = (fname) => {
    let buf, config;
    try {
        buf = fs.readFileSync(fname);
    } catch(err) {
        console.error(err);
        process.exit(1);
    } finally {
        if (!(config = utils.make_json(buf))) {
            console.error ('conf: load failed');
            process.exit(1);
        }
        console.log('conf: load %s', fname);
    }
    return config;
};

utils.load_swap = (cache, tag, fname) => {
    fs.readFile(fname, (err, buf) => {
        if (err) {
            console.error(err);
            process.exit(1);
        }
        if (!(cache[tag] = utils.make_json(buf))) {
            console.error('swap: load failed');
            process.exit(1);
        }
        console.log('swap: load %s', fname);
    })
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

utils.parse_url = (_url) => {
    const url = new URL(_url);
    const proto = url.protocol.replace(':', '');
    const host = url.hostname;
    const port = url.port;
    const path = url.pathname;
    return {proto, host, port, path};
}

utils.get_real_ip = (req) => {
    let ip = req.headers['cf-connecting-ip'];
    if (!ip) ip = req.headers['x-forwarded-for'].split(',')[0].trim();
    if (!ip) ip = req.socket.remoteAddress;
    return ip;
}

module.exports = utils;