# AmazonHelp Support Agent — Take-Home Assignment

An AI customer-support agent for one brand (AmazonHelp) from the Kaggle "Customer Support on Twitter" dataset: classify intent, retrieve historically similar support conversations, draft a grounded reply, decide auto-handle vs. escalate — and, more importantly, prove whether any of it actually works.

**Priority order for this project: correctness > evaluation quality > simplicity > architectural complexity.** Nothing here is production infrastructure; it's a take-home, and every non-trivial choice below is one I can defend in an interview.

---

## 1. Problem

Build and evaluate a system that, given an incoming customer support message:
1. Classifies it into a small, brand-specific intent taxonomy.
2. Retrieves historically similar cases showing how the brand actually responded.
3. Drafts a reply grounded in that history.
4. Decides whether to auto-handle the reply or escalate to a human, with a stated reason.
5. Is evaluated honestly enough that the numbers can be trusted.

The chatbot is the easy part. The evaluation is the point.

---

## 2. Dataset

**Kaggle "Customer Support on Twitter"** (`thoughtvector/customer-support-on-twitter`). Raw tweets, one row per tweet, linked by reply-to IDs. The raw CSV is never committed to this repo (see `.gitignore`) and must be downloaded separately to rebuild anything upstream of the golden set.

Full raw dataset observed at processing time:
- 2,811,774 tweets indexed
- 1,774,822 reply relationships indexed
- 82,556 AmazonHelp conversation roots (all brands are mixed in the raw file; this project only ever looks at AmazonHelp)

This project's **development corpus is the first 10,000 of those 82,556 AmazonHelp conversation roots**, taken in file order — not a random sample of the full 82,556. It should not be described as representative of the full AmazonHelp conversation population; it's a development subset chosen for tractable local processing.

---

## 3. Why AmazonHelp

Among the brands present in the raw dataset, AmazonHelp had the largest number of reconstructed multi-turn conversations. That's the only claim being made. **This project does not establish that AmazonHelp has the best resolution rate, best support quality, or any other performance property** — brand selection was about data volume for building a usable corpus, nothing else.

---

## 4. Conversation reconstruction

Raw tweets are unordered rows, not conversations. `scripts/process-conversations.js` follows `in_response_to_tweet_id` chains to reconstruct ordered, multi-turn conversations (customer/support turns with timestamps), then filters to ones involving `@AmazonHelp`. Output: `processed/amazonhelp-conversations.jsonl` (not committed — regenerable from raw data).

Reconstruction is necessary because intent classification, retrieval, and response generation all depend on knowing what was actually *said back and forth*, not just isolated tweets.

---

## 5. Intent taxonomy

Ten intents, derived from recurring themes actually observed in the AmazonHelp sample (not an off-the-shelf taxonomy):

| Intent | What it covers |
|---|---|
| Delivery & Tracking | Shipment status, tracking, delays, missing/marked-delivered-but-not-received |
| Order Issue | Problems with the order itself, not primarily delivery/payment/returns/item condition |
| Item Problem | Damaged, defective, missing, wrong, or incomplete physical items |
| Returns & Refunds | Return, exchange, or refund requests |
| Payment & Charges | Billing, unexpected/duplicate charges, payment methods |
| Account & Security | Account access, passwords, login, closure, verification |
| Prime & Subscription | Prime membership, subscriptions, renewal/cancellation |
| Product & Digital Services | Amazon devices, apps, Prime Video, Fire TV, Alexa, Kindle |
| Seller & Marketplace | Third-party seller/marketplace-specific issues |
| OTHER / UNCLEAR | Not enough information, or doesn't clearly fit elsewhere |

Full definitions: `processed/intent-taxonomy.json` (committed). Classification is meant to be based on the customer's **primary problem**, not keyword matching — the system prompt (`src/intent-classification.js`) states this explicitly, and `OTHER / UNCLEAR` exists intentionally so ambiguous messages aren't forced into a specific bucket.

---

## 6. Sampling (the golden set)

- Source: 24,264 intent cases extracted from the 10,000-conversation development corpus (`processed/amazonhelp-intent-cases.jsonl`, not committed) — each case is a customer message with a direct support reply and its prior context.
- Sample: 200 cases, **deterministic uniform random sample, seed 42** (Fisher-Yates shuffle), so the same 200 cases are drawn every time the sampling script runs.
- The 200 cases come from **194 unique conversations** (some conversations contributed more than one case).
- Labels (`processed/golden-set-labeling.csv`) were manually reviewed **with AI assistance** — not human-only labeling, and that's stated plainly here rather than implied otherwise.

Final label distribution (200 cases):

