/**
 * mobile-detection.ts — Phase 4a foundation helper.
 *
 * Single source of truth for "are we on mobile" so feature gates (e.g. the
 * raw-YAML editor desktop-only restriction per architectural commitment #3
 * mobile parity) don't duplicate the detection logic.
 *
 * Uses Obsidian's `Platform.isMobile` if available; falls back to user-agent
 * heuristics (e.g. for Jest tests where Platform isn't imported).
 */

import { Platform } from 'obsidian';

export function isMobile(): boolean {
	// Obsidian's Platform module is the canonical signal. Capacitor-based
	// mobile (iOS/Android) returns true here.
	if (typeof Platform !== 'undefined' && typeof Platform.isMobile === 'boolean') {
		return Platform.isMobile;
	}
	// Fallback for non-Obsidian environments (Jest mock obsidian.ts may not
	// export Platform). Conservative default: assume desktop.
	return false;
}

export function isDesktop(): boolean {
	return !isMobile();
}
