import fs from "fs";
import readline from "readline";

const filePath = "processed/amazonhelp-intent-cases.jsonl";

const categories = {
    "Delivery & Tracking": [
        "delivery",
        "delivered",
        "package",
        "tracking",
        "shipping",
        "arrive",
        "courier"
    ],

    "Order Issue": [
        "order",
        "ordered",
        "preorder",
        "pre-order",
        "cancel"
    ],

    "Returns & Refunds": [
        "refund",
        "return",
        "returned",
        "exchange"
    ],

    "Payment & Charges": [
        "charged",
        "charge",
        "payment",
        "paid",
        "money",
        "billing"
    ],

    "Account & Security": [
        "account",
        "password",
        "login",
        "locked",
        "security"
    ],

    "Prime & Subscription": [
        "prime",
        "membership",
        "subscription",
        "renew"
    ],

    "Product & Digital Services": [
        "fire",
        "echo",
        "alexa",
        "video",
        "kindle",
        "app",
        "device"
    ],

    "Seller & Marketplace": [
        "seller",
        "marketplace",
        "third-party",
        "third party",
        "vendor"
    ]
};

const examplesPerCategory = 15;

const examples = {};

for (const category of Object.keys(categories)) {
    examples[category] = [];
}

function matchesCategory(message, keywords) {
    const lower = message.toLowerCase();

    return keywords.some((keyword) =>
        lower.includes(keyword)
    );
}

async function sampleExamples() {
    const fileStream = fs.createReadStream(filePath);

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        if (!line.trim()) continue;

        const item = JSON.parse(line);
        const message = item.currentMessage || "";

        for (const [category, keywords] of Object.entries(categories)) {
            if (
                examples[category].length < examplesPerCategory &&
                matchesCategory(message, keywords)
            ) {
                examples[category].push(message);
            }
        }

        const finished = Object.values(examples).every(
            (categoryExamples) =>
                categoryExamples.length >= examplesPerCategory
        );

        if (finished) break;
    }

    console.log("\n================================");
    console.log("INTENT EXAMPLE SAMPLING");
    console.log("================================\n");

    for (const [category, categoryExamples] of Object.entries(examples)) {
        console.log(`\n\n### ${category}\n`);

        categoryExamples.forEach((message, index) => {
            console.log(`${index + 1}. ${message}`);
        });
    }
}

sampleExamples().catch((error) => {
    console.error("Sampling failed:", error);
    process.exit(1);
});