| Intent | Count |
|---|---|
| Delivery & Tracking | 58 |
| OTHER / UNCLEAR | 54 |
| Product & Digital Services | 28 |
| Payment & Charges | 14 |
| Item Problem | 12 |
| Returns & Refunds | 9 |
| Account & Security | 9 |
| Prime & Subscription | 7 |
| Order Issue | 6 |
| Seller & Marketplace | 3 |

**This distribution is heavily imbalanced.** `OTHER / UNCLEAR` alone is 27% of the set, and the three smallest classes (Order Issue, Seller & Marketplace, Account & Security-adjacent) have single-digit support — their per-intent F1 numbers are based on a handful of examples each and should be read as noisy, not precise.

---

## 7. Leakage prevention

Golden-set cases are held out — but a case is one turn in a longer conversation, and other turns from the *same conversation* could still leak into a development/retrieval corpus and effectively hand the answer to the golden case via near-duplicate content. So leakage prevention is done at the **conversation level**: `scripts/create-evaluation-corpus.js` removes all 194 golden conversations entirely from the 10,000-conversation development corpus, producing `processed/evaluation-corpus.jsonl` (9,806 conversations). Retrieval (`src/retrieval.js`) is built exclusively from this leakage-safe corpus.

Verified directly, not assumed: zero conversation-ID overlap between `golden-set.jsonl` and `evaluation-corpus.jsonl`.

---

## 8. System architecture

```
Application
    ↓
createLLMAdapter()  (src/llm/index.js)
    ↓
OpenAIAdapter  or  GeminiAdapter   (provider-specific, same generateStructured() interface)
    ↓
OpenAI / Gemini API
```

```
Customer message
    ↓
classifyIntent()          src/intent-classification.js   — LLM, taxonomy-constrained structured output
    ↓
retrieveSimilarCases()    src/retrieval.js                — TF-IDF cosine similarity, local, no LLM call
    ↓
generateResponse()        src/response-generation.js      — LLM, grounded in retrieved examples
    ↓
decideEscalation()        src/escalation.js               — plain rule-based policy, no LLM call
    ↓
{ predictedIntent, retrievedExamples, response, escalation }
```

`node scripts/run-agent.js "<message>"` runs the full chain for a single message. Every stage is also independently runnable and testable (`run-retrieval.js`, `run-response-generation.js`, `run-escalation.js`).

The LLM adapter exists specifically so the rest of the app never imports an SDK directly — this paid off mid-project when OpenAI's account ran out of credits and the switch to Gemini touched only `src/llm/`, nothing downstream.

Retrieval is deliberately lexical (TF-IDF cosine similarity, plain JS, zero new dependencies) rather than embeddings or a vector database — a lighter approach that's fully explainable and was sufficient to retrieve clearly relevant historical examples on manual inspection.

Escalation is a plain ordered rule list, not a scoring model: `OTHER/UNCLEAR` → escalate; `Account & Security` / `Payment & Charges` → always escalate regardless of confidence (these are the two categories where a wrong auto-reply has real consequence — security exposure or a financial promise — not just an annoyed customer); no retrieved evidence → escalate; response cites no evidence → escalate; response confidence below 0.5 → escalate; otherwise auto-handle.

**v1 scope decision, stated explicitly:** both intent classification and response generation use only the customer's *current* message — prior conversation turns are not passed in. This was a deliberate simplicity choice for the first version, its cost is measured (not guessed) in `FAILURE_ANALYSIS.md` mode #3, and it's a well-scoped, low-risk v2 change.

---

## 9. Baselines

| Baseline | Method | Accuracy | Macro F1 |
|---|---|---|---|
| Majority | Always predicts `OTHER / UNCLEAR` | 27.00% | 4.25% |
| Rule-based | Deterministic taxonomy-derived keyword rules | 52.50% | 37.53% |

The majority baseline exists to establish the floor — without it, a mediocre accuracy number could look artificially impressive given `OTHER/UNCLEAR`'s 27% share. The rule baseline exists so the LLM is measured against something better than a strawman: a simple, zero-ML approach that a reviewer could build in an afternoon.

---

## 10. Evaluation metrics

- **Intent classification**: accuracy, macro F1, per-intent precision/recall/F1, confusion matrix (`scripts/evaluate-intent-classifier.js`).
- **System-level** (`scripts/evaluate-system.js`): evidence-grounding rate, response-quality automated proxies (agent-signature leakage, reply length), escalation behavior, and — the one that matters most — whether escalation actually catches classifier mistakes.
- **Response quality** (`scripts/evaluate-judge.js`): LLM-as-judge on 5 dimensions, and whether judge scores track the one piece of human-reviewed ground truth available (the golden intent labels).

