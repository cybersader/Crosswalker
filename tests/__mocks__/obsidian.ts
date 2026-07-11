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

export class FuzzySuggestModal<T> extends Modal {
  setPlaceholder = jest.fn();
  getItems(): T[] { return []; }
  getItemText(_item: T): string { return ''; }
  onChooseItem(_item: T): void {}
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

// FileManager — Phase 4.5 needs processFrontMatter for the canonical safe
// frontmatter edit API. The real Obsidian implementation reads the file,
// parses YAML frontmatter, passes the parsed object to the callback for
// mutation, serializes back, writes the file. Our mock takes a Map-backed
// store keyed by file.path so tests can assert on resulting frontmatter
// without parsing YAML.
export class FileManager {
  // Test-only escape hatch: in-memory frontmatter store keyed by path.
  // Real Obsidian persists to the file; mock keeps it here so tests can
  // inspect it via `fileManager.__frontmatter[path]`.
  __frontmatter: Map<string, Record<string, unknown>> = new Map();

  processFrontMatter = jest.fn(async (file: any, cb: (fm: Record<string, unknown>) => void) => {
    const path = file?.path ?? 'unknown.md';
    const existing = this.__frontmatter.get(path) ?? {};
    cb(existing);
    this.__frontmatter.set(path, existing);
  });
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

// Platform — Phase 4a Obsidian-mock addition. Tests can set
// Platform.isMobile via `(Platform as any).isMobile = true` to exercise
// mobile-gated code paths.
export const Platform = {
  isMobile: false,
  isDesktop: true,
  isMobileApp: false,
  isDesktopApp: true,
  isIosApp: false,
  isAndroidApp: false,
  isMacOS: false,
  isWin: false,
  isLinux: true,
};

export class ButtonComponent {
  buttonEl: any = { addClass: jest.fn(), removeClass: jest.fn() };
  constructor(_containerEl: HTMLElement) {}
  setButtonText = jest.fn().mockReturnThis();
  setCta = jest.fn().mockReturnThis();
  setWarning = jest.fn().mockReturnThis();
  onClick = jest.fn().mockReturnThis();
  setIcon = jest.fn().mockReturnThis();
  setTooltip = jest.fn().mockReturnThis();
  setDisabled = jest.fn().mockReturnThis();
}
