"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const fs = require("fs");
const path = require("path");
const vscode = require("vscode");
class SkillsTreeItem extends vscode.TreeItem {
    constructor(node) {
        const collapsible = node.type === "menu"
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None;
        super(node.name, collapsible);
        this.node = node;
        this.contextValue = node.type;
        this.description = node.type;
        if (node.type === "skill") {
            this.command = {
                command: "skillsBank.skillClick",
                title: "Skill Click",
                arguments: [node]
            };
            this.iconPath = new vscode.ThemeIcon("play");
        }
        else if (node.type === "action") {
            this.command = {
                command: node.actionCommand ?? "skillsBank.openConfig",
                title: "Open Config"
            };
            this.iconPath = new vscode.ThemeIcon("edit");
            this.description = "button";
            this.tooltip = "打开 skills-config.json 进行修改";
        }
        else {
            this.iconPath = new vscode.ThemeIcon("list-tree");
        }
    }
}
class SkillsTreeProvider {
    constructor(extensionPath) {
        this.extensionPath = extensionPath;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.roots = [];
        this.loadConfig();
    }
    refresh() {
        this.loadConfig();
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            const bottomAction = {
                name: "修改配置",
                type: "action",
                actionCommand: "skillsBank.openConfig"
            };
            return [...this.roots, bottomAction].map((node) => new SkillsTreeItem(node));
        }
        return (element.node.children ?? []).map((node) => new SkillsTreeItem(node));
    }
    loadConfig() {
        const configPath = path.join(this.extensionPath, "skills-config.json");
        try {
            if (!fs.existsSync(configPath)) {
                this.roots = [];
                return;
            }
            const rawText = fs.readFileSync(configPath, "utf8");
            const rawJson = JSON.parse(rawText);
            this.roots = normalizeNodes(rawJson);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown parse error";
            vscode.window.showErrorMessage(`SkillsBank: 读取 skills-config.json 失败：${message}`);
            this.roots = [];
        }
    }
}
function normalizeNodes(raw) {
    if (Array.isArray(raw)) {
        const result = [];
        for (const item of raw) {
            const normalized = normalizeSingle(item);
            if (normalized) {
                result.push(normalized);
            }
        }
        return result;
    }
    if (isPlainObject(raw)) {
        const result = [];
        for (const [name, value] of Object.entries(raw)) {
            if (isPlainObject(value)) {
                const node = createNode(name, value);
                if (node) {
                    result.push(node);
                }
            }
        }
        return result;
    }
    return [];
}
function normalizeSingle(raw) {
    if (!isPlainObject(raw)) {
        return undefined;
    }
    // 支持两种结构：
    // 1) { "代码Review": { "type": "skill", ... } }
    // 2) { "name": "代码Review", "type": "skill", ... }
    if (typeof raw.name === "string" && typeof raw.type === "string") {
        return createNode(raw.name, raw);
    }
    const entries = Object.entries(raw);
    if (entries.length === 1) {
        const [name, config] = entries[0];
        if (isPlainObject(config)) {
            return createNode(name, config);
        }
    }
    return undefined;
}
function createNode(name, config) {
    const type = config.type;
    if (type !== "menu" && type !== "skill") {
        return undefined;
    }
    const node = {
        name,
        type,
        click: typeof config.click === "string" ? config.click : undefined,
        skillFile: typeof config.skill_file === "string"
            ? config.skill_file
            : typeof config.skillFile === "string"
                ? config.skillFile
                : undefined
    };
    if (type === "menu") {
        node.list = config.list;
        node.children = normalizeNodes(config.list);
    }
    return node;
}
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isSamePath(left, right) {
    return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}
function escapeHtml(input) {
    return input
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
async function handleSkillClick(node, extensionPath) {
    if (node.click === "show_window") {
        await showSkillWindow(node, extensionPath);
        return;
    }
    const clickTarget = node.click ? `，click=${node.click}` : "";
    vscode.window.showInformationMessage(`已点击技能：${node.name}${clickTarget}（尚未实现对应 click 方法）`);
}
async function showSkillWindow(node, extensionPath) {
    if (!node.skillFile) {
        vscode.window.showErrorMessage(`SkillsBank: ${node.name} 未配置 skill_file，无法打开窗口`);
        return;
    }
    const skillPath = path.resolve(extensionPath, node.skillFile);
    if (!fs.existsSync(skillPath)) {
        vscode.window.showErrorMessage(`SkillsBank: 未找到 skill 文件：${node.skillFile}`);
        return;
    }
    const content = fs.readFileSync(skillPath, "utf8");
    const panel = vscode.window.createWebviewPanel("skillsBankSkillPreview", `SkillsBank - ${node.name}`, vscode.ViewColumn.Active, { enableScripts: false });
    panel.webview.html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(node.name)}</title>
  <style>
    body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); }
    h2 { margin: 0 0 12px; font-size: 16px; }
    .file { margin-bottom: 12px; color: var(--vscode-descriptionForeground); }
    pre { white-space: pre-wrap; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 12px; border-radius: 6px; }
  </style>
</head>
<body>
  <h2>${escapeHtml(node.name)}</h2>
  <div class="file">来源文件：${escapeHtml(node.skillFile)}</div>
  <pre>${escapeHtml(content)}</pre>
</body>
</html>`;
}
function activate(context) {
    const provider = new SkillsTreeProvider(context.extensionPath);
    const configPath = path.join(context.extensionPath, "skills-config.json");
    context.subscriptions.push(vscode.window.registerTreeDataProvider("skillsBankView", provider), vscode.commands.registerCommand("skillsBank.refresh", () => provider.refresh()), vscode.commands.registerCommand("skillsBank.openConfig", async () => {
        // 如果配置文件被误删，先自动创建一个空对象模板，保证可编辑。
        if (!fs.existsSync(configPath)) {
            fs.writeFileSync(configPath, "{\n  \n}\n", "utf8");
        }
        const doc = await vscode.workspace.openTextDocument(configPath);
        await vscode.window.showTextDocument(doc, { preview: false });
    }), vscode.workspace.onDidSaveTextDocument((doc) => {
        if (isSamePath(doc.uri.fsPath, configPath)) {
            provider.refresh();
            vscode.window.setStatusBarMessage("SkillsBank: 配置已应用并刷新", 1500);
        }
    }), vscode.commands.registerCommand("skillsBank.skillClick", async (node) => {
        await handleSkillClick(node, context.extensionPath);
    }));
}
function deactivate() {
    // no-op
}
//# sourceMappingURL=extension.js.map