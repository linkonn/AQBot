#!/usr/bin/env node
// Ensures the `link:` local packages under libs/ have their `dist/` build
// artifacts before Vite (dev or build) tries to resolve them.
//
// Background: `libs/markstream-vue` and `libs/stream-monaco` are git submodules
// consumed through `link:` dependencies. Their `dist/` directories are
// gitignored, so a fresh clone, a `git submodule update`, or any cleanup that
// drops build output leaves the app unable to resolve e.g.
// `markstream-react/index.css` — Vite then fails and the Tauri window stays
// blank because the frontend never finishes bootstrapping.
//
// This script is a no-op when the artifacts are present, so it is safe to run
// on every dev/build.

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(cwd, args, label) {
  console.log(`[local-deps] ${label}`);
  const result = spawnSync(pnpm, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`[local-deps] FAILED: ${label} (exit ${result.status ?? "unknown"})`);
    process.exit(result.status ?? 1);
  }
}

function has(relPath) {
  return existsSync(path.join(root, relPath));
}

const streamMonaco = path.join(root, "libs/stream-monaco");
const markstream = path.join(root, "libs/markstream-vue");

const needStream = !has("libs/stream-monaco/dist/index.js");
const needParser = !has("libs/markstream-vue/packages/markdown-parser/dist/index.js");
const needReact = !has("libs/markstream-vue/packages/markstream-react/dist/index.css");

if (!needStream && !needParser && !needReact) {
  process.exit(0);
}

// A submodule whose working tree was wiped cannot be built until restored.
if (needStream && !has("libs/stream-monaco/package.json") && has("libs/stream-monaco/.git")) {
  console.log("[local-deps] restoring emptied stream-monaco submodule working tree");
  const restored = spawnSync("git", ["checkout", "--", "."], {
    cwd: streamMonaco,
    stdio: "inherit",
  });
  if (restored.status !== 0) {
    console.error("[local-deps] FAILED to restore libs/stream-monaco; run: git submodule update --init --force libs/stream-monaco");
    process.exit(1);
  }
}

if (needStream) {
  run(streamMonaco, ["install", "--ignore-scripts"], "install stream-monaco deps");
  run(streamMonaco, ["build"], "build stream-monaco");
}

if (needParser || needReact) {
  if (!has("libs/markstream-vue/node_modules")) {
    run(
      markstream,
      ["install", "--filter", "markstream-react...", "--filter", "markstream-react"],
      "install markstream-react deps",
    );
  }
  if (needParser) {
    run(markstream, ["run", "build:parser"], "build markdown-parser");
  }
  if (needReact) {
    run(markstream, ["--filter", "markstream-react", "build"], "build markstream-react");
  }
}

console.log("[local-deps] local packages ready");
