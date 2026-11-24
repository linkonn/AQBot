#!/usr/bin/env node
/**
 * 取证之手 · 内网技能仓库服务端
 *
 * 零第三方依赖，只用 Node 内置模块。要求 Node.js >= 18。
 *
 * 目录约定：
 *   registry-server/
 *     server.mjs
 *     skills/
 *       <技能 id>/
 *         SKILL.md       必需，YAML frontmatter 至少包含 name / description
 *         skill.json     可选，补充 version / category / author / tags
 *         scripts/ ...   可选，随技能一起打包下发
 *
 * 启动：
 *   node server.mjs                    # 默认 0.0.0.0:7801
 *   PORT=8080 node server.mjs
 *   REGISTRY_TOKEN=xxx node server.mjs # 开启令牌校验
 *
 * 接口：
 *   GET /api/health                     健康检查
 *   GET /api/skills?q=关键字            技能列表
 *   GET /api/skills/:id                 技能详情（含 SKILL.md 全文）
 *   GET /api/skills/:id/download        技能包（zip）
 *   GET /                               技能目录页（浏览器直接访问）
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(ROOT, 'skills');
const STATS_FILE = path.join(ROOT, '.stats.json');

const PORT = Number(process.env.PORT || 7801);
const HOST = process.env.HOST || '0.0.0.0';
const TOKEN = String(process.env.REGISTRY_TOKEN || '').trim();
const SERVER_NAME = process.env.REGISTRY_NAME || '取证之手 内网技能仓库';
const SERVER_VERSION = '1.0.0';
const API_PREFIX = '/api';

/* ------------------------------------------------------------------ *
 * 技能扫描
 * ------------------------------------------------------------------ */

function parseFrontmatter(text) {
  const meta = {};
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return meta;
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const sep = line.indexOf(':');
    if (sep <= 0) continue;
    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }
  return meta;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function loadStats() {
  return readJson(STATS_FILE) || {};
}

function bumpDownload(id) {
  const stats = loadStats();
  stats[id] = (stats[id] || 0) + 1;
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf8');
  } catch {
    /* 统计写入失败不影响下载 */
  }
}

