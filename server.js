'use strict';

const http = require('http');
const https = require('https');
const utils = require('./utils');

const clients = {'v2': [], 'ss': []};
const sub_cache = {'v2': [], 'ss': []};
const config = utils.load_config_sync('server.json');
const private_key = utils.load_key_sync(config.private_key);

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
    for (let i=0,len=clients[t].length; i<len; i++) {
        if (clients[t][i].ps == tag) {
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
    let inbound;
    const sel_ch = (isp) => {
        const cmcc = '移动';
        const ctcc = '电信';
        const cucc = '联通';
        let i;
        switch (isp) {
            case cmcc:
                i = config.ch.cmcc;
                break;
            case ctcc:
                i = config.ch.ctcc;
                break;
            case cucc:
                i = config.ch.cucc;
                break;
            default:
                i = config.ch.cmcc;
                break;
        }
        return i;
    };
    return new Promise((resolve) => {
        if (ch != 'auto') {
            inbound = config.ch[ch];
            resolve(inbound);
        } else {
            isplookup(ip).then((isp) => {
                inbound = sel_ch(isp);
                resolve(inbound);
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
                    reject('iplookup: empty resp');
                }
                if (!body.code) {
                    reject('iplookup: remote denied');
                }
                resolve(body.isp);
            });
        }).on('error', (_) => {
            reject('iplookup: req failed');
        });
        const payload = new URLSearchParams();
        payload.append('ip',ip);
        payload.append('isp',true);
		req.write(payload.toString());
        req.end();
    }).catch((err) => {
        console.error(err);
    });
}

function handle_v2(clients_v2, inbound) {
    return gen_sub_link(clients_v2, inbound);
};

function gen_custom_sub_head() {
    const uuid = utils.uuid();
    const ps = new Date().toUTCString();
    const sub_data = {
        'v': '2',
        'ps': ps,
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

function gen_sub_data(data, conf) {
    const sub_data = {
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
    for (const key in data) {
        sub_data[key] = data[key];
    }
    for (const key in conf.manual) {
        sub_data[key] = conf.manual[key];
    }
    return sub_data;
};

function gen_sub_link(clients_v2, inbound) {
    const buf = [];
    buf.push(gen_custom_sub_head());
    const cpy = clients_v2;
    for(let i=0,len=cpy.length; i<len; i++) {
        cpy[i]['add'] = inbound;
        const link = 'vmess://' + utils.base64(cpy[i]);
        buf.push(link);
    }
    const sub = utils.base64(buf.join('\n'));
    return sub;
};

const handler = (_clients, resp, form, ip) => {
    const t = form.get('proto');
    const ch = form.get('channel');
    select_ch(ch, ip).then((inbound) => {
        let ret = sub_cache[t][ch];
        if (!ret) {
            switch (t) {
                case 'v2':
                    ret = handle_v2(_clients['v2'], inbound);
                    break;
                case 'ss':
                    ret = handle_ss(_clients['ss'], inbound);
                    break;
                default:
                    break;
            }
            sub_cache[t][ch] = ret;
        }
        resp.write(ret);
        resp.end();
    });
};

const server = http.createServer((req, resp) => {
    const ip = req.headers[config.sub_header];
    const url = new URL(req.url, 'https://' + req.headers.host);
    const form = url.searchParams;
    if (!ip) {
        utils.ret404(resp);
        const unexpected_ip = utils.get_real_ip(req);
        console.log('unexpected: %s',unexpected_ip);
    }
    if (!utils.check_ua(req.headers, config.ua) || req.method != 'GET' || !utils.check_date(form.get('token'))) {
        utils.ret404(resp);
        //req.removeAllListeners();
        return;
    }
    const {ret, msg} = utils.check_form(form);
    if (!ret) {
        utils.ret404(resp);
        console.error(msg);
        return;
    }
    req.on('error', (err) => {
        console.error(err);
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
                buf.push(chunk);
            });
            resp.on('end', () => {
                const buff = buf.concat().toString();
                const body = utils.make_json(utils.server_decrypt(private_key, Buffer.from(buff, 'base64')));
                if (!body) {
                    reject('getcli: empty resp');
                    return
                }
                if (!body.code) {
                    reject('getcli: remote denied');
                    return
                }
                const sub_data = gen_sub_data(body.data, conf);
                resolve(sub_data);
            });
        }).on('error', (_) => {
            reject('getcli: req failed');
        });
        const payload = JSON.stringify({
            't': t,
            'cmd': 'sub',
            'data': '0'
        });
		req.write(utils.server_encrypt(private_key, Buffer.from(payload)));
        req.end();
    }).then((sub_data) => {
        console.log('getcli: %s', tag);
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
        console.error(err);
        return Promise.resolve(false);
    });
};

function mod_client(t, tag, payload) {   
    const cli = get_cli(t, tag);
    if (cli == null) return; 
    const conf = get_conf(t, cli.ps);
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
                buf.push(chunk);
            });
            resp.on('end', () => {
                const buff = buf.concat().toString();
                const body = utils.make_json(utils.server_decrypt(private_key, Buffer.from(buff, 'base64')));
                if (!body) {
                    reject('modcli: empty resp');
                    return
                }
                if (!body.code) {
                    reject('modcli: ' + body.msg);
                    return
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
        for (const key in payload) {
			cli[key] = payload[key];
        }
        console.log('modcli: %s', cli.ps);
    }).catch((err) => {
        console.error(err);
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
                for (const ch of ['cmcc','ctcc','cucc']) {
                    sub_cache[t][ch] = gen_sub_link(clients[t], config['ch'][ch]);
                }
            }
        });
    };
    get_latest('v2');
    setTimeout(auto_get_latest, utils.to_next_half_hour());
}

function auto_update_config() {
    const update_conf = (t) => {
        const update = (tag) => {
            const uuid = utils.uuid();
            const payload = {'id': uuid};
            mod_client(t, tag, payload);
        };
        const tags = get_tags(t);
        for(let i=0,len=tags.length; i<len; i++) {
            update(tags[i]);
        }
    };
    update_conf('v2');
    console.log('update')
    setTimeout(auto_update_config, utils.to_spec_time(config.update_time));
}

function main() {
    server.listen(config.server_port, config.server_addr);
    setTimeout(auto_get_latest, 5000);
    setTimeout(auto_update_config, utils.to_spec_time(config.update_time));
}

main();