# Conversational interview implementation

Approved October 9, 2026: Upload → graphite chat → bright verification → final Yes/No confirmation → explicit PDF/Word selection → download.

A 760px transcript and one composer replace separate interview and PDF question panels. Parsed field order controls the queue. Detected values require acceptance. Choices retain widget semantics. Ambiguous manual messages require Use as answer / Ask about PDF. Completion derives from revision-bound dispositions, independently of transcript text. Corrections reopen later fields conservatively.

Document dialogs preserve draft and focus. Near-bottom scrolling follows replies; older history offers Latest message. Enter sends, Shift+Enter inserts a line break, composition events suppress sending. Cancellation and retries retain messages; session epochs reject stale results.

Verification retains edited PDF preview and exact-source navigation. Continue blocks unsaved or incomplete answers, then asks Is all the information correct? No keeps editing; Yes creates a revision-bound snapshot. Direct export navigation cannot bypass it. Changes invalidate downloads. Word exports editable answers and sources, not a reconstruction of PDF layout.

The sample is fictional and deterministic. Real documents remain manual until a local adapter supplies typed intent results. Files stay in session memory. Project v3 downloads contain progress and hashes, not original PDFs. v1/v2 migration requires renewed confirmation.

References: Typebot, SPACE10 Conversational Form, assistant-ui, Vercel Chatbot, React Chatbot Kit, dolanmiu/docx and GOV.UK check-answers. The user's Cerebral Valley screenshot governs composition; its live application could not be retrieved during research. Brand assets are unchanged.
