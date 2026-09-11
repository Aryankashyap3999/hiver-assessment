import fs from "fs";
import readline from "readline";

const inputPath = "processed/golden-set.jsonl";
const outputPath = "processed/golden-set-labeling.csv";

function escapeCsv(value) {
    const text = String(value ?? "");

    return `"${text.replace(/"/g, '""')}"`;
}

async function prepareLabelingFile() {
    const input = fs.createReadStream(inputPath);

    const rl = readline.createInterface({
        input,
        crlfDelay: Infinity
    });

    const rows = [];

    rows.push([
        "caseId",
        "currentMessage",
        "context",
        "historicalResponse",
        "goldIntent"
    ].map(escapeCsv).join(","));

    let count = 0;

    for await (const line of rl) {
        if (!line.trim()) continue;

        const item = JSON.parse(line);

        const context = (item.context || [])
            .map((message) => {
                const speaker = message.role === "customer"
                    ? "CUSTOMER"
                    : "SUPPORT";

                return `${speaker}: ${message.text}`;
            })
            .join(" | ");

        rows.push([
            item.caseId,
            item.currentMessage,
            context,
            item.historicalResponse?.text || "",
            ""
        ].map(escapeCsv).join(","));

        count++;
    }

    fs.writeFileSync(
        outputPath,
        rows.join("\n") + "\n"
    );

    console.log("\n================================");
    console.log("GOLDEN LABELING FILE");
    console.log("================================\n");

    console.log(`Cases prepared: ${count}`);
    console.log(`Output: ${outputPath}`);
}

prepareLabelingFile().catch((error) => {
    console.error("Failed to prepare labeling file:", error);
    process.exit(1);
});