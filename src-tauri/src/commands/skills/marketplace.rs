use aqbot_core::types::MarketplaceSkill;

// 内网版本不再连接 skills.sh，下面这些解析器只服务于单元测试与旧数据兼容。
#[cfg(test)]
use std::collections::HashSet;

#[cfg(test)]
use super::install::parse_skill_package_ref;

#[cfg(test)]
const SKILLS_SH_DEFAULT_QUERY: &str = "skill";
#[cfg(test)]
const SKILLS_SH_MIN_QUERY_CHARS: usize = 2;

#[cfg(test)]
pub(crate) fn normalize_skills_sh_query(query: &str) -> String {
    let trimmed = query.trim();
    if trimmed.chars().count() >= SKILLS_SH_MIN_QUERY_CHARS {
        trimmed.to_string()
    } else {
        SKILLS_SH_DEFAULT_QUERY.to_string()
    }
}

#[cfg(test)]
pub(crate) fn marketplace_installed(refs: &HashSet<String>, repo: &str, skill_id: &str) -> bool {
    let repo_n = repo.trim().trim_end_matches('/').to_lowercase();
    if repo_n.is_empty() {
        return false;
    }
    if !skill_id.is_empty() {
        let specific = format!("{}@{}", repo_n, skill_id.trim().to_lowercase());
        if refs.contains(&specific) {
            return true;
        }
    }
    refs.contains(&repo_n)
}

#[cfg(test)]
fn repo_from_source(source: &str) -> String {
    let source = source.trim().trim_end_matches('/');
    if source.is_empty() {
        return String::new();
    }
    parse_skill_package_ref(source)
        .map(|pkg| pkg.repo_slug())
        .unwrap_or_else(|_| source.to_string())
}

#[cfg(test)]
fn string_field(item: &serde_json::Value, keys: &[&str]) -> String {
    keys.iter()
        .find_map(|key| item.get(*key).and_then(|value| value.as_str()))
        .unwrap_or("")
        .trim()
        .to_string()
}

/// 解析 skills.sh 风格载荷。
///
/// 内网版本不再连接 skills.sh，这个解析器仅保留给单元测试与旧数据兼容使用。
#[cfg(test)]
pub(crate) fn parse_skills_sh_skills(
    body: &serde_json::Value,
    installed: &HashSet<String>,
) -> Vec<MarketplaceSkill> {
    let items = body
        .get("skills")
        .or_else(|| body.get("data"))
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();

    items
        .into_iter()
        .filter_map(|item| {
            let skill_id = string_field(&item, &["skillId", "slug", "skill_id"]);
            let name = string_field(&item, &["name"]);
            let name = if name.is_empty() {
                skill_id.clone()
            } else {
                name
            };
            if name.is_empty() {
                return None;
            }
            let repo = repo_from_source(&string_field(&item, &["source"]));
            let description = string_field(&item, &["description"]);
            let install_ref = if skill_id.is_empty() {
                repo.clone()
            } else if repo.is_empty() {
                skill_id.clone()
            } else {
                format!("{repo}@{skill_id}")
            };
            Some(MarketplaceSkill {
                name,
                description,
                repo: repo.clone(),
                skill_id: skill_id.clone(),
                install_ref,
                stars: 0,
                installs: item
                    .get("installs")
                    .and_then(|value| value.as_i64())
                    .unwrap_or(0),
                installed: marketplace_installed(installed, &repo, &skill_id),
                version: String::new(),
                category: String::new(),
                author: String::new(),
                updated_at: String::new(),
            })
        })
        .collect()
}

/// 内网版本：技能市场只查询内网仓库。
///
/// `source` 参数保留是为了兼容既有调用方（旧前端仍会传 `skills.sh` / `github`），
/// 它不再影响行为——客户端不会访问除内网仓库以外的任何来源。
#[tauri::command]
pub async fn search_marketplace(
    query: String,
    source: Option<String>,
) -> Result<Vec<MarketplaceSkill>, String> {
    let _ = source;
    super::registry::search(&query).await
}
