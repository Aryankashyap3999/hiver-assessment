import fs from "fs";
import readline from "readline";
import { createLLMAdapter } from "../src/llm/index.js";

const GOLDEN_SET_PATH = "processed/golden-set.jsonl";
const TAXONOMY_PATH = "processed/intent-taxonomy.json";
const OUTPUT_PATH = "processed/llm-intent-results.json";
const SCHEMA_NAME = "intent_classification";

async function loadGoldenSet(inputPath) {
    const cases = [];

    const fileStream = fs.createReadStream(inputPath);

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        if (!line.trim()) continue;

        cases.push(JSON.parse(line));
    }

    return cases;
}

function loadTaxonomy() {
    const raw = fs.readFileSync(TAXONOMY_PATH, "utf-8");
    return JSON.parse(raw);
}

function buildSystemPrompt(taxonomy) {
    const intentDescriptions = taxonomy.intents
        .map((intent) => `- ${intent.name}: ${intent.description}`)
        .join("\n");

    return [
        "You are classifying a customer support message into exactly one intent.",
        "Use only the approved taxonomy below. Choose exactly one intent based on the customer's primary problem, not merely individual keywords in the message.",
        "Use \"OTHER / UNCLEAR\" when the message does not contain enough information or does not clearly belong to another category.",
        "",
        "Approved taxonomy:",
        intentDescriptions
    ].join("\n");
}

function buildIntentSchema(taxonomy) {
    return {
        type: "object",
        properties: {
            intent: {
                type: "string",
                enum: taxonomy.intents.map((intent) => intent.name)
            }
        },
        required: ["intent"],
        additionalProperties: false
    };
}

function saveResults(predictions) {
    const results = {
        classifier: "llm",
        evaluationCases: predictions.length,
        predictions
    };

    fs.writeFileSync(
        OUTPUT_PATH,
        JSON.stringify(results, null, 2)
    );
}

async function classifyCase(llm, systemPrompt, schema, caseData) {
    const result = await llm.generateStructured({
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: caseData.currentMessage }
        ],
        schema,
        schemaName: SCHEMA_NAME
    });

    return result.intent;
}

async function runClassifier() {
    const inputPath = process.argv[2] || GOLDEN_SET_PATH;

    console.log("Loading input cases...");
    const goldenCases = await loadGoldenSet(inputPath);

    console.log("Loading approved intent taxonomy...");
    const taxonomy = loadTaxonomy();

    const systemPrompt = buildSystemPrompt(taxonomy);
    const schema = buildIntentSchema(taxonomy);
    const validIntents = new Set(taxonomy.intents.map((intent) => intent.name));
    const llm = createLLMAdapter();

    const predictions = [];

    for (let i = 0; i < goldenCases.length; i++) {
        const caseData = goldenCases[i];

        console.log(`Classifying case ${i + 1}/${goldenCases.length}: ${caseData.caseId}`);

        const predictedIntent = await classifyCase(llm, systemPrompt, schema, caseData);

        if (!validIntents.has(predictedIntent)) {
            throw new Error(
                `LLM returned an intent outside the approved taxonomy: "${predictedIntent}" (case ${caseData.caseId})`
            );
        }

        predictions.push({
            caseId: caseData.caseId,
            predictedIntent
        });

        saveResults(predictions);
    }

    console.log("\nLLM classifier:");
    console.log(`Evaluation cases: ${predictions.length}`);
    console.log(`Output: ${OUTPUT_PATH}`);
}

runClassifier().catch((error) => {
    console.error("Failed to run LLM intent classifier:", error);
    process.exit(1);
});
