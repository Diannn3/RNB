"""Behavioral checks for the bundled Philippine government service lookup."""

from urllib.parse import urlsplit

from backend.explanations import explain


def test_explanations():
    for query, agency, domain in (
        ("What is DSWD?", "DSWD", "dswd.gov.ph"),
        ("Explain SSS", "SSS", "sss.gov.ph"),
        ("What is PhilHealth?", "PhilHealth", "philhealth.gov.ph"),
        ("AICS", "DSWD", "dswd.gov.ph"),
        ("E-1", "SSS", "sss.gov.ph"),
        ("PMRF", "PhilHealth", "philhealth.gov.ph"),
    ):
        result = explain(query)
        assert result["status"] == "completed", (query, result)
        citation = result["citations"][0]
        assert citation["feed"] == agency
        host = urlsplit(citation["url"]).hostname
        assert host == domain or host.endswith("." + domain)
    for query in ("quantum healing", "Am I eligible for AICS?", "Approve my SSS benefit",
                  "Define protein", "PMRF 中文", "", "x" * 301):
        result = explain(query)
        assert result["status"] == "abstained", (query, result)
        assert result["citations"] == []


if __name__ == "__main__":
    test_explanations()
    print("Government service lookup: all three agencies, form aliases, and unsupported requests verified.")
