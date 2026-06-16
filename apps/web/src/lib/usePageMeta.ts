import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Canonical public origin. Keep in sync with public/sitemap.xml, robots.txt,
// llms.txt and the JSON-LD in index.html. See the canonical-domain note.
export const SITE_URL = 'https://fsuac.com';

interface PageMeta {
  /** Full <title> for the page. */
  title: string;
  /** <meta name="description"> + og/twitter description. */
  description: string;
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Sets per-page <title>, description, canonical, and Open Graph / Twitter tags.
 *
 * The site is a client-rendered SPA prerendered at build time via headless
 * Chrome (scripts/prerender.mjs), so the head tags this writes ARE captured in
 * the static HTML that crawlers receive — giving each public page distinct,
 * accurate metadata for search and AI engines.
 *
 * Canonical/og:url use the trailing-slash form (except root) — that's what
 * Cloudflare Pages serves for prerendered dist/<route>/index.html, so canonical
 * == served URL == sitemap.xml (no canonical-points-to-redirect).
 */
export function usePageMeta({ title, description }: PageMeta): void {
  const { pathname } = useLocation();
  useEffect(() => {
    const path = pathname === '/' ? '/' : pathname.replace(/\/+$/, '') + '/';
    const url = SITE_URL + path;

    document.title = title;
    upsertMeta('name', 'description', description);
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:url', url);
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);
    upsertCanonical(url);
  }, [title, description, pathname]);
}
