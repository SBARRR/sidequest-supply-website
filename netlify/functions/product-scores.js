const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'sidequest-analytics';
const STORE_KEY = 'product-scores';
const ALLOWED_ACTIONS = {
    view: 1,
    add_to_cart: 3,
    checkout: 5
};

function getStoreOptions() {
    const siteID = process.env.NETLIFY_BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID || '';
    const token = process.env.NETLIFY_BLOBS_TOKEN
        || process.env.NETLIFY_AUTH_TOKEN
        || process.env.NETLIFY_ACCESS_TOKEN
        || '';

    if (siteID && token) {
        return { siteID, token };
    }

    return undefined;
}

function getProductScoreStore() {
    const storeOptions = getStoreOptions();
    return storeOptions
        ? getStore({ name: STORE_NAME, ...storeOptions })
        : getStore(STORE_NAME);
}

function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeProductId(productId) {
    if (typeof productId !== 'string') {
        return '';
    }
    return productId.trim();
}

function toSafeNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return 0;
}

function normalizeScores(rawScores) {
    if (!isPlainObject(rawScores)) {
        return {};
    }

    const normalized = {};
    Object.entries(rawScores).forEach(([productId, score]) => {
        const safeProductId = normalizeProductId(productId);
        const safeScore = toSafeNumber(score);
        if (safeProductId && safeScore > 0) {
            normalized[safeProductId] = safeScore;
        }
    });

    return normalized;
}

function getTopProductIdsByScore(scoreMap, limit = 3) {
    const safeLimit = Math.max(0, Math.floor(toSafeNumber(limit)));
    if (safeLimit === 0) {
        return [];
    }

    return Object.entries(scoreMap)
        .filter(([productId, score]) => normalizeProductId(productId) !== '' && toSafeNumber(score) > 0)
        .sort((entryA, entryB) => {
            const scoreDifference = toSafeNumber(entryB[1]) - toSafeNumber(entryA[1]);
            if (scoreDifference !== 0) {
                return scoreDifference;
            }
            return String(entryA[0]).localeCompare(String(entryB[0]));
        })
        .slice(0, safeLimit)
        .map(([productId]) => productId);
}

async function readScoreMap() {
    const store = getProductScoreStore();
    const rawScores = await store.get(STORE_KEY, { type: 'json' });
    return normalizeScores(rawScores);
}

async function writeScoreMap(scoreMap) {
    const store = getProductScoreStore();
    await store.setJSON(STORE_KEY, normalizeScores(scoreMap));
}

function createResponse(statusCode, payload) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        },
        body: JSON.stringify(payload)
    };
}

exports.handler = async function handler(event) {
    try {
        if (event.httpMethod === 'GET') {
            const queryLimit = event.queryStringParameters && event.queryStringParameters.limit;
            const limit = queryLimit ? Number.parseInt(queryLimit, 10) : 3;
            const scoreMap = await readScoreMap();
            const topProductIds = getTopProductIdsByScore(scoreMap, limit);

            return createResponse(200, {
                scores: scoreMap,
                topProductIds
            });
        }

        if (event.httpMethod === 'POST') {
            let payload = {};
            try {
                payload = event.body ? JSON.parse(event.body) : {};
            } catch (error) {
                return createResponse(400, { error: 'Invalid JSON body.' });
            }

            const productId = normalizeProductId(payload.productId);
            const action = typeof payload.action === 'string' ? payload.action.trim() : '';
            const points = ALLOWED_ACTIONS[action];

            if (!productId) {
                return createResponse(400, { error: 'Missing productId.' });
            }

            if (!points) {
                return createResponse(400, { error: 'Unsupported action.' });
            }

            const scoreMap = await readScoreMap();
            const previousScore = toSafeNumber(scoreMap[productId]);
            const nextScore = previousScore + points;
            scoreMap[productId] = nextScore;
            await writeScoreMap(scoreMap);

            return createResponse(200, {
                productId,
                action,
                addedPoints: points,
                nextScore,
                scores: scoreMap,
                topProductIds: getTopProductIdsByScore(scoreMap, 3)
            });
        }

        return createResponse(405, { error: 'Method not allowed.' });
    } catch (error) {
        return createResponse(500, {
            error: 'Unable to process product scoring request.'
        });
    }
};
