---
name: pcap-traffic-analysis
description: 对 PCAP/PCAPNG 流量包做协议分层、会话还原、可疑外联与隧道检出，输出可复核的取证结论。适用于流量取证、木马外联定位、Web 攻击回溯。
---

# PCAP 流量分析

## 何时使用

- 检材为 `.pcap` / `.pcapng`，需要判断是否有恶意外联、数据外传、隧道通信。
- 需要还原某个会话的完整交互（HTTP 请求响应、DNS 查询链、TLS SNI）。
- 需要为 Web 攻击（SQL 注入、Webshell、反序列化）定位攻击载荷。

## 步骤

1. **先看全局**：`capinfos` 或 `tshark -q -z io,phs` 确认时间范围、包量、协议分布。
2. **抓协议分层**：`tshark -r x.pcapng -q -z io,phs`，重点看 DNS / HTTP / TLS / SMB / 非常规端口。
3. **找可疑外联**：统计目的 IP 与端口频次，过滤内网段，按流量体积排序。
   ```
   tshark -r x.pcapng -q -z endpoints,ip
   ```
4. **看 DNS**：异常长域名、高频随机子域（DGA）、指向非常规 TLD 的解析。
   ```
   tshark -r x.pcapng -Y dns -T fields -e dns.qry.name | sort | uniq -c | sort -rn | head -50
   ```
5. **还原 HTTP**：`tshark --export-objects http,out` 导出对象，检查上传的可执行文件与 Webshell 请求体。
6. **TLS 指纹**：无解密条件时，用 SNI + JA3 + 证书主体判断服务端性质。
7. **落地结论**：每条结论附「时间 + 五元组 + 证据文件/包号」，便于复核。

## 判定要点

- 外联时间与主机落地文件、注册表持久化的时间要能对上。
- 心跳型流量（固定间隔、固定长度）优先怀疑 C2。
- DNS 隧道特征：TXT/NULL 记录占比高、单标签长度接近 63 字节。

## 输出格式

| 时间 | 源 | 目的 | 协议 | 判定 | 证据 |
|---|---|---|---|---|---|
| 2026-11-20 03:12:44 | 10.0.0.21:51832 | 45.x.x.x:8443 | TLS | 疑似 C2 心跳 | frame 1832 |

最后给出「是否确认恶意外联」的明确结论，以及支撑该结论的最小证据集。
