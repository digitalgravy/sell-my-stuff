import { headers } from 'next/headers';

// A bookmarklet's fetch() to /api/research/captures is genuinely
// cross-origin (it runs injected into whatever page the user is on --
// eBay, not this app), so it authenticates with CAPTURE_INBOX_TOKEN
// rather than the same-origin check every other mutating route uses.
// Printing the token into this rendered page is an accepted tradeoff
// for a single-user, LAN-only app with no login system at all today --
// the same trust model as noVNC's own unauthenticated remote-view
// channel elsewhere in this project.
export default async function CaptureToolsPage() {
  const headerList = await headers();
  const host = headerList.get('host') ?? 'localhost:3000';
  const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
  const origin = `${protocol}://${host}`;
  const token = process.env.CAPTURE_INBOX_TOKEN;

  const bookmarkletSource = token
    ? `(function(){var u=${JSON.stringify(`${origin}/api/research/captures?token=${token}`)};fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({html:document.documentElement.outerHTML,sourceUrl:location.href})}).then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d};});}).then(function(res){alert(res.ok?('Captured '+res.d.extractedCount+' comparable sale(s)'):('Capture failed: '+(res.d.error||'unknown error')));}).catch(function(e){alert('Capture failed: '+e.message);});})();`
    : null;

  return (
    <div className="mx-auto max-w-[720px] px-4 pb-20 pt-8 sm:px-7 sm:pt-11">
      <h1 className="text-2xl font-semibold tracking-[-0.03em]">Capture bookmarklet</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Drag this link to your bookmarks bar. While viewing an eBay Sold/Completed search results
        page in your own browser, click it — comparable sales are extracted automatically and show
        up as a pending import on any item&apos;s Evidence tab.
      </p>

      {!bookmarkletSource ? (
        <p className="mt-6 rounded-2xl border border-dashed border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          <code>CAPTURE_INBOX_TOKEN</code> is not set — the bookmarklet cannot authenticate until
          it is.
        </p>
      ) : (
        <div className="mt-6 rounded-[1.75rem] border border-border/75 bg-card p-8 text-center">
          <a
            href={`javascript:${encodeURIComponent(bookmarkletSource)}`}
            className="inline-flex items-center rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
          >
            Capture eBay page
          </a>
          <p className="mt-3 text-xs text-muted-foreground">
            Drag, don&apos;t click — this only works once it&apos;s a real bookmark, clicked while
            on the page you want to capture.
          </p>
        </div>
      )}
    </div>
  );
}
