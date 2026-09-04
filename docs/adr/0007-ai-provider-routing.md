# ADR 0007: Provider-independent AI routing

- Status: Proposed
- Date: 2026-09-03

## Decision

Define task-level ports for vision, extraction, classification, reasoning and browser interpretation. Provider adapters may target OpenAI, Anthropic or OpenAI-compatible/local endpoints. Validate every model response against a versioned schema and record model, approximate cost and evidence lineage.

## Consequences

No domain workflow imports a provider SDK directly. Browser credentials and cookies are never model inputs. Deterministic code owns arithmetic, workflow and policy.

## Implementation (2026-09-04)

The first vision port, `VisionIdentificationProvider` (`server/ai/vision-provider.ts`), is now implemented by `AnthropicVisionProvider` (`server/ai/anthropic-vision-provider.ts`) using the official `@anthropic-ai/sdk` and `client.messages.parse` with a Zod schema (`identificationResultSchema`) via `output_config.format`, so a malformed model response fails validation rather than becoming a silently trusted fact. The default model is `claude-sonnet-5` and can be overridden with `ANTHROPIC_VISION_MODEL`. `server/jobs/inspect-images-job.ts` is the first worker stage: it claims one `inspect_images` job at a time with a leased `FOR UPDATE SKIP LOCKED` Postgres claim (`PostgresResearchJobRepository.claimNextJob`), calls the vision port, writes the leading candidate as confidence/evidence-tagged rows in the new `item_facts` table, and transitions the item to `RESEARCHING` or `NEEDS_INFORMATION` depending on confidence and open questions. Expired claims are recoverable after a worker crash and failed attempts use bounded exponential backoff. Only Anthropic is implemented; the OpenAI/local-endpoint adapters described above remain future work.

**Known gap:** Claude's vision input only accepts JPEG/PNG/GIF/WebP. HEIC/HEIF photos (the default iPhone capture format, already accepted by the upload API) are rejected by `AnthropicVisionProvider` with a clear `UnsupportedPhotoFormatError`, which fails the job with a readable `lastError` rather than crashing silently. A HEIC→JPEG conversion step (client-side at capture, or server-side before the vision call) is required before this is usable end-to-end on real iPhone photos — see `PROJECT_STATUS.md`.
