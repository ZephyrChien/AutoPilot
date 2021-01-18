# Auto Pilot

This program maintains config-file for v2ray/shadowsocks separately, which is located in "swap.json" by default. Meanwhile, another program(shell script is enough) run with root privilege, check if the swap was modified then copy it to the real config-file.

<br>

Normally, the program receives request from the central server, check request headers, then download request body and parse it to json, and update inner cache(write into swap later) or return subscription link according to what {"cmd": } indicates.

<br>

## Request format
```
{"t": "", "cmd": "", "data": {}}
```
> "t" represents "type". Optional value:
```
["v2", "ss"]
```
> "cmd" indicates which action should be performed. Optional value:
```
["new", "mod", "get", "sub"]
```
> "data" restores objects according to "cmd", it should not be empty.

<br>

## Response format
```
{"code": 0, "msg": "", "data": {}}
```

<br>

## A complete request
```
{"t": "v2", "cmd": "mod", "data": {"port": "8080"}}
```
> response
```
{"code": 0, "msg": "success", "data": null}
```
