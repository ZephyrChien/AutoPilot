'use strict';

const utils = {};
const fs = require('fs');
const uuid = require('uuid');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();


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

utils.passwd = (n) => {
    let buf = [];
    for (let i=0,t=Math.ceil(n/8); i<t; i++) {
        buf.push(Math.random().toString(36).substr(2,8));
    }
    buf = buf.join('').substr(0,n).split('');
    for (let i=0;i<n;i++) {
        if (Math.random() > 0.5) {
            buf[i] = buf[i].toUpperCase()
        }
    }
    return buf.join('')
}

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
            'padding': crypto.constants.RSA_PKCS1_PADDING
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
            'padding': crypto.constants.RSA_PKCS1_PADDING
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
    const v = [];
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
    let count = 0;
    const s = (b,k,v) => {
        if (b instanceof Array) {
            for (let i=0,len=b.length; i<len; i++){
                s(b[i],k,v);
            }
        } else if (b instanceof Object) {
            if (k in b) {
                b[k] = v;
                count += 1;
            }
            for (const kk in b) {
                s(b[kk],k,v);
            }
        }
    }
    s(buf,key,val);
    return count;
};

utils.check_ua = (headers, ua) => {
   if (headers['user-agent'] != ua) {
       return false;
   }
   return true;
};

utils.check_date = (t) => {
    const month = new Date().getMonth() + 1;
    const token = utils.md5sum(month.toString());
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
        msg = 'unknown t';
    } else if (!body['cmd'] || cmd_list.indexOf(body['cmd']) == -1) {
        msg = 'unknown cmd';
    } else if (!body['data']) {
        msg = 'empty data';
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
        msg = 'unsupported t';
    } else if (!ch || ch_list.indexOf(ch) == -1) {
        msg = 'unsupported ch';
    } else {ret = true;}
    return {ret, msg};
};

utils.ret404 = (resp) => {
    resp.statusCode = 404;
    resp.end();
};

utils.load_config_sync = (fname) => {
    let buf, config;
    try {
        buf = fs.readFileSync(fname);
    } catch(err) {
        console.error(err);
        process.exit(1);
    } finally {
        if (!(config = utils.make_json(buf))) {
            process.exit(1);
        }
    }
    return config;
};

utils.load_key_sync = (fname) => {
    let buf;
    try {
        buf = fs.readFileSync(fname);
    } catch(err) {
        console.error(err);
        process.exit(1);
    } finally {
        return buf;
    }
};

utils.load_text_sync = (fname) => {
    let buf = '';
    try {
        buf = fs.readFileSync(fname).toString();
    } catch(err) {
        console.error(err);
    } finally {
        return buf;
    }
};

// old version: use json string
utils.load_swap = (cache, t, fname) => {
    fs.readFile(fname, (err, buf) => {
        if (err) {
            console.error(err);
            process.exit(1);
        }
        if (!(cache[t] = utils.make_json(buf))) {
            console.error('swap: load failed');
            process.exit(1);
        }
    })
};

utils.flush = (cache, fname) => {
    fs.writeFile(fname, JSON.stringify(cache), (err) => {
        if (err) {
            console.error('flush: error');
        }
    });
};

// new version: use sqlite3
utils.load_db = (cache, t ,fname) => {
    const db = new sqlite3.Database(fname);
    const sql = `select * from ${t};`;
    db.all(sql,[],(err, rows) => {
        if (err) {
            console.error(err);
            process.exit(1);
        }
        let endpoint = [];
        rows.forEach((row) => {
            endpoint.append(row);
        });
    });
    db.close();
};

utils.flush_db = (cache, fname) => {
    const db = new sqlite3.Database(fname);
    for (const t in cache) {
        for (let i=0; i < cache[t].length; i++){
            const endpoint = cache[t][i] 
            let kv = [];
            for(const k in endpoint) {
                kv.append(`${k}=${endpoint[k]}`);
            }
            const sql = `update ${t} set ${kv.join(' ')} where tag=${endpoint['tag']}`;
            db.run(sql);
        }   
    }
    db.close();
}


utils.make_json = (buf) => {
    let body = null;
    try {
        body = JSON.parse(buf);
    } catch (_) {
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
    if (!ip && req.headers['x-forwarded-for']) {
        ip = req.headers['x-forwarded-for'].split(',')[0].trim();
    }
    if (!ip) ip = req.socket.remoteAddress;
    return ip;
}

utils.to_next_half_hour = () => {
    const d = new Date();
    if (d.getMinutes() >= 30) {
        return d.setMinutes(30) - Date.now() + 30*60*1000;
    } else {
        return d.setMinutes(30) - Date.now();
    }
}

utils.to_spec_time = (due) => {
    const offset = -new Date().getTimezoneOffset()/60;
    const due_arr = due.split(':');
    const hh = parseInt(due_arr[0]), mm = due_arr[1], ss = due_arr[2];
    let d = new Date(); d.setMinutes(mm); d.setSeconds(ss);
    if (hh + offset > 23) {
        d.setHours(hh + offset - 24);
    } else if (hh + offset < 0) {
        d.setHours(hh + offset + 24);
    } else {
        d.setHours(hh + offset);
    }
    if (d.getTime() > Date.now()) {
        return d.getTime() - Date.now();
    } else {
        return d.getTime() - Date.now() + 24*60*60*1000;
    }
}

utils.logger = class {
    constructor(logfile, is_console, is_logfile) {
        this.fp = logfile;
        this.p1 = is_console;
        this.p2 = is_logfile;
    }
    stat() {
        return {'fp': this.fp, 'p1': this.p1, 'p2': this.p2};
    }
    write(msg) {
        const d = new Date().toString().split(' ').slice(1,5).join(' ');
        const text = `[${d}]| ${msg}`;
        if (this.p1) {
            console.log(text);
        }
        if (this.p2) {
            fs.appendFile(this.fp, text + '\n', (_) => {});
        }
    }
}

module.exports = utils;