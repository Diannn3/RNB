"""English definition lookup in the bundled, developer-owned MedlinePlus feeds."""

from difflib import SequenceMatcher
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
import re
import xml.etree.ElementTree as ET


LABEL = "Demo — not clinically reviewed"
SKILL = Path(__file__).resolve().parent.parent / "skills" / "medical-explainer"
FEEDS = {
    "fitnessdefinitions.xml": "Fitness",
    "generalhealthdefinitions.xml": "General Health",
    "mineralsdefinitions.xml": "Minerals",
    "nutritiondefinitions.xml": "Nutrition",
    "vitaminsdefinitions.xml": "Vitamins",
}


class _PlainText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)

    def handle_starttag(self, tag, attrs):
        if tag in {"p", "br", "li", "div"}:
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in {"p", "li", "div"}:
            self.parts.append(" ")


def _plain(value):
    parser = _PlainText()
    parser.feed(value.lstrip(">"))
    return " ".join(unescape("".join(parser.parts)).split())


def _normalize(value):
    return " ".join(re.findall(r"[a-z0-9]+", value.lower()))


def _reply(message, status, citations=None):
    return {"assistant_message": f"{message}\n\n{LABEL}",
            "status": status, "citations": citations or []}


def explain(query: str) -> dict:
    """Return a sourced definition, one clarification, or an explicit abstention."""
    if LABEL not in (SKILL / "SKILL.md").read_text(encoding="utf-8"):
        raise RuntimeError("Medical explanation skill lacks the required demo label")
    unsupported = "The local English definitions corpus does not support that request. Please ask for an English health term definition; this demo cannot provide diagnosis, treatment, or personalized advice."
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
    if re.search(r"\b(my|me|i|mine|your|you|patient|should|treat|treatment|diagnose|diagnosis|recommend|symptoms|translate|spanish|french|german|chinese)\b", request):
        return _reply(unsupported, "abstained")
    request = request.strip("\"' “”")
    if not re.fullmatch(r"[a-z0-9\s()/,'\"-]+", request):
        return _reply(unsupported, "abstained")
    wanted = _normalize(request)
    if not wanted:
        return _reply(unsupported, "abstained")
    candidates = []
    best = 0
    for filename, feed in FEEDS.items():
        page_url = None
        for event, node in ET.iterparse(SKILL / "references" / filename, events=("start", "end")):
            if event == "start" and node.tag == "definition-page":
                page_url = node.attrib["page-url"]
            if event != "end" or node.tag != "term-group":
                continue
            term = _plain(node.findtext("term", ""))
            normalized = _normalize(term)
            score = 3 if wanted == normalized else 0
            if not score and f" {wanted} " in f" {normalized} ":
                score = 2
            if (not score and len(wanted) >= 5
                    and len(wanted.split()) == len(normalized.split())
                    and SequenceMatcher(None, wanted, normalized).ratio() >= 0.84):
                score = 1
            if score and score >= best:
                if score > best:
                    candidates.clear()
                    best = score
                candidates.append({"term": term, "feed": feed,
                                   "url": node.attrib.get("reference-url") or page_url,
                                   "definition": _plain(node.findtext("definition", ""))})
            node.clear()
    if not candidates:
        return _reply(unsupported, "abstained")
    terms = sorted({entry["term"] for entry in candidates})
    if len(terms) > 1:
        return _reply(f"Which term do you mean: {', '.join(terms)}?", "needs_input")
    entry = candidates[0]
    if not entry["definition"]:
        return _reply(unsupported, "abstained")
    citations = [{key: candidate[key] for key in ("term", "feed", "url")}
                 for candidate in candidates if candidate["definition"] == entry["definition"]]
    source = f"Source: MedlinePlus, Definitions of Health Terms — {entry['feed']} (term: {entry['term']}), {entry['url']}."
    return _reply(f"{entry['term']}: {entry['definition']}\n\n{source}", "completed", citations)
