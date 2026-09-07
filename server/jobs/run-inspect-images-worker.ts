import { getAnthropicComparableMatchProvider } from '@/server/ai/anthropic-comparable-match-provider';
import { getAnthropicConditionProvider } from '@/server/ai/anthropic-condition-provider';
import { getAnthropicVisionProvider } from '@/server/ai/anthropic-vision-provider';
import { getPhotoConverter } from '@/server/ai/heic-photo-converter';
import { PostgresResearchJobRepository } from '@/server/items/postgres-research-repository';
import {
  getEbayBrowserResearchProvider,
  getMacBrowserResearchProvider,
} from '@/server/research/ebay-browser-research-provider';
import { getFileObjectStore } from '@/server/storage/file-object-store';

import { runInspectImagesJob } from './inspect-images-job';
import { runResearchComparableSalesJob } from './research-comparable-sales-job';

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5000);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const dependencies = {
    jobs: new PostgresResearchJobRepository(),
    objectStore: getFileObjectStore(),
    vision: getAnthropicVisionProvider(),
    condition: getAnthropicConditionProvider(),
    photoConverter: getPhotoConverter(),
    // Mac first (real Chrome, real trusted-device identity -- most
    // likely to get through eBay's bot detection), Docker sell-browser
    // as fallback. Both filtered to only the ones actually configured.
    browserProviders: [getMacBrowserResearchProvider(), getEbayBrowserResearchProvider()].filter(
      (provider) => provider !== undefined,
    ),
    matchProvider: getAnthropicComparableMatchProvider(),
  };

  console.log('job worker started (inspect_images, research_comparable_sales)');
  let shuttingDown = false;
  process.on('SIGTERM', () => {
    shuttingDown = true;
  });
  process.on('SIGINT', () => {
    shuttingDown = true;
  });

  while (!shuttingDown) {
    try {
      const inspectResult = await runInspectImagesJob(dependencies);
      if (inspectResult.claimed) {
        console.log(
          `inspect_images job for item ${inspectResult.itemId} ${inspectResult.outcome}`,
        );
        continue;
      }

      const researchResult = await runResearchComparableSalesJob(dependencies);
      if (researchResult.claimed) {
        console.log(
          `research_comparable_sales job for item ${researchResult.itemId} ${researchResult.outcome}`,
        );
        continue;
      }

      await sleep(POLL_INTERVAL_MS);
    } catch (error) {
      console.error('job worker iteration failed', error);
      await sleep(POLL_INTERVAL_MS);
    }
  }
  console.log('job worker stopped');
}

void main();
