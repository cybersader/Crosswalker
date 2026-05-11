/**
 * DebugLog — wide structured events with trace correlation (Phase 3.5).
 *
 * Storage: NDJSON. One JSON object per line in `crosswalker-debug.log` at vault
 * root. Designed for agents (Claude Code sessions diagnosing user-reported bugs
 * via `cat | jq` and grep). Humans can `cat | jq` or open the file in any
 * editor; an in-Obsidian viewer is intentionally out of scope.
 *
 * Event schema (every line):
 *   {
 *     ts: ISO-8601 UTC,
 *     level: 'error' | 'warn' | 'info' | 'trace',
 *     category: string,        // subsystem (e.g. 'generation', 'wizard', 'tier2')
 *     op: string,              // operation slug (e.g. 'row-error', 'starting')
 *     msg: string,             // short human-readable message
 *     trace_id?: hex,          // shared across all events in one user action
 *     span_id?: hex,           // this event's span
 *     parent_span_id?: hex,    // for nesting
 *     duration_ms?: number,    // emitted on span-end events
 *     ...freeform context
 *   }
 *
 * Trace propagation is explicit (no AsyncLocalStorage). Top-level user actions
 * call `withTrace(id, fn)` to set the current trace_id for the duration of fn;
 * `span()` auto-emits start + end events with parent_span_id from the
 * surrounding span (if any).
 *
 * Backward-compat: `.log()` and `.error()` keep working during the migration.
 * They emit NDJSON events with category='legacy'. Phase 3.5c will sweep them.
 */

import { App, TFile } from 'obsidian';

// ---------------------------------------------------------------------------
// Event schema
// ---------------------------------------------------------------------------

export type DebugLevel = 'error' | 'warn' | 'info' | 'trace';

export interface DebugEvent {
	ts: string;
	level: DebugLevel;
	category: string;
	op: string;
	msg: string;
	trace_id?: string;
	span_id?: string;
	parent_span_id?: string;
	duration_ms?: number;
	[key: string]: unknown;
}

