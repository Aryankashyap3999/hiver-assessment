import fs from "fs";
import readline from "readline";

const GOLDEN_SET_PATH = "processed/golden-set.jsonl";
const OUTPUT_PATH = "processed/rule-baseline-results.json";

const rules = [
    {
        intent: "Delivery & Tracking",
        keywords: [
            "delivery",
            "delivered",
            "shipment",
            "shipping",
            "tracking",
            "track my",
            "where is my package",
            "where is my order",
            "not arrived",
            "hasn't arrived",
            "didn't arrive",
            "late",
            "delayed",
            "delivery date",
            "courier",
            "package"
        ]
    },
    {
        intent: "Returns & Refunds",
        keywords: [
            "refund",
            "refunded",
            "return",
            "returning",
            "exchange",
            "money back",
            "send it back",
            "return policy"
        ]
    },
    {
        intent: "Payment & Charges",
        keywords: [
            "charged",
            "charge",
            "payment",
            "billing",
            "bill",
            "credit card",
            "debit card",
            "transaction",
            "double charged",
            "charged twice",
            "payment failed"
        ]
    },
    {
        intent: "Account & Security",
        keywords: [
            "account",
            "password",
            "login",
            "log in",
            "sign in",
            "locked out",
            "security",
            "verification",
            "verify",
            "close my account"
        ]
    },
    {
        intent: "Prime & Subscription",
        keywords: [
            "prime",
            "membership",
            "subscription",
            "renewal",
            "renew",
            "cancel prime",
            "prime membership"
        ]
    },
    {
        intent: "Product & Digital Services",
        keywords: [
            "kindle",
            "fire tv",
            "firetv",
            "alexa",
            "echo",
            "prime video",
            "amazon music",
            "app",
            "device",
            "digital"
        ]
    },
    {
        intent: "Seller & Marketplace",
        keywords: [
            "seller",
            "third party",
            "third-party",
            "marketplace",
            "merchant"
        ]
    },
    {
        intent: "Item Problem",
        keywords: [
            "damaged",
            "defective",
            "broken",
            "wrong item",
            "missing item",
            "incomplete",
            "faulty",
            "doesn't work",
            "not working"
        ]
    },
    {
        intent: "Order Issue",
        keywords: [
            "order",
            "ordered",
            "cancel my order",
            "cancel order",
            "order number",
            "order issue"
        ]
    }
];

async function loadGoldenSet() {
    const cases = [];

    const fileStream = fs.createReadStream(GOLDEN_SET_PATH);

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

function classify(text) {
    const normalizedText = text.toLowerCase();

    for (const rule of rules) {
        for (const keyword of rule.keywords) {
            if (normalizedText.includes(keyword)) {
                return rule.intent;
            }
        }
    }

    return "OTHER / UNCLEAR";
}

async function runBaseline() {
    console.log("Loading golden evaluation set...");

    const goldenCases = await loadGoldenSet();

    const predictions = goldenCases.map((caseData) => ({
        caseId: caseData.caseId,
        predictedIntent: classify(caseData.currentMessage)
    }));

    const results = {
        baseline: "keyword-rules",
        evaluationCases: predictions.length,
        predictions
    };

    fs.writeFileSync(
        OUTPUT_PATH,
        JSON.stringify(results, null, 2)
    );

    console.log("\nRule baseline:");
    console.log(`Evaluation cases: ${predictions.length}`);
    console.log(`Output: ${OUTPUT_PATH}`);
}

runBaseline().catch((error) => {
    console.error("Failed to run rule baseline:", error);
    process.exit(1);
});