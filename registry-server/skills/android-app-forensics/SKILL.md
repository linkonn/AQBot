---
name: android-app-forensics
description: 对 Android 应用数据（/data/data 或整机 dump）做数据库、SharedPreferences、缓存与网络配置分析，定位账号、聊天记录与可疑行为。适用于手机检材与 App 侧写。
---

# Android 应用取证

## 目录速查

| 路径 | 内容 |
|---|---|
| `databases/*.db` | 业务数据，SQLite |
| `shared_prefs/*.xml` | 登录态、开关、token |
| `files/` | 下载文件、日志、离线包 |
| `cache/` | 图片、HTTP 缓存、临时下载 |
| `app_webview/` | WebView 的 LocalStorage / IndexedDB |

## 步骤

1. 先看 `AndroidManifest.xml`：包名、权限、`android:allowBackup`、`usesCleartextTraffic`。
2. 列 `databases/`，对每个库跑 `.tables` 与 `.schema`，不要只查一张表。
3. 关键表通常在：`message` / `conversation` / `contact` / `account` / `order`。
4. SharedPreferences 里找 `token`、`uid`、`phone`、`last_login`。
5. `cache/` 中的图片按修改时间排序，与聊天记录时间对齐。
6. 加密库（SQLCipher）先判断文件头是否为 `SQLite format 3`；不是则需找密钥（常在 so 或 prefs 中）。
7. 时间字段注意单位：秒 / 毫秒 / 微秒混用很常见。

## 常见坑

- 卸载重装后 `databases` 可能残留 WAL，必须一起拷 `-wal` / `-shm` 才能看到最新记录。
- 多账号 App 往往分库或分目录（`/data/data/<pkg>/files/u<uid>/`）。
- 微信类 App 的语音、图片文件名是 MD5，需与消息表字段关联。

## 输出

按「账号 → 会话 → 消息」三级整理，附原始库文件路径与记录 rowid，便于复核。
