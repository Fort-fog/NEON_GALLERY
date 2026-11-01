/* GitHub Pages adapter for NEON GALLERY. Original Go code and app.js stay intact. */
(() => {
  'use strict';
  const originalFetch = window.fetch.bind(window);
  const root = new URL('./', document.baseURI);
  const fixPath = (value) => {
    if (typeof value !== 'string') return value;
    if (value.startsWith('/assets/')) return new URL(value.slice(1), root).href;
    if (value.startsWith('/vendor/')) return new URL(value.slice(1), root).href;
    return value;
  };
  const normalize = (item) => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item).map(([k, v]) => [k, normalize(v)]));
    }
    return fixPath(item);
  };
  window.fetch = async (resource, options) => {
    const raw = resource instanceof Request ? resource.url : String(resource);
    const url = new URL(raw, document.baseURI);
    if (url.pathname !== '/api/gallery' && !url.pathname.endsWith('/api/gallery')) {
      return originalFetch(resource, options);
    }
    const source = await originalFetch(new URL('gallery.json', root), { cache: 'no-store' });
    if (!source.ok) return source;
    const response = normalize(await source.json());
    const listKey = Array.isArray(response) ? null :
      (['items', 'gallery', 'artworks', 'photos'].find(k => Array.isArray(response?.[k])));
    const items = listKey === null && Array.isArray(response) ? response :
      listKey ? response[listKey] : null;
    if (!items) throw new Error('Pages API adapter: unknown JSON response structure');
    const category = (url.searchParams.get('category') || '').trim().toLowerCase();
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const selected = items.filter(it => {
      const cat = String(it.category || '').toLowerCase();
      const matchesCategory = !category || category === 'all' || cat === category;
      const text = [it.title, it.description, it.category, it.author].join(' ').toLowerCase();
      return matchesCategory && (!q || text.includes(q));
    });
    const result = listKey === null ? selected : { ...response, [listKey]: selected };
    if (listKey !== null) {
      if ('total' in result) result.total = selected.length;
      if ('count' in result) result.count = selected.length;
    }
    return new Response(JSON.stringify(result), {
      status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  };
})();
