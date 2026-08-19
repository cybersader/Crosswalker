import type { RenderedBodyRegion, RenderReport, SourceScope } from './types';
import { renderTemplate } from './template';

export type BodyFormat = 'text' | 'code' | 'quote' | 'list';

export type BodyProjection =
	| {
			template: string;
			position?: 'append';
			format?: BodyFormat;
			omit_if_empty?: boolean;
	  }
	| {
			template: string;
			position: 'section';
			heading: string;
			heading_depth?: 1 | 2 | 3 | 4 | 5 | 6;
			format?: BodyFormat;
			omit_if_empty?: boolean;
	  };

/** Render one canonical body declaration into its vault-independent region. */
export function renderBodyProjection(
	projection: BodyProjection,
	scope: SourceScope,
	report?: RenderReport,
): RenderedBodyRegion | null {
	const rendered = renderTemplate(projection.template, scope, report);
	const empty = rendered.trim() === '';
	if (empty && (projection.omit_if_empty ?? true)) return null;

	const content = formatBodyValue(rendered, projection.format ?? 'text');
	if (projection.position === 'section') {
		return {
			position: 'section',
			content,
			heading: projection.heading,
			headingDepth: projection.heading_depth ?? 2,
		};
	}
	return { position: 'append', content };
}

/** Apply the canonical body format semantics without changing entry order. */
export function formatBodyValue(value: string, format: BodyFormat): string {
	switch (format) {
		case 'code':
			return formatCodeBlock(value);
		case 'quote':
			return value
				.replace(/\r\n/g, '\n')
				.split('\n')
				.map((line) => (line === '' ? '>' : `> ${line}`))
				.join('\n');
		case 'list':
			return value
				.replace(/\r\n/g, '\n')
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line !== '')
				.map((line) => `- ${line}`)
				.join('\n');
		case 'text':
		default:
			return value;
	}
}

function formatCodeBlock(value: string): string {
	let longestRun = 0;
	const runs = /`+/g;
	let match: RegExpExecArray | null;
	while ((match = runs.exec(value)) !== null) longestRun = Math.max(longestRun, match[0].length);
	const fence = '`'.repeat(Math.max(3, longestRun + 1));
	const newlineBeforeFence = value.endsWith('\n') ? '' : '\n';
	return `${fence}\n${value}${newlineBeforeFence}${fence}`;
}