export interface SpanContext {
	span_id: string;
	trace_id: string | undefined;
	event(op: string, msg: string, data?: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// Rotation tuning
// ---------------------------------------------------------------------------

const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MB per file
const MAX_ROTATIONS = 3;                // .log + .1 + .2 + .3 = 20 MB max

// ---------------------------------------------------------------------------
// Secret redaction
// ---------------------------------------------------------------------------

const SECRET_PATTERNS: RegExp[] = [
	/\b(sk-|ghp_|ghs_|gho_|github_pat_|pat-|xox[abps]-|AKIA|AIza)[A-Za-z0-9_/+-]{10,}\b/g,
	/\b[A-Za-z0-9_-]{60,}\b/g, // long opaque tokens (JWT-like)
];

function redactSecrets(s: string): string {
	let out = s;
	for (const re of SECRET_PATTERNS) {
		out = out.replace(re, '[REDACTED]');
	}
	return out;
}

// ---------------------------------------------------------------------------
// Hex ID generation
// ---------------------------------------------------------------------------

function randHex(bytes: number): string {
	// 4 bytes → 8 hex chars; collision-resistant enough for trace/span IDs
	// within one plugin session.
	let out = '';
	for (let i = 0; i < bytes; i++) {
		out += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
	}
	return out;
}

// ---------------------------------------------------------------------------
// DebugLog
// ---------------------------------------------------------------------------

export class DebugLog {
	private app: App;
	private enabled: boolean;
	private verbose: boolean;
	private categoryFilters: Record<string, boolean>;
	private logPath = 'crosswalker-debug.log';

	// Trace + span context (stack-based; safe for sequential async; not
	// concurrent-safe, but Crosswalker has no concurrent top-level imports).
	private currentTrace: string | undefined;
	private currentSpan: string | undefined;

	// Serialized write queue prevents interleaved partial writes when many
	// events fire in quick succession.
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(app: App, enabled = false, verbose = false, categoryFilters: Record<string, boolean> = {}) {
		this.app = app;
		this.enabled = enabled;
		this.verbose = verbose;
		this.categoryFilters = categoryFilters;
	}

	// -----------------------------------------------------------------------
	// Configuration
	// -----------------------------------------------------------------------

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	setVerbose(verbose: boolean): void {
		this.verbose = verbose;
	}

	setCategoryFilters(filters: Record<string, boolean>): void {
		this.categoryFilters = filters;
	}

	// -----------------------------------------------------------------------
	// Trace + span context (explicit propagation)
	// -----------------------------------------------------------------------

	newTraceId(): string {
		return randHex(4);
	}

	/**
	 * Set the current trace_id for the duration of `fn`. Restores the previous
	 * trace_id afterward. Sync- and async-safe for sequential code.
	 */
	async withTrace<T>(traceId: string, fn: () => Promise<T> | T): Promise<T> {
		const prev = this.currentTrace;
		this.currentTrace = traceId;
		try {
			return await fn();
		} finally {
			this.currentTrace = prev;
		}
	}

	/**
	 * Get the current trace_id (or undefined if not inside withTrace).
	 */
	currentTraceId(): string | undefined {
		return this.currentTrace;
	}

	/**
	 * Wrap an async operation in a span. Auto-emits start + end events with
	 * duration_ms. The end event becomes a 'span-end' op with the original op
	 * as suffix; the start event uses op as-is. If `fn` throws, the end event
	 * is emitted at 'error' level with error_class + error_message.
	 *
	 * The SpanContext passed to fn lets you emit child events that share this
	 * span's ID.
	 */
	async span<T>(
		category: string,
		op: string,
		fn: (ctx: SpanContext) => Promise<T>,
		data?: Record<string, unknown>,
	): Promise<T> {
		const span_id = randHex(4);
		const parent_span_id = this.currentSpan;
		const startTs = Date.now();

		this.write({
			ts: new Date().toISOString(),
			level: 'info',
			category,
			op: `${op}/start`,
			msg: `${category}.${op} starting`,
			trace_id: this.currentTrace,
			span_id,
			parent_span_id,
			...data,
		});

		const prevSpan = this.currentSpan;
		this.currentSpan = span_id;
		try {
			const ctx: SpanContext = {
				span_id,
				trace_id: this.currentTrace,
				event: (childOp, childMsg, childData) => {
					this.write({
						ts: new Date().toISOString(),
						level: 'info',
						category,
						op: `${op}/${childOp}`,
						msg: childMsg,
						trace_id: this.currentTrace,
						span_id,
						...childData,
					});
				},
			};
			const result = await fn(ctx);
			this.write({
				ts: new Date().toISOString(),
				level: 'info',
				category,
				op: `${op}/end`,
				msg: `${category}.${op} complete`,
				trace_id: this.currentTrace,
				span_id,
				parent_span_id,
				duration_ms: Date.now() - startTs,
			});
			return result;
		} catch (err) {
			this.write({
				ts: new Date().toISOString(),
				level: 'error',
				category,
				op: `${op}/end`,
				msg: `${category}.${op} failed`,
				trace_id: this.currentTrace,
				span_id,
				parent_span_id,
				duration_ms: Date.now() - startTs,
				error_class: err instanceof Error ? err.constructor.name : typeof err,
				error_message: err instanceof Error ? err.message : String(err),
				...(err instanceof Error && err.stack ? { stack: err.stack } : {}),
			});
			throw err;
		} finally {
			this.currentSpan = prevSpan;
		}
	}

	// -----------------------------------------------------------------------
	// Severity methods (preferred API)
	// -----------------------------------------------------------------------

	info(category: string, op: string, msg: string, data?: Record<string, unknown>): void {
		this.emit('info', category, op, msg, data);
	}

	warn(category: string, op: string, msg: string, data?: Record<string, unknown>): void {
		this.emit('warn', category, op, msg, data);
	}

	error(category: string, op: string, msg: string, data?: Record<string, unknown>): void;
	// Backward-compat overload: error(msg, err) — emits as category='legacy'.
	error(msg: string, errOrData?: Error | Record<string, unknown>): void;
	error(
		categoryOrMsg: string,
		opOrErr?: string | Error | Record<string, unknown>,
		msg?: string,
		data?: Record<string, unknown>,
	): void {
		// Detect the legacy 2-arg shape: error(msg, errorOrData).
		const isLegacy = typeof opOrErr !== 'string' && msg === undefined;
		if (isLegacy) {
			const errData = opOrErr instanceof Error
				? { error_class: opOrErr.constructor.name, error_message: opOrErr.message, stack: opOrErr.stack }
				: (opOrErr as Record<string, unknown> | undefined);
			this.emit('error', 'legacy', 'event', categoryOrMsg, errData);
		} else {
			this.emit('error', categoryOrMsg, opOrErr as string, msg as string, data);
		}
	}

	trace(category: string, op: string, msg: string, data?: Record<string, unknown>): void {
		this.emit('trace', category, op, msg, data);
	}

	// -----------------------------------------------------------------------
	// Backward-compat shim — Phase 3.5c will remove
	// -----------------------------------------------------------------------

	/**
	 * @deprecated Use `info(category, op, msg, data)` instead. This shim emits
	 * events with category='legacy' until Phase 3.5c sweeps all call sites.
	 */
	log(msg: string, data?: Record<string, unknown>): void {
		this.emit('info', 'legacy', 'event', msg, data);
	}

	// -----------------------------------------------------------------------
	// Lifecycle
	// -----------------------------------------------------------------------

	async clear(): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(this.logPath);
			if (file instanceof TFile) {
				await this.app.vault.modify(file, '');
			}
		} catch (err) {
			console.error('[Crosswalker] Failed to clear debug log:', err);
		}
	}

