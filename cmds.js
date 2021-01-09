'use strict';

var cmds = {};

const clone = (buf) => {
    return JSON.parse(JSON.stringify(buf));
}

const search = (buf, key) => {
    let v = {};
    const s = (b,k,v) => {
        if (k in b) {
            v[k] = b[k];
            return;
        }
        if (b instanceof Object) {
            for (const kk in b) {
                s(kk,k,v);
            }
        }
        if (b instanceof Array) {
            for (let i=0,len=b.length; i<len; i++){
                s(b[i],k,v);
            }
        }
    }
    s(buf,key,v);
    if (key in v) {
        return v[key];
    }
    return null;
}

cmds.gen_sub_v2 = (buf) => {

};

cmds.new = (cache, data) => {
    cache = clone(data);
    return {'code':1, 'msg': 'success', 'data': null};
};

cmds.mod = (cache, data) => {
    for (const key in data) {
        cache[key] = clone(data[key]);
    }
};

cmds.get = (cache, data) => {
    let d = {};
    for (let i=0,len=data.length; i<len; i++) {
        let key = data[i];
        d[key] = search(cache,key);
    }
    return {'code':1, 'msg': 'success', 'data': d};
};

module.exports = cmds;