function listSkillDirs() {
  let entries = [];
  try {
    entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .filter((id) => fs.existsSync(path.join(SKILLS_DIR, id, 'SKILL.md')));
}

function loadSkill(id) {
  const dir = path.join(SKILLS_DIR, id);
  const skillMdPath = path.join(dir, 'SKILL.md');
  const raw = fs.readFileSync(skillMdPath, 'utf8');
  const front = parseFrontmatter(raw);
  const extra = readJson(path.join(dir, 'skill.json')) || {};
  const stat = fs.statSync(skillMdPath);

  return {
    id,
    // SKILL.md 的 name 是技能标识（需可做目录名），展示名优先取 skill.json。
    name: extra.name || front.name || id,
    description: front.description || extra.description || '',
    version: String(extra.version || front.version || '1.0.0'),
    category: extra.category || front.category || '未分类',
    author: extra.author || front.author || '',
    tags: Array.isArray(extra.tags) ? extra.tags : [],
    updatedAt: stat.mtime.toISOString(),
    readme: raw,
    dir,
  };
}

function allSkills() {
  return listSkillDirs()
    .map((id) => {
      try {
        return loadSkill(id);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function publicSkill(skill, stats) {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    version: skill.version,
    category: skill.category,
    author: skill.author,
    tags: skill.tags,
    updatedAt: skill.updatedAt,
    installs: stats[skill.id] || 0,
  };
}

/* ------------------------------------------------------------------ *
 * 最小 ZIP 打包（deflate，UTF-8 文件名）
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day =
    ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function collectFiles(dir, prefix, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name.startsWith('.')) {
      continue;
    }
    const full = path.join(dir, entry.name);
    const name = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      collectFiles(full, name, out);
    } else if (entry.isFile()) {
      out.push({ name, data: fs.readFileSync(full) });
    }
  }
  return out;
}

function buildZip(entries) {
  const now = dosDateTime(new Date());
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const data = entry.data;
    const crc = crc32(data);
    const deflated = zlib.deflateRawSync(data);
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(now.time, 10);
    local.writeUInt16LE(now.day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(now.time, 12);
    central.writeUInt16LE(now.day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

function skillArchive(skill) {
  const entries = collectFiles(skill.dir, skill.id, []);
  return buildZip(entries);
}

/* ------------------------------------------------------------------ *
 * HTTP
 * ------------------------------------------------------------------ */

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function authorized(req) {
  if (!TOKEN) return true;
  const header = req.headers['authorization'] || '';
  if (header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim() === TOKEN;
  }
  return String(req.headers['x-registry-token'] || '').trim() === TOKEN;
}

function safeId(raw) {
  const id = decodeURIComponent(raw || '').trim();
  if (!/^[A-Za-z0-9._-]+$/.test(id)) return null;
  return id;
}

const HTML_PAGE = (skills) => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>${SERVER_NAME}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#0a1220; color:#e6eefc; font:14px/1.6 "Segoe UI",system-ui,sans-serif; }
  header { padding:28px 32px; background:linear-gradient(90deg,rgba(26,107,255,.35),rgba(56,217,255,.05) 60%,transparent); border-bottom:1px solid #1d2b40; }
  h1 { margin:0; font-size:20px; letter-spacing:.5px; }
  .sub { color:#7f96b8; margin-top:6px; font-size:13px; }
  main { padding:24px 32px 48px; }
  .card { border:1px solid #1d2b40; border-radius:10px; padding:16px 18px; margin-bottom:12px; background:#0f1b2b; }
  .card h2 { margin:0 0 6px; font-size:15px; color:#8fc2ff; }
  .meta { color:#6f86a8; font-size:12px; }
  code { background:#132033; padding:1px 6px; border-radius:4px; color:#9fd0ff; }
  a { color:#5ba6ff; text-decoration:none; }
</style></head><body>
<header><h1>${SERVER_NAME}</h1>
<div class="sub">共 ${skills.length} 个技能 · 客户端地址 <code>http://本机IP:${PORT}</code></div></header>
<main>${skills
  .map(
    (s) => `<div class="card"><h2>${escapeHtml(s.name)}</h2>
<div>${escapeHtml(s.description)}</div>
<div class="meta">id: <code>${s.id}</code> · v${s.version} · ${escapeHtml(s.category)} · 下载 <a href="${API_PREFIX}/skills/${s.id}/download">zip</a></div></div>`,
  )
  .join('') || '<div class="card">暂无技能，请在 skills/ 下放置技能目录。</div>'}</main>
</body></html>`;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    const body = Buffer.from(HTML_PAGE(allSkills()), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length });
    res.end(body);
    return;
  }

  if (pathname === `${API_PREFIX}/health`) {
    const skills = allSkills();
    sendJson(res, 200, {
      status: 'ok',
      name: SERVER_NAME,
      version: SERVER_VERSION,
      skillCount: skills.length,
      time: new Date().toISOString(),
    });
    return;
  }

  if (!authorized(req)) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }

  if (pathname === `${API_PREFIX}/skills`) {
    const query = (url.searchParams.get('q') || '').trim().toLowerCase();
    const stats = loadStats();
    let skills = allSkills();
    if (query) {
      skills = skills.filter((skill) =>
        [skill.id, skill.name, skill.description, skill.category, ...skill.tags]
          .join(' ')
          .toLowerCase()
          .includes(query),
      );
    }
    sendJson(res, 200, {
      total: skills.length,
      skills: skills.map((skill) => publicSkill(skill, stats)),
    });
    return;
  }

  const match = new RegExp(`^${API_PREFIX}/skills/([^/]+)(/download)?$`).exec(pathname);
  if (match) {
    const id = safeId(match[1]);
    if (!id || !fs.existsSync(path.join(SKILLS_DIR, id, 'SKILL.md'))) {
      sendJson(res, 404, { error: 'skill not found' });
      return;
    }
    const skill = loadSkill(id);
    if (match[2]) {
      const archive = skillArchive(skill);
      bumpDownload(id);
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': archive.length,
        'Content-Disposition': `attachment; filename="${id}.zip"`,
        'X-Skill-Version': skill.version,
        'X-Skill-Id': skill.id,
        'Cache-Control': 'no-store',
      });
      res.end(archive);
      return;
    }
    const stats = loadStats();
    sendJson(res, 200, { ...publicSkill(skill, stats), readme: skill.readme });
    return;
  }

  sendJson(res, 404, { error: 'not found' });
});

server.listen(PORT, HOST, () => {
  const skills = allSkills();
  console.log(`[${SERVER_NAME}] listening on http://${HOST}:${PORT}`);
  console.log(`  技能目录: ${SKILLS_DIR}`);
  console.log(`  已发现技能: ${skills.length} 个${skills.length ? ' -> ' + skills.map((s) => s.id).join(', ') : ''}`);
  console.log(`  令牌校验: ${TOKEN ? '已开启' : '未开启（内网建议开启）'}`);
});
