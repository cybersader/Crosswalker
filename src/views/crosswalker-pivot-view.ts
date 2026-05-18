/**
 * crosswalker-pivot-view.ts — Phase 3 v0.1.6 (per Settled #2 + Ch 30)
 *
 * The single custom Bases view registered in v0.1.6: `crosswalkerPivot`.
 * Renders a pivot grid (rows × cols × cells) from Bases-filtered entries.
 *
 * Lifecycle (Component):
 *   - constructor: Bases injects controller + containerEl + plugin ref
 *   - onload: setup container + initial render
 *   - onDataUpdated: Bases calls when filters/entries change → re-render
 *   - onunload: clean up DOM
 *
 * Data flow:
 *   1. Bases applies its global+view filters → controller.entries (BasesEntry[])
 *   2. View options provide rows axis, cols axis, cell op, optional heatmap
 *   3. computePivotGrid (pure helper) shapes entries into rows × cols matrix
 *   4. View renders matrix as <table> with optional heatmap CSS variables
 *
 * Per Ch 29 §4 + Ch 30 §5: pivot is Layer B (presentation); data shaping
 * lives in pivot-grid.ts (pure function); this file is the DOM renderer.
 */

import { Component, setIcon } from 'obsidian';
import {
	computePivotGrid,
	heatmapIntensity,
	type PivotAggregationOp,
	type PivotEntry,
	type PivotGridResult,
} from './pivot-grid';

/**
 * Minimal subset of the Bases controller surface we depend on. We don't import
 * Bases types directly because they aren't exported from the public Obsidian
 * `obsidian` package (they live behind `obsidian-typings` or internal paths).
 * Casting through this interface keeps Crosswalker compile-clean even when
 * Obsidian Bases types churn.
 */
interface MinimalBasesController {
	/** Filtered entries — Bases applies its global + view filters before passing. */
	entries?: unknown[];
	/** Bases view config object (read-only at our layer). */
	config?: {
		/** View options keyed by ViewOption.key. */
		[key: string]: unknown;
	};
	/** Subscribe to data-update events; we use onDataUpdated() lifecycle instead. */
	on?: (event: string, callback: () => void) => void;
}

/** Bases Entry shape — minimal subset. Real BasesEntry has more (file ref, properties, etc.). */
interface MinimalBasesEntry {
	properties?: Record<string, unknown>;
	file?: { path: string; basename: string };
	/** Some Bases versions expose properties at the top level. */
	[key: string]: unknown;
}

/**
 * Factory that returns a CrosswalkerPivotView constructor. Adapter pattern
 * matching TaskNotes v4: Bases calls `factory(controller, containerEl)` to get
 * an instance, but we need access to the plugin handle for queryCrosswalk +
 * settings. Closure captures the plugin ref.
 */
export function buildCrosswalkerPivotViewFactory(plugin: {
	queryCrosswalk?: (
		subjectOnt: string,
		objectOnt: string,
		predicateId?: string,
	) => Promise<unknown[]>;
}) {
	return (controller: unknown, containerEl: HTMLElement) => {
		const view = new CrosswalkerPivotView(controller as MinimalBasesController, containerEl, plugin);
		// Bases calls onload() on the returned object (it's a Component).
		// Our load() is a no-op until Bases sets app/config/data on us.
		return view;
	};
}

class CrosswalkerPivotView extends Component {
	private controller: MinimalBasesController;
	private containerEl: HTMLElement;
	private plugin: { queryCrosswalk?: (...args: unknown[]) => Promise<unknown[]> };
	private rootEl: HTMLElement | null = null;
	/** Debounce re-renders during rapid Bases data updates. */
	private renderDebounce: number | null = null;

	constructor(
		controller: MinimalBasesController,
		containerEl: HTMLElement,
		plugin: { queryCrosswalk?: (...args: unknown[]) => Promise<unknown[]> },
	) {
		super();
		this.controller = controller;
		this.containerEl = containerEl;
		this.plugin = plugin;
	}

	/** Component lifecycle: called when Bases instantiates the view. */
	onload(): void {
		this.containerEl.empty();
		this.rootEl = this.containerEl.createDiv({ cls: 'crosswalker-pivot-grid' });
		this.render();
	}

	/** Component lifecycle: clean up on unmount. */
	onunload(): void {
		if (this.renderDebounce !== null) {
			window.clearTimeout(this.renderDebounce);
			this.renderDebounce = null;
		}
		this.rootEl?.empty();
		this.rootEl = null;
	}

	/**
	 * BasesView lifecycle: called by Bases whenever filters change or entries update.
	 * Debounced 100ms to avoid thrashing during rapid filter typing.
	 */
	onDataUpdated(): void {
		if (!this.rootEl?.isConnected) return;

		if (this.renderDebounce !== null) window.clearTimeout(this.renderDebounce);
		const win = this.containerEl.ownerDocument.defaultView ?? window;
		this.renderDebounce = win.setTimeout(() => {
			this.renderDebounce = null;
			try {
				this.render();
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				this.renderError(msg);
			}
		}, 100);
	}

