import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractComparableSalesFromHtml,
  extractPageTitle,
  extractRawSoldCardsFromHtml,
  parsePrice,
  parseSoldDate,
  toSoldComparable,
  type RawSoldCard,
} from '../server/research/sold-listings-html';

const REAL_SOLD_CARD_HTML = `
<html>
<head><title>iPhone 12 for sale | eBay</title></head>
<body>
  <ul class="srp-results srp-list clearfix">
    <li class="s-card s-card--horizontal">
      <div class="su-card-container">
        <div class="su-card-container__content">
          <div class="su-card-container__header">
            <div class="s-card__caption"><span class="su-styled-text positive default" aria-label="Sold item">Sold  6 Sep 2026</span></div>
            <a class="s-card__link" href="https://www.ebay.co.uk/itm/366646761763">
              <div role="heading" class="s-card__title"><span class="su-styled-text primary default">Apple iPhone 12, used but in good working order! Grab a bargain</span><span class="clipped">Opens in a new window or tab</span></div>
            </a>
            <div class="s-card__subtitle-row"><div class="s-card__subtitle"><span class="su-styled-text secondary default">Pre-owned · </span><span class="su-styled-text secondary default">Apple iPhone 12 · </span><span class="su-styled-text secondary default">Unlocked · </span><span class="su-styled-text secondary default">64 GB</span></div></div>
          </div>
          <div class="su-card-container__attributes">
            <div class="s-card__attribute-row"><span class="su-styled-text positive bold large-1 s-card__price">£109.90</span></div>
          </div>
        </div>
      </div>
    </li>
    <li class="s-card s-card--horizontal">
      <div class="su-card-container">
        <div class="su-card-container__content">
          <div class="su-card-container__header">
            <a class="s-card__link" href="https://ebay.com/itm/sponsored">
              <div role="heading" class="s-card__title"><span class="su-styled-text primary default">Shop on eBay</span></div>
            </a>
          </div>
          <div class="su-card-container__attributes">
            <div class="s-card__attribute-row"><span class="su-styled-text positive bold default s-card__price">$20.00</span></div>
          </div>
        </div>
      </div>
    </li>
  </ul>
</body>
</html>
`;

void test('extractPageTitle reads the document title', () => {
  assert.equal(extractPageTitle(REAL_SOLD_CARD_HTML), 'iPhone 12 for sale | eBay');
});

void test('extractPageTitle returns undefined when there is no title', () => {
  assert.equal(extractPageTitle('<html><body>no title here</body></html>'), undefined);
});

void test('extractRawSoldCardsFromHtml finds only genuine sold cards, dropping sponsored filler', () => {
  const cards = extractRawSoldCardsFromHtml(REAL_SOLD_CARD_HTML);
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0], {
    listingId: null,
    title: 'Apple iPhone 12, used but in good working order! Grab a bargain',
    subtitle: 'Pre-owned · Apple iPhone 12 · Unlocked · 64 GB',
    caption: 'Sold  6 Sep 2026',
    priceRaw: '£109.90',
    url: 'https://www.ebay.co.uk/itm/366646761763',
  });
});

void test('extractRawSoldCardsFromHtml reads the data-listingid attribute when present', () => {
  const html = REAL_SOLD_CARD_HTML.replace(
    '<li class="s-card s-card--horizontal">\n      <div class="su-card-container">\n        <div class="su-card-container__content">\n          <div class="su-card-container__header">\n            <div class="s-card__caption">',
    '<li class="s-card s-card--horizontal" data-listingid="366646761763">\n      <div class="su-card-container">\n        <div class="su-card-container__content">\n          <div class="su-card-container__header">\n            <div class="s-card__caption">',
  );
  const [card] = extractRawSoldCardsFromHtml(html);
  assert.equal(card!.listingId, '366646761763');
});

void test('extractComparableSalesFromHtml maps the real page straight to ComparableSale', () => {
  const sales = extractComparableSalesFromHtml(REAL_SOLD_CARD_HTML);
  assert.deepEqual(sales, [
    {
      title: 'Apple iPhone 12, used but in good working order! Grab a bargain',
      match: 'Pre-owned · Apple iPhone 12 · Unlocked · 64 GB',
      soldAt: '2026-09-06',
      price: 109.9,
    },
  ]);
});

void test('parsePrice reads a plain price', () => {
  assert.equal(parsePrice('£109.90'), 109.9);
});

void test('parsePrice strips thousands separators', () => {
  assert.equal(parsePrice('£1,234.56'), 1234.56);
});

void test('parsePrice returns undefined for text with no number', () => {
  assert.equal(parsePrice(''), undefined);
});

void test('parseSoldDate reads eBay\'s "Sold  <day> <mon> <year>" caption', () => {
  assert.equal(parseSoldDate('Sold  6 Sep 2026'), '2026-09-06');
});

void test('parseSoldDate returns undefined for an unrecognised shape', () => {
  assert.equal(parseSoldDate('Ended 6 Sep 2026'), undefined);
});

const validCard: RawSoldCard = {
  listingId: '366646761763',
  title: 'Apple iPhone 12, used but in good working order! Grab a bargain',
  subtitle: 'Pre-owned · Apple iPhone 12 · Unlocked · 64 GB',
  caption: 'Sold  6 Sep 2026',
  priceRaw: '£109.90',
  url: 'https://www.ebay.co.uk/itm/366646761763',
};

void test('toSoldComparable drops a card with no parseable price', () => {
  assert.equal(toSoldComparable({ ...validCard, priceRaw: '' }), undefined);
});

void test('toSoldComparable drops a card with no parseable sold date', () => {
  assert.equal(toSoldComparable({ ...validCard, caption: '' }), undefined);
});
