'use strict';

var cmds = {};

const clone = (buf) => {
    return JSON.parse(JSON.stringify(buf));
}

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
    if (v.length) {
        return v;
    }
    return null;
}

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
}

cmds.gen_sub_v2 = (buf) => {

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
    return {'code':1, 'msg': 'success', 'data': d};
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