	/** Render the pivot grid into rootEl. */
	private render(): void {
		if (!this.rootEl) return;
		this.rootEl.empty();

		const entries = this.collectEntries();
		const config = this.collectConfig();

		// Empty-state cases — Phase 5: explicit diagnostic, not generic "No entries"
		if (entries.length === 0) {
			this.renderDiagnosticEmpty(config);
			return;
		}

		const rowsBy = (config.rowsBy ?? '').trim();
		const colsBy = (config.colsBy ?? '').trim();
		if (!rowsBy || !colsBy) {
			this.renderEmpty(
				'Configure the pivot view: set "Rows by" and "Cols by" properties in the view options panel.',
			);
			return;
		}

		const result = computePivotGrid(entries, {
			rowsBy: (e: PivotEntry) => extractProp(e, rowsBy),
			colsBy: (e: PivotEntry) => extractProp(e, colsBy),
			cellOp: config.cellOp,
			cellOf: config.cellOf ? (e: PivotEntry) => extractProp(e, config.cellOf as string) : undefined,
			empty: config.empty,
			rowSort: config.rowSort,
			colSort: config.colSort,
		});

		// Phase 5 sparse-pivot HARD guard — block render when the result is
		// degenerate (zero non-empty cells OR over the hard cell-count ceiling).
		const cellCount = result.rowKeys.length * result.colKeys.length;
		const HARD_CELL_CEILING = 250_000;
		if (cellCount > HARD_CELL_CEILING) {
			this.renderEmpty(
				`Pivot is too large to render: ${result.rowKeys.length.toLocaleString()} rows × ` +
				`${result.colKeys.length.toLocaleString()} cols = ${cellCount.toLocaleString()} cells ` +
				`(ceiling: ${HARD_CELL_CEILING.toLocaleString()}). Narrow the Bases filter, use more ` +
				`selective row/col axes, or pre-aggregate before pivoting.`,
			);
			return;
		}
		if (result.rowKeys.length === 0 || result.colKeys.length === 0) {
			this.renderDiagnosticEmpty(config);
			return;
		}

		// Sparse-pivot SOFT warning — show but render the table
		if (result.sparsePivotWarning) {
			this.rootEl.createDiv({
				cls: 'crosswalker-pivot-warning',
				text: `Sparse pivot: ${result.rowKeys.length}×${result.colKeys.length} = ${cellCount.toLocaleString()} cells. Consider narrowing the Bases filter or using more selective row/col axes.`,
			});
		}

		this.renderTable(result, config.heatmap === true);
	}

	/**
	 * Phase 5: explicit empty-state diagnostic. Instead of generic "No entries match,"
	 * tell the user the LIKELY cause: missing SSSOM-imported junction notes.
	 */
	private renderDiagnosticEmpty(config: { emptyMessage?: string }): void {
		if (!this.rootEl) return;
		this.rootEl.empty();
		const wrap = this.rootEl.createDiv({ cls: 'crosswalker-pivot-empty crosswalker-pivot-empty-diagnostic' });
		wrap.createEl('h4', { text: 'No data for this pivot' });
		if (config.emptyMessage) {
			wrap.createEl('p', { text: config.emptyMessage });
		} else {
			wrap.createEl('p', {
				text: 'The Bases filter matched 0 junction notes. Likely causes:',
			});
			const list = wrap.createEl('ul');
			list.createEl('li', { text: 'No SSSOM crosswalks have been imported yet for the ontologies in this filter. Run "Crosswalker: Import SSSOM crosswalk" to populate _crosswalker/mappings/.' });
			list.createEl('li', { text: 'The recipe filter targets a folder that does not exist in this vault.' });
			list.createEl('li', { text: 'A confidence threshold or filter clause is excluding every junction.' });
		}
	}

	/** Render the pivot data as an HTML table. */
	private renderTable(result: PivotGridResult, heatmap: boolean): void {
		if (!this.rootEl) return;

		const table = this.rootEl.createEl('table', { cls: 'crosswalker-pivot-table' });
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { cls: 'crosswalker-pivot-corner', text: '' });
		for (const colKey of result.colKeys) {
			headerRow.createEl('th', { cls: 'crosswalker-pivot-col-header', text: colKey });
		}

		const tbody = table.createEl('tbody');
		for (let r = 0; r < result.rowKeys.length; r++) {
			const tr = tbody.createEl('tr');
			tr.createEl('th', { cls: 'crosswalker-pivot-row-header', text: result.rowKeys[r] });
			for (let c = 0; c < result.colKeys.length; c++) {
				const cell = result.cells[r][c];
				const td = tr.createEl('td', { cls: 'crosswalker-pivot-cell' });
				if (cell === null) {
					td.addClass('crosswalker-pivot-cell-empty');
					td.textContent = '—';
				} else {
					td.textContent = formatCellValue(cell);
				}
				if (heatmap) {
					const intensity = heatmapIntensity(cell, result.range);
					td.style.setProperty('--crosswalker-pivot-cell-intensity', String(intensity));
					td.addClass('crosswalker-pivot-cell-heatmap');
				}
			}
		}

