// src/fileSelectors/types.ts：定义统一接口（协议层）
// 这个文件只做一件事：约定每个文件选择模式必须提供什么能力。

// FileSelectorMessage：Webview 发给扩展端的消息结构（如 pickFiles、removeFile）
// FileSelectorState：模式自己的状态，目前是 selectedFiles
// FileSelectorContext：给模式处理函数的上下文（panel + state）
// FileSelectorHandler：统一接口
// mode：模式名（free / nil）
// requiresFiles：执行前是否强制要求有文件
// render()：渲染该模式的 HTML 片段
// getClientScript()：该模式在 Webview 里的前端交互脚本
// onMessage()：扩展端接收消息后的模式处理入口
import * as vscode from "vscode";

export interface FileSelectorMessage {
  type?: string;
  filePath?: string;
}

export interface FileSelectorState {
  selectedFiles: string[];
}

export interface FileSelectorContext {
  panel: vscode.WebviewPanel;
  state: FileSelectorState;
}

export interface FileSelectorHandler {
  mode: string;
  requiresFiles: boolean;
  render(): string;
  getClientScript(): string;
  onMessage(msg: FileSelectorMessage, context: FileSelectorContext): Promise<boolean>;
}
