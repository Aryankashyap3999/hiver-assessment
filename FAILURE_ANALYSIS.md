# Failure Analysis

Top 5 failure modes, derived from the actual 200-case golden-set run (Phases 2, 7, 8), not assumed in advance. Two categories often suggested for this kind of system — "misleading historical examples" and generic "insufficient retrieval evidence" — were investigated and are *not* included below because the data didn't support them as distinct, well-evidenced modes (see the note at the end).

All examples are real `caseId`s from `processed/golden-set.jsonl`, `processed/system-evaluation-results.json`, and `processed/judge-results.json`. Reproduce with:

```
node scripts/run-system-evaluation.js
node scripts/evaluate-system.js
node scripts/run-judge-evaluation.js
node scripts/evaluate-judge.js
```

---

## 1. Multilingual retrieval breaks down for CJK text

**Failure example:** `golden-064` — customer message (Japanese): "偽アマゾンから迷惑メールきた〜。#迷惑メール [link]" ("Got a phishing email pretending to be Amazon"). Gold intent: `Account & Security`.

**Expected result:** Retrieval finds related historical phishing/security complaints; classifier picks `Account & Security`.

**Actual result:** Retrieval found **zero** historical matches. Classifier defaulted to `OTHER / UNCLEAR`. Escalation correctly caught it (`autoHandle: false`), and the generated reply was actually a reasonable, on-topic phishing warning even without evidence — so no visible harm here, but the classification and grounding both failed underneath a lucky save.

**Why it failed:** The retrieval tokenizer (`src/retrieval.js`) splits text on whitespace. Japanese doesn't delimit words with spaces, so an entire Japanese sentence becomes a single "token." TF-IDF matching then only fires when two messages share a long, nearly-identical substring — it can't do partial/sub-word matching the way it does for English.

**Confirmed, not just hypothesized:** across the 14 CJK-script cases in the golden set, retrieval returned zero matches for 6 of them (**42.9%**), versus 2 of 186 Latin-script cases (**1.1%**) — a ~40x gap. When CJK retrieval *does* return a match, its mean top score is 0.93 (near-duplicate-only), versus 0.41 for Latin-script matches — consistent with an all-or-nothing matching pattern rather than graded relevance.

**Possible improvement:** Tokenize CJK text with character n-grams (e.g., bigrams) instead of whitespace splitting, or use a proper CJK segmenter. This is a targeted, bounded fix to `tokenize()` in `src/retrieval.js` — not a retrieval-architecture change.

---

## 2. "Order Issue" and "Delivery & Tracking" overlap at the taxonomy boundary

**Failure example:** `golden-130` — "I had ordered this for last Diwali. It's been a year and you're still 'Preparing for dispatch.'" Gold intent: `Order Issue`. Predicted: `Delivery & Tracking`.

**Expected result:** Matches the human label, `Order Issue`.

**Actual result:** `Delivery & Tracking`. The same pattern recurs at `golden-080`, `golden-098`, `golden-196` — all four are gold-labeled `Order Issue`, all four predicted `Delivery & Tracking`, all four are messages about a stuck/delayed dispatch status.

**Why it failed:** The taxonomy draws the line as: `Delivery & Tracking` = "shipment status, tracking, delays"; `Order Issue` = "problems with the order itself that are not primarily about delivery." A message like "still preparing for dispatch after a year" genuinely reads as a shipment-status complaint by its literal wording, which is exactly the `Delivery & Tracking` primary question ("what went wrong with delivery?") — but the human labeler treated a *dispatch that never starts* as an order-fulfillment problem, not a delivery-tracking one. This is a real ambiguity in the taxonomy's boundary condition, not a model comprehension failure — the model is reading the message correctly, it's applying a different (also defensible) categorization rule than the label.

**Hypothesis:** The taxonomy's two `primaryQuestion` prompts ("what went wrong with delivery" vs. "what's wrong with the order itself") aren't mutually exclusive for pre-dispatch delays specifically, and the system prompt doesn't give the model a tiebreaker for this exact case.

**Possible improvement:** Add one clarifying line to the taxonomy definition or system prompt: pre-dispatch/fulfillment delays (order never leaves the warehouse) are `Order Issue`; post-dispatch/in-transit delays are `Delivery & Tracking`. This is a prompt-only fix, no retraining or architecture change.

---

## 3. Deliberately excluding conversation context misclassifies short follow-ups

**Failure example:** `golden-038`. Full context: customer complains a product's listed price (₹1000+) doesn't match its real price (~₹50); support says they'll forward it internally; customer replies "Thanks!!!". The actual case's `currentMessage`: "It's still there, I hope someday you correct it." Gold intent: `Product & Digital Services`.

**Expected result:** With context, "it" clearly refers to the earlier-reported pricing error.

**Actual result:** Classifier saw only "It's still there, I hope someday you correct it" (per the deliberate v1 design decision to classify on `currentMessage` alone) and predicted `OTHER / UNCLEAR` — a reasonable call given zero information about what "it" is, but wrong relative to the label. A second case, `golden-013`, shows the same pattern from a different angle: after six prior turns about a warranty-mismatched laptop, the current message is pure frustration ("Are you guys kidding me?? I have been following up continuously...") with no restated topic — again correctly unclassifiable in isolation, gold-labeled `Item Problem`.

