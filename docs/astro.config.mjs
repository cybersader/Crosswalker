import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';
import nova from 'starlight-theme-nova';
import starlightSiteGraph from 'starlight-site-graph';
import starlightBlog from 'starlight-blog';
import starlightAnnouncement from 'starlight-announcement';
import starlightImageZoom from 'starlight-image-zoom';
import starlightHeadingBadges from 'starlight-heading-badges';
// (Mermaid was dropped 2026-06-13: rehype-mermaid needs a headless browser at
//  build time — broke the Windows dev box AND the deploy CI — and the diagrams
//  read cleaner as hand-authored inline HTML/CSS anyway. Diagrams now live as
//  styled HTML in the .mdx pages; no build-time browser, renders everywhere.)
import starlightTagsPlugin from 'starlight-tags';
import remarkGfm from 'remark-gfm';
import remarkObsidianCallout from 'remark-obsidian-callout';
import remarkWikiLink from 'remark-wiki-link';
import rehypeExternalLinks from 'rehype-external-links';

export default defineConfig({
  site: 'https://cybersader.github.io',
  base: '/crosswalker',
  vite: {
    plugins: [tailwindcss()],
    define: {
      'process.platform': '"browser"',
      'process.version': '"v0.0.0"',
      'process.env': '{}',
    },
    server: {
      // Allow access from Docker / MCP browser / LAN / Tailscale / cross-machine previews.
      // Vite 6+ blocks non-localhost Host headers by default — this opens it back up.
      // Safe for local dev only; production builds are served as static files.
      allowedHosts: true,
    },
  },
  markdown: {
    // remark-gfm explicitly first: the @astrojs/mdx pipeline stopped
    // auto-applying GFM (tables, strikethrough, etc.) to .mdx files after a
    // dependency bump — plain .md kept it, .mdx lost it. Adding it here
    // restores GFM tables for both .md and .mdx.
    remarkPlugins: [
      remarkGfm,
      remarkObsidianCallout,
      [remarkWikiLink, { aliasDivider: '|' }],
    ],
    rehypePlugins: [
      [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }],
    ],
  },
  integrations: [
    starlight({
      title: 'Crosswalker',
      logo: {
        src: './public/logo.svg',
      },
      favicon: '/favicon.svg',
      description: 'Import structured ontologies into Obsidian with folder structures, typed links, and metadata',
      lastUpdated: true,
      components: {
        MobileMenuFooter: './src/components/MobileMenuFooter.astro',
        PageTitle: './src/components/PageTitle.astro',
      },
      editLink: {
        baseUrl: 'https://github.com/cybersader/crosswalker/edit/main/docs/',
      },
      plugins: [
        starlightAnnouncement({
          announcements: [{
            id: 'early-alpha',
            content: '🚧 Early alpha — building the foundation.',
            link: { text: 'See the roadmap →', href: '/crosswalker/reference/roadmap/' },
            variant: 'caution',
            dismissible: true,
          }],
        }),
        nova({
          nav: [
            { label: 'Docs', href: '/crosswalker/getting-started/installation/' },
            { label: 'Blog', href: '/crosswalker/blog/' },
          ],
        }),
        starlightSiteGraph(),
        starlightBlog({
          title: 'Changelog',
          prefix: 'blog',
        }),
        starlightImageZoom(),
        starlightHeadingBadges(),
        starlightTagsPlugin(),
      ],
      customCss: [
        './src/styles/global.css',
        './src/styles/brand.css',
      ],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/cybersader/crosswalker' },
      ],
      sidebar: [
        {
          label: 'Getting started',
          autogenerate: { directory: 'getting-started' },
        },
        {
          label: 'Features',
          autogenerate: { directory: 'features' },
        },
        {
          label: 'Examples',
          autogenerate: { directory: 'examples', collapsed: true },
        },
        {
          label: 'Concepts',
          autogenerate: { directory: 'concepts', collapsed: true },
        },
        {
          label: 'Design',
          autogenerate: { directory: 'design' },
        },
        {
          label: 'Agent context & exploration',
          autogenerate: { directory: 'agent-context', collapsed: true },
        },
        {
          label: 'Development',
          autogenerate: { directory: 'development' },
        },
        {
          label: 'Reference',
          autogenerate: { directory: 'reference', collapsed: true },
        },
      ],
    }),
  ],
});
