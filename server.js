'use strict';

const http = require('http');
const https = require('https');
const utils = require('./utils');

const clients = {'v2': [], 'ss': []};
const sub_cache = {'v2': [], 'ss': []};
const config = utils.load_config_sync('server.json');
const private_key = utils.load_key_sync(config.private_key);

const logger = new utils.logger(config.log_file, true, false);

// common area
const get_tags = (t) => {
    const tags = [];
    for (let i=0,len=config[t].length; i<len; i++) {
        tags.push(config[t][i].tag);
    }
    return tags;
};

const get_cli = (t, tag) => {
    let cli = null;
    const nickname = ( t == 'v2'? 'ps' : 'tag');
    for (let i=0,len=clients[t].length; i<len; i++) {
        if (clients[t][i][nickname] == tag) {
            cli = clients[t][i];
        }
    }
    return cli;
};

const get_conf = (t, tag) => {
    let conf = null;
    for (let i=0,len=config[t].length; i<len; i++) {
        if (config[t][i].tag == tag) {
            conf = config[t][i];
        }
    }
    return conf;
};



// subscription field
// provide different sub_link according the params received
// usually the sub_link is cached
function make_req(proto, options, callback) {
    let req;
    if (proto == 'https') {
        req = https.request(options, callback);
    }else if (proto == 'http') {
        req = http.request(options, callback);
    }
    return req;
};

function select_ch(ch, ip) {
    const sel_ch = (isp) => {
        const cmcc = '移动';
        const ctcc = '电信';
        const cucc = '联通';
        let i;
        switch (isp) {
            case cmcc:
                i = 'cmcc';
                break;
            case ctcc:
                i = 'ctcc';
                break;
            case cucc:
                i = 'cucc';
                break;
            default:
                i = 'cmcc';
                break;
        }
        return i;
    };
    return new Promise((resolve) => {
        if (ch != 'auto') {
            resolve(ch);
        } else {
            isplookup(ip).then((isp) => {
                const fast_ch = sel_ch(isp);
                resolve(fast_ch);
            });
        }
    });
};

function isplookup (ip) {
    const {proto, host, port, path} = utils.parse_url(config.iplookup_api);
    const opts = {
        'host': host,
        'port': port,
        'path': path,
        'method': 'POST',
        'headers': {
            'User-Agent': config.ua,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Connection': 'close'
        }
    };
    return new Promise ((resolve, reject) => {
        const req = make_req(proto, opts, (resp) => {
            const buf = [];
            resp.on('data', (chunk) => {
                buf.push(chunk);
            });
            resp.on('end', () => {
                const buff = buf.concat();
                const body = utils.make_json(buff);
                if (!body) {
                    reject('empty response body');
                }
                if (!body.code) {
                    reject('denied by remote ' + body.msg);
                }
                resolve(body.isp);
            });
        }).on('error', (_) => {
            reject('bad request');
        });
        const payload = new URLSearchParams();
        payload.append('ip',ip);
        payload.append('isp',true);
		req.write(payload.toString());
        req.end();
    }).catch((err) => {
        logger.write(`iplookup: ${err}`);
    });
}

function gen_custom_sub_head(t) {
    const tag = new Date().toUTCString().split(' ').slice(1,5).join('-');
    const gen_head_v2 = () => {
        const uuid = utils.uuid();
        const sub_data = {
            'v': '2',
            'ps': tag,
            'add': '0.0.0.0',
            'port': '10000',
            'id': uuid,
            'aid': '1',
            'net': 'tcp',
            'type': 'none',
            'host': '',
            'path': '',
            'tls': ''
        };
        const sub_head = 'vmess://' + utils.base64(sub_data);
        return sub_head;
    };
    const gen_head_ss = () => {
        const userinfo = utils.base64('chacha20-ietf-poly1305:password');
        const sub_head = `ss://${userinfo}@0.0.0.0:10000#${tag}`;
        return sub_head;
    }
    if (t == 'v2') {
        return gen_head_v2();
    }
    if (t == 'ss') {
        return gen_head_ss();
    }
};

function gen_sub_data(t, data, conf) {
    let sub_data;
    if (t == 'v2') {
        sub_data = {
            'v': '2',
            'ps': conf.tag,
            'add': '',
            'port': '',
            'id': '',
            'aid': '1',
            'net': '',
            'type': 'none',
            'host': '',
            'path': '',
            'tls': 'tls'
        };
    } else if (t == 'ss') {
        sub_data = {
            'tag': conf.tag,
            'server': '',
            'server_port': '',
            'method': '',
            'password': ''
        }
    }
    for (const key in data) {
        sub_data[key] = data[key];
    }
    for (const key in conf.manual) {
        sub_data[key] = conf.manual[key];
    }
    return sub_data;
};

