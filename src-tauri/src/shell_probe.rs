//! Agent Bash 工具的启动自检。
//!
//! Bash 工具每次执行都现选一个 shell。选错（比如 Windows 上落到 System32 的
//! WSL 启动器）时，所有命令都会失败，但错误只出现在工具结果里，日志里一片安静，
//! 排查时只能去翻会话记录。这里在启动时跑一次 `echo`，把选中的 shell 和结果写进
//! 日志，环境问题开机就能看到。

use std::time::{Duration, Instant};

/// 自检超时。正常 shell 执行 `echo` 只要几十毫秒，5 秒足够，超时说明 shell 卡住了。
const PROBE_TIMEOUT: Duration = Duration::from_secs(5);

/// 在后台对默认 shell 做一次冒烟检查，不阻塞启动流程。
pub fn log_agent_shell_probe() {
    tauri::async_runtime::spawn(async move {
        let started = Instant::now();
        let probed = tokio::time::timeout(
            PROBE_TIMEOUT,
            tokio::task::spawn_blocking(|| open_agent_sdk::tools::bash::probe_shell(None)),
        )
        .await;

        match probed {
            Ok(Ok(probe)) if probe.success => {
                tracing::info!(
                    shell = %probe.program,
                    elapsed_ms = started.elapsed().as_millis() as u64,
                    "Agent shell probe passed"
                );
            }
            Ok(Ok(probe)) => {
                tracing::error!(
                    shell = %probe.program,
                    elapsed_ms = started.elapsed().as_millis() as u64,
                    detail = %probe.detail,
                    stdout = %probe.stdout,
                    stderr = %probe.stderr,
                    "Agent shell probe failed; every Bash tool call will fail. \
                     Point the Bash path setting at a working shell (for example \
                     C:\\Program Files\\Git\\bin\\bash.exe)."
                );
            }
            Ok(Err(error)) => {
                tracing::error!(%error, "Agent shell probe task failed to run");
            }
            Err(_) => {
                tracing::error!(
                    timeout_secs = PROBE_TIMEOUT.as_secs(),
                    "Agent shell probe timed out; the Bash tool will hang on every call"
                );
            }
        }
    });
}
