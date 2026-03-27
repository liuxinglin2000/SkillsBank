import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { askCursorAgent } from "./cursorAgent";
import { getFileSelector } from "./fileSelectors/registry";
import { FileSelectorMessage, FileSelectorState } from "./fileSelectors/types";

type NodeType = "menu" | "skill" | "action";

interface SkillNode {
  name: string;
  type: NodeType;
  click?: string;
  skillFile?: string;
  agentMode?: string;
  answerMode?: string;
  fileSelectMode?: string;
  list?: unknown;
  children?: SkillNode[];
  actionCommand?: string;
}

class SkillsTreeItem extends vscode.TreeItem {
  public readonly node: SkillNode;

  constructor(node: SkillNode) {
    const collapsible =
      node.type === "menu"
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
    } else if (node.type === "action") {
      this.command = {
        command: node.actionCommand ?? "skillsBank.openConfig",
        title: "Open Config"
      };
      this.iconPath = new vscode.ThemeIcon("edit");
      this.description = "button";
      this.tooltip = "打开 skills-config.json 进行修改";
    } else {
      this.iconPath = new vscode.ThemeIcon("list-tree");
    }
  }
}

class SkillsTreeProvider implements vscode.TreeDataProvider<SkillsTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    SkillsTreeItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private roots: SkillNode[] = [];

  constructor(private readonly extensionPath: string) {
    this.loadConfig();
  }

  refresh(): void {
    this.loadConfig();
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: SkillsTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SkillsTreeItem): vscode.ProviderResult<SkillsTreeItem[]> {
    if (!element) {
      const bottomAction: SkillNode = {
        name: "修改配置",
        type: "action",
        actionCommand: "skillsBank.openConfig"
      };
      return [...this.roots, bottomAction].map((node) => new SkillsTreeItem(node));
    }
    return (element.node.children ?? []).map((node) => new SkillsTreeItem(node));
  }

  private loadConfig(): void {
    const configPath = path.join(this.extensionPath, "skills-config.json");

    try {
      if (!fs.existsSync(configPath)) {
        this.roots = [];
        return;
      }

      const rawText = fs.readFileSync(configPath, "utf8");
      const rawJson = JSON.parse(rawText);
      this.roots = normalizeNodes(rawJson);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown parse error";
      vscode.window.showErrorMessage(
        `SkillsBank: 读取 skills-config.json 失败：${message}`
      );
      this.roots = [];
    }
  }
}

