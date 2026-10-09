"""Scripted local-model behavior through the real scoped explanation tool loop."""
from contextlib import contextmanager
import json
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit

from backend import inference
from backend.explanations import LABEL, explain, search_corpus


def lookup(query, name="lookup_government_service"):
    return {"tool_calls": [{"function": {
        "name": name, "arguments": json.dumps({"query": query})}}]}


def answer(source_ids=(), status="completed", message="A sourced explanation in plain English."):
    return {"content": json.dumps({"status": status, "assistant_message": message,
                                   "source_ids": list(source_ids)})}


@contextmanager
def scripted(responses):
    completions = []
    for response in responses:
        if not response.get("tool_calls"):
            completions.append({"content": "Ready to summarize the retrieved evidence."})
        completions.append(response)
    with patch.object(inference, "_tokens", return_value=10), patch.object(
            inference, "_request", side_effect=AssertionError("Network inference forbidden")), patch.object(
            inference, "_complete", side_effect=completions) as complete:
        yield complete


class ExplanationTests(unittest.TestCase):
    def test_search_is_literal_case_insensitive_and_scoped(self):
        for query in ("aIcS", "crisis assistance", "poor, vulnerable", "aics.dswd.gov.ph",
                      "protective services division"):
            records = search_corpus(query)
            self.assertTrue(records, query)
            self.assertEqual(records, search_corpus(query.upper()))
            for record in records:
                self.assertIsInstance(record["source_id"], str)
                self.assertTrue({"term", "aliases", "feed", "url", "definition"} <= record.keys())
                self.assertIn(query.casefold(), json.dumps(record, ensure_ascii=False).casefold())
        for query in (".*", "[AICS", "../../etc/passwd", "$(cat /etc/passwd)", "quantum healing"):
            self.assertEqual(search_corpus(query), [], query)
        self.assertEqual(search_corpus("AICS")[0]["source_id"], search_corpus("crisis assistance")[0]["source_id"])

    def test_search_evidence_reaches_model_and_selected_sources_become_citations(self):
        for query, agency, domain in (("DSWD", "DSWD", "dswd.gov.ph"),
                                     ("SSS", "SSS", "sss.gov.ph"),
                                     ("PMRF", "PhilHealth", "philhealth.gov.ph")):
            record = search_corpus(query)[0]
            simplified = f"Synthetic model summary for {agency}."
            with scripted([lookup(query), answer([record["source_id"]], message=simplified)]) as complete:
                result = explain(f"Please simplify the meaning of {query} for me")
                history = complete.call_args.args[0]
                evidence = next(item["content"] for item in history if item["role"] == "tool")
                self.assertIn(record["definition"], evidence)
                self.assertIn(record["source_id"], evidence)
                tools = next(call.kwargs["tools"] for call in complete.call_args_list if call.kwargs.get("tools"))
                self.assertEqual([tool["function"]["name"] for tool in tools], ["lookup_government_service"])
            self.assertEqual(result["status"], "completed")
            self.assertIn(simplified, result["assistant_message"])
            self.assertEqual(result["assistant_message"].count(LABEL), 1)
            self.assertEqual(result["citations"], [{key: record[key] for key in ("term", "feed", "url")}])
            host = urlsplit(result["citations"][0]["url"]).hostname
            self.assertTrue(host == domain or host.endswith("." + domain))
            self.assertNotIn("source_ids", result)

    def test_invalid_or_unretrieved_sources_cannot_complete(self):
        retrieved = search_corpus("AICS")[0]["source_id"]
        unsearched = search_corpus("PMRF")[0]["source_id"]
        for ids, status in ((["invented"], "completed"), ([unsearched], "completed"),
                            ([], "completed"), ([retrieved, retrieved], "completed"),
                            ([retrieved], "abstained"), ([retrieved], "invalid")):
            invalid = answer(ids, status)
            with self.subTest(ids=ids, status=status), scripted([lookup("AICS"), invalid, invalid]):
                with self.assertRaises(inference.InferenceError):
                    explain("Explain AICS")
        with scripted([answer([retrieved]), answer([retrieved])]):
            with self.assertRaises(inference.InferenceError):
                explain("Explain AICS")

    def test_one_retry_is_shared_between_tool_and_final_validation(self):
        source = search_corpus("AICS")[0]["source_id"]
        with scripted([lookup("AICS"), answer(["invented"]), answer([source])]):
            self.assertEqual(explain("Explain AICS")["status"], "completed")
        with scripted([lookup("AICS", "exec_shell"), lookup("AICS"), answer(["invented"])]):
            with self.assertRaises(inference.InferenceError):
                explain("Explain AICS")

    def test_three_search_round_limit(self):
        with scripted([lookup("AICS")] * 4):
            with self.assertRaises(inference.InferenceError):
                explain("Explain AICS")

    def test_empty_search_abstains_and_unavailable_inference_has_no_canned_success(self):
        with scripted([lookup("quantum healing"), answer(status="abstained")]):
            result = explain("Explain quantum healing")
        self.assertEqual(result["status"], "abstained")
        self.assertEqual(result["citations"], [])
        with patch.object(inference, "_tokens", return_value=10), patch.object(
                inference, "_complete", side_effect=inference.InferenceError("Local inference is unavailable")):
            with self.assertRaises(inference.InferenceError):
                explain("Explain SSS")


if __name__ == "__main__":
    unittest.main()
