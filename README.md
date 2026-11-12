# links

Pagina link di Yeezik (stile Linktree), con lo stesso sfondo GradientASCII e lo stesso titolo YEEZIK della Home di prova (`yeezik-fun/yeezikwebsitetest`).

## Modificare i link

Apri `index.html` e cambia solo la lista `LINKS` (cerca "I TUOI LINK"):

```js
{ label: 'Spotify', url: 'https://open.spotify.com/artist/...' },
```

Un link con `url: ''` appare come **SOON** e non è cliccabile.

## File

- `index.html` — pagina, stile e lista dei link
- `assets/gradient-ascii.js` — sfondo animato (React Bits, in JS puro)
- `assets/decrypted-text.js` — effetto "decrypt" sul titolo e sui bottoni
- `fonts/Moderniz.woff` — font del titolo

## Pubblicare

Sito statico, nessuna build.

- **GitHub Pages**: Settings → Pages → Source "Deploy from a branch" → `main` / `(root)`. Indirizzo: `https://yeezik-fun.github.io/links/`
- **Cloudflare Workers**: collega la repo, lascia vuoto il Build command, Deploy command `npx wrangler deploy` (usa `wrangler.jsonc`).
