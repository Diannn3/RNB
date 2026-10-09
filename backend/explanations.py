"""Local search-and-simplify agent for the bundled government service corpus."""

import json
from pathlib import Path
import re
from typing import Literal

from pydantic import Field

from . import inference

LABEL = "Demo — not official government advice"
SKILL = Path(__file__).resolve().parent.parent / "skills" / "government-service-explainer"


class ServiceRecord(inference.StrictModel):
    source_id: str
    term: str
    aliases: list[str]
    feed: str
    url: str
    definition: str
    document_markers: list[str] | None = None


class Explanation(inference.StrictModel):
    status: Literal["completed", "needs_input", "abstained"]
    assistant_message: str = Field(min_length=1, max_length=4000)
    source_ids: list[str] = Field(max_length=20)


def search_corpus(query: str) -> list[dict]:
    """Literal case-insensitive search restricted to the bundled JSON records."""
    if not isinstance(query, str) or not query.strip() or len(query) > 200:
        return []
    needle = query.strip().casefold()
    entries = json.loads((SKILL / "references" / "services.json").read_text(encoding="utf-8"))
    return [{"source_id": str(index), **entry} for index, entry in enumerate(entries)
            if needle in json.dumps(entry, ensure_ascii=False).casefold()]


def _normalize(value):
    return " ".join(re.findall(r"[a-z0-9]+", value.lower()))


def _reply(message, status, citations=None):
    return {"assistant_message": f"{message}\n\n{LABEL}",
            "status": status, "citations": citations or []}


def explain(query: str, structure: dict | None = None) -> dict:
    """Let the local model search, then simplify only retrieved service evidence."""
    if not isinstance(query, str) or not query.strip() or len(query) > 300:
        return _reply("Ask a short question about a covered government service.", "abstained")
    form = bool(re.fullmatch(
        r"(?:please )?(?:(?:can|could) you )?explain (?:this|the) form[.?!]*",
        query.strip().lower()))
    if form and structure is None:
        return _reply("Select an uploaded PDF to explain its form.", "needs_input")
    document_text = " " + _normalize(" ".join(
        page.get("text", "") for page in structure.get("pages", []))) + " " if form else ""
    markers = []
    # Inspect every extracted page, never the filename, without sending a whole PDF to the model.
    if form:
        entries = json.loads((SKILL / "references" / "services.json").read_text(encoding="utf-8"))
        markers = sorted({marker for entry in entries for marker in entry.get("document_markers", [])
                          if f" {_normalize(marker)} " in document_text})
    retrieved, searched = {}, False

    def lookup(query):
        nonlocal searched
        searched = True
        records = search_corpus(query)
        retrieved.update((record["source_id"], record) for record in records)
        return records

    def validate(result):
        ids = result.source_ids
        if (not result.assistant_message.strip() or len(ids) != len(set(ids))
                or any(source_id not in retrieved for source_id in ids)):
            raise inference.InferenceError("Explanation cites unavailable evidence")
        if result.status == "completed":
            if not searched or not ids:
                raise inference.InferenceError("Explanation requires searched source evidence")
            if form and any(not retrieved[source_id].get("document_markers") or not all(
                    f" {_normalize(marker)} " in document_text
                    for marker in retrieved[source_id]["document_markers"]) for source_id in ids):
                raise inference.InferenceError("Form identity lacks complete extracted markers")
        elif ids:
            raise inference.InferenceError("Noncompleted explanations cannot cite sources")
        return result

    instruction = (
        "BACKEND_PLAN: Explain covered government services in concise English, regardless of "
        "the conversational language profile. Call lookup_government_service with your chosen "
        "short literal search queries before any completed answer. It searches only the bundled "
        "corpus, case-insensitively; refine searches if needed. Simplify the retrieved evidence "
        "for the user's question in your own words; do not just copy definitions. Use only "
        "retrieved source_ids, never invent citations or facts. Abstain for unsupported requests "
        "or insufficient evidence; ask one clarifying question for ambiguity. Do not determine "
        "eligibility, approve benefits, or submit applications. Noncompleted answers have empty "
        "source_ids. For a generic form request, identity requires ALL document_markers of the "
        "cited record in extracted_markers; partial markers are insufficient. Named service "
        "questions must answer that service, not an unrelated selected document."
    )
    data = {"query": query.strip()}
    if form:
        data["extracted_markers"] = markers
    result = inference.run_tools(
        [{"role": "system", "content": instruction},
         {"role": "user", "content": inference._data(data)}],
        {"lookup_government_service": (lookup, list[ServiceRecord])}, {},
        final_model=Explanation, validate_final=validate)
    citations = [{key: retrieved[source_id][key] for key in ("term", "feed", "url")}
                 for source_id in result.source_ids]
    return _reply(result.assistant_message, result.status, citations)
