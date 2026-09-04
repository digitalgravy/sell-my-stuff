# ADR 0007: Provider-independent AI routing

- Status: Proposed
- Date: 2026-09-03

## Decision

Define task-level ports for vision, extraction, classification, reasoning and browser interpretation. Provider adapters may target OpenAI, Anthropic or OpenAI-compatible/local endpoints. Validate every model response against a versioned schema and record model, approximate cost and evidence lineage.

## Consequences

No domain workflow imports a provider SDK directly. Browser credentials and cookies are never model inputs. Deterministic code owns arithmetic, workflow and policy.

## Implementation (2026-09-04)

The first vision port, `VisionIdentificationProvider` (`server/ai/vision-provider.ts`), is now implemented by `AnthropicVisionProvider` (`server/ai/anthropic-vision-provider.ts`) using the official `@anthropic-ai/sdk` and `client.messages.parse` with a Zod schema (`identificationResultSchema`) via `output_config.format`, so a malformed model response fails validation rather than becoming a silently trusted fact. The default model is `claude-sonnet-5` and can be overridden with `ANTHROPIC_VISION_MODEL`. `server/jobs/inspect-images-job.ts` is the first worker stage: it claims one `inspect_images` job at a time with a leased `FOR UPDATE SKIP LOCKED` Postgres claim (`PostgresResearchJobRepository.claimNextJob`), calls the vision port, writes the leading candidate as confidence/evidence-tagged rows in the new `item_facts` table, and transitions the item to `RESEARCHING` or `NEEDS_INFORMATION` depending on confidence and open questions. Expired claims are recoverable after a worker crash and failed attempts use bounded exponential backoff. Only Anthropic is implemented; the OpenAI/local-endpoint adapters described above remain future work.

**Resolved gap (2026-09-04):** Claude's vision input only accepts JPEG/PNG/GIF/WebP, but HEIC/HEIF is the default iPhone capture format and is already accepted by the upload API. `server/jobs/inspect-images-job.ts` now converts each photo through an injected `PhotoConverter` (`server/ai/photo-conversion.ts`) before it reaches the vision port; the production implementation, `HeicPhotoConverter` (`server/ai/heic-photo-converter.ts`), converts HEIC/HEIF to JPEG using `heic-convert` (a pure-JS/WASM libheif build), so no native libvips build with HEIF support is needed in the runtime image — `sharp`'s prebuilt binaries omit HEIC input support for patent-licensing reasons. Non-HEIC photos pass through unconverted. `AnthropicVisionProvider`'s `UnsupportedPhotoFormatError` remains as a defense-in-depth backstop for any other unsupported format that reaches it. Verified against a real `.heic` file locally (`HeicPhotoConverter converts a real HEIC photo to a decodable JPEG` in `test/photo-conversion.test.ts`, gated on `HEIC_TEST_FIXTURE` so it stays skipped, not failing, in CI without a fixture); not yet verified against the real Anthropic API end-to-end (see `PROJECT_STATUS.md`).
