//! 内网技能仓库客户端。
//!
//! 二次开发后本客户端只从内网仓库拉取技能，不再访问 GitHub / skills.sh。
//! 仓库地址解析优先级：
//!   1. 环境变量 `AQBOT_SKILL_REGISTRY`（配套 `AQBOT_SKILL_REGISTRY_TOKEN`）
//!   2. `~/.aqbot/skill-registry.json`
//!   3. 内置默认值 `http://127.0.0.1:7801`
//!
//! 仓库服务端实现见仓库根目录 `registry-server/`。

use std::collections::HashSet;
use std::path::PathBuf;
use std::time::Duration;

use aqbot_core::types::{MarketplaceSkill, SkillRegistryInfo};

use crate::paths::aqbot_home;

use super::installed_source_refs;

pub(crate) const DEFAULT_REGISTRY_URL: &str = "http://127.0.0.1:7801";
const CONFIG_FILE_NAME: &str = "skill-registry.json";
const REQUEST_TIMEOUT_SECS: u64 = 10;

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct RegistryConfig {
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub token: String,
}

impl RegistryConfig {
    fn normalized_base_url(&self) -> String {
        let raw = self.base_url.trim().trim_end_matches('/');
        if raw.is_empty() {
            DEFAULT_REGISTRY_URL.to_string()
        } else {
            raw.to_string()
        }
    }
}

pub(crate) fn config_path() -> PathBuf {
    aqbot_home().join(CONFIG_FILE_NAME)
}

/// 读取仓库配置；任何一步失败都回退到下一优先级，不会因为配置文件损坏而启动失败。
pub(crate) fn registry_config() -> RegistryConfig {
    let mut config = RegistryConfig::default();
    let mut configured = false;

    if let Ok(content) = std::fs::read_to_string(config_path()) {
        if let Ok(file_config) = serde_json::from_str::<RegistryConfig>(&content) {
            if !file_config.base_url.trim().is_empty() {
                config.base_url = file_config.base_url;
                configured = true;
            }
            if !file_config.token.trim().is_empty() {
                config.token = file_config.token;
            }
        }
    }

    if let Ok(url) = std::env::var("AQBOT_SKILL_REGISTRY") {
        if !url.trim().is_empty() {
            config.base_url = url;
            configured = true;
        }
    }
    if let Ok(token) = std::env::var("AQBOT_SKILL_REGISTRY_TOKEN") {
        if !token.trim().is_empty() {
            config.token = token;
        }
    }

    if !configured {
        config.base_url = DEFAULT_REGISTRY_URL.to_string();
    }
    config
}

fn http_client() -> Result<reqwest::Client, String> {
    // 内网直连：不走系统代理，避免客户端机器上的 HTTP_PROXY 把内网请求劫走。
    reqwest::Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .no_proxy()
        .build()
        .map_err(|e| format!("无法初始化 HTTP 客户端: {e}"))
}

fn with_auth(
    request: reqwest::RequestBuilder,
    config: &RegistryConfig,
) -> reqwest::RequestBuilder {
    if config.token.trim().is_empty() {
        request
    } else {
        request.bearer_auth(config.token.trim())
    }
}

/// 只允许安全字符，避免拼出越权路径。
pub(crate) fn sanitize_skill_id(id: &str) -> Result<String, String> {
    let id = id.trim();
    if id.is_empty() {
        return Err("技能 id 不能为空".to_string());
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    {
        return Err(format!("非法技能 id: {id}"));
    }
    Ok(id.to_string())
}

fn registry_install_ref(id: &str) -> String {
    format!("registry:{id}")
}

/// 安装清单里记的是 `registry:<id>@<技能名>`，这里按前缀匹配，避免改名后判断失效。
fn is_installed(installed: &HashSet<String>, id: &str) -> bool {
    let base = registry_install_ref(id);
    let prefix = format!("{base}@");
    installed
        .iter()
        .any(|reference| reference == &base || reference.starts_with(&prefix))
}

fn string_field(item: &serde_json::Value, keys: &[&str]) -> String {
    keys.iter()
        .find_map(|key| item.get(*key).and_then(|value| value.as_str()))
        .unwrap_or("")
        .trim()
        .to_string()
}

fn parse_registry_skills(
    body: &serde_json::Value,
    installed: &HashSet<String>,
) -> Vec<MarketplaceSkill> {
    let items = body
        .get("skills")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();

    items
        .into_iter()
        .filter_map(|item| {
            let id = string_field(&item, &["id", "skillId", "slug"]);
            if id.is_empty() {
                return None;
            }
            let name = {
                let raw = string_field(&item, &["name"]);
                if raw.is_empty() {
                    id.clone()
                } else {
                    raw
                }
            };
            let install_ref = registry_install_ref(&id);
            Some(MarketplaceSkill {
                name,
                description: string_field(&item, &["description"]),
                repo: string_field(&item, &["source", "repo"]),
                skill_id: id.clone(),
                install_ref: install_ref.clone(),
                stars: 0,
                installs: item
                    .get("installs")
                    .or_else(|| item.get("downloads"))
                    .and_then(|value| value.as_i64())
                    .unwrap_or(0),
                installed: is_installed(installed, &id),
                version: string_field(&item, &["version"]),
                category: string_field(&item, &["category"]),
                author: string_field(&item, &["author"]),
                updated_at: string_field(&item, &["updatedAt", "updated_at"]),
            })
        })
        .collect()
}

pub(crate) async fn search(query: &str) -> Result<Vec<MarketplaceSkill>, String> {
    let config = registry_config();
    let base = config.normalized_base_url();
    let trimmed = query.trim();
    let url = if trimmed.is_empty() {
        format!("{base}/api/skills")
    } else {
        format!("{base}/api/skills?q={}", urlencoding::encode(trimmed))
    };

    let response = with_auth(
        http_client()?.get(&url).header("Accept", "application/json"),
        &config,
    )
    .send()
    .await
    .map_err(|e| format!("无法连接内网技能仓库 {base}：{e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "技能仓库返回 {}（{url}）",
            response.status().as_u16()
        ));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("技能仓库返回的数据无法解析：{e}"))?;
    Ok(parse_registry_skills(&body, &installed_source_refs()))
}

