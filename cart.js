(function initializeSidequestCart(globalScope) {
    const STORAGE_KEY = 'sidequest-cart-v1';

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

    function buildItemKey(productId, variantId) {
        const safeProductId = normalizeString(productId);
        const safeVariantId = normalizeString(variantId);
        return `${safeProductId}::${safeVariantId || 'base'}`;
    }

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

    function saveAndEmit(items, reason, changedKey = '') {
        writeCartItems(items);
        emitCartUpdatedEvent(items, reason, changedKey);
    }

    function addItem(rawItem, quantityToAdd = 1) {
        const item = normalizeItem(rawItem);
        const increment = toValidQuantity(quantityToAdd, 1);

        if (!item || increment <= 0) {
            return getItems();
        }

        const items = readCartItems();
        const existingIndex = items.findIndex((entry) => entry.key === item.key);

        if (existingIndex >= 0) {
            items[existingIndex].quantity += increment;
            if (!items[existingIndex].name && item.name) {
                items[existingIndex].name = item.name;
            }
            if (!items[existingIndex].image && item.image) {
                items[existingIndex].image = item.image;
            }
            if (!items[existingIndex].color && item.color) {
                items[existingIndex].color = item.color;
            }
            if (toValidNumber(items[existingIndex].price) === null && toValidNumber(item.price) !== null) {
                items[existingIndex].price = toValidNumber(item.price);
            }
        } else {
            item.quantity = increment;
            items.push(item);
        }

        saveAndEmit(items, 'add', item.key);
        return items;
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

        if (quantity <= 0) {
            items.splice(index, 1);
            saveAndEmit(items, 'remove', safeKey);
            return items;
        }

        items[index].quantity = quantity;
        saveAndEmit(items, 'quantity', safeKey);
        return items;
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
        formatPrice(value) {
            const numeric = toValidNumber(value);
            return numeric === null ? '' : `$${numeric.toFixed(2)}`;
        }
    };
})(window);
