(function initializeSidequestAnalytics(globalScope) {
    const API_ENDPOINT = '/.netlify/functions/product-scores';
    const SCORES_CACHE_SESSION_KEY = 'sidequest:scores-cache-v1';
    const SCORES_CACHE_MAX_AGE_MS = 15 * 60 * 1000;
    const VIEW_TRACKED_SESSION_PREFIX = 'sidequest:viewed:';
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
    let scoreCacheUpdatedAtMs = 0;
    let activeScoreFetchPromise = null;

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

    function getSessionStorage() {
        try {
            if (!globalScope.sessionStorage) {
                return null;
            }
            return globalScope.sessionStorage;
        } catch (error) {
            return null;
        }
    }

    function loadScoresFromSessionCache() {
        const sessionStorage = getSessionStorage();
        if (!sessionStorage) {
            return;
        }

        try {
            const rawPayload = sessionStorage.getItem(SCORES_CACHE_SESSION_KEY);
            if (!rawPayload) {
                return;
            }

            const payload = JSON.parse(rawPayload);
            if (!payload || typeof payload !== 'object') {
                return;
            }

            scoreMapCache = normalizeScores(payload.scores);
            scoreCacheUpdatedAtMs = toValidNumber(payload.updatedAt) || 0;
        } catch (error) {
            // Ignore malformed cache payloads.
        }
    }

    function persistScoresToSessionCache() {
        const sessionStorage = getSessionStorage();
        if (!sessionStorage) {
            return;
        }

        try {
            sessionStorage.setItem(SCORES_CACHE_SESSION_KEY, JSON.stringify({
                updatedAt: scoreCacheUpdatedAtMs,
                scores: scoreMapCache
            }));
        } catch (error) {
            // Ignore storage quota and serialization errors.
        }
    }

    function hasFreshScoreCache() {
        if (scoreCacheUpdatedAtMs <= 0) {
            return false;
        }
        return Date.now() - scoreCacheUpdatedAtMs <= SCORES_CACHE_MAX_AGE_MS;
    }

    function hasTrackedViewInSession(productId) {
        const sessionStorage = getSessionStorage();
        if (!sessionStorage || !productId) {
            return false;
        }

        try {
            return sessionStorage.getItem(`${VIEW_TRACKED_SESSION_PREFIX}${productId}`) === '1';
        } catch (error) {
            return false;
        }
    }

    function markTrackedViewInSession(productId) {
        const sessionStorage = getSessionStorage();
        if (!sessionStorage || !productId) {
            return;
        }

        try {
            sessionStorage.setItem(`${VIEW_TRACKED_SESSION_PREFIX}${productId}`, '1');
        } catch (error) {
            // Ignore storage errors.
        }
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
            scoreCacheUpdatedAtMs = Date.now();
            persistScoresToSessionCache();
            emitScoresUpdatedEvent('', 0, 0, 'sync');
            return true;
        } catch (error) {
            return false;
        }
    }

    function ensureScoresLoaded(forceRefresh = false) {
        if (!forceRefresh && hasFreshScoreCache()) {
            return Promise.resolve(true);
        }

        if (activeScoreFetchPromise) {
            return activeScoreFetchPromise;
        }

        activeScoreFetchPromise = fetchScoresFromServer()
            .finally(() => {
                activeScoreFetchPromise = null;
            });

        return activeScoreFetchPromise;
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
            scoreCacheUpdatedAtMs = Date.now();
            persistScoresToSessionCache();
            const nextScore = toValidNumber(scoreMapCache[safeProductId]);
            emitScoresUpdatedEvent(safeProductId, points, nextScore, `${action}:server`);
            return nextScore;
        } catch (error) {
            return 0;
        }
    }

    loadScoresFromSessionCache();

    globalScope.SidequestAnalytics = {
        POINTS,
        trackProductView(productId) {
            const safeProductId = normalizeProductId(productId);
            if (!safeProductId) {
                return Promise.resolve(0);
            }

            if (hasTrackedViewInSession(safeProductId)) {
                return Promise.resolve(toValidNumber(scoreMapCache[safeProductId]));
            }

            return trackEvent(safeProductId, 'view')
                .then((nextScore) => {
                    if (toValidNumber(nextScore) > 0) {
                        markTrackedViewInSession(safeProductId);
                    }
                    return nextScore;
                });
        },
        trackAddToCart(productId) {
            return trackEvent(productId, 'addToCart');
        },
        trackCheckout(productId) {
            return trackEvent(productId, 'checkout');
        },
        refreshScores() {
            return ensureScoresLoaded(true);
        },
        getTopProductIdsByScore(limit = 3) {
            ensureScoresLoaded(false);
            return computeTopProductIds(limit);
        },
        getProductScore(productId) {
            ensureScoresLoaded(false);
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