function gen_sub_link(t, clients_t, inbound) {
    const buf = [];
    buf.push(gen_custom_sub_head(t));
    if (t == 'v2') {
        for(let i=0,len=clients_t.length; i<len; i++) {
            const cpy = utils.clone(clients_t[i]);
            cpy.add = inbound;
            const link = 'vmess://' + utils.base64(cpy);
            buf.push(link);
        }
    } else if (t == 'ss') {
        for(let i=0,len=clients_t.length; i<len; i++) {
            const c = clients_t[i];
            const userinfo = utils.base64(`${c.method}:${c.password}`);
            const link = `ss://${userinfo}@${inbound}:${c.server_port}#${c.tag}`;
            buf.push(link);
        }
    }
    if (config.custom[t]) {
        const customs = utils.load_text_sync(config.custom[t]).split('\n');
        for (const c of customs) {
            if (c) buf.push(c);
        }
    }
    const sub = utils.base64(buf.join('\n'));
    return sub;
};

function handle_v2(clients_v2, inbound) {
    return gen_sub_link('v2', clients_v2, inbound);
};

function handle_ss(clients_ss, inbound) {
    return gen_sub_link('ss', clients_ss, inbound);
};

const handler = (_clients, resp, form, ip) => {
    const t = form.get('proto');
    const ch = form.get('channel');
    select_ch(ch, ip).then((inb) => {
        let ret = sub_cache[t][inb];
        if (!ret) {
            switch (t) {
                case 'v2':
                    ret = handle_v2(_clients['v2'], config['ch'][inb]);
                    break;
                case 'ss':
                    ret = handle_ss(_clients['ss'], config['ch'][inb]);
                    break;
                default:
                    break;
            }
            sub_cache[t][ch] = ret;
        }
        resp.write(ret);
        resp.end();
        logger.write(`sub: ${ip} fetch ${t} ${inb}`);
    });
};

const server = http.createServer((req, resp) => {
    const ip = req.headers[config.sub_header];
    const url = new URL(req.url, 'http://' + req.headers.host);
    const form = url.searchParams;
    if (!ip) {
        utils.ret404(resp);
        const unexpected_ip = utils.get_real_ip(req);
        logger.write(`http: ${unexpected_ip} ${req.method} ${url.href}`);
        return;
    }
    if (!utils.check_ua(req.headers, config.ua) || req.method != 'GET' || !utils.check_date(form.get('token'))) {
        utils.ret404(resp);
        //req.removeAllListeners();
        logger.write(`sub: ${ip} encounter error`);
        return;
    }
    const {ret, msg} = utils.check_form(form);
    if (!ret) {
        utils.ret404(resp);
        logger.write(`sub: incorrect form format ${msg}`);
        return;
    }
    req.on('error', (_) => {
        logger.write('http: bad reqeust');
    });
    req.on('data', (_) => {});
    req.on('end', () => {
        handler(clients, resp, form, ip);
    });
});




// api field, implement a simple http api
// send request to clients' api and handle the response
// and always check clients' configurations so that sub_links are kept up-to-date
function get_client(t, tag) {
    let cli, empty = false;
    const conf = get_conf(t, tag);
    const {proto, host, port, path} = utils.parse_url(conf.api);
    const opts = {
        'host': host,
        'port': port,
        'path': path,
        'method': 'POST',
        'headers': {
            'User-Agent': config.ua,
            'Content-Type': 'application/json',
            'Connection': 'close'
        }
    };
    if (!(cli = get_cli(t, tag))) {
        cli = {}; empty = true;
    }
    return new Promise ((resolve, reject) => {
        const req = make_req(proto, opts, (resp) => {
            const buf = [];
            resp.on('data', (chunk) => {
                const plain = utils.server_decrypt(private_key, Buffer.from(chunk.toString(),'base64'));
                if(plain === null) {
                    req.removeAllListeners();
                    reject('corrupt data');
                }
                buf.push(plain);
            });
            resp.on('end', () => {
                const buff = buf.concat().toString();
                //const body = utils.make_json(utils.server_decrypt(private_key, Buffer.from(buff, 'base64')));
                const body = utils.make_json(buff);
                if (!body) {
                    reject('empty response body');
                    return;
                }
                if (!body.code) {
                    reject('denied by remote ' + body.msg);
                    return;
                }
                const sub_data = gen_sub_data(t, body.data, conf);
                resolve(sub_data);
            });
        }).on('error', (_) => {
            reject('bad request');
        });
        const payload = JSON.stringify({
            't': t,
            'cmd': 'sub',
            'data': '0'
        });
        req.write(utils.server_encrypt(private_key, Buffer.from(payload)));
        req.end();
    }).then((sub_data) => {
        logger.write(`api: fetch ${t} ${tag}`);
        let count = 0;
        for (const key in sub_data) {
            if (cli[key] != sub_data[key]) {
                cli[key] = sub_data[key];
                count++;
            }
        }
        if (empty) clients[t].push(cli);
        if (count) return Promise.resolve(true);
        return Promise.resolve(false);
    }).catch((err) => {
        logger.write(`api: fetch ${t} ${tag} ${err}`);
        return Promise.resolve(false);
    });
};

