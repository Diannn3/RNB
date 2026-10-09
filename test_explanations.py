"""Single deterministic check against the checked-in MedlinePlus corpus."""

from explanations import LABEL, explain


def test_explanations():
    covered = explain("What are amino acids?")
    assert covered["status"] == "completed"
    assert "building blocks of proteins" in covered["assistant_message"]
    assert covered["citations"] == [{
        "term": "Amino Acids", "feed": "Nutrition",
        "url": "https://medlineplus.gov/xml/nutritiondefinitions.xml",
    }]
    results = [covered]
    for query in ("quantum healing", "What should I take for my blood pressure?",
                  "Define protein in Spanish", "protein 中文", "cure blood pressure"):
        result = explain(query)
        assert result["status"] == "abstained"
        assert result["citations"] == []
        results.append(result)
    ambiguous = explain("heart rate")
    assert ambiguous["status"] == "completed"
    ambiguous = explain("blood")
    assert ambiguous["status"] == "needs_input"
    assert ambiguous["assistant_message"].count("?") == 1
    assert ambiguous["citations"] == []
    results.append(ambiguous)
    assert explain("protien")["status"] == "completed"
    for result in results:
        assert result["assistant_message"].count(LABEL) == 1
