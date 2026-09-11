import fs from "fs";
import { parse } from "csv-parse";
import { stringify } from "csv-stringify";

const filePath =
    process.argv[2] ||
    "/home/aryankashyap/myworkfolder/dataset/archive/twcs/twcs.csv";

const targetBrand = process.argv[3] || "AmazonHelp";
const sampleSize = Number(process.argv[4]) || 1000;

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
        if (visited.has(currentTweet.tweetId)) {
            break;
        }

        visited.add(currentTweet.tweetId);

        const parentTweet = tweets.get(currentTweet.inResponseTo);

        if (!parentTweet) {
            break;
        }

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

        const childReplies = replies.get(tweetId) || [];

        for (const childId of childReplies) {
            queue.push(childId);
        }
    }

    return conversation;
}

function extractCustomerMessages(conversation) {
    return conversation.filter((message) => message.inbound);
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
    console.log(`Building ${targetBrand} conversations...`);

    const conversationIds = new Set();

    for (const tweet of tweets.values()) {
        if (
            !tweet.inbound &&
            tweet.authorId === targetBrand
        ) {
            const rootId = findConversationRoot(tweet.tweetId);

            if (rootId) {
                conversationIds.add(rootId);
            }
        }
    }

    console.log(
        `Conversations found: ${conversationIds.size}`
    );

    const conversations = [];

    for (const rootId of conversationIds) {
        const conversation = buildConversation(rootId);

        const hasTargetBrand = conversation.some(
            (message) =>
                !message.inbound &&
                message.authorId === targetBrand
        );

        if (!hasTargetBrand) continue;

        const customerMessages =
            extractCustomerMessages(conversation);

        if (customerMessages.length === 0) continue;

        const latestCustomerMessage =
            customerMessages[customerMessages.length - 1];

        conversations.push({
            conversationId: rootId,
            messageId: latestCustomerMessage.tweetId,
            createdAt: latestCustomerMessage.createdAt,
            text: latestCustomerMessage.text,
            conversationLength: conversation.length
        });
    }

    /*
     * Shuffle the conversations so the sample is not
     * simply the first N conversations in dataset order.
     */
    conversations.sort(() => Math.random() - 0.5);

    const sample = conversations.slice(0, sampleSize);

    const outputPath = `data/${targetBrand.toLowerCase()}-sample.csv`;

    stringify(
        sample,
        {
            header: true,
            columns: [
                "conversationId",
                "messageId",
                "createdAt",
                "text",
                "conversationLength"
            ]
        },
        (error, output) => {
            if (error) {
                console.error("Error creating sample:", error);
                return;
            }

            fs.writeFileSync(outputPath, output);

            console.log(`Sample created: ${outputPath}`);
            console.log(`Sample size: ${sample.length}`);
        }
    );
});

parser.on("error", (error) => {
    console.error("Error while reading dataset:", error);
});