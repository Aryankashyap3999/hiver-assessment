import fs from "fs";
import { createLLMAdapter } from "./llm/index.js";

const TAXONOMY_PATH = "processed/intent-taxonomy.json";
const SCHEMA_NAME = "intent_classification";

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

let cachedTaxonomy = null;

function getTaxonomy() {
    if (!cachedTaxonomy) {
        cachedTaxonomy = loadTaxonomy();
    }

    return cachedTaxonomy;
}

let cachedAdapter = null;

function getAdapter() {
    if (!cachedAdapter) {
        cachedAdapter = createLLMAdapter();
    }

    return cachedAdapter;
}

export async function classifyIntent(currentMessage) {
    const taxonomy = getTaxonomy();
    const systemPrompt = buildSystemPrompt(taxonomy);
    const schema = buildIntentSchema(taxonomy);
    const validIntents = new Set(taxonomy.intents.map((intent) => intent.name));

    const llm = getAdapter();

    const result = await llm.generateStructured({
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: currentMessage }
        ],
        schema,
        schemaName: SCHEMA_NAME
    });

    if (!validIntents.has(result.intent)) {
        throw new Error(`LLM returned an intent outside the approved taxonomy: "${result.intent}"`);
    }

    return result.intent;
}
