# Repository guidance

## Git hygiene

- Commit every notable change as a focused, independently understandable commit.
- Keep each commit to at most 150 changed lines, counting additions plus deletions across all files.
- Split larger work into coherent commits; never split an expression or leave a knowingly broken intermediate state.
- Stage explicit paths or hunks, not the entire working tree.
- Preserve unrelated user changes. Never reset, discard, or amend them without permission.
- Verify the behavior affected by a change before committing it; record relevant verification in the commit message.
- Use concise commit subjects that describe the change and its purpose.
- Do not commit generated build output, temporary screenshots, smoke scripts, credentials, or local runtime artifacts.
