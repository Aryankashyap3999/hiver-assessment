# Decision Log

Non-obvious decisions made across this project, and why — not a changelog of what was built (see `git log` / PR history for that).

---

**1. Why AmazonHelp?**
It had the largest number of reconstructed multi-turn conversations among the brands present in the raw dataset. This is a data-volume decision, not a claim about AmazonHelp's support quality or resolution rate — that was never measured and shouldn't be inferred from the brand choice.

**2. Why reconstruct conversations instead of using raw tweet rows?**
Intent classification needs "what did the customer say," and response generation needs "what did the brand actually reply with" — both require ordered, multi-turn context, which raw unordered tweet rows don't provide. Reconstruction via `in_response_to_tweet_id` chains is a prerequisite for almost every later phase, not optional cleanup.

**3. Why 10 intents (including OTHER/UNCLEAR)?**
Derived empirically from recurring themes actually observed in the AmazonHelp sample, not adopted from a generic support taxonomy. Small enough to stay interview-explainable and to avoid fragmenting genuinely overlapping categories (e.g., a single combined "Delivery & Tracking" rather than separate late/lost/damaged-in-transit buckets).

**4. Why OTHER/UNCLEAR as an explicit category, rather than forcing every message into a specific bucket?**
Forcing ambiguous or acknowledgement-only messages ("thanks!", a bare link, an emoji) into a specific intent would corrupt precision/recall for the real categories and overstate what a single message can convey. It's 27% of the golden set — large enough that pretending it doesn't exist would be dishonest, not large enough to ignore in the metrics (see README §14).

**5. Why 200 golden examples specifically?**
Large enough for per-intent F1 to carry *some* signal despite class imbalance, small enough to hand-review with AI assistance in a take-home timeframe. Not chosen to hit a formal statistical power target — and the log says so rather than implying more rigor than exists.

**6. Why deterministic sampling (Fisher-Yates, seed 42) instead of true randomness?**
Reproducibility: the same 200 cases are drawn every time the sampling script is re-run, so results stay comparable across sessions and PRs instead of silently drifting.

**7. Why conversation-level leakage prevention instead of case-level?**
A golden case is one turn inside a longer conversation. Excluding only that turn would leave sibling turns from the same conversation in the development/retrieval corpus — which could still leak near-duplicate content and effectively hand the answer to the golden case through the back door. Excluding the whole conversation closes that gap; verified with a direct zero-overlap check, not assumed.

**8. Why a trivial majority baseline?**
It establishes the honest floor. Without it, a classifier scoring e.g. 60% could look impressive when 27% of that comes for free from the largest class alone.

**9. Why a rule-based baseline in addition to the majority one?**
So the LLM is measured against something better than a strawman — a simple, zero-ML, keyword-matching approach a reviewer could build in an afternoon. If the LLM only marginally beat this, that would be a much less interesting result than what was actually found.

**10. Why a provider-agnostic LLM adapter instead of calling the OpenAI SDK directly?**
This was requested up front, and it paid for itself immediately: OpenAI's account ran out of credits mid-project, and switching the entire system to Gemini touched exactly one directory (`src/llm/`) — zero changes to intent classification, retrieval, response generation, or escalation logic.

**11. Why Gemini specifically, once a switch was needed?**
Free tier usable immediately without a paid account, and its `responseJsonSchema` support was sufficient for the structured-output contract already established by the adapter interface.

**12. Why lightweight TF-IDF retrieval instead of embeddings or a vector database?**
Scope: this is a take-home, not a production system. TF-IDF cosine similarity needed zero new dependencies, is fully explainable in an interview, and — verified by manual inspection, not assumed — retrieved clearly relevant historical examples. A vector database would have added infrastructure the assignment doesn't need to prove the concept.

**13. Why does escalation always fire on Account & Security / Payment & Charges, regardless of confidence?**
Confidence measures how sure the model is, not how bad it is to be wrong. These two categories are the ones where a wrong automated reply has a real consequence beyond an annoyed customer — a security exposure or an unauthorized financial promise — so they're escalated unconditionally rather than left to a confidence threshold that wasn't designed to capture "cost of being wrong."

**14. Why build an LLM-as-judge at all, given its documented limitations (README §12, `FAILURE_ANALYSIS.md` mode #5)?**
It was explicitly requested, and a limited judge is still useful *as long as its limitations are measured and reported* rather than its score being treated as ground truth — which is exactly what the agreement-check in `scripts/evaluate-judge.js` and the corresponding README/failure-analysis sections do. Building it and then documenting where it falls short was judged more valuable than not building it, or building it and overstating what it shows.
