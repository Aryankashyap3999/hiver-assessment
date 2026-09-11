import fs from "fs";
import { parse } from "csv-parse";

const filePath =
    process.argv[2] ||
    "/home/aryankashyap/myworkfolder/dataset/archive/twcs/twcs.csv";

const TARGET_BRAND = "AmazonHelp";

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

    conversation.sort(
        (a, b) =>
            new Date(a.createdAt) - new Date(b.createdAt)
    );

    return conversation;
}

function isAmazonHelpConversation(conversation) {
    return conversation.some(
        (tweet) =>
            !tweet.inbound &&
            tweet.authorId === TARGET_BRAND
    );
}

function hasCustomerMessage(conversation) {
    return conversation.some(
        (tweet) => tweet.inbound
    );
}

function normalizeConversation(rootId, conversation) {
    return {
        conversationId: rootId,

        messages: conversation.map((tweet) => ({
            tweetId: tweet.tweetId,
            role: tweet.inbound ? "customer" : "support",
            text: tweet.text,
            createdAt: tweet.createdAt,
            inResponseTo: tweet.inResponseTo
        }))
    };
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
    console.log(`Reply relationships indexed: ${replies.size}`);

    const roots = new Set();

    for (const tweet of tweets.values()) {
        if (!tweet.inbound) {
            const rootId = findConversationRoot(tweet.tweetId);

            if (rootId) {
                roots.add(rootId);
            }
        }
    }

    console.log(`Candidate conversation roots: ${roots.size}`);

    let processed = 0;

    for (const rootId of roots) {
        const conversation = buildConversation(rootId);

        if (!isAmazonHelpConversation(conversation)) {
            continue;
        }

        if (!hasCustomerMessage(conversation)) {
            continue;
        }

        const normalized = normalizeConversation(
            rootId,
            conversation
        );

        console.log(
            JSON.stringify(normalized, null, 2)
        );

        processed++;

        if (processed >= 5) {
            break;
        }
    }

    console.log(`\nSample conversations processed: ${processed}`);
});

parser.on("error", (error) => {
    console.error("Error while reading dataset:", error);
});