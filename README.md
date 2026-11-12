# links

Pagina link di Yeezik (stile Linktree).

Punto di partenza: copia identica della Home di `yeezik-fun/yeezikwebsitetest`
(sfondo GradientASCII, titolo YEEZIK con effetto DecryptedText, font Moderniz).
Da qui si costruisce la pagina link un pezzo alla volta.

## File

- `index.html` — pagina completa (stile e script dentro il file)
- `fonts/Moderniz.woff` — font del titolo

## Pubblicare

Sito statico, nessuna build.

- **GitHub Pages**: Settings → Pages → "Deploy from a branch" → `main` / `(root)` → `https://yeezik-fun.github.io/links/`
- **Cloudflare Workers**: Build command vuoto, Deploy command `npx wrangler deploy` (usa `wrangler.jsonc`).
