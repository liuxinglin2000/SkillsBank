// src/fileSelectors/registry.ts：模式注册表（选择器工厂）
// 这个文件是“路由层”。

// 把 free、nil 两个实现注册到 registry
// 暴露 getFileSelector(mode?)
// 先做 trim + lowerCase
// 空值或未知值都回退到 nil
// 这样新增模式时（比如 workspace / gitChanged）只要：
// 新增文件实现 FileSelectorHandler
// 在这里注册一行
// 主流程不用改
import { freeFileSelector } from "./free";
import { nilFileSelector } from "./nil";
import { FileSelectorHandler } from "./types";

const registry: Record<string, FileSelectorHandler> = {
  [freeFileSelector.mode]: freeFileSelector,
  [nilFileSelector.mode]: nilFileSelector
};

export function getFileSelector(mode?: string): FileSelectorHandler {
  const normalized = (mode ?? "").trim().toLowerCase();
  if (!normalized) {
    return nilFileSelector;
  }
  return registry[normalized] ?? nilFileSelector;
}