All of the above run against the same 200-case golden set, evaluated once (not iteratively tuned against).

---

## 11. Final results (200-case golden set)

| Classifier | Accuracy | Macro F1 |
|---|---|---|
| Majority | 27.00% | 4.25% |
| Rule-based | 52.50% | 37.53% |
| **LLM (Gemini, full-pipeline run)** | **80.50%** | **72.38%** |

The LLM clearly beats both baselines. A separate, standalone LLM-only classification run earlier in development produced 80.00%/72.06% — cited here as a reproducibility check, not a second result: two independent runs of the same model landed within half a point of each other.

System-level (full pipeline, same 200 cases):
- 96.0% of cases retrieved at least one historical example; 81.0% of generated responses actually cited evidence.
- Mean response confidence: 0.813.
- **50.5% auto-handled**, 49.5% escalated.
- 1/200 replies leaked a historical agent's sign-off initials despite an explicit prompt instruction not to — a real ~0.5% residual failure rate, not zero.

---

## 12. LLM-as-judge

Each generated reply scored 1-5 on correctness, relevance, helpfulness, grounding, and avoidance of unsupported claims (`src/llm-judge.js`), by a judge that never sees the gold label.

| Dimension | Mean (1-5) |
|---|---|
| correctness | 4.92 |
| relevance | 4.95 |
| helpfulness | 4.75 |
| grounding | 4.86 |
| avoidsUnsupportedClaims | 5.00 |

**This is not equivalent to human evaluation**, and this project doesn't have separate human ratings of response quality to compare against — only human-reviewed intent labels. Checking judge scores against *that* ground truth reveals the judge's real limitation: scores for known-misclassified cases (mean correctness 4.90) are statistically indistinguishable from known-correct cases (4.92). See §13 and §14.

---

## 13. Failure analysis

Full detail with real case IDs in **[`FAILURE_ANALYSIS.md`](FAILURE_ANALYSIS.md)**. Summary of the five modes, derived from the actual results above, not assumed in advance:

1. **Multilingual retrieval breaks down for CJK text** — whitespace tokenization can't do partial matching on Japanese. 42.9% zero-retrieval rate on the 14 CJK-script golden cases vs. 1.1% on Latin-script cases.
2. **"Order Issue" and "Delivery & Tracking" overlap at the taxonomy boundary** — 4 concrete cases, all one direction, all dispatch-delay language.
3. **Excluding conversation context (the v1 decision in §8) misclassifies short, referential follow-ups** — two clean examples where the current message alone is genuinely uninterpretable.
4. **Escalation's safety net misses ~49% of misclassifications** (19 of 39) — and the judge scores 17 of those 19 a perfect 5/5/5/5/5.
5. **The LLM-judge has very limited discriminative range** — can't statistically separate known-correct from known-wrong cases.

Two commonly-suggested categories ("misleading historical examples," generic "insufficient retrieval evidence") were investigated and explicitly excluded — the data didn't support them as distinct, well-evidenced modes once mode #1 and judge-leniency were accounted for.

---

## 14. What is misleading about my headline number?

The 80.50% accuracy / 72.38% macro F1 headline is real, but reading it as "the agent is right 80% of the time" overstates what's been shown:

