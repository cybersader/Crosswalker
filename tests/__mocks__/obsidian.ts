// Minimal mock of the Obsidian API for unit testing

export class Plugin {
  app: any = {};
  manifest: any = {};
  loadData = jest.fn().mockResolvedValue({});
  saveData = jest.fn().mockResolvedValue(undefined);
  addCommand = jest.fn();
  addSettingTab = jest.fn();
  addRibbonIcon = jest.fn();
  addStatusBarItem = jest.fn().mockReturnValue({ setText: jest.fn() });
  registerView = jest.fn();
  registerEditorSuggest = jest.fn();
  registerEvent = jest.fn();
}

export class TFile {
  path: string;
  basename: string;
  extension: string;
  constructor(path: string = 'test.md') {
    this.path = path;
    this.basename = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
    this.extension = 'md';
  }
}

export class TFolder {
  path: string;
  children: any[] = [];
  constructor(path: string = '') {
    this.path = path;
  }
}

export class TAbstractFile {
  path: string = '';
}

export class Notice {
  constructor(_message: string, _timeout?: number) {}
}

export class Modal {
  app: any;
  contentEl: any = {
    empty: jest.fn(),
    createEl: jest.fn().mockReturnValue({ createEl: jest.fn(), setText: jest.fn(), addClass: jest.fn() }),
    createDiv: jest.fn().mockReturnValue({ createEl: jest.fn(), setText: jest.fn(), addClass: jest.fn() }),
    addClass: jest.fn(),
  };
  modalEl: any = { addClass: jest.fn() };
  constructor(app: any) { this.app = app; }
  open = jest.fn();
  close = jest.fn();
  onOpen() {}
  onClose() {}
}

export class Setting {
  constructor(_containerEl: HTMLElement) {}
  setName = jest.fn().mockReturnThis();
  setDesc = jest.fn().mockReturnThis();
  setHeading = jest.fn().mockReturnThis();
  addText = jest.fn().mockReturnThis();
  addToggle = jest.fn().mockReturnThis();
  addDropdown = jest.fn().mockReturnThis();
  addButton = jest.fn().mockReturnThis();
  addTextArea = jest.fn().mockReturnThis();
}

export class PluginSettingTab {
  app: any;
  plugin: any;
  containerEl: any = { empty: jest.fn(), createEl: jest.fn() };
  constructor(app: any, plugin: any) {
    this.app = app;
    this.plugin = plugin;
  }
  display() {}
}

export class Vault {
  getAbstractFileByPath = jest.fn();
  getMarkdownFiles = jest.fn().mockReturnValue([]);
  read = jest.fn().mockResolvedValue('');
  modify = jest.fn().mockResolvedValue(undefined);
  create = jest.fn().mockResolvedValue(new TFile());
  createFolder = jest.fn().mockResolvedValue(undefined);
  adapter = {
    exists: jest.fn().mockResolvedValue(false),
    read: jest.fn().mockResolvedValue(''),
    write: jest.fn().mockResolvedValue(undefined),
  };
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}
