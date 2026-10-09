"""Start the loopback API with an explicit local model profile."""
import argparse
import os

import uvicorn


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model", choices=("lfm", "qwen"),
        default=os.environ.get("PAPELLESS_MODEL_PROFILE", "lfm"),
        help="local inference profile (default: PAPELLESS_MODEL_PROFILE or lfm)",
    )
    options = parser.parse_args()
    if options.model not in ("lfm", "qwen"):
        parser.error("PAPELLESS_MODEL_PROFILE must be lfm or qwen")
    os.environ["PAPELLESS_MODEL_PROFILE"] = options.model
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000)
