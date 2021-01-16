'use strict';

const http = require('http');
const https = require('https');
const utils = require('./utils');


var clients = {}; //cache
var config = {};

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

const handler = (clients, resp, form, ip) => {
    const t = form.get('proto');
    const ch = form.get('channel');
    select_ch(ch, ip).then((inbound) => {
        let ret;
        switch (t) {
            case 'v2':
                ret = handle_v2(clients['v2'], inbound);
                break;
            case 'ss':
                ret = handle_ss(clients['ss'], inbound);
                break;
            default:
                break;
        }
        resp.write(ret);
        resp.end();
    });
};

const select_ch = (ch, ip) => {
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
    return Promise((resolve) => {
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

const isplookup = (ip) => {
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
            let buf = [];
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
        let payload = new URLSearchParams();
        payload.append('ip',ip);
        payload.append('isp',true);
		req.write(payload.toString());
        req.end();
    }).catch((err) => {
        console.error(err);
    });
}

const handle_v2 = (clients_v2, inbound) => {
    let buf = [];
    const cpy = utils.clone(clients_v2);
    for(let i=0,len=cpy.length; i<len; i++) {
        cpy[i]['add'] = inbound;
        const link = 'vmess://' + utils.base64(cpy[i]);
        buf.push(link);
    }
    const sub = utils.base64(buf.join('\n'));
    return sub;
};

const make_req = (proto, options, callback) => {
    let req;
    if (proto == 'https') {
        req = https.request(options, callback);
    }else if (proto == 'http') {
        req = http.request(options, callback);
    }
    return req;
}

const gen_sub_data = (data, conf) => {
    let sub_data = {
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

const get_tags = (t) => {
    let tags = [];
    for (let i=0,len=config[t].length; i<len; i++) {
        tags.push(config[t][i].tag);
    }
    return tags;
}

const get_cli = (t, tag) => {
    let cli = null;
    for (let i=0,len=clients[t].length; i<len; i++) {
        if (clients[t][i].ps == tag) {
            cli = clients[t][i];
        }
    }
    return cli;
}

const get_conf = (t, tag) => {
    let conf = null;
    for (let i=0,len=config[t].length; i<len; i++) {
        if (config[t][i].tag == tag) {
            conf = config[t][i];
        }
    }
    return conf;
};

// remote
const get_client = (t, tag) => {
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
            let buf = [];
            resp.on('data', (chunk) => {
                buf.push(chunk);
            });
            resp.on('end', () => {
                const buff = buf.concat();
                const body = utils.make_json(utils.server_decrypt(config.private_key, buff));
                if (!body) {
                    reject('getcli: empty resp');
                }
                if (!body.code) {
                    reject('getcli: remote denied');
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
		req.write(utils.server_encrypt(config.private_key, payload));
        req.end();
    }).then((sub_data) => {
        for (const key in sub_data) {
            if (!cli[key] || cli[key] != sub_data[key]) {
                cli[key] = sub_data[key];
            }
        }
        if (empty) clients[t].push(cli);
        console.log('getcli: %s', tag);
    }).catch((err) => {
        console.error(err);
    });
};

// remote
const mod_client = (t, cli, payload) => {    
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
            let buf = [];
            resp.on('data', (chunk) => {
                buf.push(chunk);
            });
            resp.on('end', () => {
                const buff = buf.concat();
                const body = utils.make_json(utils.server_decrypt(config.private_key, buff));
                if (!body) {
                    reject('modcli: empty resp');
                }
                if (!body.code) {
                    reject('modcli: ' + body.msg);
                }
                resolve();
            });
        });
        const full_payload = JSON.stringify({
            't': t,
            'cmd': 'mod',
            'data': payload
        });
        req.write(utils.server_encrypt(config.private_key, full_payload));
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

function init_clients (t) {
    clients[t] = [];
    let task = [];
    const tags = get_tags(t);
	for (let i=0,len=tags.length; i<len; i++) {
        const tsk = get_client(t, tags[i]);
        task.push(tsk);
	}
    Promise.all(task).then(() => {
        clients[t] = utils.clone(clients[t]);
        console.log('init: done');
    });
}

function maintain_clients(t) {
    const check_update = (tag) => {
        get_client(t, tag);
    };
    const update_uuid = (tag) => {
        const cli = get_cli(t, tag);
        const uuid = utils.uuid();
        const payload = {'id': uuid};
        mod_client(t, cli, payload);
    };
    const tags = get_tags(t);
    for (let i=0,len=tags.length; i<len; i++) {
        check_update(tags[i]);
        if (Math.random() > 0.5 && get_cli(t, tags[i])) {
            setTimeout(update_uuid, 60*1000, tags[i])
        }
    }
    setTimeout(maintain_clients, config.update_interval, 'v2');
}

function main() {
    config = utils.read_config_sync('server.json');
    init_clients('v2');
    server.listen(config.server_port, config.server_addr);
    setTimeout(maintain_clients, 30*1000, 'v2');
}

main();