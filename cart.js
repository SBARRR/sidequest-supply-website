(function initializeSidequestCart(globalScope) {
    const STORAGE_KEY = 'sidequest-cart-v1';
    const PRODUCTS_JSON_PATH = 'product%20json/products.json';
    const PROMO_RULES_JSON_PATH = 'product%20json/promo-rules.json';
    const CATALOGUE_SETTINGS_PATH = 'product%20json/catalogue-settings.json';
    const MAILER_WEIGHT_OZ = 0.25;
    const TAX_RATE = 0.07;
    const SHIPPING_TIERS = [
        { maxWeightOz: 8, cost: 7.95 },
        { maxWeightOz: 16, cost: 10.95 },
        { maxWeightOz: 32, cost: 14.95 }
    ];
    const HEAVY_SHIPPING_COST = 20.95;
    const BUNDLE_RULES = {
        keychain: [
            { keychains: 4, sleeves: 0, priceCents: 1000 },
            { keychains: 3, sleeves: 0, priceCents: 800 },
            { keychains: 2, sleeves: 0, priceCents: 600 }
        ],
        sleeve: [
            { keychains: 0, sleeves: 4, priceCents: 1500 },
            { keychains: 0, sleeves: 3, priceCents: 1200 },
            { keychains: 0, sleeves: 2, priceCents: 900 }
        ],
        mixed: [
            { keychains: 2, sleeves: 2, priceCents: 1250 },
            { keychains: 1, sleeves: 2, priceCents: 1066 },
            { keychains: 2, sleeves: 1, priceCents: 933 },
            { keychains: 1, sleeves: 1, priceCents: 750 }
        ]
    };
    const EVERYDAY_BUNDLE_RULES = [
        ...BUNDLE_RULES.mixed,
        ...BUNDLE_RULES.keychain,
        ...BUNDLE_RULES.sleeve
    ];
    const productMetadataById = new Map();
    const promoRulesById = new Map();
    let promosEnabled = false;
    let enabledPromoRuleIds = null;
    let metadataLoaded = false;

    function toValidNumber(value) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }

        if (typeof value === 'string' && value.trim() !== '') {
            const parsed = Number.parseFloat(value.replace(/[$,\s]/g, ''));
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }

        return null;
    }

    function toValidQuantity(value, fallback = 1) {
        const parsed = Number.parseInt(String(value), 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
            return parsed;
        }
        return fallback;
    }

    function normalizeString(value) {
        if (typeof value !== 'string') {
            return '';
        }
        return value.trim();
    }

    function normalizeCategoryValue(value) {
        return normalizeString(value)
            .toLowerCase()
            .replace(/[-_]+/g, ' ')
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function roundCurrency(value) {
        return Math.round((value + Number.EPSILON) * 100) / 100;
    }

    function dollarsToCents(value) {
        const numeric = toValidNumber(value);
        return numeric === null ? null : Math.round(numeric * 100);
    }

    function centsToDollars(cents) {
        return cents / 100;
    }

    function formatPrice(value) {
        const numeric = toValidNumber(value);
        return numeric === null ? '' : `$${numeric.toFixed(2)}`;
    }

    function getRuleMinimumTotal(rule) {
        if (!rule || typeof rule !== 'object') {
            return 0;
        }

        if (Number.isFinite(rule.minimum_total_cents)) {
            return centsToDollars(rule.minimum_total_cents);
        }

        return toValidNumber(rule.minimum_total) || 0;
    }

    function getRuleLimitPerOrder(rule) {
        if (!rule || typeof rule !== 'object') {
            return 0;
        }

        const parsed = Number.parseInt(String(rule.limit_per_order ?? 0), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }

    function normalizePromoRuleIds(value) {
        if (!Array.isArray(value)) {
            return null;
        }

        return new Set(
            value
                .filter((ruleId) => typeof ruleId === 'string' && ruleId.trim() !== '')
                .map((ruleId) => ruleId.trim())
        );
    }

    function buildItemKey(productId, variantId) {
        const safeProductId = normalizeString(productId);
        const safeVariantId = normalizeString(variantId);
        return `${safeProductId}::${safeVariantId || 'base'}`;
    }

    async function loadProductMetadata() {
        try {
            const response = await fetch(PRODUCTS_JSON_PATH);
            if (!response.ok) {
                return;
            }

            const payload = await response.json();
            if (!Array.isArray(payload)) {
                return;
            }

            payload.forEach((entry) => {
                const productId = normalizeString(entry?.id);
                if (!productId) {
                    return;
                }

                const weightOz = toValidNumber(entry?.weight_oz);
                productMetadataById.set(productId, {
                    category: normalizeCategoryValue(entry?.category),
                    promoRule: normalizeString(entry?.promo_rule),
                    weightOz: typeof weightOz === 'number' && weightOz >= 0 ? weightOz : 0
                });
            });
        } catch (error) {
            // Keep cart usable if product metadata cannot be loaded.
        }
    }

    async function loadPromoRules() {
        try {
            const response = await fetch(PROMO_RULES_JSON_PATH);
            if (!response.ok) {
                return;
            }

            const payload = await response.json();
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return;
            }

            Object.entries(payload).forEach(([ruleId, rule]) => {
                const safeRuleId = normalizeString(ruleId);
                if (!safeRuleId || !rule || typeof rule !== 'object' || Array.isArray(rule)) {
                    return;
                }

                promoRulesById.set(safeRuleId, {
                    ...rule,
                    id: safeRuleId,
                    label: normalizeString(rule.label) || safeRuleId
                });
            });
        } catch (error) {
            // Keep normal cart behavior available if promo rules cannot be loaded.
        }
    }

    async function loadCatalogueSettings() {
        try {
            const response = await fetch(CATALOGUE_SETTINGS_PATH);
            if (!response.ok) {
                return;
            }

            const settings = await response.json();
            promosEnabled = settings?.promos_enabled === true;
            enabledPromoRuleIds = normalizePromoRuleIds(settings?.enabled_promo_rules);
        } catch (error) {
            promosEnabled = false;
            enabledPromoRuleIds = new Set();
        }
    }

    async function loadCartMetadata() {
        await Promise.allSettled([
            loadProductMetadata(),
            loadPromoRules(),
            loadCatalogueSettings()
        ]);
        metadataLoaded = true;
    }

    const metadataReady = loadCartMetadata();

    function normalizeItem(rawItem) {
        const safeItem = rawItem && typeof rawItem === 'object' ? rawItem : {};
        const productId = normalizeString(safeItem.productId);
        if (!productId) {
            return null;
        }

        const variantId = normalizeString(safeItem.variantId);
        const quantity = toValidQuantity(safeItem.quantity, 1);
        const price = toValidNumber(safeItem.price);

        return {
            key: buildItemKey(productId, variantId),
            productId,
            variantId,
            name: normalizeString(safeItem.name),
            color: normalizeString(safeItem.color),
            style: normalizeString(safeItem.style),
            selectedBaseProductId: normalizeString(safeItem.selectedBaseProductId),
            category: normalizeCategoryValue(safeItem.category),
            promoRule: normalizeString(safeItem.promoRule || safeItem.promo_rule),
            image: normalizeString(safeItem.image),
            price,
            quantity
        };
    }

    function readCartItems() {
        try {
            const stored = globalScope.localStorage.getItem(STORAGE_KEY);
            if (!stored) {
                return [];
            }

            const parsed = JSON.parse(stored);
            if (!Array.isArray(parsed)) {
                return [];
            }

            return parsed
                .map((item) => normalizeItem(item))
                .filter((item) => item && item.quantity > 0);
        } catch (error) {
            return [];
        }
    }

    function writeCartItems(items) {
        try {
            globalScope.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch (error) {
            // Ignore storage failures to keep UI usable.
        }
    }

    function getItems() {
        return readCartItems();
    }

    function getTotalCount(items = readCartItems()) {
        return items.reduce((sum, item) => sum + toValidQuantity(item.quantity, 0), 0);
    }

    function getSubtotal(items = readCartItems()) {
        return items.reduce((sum, item) => {
            const price = toValidNumber(item.price);
            if (price === null) {
                return sum;
            }
            return sum + (price * toValidQuantity(item.quantity, 0));
        }, 0);
    }

    function getProductMetadata(productId) {
        return productMetadataById.get(normalizeString(productId)) || null;
    }

    function getItemCategory(item) {
        const metadata = getProductMetadata(item?.productId);
        return metadata?.category || normalizeCategoryValue(item?.category);
    }

    function getItemPromoRuleId(item) {
        const metadata = getProductMetadata(item?.productId);
        return metadata?.promoRule || normalizeString(item?.promoRule);
    }

    function isPromoItem(item) {
        return getItemPromoRuleId(item) !== '' || getItemCategory(item).includes('promo');
    }

    function getItemWeightOz(item) {
        const metadata = getProductMetadata(item?.productId);
        return metadata?.weightOz || 0;
    }

    function getTotalWeightOz(items) {
        if (!Array.isArray(items) || items.length === 0) {
            return 0;
        }

        const itemsWeight = items.reduce((sum, item) => {
            const safeQuantity = toValidQuantity(item?.quantity, 0);
            return sum + (getItemWeightOz(item) * safeQuantity);
        }, 0);

        return itemsWeight + MAILER_WEIGHT_OZ;
    }

    function getShippingCost(weightOz) {
        if (weightOz <= 0) {
            return 0;
        }

        for (const tier of SHIPPING_TIERS) {
            if (weightOz <= tier.maxWeightOz) {
                return tier.cost;
            }
        }

        return HEAVY_SHIPPING_COST;
    }

    function getTaxAmount(subtotal, shippingCost) {
        const taxableAmount = subtotal + shippingCost;
        if (taxableAmount <= 0 || TAX_RATE <= 0) {
            return 0;
        }
        return roundCurrency(taxableAmount * TAX_RATE);
    }

    function getCartSubtotalCents(items) {
        if (!Array.isArray(items)) {
            return 0;
        }

        return items.reduce((sum, item) => {
            const priceCents = dollarsToCents(item?.price);
            if (priceCents === null) {
                return sum;
            }

            return sum + (priceCents * toValidQuantity(item?.quantity, 0));
        }, 0);
    }

    function getBundleCategoryForItem(item) {
        const category = getItemCategory(item);
        if (!category || isPromoItem(item) || category.includes('custom')) {
            return '';
        }

        if (category.includes('lighter sleeve')) {
            return 'sleeve';
        }

        if (category.includes('keychain')) {
            return 'keychain';
        }

        return '';
    }

    function getEligibleBundleUnitPrices(items) {
        const unitPrices = {
            keychain: [],
            sleeve: []
        };

        if (!Array.isArray(items)) {
            return unitPrices;
        }

        items.forEach((item) => {
            const bundleCategory = getBundleCategoryForItem(item);
            if (!bundleCategory) {
                return;
            }

            const priceCents = dollarsToCents(item?.price);
            if (priceCents === null || priceCents < 0) {
                return;
            }

            const safeQuantity = toValidQuantity(item?.quantity, 0);
            for (let index = 0; index < safeQuantity; index += 1) {
                unitPrices[bundleCategory].push(priceCents);
            }
        });

        unitPrices.keychain.sort((a, b) => b - a);
        unitPrices.sleeve.sort((a, b) => b - a);
        return unitPrices;
    }

    function getBestEverydayBundleCents(items) {
        const unitPrices = getEligibleBundleUnitPrices(items);
        const keychainPrices = unitPrices.keychain;
        const sleevePrices = unitPrices.sleeve;
        const keychainCount = keychainPrices.length;
        const sleeveCount = sleevePrices.length;

        if (keychainCount === 0 && sleeveCount === 0) {
            return {
                savingsCents: 0
            };
        }

        const regularEligibleSubtotalCents = [...keychainPrices, ...sleevePrices]
            .reduce((sum, priceCents) => sum + priceCents, 0);
        const memo = new Map();

        function solve(keychainIndex, sleeveIndex) {
            const stateKey = `${keychainIndex}:${sleeveIndex}`;
            if (memo.has(stateKey)) {
                return memo.get(stateKey);
            }

            if (keychainIndex >= keychainCount && sleeveIndex >= sleeveCount) {
                return 0;
            }

            let best = Number.POSITIVE_INFINITY;

            if (keychainIndex < keychainCount) {
                best = Math.min(best, keychainPrices[keychainIndex] + solve(keychainIndex + 1, sleeveIndex));
            }

            if (sleeveIndex < sleeveCount) {
                best = Math.min(best, sleevePrices[sleeveIndex] + solve(keychainIndex, sleeveIndex + 1));
            }

            EVERYDAY_BUNDLE_RULES.forEach((rule) => {
                const nextKeychainIndex = keychainIndex + rule.keychains;
                const nextSleeveIndex = sleeveIndex + rule.sleeves;
                if (nextKeychainIndex <= keychainCount && nextSleeveIndex <= sleeveCount) {
                    best = Math.min(best, rule.priceCents + solve(nextKeychainIndex, nextSleeveIndex));
                }
            });

            memo.set(stateKey, best);
            return best;
        }

        const bestBundleSubtotalCents = solve(0, 0);
        return {
            savingsCents: Math.max(regularEligibleSubtotalCents - bestBundleSubtotalCents, 0)
        };
    }

    function buildPricingSummary(items) {
        const regularSubtotalCents = getCartSubtotalCents(items);
        const bundlePricing = getBestEverydayBundleCents(items);
        const subtotal = centsToDollars(regularSubtotalCents - bundlePricing.savingsCents);
        const shippingCost = getShippingCost(getTotalWeightOz(items));
        const taxAmount = getTaxAmount(subtotal, shippingCost);

        return {
            subtotal,
            shippingCost,
            taxAmount,
            total: roundCurrency(subtotal + shippingCost + taxAmount)
        };
    }

    function emitCartUpdatedEvent(items, reason, changedKey = '') {
        try {
            globalScope.dispatchEvent(new CustomEvent('sidequest:cart-updated', {
                detail: {
                    reason,
                    changedKey,
                    totalCount: getTotalCount(items),
                    subtotal: getSubtotal(items),
                    items
                }
            }));
        } catch (error) {
            // Ignore event dispatch errors.
        }
    }

    function emitCartRejectedEvent(message, productId = '') {
        try {
            globalScope.dispatchEvent(new CustomEvent('sidequest:cart-add-rejected', {
                detail: {
                    message,
                    productId
                }
            }));
        } catch (error) {
            // Ignore event dispatch errors.
        }
    }

    function saveAndEmit(items, reason, changedKey = '') {
        writeCartItems(items);
        emitCartUpdatedEvent(items, reason, changedKey);
    }

    function buildCartResult(items, added, message = '') {
        return {
            items,
            added,
            message
        };
    }

    function getPromoRuleLimitMessage(rule) {
        const label = normalizeString(rule?.label) || 'Promo';
        const limit = getRuleLimitPerOrder(rule);
        const itemLabel = limit === 1 ? 'promo item' : 'promo items';
        return `${label} limit is ${limit} ${itemLabel} per order.`;
    }

    function getPromoRuleMinimumMessage(rule) {
        const label = normalizeString(rule?.label) || 'Promo';
        const minimumTotal = getRuleMinimumTotal(rule);
        const formattedMinimum = formatPrice(minimumTotal);
        return `${label} unlocks at cart total of ${formattedMinimum}.`;
    }

    function getPromoRuleUnavailableMessage(ruleId) {
        const label = promoRulesById.get(ruleId)?.label || 'Promo';
        return `${label} is not available right now.`;
    }

    function isPromoRuleVisible(ruleId) {
        if (!promosEnabled) {
            return false;
        }

        if (enabledPromoRuleIds === null) {
            return true;
        }

        return enabledPromoRuleIds.has(ruleId);
    }

    function getPromoRuleRemovedMessage() {
        return 'Promo removed because your cart no longer qualifies.';
    }

    function countPromoRuleItems(items, ruleId) {
        return items.reduce((sum, item) => {
            if (getItemPromoRuleId(item) !== ruleId) {
                return sum;
            }

            return sum + toValidQuantity(item?.quantity, 0);
        }, 0);
    }

    function getPromoEligibleTotal(rule, items) {
        const pricing = buildPricingSummary(items);
        const configuredIncludes = Array.isArray(rule?.minimum_total_includes)
            ? rule.minimum_total_includes
                .map((value) => normalizeString(value).toLowerCase())
                .filter(Boolean)
            : [];
        const includes = configuredIncludes.length > 0
            ? new Set(configuredIncludes)
            : new Set(['subtotal', 'shipping', 'tax']);

        let total = 0;
        if (includes.has('subtotal')) {
            total += pricing.subtotal;
        }
        if (includes.has('shipping')) {
            total += pricing.shippingCost;
        }
        if (includes.has('tax')) {
            total += pricing.taxAmount;
        }
        if (includes.has('total')) {
            total += pricing.total;
        }

        return roundCurrency(total);
    }

    function validatePromoAdd(item, quantityToAdd, currentItems) {
        const promoRuleId = getItemPromoRuleId(item);
        if (!promoRuleId) {
            return {
                allowed: true,
                message: ''
            };
        }

        if (!isPromoRuleVisible(promoRuleId)) {
            return {
                allowed: false,
                message: getPromoRuleUnavailableMessage(promoRuleId)
            };
        }

        const rule = promoRulesById.get(promoRuleId);
        if (!rule || rule.enabled === false) {
            return {
                allowed: false,
                message: getPromoRuleUnavailableMessage(promoRuleId)
            };
        }

        const limitPerOrder = getRuleLimitPerOrder(rule);
        if (limitPerOrder > 0 && countPromoRuleItems(currentItems, promoRuleId) + quantityToAdd > limitPerOrder) {
            return {
                allowed: false,
                message: getPromoRuleLimitMessage(rule)
            };
        }

        const minimumTotal = getRuleMinimumTotal(rule);
        if (minimumTotal > 0) {
            const nonPromoItems = currentItems.filter((cartItem) => !isPromoItem(cartItem));
            const eligibleTotal = getPromoEligibleTotal(rule, nonPromoItems);
            if (eligibleTotal + Number.EPSILON < minimumTotal) {
                return {
                    allowed: false,
                    message: getPromoRuleMinimumMessage(rule)
                };
            }
        }

        return {
            allowed: true,
            message: ''
        };
    }

    function validatePromoQuantityChange(item, nextQuantity, currentItems) {
        const promoRuleId = getItemPromoRuleId(item);
        const currentQuantity = toValidQuantity(item?.quantity, 0);
        if (!promoRuleId || nextQuantity <= currentQuantity) {
            return {
                allowed: true,
                message: ''
            };
        }

        if (!isPromoRuleVisible(promoRuleId)) {
            return {
                allowed: false,
                message: getPromoRuleUnavailableMessage(promoRuleId)
            };
        }

        const rule = promoRulesById.get(promoRuleId);
        if (!rule || rule.enabled === false) {
            return {
                allowed: false,
                message: getPromoRuleUnavailableMessage(promoRuleId)
            };
        }

        const limitPerOrder = getRuleLimitPerOrder(rule);
        const currentRuleCount = countPromoRuleItems(currentItems, promoRuleId);
        const nextRuleCount = currentRuleCount - currentQuantity + nextQuantity;
        if (limitPerOrder > 0 && nextRuleCount > limitPerOrder) {
            return {
                allowed: false,
                message: getPromoRuleLimitMessage(rule)
            };
        }

        const minimumTotal = getRuleMinimumTotal(rule);
        if (minimumTotal > 0) {
            const nonPromoItems = currentItems.filter((cartItem) => !isPromoItem(cartItem));
            const eligibleTotal = getPromoEligibleTotal(rule, nonPromoItems);
            if (eligibleTotal + Number.EPSILON < minimumTotal) {
                return {
                    allowed: false,
                    message: getPromoRuleMinimumMessage(rule)
                };
            }
        }

        return {
            allowed: true,
            message: ''
        };
    }

    function pruneInvalidPromoItems(items) {
        const safeItems = Array.isArray(items) ? items : [];
        const nonPromoItems = safeItems.filter((item) => !isPromoItem(item));
        const keptPromoCountByRule = new Map();
        const removedPromoItems = [];

        const validItems = safeItems.filter((item) => {
            const promoRuleId = getItemPromoRuleId(item);
            if (!promoRuleId) {
                return true;
            }

            if (!isPromoRuleVisible(promoRuleId)) {
                removedPromoItems.push(item);
                return false;
            }

            const rule = promoRulesById.get(promoRuleId);
            if (!rule || rule.enabled === false) {
                removedPromoItems.push(item);
                return false;
            }

            const minimumTotal = getRuleMinimumTotal(rule);
            if (minimumTotal > 0) {
                const eligibleTotal = getPromoEligibleTotal(rule, nonPromoItems);
                if (eligibleTotal + Number.EPSILON < minimumTotal) {
                    removedPromoItems.push(item);
                    return false;
                }
            }

            const limitPerOrder = getRuleLimitPerOrder(rule);
            if (limitPerOrder > 0) {
                const existingRuleCount = keptPromoCountByRule.get(promoRuleId) || 0;
                const itemQuantity = toValidQuantity(item?.quantity, 0);
                if (existingRuleCount + itemQuantity > limitPerOrder) {
                    removedPromoItems.push(item);
                    return false;
                }
                keptPromoCountByRule.set(promoRuleId, existingRuleCount + itemQuantity);
            }

            return true;
        });

        return {
            items: validItems,
            removedPromoItems
        };
    }

    function saveAndReportPrunedPromos(items, reason, changedKey = '') {
        if (!metadataLoaded) {
            saveAndEmit(items, reason, changedKey);
            return items;
        }

        const prunedCart = pruneInvalidPromoItems(items);
        saveAndEmit(prunedCart.items, prunedCart.removedPromoItems.length > 0 ? 'promo-removed' : reason, changedKey);

        if (prunedCart.removedPromoItems.length > 0) {
            emitCartRejectedEvent(getPromoRuleRemovedMessage(), prunedCart.removedPromoItems[0]?.productId || '');
        }

        return prunedCart.items;
    }

    async function ensureValidPromos() {
        await metadataReady;
        const items = readCartItems();
        const prunedCart = pruneInvalidPromoItems(items);

        if (prunedCart.removedPromoItems.length > 0) {
            saveAndEmit(prunedCart.items, 'promo-removed', prunedCart.removedPromoItems[0]?.key || '');
            emitCartRejectedEvent(getPromoRuleRemovedMessage(), prunedCart.removedPromoItems[0]?.productId || '');
        }

        return prunedCart.items;
    }

    function mergeExistingItem(existingItem, item) {
        if (!existingItem.name && item.name) {
            existingItem.name = item.name;
        }
        if (!existingItem.image && item.image) {
            existingItem.image = item.image;
        }
        if (!existingItem.color && item.color) {
            existingItem.color = item.color;
        }
        if (!existingItem.style && item.style) {
            existingItem.style = item.style;
        }
        if (!existingItem.selectedBaseProductId && item.selectedBaseProductId) {
            existingItem.selectedBaseProductId = item.selectedBaseProductId;
        }
        if (!existingItem.category && item.category) {
            existingItem.category = item.category;
        }
        if (!existingItem.promoRule && item.promoRule) {
            existingItem.promoRule = item.promoRule;
        }
        if (toValidNumber(existingItem.price) === null && toValidNumber(item.price) !== null) {
            existingItem.price = toValidNumber(item.price);
        }
    }

    async function addItem(rawItem, quantityToAdd = 1) {
        const item = normalizeItem(rawItem);
        const increment = toValidQuantity(quantityToAdd, 1);

        if (!item || increment <= 0) {
            return buildCartResult(getItems(), false);
        }

        await metadataReady;

        const items = readCartItems();
        const promoValidation = validatePromoAdd(item, increment, items);
        if (!promoValidation.allowed) {
            emitCartRejectedEvent(promoValidation.message, item.productId);
            return buildCartResult(items, false, promoValidation.message);
        }

        const existingIndex = items.findIndex((entry) => entry.key === item.key);

        if (existingIndex >= 0) {
            items[existingIndex].quantity += increment;
            mergeExistingItem(items[existingIndex], item);
        } else {
            item.quantity = increment;
            items.push(item);
        }

        saveAndEmit(items, 'add', item.key);
        return buildCartResult(items, true);
    }

    function updateQuantity(itemKey, nextQuantity) {
        const safeKey = normalizeString(itemKey);
        if (!safeKey) {
            return getItems();
        }

        const quantity = toValidQuantity(nextQuantity, 0);
        const items = readCartItems();
        const index = items.findIndex((item) => item.key === safeKey);
        if (index === -1) {
            return items;
        }

        const promoValidation = metadataLoaded
            ? validatePromoQuantityChange(items[index], quantity, items)
            : { allowed: true, message: '' };
        if (!promoValidation.allowed) {
            emitCartRejectedEvent(promoValidation.message, items[index].productId);
            return items;
        }

        if (quantity <= 0) {
            items.splice(index, 1);
            return saveAndReportPrunedPromos(items, 'remove', safeKey);
        }

        items[index].quantity = quantity;
        return saveAndReportPrunedPromos(items, 'quantity', safeKey);
    }

    function removeItem(itemKey) {
        return updateQuantity(itemKey, 0);
    }

    function clearCart() {
        const empty = [];
        saveAndEmit(empty, 'clear', '');
        return empty;
    }

    globalScope.SidequestCart = {
        getItems,
        getTotalCount,
        getSubtotal,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
        ensureValidPromos,
        formatPrice
    };
})(window);
