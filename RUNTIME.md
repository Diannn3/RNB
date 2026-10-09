# Local runtime

**AI checks are paused by explicit user request. Do not start inference or run the
manual AI journey check until the GPU is available and the user authorizes it.**
The intended runtime is the official prebuilt NVIDIA CUDA package below, not a
source build. GPU/model execution remains unverified and paused; no inference server is running.

The provisioned binaries/models live in ignored `.runtime/`; no sudo is needed.
Run commands from the repository root. The API and inference are localhost-only.
Use synthetic data only. Do not enable llama-server prompt logging or built-in tools.

## Provisioned versions

- Official `LiquidAI/LFM2.5-2.6B-GGUF`, repository revision
  `e7caca5d835a3901a8e0d63e94009429bafafdfc`, `LFM2.5-2.6B-Q4_K_M.gguf`:
  `.runtime/models/LFM2.5-2.6B-Q4_K_M.gguf` (1,674,455,040 bytes).
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

```sh
export LD_LIBRARY_PATH="$PWD/.runtime/llama-cuda/cudart-llama-b11429-bin-ubuntu-cuda-12.8-x64:$PWD/.runtime/llama-cuda/llama-b11429${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
.runtime/llama-cuda/llama-b11429/llama-server \
  --model .runtime/models/LFM2.5-2.6B-Q4_K_M.gguf \
  --alias LFM2.5-2.6B-Q4_K_M --host 127.0.0.1 --port 8081 \
  --device CUDA0 --gpu-layers 99 \
  --ctx-size 8192 --parallel 1 --threads 4 --threads-batch 4 \
  --batch-size 256 --ubatch-size 128 --cache-ram 0 \
  --jinja --reasoning-budget 0 --no-webui --no-slots --offline --log-disable
```

There is one 8,192-token slot. Inference reserves output and counts the actual
rendered chat template using `/apply-template` and `/tokenize`, including tool
schemas. Mapping/fact extraction splits source-linked excerpts without skipping
pages. Model temperature is zero; output reserves are 3,072 tokens for mapping
and facts, 256 for a question, and 1,024 for each tool round. Connections time out
explicitly after 240 seconds; there is no remote fallback or proxy use.

## Start the API with rootless OCR

```sh
export PATH="$PWD/.runtime/tesseract/usr/bin:$PWD/.venv/bin:$PATH"
export LD_LIBRARY_PATH="$PWD/.runtime/tesseract/usr/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export TESSDATA_PREFIX="$PWD/.runtime/tesseract/usr/share/tessdata"
export PAPELLESS_LLAMA_URL=http://127.0.0.1:8081
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
    path = Path("skills/medical-form-assistant/assets/forms/philhealth-pmrf-012020.pdf")
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

## Non-AI verification

```sh
.venv/bin/python -m unittest tests.test_api tests.test_pdf_service
.venv/bin/python -m tests.test_explanations
```

These exercise actual PDF writing/rendering, persistent artifact lookup, conflict
blanking, protected values, API errors, and local XML citations. The API check
forbids all inference network requests. The manual model journey lives in
`scripts/check_backend.py`, outside automatic test discovery; run
`.venv/bin/python -m scripts.check_backend` only after explicit authorization.

Installation verification: both downloaded archives matched their official SHA-256
digests. Static loader checks found no missing dependencies for `llama-server` or
`libggml-cuda.so`; CUDA/cuBLAS and the installed NVIDIA driver library resolve.
No GPU executable, model loading, inference, or GPU performance test was run for
this prebuilt installation. GPU offload and disconnected end-to-end acceptance
remain unverified until explicitly authorized.

