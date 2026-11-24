# 取证之手 · 内网技能仓库

用于内网离线环境的技能分发服务。客户端（取证之手）**只从这个服务拉取技能**，不再访问 GitHub / skills.sh。

## 1. 部署服务端

要求：Node.js 18 及以上（无需 npm install，零第三方依赖）。

```bash
# 在仓库根目录
node registry-server/server.mjs

# 或指定端口 / 令牌
PORT=7801 REGISTRY_TOKEN=改成你的令牌 node registry-server/server.mjs
```

Windows 下双击 `start.bat` 也可启动。

启动后浏览器访问 `http://服务器IP:7801/` 可以看到技能目录页。

### 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `7801` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址，内网部署保持默认 |
| `REGISTRY_TOKEN` | 空 | 设置后，除健康检查外的接口都要求令牌 |
| `REGISTRY_NAME` | `取证之手 内网技能仓库` | 页面标题与健康检查返回的名称 |

### 防火墙

Windows 首次启动会弹防火墙提示，勾选「专用网络」允许即可。若服务器开了入站限制：

```powershell
New-NetFirewallRule -DisplayName "取证之手技能仓库" -Direction Inbound -Protocol TCP -LocalPort 7801 -Action Allow
```

## 2. 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查，返回名称、版本、技能数 |
| GET | `/api/skills?q=关键字` | 技能列表（不传 `q` 返回全部） |
| GET | `/api/skills/:id` | 技能详情，含 `SKILL.md` 全文 |
| GET | `/api/skills/:id/download` | 技能包 zip（`X-Skill-Version` 头带版本号） |

开启令牌后，请求需带 `Authorization: Bearer <令牌>` 或 `X-Registry-Token: <令牌>`。

## 3. 添加技能

在 `registry-server/skills/` 下新建一个目录，目录名即技能 id（只允许字母、数字、`-`、`_`、`.`）：

```
registry-server/skills/
  pcap-traffic-analysis/
    SKILL.md          # 必需
    skill.json        # 可选，补充展示信息
    scripts/          # 可选，随技能一起下发
```

`SKILL.md` 必须带 YAML frontmatter：

```markdown
---
name: pcap-traffic-analysis
description: 一句话说明这个技能解决什么问题、什么时候用。
---

# 正文
```

`skill.json`（可选，用于给界面提供展示名、版本、分类）：

```json
{
  "name": "PCAP 流量分析",
  "version": "1.2.0",
  "category": "网络取证",
  "author": "取证之手内网仓库",
  "tags": ["pcap", "tshark"]
}
```

不加 `skill.json` 时，界面显示名会退回 frontmatter 里的 `name`。服务端每次请求都会重新扫描目录，**新增技能不用重启**。

## 4. 客户端指向仓库

客户端按以下优先级解析仓库地址：

1. 环境变量 `AQBOT_SKILL_REGISTRY`（可配 `AQBOT_SKILL_REGISTRY_TOKEN`）
2. 配置文件 `%USERPROFILE%\.aqbot\skill-registry.json`
3. 内置默认值 `http://127.0.0.1:7801`

推荐用配置文件，一台机器配一次即可：

```json
{
  "base_url": "http://10.10.20.31:7801",
  "token": ""
}
```

Windows 批量部署可直接跑：

```powershell
powershell -ExecutionPolicy Bypass -File registry-server/set-client-registry.ps1 -BaseUrl http://10.10.20.31:7801 -Token 你的令牌
```

配好后重启客户端，进入「技能 → 内网技能仓库」，顶部状态条应显示仓库地址与「在线 · N 个技能」。

## 5. 验证

服务端自检：

```bash
curl http://127.0.0.1:7801/api/health
curl "http://127.0.0.1:7801/api/skills?q=pcap"
curl -OJ http://127.0.0.1:7801/api/skills/pcap-traffic-analysis/download
```

客户端侧：技能页能看到列表、详情能打开、点安装能在 `~/.aqbot/skills/` 下生成对应目录且带 `skill-manifest.json`（`source_kind` 为 `registry`）。

## 6. 注意事项

- 服务端不做鉴权以外的访问控制，**只在内网使用**，不要映射到公网。
- 下载统计写在 `registry-server/.stats.json`，可随时删除重置。
- 客户端安装技能后不会自动更新；仓库里改了技能版本，需要用户在技能页重新安装。
