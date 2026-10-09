"""Sourced English lookup in the bundled Philippine government service corpus."""

from difflib import SequenceMatcher
import json
from pathlib import Path
import re


LABEL = "Demo — not official government advice"
SKILL = Path(__file__).resolve().parent.parent / "skills" / "government-service-explainer"


def _normalize(value):
    return " ".join(re.findall(r"[a-z0-9]+", value.lower()))


def _reply(message, status, citations=None):
    return {"assistant_message": f"{message}\n\n{LABEL}",
            "status": status, "citations": citations or []}


def explain(query: str) -> dict:
    """Return a sourced service explanation, clarification, or explicit abstention."""
    unsupported = ("The local demo corpus does not cover that request. Ask about DSWD AICS, "
                   "SSS membership or E-1, or PhilHealth membership or PMRF. "
                   "This demo cannot determine eligibility, approve benefits, or submit applications.")
    if not isinstance(query, str) or not query.strip() or len(query) > 300:
        return _reply(unsupported, "abstained")
    request = query.strip().lower().rstrip(".?!").strip()
    patterns = (
        r"(?:please )?(?:(?:can|could) you )?(?:define|explain) (.+)",
        r"(?:please )?(?:give me|provide) (?:a |the )?definition (?:of|for) (.+)",
        r"(?:what is|what are|what's) (?:a |an |the )?(.+)",
        r"what does (.+) mean",
        r"(?:the )?(?:definition|meaning) (?:of|for) (.+)",
    )
    for pattern in patterns:
        match = re.fullmatch(pattern, request)
        if match:
            request = match[1]
            break
    request = request.strip("\"' “”")
    if not re.fullmatch(r"[a-z0-9\s()/,'\"-]+", request):
        return _reply(unsupported, "abstained")
    wanted = _normalize(request)
    if not wanted:
        return _reply(unsupported, "abstained")
    candidates, best = [], 0
    for entry in json.loads((SKILL / "references" / "services.json").read_text(encoding="utf-8")):
        score = 0
        for term in (entry["term"], *entry["aliases"]):
            normalized = _normalize(term)
            current = 3 if wanted == normalized else 0
            if not current and f" {wanted} " in f" {normalized} ":
                current = 2
            if (not current and len(wanted) >= 5
                    and len(wanted.split()) == len(normalized.split())
                    and SequenceMatcher(None, wanted, normalized).ratio() >= 0.84):
                current = 1
            score = max(score, current)
        if score and score >= best:
            if score > best:
                candidates.clear()
                best = score
            candidates.append(entry)
    if not candidates:
        return _reply(unsupported, "abstained")
    if len(candidates) > 1:
        return _reply(f"Which service do you mean: {', '.join(sorted(entry['term'] for entry in candidates))}?",
                      "needs_input")
    entry = candidates[0]
    citation = {key: entry[key] for key in ("term", "feed", "url")}
    source = f"Source: {entry['feed']} (topic: {entry['term']}), {entry['url']}."
    return _reply(f"{entry['term']}: {entry['definition']}\n\n{source}", "completed", [citation])