		// Footer: totals + range info.
		const footer = this.rootEl.createDiv({ cls: 'crosswalker-pivot-footer' });
		footer.createSpan({
			text: `${result.rowKeys.length} rows × ${result.colKeys.length} cols · ${result.totalEntries.toLocaleString()} entries`,
		});
		if (result.range) {
			footer.createSpan({
				text: ` · range ${formatCellValue(result.range.min)}–${formatCellValue(result.range.max)}`,
			});
		}
	}

	private renderEmpty(message: string): void {
		if (!this.rootEl) return;
		const empty = this.rootEl.createDiv({ cls: 'crosswalker-pivot-empty' });
		const icon = empty.createSpan({ cls: 'crosswalker-pivot-empty-icon' });
		setIcon(icon, 'info');
		empty.createSpan({ text: ` ${message}` });
	}

	private renderError(message: string): void {
		if (!this.rootEl) return;
		this.rootEl.empty();
		const err = this.rootEl.createDiv({ cls: 'crosswalker-pivot-error' });
		const icon = err.createSpan({ cls: 'crosswalker-pivot-error-icon' });
		setIcon(icon, 'alert-triangle');
		err.createSpan({ text: ` Error: ${message}` });
	}

	/** Pull entries from controller.entries; normalize to PivotEntry shape. */
	private collectEntries(): PivotEntry[] {
		const raw = this.controller.entries ?? [];
		const out: PivotEntry[] = [];
		for (const e of raw) {
			out.push(normalizeBasesEntry(e as MinimalBasesEntry));
		}
		return out;
	}

	/** Pull view options from controller.config (set via the View Options panel). */
	private collectConfig(): {
		rowsBy?: string;
		colsBy?: string;
		cellOp?: PivotAggregationOp;
		cellOf?: string;
		empty?: 'gap' | 'blank' | 'zero';
		heatmap?: boolean;
		rowSort?: 'asc' | 'desc' | 'none';
		colSort?: 'asc' | 'desc' | 'none';
		emptyMessage?: string;
	} {
		const cfg = this.controller.config ?? {};
		return {
			rowsBy: stringOption(cfg.rowsBy),
			colsBy: stringOption(cfg.colsBy),
			cellOp: aggregationOption(cfg.cellOp),
			cellOf: stringOption(cfg.cellOf),
			empty: emptyOption(cfg.empty),
			heatmap: cfg.heatmap === true,
			rowSort: sortOption(cfg.rowSort),
			colSort: sortOption(cfg.colSort),
			emptyMessage: stringOption(cfg.emptyMessage),
		};
	}
}

// ============================================================================
// Helpers
// ============================================================================

/** Normalize a Bases entry to a flat property-bag for pivot extraction. */
function normalizeBasesEntry(entry: MinimalBasesEntry): PivotEntry {
	// Bases puts frontmatter in `entry.properties`; the file path is at entry.file.path.
	// We flatten properties to top level for property-name extractors, with a `file.*`
	// prefix path mirroring Bases formula syntax (file.name, file.path, etc.).
	const out: PivotEntry = { ...(entry.properties ?? {}) };
	if (entry.file) {
		out['file.path'] = entry.file.path;
		out['file.name'] = entry.file.basename;
	}
	// Some Bases versions expose properties at the top level too.
	for (const [k, v] of Object.entries(entry)) {
		if (k === 'properties' || k === 'file') continue;
		if (out[k] === undefined) out[k] = v;
	}
	return out;
}

/** Extract a property by name; supports `file.path`, `note.x`, plain key. */
function extractProp(entry: PivotEntry, prop: string): string | undefined {
	if (prop in entry) {
		const v = entry[prop];
		if (v === null || v === undefined) return undefined;
		return String(v);
	}
	// Fallback: dotted-path traversal (e.g. note.frontmatter.status)
	const parts = prop.split('.');
	let cur: unknown = entry;
	for (const part of parts) {
		if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
			cur = (cur as Record<string, unknown>)[part];
		} else {
			return undefined;
		}
	}
	if (cur === null || cur === undefined) return undefined;
	return String(cur);
}

function stringOption(v: unknown): string | undefined {
	if (typeof v === 'string' && v.trim() !== '') return v;
	return undefined;
}

function aggregationOption(v: unknown): PivotAggregationOp | undefined {
	const valid: PivotAggregationOp[] = ['count', 'count_distinct', 'sum', 'avg', 'min', 'max', 'first', 'last'];
	if (typeof v === 'string' && (valid as string[]).includes(v)) return v as PivotAggregationOp;
	return undefined;
}

function emptyOption(v: unknown): 'gap' | 'blank' | 'zero' | undefined {
	if (v === 'gap' || v === 'blank' || v === 'zero') return v;
	return undefined;
}

function sortOption(v: unknown): 'asc' | 'desc' | 'none' | undefined {
	if (v === 'asc' || v === 'desc' || v === 'none') return v;
	return undefined;
}

function formatCellValue(v: number | string): string {
	if (typeof v === 'number') {
		// Round non-integer cells to 3 decimal places for display.
		if (Number.isInteger(v)) return v.toLocaleString();
		return v.toFixed(3);
	}
	return v;
}
