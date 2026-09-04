import { getAnthropicVisionProvider } from '@/server/ai/anthropic-vision-provider';
import { getPhotoConverter } from '@/server/ai/heic-photo-converter';
import { PostgresResearchJobRepository } from '@/server/items/postgres-research-repository';
import { getFileObjectStore } from '@/server/storage/file-object-store';

import { runInspectImagesJob } from './inspect-images-job';

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5000);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const dependencies = {
    jobs: new PostgresResearchJobRepository(),
    objectStore: getFileObjectStore(),
    vision: getAnthropicVisionProvider(),
    photoConverter: getPhotoConverter(),
  };

  console.log('inspect_images worker started');
  let shuttingDown = false;
  process.on('SIGTERM', () => {
    shuttingDown = true;
  });
  process.on('SIGINT', () => {
    shuttingDown = true;
  });

  while (!shuttingDown) {
    try {
      const result = await runInspectImagesJob(dependencies);
      if (!result.claimed) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      console.log(
        `inspect_images job for item ${result.itemId} ${result.outcome}`,
      );
    } catch (error) {
      console.error('inspect_images worker iteration failed', error);
      await sleep(POLL_INTERVAL_MS);
    }
  }
  console.log('inspect_images worker stopped');
}

void main();