- **Macro F1 is dragged around by tiny classes.** Order Issue (support 6) and Seller & Marketplace (support 3) each have single-digit sample sizes; one or two more/fewer correct predictions swings their F1 by double digits. The macro average treats a class with 3 examples the same as one with 58.
- **A large share of "correct" is the easy class.** `OTHER/UNCLEAR` is 27% of the golden set and the majority baseline gets 100% recall on it for free. The LLM's real work is on the other 73%, and its accuracy there is lower than the headline number.
- **Auto-handle rate (50.5%) is not "50.5% correct."** Escalation and correctness are only loosely coupled (§13, mode #4) — a meaningful fraction of what's auto-handled is actually a misclassified case that happened to get a plausible-sounding reply, and a meaningful fraction of what's escalated was actually classified correctly.
- **The judge's near-ceiling scores are not independent confirmation of quality** — they're partly a property of the judge (§12), not solely a property of the responses.
- **This is a 200-case, single-run evaluation on a 10,000-conversation, non-representative development subset of one brand's Twitter support traffic in one time period.** It is not a claim about performance on the full 82,556-conversation AmazonHelp population, on other brands, or in production.

---

## 15. What I'd do next with one more week

1. **Fix CJK tokenization in retrieval** (§13 mode #1) — highest-confidence, most bounded fix available; character n-grams for CJK scripts instead of whitespace splitting.
2. **Give the classifier a real confidence signal** (top-2 candidate margin, not just a single label) and route it into escalation, instead of leaning on response-generation's confidence as a downstream proxy for an upstream decision (§13 mode #4).
3. **Add the last 1-2 context turns to classification and generation**, scoped and measured against the golden set before/after, to address §13 mode #3 without silently expanding prompt cost for every case.
4. **Anchor the LLM-judge with calibration examples** (few-shot, spanning the score range) or switch to comparative/ranking judgments, to address the ceiling effect in §12/§13 mode #5.
5. **Re-run the full evaluation on a second, independently-drawn 200-case sample** to see how much of the current numbers are sample-specific noise vs. stable signal — this project only ever draws one golden set.
6. **Rebalance or stratify the golden set** for the smallest classes (Order Issue, Seller & Marketplace) so their F1 numbers stop being dominated by single-digit sample sizes.

---

## 16. Limitations

- Development corpus is 10,000 AmazonHelp conversations; the full raw dataset contains 82,556 AmazonHelp conversation roots (and many more conversations from other brands never used here). The 10,000 is the first N in file order, not a representative sample.
- Golden set is 200 cases from 194 conversations — a single draw, not cross-validated.
- Golden labels were reviewed with AI assistance, not human-only.
- Intent classification and response generation deliberately ignore conversation context in this version (§8, §13 mode #3).
- Retrieval is lexical (TF-IDF), not semantic — it will miss paraphrases with no shared vocabulary, and it's demonstrably weak on CJK text (§13 mode #1).
- Escalation is a fixed rule list calibrated once by inspection, not tuned against outcome data.
- The LLM-judge is not a substitute for human review and has a measured, reported ceiling effect (§12).
- All LLM-based numbers come from a single run per stage; API non-determinism means a re-run will differ slightly (two independent classification runs landed within 0.5 points of each other, which is reassuring but not a formal variance estimate).
- Free-tier API quotas (both per-minute and, more restrictively, per-day) constrained how much re-running and exploration was practical during development.

---

## 17. Reproduction commands

### Setup

```
npm install
```

Create `.env` (gitignored):

```
LLM_PROVIDER=gemini
LLM_MODEL=gemini-3.1-flash-lite
GEMINI_API_KEY=your_key_here
```

### Fast path — reproduce the headline intent-classification result (no raw dataset needed)

The golden set, its labels, and the taxonomy are committed to this repo. Baselines are instant (no API calls). The LLM classifier needs only an API key — it does not need the raw dataset or any regenerated corpus.

```
node scripts/run-majority-baseline.js
node scripts/run-rule-baseline.js
node scripts/run-llm-intent-classifier.js          # ~15-20 min: Gemini's free-tier
                                                    # rate limit paces this to ~1
                                                    # request per 5 seconds, not compute

node scripts/evaluate-intent-classifier.js processed/majority-baseline-results.json
node scripts/evaluate-intent-classifier.js processed/rule-baseline-results.json
node scripts/evaluate-intent-classifier.js processed/llm-intent-results.json
```

This reproduces §11's headline table. The ~15-20 minutes is almost entirely automated rate-limit waiting, not manual effort — start it and check back.

### Full path — retrieval, response generation, escalation, judge (needs the raw dataset)

`processed/evaluation-corpus.jsonl` (used by retrieval) is derived from the raw Kaggle CSV, which is not committed. To reproduce §11's full-pipeline numbers, §12, and §13 from scratch, you first need to download `thoughtvector/customer-support-on-twitter` from Kaggle and rebuild the corpus:

```
node scripts/process-conversations.js          # raw CSV -> processed/amazonhelp-conversations.jsonl
node scripts/prepare-intent-data.js            # -> processed/amazonhelp-intent-cases.jsonl
node scripts/create-evaluation-corpus.js       # -> processed/evaluation-corpus.jsonl (leakage-safe)
```

(`processed/golden-set.jsonl` itself is already committed and does not need to be regenerated — it was produced once, deterministically, by `scripts/create-golden-set.js` with seed 42.)

Then, with the corpus rebuilt:

```
node scripts/run-system-evaluation.js          # ~30-35 min: 2 LLM calls/case x 200 cases
node scripts/evaluate-system.js

node scripts/run-judge-evaluation.js           # ~15-20 min: 1 LLM call/case x 200 cases
node scripts/evaluate-judge.js
```

Both scripts persist results incrementally (`processed/*.json`, gitignored) — if a run is interrupted (e.g. by an API quota limit), completed cases are not lost, but a re-run currently starts over from case 1 rather than resuming from where it stopped.

### One-off, single-message pipeline

```
node scripts/run-agent.js "Where is my order? It hasn't shipped yet."
```
