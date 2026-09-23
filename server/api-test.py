# -*- coding: utf-8 -*-
import json
import os
import urllib.request
import urllib.error

BASE = os.environ.get("API_BASE", "http://localhost:3000/api")
passed = 0
failed = 0


def call(method, path, token=None, body=None):
    url = BASE + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8"))
        except Exception:
            return e.code, {}


def check(name, cond, extra=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"[PASS] {name} {extra}")
    else:
        failed += 1
        print(f"[FAIL] {name} {extra}")


# 1. 登录
s, login = call("POST", "/auth/login", body={"tenantCode": "demo", "username": "admin", "password": "123456"})
check("登录获取token", s in (200, 201) and len(login.get("token", "")) > 20)
check("登录返回企业", login.get("tenant", {}).get("code") == "demo")
check("登录返回角色", login.get("user", {}).get("role") == "boss")
token = login.get("token")

# 2. me
s, me = call("GET", "/auth/me", token)
check("获取当前用户", me.get("name") == "企业老板")

# 3. 看板
s, ov = call("GET", "/bi/overview", token)
k = ov.get("kpi", {})
check("看板-订单数>=3", k.get("orderCount", 0) >= 3, f"订单数={k.get('orderCount')}")
check("看板-低库存预警", k.get("lowStockCount", 0) >= 2, f"低库存={k.get('lowStockCount')}")
check("看板-合格率>0", k.get("yieldRate", 0) > 0, f"合格率={k.get('yieldRate')}")
check("看板-待审批", k.get("pendingApprovals", 0) >= 2, f"待审批={k.get('pendingApprovals')}")

# 4. 客户
s, cust = call("GET", "/customers", token)
check("客户列表>=3", len(cust.get("list", [])) >= 3)

# 5. 订单
s, orders = call("GET", "/orders", token)
check("订单列表>=3", len(orders) >= 3)

# 6. 订单转工单
pending = next((o for o in orders if o.get("status") == "pending"), None)
if pending:
    s, wo = call("POST", f"/work-orders/from-order/{pending['id']}", token, {})
    check("订单转工单", s in (200, 201) and str(wo.get("woNo", "")).startswith("WO"), wo.get("woNo", ""))
else:
    check("订单转工单(无待转,跳过)", True)

# 7. 派工 + 报工
s, wos = call("GET", "/work-orders", token)
target = next((w for w in wos if w.get("status") == "生产中"), None)
if target:
    before = target["finishedQty"]
    s, rep = call("POST", f"/work-orders/{target['id']}/report", token,
                  {"process": "车削", "goodQty": 10, "badQty": 1, "workHours": 2, "machine": "CNC-TEST", "batchNo": "B20260901"})
    check("扫码报工", s in (200, 201) and rep.get("goodQty") == 10)
    s, wos2 = call("GET", "/work-orders", token)
    after = next((w for w in wos2 if w["id"] == target["id"]), {}).get("finishedQty")
    check("报工回写产量", after == before + 10, f"before={before} after={after}")
else:
    check("报工(无生产中工单,跳过)", True)

# 8. 上料防错
s, inv = call("GET", "/inventory", token)
mat = inv.get("summary", [None])[0]
if mat:
    s, _ = call("POST", "/stock-moves", token,
                {"type": "pick", "productId": mat["productId"], "qty": 999999, "batchNo": "NOPE"})
    check("上料防错拦截", s in (400, 500), f"status={s}")
    # 9. 正常入库
    s, move = call("POST", "/stock-moves", token,
                   {"type": "in", "productId": mat["productId"], "qty": 5, "batchNo": "BTEST"})
    check("采购入库", s in (200, 201) and str(move.get("moveNo", "")).startswith("IN"))

# 10. 质检
s, insp = call("GET", "/inspections", token)
check("检验单列表>=3", len(insp) >= 3)

# 11. 审批
s, appr = call("GET", "/approvals", token)
check("审批列表>=3", len(appr) >= 3)

# 12. 无 token 401
s, _ = call("GET", "/auth/me")
check("无Token拒绝(401)", s == 401, f"status={s}")

# 13. 角色越权
s, wlogin = call("POST", "/auth/login", body={"tenantCode": "demo", "username": "worker01", "password": "123456"})
wtoken = wlogin.get("token")
s, _ = call("GET", "/users", wtoken)
check("worker越权访问用户管理被拒", s == 403, f"status={s}")

print("")
print(f"===== RESULT: PASS={passed} FAIL={failed} =====")