/// 下载技能包（zip 字节）与仓库标记的版本号。
pub(crate) async fn download(id: &str) -> Result<(Vec<u8>, String), String> {
    let id = sanitize_skill_id(id)?;
    let config = registry_config();
    let base = config.normalized_base_url();
    let url = format!("{base}/api/skills/{id}/download");

    let response = with_auth(http_client()?.get(&url), &config)
        .send()
        .await
        .map_err(|e| format!("下载技能失败（{url}）：{e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "技能仓库返回 {}（{url}）",
            response.status().as_u16()
        ));
    }

    let version = response
        .headers()
        .get("x-skill-version")
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "unknown".to_string());

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("读取技能包失败：{e}"))?;
    if bytes.is_empty() {
        return Err("技能包为空".to_string());
    }
    Ok((bytes.to_vec(), version))
}

async fn fetch_detail(id: &str) -> Result<String, String> {
    let id = sanitize_skill_id(id)?;
    let config = registry_config();
    let base = config.normalized_base_url();
    let url = format!("{base}/api/skills/{id}");

    let response = with_auth(
        http_client()?.get(&url).header("Accept", "application/json"),
        &config,
    )
    .send()
    .await
    .map_err(|e| format!("无法连接内网技能仓库 {base}：{e}"))?;

    if !response.status().is_success() {
        return Err(format!("技能仓库返回 {}", response.status().as_u16()));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("技能详情无法解析：{e}"))?;
    Ok(string_field(&body, &["readme", "content", "skillMd"]))
}

/// 界面用：当前仓库地址、来源与连通性。
#[tauri::command]
pub async fn get_skill_registry_status() -> Result<SkillRegistryInfo, String> {
    let config = registry_config();
    let base = config.normalized_base_url();
    let from_env = std::env::var("AQBOT_SKILL_REGISTRY")
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let source = if from_env {
        "env"
    } else if config_path().is_file() {
        "file"
    } else {
        "default"
    };

    let mut info = SkillRegistryInfo {
        base_url: base.clone(),
        source: source.to_string(),
        reachable: false,
        name: String::new(),
        version: String::new(),
        skill_count: 0,
        error: String::new(),
    };

    let url = format!("{base}/api/health");
    let response = match with_auth(
        http_client()?.get(&url).header("Accept", "application/json"),
        &config,
    )
    .send()
    .await
    {
        Ok(response) => response,
        Err(error) => {
            info.error = format!("连接失败：{error}");
            return Ok(info);
        }
    };

    if !response.status().is_success() {
        info.error = format!("仓库返回 {}", response.status().as_u16());
        return Ok(info);
    }

    match response.json::<serde_json::Value>().await {
        Ok(body) => {
            info.reachable = true;
            info.name = string_field(&body, &["name"]);
            info.version = string_field(&body, &["version"]);
            info.skill_count = body
                .get("skillCount")
                .or_else(|| body.get("skill_count"))
                .and_then(|value| value.as_i64())
                .unwrap_or(0);
        }
        Err(error) => info.error = format!("健康检查返回无法解析：{error}"),
    }
    Ok(info)
}

/// 界面用：读取某个技能的 SKILL.md 全文。
#[tauri::command]
pub async fn get_registry_skill_detail(id: String) -> Result<String, String> {
    fetch_detail(&id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_rejects_path_traversal() {
        assert!(sanitize_skill_id("../etc").is_err());
        assert!(sanitize_skill_id("a/b").is_err());
        assert!(sanitize_skill_id("").is_err());
        assert_eq!(sanitize_skill_id("pcap-analysis").unwrap(), "pcap-analysis");
    }

    #[test]
    fn parse_maps_registry_payload() {
        let body = serde_json::json!({
            "skills": [
                {
                    "id": "pcap-analysis",
                    "name": "PCAP 流量分析",
                    "description": "抓包分析",
                    "version": "1.2.0",
                    "category": "网络取证",
                    "installs": 12,
                    "updatedAt": "2026-11-20"
                }
            ]
        });
        let mut installed = HashSet::new();
        installed.insert("registry:pcap-analysis".to_string());
        let parsed = parse_registry_skills(&body, &installed);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].skill_id, "pcap-analysis");
        assert_eq!(parsed[0].install_ref, "registry:pcap-analysis");
        assert_eq!(parsed[0].version, "1.2.0");
        assert!(parsed[0].installed);
    }

    #[test]
    fn default_base_url_used_when_unset() {
        let config = RegistryConfig::default();
        assert_eq!(config.normalized_base_url(), DEFAULT_REGISTRY_URL);
    }
}
