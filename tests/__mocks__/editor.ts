/**
 * Mocked Obsidian Editor API for Jest unit tests (Phase 4a — testing helpers).
 *
 * Use this for any test that exercises code calling `editor.replaceSelection`,
 * `editor.getCursor`, etc. without spinning up WebDriver. Lifespan: any
 * Editor-touching feature (Phase 4 base-block insertion + Phase 5 materialization).
 *
 * The mock captures every call so tests can assert on inputs.
 *
 * Example:
 *   const ed = createMockEditor({ cursor: { line: 5, ch: 0 }, content: '...' });
 *   insertBaseBlock(ed, '```base\n...\n```');
 *   expect(ed.calls.replaceSelection).toHaveLength(1);
 *   expect(ed.calls.replaceSelection[0]).toContain('```base');
 */

export interface EditorPosition {
	line: number;
	ch: number;
}

export interface MockEditorState {
	cursor: EditorPosition;
	content: string;
	selection?: { from: EditorPosition; to: EditorPosition };
}

export interface MockEditorOptions {
	cursor?: EditorPosition;
	content?: string;
	selection?: { from: EditorPosition; to: EditorPosition };
}

export interface MockEditor {
	// Public Obsidian Editor API surface we mock
	getCursor: () => EditorPosition;
	setCursor: (pos: EditorPosition) => void;
	getValue: () => string;
	setValue: (v: string) => void;
	getLine: (line: number) => string;
	getSelection: () => string;
	replaceSelection: (text: string) => void;
	replaceRange: (text: string, from: EditorPosition, to?: EditorPosition) => void;
	lineCount: () => number;
	lastLine: () => number;
	// Test-only escape hatch — read captured calls + current state
	state: MockEditorState;
	calls: {
		getCursor: number;
		setCursor: EditorPosition[];
		replaceSelection: string[];
		replaceRange: Array<{ text: string; from: EditorPosition; to?: EditorPosition }>;
	};
}

/**
 * Create a mocked Obsidian Editor. Defaults to a 10-line note with the cursor
 * at the start of line 5 — call sites override what they care about via
 * `MockEditorOptions`.
 */
export function createMockEditor(opts: MockEditorOptions = {}): MockEditor {
	const state: MockEditorState = {
		cursor: opts.cursor ?? { line: 0, ch: 0 },
		content: opts.content ?? '',
		selection: opts.selection,
	};

	const calls: MockEditor['calls'] = {
		getCursor: 0,
		setCursor: [],
		replaceSelection: [],
		replaceRange: [],
	};

	return {
		state,
		calls,

		getCursor(): EditorPosition {
			calls.getCursor += 1;
			return { ...state.cursor };
		},

		setCursor(pos: EditorPosition): void {
			calls.setCursor.push({ ...pos });
			state.cursor = { ...pos };
		},

		getValue(): string {
			return state.content;
		},

		setValue(v: string): void {
			state.content = v;
		},

		getLine(line: number): string {
			const lines = state.content.split('\n');
			return lines[line] ?? '';
		},

		getSelection(): string {
			if (!state.selection) return '';
			const lines = state.content.split('\n');
			const { from, to } = state.selection;
			if (from.line === to.line) {
				return (lines[from.line] ?? '').slice(from.ch, to.ch);
			}
			const fragments: string[] = [];
			fragments.push((lines[from.line] ?? '').slice(from.ch));
			for (let i = from.line + 1; i < to.line; i++) {
				fragments.push(lines[i] ?? '');
			}
			fragments.push((lines[to.line] ?? '').slice(0, to.ch));
			return fragments.join('\n');
		},

		replaceSelection(text: string): void {
			calls.replaceSelection.push(text);
			// Naive implementation: insert at cursor. Tests usually assert on
			// `calls.replaceSelection[0]` rather than the resulting content.
			const lines = state.content.split('\n');
			const { line, ch } = state.cursor;
			const before = (lines[line] ?? '').slice(0, ch);
			const after = (lines[line] ?? '').slice(ch);
			lines[line] = before + text + after;
			state.content = lines.join('\n');
		},

		replaceRange(text: string, from: EditorPosition, to?: EditorPosition): void {
			calls.replaceRange.push({ text, from: { ...from }, to: to ? { ...to } : undefined });
			const lines = state.content.split('\n');
			const endLine = to?.line ?? from.line;
			const endCh = to?.ch ?? from.ch;
			const beforeText = (lines[from.line] ?? '').slice(0, from.ch);
			const afterText = (lines[endLine] ?? '').slice(endCh);
			const newSegment = beforeText + text + afterText;
			const headLines = lines.slice(0, from.line);
			const tailLines = lines.slice(endLine + 1);
			state.content = [...headLines, newSegment, ...tailLines].join('\n');
		},

		lineCount(): number {
			return state.content.split('\n').length;
		},

		lastLine(): number {
			return Math.max(0, state.content.split('\n').length - 1);
		},
	};
}
