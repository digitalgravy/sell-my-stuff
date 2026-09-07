export interface BrowserSoldListing {
  title: string;
  match: string;
  soldAt: string;
  price: number;
}

export type ComparableSalesBrowserResult =
  | { outcome: 'succeeded'; query: string; url: string; sales: BrowserSoldListing[] }
  /** Never a hard error to the caller -- eBay bot-blocking, an unreachable service, or a busy session are all real, expected outcomes; a caller should fall back to the manual search-link path. */
  | { outcome: 'unavailable'; reason: string };

/**
 * The `ComparableSalesProvider` port from BRIEF.md, specifically the
 * authenticated-browser mechanism (`sell-browser`, a separate service --
 * see its README) rather than an eBay API. Resembles a careful human
 * researching one item, per BRIEF.md's "Authenticated eBay browser
 * research" section, never a bulk scraper.
 */
export interface ComparableSalesBrowserProvider {
  fetchSoldListings(keywords: string): Promise<ComparableSalesBrowserResult>;
}
