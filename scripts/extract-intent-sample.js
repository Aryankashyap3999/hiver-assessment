import fs from "fs";
import { parse } from "csv-parse";
import { stringify } from "csv-stringify";

const filePath =
    process.argv[2] ||
    "/home/aryankashyap/myworkfolder/dataset/archive/twcs/twcs.csv";

const targetBrand = process.argv[3] || "AmazonHelp";
const sampleSize = Number(process.argv[4]) || 2000;

const tweets = new Map();
const replies = new Map();

function processTweet(row) {
    const tweet = {
        tweetId: row.tweet_id,
        authorId: row.author_id,
        inbound: row.inbound === "True",
        createdAt: row.created_at,
        text: row.text,
        inResponseTo: row.in_response_to_tweet_id
    };

    tweets.set(tweet.tweetId, tweet);

    if (tweet.inResponseTo) {
        if (!replies.has(tweet.inResponseTo)) {
            replies.set(tweet.inResponseTo, []);
        }

        replies.get(tweet.inResponseTo).push(tweet.tweetId);
    }
}

function findConversationRoot(tweetId) {
    const visited = new Set();
    let currentTweet = tweets.get(tweetId);

    while (currentTweet?.inResponseTo) {
        if (visited.has(currentTweet.tweetId)) break;

        visited.add(currentTweet.tweetId);

        const parentTweet = tweets.get(currentTweet.inResponseTo);

        if (!parentTweet) break;

        currentTweet = parentTweet;
    }

    return currentTweet?.tweetId;
}

function buildConversation(rootId) {
    const conversation = [];
    const queue = [rootId];
    const visited = new Set();

    while (queue.length > 0) {
        const tweetId = queue.shift();

        if (visited.has(tweetId)) continue;

        visited.add(tweetId);

        const tweet = tweets.get(tweetId);

        if (!tweet) continue;

        conversation.push(tweet);

        for (const childId of replies.get(tweetId) || []) {
            queue.push(childId);
        }
    }

    return conversation;
}

function createSeededRandom(seed = 42) {
    let state = seed;

    return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
}

function sampleConversations(conversations, size) {
    const random = createSeededRandom();

    const shuffled = [...conversations];

    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));

        [shuffled[i], shuffled[j]] =
            [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, size);
}

const parser = fs.createReadStream(filePath).pipe(
    parse({
        columns: true,
        skip_empty_lines: true
    })
);

parser.on("data", processTweet);

parser.on("end", () => {
    console.log(`Tweets indexed: ${tweets.size}`);

    const roots = new Set();

    for (const tweet of tweets.values()) {
        if (
            !tweet.inbound &&
            tweet.authorId === targetBrand
        ) {
            const rootId = findConversationRoot(tweet.tweetId);

            if (rootId) {
                roots.add(rootId);
            }
        }
    }

    console.log(`Brand conversations: ${roots.size}`);

    const cases = [];

    for (const rootId of roots) {
        const conversation = buildConversation(rootId);

        const customerMessages = conversation.filter(
            (message) => message.inbound
        );

        if (customerMessages.length === 0) continue;

        const latestCustomerMessage =
            customerMessages[customerMessages.length - 1];

        const supportMessages = conversation.filter(
            (message) =>
                !message.inbound &&
                message.authorId === targetBrand
        );

        if (supportMessages.length === 0) continue;

        cases.push({
            conversationId: rootId,
            customerMessageId: latestCustomerMessage.tweetId,
            customerMessage: latestCustomerMessage.text,
            conversationLength: conversation.length,
            supportResponse: supportMessages[supportMessages.length - 1].text
        });
    }

    const sample = sampleConversations(
        cases,
        sampleSize
    );

    const outputPath =
        "data/amazonhelp-intent-sample.csv";

    stringify(
        sample,
        {
            header: true,
            columns: [
                "conversationId",
                "customerMessageId",
                "customerMessage",
                "conversationLength",
                "supportResponse"
            ]
        },
        (error, output) => {
            if (error) {
                console.error(error);
                return;
            }

            fs.writeFileSync(outputPath, output);

            console.log(`Sample created: ${outputPath}`);
            console.log(`Sample size: ${sample.length}`);
        }
    );
});

parser.on("error", (error) => {
    console.error("Dataset error:", error);
});