# -*- coding: utf-8 -*-
"""飞书增强专项端到端测试：SSO 配置/公开接口、自动预警推送（内容+去重）、不阻塞业务、事件回调。
前提：后端在 3001 端口运行（新代码），演示数据已 seed。
"""
import json
import threading
import time
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer

BASE = "http://localhost:3001/api"
passed = 0
failed = 0


def call(method, path, token=None, body=None, timeout=20):
    url = BASE + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8"))
        except Exception:
            return e.code, {}
    except Exception as e:  # 网络异常（如飞书外网不通）
        return -1, {"message": str(e)}


def check(name, cond, extra=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"[PASS] {name} {extra}")
    else:
        failed += 1
        print(f"[FAIL] {name} {extra}")


# ---------- 本地 webhook 接收服务（模拟飞书群机器人） ----------
received = []  # 收到的每条消息体


class HookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(n).decode("utf-8")
        try:
            received.append(json.loads(raw))
        except Exception:
            received.append({"_raw": raw})
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"StatusCode":0,"StatusMessage":"success","code":0,"msg":"success"}')

    def log_message(self, *a):
        pass


srv = HTTPServer(("127.0.0.1", 8899), HookHandler)
threading.Thread(target=srv.serve_forever, daemon=True).start()


def texts_with(kw):
    return [m.get("content", {}).get("text", "") for m in received if kw in m.get("content", {}).get("text", "")]


def login(username):
    s, r = call("POST", "/auth/login", body={"tenantCode": "demo", "username": username, "password": "123456"})
    return r.get("token"), r


# 1. 登录
token, login = login("admin")
check("登录获取token", bool(token) and len(token) > 20)
tenant_id = login.get("tenant", {}).get("id", "")

# 2. 未配置：公开接口（不带 token）
s, pc = call("GET", "/feishu/public-config?tenantCode=demo")
check("公开接口无需token", s == 200)
check("未配置时enabled=false", pc.get("enabled") is False and pc.get("ssoEnabled") is False, str(pc))
check("公开接口不泄露密钥", "appSecret" not in pc and "encryptKey" not in pc)

s, pc2 = call("GET", "/feishu/public-config?tenantCode=notexist")
check("不存在企业返回关闭", s == 200 and pc2.get("enabled") is False)

# 3. 未配置：SSO 友好报错
s, sso = call("POST", "/feishu/sso", body={"code": "fake", "tenantCode": "demo"})
check("未启用SSO返回400", s in (400, 401), f"status={s}")
check("SSO错误为友好提示", "未启用" in str(sso.get("message", "")), str(sso.get("message")))

# 4. 未配置 webhook：创建审批也应成功（不阻塞）
s, ap0 = call("POST", "/approvals", token, {"type": "leave", "title": "无webhook时的审批"})
check("未配置飞书时审批仍可提交", s in (200, 201), f"status={s}")

# 5. 配置飞书（webhook 指向本地接收服务）
cfg = {
    "appId": "cli_test001",
    "appSecret": "secret_test_value",
    "verifyToken": "vt",
    "encryptKey": "ek",
    "webhook": "http://127.0.0.1:8899/hook",
    "enabled": True,
    "ssoEnabled": True,
}
s, saved = call("PUT", "/feishu/config", token, cfg)
check("保存飞书配置", s in (200, 201), f"status={s}")

s, got = call("GET", "/feishu/config", token)
check("回显密钥脱敏", got.get("appSecret") == "******" and got.get("encryptKey") == "******", str(got.get("appSecret")))

s, pc3 = call("GET", "/feishu/public-config?tenantCode=demo")
check("配置后SSO开启", pc3.get("ssoEnabled") is True and pc3.get("appId") == "cli_test001", str(pc3))
check("公开信息仍不含密钥", "appSecret" not in pc3)

# 6. 交期延期预警：找 w2（计划完工日已过、未完工）
s, wos = call("GET", "/work-orders", token)
w2 = next((w for w in wos if w.get("woNo") == "WO20260912002"), None)
check("找到延期工单w2", w2 is not None, w2.get("woNo") if w2 else "缺失")
if w2:
    s, r1 = call("POST", f"/work-orders/{w2['id']}/report", token, {"goodQty": 1, "process": "测试报工"})
    check("延期工单报工成功", s in (200, 201), f"status={s}")
    time.sleep(2)
    overdue = texts_with("交期延期")
    check("推送交期延期预警", len(overdue) >= 1 and "WO20260912002" in overdue[0], overdue[0] if overdue else "未收到")
    # 再报一次，去重
    call("POST", f"/work-orders/{w2['id']}/report", token, {"goodQty": 1, "process": "测试报工2"})
    time.sleep(1.5)
    check("延期预警去重(仍1条)", len(texts_with("交期延期")) == 1, f"共{len(texts_with('交期延期'))}条")

# 7. 待审批预警
s, ap = call("POST", "/approvals", token, {"type": "purchase", "title": "测试采购申请-飞书推送"})
check("提交审批成功", s in (200, 201), f"status={s}")
time.sleep(2)
pend = texts_with("待审批")
check("推送待审批预警", len(pend) >= 1 and "测试采购申请-飞书推送" in pend[-1], pend[-1] if pend else "未收到")

# 8. 低库存预警：R003 当前120/安全50，出库80后剩40<=50
s, prods = call("GET", "/products", token)
r3 = next((p for p in prods if p.get("code") == "R003"), None)
check("找到物料R003", r3 is not None)
if r3:
    body = {"type": "out", "productId": r3["id"], "qty": 80, "warehouse": "默认仓", "batchNo": "B20260903"}
    s, mv = call("POST", "/stock-moves", token, body)
    check("出库成功", s in (200, 201), f"status={s} {mv.get('message','')}")
    time.sleep(2)
    low = texts_with("低库存预警")
    check("推送低库存预警", len(low) >= 1 and "R003" in low[0], low[0] if low else "未收到")
    # 再出库 10，去重
    call("POST", "/stock-moves", token, {**body, "qty": 10})
    time.sleep(1.5)
    check("低库存预警去重(仍1条)", len(texts_with("低库存预警")) == 1, f"共{len(texts_with('低库存预警'))}条")

# 9. 推送失败不阻塞业务：webhook 改为不可达地址
bad = dict(cfg)
bad["webhook"] = "http://127.0.0.1:9/hook"
call("PUT", "/feishu/config", token, bad)
time.sleep(0.5)
s, ap2 = call("POST", "/approvals", token, {"type": "expense", "title": "webhook不可达时的审批"})
check("飞书不可达时业务仍成功", s in (200, 201), f"status={s}")

# 10. 事件订阅 URL 校验（公开接口）
s, ev = call("POST", f"/feishu/event/{tenant_id}", body={"type": "url_verification", "challenge": "abc123"})
check("事件URL校验回challenge", s in (200, 201) and ev.get("challenge") == "abc123", f"status={s} {ev}")

# 11. SSO 假凭证（真实调用飞书，外网不通则跳过）
call("PUT", "/feishu/config", token, cfg)  # 恢复可达 webhook
s, sso2 = call("POST", "/feishu/sso", body={"code": "fakecode", "tenantCode": "demo"}, timeout=25)
if s == -1:
    print(f"[SKIP] SSO假凭证外网验证（网络不可达：{sso2.get('message','')[:40]}）")
else:
    check("SSO假凭证被拒绝且不崩溃", s in (400, 401), f"status={s} {sso2.get('message','')}")

srv.shutdown()
print(f"\n==== 飞书增强测试：通过 {passed}，失败 {failed} ====")
exit(1 if failed else 0)
