import fs from "fs";
import { parse } from "csv-parse/sync";

const GOLDEN_LABELS_PATH = "processed/golden-set-labeling.csv";
const PREDICTIONS_PATH = process.argv[2];

if (!PREDICTIONS_PATH) {
    console.error(
        "Usage: node scripts/evaluate-intent-classifier.js <predictions.json>"
    );
    process.exit(1);
}

function parseCsvLine(line) {
    const values = [];
    let current = "";
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (insideQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (char === "," && !insideQuotes) {
            values.push(current);
            current = "";
        } else {
            current += char;
        }
    }

    values.push(current);

    return values;
}

function loadGoldenLabels() {
    const csvContent = fs.readFileSync(
        GOLDEN_LABELS_PATH,
        "utf8"
    );

    const rows = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        relax_quotes: true
    });

    const labels = new Map();

    for (const row of rows) {
        labels.set(
            row.caseId,
            row.goldIntent
        );
    }

    return labels;
}

function calculateMetrics(goldenLabels, predictions) {
    const intents = new Set(goldenLabels.values());

    for (const prediction of predictions) {
        intents.add(prediction.predictedIntent);
    }

    const confusionMatrix = {};

    for (const actual of intents) {
        confusionMatrix[actual] = {};

        for (const predicted of intents) {
            confusionMatrix[actual][predicted] = 0;
        }
    }

    let correct = 0;

    for (const prediction of predictions) {
        const actual = goldenLabels.get(prediction.caseId);
        const predicted = prediction.predictedIntent;

        if (!actual) continue;

        confusionMatrix[actual][predicted]++;

        if (actual === predicted) {
            correct++;
        }
    }

    const total = predictions.filter(
        (prediction) => goldenLabels.has(prediction.caseId)
    ).length;

    const accuracy = total === 0 ? 0 : correct / total;

    const perIntent = {};

    for (const intent of intents) {
        const truePositive = confusionMatrix[intent][intent];

        let falsePositive = 0;
        let falseNegative = 0;

        for (const actual of intents) {
            if (actual !== intent) {
                falsePositive += confusionMatrix[actual][intent];
            }
        }

        for (const predicted of intents) {
            if (predicted !== intent) {
                falseNegative += confusionMatrix[intent][predicted];
            }
        }

        const precision =
            truePositive + falsePositive === 0
                ? 0
                : truePositive / (truePositive + falsePositive);

        const recall =
            truePositive + falseNegative === 0
                ? 0
                : truePositive / (truePositive + falseNegative);

        const f1 =
            precision + recall === 0
                ? 0
                : (2 * precision * recall) / (precision + recall);

        perIntent[intent] = {
            precision,
            recall,
            f1,
            support:
                truePositive + falseNegative
        };
    }

    const macroF1 =
        Object.values(perIntent).length === 0
            ? 0
            : Object.values(perIntent)
                .reduce((sum, metric) => sum + metric.f1, 0) /
              Object.values(perIntent).length;

    return {
        total,
        correct,
        accuracy,
        macroF1,
        perIntent,
        confusionMatrix
    };
}

async function main() {
    console.log("Loading golden labels...");

    const goldenLabels = await loadGoldenLabels();

    const predictionData = JSON.parse(
        fs.readFileSync(PREDICTIONS_PATH, "utf8")
    );

    console.log("Evaluating predictions...");

    const metrics = calculateMetrics(
        goldenLabels,
        predictionData.predictions
    );

    console.log("\nEvaluation results:");
    console.log(`Cases evaluated: ${metrics.total}`);
    console.log(`Correct: ${metrics.correct}`);
    console.log(`Accuracy: ${(metrics.accuracy * 100).toFixed(2)}%`);
    console.log(`Macro F1: ${(metrics.macroF1 * 100).toFixed(2)}%`);

    console.log("\nPer-intent results:");

    for (const [intent, metric] of Object.entries(metrics.perIntent)) {
        console.log(
            `${intent}: ` +
            `precision=${(metric.precision * 100).toFixed(2)}%, ` +
            `recall=${(metric.recall * 100).toFixed(2)}%, ` +
            `F1=${(metric.f1 * 100).toFixed(2)}%, ` +
            `support=${metric.support}`
        );
    }
}

main().catch((error) => {
    console.error("Evaluation failed:", error);
    process.exit(1);
});