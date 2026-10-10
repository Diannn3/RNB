# Local runtime

AI execution was explicitly authorized for the inference fix on 2026-10-09.
The earlier LFM runtime verified synthetic form mapping, question/answer turns,
completed drafts, PDF field values, protected signature blanking, preview and
export on the RTX 2050. Those end-to-end results are not Qwen acceptance evidence.

The provisioned binaries/models live in ignored `.runtime/`; no sudo is needed.
Run commands from the repository root. The API and inference are localhost-only.
Use synthetic data only. Do not enable llama-server prompt logging or built-in tools.

## Provisioned versions

- Official `LiquidAI/LFM2.5-2.6B-GGUF`, revision
  `e7caca5d835a3901a8e0d63e94009429bafafdfc`:
  `.runtime/models/LFM2.5-2.6B-Q4_K_M.gguf` (1,674,455,040 bytes).
- [Qwen3.5-4B Q4_K_M](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF), repository revision
  `e87f176479d0855a907a41277aca2f8ee7a09523`, `Qwen3.5-4B-Q4_K_M.gguf`:
  `.runtime/models/Qwen3.5-4B-Q4_K_M.gguf` (2,740,937,888 bytes). Text-only use; no vision projector.
- Official [llama.cpp b11429](https://github.com/ggml-org/llama.cpp/releases/tag/b11429),
  Linux x64 CUDA 12.8 prebuilt: `.runtime/llama-cuda/llama-b11429/llama-server`.
  Archive: `llama-b11429-bin-ubuntu-cuda-12.8-x64.tar.gz`;
  SHA-256: `b13c64b9224d3c89d9993945d70cc21177ad00178c21b8d34237e3bc139834f1`.
- Matching bundled CUDA runtime: `.runtime/llama-cuda/cudart-llama-b11429-bin-ubuntu-cuda-12.8-x64/`.
  Archive: `cudart-llama-b11429-bin-ubuntu-cuda-12.8-x64.tar.gz`;
  SHA-256: `f4ab593e31507320b121f2cb21791f4c72420a2483d3df8bf2ca1a97d04e6845`.
  No CUDA compiler/toolkit or source compilation is required.
- Rootless Void packages: Tesseract 5.5.2, Leptonica 1.87.0, English tessdata;
  `.runtime/tesseract/usr/bin/tesseract` links to packaged `tesseract-ocr`.

## Start inference — only after explicit authorization

Both versions are retained. Select the same profile for the backend and its
server: `PAPELLESS_MODEL_PROFILE=lfm` (default, English) or `qwen` (Taglish).
The conversation check launches the matching model and passes the profile to
its API subprocess; its workflow assertions are shared, not copied.

Start the API with a model flag after starting the matching local inference server:

```sh
.venv/bin/python -m backend --model qwen
# Or: .venv/bin/python -m backend --model lfm
```

The API binds to `127.0.0.1:8000`. `--model` overrides `PAPELLESS_MODEL_PROFILE`; without the flag it uses that variable or defaults to `lfm`. The inference URL remains `PAPELLESS_LLAMA_URL` (default `http://127.0.0.1:8081`). This flag starts the API, not a second model server. Stop the API before changing profiles; a restart clears conversation memory but preserves SQLite resources and artifact files.

The Qwen CLI was exercised against the actual CUDA server: the frontend's `/api/v1/health` proxy returned HTTP 200, API/database `ok`, reachable `Qwen3.5-4B-Q4_K_M`, and 8,192 context tokens. No tests or generation calls were run for this switch.

```sh
# Original Liquid version
PAPELLESS_MODEL_PROFILE=lfm .venv/bin/python -m scripts.check_conversation
# Qwen version
PAPELLESS_MODEL_PROFILE=qwen .venv/bin/python -m scripts.check_conversation
```

For a manually launched server, the command below is the Qwen version.
For Liquid, replace the model path and alias with `LFM2.5-2.6B-Q4_K_M`
and use `--reasoning on --reasoning-budget 256`. Both use `--gpu-layers 99`
and `--ctx-size 8192`. Use separate
ports if running both, and point each backend's `PAPELLESS_LLAMA_URL`
at its matching server. Do not expect both fully offloaded models to fit
simultaneously on the 4 GB GPU.

```sh
export LD_LIBRARY_PATH="$PWD/.runtime/llama-cuda/cudart-llama-b11429-bin-ubuntu-cuda-12.8-x64:$PWD/.runtime/llama-cuda/llama-b11429${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
.runtime/llama-cuda/llama-b11429/llama-server \
  --model .runtime/models/Qwen3.5-4B-Q4_K_M.gguf \
  --alias Qwen3.5-4B-Q4_K_M --host 127.0.0.1 --port 8081 \
  --device CUDA0 --gpu-layers 99 \
  --ctx-size 8192 --parallel 1 --threads 4 --threads-batch 4 \
  --batch-size 256 --ubatch-size 128 --cache-ram 0 \
  --jinja --reasoning off --reasoning-budget 0 \
  --no-webui --no-slots --offline --log-disable
```

Full offload initially failed while an existing LFM server occupied 1,834 MiB
of VRAM. After stopping all llama servers, Qwen loaded with `--gpu-layers 99`,
8,192 context tokens and a 256-token reasoning budget. Its measured GPU memory
was 3,026 MiB. Full offload is now the default for both profiles; run one model
at a time on the RTX 2050. Partial offload remains possible by lowering the
server's `--gpu-layers` manually when other GPU workloads must remain active.

There is one 8,192-token slot. Inference reserves output and counts the actual
rendered chat template using `/apply-template` and `/tokenize`, including tool
schemas. Mapping/fact extraction splits source-linked excerpts without skipping
pages. Liquid allows 256 reasoning tokens per completion; Qwen reasoning is
disabled (`--reasoning off`, budget 0, `enable_thinking: false` in both template
counting and generation). Answer reserves remain 3,072 tokens for mapping and
facts, 256 for a question, and 1,024 for each tool round. All reasoning and answer
tokens count toward the 8,192-token limit. Temperature is zero. Connections time
out after 240 seconds; no remote fallback or proxy use.

Conversation and generated field questions use English for `lfm` and natural
Taglish for `qwen`. Official names, source quotes, user values, JSON keys and
tool arguments remain unchanged. Model-driven corpus explanations remain English
under both profiles: the local agent chooses scoped literal grep-style searches
over bundled `services.json`, then simplifies the retrieved definitions. Completed
answers require search evidence; citations come only from retrieved record IDs.
There are no embeddings, web, shell, arbitrary-file tools or remote fallback.
Explanation inference failures return errors, not canned corpus responses.

Explanation-agent smoke (LFM): the real local model searched `AICS`, refined its
search, and generated a simplified answer with the AICS official citation.
The HTTP explanation endpoint identified the uploaded Pantawid PDF despite an
SSS filename, refined an empty search, and returned a sourced explanation.
An unsupported quantum-mechanics query searched, found no records, and abstained.
Final synthesis uses JSON-schema-constrained generation after the tool phase;
unconstrained LFM prose did not satisfy the citation contract.

Merged current-field guidance remains offline and preserves pending values.
Post-merge smoke exercised Position field help, named SSS explanation despite
an explicit Pantawid field selection, and whole-form Pantawid synthesis.
Review fixes also preserve polite service precedence with an explicit field,
route polite label/help queries to offline guidance, and omit inferred mapping
metadata from unknown-field question prompts. Actual LFM smoke asked for the
printed Reference code rather than the unidentified form's purpose.
Post-merge verification passed 47 backend tests, three uploaded-form scenarios,
three frontend tests, and the production frontend build.

Qwen smoke verification: `/health` and `/v1/models` reported the loaded
`Qwen3.5-4B-Q4_K_M` alias; llama-server reported `n_ctx_slot = 8192`.
The actual schema-constrained `ask_question` returned
`Ano ang first name ng member?`. A conversational turn returned:
`Magandang araw! Para sa synthetic PhilHealth form demo, kailangan mong i-identify ang member details tulad ng first name, last name, date of birth, at address. Ano ang first name ng member para sa synthetic form?`
This verifies model loading and Taglish generation, not the full PDF workflow.

Dual-profile smoke verification used actual local servers: `lfm` reported
`LFM2.5-2.6B-Q4_K_M` and generated an English field question; `qwen`
reported `Qwen3.5-4B-Q4_K_M` and generated
`Ano ang first name ng member para sa synthetic form?`.
Both reported 8,192 context tokens. The 18 inference boundary tests passed
under each profile. These checks do not establish full PDF workflow acceptance.

Historical light-reasoning verification: Qwen exposed a nonempty
`reasoning_content` and correctly answered 17 times 23 as 391 in Taglish.
Qwen reasoning was subsequently disabled at the operator's request; Liquid
retains the supported `reasoning_budget_tokens: 256` API allowance.
LFM2.5-2.6B is not a dedicated thinking model; a budget does not guarantee a
separate reasoning trace. Both sequential government-flow tests failed on the
first DSWD mapping request with HTTP 503 before conversational turns or exports.
Liquid: 31.80s first API turn, 56.28 generated tokens/s. Qwen with reasoning:
54.38s first API turn, 31.14 generated tokens/s. Those tests stopped their servers.

Nonreasoning Qwen smoke passed with full GPU offload and 8K context:
reasoning budget 0, empty reasoning trace, `Ang total ay 391 (17 x 23).`,
and `Ano ang first name ng member para sa synthetic form?`.
All 18 inference boundary tests passed under each profile.

## Start the API with rootless OCR

```sh
export PATH="$PWD/.runtime/tesseract/usr/bin:$PWD/.venv/bin:$PATH"
export LD_LIBRARY_PATH="$PWD/.runtime/tesseract/usr/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export TESSDATA_PREFIX="$PWD/.runtime/tesseract/usr/share/tessdata"
export PAPELLESS_LLAMA_URL=http://127.0.0.1:8081
export PAPELLESS_MODEL_PROFILE=qwen # use lfm for the Liquid server
.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

## Integration checks (run after implementation)

The following must use the actual local model, not a mock or reference map.
The tool runner takes seven allowlisted names only; each handler registration is
`(callable, Pydantic output type)`. Scope contains `document_ids` and
`workspace_ids`. Tool outputs are typed before being delimited as untrusted data.

```sh
.venv/bin/python - <<'PY'
from pathlib import Path
from backend.pdf_service import inspect_document as inspect_pdf
from backend.inference import StrictModel, health, run_tools
class Inspection(StrictModel):
    document_id: str
    document_kind: str
    page_count: int
calls = []
def inspect_document(document_id):
    calls.append(document_id)
    path = Path("skills/government-form-assistant/assets/forms/philhealth-pmrf-012020.pdf")
    structure = inspect_pdf(path, document_id)
    return Inspection(**{name: structure[name] for name in Inspection.model_fields})
print(health())
result = run_tools(
    [{"role": "user", "content": "Inspect document doc-demo with inspect_document, then report its page count. Do not guess without calling the tool."}],
    {"inspect_document": (inspect_document, Inspection)},
    {"document_ids": {"doc-demo"}, "workspace_ids": set()},
)
assert set(calls) == {"doc-demo"}, calls
print("Actual LFM typed tool call completed:", result["content"])
PY
```

`parse_tool_calls` supports both OpenAI function-call objects and the native LFM
`<|tool_call_start|>[inspect_document(document_id='doc-demo')]<|tool_call_end|>`
format using restricted AST literal parsing, never code execution. Unknown tools,
extra arguments, cross-workspace IDs and invalid typed outputs are errors.
There are at most three executed tool rounds and one argument/parsing retry.

Also run `python -m unittest tests.test_inference` and exercise `map_form`,
`ask_question` and `extract_facts` against extracted fixture structures. Direct
operations use schema-constrained JSON with `target_id` restricted to actual source
IDs. The backend derives widget/box identity, geometry, options, and AcroForm required flags from the inspected source, not model-generated coordinates or requirements. PDF validation remains
the final export gate. All page/provenance numbers are zero-based. Public candidate
ranks use highest numeric rank as best. Layout regions overlapping widgets are
excluded from proposals. Record actual-model latency and memory measurements after
these checks; no model inference/performance check was performed during provisioning.

Question responses are validated as bounded strings, not by punctuation.
The one-question-per-turn instruction remains in the prompt; a question followed
by a formatting instruction is accepted rather than failing inference.

The full manual journey currently fails at cross-document comparison:
`extract_facts` produces ungrounded values and the API rejects them with
`inference_unavailable`. This is separate from the verified form conversation;
conflict handling and restart checks in that journey have not completed.

## Real-form conversation test

```sh
.venv/bin/python -m scripts.check_conversation
```

This opt-in integration test starts the actual CUDA model and API on temporary
localhost ports, then stops both. It needs the provisioned runtime, virtualenv
and an available NVIDIA GPU; it does not use mocks or reference maps.
It reads `skills/government-form-assistant/assets/forms/defaults.json` and uploads
each official DSWD and SSS default. PhilHealth is no longer an active flow.
It checks an agency explanation, asks applicant questions, supplies synthetic names/contact information, and skips
other answers. It verifies supplied values in each draft, unchanged sources and
protected regions on every page, PNG preview, and DRAFT filename. API workspaces are temporary; verified PDFs and previews are retained in `.runtime/benchmarks/{MODEL}-government-flow-drafts/`.

The test prints conversation turns, API turn latency and generation throughput
from llama.cpp counters (output tokens divided by generation seconds, excluding
prompt processing). It reports throughput even when the workflow fails.

Historical CF-1 measurements and mapping failures predate the government pivot;
CF-1 is now a technical parser fixture, not a default workflow.

Government pivot verification: agency/form-alias search, API contracts, PDF and
inference boundary tests passed after migrating the old corpus assertion.
Actual PDF extraction and separate draft writing/rendering were exercised for
DSWD, SSS, and PhilHealth with synthetic values and unchanged source hashes.
DSWD interleaved bilingual OCR now locks the administrative header and staff
section using actual printed boundary evidence.

Historical pre-cutover CUDA attempt: Qwen exited before API/form turns while an
existing LFM CUDA server occupied the GPU. That server was left untouched.
CPU inference is not permitted and provides no CUDA acceptance evidence.

## Source-slot identity verification

Mapping `id`, stored answers, direct edit keys, pending/answered state and
`missing_fields` now use extracted document-local source-slot IDs. Semantic names
and display labels remain metadata and may repeat. Conflicts are grouped by
semantic meaning, but clarification and resolution are scoped to document/slot;
one answer cannot populate or resolve another slot. Geometry, protected-region,
option, overflow, source-hash and verified-write gates remain in force.

The 31 regression tests passed, including independent duplicate-name widget and
overlay values, skipped-slot blanks, direct edits and per-slot/document conflicts.
PhilHealth was removed from the active demo manifest; its historical PDFs remain
technical-only fixtures. The synthetic harness selects answers using semantic
names/display labels but checks each extracted slot's type before supplying text.
Its outer API timeout is 600 seconds for multi-batch mapping; inference request
timeouts remain 240 seconds.

Liquid followed by Qwen completed both active CUDA government flows sequentially,
with 8,192 context tokens and 99 GPU layers. Liquid used the configured 32-token
reasoning allowance; Qwen reasoning was disabled (budget 0).
DSWD and SSS passed sourced explanations, synthetic values in exported PDFs,
unchanged source hashes and protected-region pixels, PNG previews and DRAFT names.

| Model | DSWD first turn (s) | SSS first turn (s) | Total run (s) | Generated tokens/s |
|---|---:|---:|---:|---:|
| Liquid LFM2.5-2.6B Q4_K_M | 34.33 | 150.27 | 204.32 | 56.20 |
| Qwen3.5-4B Q4_K_M | 83.27 | 379.50 | 536.61 | 31.09 |

First turns include full-document mapping and the first question. Throughput
excludes prompt processing. Full synthetic transcripts and counters are in
`.runtime/benchmarks/{MODEL}-government-flow.json`.

The initial successful runs cleaned up their temporary exports before PDF
retention was requested. Their viewable PDF/preview copies were regenerated from
the recorded source-slot IDs and synthetic answers without rerunning inference.
The production PDF writer verified the values; source hashes and protected-region
pixels were checked unchanged. These copies are replays, not the deleted original
temporary artifacts. Future runs retain the actual verified exports and previews.

### DSWD live-demo mapping cache

The first successful mapping of either bundled DSWD AICS PDF or `backend/demo_forms/dswd-pantawid-data-request.pdf` writes
`$PAPELLESS_DATA/dswd-mapping-<sha256>.json` (default: `workspaces/`).
Byte-identical uploads reuse that mapping across filenames, workspaces, and API
restarts. Changed PDF bytes use normal inference. Cache hits are revalidated
against the uploaded document's extracted slots, geometry, and protections;
invalid cached mappings are regenerated. Only mappings are cached, never answers.
Delete the cache file to force a fresh mapping after model or prompt changes.
This is caching for live demo purposes; the first upload still needs mapping inference. Each new question also uses local inference; the mapping cache does not cache question text or enable model prompt caching.



## Non-AI verification

```sh
.venv/bin/python -m unittest tests.test_api tests.test_pdf_service
.venv/bin/python -m unittest tests.test_explanations
.venv/bin/python -m tests.test_form_explanations
```

These exercise actual PDF writing/rendering, persistent artifact lookup, conflict
blanking, protected values, API errors, and local government-service citations.
Explanation checks script inference completions through the real tool loop without
network access; these are behavioral tests, not actual-model acceptance evidence.
The API check forbids all inference network requests. The manual model journey lives in
`scripts/check_backend.py`, outside automatic test discovery; run
`.venv/bin/python -m scripts.check_backend` only after explicit authorization.

Installation verification: both downloaded archives matched their official SHA-256
digests. Static loader checks found no missing dependencies for `llama-server` or
`libggml-cuda.so`; CUDA/cuBLAS and the installed NVIDIA driver library resolve.
GPU model loading and synthetic form completion were exercised during the
authorized inference fix. Real CF-1 mapping throughput is recorded above;
no disconnected acceptance run was performed.

## Cached short live-demo form

`backend/demo_forms/dswd-pantawid-data-request.pdf` is an unchanged, one-page official [DSWD Pantawid Data Request Form](https://pantawid.dswd.gov.ph/wp-content/uploads/2020/07/PMED-Data-Request-Form.pdf), cached locally on 2026-10-10. The live demo does not need the government website to be reachable. Provenance and the SHA-256 are recorded in `skills/government-form-assistant/assets/forms/SOURCES.md`.

In the frontend, create a workspace and use **Upload PDF** to select this cached file. For a short synthetic demo, answer a few name/contact/request questions, choose **Finish partial**, review the preview and remaining blanks, confirm the draft, and download its separate PDF. This is a data-request form, not an AICS benefit application; existing DSWD/SSS defaults remain unchanged. Never enter real personal information or sign/submit the form.

The backend's actual PDF inspection accepted the cached file as `fixed_layout`: one page, native text (no OCR), 25 extracted layout slots, and a protected signature region. No tests or model calls were run for this cache; mapping and end-to-end completion have not been verified.

