"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.freeFileSelector = void 0;
const fs = require("fs");
const path = require("path");
const vscode = require("vscode");
function normalizeFilePathKey(filePath) {
    return path.resolve(filePath).toLowerCase();
}
function appendUniqueFiles(target, incoming) {
    for (const filePath of incoming) {
        const key = normalizeFilePathKey(filePath);
        const exists = target.some((it) => normalizeFilePathKey(it) === key);
        if (!exists) {
            target.push(filePath);
        }
    }
}
function collectFilesFromPath(entryPath) {
    if (!fs.existsSync(entryPath)) {
        return [];
    }
    const stat = fs.statSync(entryPath);
    if (stat.isFile()) {
        return [entryPath];
    }
    if (!stat.isDirectory()) {
        return [];
    }
    const result = [];
    const entries = fs.readdirSync(entryPath, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(entryPath, entry.name);
        if (entry.isDirectory()) {
            result.push(...collectFilesFromPath(fullPath));
        }
        else if (entry.isFile()) {
            result.push(fullPath);
        }
    }
    return result;
}
function postSelectedFiles(context) {
    context.panel.webview.postMessage({
        type: "selectedFiles",
        files: context.state.selectedFiles
    });
}
exports.freeFileSelector = {
    mode: "free",
    requiresFiles: true,
    render() {
        return `
  <div class="block-title">文件选择（free）</div>
  <div class="toolbar">
    <button id="pickFilesBtn" type="button">选择文件/文件夹（可多选）</button>
  </div>
  <ul id="selectedFiles" class="selected-files"></ul>
`;
    },
    getClientScript() {
        return `
    if (pickFilesBtn) {
      pickFilesBtn.addEventListener("click", () => {
        vscodeApi.postMessage({ type: "pickFiles" });
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
    vscodeApi.postMessage({ type: "requestSelectedFiles" });
`;
    },
    async onMessage(msg, context) {
        if (msg.type === "requestSelectedFiles") {
            postSelectedFiles(context);
            return true;
        }
        if (msg.type === "pickFiles") {
            const picked = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: true,
                canSelectMany: true,
                openLabel: "选择文件/文件夹"
            });
            if (!picked || picked.length === 0) {
                return true;
            }
            const expanded = [];
            for (const uri of picked) {
                expanded.push(...collectFilesFromPath(uri.fsPath));
            }
            appendUniqueFiles(context.state.selectedFiles, expanded);
            postSelectedFiles(context);
            return true;
        }
        if (msg.type === "removeFile" && msg.filePath) {
            const removeKey = normalizeFilePathKey(msg.filePath);
            const rest = context.state.selectedFiles.filter((it) => normalizeFilePathKey(it) !== removeKey);
            context.state.selectedFiles.splice(0, context.state.selectedFiles.length, ...rest);
            postSelectedFiles(context);
            return true;
        }
        return false;
    }
};
//# sourceMappingURL=free.js.map