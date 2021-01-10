'use strict';

var cmds = {};

const clone = (buf) => {
    return JSON.parse(JSON.stringify(buf));
};

const search = (buf, key) => {
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

const replace = (buf, key, val) => {
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


const gen_pre_process_func = (rules) => {
    const pre_process_func = (sub) => {
        for (const key in rules) {
            replace(sub, key, rules[key]);
        }
    };
    return pre_process_func;
}

cmds.gen_sub_v2 = (cache, data) => {
    let sub = {
        'v': '2',
        'ps': '',
        'add': '',
        'port': '',
        'id': '',
        'aid': '2',
        'net': '',
        'type': 'none',
        'host': '',
        'path': '',
        'tls': 'tls'
    }
    let mapper = {
        'add': 'listen', // sub.add equals config.inbounds[0].listen
        'port': 'port',
        'id': 'id',
        'net': 'network',
        'path': 'path'
    }
    let buf = clone(cache);
    let inbounds = search(buf, 'inbounds');
    if (!inbounds.length) {
        return {'code':0, 'msg': 'no available inbounds', 'data': null};
    }
    let buff = inbounds[0][0];
    for (const key in mapper) {
        sub[key] = search(buff, mapper[key])[0].toString();
    }
    gen_pre_process_func(data)(sub);
    let b = Buffer.from(JSON.stringify(sub));
    let sub_base64 = 'vmess://' + b.toString('base64');
    return {'code':1, 'msg': 'success', 'data': sub_base64};
};

cmds.new = (cache, data) => {
    cache = clone(data);
    return {'code':1, 'msg': 'success', 'data': null};
};

cmds.mod = (cache, data) => {
    let d = {};
    for (const key in data) {
        let n = replace(cache, key, data[key]);
        d[key] = n;
    }
    cache = clone(cache);
    return {'code':1, 'msg': 'success', 'data': d};
};

cmds.get = (cache, data) => {
    let buf = clone(cache);
    let d = {};
    for (let i=0,len=data.length; i<len; i++) {
        let key = data[i];
        d[key] = search(buf,key);
    }
    return {'code':1, 'msg': 'success', 'data': d};
};

module.exports = cmds;