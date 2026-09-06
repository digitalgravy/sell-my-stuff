'use client';

import { useEffect, useRef } from 'react';

// React blocks any javascript: URL passed through JSX's href prop
// outright ("React has blocked a javascript: URL as a security
// precaution") -- confirmed live 2026-09-06, this silently neutered
// the bookmarklet with no visible error unless the console was open.
// Setting the attribute imperatively via a ref, after mount, bypasses
// React's own prop-diffing for href entirely -- this is a real
// DOM API call, not something React's sanitizer intercepts.
export function BookmarkletLink({ source }: { source: string }) {
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    ref.current?.setAttribute('href', `javascript:${encodeURIComponent(source)}`);
  }, [source]);

  return (
    // eslint-disable-next-line jsx-a11y/anchor-is-valid -- the real href is set imperatively above, after mount
    <a
      ref={ref}
      href="#"
      className="inline-flex items-center rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
    >
      Capture eBay page
    </a>
  );
}
