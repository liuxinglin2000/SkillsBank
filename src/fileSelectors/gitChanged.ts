import { execFileSync, execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import * as vscode from "vscode";
import { FileSelectorContext, FileSelectorHandler, FileSelectorMessage } from "./types";

interface GitChangedFileItem {
  path: string;
  isUntracked: boolean;
}

const ALLOWED_SUFFIXES = [".cs", ".lua", ".gs", ".txt", ".ts", ".js"];

interface GitChangedCache {
  cwd: string;
  branch: string;
  items: GitChangedFileItem[];
}

const panelCache = new WeakMap<vscode.WebviewPanel, GitChangedCache>();

function parseStatusLine(line: string): { status: string; path: string } | undefined {
  const trimmed = line.trim();
  if (!trimmed) {
    return undefined;
  }
  const firstSpace = trimmed.indexOf(" ");
  if (firstSpace <= 0) {
    return undefined;
  }
  const status = trimmed.slice(0, firstSpace).trim();
  let filePath = trimmed.slice(firstSpace).trim();
  const renameArrow = " -> ";
  if (filePath.includes(renameArrow)) {
    const parts = filePath.split(renameArrow);
    filePath = parts[parts.length - 1].trim();
  }
  return { status, path: filePath };
}

function isChangedStatus(status: string): boolean {
  if (status === "??") {
    return true;
  }
  return /M|A|D|R|C/.test(status);
}

function isAllowedFile(pathText: string): boolean {
  const lower = pathText.toLowerCase();
  return ALLOWED_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

function fetchGitChangedFiles(cwd: string): GitChangedFileItem[] {
  const output = execSync("git status --short", {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  const result: GitChangedFileItem[] = [];
  const lines = output.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const parsed = parseStatusLine(line);
    if (!parsed) {
      continue;
    }
    if (!isChangedStatus(parsed.status)) {
      continue;
    }
    if (!isAllowedFile(parsed.path)) {
      continue;
    }
    result.push({
      path: parsed.path,
      isUntracked: parsed.status === "??"
    });
  }
  return result;
}

function buildDiff(cwd: string, items: GitChangedFileItem[]): string {
  const blocks: string[] = [];
  for (const item of items) {
    if (item.isUntracked) {
      const fullPath = join(cwd, item.path);
      if (existsSync(fullPath)) {
        const content = readFileSync(fullPath, "utf8");
        blocks.push(`--- 新增文件: ${item.path}\n+++ ${item.path}\n${content}`);
      }
      continue;
    }

    try {
      const diff = execFileSync("git", ["diff", "HEAD", "--", item.path], {
        cwd,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024
      }).trim();
      if (diff) {
        blocks.push(diff);
      }
    } catch {
      // 单文件 diff 失败时忽略，避免中断整体流程
    }
  }
  return blocks.join("\n\n---\n\n");
}

function buildPromptOverride(branch: string, items: GitChangedFileItem[], diff: string): string {
  const lines = items.map((it, index) => `${index + 1}. ${it.path}`);
  const filesText = lines.length > 0 ? lines.join("\n") : "(无变更文件)";
  const diffText = diff || "(无可用 diff)";
  return [
    `当前分支：${branch}`,
    "以下是当前 Git 变更文件列表：",
    filesText,
    "",
    "以下是 Git Diff 内容：",
    diffText
  ].join("\n");
}

function postSelectedFiles(context: FileSelectorContext): void {
  context.panel.webview.postMessage({
    type: "selectedFiles",
    files: context.state.selectedFiles
  });
}

function postInfo(context: FileSelectorContext, text: string): void {
  context.panel.webview.postMessage({
    type: "selectorInfo",
    text
  });
}

async function refreshFromGit(context: FileSelectorContext): Promise<void> {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) {
    context.state.selectedFiles = [];
    context.state.promptOverride = undefined;
    postSelectedFiles(context);
    postInfo(context, "未打开工作区，无法读取 Git 变更");
    return;
  }

  const cwd = workspace.uri.fsPath;
  const branch = execSync("git rev-parse --abbrev-ref HEAD", {
    cwd,
    encoding: "utf8"
  }).trim();
  const changedFiles = fetchGitChangedFiles(cwd);
  const diffText = buildDiff(cwd, changedFiles);
  panelCache.set(context.panel, { cwd, branch, items: changedFiles });

  context.state.selectedFiles = changedFiles.map((item) => item.path);
  context.state.promptOverride = buildPromptOverride(branch, changedFiles, diffText);
  postSelectedFiles(context);
  postInfo(context, `分支：${branch}，检测到 ${changedFiles.length} 个变更项`);
}

export const gitChangedFileSelector: FileSelectorHandler = {
  mode: "git_changed",
  requiresFiles: true,
  render(): string {
    return `
  <div class="block-title">文件选择（git_changed）</div>
  <div class="toolbar">
    <button id="refreshGitChangedBtn" type="button">刷新 Git 变更</button>
  </div>
  <div id="selectorInfo" class="file">点击“刷新 Git 变更”后加载文件列表与 diff</div>
  <ul id="selectedFiles" class="selected-files"></ul>
`;
  },
  getClientScript(): string {
    return `
    const refreshGitChangedBtn = document.getElementById("refreshGitChangedBtn");
    const selectorInfoEl = document.getElementById("selectorInfo");
    if (refreshGitChangedBtn) {
      refreshGitChangedBtn.addEventListener("click", () => {
        vscodeApi.postMessage({ type: "refreshGitChanged" });
      });
    }
    if (selectedFilesEl) {
      selectedFilesEl.addEventListener("click", (event) => {
        const target = event.target;
        if (!target || !(target instanceof HTMLElement)) {
          return;
        }
        if (target.classList.contains("remove-btn")) {
          const filePath = target.getAttribute("data-path");
          if (filePath) {
            vscodeApi.postMessage({ type: "removeFile", filePath: filePath });
          }
        }
      });
    }
    if (window.__skillsBankSelectorInfoBound !== true) {
      window.__skillsBankSelectorInfoBound = true;
      window.addEventListener("message", (event) => {
        const msg = event.data;
        if (msg && msg.type === "selectorInfo" && selectorInfoEl) {
          selectorInfoEl.textContent = msg.text || "";
        }
      });
    }
`;
  },
  async onMessage(msg: FileSelectorMessage, context: FileSelectorContext): Promise<boolean> {
    if (msg.type === "refreshGitChanged") {
      await refreshFromGit(context);
      return true;
    }
    if (msg.type === "requestSelectedFiles") {
      postSelectedFiles(context);
      return true;
    }
    if (msg.type === "removeFile" && msg.filePath) {
      context.state.selectedFiles = context.state.selectedFiles.filter((it) => it !== msg.filePath);
      const cached = panelCache.get(context.panel);
      if (cached) {
        const selectedSet = new Set(context.state.selectedFiles);
        const keptItems = cached.items.filter((it) => selectedSet.has(it.path));
        const diffText = buildDiff(cached.cwd, keptItems);
        context.state.promptOverride = buildPromptOverride(cached.branch, keptItems, diffText);
        postInfo(context, `分支：${cached.branch}，已选择 ${keptItems.length} 个变更项`);
      }
      postSelectedFiles(context);
      return true;
    }
    return false;
  }
};
