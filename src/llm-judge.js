import { createLLMAdapter } from "./llm/index.js";

const SCHEMA_NAME = "response_quality_judgment";

const JUDGE_SCHEMA = {
    type: "object",
    properties: {
        correctness: { type: "integer" },
        relevance: { type: "integer" },
        helpfulness: { type: "integer" },
        grounding: { type: "integer" },
        avoidsUnsupportedClaims: { type: "integer" },
        rationale: { type: "string" }
    },
    required: ["correctness", "relevance", "helpfulness", "grounding", "avoidsUnsupportedClaims", "rationale"],
    additionalProperties: false
};

function buildSystemPrompt() {
    return [
        "You are an independent quality reviewer for a customer support reply. You did not write the reply and have no stake in it.",
        "Score the reply on 5 dimensions, each an integer from 1 (poor) to 5 (excellent):",
        "- correctness: does the reply correctly address the customer's actual stated problem, without misreading it or responding to a different issue",
        "- relevance: does the reply respond directly to what the customer said, rather than being generic or off-topic",
        "- helpfulness: does the reply move the customer's issue forward with a clear next step or useful information, not just a vague acknowledgement",
        "- grounding: is the reply consistent with the provided historical examples, using them as evidence rather than contradicting or ignoring them",
        "- avoidsUnsupportedClaims: does the reply avoid inventing specific policies, refund amounts, timelines, or promises not supported by the historical examples or the customer's message (5 = no unsupported claims, 1 = several)",
        "",
        "Be a strict, honest reviewer. Do not default to high scores.",
        "Also give a one-sentence rationale explaining the scores."
    ].join("\n");
}

function formatExamples(retrievedExamples) {
    if (!retrievedExamples.length) {
        return "(no historical examples were retrieved)";
    }

    return retrievedExamples
        .map((example, index) =>
            [
                `Example ${index + 1}:`,
                `  Customer: ${example.historicalMessage}`,
                `  AmazonHelp: ${example.historicalResponse.text}`
            ].join("\n")
        )
        .join("\n\n");
}

function buildUserMessage({ currentMessage, predictedIntent, retrievedExamples, response }) {
    return [
        `Customer's message: ${currentMessage}`,
        `Classified intent: ${predictedIntent}`,
        "",
        "Historical examples provided to the response generator:",
        formatExamples(retrievedExamples),
        "",
        `Generated reply: ${response.reply}`,
        `Reply cited example numbers: ${JSON.stringify(response.evidence)}`,
        `Reply's own stated confidence: ${response.confidence}`
    ].join("\n");
}

export async function judgeResponse({ currentMessage, predictedIntent, retrievedExamples, response }) {
    const llm = createLLMAdapter();

    return llm.generateStructured({
        messages: [
            { role: "system", content: buildSystemPrompt() },
            {
                role: "user",
                content: buildUserMessage({ currentMessage, predictedIntent, retrievedExamples, response })
            }
        ],
        schema: JUDGE_SCHEMA,
        schemaName: SCHEMA_NAME
    });
}
