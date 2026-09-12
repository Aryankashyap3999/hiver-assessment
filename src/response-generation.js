import { createLLMAdapter } from "./llm/index.js";

const SCHEMA_NAME = "support_response";

const RESPONSE_SCHEMA = {
    type: "object",
    properties: {
        reply: { type: "string" },
        evidence: {
            type: "array",
            items: { type: "integer" }
        },
        confidence: { type: "number" }
    },
    required: ["reply", "evidence", "confidence"],
    additionalProperties: false
};

function buildSystemPrompt() {
    return [
        "You are drafting a customer support reply for AmazonHelp.",
        "Ground your reply in the numbered historical examples below, which show how AmazonHelp actually responded to similar past situations.",
        "Do not invent policies, refund amounts, timelines, or promises that the historical examples or the customer's message do not support.",
        "Be concise and write directly to the customer, as a support agent would.",
        "Never mention internal details such as intent classification, retrieval, similarity scores, or that you are an AI system.",
        "The historical examples end with agent sign-off initials (like \"^AB\") — these identify a specific past agent and must never be copied into your reply.",
        "If none of the historical examples are actually relevant, write a generic, safe reply that acknowledges the issue and asks for any details needed to help, and reflect that with a low confidence score.",
        "",
        "Return JSON with:",
        "- reply: the customer-facing response text",
        "- evidence: the numbers of the historical examples (if any) that informed the reply, e.g. [1, 3]",
        "- confidence: a number between 0 and 1 for how well the reply is supported by the historical evidence"
    ].join("\n");
}

function formatContext(context) {
    if (!context.length) {
        return "(no prior conversation)";
    }

    return context
        .map((turn) => `${turn.role}: ${turn.text}`)
        .join("\n");
}

function formatExamples(retrievedExamples) {
    if (!retrievedExamples.length) {
        return "(no relevant historical examples found)";
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

function buildUserMessage({ currentMessage, context, predictedIntent, retrievedExamples }) {
    return [
        `Predicted intent: ${predictedIntent}`,
        "",
        "Conversation so far:",
        formatContext(context),
        "",
        `Customer's current message: ${currentMessage}`,
        "",
        "Historical examples:",
        formatExamples(retrievedExamples)
    ].join("\n");
}

export async function generateResponse({ currentMessage, context = [], predictedIntent, retrievedExamples = [] }) {
    const llm = createLLMAdapter();

    return llm.generateStructured({
        messages: [
            { role: "system", content: buildSystemPrompt() },
            {
                role: "user",
                content: buildUserMessage({ currentMessage, context, predictedIntent, retrievedExamples })
            }
        ],
        schema: RESPONSE_SCHEMA,
        schemaName: SCHEMA_NAME
    });
}
