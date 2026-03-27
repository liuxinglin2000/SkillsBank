import { FileSelectorContext, FileSelectorHandler, FileSelectorMessage } from "./types";

export const nilFileSelector: FileSelectorHandler = {
  mode: "nil",
  requiresFiles: false,
  render(): string {
    return "";
  },
  getClientScript(): string {
    return "";
  },
  async onMessage(_msg: FileSelectorMessage, _context: FileSelectorContext): Promise<boolean> {
    return false;
  }
};
