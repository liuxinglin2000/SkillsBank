"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.askCursorAgent = askCursorAgent;
const fs_1 = require("fs");
const child_process_1 = require("child_process");
const path_1 = require("path");
function getWindowsAgentPs1Path() {
    const localAppData = process.env.LOCALAPPDATA || process.env.USERPROFILE || "";
    return (0, path_1.join)(localAppData, "cursor-agent", "agent.ps1");
}
function createAgentCommand(prompt, agentMode, answerMode) {
    const workspacePath = process.cwd();
    const normalizedMode = (agentMode ?? "").trim();
    const normalizedAnswerMode = (answerMode ?? "").trim().toLowerCase();
    const argv = ["--trust", "--print", "--output-format", "text", "--workspace", workspacePath];
    if (normalizedMode) {
        argv.push("--model", normalizedMode);
    }
    if (normalizedAnswerMode === "ask") {
        argv.push("--mode", "ask");
    }
    argv.push(prompt);
    if (process.platform !== "win32") {
        return { cmd: "agent", args: argv };
    }
    const agentPs1 = getWindowsAgentPs1Path();
    if ((0, fs_1.existsSync)(agentPs1)) {
        return {
            cmd: "powershell",
            args: ["-ExecutionPolicy", "Bypass", "-NoProfile", "-File", agentPs1, ...argv]
        };
    }
    return { cmd: "agent", args: argv };
}
/**
 * 调用 Cursor Agent，并阻塞等待文本回复。
 * 对外只暴露这个函数：传入 prompt，返回回答文本。
 */
async function askCursorAgent(prompt, agentMode, answerMode) {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
        throw new Error("prompt 不能为空");
    }
    const { cmd, args } = createAgentCommand(normalizedPrompt, agentMode, answerMode);
    return await new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(cmd, args, {
            cwd: process.cwd(),
            shell: false,
            env: { ...process.env }
        });
        const stdoutChunks = [];
        const stderrChunks = [];
        child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
        child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
        const timeoutMs = 120000;
        const timer = setTimeout(() => {
            child.kill("SIGTERM");
            reject(new Error("Cursor Agent 调用超时（120 秒）"));
        }, timeoutMs);
        child.on("close", (code) => {
            clearTimeout(timer);
            const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
            const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
            if (code === 0) {
                resolve(stdout || "(无文本输出)");
                return;
            }
            reject(new Error(stderr || stdout || `Cursor Agent 执行失败，退出码 ${code}`));
        });
        child.on("error", (error) => {
            clearTimeout(timer);
            const errno = error;
            if (errno.code === "ENOENT") {
                reject(new Error("未找到 Cursor Agent CLI，请先安装 Cursor 并确保可用 agent 命令。"));
                return;
            }
            reject(error);
        });
    });
}
//# sourceMappingURL=cursorAgent.js.map