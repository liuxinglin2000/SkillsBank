"use strict";
// src/fileSelectors/registry.ts：模式注册表（选择器工厂）
// 这个文件是“路由层”。
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFileSelector = getFileSelector;
// 把 free、nil 两个实现注册到 registry
// 暴露 getFileSelector(mode?)
// 先做 trim + lowerCase
// 空值或未知值都回退到 nil
// 这样新增模式时（比如 workspace / gitChanged）只要：
// 新增文件实现 FileSelectorHandler
// 在这里注册一行
// 主流程不用改
const free_1 = require("./free");
const gitChanged_1 = require("./gitChanged");
const nil_1 = require("./nil");
const registry = {
    [free_1.freeFileSelector.mode]: free_1.freeFileSelector,
    [gitChanged_1.gitChangedFileSelector.mode]: gitChanged_1.gitChangedFileSelector,
    [nil_1.nilFileSelector.mode]: nil_1.nilFileSelector
};
function getFileSelector(mode) {
    const normalized = (mode ?? "").trim().toLowerCase();
    if (!normalized) {
        return nil_1.nilFileSelector;
    }
    return registry[normalized] ?? nil_1.nilFileSelector;
}
//# sourceMappingURL=registry.js.map