**Why it failed:** Not a bug — this is the direct, expected consequence of the documented v1 scope decision (`scripts/run-llm-intent-classifier.js` and `src/intent-classification.js` only ever see `currentMessage`, never `context`). Short, referential follow-ups ("it", "still", "already reported") are common in real multi-turn support threads and are inherently under-specified without the preceding turns.

**Hypothesis:** This affects a meaningful minority of cases — of the 39 misclassified golden cases, 22 had 2 or more prior context turns, though not all 22 are context-caused (some are boundary confusions like #2 above, independent of context).

**Possible improvement:** This is the clearest, most direct lever available: pass the last 1-2 context turns into the classifier prompt for messages under some length/specificity threshold. It's a scoped, well-motivated v2 change, not a rewrite — deliberately deferred rather than built speculatively for v1.

---

## 4. The escalation safety net misses about half of misclassifications

**Failure example:** `golden-080` — gold `Order Issue`, predicted `Delivery & Tracking` (same boundary confusion as mode #2). Response generation produced a fluent, evidence-grounded reply about delivery status. Escalation rule "intent is specific + response is grounded + confidence sufficient" fired, so `autoHandle: true` — the system handed off an answer to a misclassified case with no human review.

**Expected result:** A wrong intent classification should, ideally, get caught somewhere downstream before a customer sees an auto-handled reply.

**Actual result:** Of 39 misclassified golden cases, escalation caught 20 (51%) but let **19 (49%) through as auto-handled**. Worse: the LLM-judge (Phase 8) scored these 19 cases a mean of 4.95/4.95/4.89/5.00/5.00 across its five dimensions — 17 of the 19 got a perfect 5/5/5/5/5. The judge cannot tell these apart from correctly-classified cases at all.

**Why it failed:** Escalation's rules (Account & Security / Payment & Charges always escalate, low confidence, no grounding, `OTHER/UNCLEAR`) don't include any signal correlated with intent-classification *correctness* — because no such signal exists in the pipeline. The classifier doesn't expose its own uncertainty (no logprobs, no confidence score, just a taxonomy-constrained label), so escalation has nothing to key off except response-generation's self-reported confidence, which is about reply quality, not label correctness. And since the misclassifications are mostly near-boundary confusions (mode #2), the *generated reply* is often still perfectly reasonable — so response confidence stays high even when the label is wrong.

**Hypothesis:** Escalation and the LLM-judge are both blind to the same failure category for the same underlying reason: neither has access to (or a proxy for) ground truth, and a wrong-but-plausible label produces a wrong-but-plausible-looking response.

**Possible improvement:** Have the classifier itself return a confidence signal (e.g., ask it to flag ambiguity between its top two candidate intents) and feed *that* into escalation, rather than relying entirely on response-generation's confidence as a downstream proxy for a decision made upstream.

---

## 5. The LLM-judge has very limited discriminative range

**Failure example:** Not a single case — a property of the judge across all 200. Score distribution: `correctness` 189/200 at 5, min 3; `avoidsUnsupportedClaims` 199/200 at 5. Mean scores for known-misclassified cases (4.90 correctness) are statistically indistinguishable from known-correct cases (4.92).

**Expected result:** If the judge is a useful quality signal, scores should be visibly lower for cases we independently know are worse (the 19 cases in mode #4, at minimum).

**Actual result:** They aren't (see mode #4's numbers).

**Why it failed:** There's no separate human rating of response quality to calibrate against — the "agreement" check in `scripts/evaluate-judge.js` compares judge scores against the one ground truth that does exist (human-reviewed golden intent labels), and finds no meaningful gap. Two plausible, non-exclusive explanations: (a) LLM-as-judge leniency bias, a documented phenomenon where a model grading another model's output clusters near the top of the scale; (b) the judge is actually behaving reasonably, because it's scoring the *reply text* in isolation and never sees the gold label, so a fluent, sensibly-grounded reply to a boundary-confused intent legitimately looks fine on the dimensions being asked about (correctness/relevance/helpfulness/grounding/unsupported-claims) — none of which are "was the taxonomy label right."

**Hypothesis:** Both effects are likely present; the data can't cleanly separate them with a single judge call and no calibration examples.

**Possible improvement:** Give the judge 1-2 calibration examples spanning the score range (few-shot anchoring), or have it output a comparative/ranking judgment across cases rather than an absolute 1-5 per case in isolation — both are known mitigations for LLM-judge ceiling effects.

---

## Investigated but not included

- **"Misleading historical examples"**: checked whether responses that cited low-similarity evidence (top score < 0.3, n=36) scored worse than those citing strong evidence (n=126). Judge means were nearly identical (e.g., correctness 4.89 vs. 4.93) — no clear signal, likely confounded by mode #5's ceiling effect rather than a real absence of the problem. Not included as a top-5 mode because the evidence doesn't currently distinguish it from noise.
- **Generic "insufficient retrieval evidence"**: the 8 golden cases with zero retrieved examples are almost entirely explained by mode #1 (6 of 8 are CJK-script); it's not an independent pattern once mode #1 is accounted for.
