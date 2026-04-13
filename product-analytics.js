(function initializeSidequestAnalytics(globalScope) {
    const API_ENDPOINT = '/.netlify/functions/product-scores';
    const POINTS = {
        view: 1,
        addToCart: 3,
        checkout: 5
    };
    const ACTION_MAP = {
        view: 'view',
        addToCart: 'add_to_cart',
        checkout: 'checkout'
    };

    let scoreMapCache = {};

    function normalizeProductId(productId) {
        if (typeof productId !== 'string') {
            return '';
        }
        return productId.trim();
    }

    function toValidNumber(value) {
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
        if (!rawScores || typeof rawScores !== 'object' || Array.isArray(rawScores)) {
            return {};
        }

        const normalized = {};
        Object.entries(rawScores).forEach(([productId, score]) => {
            const safeProductId = normalizeProductId(productId);
            const safeScore = toValidNumber(score);
            if (safeProductId && safeScore > 0) {
                normalized[safeProductId] = safeScore;
            }
        });

        return normalized;
    }

    function computeTopProductIds(limit = 3) {
        const safeLimit = Math.max(0, Math.floor(toValidNumber(limit)));
        if (safeLimit === 0) {
            return [];
        }

        return Object.entries(scoreMapCache)
            .filter(([productId, score]) => normalizeProductId(productId) !== '' && toValidNumber(score) > 0)
            .sort((entryA, entryB) => {
                const scoreDifference = toValidNumber(entryB[1]) - toValidNumber(entryA[1]);
                if (scoreDifference !== 0) {
                    return scoreDifference;
                }
                return String(entryA[0]).localeCompare(String(entryB[0]));
            })
            .slice(0, safeLimit)
            .map(([productId]) => productId);
    }

    function emitScoresUpdatedEvent(productId, addedPoints, nextScore, reason) {
        try {
            globalScope.dispatchEvent(new CustomEvent('sidequest:scores-updated', {
                detail: {
                    productId,
                    addedPoints,
                    nextScore,
                    reason
                }
            }));
        } catch (error) {
            // Ignore event dispatch errors.
        }
    }

    async function fetchScoresFromServer() {
        try {
            const response = await fetch(API_ENDPOINT, { cache: 'no-store' });
            if (!response.ok) {
                return false;
            }

            const payload = await response.json();
            scoreMapCache = normalizeScores(payload.scores);
            emitScoresUpdatedEvent('', 0, 0, 'sync');
            return true;
        } catch (error) {
            return false;
        }
    }

    async function trackEvent(productId, clientAction) {
        const safeProductId = normalizeProductId(productId);
        const action = ACTION_MAP[clientAction];
        const points = POINTS[clientAction];

        if (!safeProductId || !action || !points) {
            return 0;
        }

        try {
            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                },
                body: JSON.stringify({
                    productId: safeProductId,
                    action
                })
            });

            if (!response.ok) {
                return 0;
            }

            const payload = await response.json();
            scoreMapCache = normalizeScores(payload.scores);
            const nextScore = toValidNumber(scoreMapCache[safeProductId]);
            emitScoresUpdatedEvent(safeProductId, points, nextScore, `${action}:server`);
            return nextScore;
        } catch (error) {
            return 0;
        }
    }

    fetchScoresFromServer();

    globalScope.SidequestAnalytics = {
        POINTS,
        trackProductView(productId) {
            return trackEvent(productId, 'view');
        },
        trackAddToCart(productId) {
            return trackEvent(productId, 'addToCart');
        },
        trackCheckout(productId) {
            return trackEvent(productId, 'checkout');
        },
        refreshScores() {
            return fetchScoresFromServer();
        },
        getTopProductIdsByScore(limit = 3) {
            return computeTopProductIds(limit);
        },
        getProductScore(productId) {
            const safeProductId = normalizeProductId(productId);
            if (!safeProductId) {
                return 0;
            }
            return toValidNumber(scoreMapCache[safeProductId]);
        },
        getAllScores() {
            return { ...scoreMapCache };
        }
    };
})(window);