	async delete(): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(this.logPath);
			if (file instanceof TFile) {
				await this.app.vault.delete(file);
			}
		} catch (err) {
			console.error('[Crosswalker] Failed to delete debug log:', err);
		}
	}

	/**
	 * Return the path the debug log lives at (vault-relative).
	 */
	getLogPath(): string {
		return this.logPath;
	}

	/**
	 * Read up to `maxBytes` (tail) of the current log file, redact obvious
	 * secrets, and return the string. For the export-to-clipboard command.
	 */
	async readForExport(maxBytes = 1024 * 1024): Promise<string> {
		try {
			const file = this.app.vault.getAbstractFileByPath(this.logPath);
			if (!(file instanceof TFile)) return '';
			const content = await this.app.vault.read(file);
			const tail = content.length > maxBytes
				? content.slice(content.length - maxBytes)
				: content;
			return redactSecrets(tail);
		} catch (err) {
			console.error('[Crosswalker] Failed to read debug log:', err);
			return '';
		}
	}

	// -----------------------------------------------------------------------
	// Internal: event emission + write queue + rotation
	// -----------------------------------------------------------------------

	private emit(
		level: DebugLevel,
		category: string,
		op: string,
		msg: string,
		data?: Record<string, unknown>,
	): void {
		// Mirror to console always (helps when log file is disabled)
		const consoleArgs: unknown[] = [`[Crosswalker:${level}] ${category}/${op}: ${msg}`];
		if (data) consoleArgs.push(data);
		if (level === 'error') {
			console.error(...consoleArgs);
		} else if (level === 'warn') {
			console.warn(...consoleArgs);
		} else {
			console.log(...consoleArgs);
		}

		// File output gated on: enabled + (trace ⇒ verbose) + category filter
		if (!this.enabled) return;
		if (level === 'trace' && !this.verbose) return;
		if (!this.shouldEmitCategory(category)) return;

		this.write({
			ts: new Date().toISOString(),
			level,
			category,
			op,
			msg,
			trace_id: this.currentTrace,
			span_id: this.currentSpan,
			...data,
		});
	}

	private shouldEmitCategory(category: string): boolean {
		// Per-category opt-out (TaskNotes pattern). Default: emit all.
		return this.categoryFilters[category] !== false;
	}

	private write(event: DebugEvent): void {
		// Strip undefined fields (NDJSON should be tight)
		const cleaned: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(event)) {
			if (v !== undefined) cleaned[k] = v;
		}
		const line = JSON.stringify(cleaned) + '\n';

		// Serialize via promise chain — fire-and-forget but ordered
		this.writeQueue = this.writeQueue
			.then(() => this.appendLine(line))
			.catch((err) => {
				console.error('[Crosswalker] Failed to write debug log:', err);
			});
	}

	private async appendLine(line: string): Promise<void> {
		// Rotate first if needed (cheap stat check)
		await this.maybeRotate();
		// Use adapter.append for O(1) appends (vs vault.read + vault.modify O(n)).
		await this.app.vault.adapter.append(this.logPath, line);
	}

	private async maybeRotate(): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(this.logPath);
			if (!(file instanceof TFile)) return;
			if (file.stat.size < MAX_LOG_BYTES) return;
			await this.rotate();
		} catch (err) {
			console.error('[Crosswalker] Failed to check log rotation:', err);
		}
	}

	private async rotate(): Promise<void> {
		// Drop oldest rotation if it exists
		const oldest = this.app.vault.getAbstractFileByPath(`${this.logPath}.${MAX_ROTATIONS}`);
		if (oldest instanceof TFile) {
			await this.app.vault.delete(oldest);
		}
		// Shift .N-1 → .N, .N-2 → .N-1, ..., .1 → .2 (in reverse so no clobber)
		for (let i = MAX_ROTATIONS - 1; i >= 1; i--) {
			const src = this.app.vault.getAbstractFileByPath(`${this.logPath}.${i}`);
			if (src instanceof TFile) {
				await this.app.vault.rename(src, `${this.logPath}.${i + 1}`);
			}
		}
		// .log → .1
		const current = this.app.vault.getAbstractFileByPath(this.logPath);
		if (current instanceof TFile) {
			await this.app.vault.rename(current, `${this.logPath}.1`);
		}
	}
}
