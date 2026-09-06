import * as cheerio from 'cheerio';

import type { ComparableSale } from '@/server/items/item-detail-repository';

// A server-side port of sell-browser's src/sold-listings.ts extraction
// logic, adapted from Playwright's live-page document.querySelectorAll
// to cheerio parsing a static HTML string captured by the browser
// bookmarklet (see app/tools/capture) -- the selectors and parsing
// rules are the same, confirmed against production 2026-09-06.

export interface RawSoldCard {
  listingId: string | null;
  title: string;
  subtitle: string;
  caption: string;
  priceRaw: string;
  url: string;
}

// Confirmed against a real eBay sold/completed search results page:
// - Results live in ul.srp-results.srp-list > li.s-card.
// - eBay mixes in sponsored/filler cards (e.g. a generic "Shop on eBay"
//   card) with the same s-card structure but no sold-item marker --
//   the [aria-label="Sold item"] check is what separates a genuine
//   sold listing from those.
// - .s-card__title wraps the visible title in a child span, with a
//   sibling .clipped span carrying screen-reader-only "Opens in a new
//   window or tab" text -- reading .s-card__title's own text directly
//   would silently glue that onto the real title.
export function extractRawSoldCardsFromHtml(html: string): RawSoldCard[] {
  const $ = cheerio.load(html);
  const results: RawSoldCard[] = [];

  $('ul.srp-results.srp-list li.s-card').each((_, element) => {
    const card = $(element);
    const soldMarker = card.find('[aria-label="Sold item"]').first();
    if (soldMarker.length === 0) return;

    const titleText = card.find('.s-card__title .su-styled-text').first().text().trim();
    const priceText = card.find('.s-card__price').first().text().trim();
    if (titleText.length === 0 || priceText.length === 0) return;

    const link = card.find('a.s-card__link[href]').first();
    results.push({
      listingId: card.attr('data-listingid') ?? null,
      title: titleText,
      subtitle: card.find('.s-card__subtitle').first().text().trim(),
      caption: soldMarker.text().trim(),
      priceRaw: priceText,
      url: link.attr('href') ?? '',
    });
  });

  return results;
}

export function extractPageTitle(html: string): string | undefined {
  const $ = cheerio.load(html);
  const title = $('title').first().text().trim();
  return title.length > 0 ? title : undefined;
}

// "£109.90" / "£1,234.56" -> 109.9 / 1234.56.
export function parsePrice(raw: string): number | undefined {
  const cleaned = raw.replace(/,/g, '');
  const numberMatch = /\d+(?:\.\d+)?/.exec(cleaned);
  if (!numberMatch) return undefined;
  const value = Number.parseFloat(numberMatch[0]);
  return Number.isFinite(value) ? value : undefined;
}

const MONTHS: Record<string, string> = {
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12',
};

// "Sold  6 Sep 2026" (note: eBay renders a double space after "Sold")
// -> "2026-09-06".
export function parseSoldDate(raw: string): string | undefined {
  const match = /^Sold\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/.exec(raw.trim());
  if (!match) return undefined;
  const [, day, monthName, year] = match;
  const month = MONTHS[monthName as keyof typeof MONTHS];
  if (month === undefined) return undefined;
  return `${year}-${month}-${day!.padStart(2, '0')}`;
}

// Drops any card whose price or date didn't parse rather than emitting
// a partial/guessed record. `match` carries the condition/spec
// descriptor eBay itself shows (e.g. "Pre-owned · Apple iPhone 12 ·
// Unlocked · 64 GB") -- honest data already on the page, not an
// invented similarity score.
export function toSoldComparable(card: RawSoldCard): ComparableSale | undefined {
  const price = parsePrice(card.priceRaw);
  const soldAt = parseSoldDate(card.caption);
  if (price === undefined || soldAt === undefined) return undefined;
  return { title: card.title, match: card.subtitle, soldAt, price };
}

export function extractComparableSalesFromHtml(html: string): ComparableSale[] {
  return extractRawSoldCardsFromHtml(html)
    .map(toSoldComparable)
    .filter((sale): sale is ComparableSale => sale !== undefined);
}