function mod_client(t, tag, payload) {   
    const cli = get_cli(t, tag);
    if (cli == null) return; 
    const conf = (t == 'v2' ? get_conf(t, cli.ps): get_conf(t, cli.tag));
    const {proto, host, port, path} = utils.parse_url(conf.api);                                                                                                                                                                                                                                                                                                                              
    const opts = {
        'host': host,
        'port': port,
        'path': path,
        'method': 'POST',
        'headers': {
            'User-Agent': config.ua,
            'Content-Type': 'application/json',
            'Connection': 'close'
        }
    };
    return new Promise ((resolve, reject) => {
        const req = make_req(proto, opts, (resp) => {
            const buf = [];
            resp.on('data', (chunk) => {
                const plain = utils.server_decrypt(private_key, Buffer.from(chunk.toString(),'base64'));
                if(plain === null) {
                    req.removeAllListeners();
                    reject('corrupted data');
                }
                buf.push(plain);
            });
            resp.on('end', () => {
                const buff = buf.concat().toString();
                //const body = utils.make_json(utils.server_decrypt(private_key, Buffer.from(buff, 'base64')));
                const body = utils.make_json(buff);
                if (!body) {
                    reject('empty response body');
                    return;
                }
                if (!body.code) {
                    reject('denied by remote ' + body.msg);
                    return;
                }
                resolve();
            });
        });
        const full_payload = JSON.stringify({
            't': t,
            'cmd': 'mod',
            'data': payload
        });
        req.write(utils.server_encrypt(private_key, Buffer.from(full_payload)));
        req.end();
    }).then(() => {
        /*
        for (const key in payload) {
			cli[key] = payload[key];
        }
        */
        logger.write(`api: mod ${t} ${tag}`);
    }).catch((err) => {
        logger.write(`api: mod ${t} ${tag} ${err}`);
    });
};

function auto_get_latest() {
    const get_latest = (t) => {
        const task = [];
        const tags = get_tags(t);
        for (let i=0,len=tags.length; i<len; i++) {
            const tsk = get_client(t, tags[i]);
            task.push(tsk);
        }
        Promise.all(task).then((values) => {
            if (values.indexOf(true) != -1) {
                // sort
                const nickname = ( t == 'v2' ? 'ps' : 'tag');
                clients[t].sort((a, b) => {
                    return tags.indexOf(a[nickname]) - tags.indexOf(b[nickname]);
                });
                for (const ch of ['cmcc','ctcc','cucc']) {
                    sub_cache[t][ch] = gen_sub_link(t, clients[t], config['ch'][ch]);
                }
            }
        });
    };
    get_latest('v2');
    get_latest('ss');
    const timeout = utils.to_next_half_hour();
    setTimeout(auto_get_latest, timeout);
    logger.write(`app: keep up-to-date, next ${timeout/1000}`);
}

function auto_update_config() {
    const update_conf = (t) => {
        const tags = get_tags(t);
        if (t == 'v2') {
            for(let i=0,len=tags.length; i<len; i++) {
                const uuid = utils.uuid();
                const payload = {'id': uuid};
                mod_client(t, tags[i], payload);
            }
        } else if (t == 'ss') {
            for(let i=0,len=tags.length; i<len; i++) {
                const n = Math.ceil(12*Math.random()) + 12;
                const passwd = utils.passwd(n);
                const payload = {'password': passwd};
                mod_client(t, tags[i], payload);
            }
        }
    };
    update_conf('v2');
    update_conf('ss');
    const timeout =  utils.to_spec_time(config.update_time);
    setTimeout(auto_update_config, timeout);
    logger.write(`app: keep scrolling, next ${timeout/1000}`);
}

function main() {
    logger.write('app: start to serve');
    server.listen(config.server_port, config.server_addr);
    setTimeout(auto_get_latest, 5000);
    setTimeout(auto_update_config, utils.to_spec_time(config.update_time));
}

main();