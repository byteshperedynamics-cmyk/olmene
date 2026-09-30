/**
 * olmene.com — Worker
 *
 * Lives at the root of github.com/byteshperedynamics-cmyk/olmene.
 * Workers Builds deploys it on every push to main; it serves
 * olmene.com and www.olmene.com via Worker custom domains.
 *
 * Signals its origin via the `x-olmene-source: repository` header.
 */

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>olmene</title>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-P6X5RFQG7W"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-P6X5RFQG7W');
</script>
<style>
  :root { color-scheme: dark; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #0a0a0b;
    color: #e7e7ea;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-font-smoothing: antialiased;
  }
  main {
    text-align: center;
    padding: 2rem;
    max-width: 34rem;
  }
  .mark {
    font-size: clamp(2.6rem, 9vw, 4.2rem);
    font-weight: 600;
    letter-spacing: -0.045em;
    background: linear-gradient(140deg, #f5f5f7 15%, #9a9aa5 85%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .dot { color: #4f46e5; }
  .line {
    width: 3.5rem;
    height: 1px;
    margin: 1.6rem auto;
    background: linear-gradient(90deg, transparent, #4b4b55, transparent);
  }
  p {
    font-size: 0.95rem;
    line-height: 1.65;
    color: #a1a1ab;
  }
  .meta {
    margin-top: 2.2rem;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #5c5c66;
  }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85em;
    color: #c7c7d1;
    background: #17171b;
    border: 1px solid #26262d;
    border-radius: 4px;
    padding: 0.1em 0.35em;
  }
</style>
</head>
<body>
<main>
  <div class="mark">olmene<span class="dot">.</span></div>
  <div class="line"></div>
  <p>Deployed from the repository.<br>
     Every push to <code>main</code> ships automatically.</p>
  <div class="meta">live &middot; olmene.com</div>
</main>
</body>
</html>`;

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/healthz') {
      return new Response('ok', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    return new Response(PAGE, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-cache, no-store, must-revalidate',
        'x-olmene-source': 'repository',
      },
    });
  },
};
