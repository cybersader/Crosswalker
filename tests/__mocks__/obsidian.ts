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

// parseYaml — minimal block-YAML parser covering exactly the dialect this
// repo's own two frontmatter serializers emit: generation-engine.ts's
// buildNoteContent/formatYamlLine (2-space indent, block-style nested
// objects/arrays, double-quoted strings with `\"` escaping) AND
// tools/lib/crosswalk-shared.ts's frontmatterToYaml (same nesting, but
// inline `key: [a, b]` arrays instead of block lists). Added for
// src/export/vault-reader.ts's cachedRead+parseYaml fallback path (mirrors
// src/views/workspace-view.ts's `producerKindOf`, which needed no test mock
// because nothing unit-tests that file directly — vault-reader.ts's read
// path IS unit tested, so the mock needs a working parseYaml). Not a general
// YAML parser: no anchors/multi-doc/flow-maps/literal block scalars — those
// never appear in Crosswalker-produced frontmatter.
export function parseYaml(text: string): unknown {
  const lines = text.split('\n');
  let idx = 0;

  const leadingSpaces = (s: string): number => {
    const m = s.match(/^ */);
    return m ? m[0].length : 0;
  };

  const parseScalar = (raw: string): unknown => {
    const t = raw.trim();
    if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
      return t.slice(1, -1).replace(/\\"/g, '"');
    }
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (t === 'null' || t === '') return null;
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    return t;
  };

  const parseScalarOrInlineArray = (raw: string): unknown => {
    const t = raw.trim();
    if (t.startsWith('[') && t.endsWith(']')) {
      const inner = t.slice(1, -1).trim();
      if (inner === '') return [];
      return inner.split(',').map((x) => parseScalar(x.trim()));
    }
    return parseScalar(t);
  };

  const isListLine = (content: string): boolean => /^-(\s|$)/.test(content);

  const parseMap = (indent: number): Record<string, unknown> => {
    const obj: Record<string, unknown> = {};
    while (idx < lines.length) {
      const line = lines[idx];
      if (line.trim() === '') {
        idx++;
        continue;
      }
      const lineIndent = leadingSpaces(line);
      if (lineIndent < indent) break;
      if (lineIndent > indent) break; // caller mis-dispatched; stop rather than misparse
      const content = line.slice(indent);
      const m = content.match(/^([^:]+):\s?(.*)$/);
      if (!m) {
        idx++;
        continue;
      }
      const key = m[1].trim();
      const rest = m[2];
      idx++;
      if (rest === '') {
        const next = lines[idx];
        if (idx < lines.length && next !== undefined && next.trim() !== '' && leadingSpaces(next) > indent) {
          const nestedIndent = leadingSpaces(next);
          obj[key] = isListLine(next.slice(nestedIndent)) ? parseList(nestedIndent) : parseMap(nestedIndent);
        } else {
          obj[key] = null;
        }
      } else {
        obj[key] = parseScalarOrInlineArray(rest);
      }
    }
    return obj;
  };

  const parseList = (indent: number): unknown[] => {
    const arr: unknown[] = [];
    while (idx < lines.length) {
      const line = lines[idx];
      if (line.trim() === '') {
        idx++;
        continue;
      }
      const lineIndent = leadingSpaces(line);
      if (lineIndent !== indent) break;
      const content = line.slice(indent);
      if (!isListLine(content)) break;
      const rest = content.slice(1).trim();
      idx++;
      if (rest === '') {
        const next = lines[idx];
        if (idx < lines.length && next !== undefined && leadingSpaces(next) > indent) {
          arr.push(parseMap(leadingSpaces(next)));
        } else {
          arr.push(null);
        }
      } else {
        arr.push(parseScalarOrInlineArray(rest));
      }
    }
    return arr;
  };

  return parseMap(0);
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
