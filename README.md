# Auto Pilot

## client
Each client maintains a standalone config file for v2ray/shadowsocks. So you need to run another program(script), check the config file and then restart v2ray/shadowsocks.
<br>
When a request(from server) comes, the client will simply return the needed arguments(to generate share link), or update the config file, according to the values the server provided.

## server
The server keeps a list of clients(api address), it is scheduled to request those clients and update their corresponded arguments respectively(or delete if timeout, assume the client is down).
<br>
Meanwhile, it serves normal HTTP for users, who usually access this via a v2ray/shadowsocks client(Qv2ray, v2rayN, v2rayNG, Shadowrocket...). Once requested, it will create a customized subscription link(a bunch of base64-encoded text), according to the arguments posted by the user.
<br>

>note: some old modules like 'http' are applied, so there are callbacks everywhere. I have uploaded another version(for cloudflare workers), which takes advantage of async/await.
<br>

## request format
```
{t: "", cmd: "", data: {}}
```

## response format
```
{"code": 0, "msg": "", "data": {}}
```
> where
```
t = "v2", "ss"
cmd = "new", "get", "mod", "sub"
data = object
```

## subscribe link
```
http(s)://hostname/subscribe?channel=auto/cmcc/ctcc&proto=v2/ss&token=
```