# CLAUDE.md

## Project

This repository is the Hiver SDE Intern take-home assignment.

The goal is to build and evaluate an AI customer-support agent for one brand from the Customer Support on Twitter dataset.

The agent should:

1. classify customer messages into defined intents
2. retrieve historical support examples
3. draft a grounded response
4. decide auto-handle vs human escalation
5. prove performance through evaluation

The most important requirement is not the chatbot itself.

**Evaluation quality and methodological honesty are more important than adding features.**

---

## Development philosophy

### Keep it simple

This is a take-home assignment, not a production platform.

Prefer the smallest implementation that satisfies the requirement.

Do NOT introduce unnecessary:

- frameworks
- abstractions
- classes
- factories
- dependency injection
- service layers
- repositories
- queues
- workers
- Redis
- databases
- event buses
- vector databases
- orchestration frameworks
- retry frameworks
- configuration systems
- dependencies

If a simple function solves the problem, use a function.

Every piece of code should be explainable in an interview.

### Avoid overengineering

Before creating an abstraction, ask:

> Does the assignment actually require this abstraction?

If not, don't add it.

Do not rewrite working code simply to make it look more "architectural."

---

## Code style

Current project uses JavaScript/Node.js.

Prefer:

- simple functions
- clear variable names
- direct control flow
- existing dependencies
- deterministic behavior
- small files where practical

Avoid:

- clever code
- unnecessary patterns
- excessive comments
- unnecessary validation layers
- speculative future-proofing

---

## Current brand

Selected brand:

**AmazonHelp**

Reason:

AmazonHelp provides the largest number of reconstructed conversations among the candidate brands we compared and the largest pool of multi-turn conversations.

Do NOT claim that we proved AmazonHelp has the highest resolution rate.

---

## Dataset

Dataset:

Customer Support on Twitter

Kaggle:
thoughtvector/customer-support-on-twitter

The raw dataset must never be committed.

The current development corpus contains 10,000 AmazonHelp conversations.

This is a development subset and should NOT be described as representative of the entire dataset.

---

## Intent taxonomy

Current taxonomy:

1. Delivery & Tracking
2. Order Issue
3. Item Problem
4. Returns & Refunds
5. Payment & Charges
6. Account & Security
7. Prime & Subscription
8. Product & Digital Services
9. Seller & Marketplace
10. OTHER / UNCLEAR

Taxonomy source:

`processed/intent-taxonomy.json`

Classification should be based on the customer's primary problem rather than isolated keywords.

`OTHER / UNCLEAR` is intentional.

Do not force ambiguous messages into specific intents.

---

## Golden evaluation set

Golden set:

`processed/golden-set.jsonl`

Labels:

`processed/golden-set-labeling.csv`

Metadata:

`processed/golden-set-metadata.json`

Size:

200 cases

The cases come from 194 unique conversations.

The golden set is held out.

### Golden-set rules

Do NOT repeatedly tune the system against golden labels.

Do NOT cherry-pick examples.

Do NOT change labels to improve metrics.

Do NOT claim human-only labeling.

The labels were manually reviewed with AI assistance.

---

## Leakage prevention

Golden conversations are removed entirely from the development/evaluation corpus.

Current split:

10,000 AmazonHelp conversations

- 194 golden conversations
- 9,806 non-golden conversations

File:

`processed/evaluation-corpus.jsonl`

Do not introduce leakage.

---

## Baselines

### Baseline 1

Majority/trivial baseline:

Always predicts:

`OTHER / UNCLEAR`

Current:

- Accuracy: 27.00%
- Macro F1: 4.25%

### Baseline 2

Rule-based keyword classifier.

Current:

- Accuracy: 52.50%
- Macro F1: 37.53%

Final LLM performance must be compared against both.

---

## LLM architecture

Current architecture:

```text
Application
    ↓
LLM Adapter
    ↓
OpenAIAdapter / GeminiAdapter