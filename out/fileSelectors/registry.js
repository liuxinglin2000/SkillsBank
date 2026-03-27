"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFileSelector = getFileSelector;
const free_1 = require("./free");
const nil_1 = require("./nil");
const registry = {
    [free_1.freeFileSelector.mode]: free_1.freeFileSelector,
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