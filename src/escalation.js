const SENSITIVE_INTENTS = ["Account & Security", "Payment & Charges"];
const CONFIDENCE_THRESHOLD = 0.5;

export function decideEscalation({ predictedIntent, retrievedExamples = [], response }) {
    if (predictedIntent === "OTHER / UNCLEAR") {
        return {
            autoHandle: false,
            reason: "Intent could not be confidently classified into a specific category."
        };
    }

    if (SENSITIVE_INTENTS.includes(predictedIntent)) {
        return {
            autoHandle: false,
            reason: `"${predictedIntent}" is a sensitive category that always requires human review.`
        };
    }

    if (retrievedExamples.length === 0) {
        return {
            autoHandle: false,
            reason: "No relevant historical evidence was found to ground a response."
        };
    }

    if (response.evidence.length === 0) {
        return {
            autoHandle: false,
            reason: "The drafted response is not grounded in any retrieved historical evidence."
        };
    }

    if (response.confidence < CONFIDENCE_THRESHOLD) {
        return {
            autoHandle: false,
            reason: `Response confidence (${response.confidence}) is below the auto-handle threshold (${CONFIDENCE_THRESHOLD}).`
        };
    }

    return {
        autoHandle: true,
        reason: "Intent is specific, the response is grounded in relevant historical evidence, and confidence is sufficient."
    };
}
