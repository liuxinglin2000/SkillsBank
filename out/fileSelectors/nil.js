"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nilFileSelector = void 0;
exports.nilFileSelector = {
    mode: "nil",
    requiresFiles: false,
    render() {
        return "";
    },
    getClientScript() {
        return "";
    },
    async onMessage(_msg, _context) {
        return false;
    }
};
//# sourceMappingURL=nil.js.map