function normalizeNodes(raw: unknown): SkillNode[] {
  if (Array.isArray(raw)) {
    const result: SkillNode[] = [];
    for (const item of raw) {
      const normalized = normalizeSingle(item);
      if (normalized) {
        result.push(normalized);
      }
    }
    return result;
  }

  if (isPlainObject(raw)) {
    const result: SkillNode[] = [];
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

function normalizeSingle(raw: unknown): SkillNode | undefined {
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

function createNode(name: string, config: Record<string, unknown>): SkillNode | undefined {
  const type = config.type;
  if (type !== "menu" && type !== "skill") {
    return undefined;
  }

  const node: SkillNode = {
    name,
    type,
    click: typeof config.click === "string" ? config.click : undefined,
    agentMode:
      typeof config.agent_mode === "string"
        ? config.agent_mode
        : typeof config.agentMode === "string"
          ? config.agentMode
          : undefined,
    answerMode:
      typeof config.answer_mode === "string"
        ? config.answer_mode
        : typeof config.answerMode === "string"
          ? config.answerMode
          : undefined,
    fileSelectMode:
      typeof config.file_select_mode === "string"
        ? config.file_select_mode
        : typeof config.fileSelectMode === "string"
          ? config.fileSelectMode
          : undefined,
    skillFile:
      typeof config.skill_file === "string"
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSamePath(left: string, right: string): boolean {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isRegionModelUnavailable(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("model not available") ||
    lower.includes("doesn't serve your region") ||
    lower.includes("does not serve your region")
  );
}

function buildAgentPrompt(skillPrompt: string, selectedFiles: string[]): string {
  const parts: string[] = [skillPrompt.trim()];
  if (selectedFiles.length === 0) {
    return parts.join("\n\n");
  }

  const fileBlocks = selectedFiles.map((filePath, index) => {
    try {
      const fileContent = fs.readFileSync(filePath, "utf8");
      return [
        `【文件 ${index + 1}】`,
        `路径：${filePath}`,
        "内容：",
        fileContent
      ].join("\n");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return [
        `【文件 ${index + 1}】`,
        `路径：${filePath}`,
        `读取失败：${message}`
      ].join("\n");
    }
  });

  parts.push("以下是我选择的文件，请结合这些文件内容完成任务：");
  parts.push(fileBlocks.join("\n\n------------------------------\n\n"));
  return parts.join("\n\n");
}

async function handleSkillClick(
  node: SkillNode,
  extensionPath: string
): Promise<void> {
  if (node.click === "show_window") {
    await showSkillWindow(node, extensionPath);
    return;
  }

  const clickTarget = node.click ? `，click=${node.click}` : "";
  vscode.window.showInformationMessage(
    `已点击技能：${node.name}${clickTarget}（尚未实现对应 click 方法）`
  );
}

async function showSkillWindow(
  node: SkillNode,
  extensionPath: string
): Promise<void> {
  if (!node.skillFile) {
    vscode.window.showErrorMessage(
      `SkillsBank: ${node.name} 未配置 skill_file，无法打开窗口`
    );
    return;
  }

  const skillPath = path.resolve(extensionPath, node.skillFile);
  if (!fs.existsSync(skillPath)) {
    vscode.window.showErrorMessage(
      `SkillsBank: 未找到 skill 文件：${node.skillFile}`
    );
    return;
  }

  const skillPrompt = fs.readFileSync(skillPath, "utf8");
  const fileSelectMode = (node.fileSelectMode ?? "").trim().toLowerCase();
  const fileSelector = getFileSelector(fileSelectMode);
  const fileSelectorState: FileSelectorState = { selectedFiles: [] };

  const panel = vscode.window.createWebviewPanel(
    "skillsBankSkillPreview",
    `SkillsBank - ${node.name}`,
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  const fileSelectSection = fileSelector.render();

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
    .block-title { margin: 14px 0 8px; font-weight: 600; }
    .toolbar { display: flex; gap: 8px; margin-bottom: 8px; }
    button {
      border: 1px solid var(--vscode-button-border, transparent);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-radius: 6px;
      padding: 6px 10px;
      cursor: pointer;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .selected-files {
      list-style: none;
      padding: 0;
      margin: 0;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      overflow: hidden;
    }
    .selected-files:empty::before {
      content: "暂无已选文件";
      display: block;
      padding: 10px;
      color: var(--vscode-descriptionForeground);
    }
    .selected-files li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .selected-files li:last-child { border-bottom: none; }
    .file-path {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }
    .remove-btn { flex: none; }
    pre { white-space: pre-wrap; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 12px; border-radius: 6px; margin: 0; }
    textarea {
      width: 100%;
      box-sizing: border-box;
      min-height: 220px;
      resize: vertical;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 6px;
      padding: 10px;
      line-height: 1.5;
      font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
      font-size: 13px;
    }
    .status { margin-top: 8px; color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <h2>${escapeHtml(node.name)}</h2>
  <div class="file">来源文件：${escapeHtml(node.skillFile)}</div>
  <div class="file">模型配置：${escapeHtml(
    node.agentMode?.trim() || "未配置（不传 --model）"
  )}</div>
  <div class="file">回答模式（answer_mode）：${escapeHtml(
    node.answerMode?.trim() || "agent"
  )}</div>
  <div class="file">文件选择模式：${escapeHtml(fileSelectMode || "未配置")}</div>
  ${fileSelectSection}
  <div class="block-title">发送给 AI 的内容</div>
  <pre>${escapeHtml(skillPrompt)}</pre>
  <div class="toolbar" style="margin-top: 12px;">
    <button id="runBtn" type="button" style="width: 100%;">执行技能</button>
  </div>
  <div class="block-title">AI 回答</div>
  <textarea id="aiAnswer" readonly>点击“执行技能”后显示回答</textarea>
  <div id="status" class="status">状态：待执行</div>
  <script>
    const vscodeApi = acquireVsCodeApi();
    const aiAnswerEl = document.getElementById("aiAnswer");
    const statusEl = document.getElementById("status");
    const runBtn = document.getElementById("runBtn");
    const selectedFilesEl = document.getElementById("selectedFiles");
    const pickFilesBtn = document.getElementById("pickFilesBtn");

    function escapeHtmlClient(text) {
      return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function renderSelectedFiles(files) {
      if (!selectedFilesEl) {
        return;
      }
      selectedFilesEl.innerHTML = "";
      for (const filePath of files || []) {
        const li = document.createElement("li");
        li.innerHTML =
          '<span class="file-path" title="' + escapeHtmlClient(filePath) + '">' +
          escapeHtmlClient(filePath) +
          '</span><button class="remove-btn" data-path="' +
          escapeHtmlClient(filePath) +
          '" type="button">移除</button>';
        selectedFilesEl.appendChild(li);
      }
    }

    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (!msg || !msg.type) {
        return;
      }
      if (msg.type === "selectedFiles") {
        renderSelectedFiles(msg.files || []);
      } else if (msg.type === "aiProgress") {
        runBtn.disabled = true;
        statusEl.textContent = "状态：请求中";
      } else if (msg.type === "aiResult") {
        aiAnswerEl.value = msg.text || "(无文本输出)";
        runBtn.disabled = false;
        statusEl.textContent = "状态：完成";
      } else if (msg.type === "aiError") {
        aiAnswerEl.value = msg.text || "AI 调用失败";
        runBtn.disabled = false;
        statusEl.textContent = "状态：失败";
      }
    });

    runBtn.addEventListener("click", () => {
      aiAnswerEl.value = "正在请求 AI，请稍候...";
      statusEl.textContent = "状态：请求中";
      vscodeApi.postMessage({ type: "requestAiAnswer" });
    });

    ${fileSelector.getClientScript()}
  </script>
</body>
</html>`;

  let running = false;
  panel.webview.onDidReceiveMessage(async (msg: FileSelectorMessage) => {
    const handledBySelector = await fileSelector.onMessage(msg, {
      panel,
      state: fileSelectorState
    });
    if (handledBySelector) {
      return;
    }

    if (msg.type !== "requestAiAnswer" || running) {
      return;
    }

    if (fileSelector.requiresFiles && fileSelectorState.selectedFiles.length === 0) {
      panel.webview.postMessage({
        type: "aiError",
        text: "请先选择至少一个文件，再执行技能。"
      });
      return;
    }

    running = true;
    panel.webview.postMessage({ type: "aiProgress" });
    const promptToSend = fileSelectorState.promptOverride?.trim()
      ? `${skillPrompt.trim()}\n\n${fileSelectorState.promptOverride}`
      : buildAgentPrompt(skillPrompt, fileSelectorState.selectedFiles);

    try {
      const aiReply = await askCursorAgent(
        promptToSend,
        node.agentMode,
        node.answerMode
      );
      panel.webview.postMessage({ type: "aiResult", text: aiReply });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isRegionModelUnavailable(message)) {
        await vscode.env.clipboard.writeText(promptToSend);
        panel.webview.postMessage({
          type: "aiError",
          text:
            "当前 Cursor 模型在你所在地区不可用。\n" +
            "已自动将本次完整提示词复制到剪贴板。\n\n" +
            "你可以：\n" +
            "1) 在 Cursor 设置里切换到当前地区可用模型后重试；\n" +
            "2) 访问 https://cursor.com/docs/account/regions 查看可用区域与模型；\n" +
            "3) 将剪贴板内容手动粘贴到你可用的 AI 通道继续使用。\n\n" +
            `原始错误：${message}`
        });
      } else {
        panel.webview.postMessage({ type: "aiError", text: message });
      }
    } finally {
      running = false;
    }
  });
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new SkillsTreeProvider(context.extensionPath);
  const configPath = path.join(context.extensionPath, "skills-config.json");

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("skillsBankView", provider),
    vscode.commands.registerCommand("skillsBank.refresh", () => provider.refresh()),
    vscode.commands.registerCommand("skillsBank.openConfig", async () => {
      // 如果配置文件被误删，先自动创建一个空对象模板，保证可编辑。
      if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, "{\n  \n}\n", "utf8");
      }
      const doc = await vscode.workspace.openTextDocument(configPath);
      await vscode.window.showTextDocument(doc, { preview: false });
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (isSamePath(doc.uri.fsPath, configPath)) {
        provider.refresh();
        vscode.window.setStatusBarMessage(
          "SkillsBank: 配置已应用并刷新",
          1500
        );
      }
    }),
    vscode.commands.registerCommand("skillsBank.skillClick", async (node: SkillNode) => {
      await handleSkillClick(node, context.extensionPath);
    })
  );
}

export function deactivate(): void {
  // no-op
}
