(function initializeCartDrawer(globalScope) {
    const cart = globalScope.SidequestCart;
    const analytics = globalScope.SidequestAnalytics || null;
    if (!cart) {
        return;
    }
    const PRODUCTS_JSON_PATH = 'product%20json/products.json';
    const SHIPPING_SETTINGS_PATH = 'product%20json/shipping-settings.json';
    const TALLY_CHECKOUT_URL = 'https://tally.so/r/GxJkoQ';
    const DEFAULT_MAILER_WEIGHT_OZ = 0.25;
    const TAX_RATE = 0.07;
    const DEFAULT_SHIPPING_TIERS = [
        { maxWeightOz: 4, cost: 5.95 },
        { maxWeightOz: 8, cost: 6.95 },
        { maxWeightOz: 12, cost: 7.49 },
        { maxWeightOz: 15, cost: 8.49 },
        { maxWeightOz: 16, cost: 9.95 },
        { maxWeightOz: 32, cost: 11.95 }
    ];
    const DEFAULT_HEAVY_SHIPPING_COST = 15.75;

    const headerCartButtons = Array.from(document.querySelectorAll('.header-cart-button'));
    if (headerCartButtons.length === 0) {
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'cart-drawer-overlay';
    overlay.hidden = true;

    const drawer = document.createElement('aside');
    drawer.className = 'cart-drawer';
    drawer.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('aria-label', 'Cart drawer');

    drawer.innerHTML = `
        <div class="cart-drawer-header">
            <div class="cart-drawer-title-row">
                <h2>Cart</h2>
                <span class="cart-drawer-count">(0)</span>
            </div>
            <button class="cart-drawer-close" type="button" aria-label="Close cart drawer">&times;</button>
        </div>
        <div class="cart-drawer-body"></div>
        <div class="cart-drawer-footer">
            <p class="cart-bundle-message" hidden></p>
            <p class="cart-subtotal">Subtotal: $0.00</p>
            <p class="cart-shipping">Shipping: $0.00</p>
            <p class="cart-tax">Tax: $0.00</p>
            <p class="cart-total">Total: $0.00</p>
            <div class="cart-footer-actions">
                <button class="cart-footer-button cart-checkout-button" type="button">Checkout</button>
                <button class="cart-footer-button cart-continue-button" type="button">Continue Shopping</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    const drawerBody = drawer.querySelector('.cart-drawer-body');
    const countElement = drawer.querySelector('.cart-drawer-count');
    const bundleMessageElement = drawer.querySelector('.cart-bundle-message');
    const subtotalElement = drawer.querySelector('.cart-subtotal');
    const shippingElement = drawer.querySelector('.cart-shipping');
    const taxElement = drawer.querySelector('.cart-tax');
    const totalElement = drawer.querySelector('.cart-total');
    const closeButton = drawer.querySelector('.cart-drawer-close');
    const continueButton = drawer.querySelector('.cart-continue-button');
    const checkoutButton = drawer.querySelector('.cart-checkout-button');
    const productWeightById = new Map();
    const productNameById = new Map();
    const selectedModelNameById = new Map();
    const productCategoryById = new Map();
    let mailerWeightOz = DEFAULT_MAILER_WEIGHT_OZ;
    let shippingTiers = [...DEFAULT_SHIPPING_TIERS];
    let heavyShippingCost = DEFAULT_HEAVY_SHIPPING_COST;

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

    function normalizeCategoryValue(value) {
        if (typeof value !== 'string') {
            return '';
        }

        return value
            .trim()
            .toLowerCase()
            .replace(/[-_]+/g, ' ')
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeShippingTiers(value) {
        if (!Array.isArray(value)) {
            return null;
        }

        const normalized = value
            .map((tier) => {
                const maxWeightOz = toValidNumber(tier?.max_weight_oz ?? tier?.maxWeightOz);
                const cost = toValidNumber(tier?.cost);
                if (typeof maxWeightOz !== 'number' || maxWeightOz <= 0 || typeof cost !== 'number' || cost < 0) {
                    return null;
                }

                return { maxWeightOz, cost };
            })
            .filter(Boolean)
            .sort((a, b) => a.maxWeightOz - b.maxWeightOz);

        return normalized.length > 0 ? normalized : null;
    }

    function detectColorLabelFromId(idValue) {
        const normalizedId = String(idValue || '').toLowerCase();
        const tokenToLabelMap = [
            ['lightblue', 'Light Blue'],
            ['darkblue', 'Dark Blue'],
            ['blue', 'Blue'],
            ['red', 'Red'],
            ['orange', 'Orange'],
            ['yellow', 'Yellow'],
            ['green', 'Green'],
            ['purple', 'Purple'],
            ['pink', 'Pink'],
            ['teal', 'Teal'],
            ['brown', 'Brown'],
            ['black', 'Black'],
            ['white', 'White'],
            ['gray', 'Gray'],
            ['grey', 'Grey'],
            ['gold', 'Gold'],
            ['silver', 'Silver']
        ];

        const match = tokenToLabelMap.find(([token]) => normalizedId.includes(token));
        return match ? match[1] : '';
    }

    function normalizeSwatchColors(colorsValue) {
        if (!Array.isArray(colorsValue)) {
            return [];
        }

        return colorsValue
            .filter((color) => typeof color === 'string' && color.trim() !== '')
            .map((color) => color.trim());
    }

    function getSwatchLabel(rawEntry, fallbackId) {
        const explicitLabel = typeof rawEntry?.swatch_label === 'string'
            ? rawEntry.swatch_label.trim()
            : typeof rawEntry?.swatchLabel === 'string'
                ? rawEntry.swatchLabel.trim()
                : '';
        const explicitColors = normalizeSwatchColors(rawEntry?.swatch_colors ?? rawEntry?.swatchColors);

        if (explicitLabel) {
            return explicitLabel;
        }

        if (explicitColors.length > 0) {
            return explicitColors.join(' / ');
        }

        return detectColorLabelFromId(fallbackId);
    }

    function getBaseProductIdFromSelectionId(selectionId) {
        if (typeof selectionId !== 'string') {
            return '';
        }

        const trimmed = selectionId.trim();
        if (!trimmed) {
            return '';
        }

        const separatorIndex = trimmed.indexOf('::');
        return separatorIndex >= 0 ? trimmed.slice(0, separatorIndex) : trimmed;
    }

    async function loadProductMetadata() {
        try {
            const response = await fetch(PRODUCTS_JSON_PATH, { cache: 'no-store' });
            if (!response.ok) {
                return;
            }

            const payload = await response.json();
            if (!Array.isArray(payload)) {
                return;
            }

            payload.forEach((entry) => {
                const productId = typeof entry?.id === 'string' ? entry.id.trim() : '';
                if (!productId) {
                    return;
                }

                const productName = typeof entry?.name === 'string' ? entry.name.trim() : '';
                if (productName) {
                    productNameById.set(productId, productName);
                    const baseColorLabel = getSwatchLabel(entry, productId);
                    const baseModelLabel = baseColorLabel
                        ? `${productName} - ${baseColorLabel}`
                        : productName;
                    selectedModelNameById.set(productId, baseModelLabel);
                }

                const weightOz = toValidNumber(entry?.weight_oz);
                if (typeof weightOz === 'number' && weightOz >= 0) {
                    productWeightById.set(productId, weightOz);
                }

                const category = normalizeCategoryValue(entry?.category);
                if (category) {
                    productCategoryById.set(productId, category);
                }

                const variants = Array.isArray(entry?.variants) ? entry.variants : [];
                variants.forEach((variant, index) => {
                    const safeVariant = typeof variant === 'object' && variant !== null ? variant : {};
                    const variantId = typeof safeVariant?.id === 'string' && safeVariant.id.trim() !== ''
                        ? safeVariant.id.trim()
                        : `${productId}-variant-${index + 1}`;
                    const colorLabel = getSwatchLabel(safeVariant, variantId);
                    const variantLabel = colorLabel
                        ? `${productName} - ${colorLabel}`
                        : `${productName} ${index + 2}`;
                    selectedModelNameById.set(`${productId}::${variantId}`, variantLabel);
                });
            });
        } catch (error) {
            // Keep cart usable even if product metadata fails to load.
        }
    }

    async function loadShippingSettings() {
        try {
            const response = await fetch(SHIPPING_SETTINGS_PATH, { cache: 'no-store' });
            if (!response.ok) {
                return;
            }

            const settings = await response.json();
            const nextMailerWeightOz = toValidNumber(settings?.mailer_weight_oz ?? settings?.mailerWeightOz);
            const nextShippingTiers = normalizeShippingTiers(settings?.tiers);
            const nextHeavyShippingCost = toValidNumber(settings?.heavy_shipping_cost ?? settings?.heavyShippingCost);

            if (typeof nextMailerWeightOz === 'number' && nextMailerWeightOz >= 0) {
                mailerWeightOz = nextMailerWeightOz;
            }

            if (nextShippingTiers) {
                shippingTiers = nextShippingTiers;
            }

            if (typeof nextHeavyShippingCost === 'number' && nextHeavyShippingCost >= 0) {
                heavyShippingCost = nextHeavyShippingCost;
            }
        } catch (error) {
            // Keep default shipping values if settings cannot be loaded.
        }
    }

    Promise.allSettled([
        loadProductMetadata(),
        loadShippingSettings()
    ]);

    function getItemWeightOz(item) {
        const promoRule = typeof item?.promoRule === 'string' ? item.promoRule.trim() : '';
        const selectedBaseProductId = typeof item?.selectedBaseProductId === 'string'
            ? item.selectedBaseProductId.trim()
            : '';
        if (promoRule === 'spend_12' && selectedBaseProductId) {
            const resolvedProductId = getBaseProductIdFromSelectionId(selectedBaseProductId);
            return productWeightById.get(resolvedProductId) || 0;
        }

        const productId = typeof item?.productId === 'string' ? item.productId.trim() : '';
        if (!productId) {
            return 0;
        }
        return productWeightById.get(productId) || 0;
    }

    function getSelectedModelName(item) {
        const selectedBaseProductId = typeof item?.selectedBaseProductId === 'string'
            ? item.selectedBaseProductId.trim()
            : '';
        if (!selectedBaseProductId) {
            return '';
        }

        const labelFromSelection = selectedModelNameById.get(selectedBaseProductId);
        if (labelFromSelection) {
            return labelFromSelection;
        }

        const resolvedProductId = getBaseProductIdFromSelectionId(selectedBaseProductId);
        return productNameById.get(resolvedProductId) || '';
    }

    function getTotalWeightOz(items) {
        if (!Array.isArray(items) || items.length === 0) {
            return 0;
        }

        const itemsWeight = items.reduce((sum, item) => {
            const quantity = Number.parseInt(String(item?.quantity ?? 0), 10);
            const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
            return sum + (getItemWeightOz(item) * safeQuantity);
        }, 0);

        return itemsWeight + mailerWeightOz;
    }

    function getShippingCost(weightOz) {
        if (weightOz <= 0) {
            return 0;
        }

        for (const tier of shippingTiers) {
            if (weightOz <= tier.maxWeightOz) {
                return tier.cost;
            }
        }

        return heavyShippingCost;
    }

    function getRoundedShippingWeightOz(weightOz) {
        if (weightOz <= 0) {
            return 0;
        }
        return Math.ceil(weightOz);
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

    function formatBundleRulePrice(priceCents) {
        if (priceCents % 100 === 0) {
            return `$${priceCents / 100}`;
        }

        return cart.formatPrice(centsToDollars(priceCents));
    }

    function getBundleRuleName(rule) {
        const price = formatBundleRulePrice(rule.priceCents);
        if (rule.keychains > 0 && rule.sleeves > 0) {
            return `mix and match for ${price}`;
        }

        const itemCount = Math.max(rule.keychains, rule.sleeves);
        return `${itemCount} for ${price} bundle`;
    }

    function getBundleMessageLines(bundleNames) {
        const countsByName = new Map();

        bundleNames.forEach((name) => {
            countsByName.set(name, (countsByName.get(name) || 0) + 1);
        });

        return Array.from(countsByName.entries())
            .map(([name, count]) => (count > 1 ? `${count}x ${name}` : name));
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

            const quantity = Number.parseInt(String(item?.quantity ?? 0), 10);
            const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
            return sum + (priceCents * safeQuantity);
        }, 0);
    }

    function getBundleCategoryForItem(item) {
        const productId = typeof item?.productId === 'string' ? item.productId.trim() : '';
        const category = productId ? productCategoryById.get(productId) || '' : '';
        if (!category || category.includes('promo') || category.includes('custom')) {
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

            const quantity = Number.parseInt(String(item?.quantity ?? 0), 10);
            const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
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
                bundleSubtotalCents: 0,
                regularEligibleSubtotalCents: 0,
                savingsCents: 0,
                bundleCount: 0,
                bundleNames: []
            };
        }

        const regularEligibleSubtotalCents = [...keychainPrices, ...sleevePrices]
            .reduce((sum, priceCents) => sum + priceCents, 0);
        const memo = new Map();

        function chooseBetterPricing(currentBest, candidate) {
            if (!currentBest || candidate.costCents < currentBest.costCents) {
                return candidate;
            }

            if (candidate.costCents === currentBest.costCents && candidate.bundleCount > currentBest.bundleCount) {
                return candidate;
            }

            return currentBest;
        }

        function solve(keychainIndex, sleeveIndex) {
            const stateKey = `${keychainIndex}:${sleeveIndex}`;
            if (memo.has(stateKey)) {
                return memo.get(stateKey);
            }

            if (keychainIndex >= keychainCount && sleeveIndex >= sleeveCount) {
                return {
                    costCents: 0,
                    bundleCount: 0,
                    bundleNames: []
                };
            }

            let best = null;

            if (keychainIndex < keychainCount) {
                const nextPricing = solve(keychainIndex + 1, sleeveIndex);
                best = chooseBetterPricing(best, {
                    costCents: keychainPrices[keychainIndex] + nextPricing.costCents,
                    bundleCount: nextPricing.bundleCount,
                    bundleNames: nextPricing.bundleNames
                });
            }

            if (sleeveIndex < sleeveCount) {
                const nextPricing = solve(keychainIndex, sleeveIndex + 1);
                best = chooseBetterPricing(best, {
                    costCents: sleevePrices[sleeveIndex] + nextPricing.costCents,
                    bundleCount: nextPricing.bundleCount,
                    bundleNames: nextPricing.bundleNames
                });
            }

            EVERYDAY_BUNDLE_RULES.forEach((rule) => {
                const nextKeychainIndex = keychainIndex + rule.keychains;
                const nextSleeveIndex = sleeveIndex + rule.sleeves;
                if (nextKeychainIndex <= keychainCount && nextSleeveIndex <= sleeveCount) {
                    const nextPricing = solve(nextKeychainIndex, nextSleeveIndex);
                    best = chooseBetterPricing(best, {
                        costCents: rule.priceCents + nextPricing.costCents,
                        bundleCount: nextPricing.bundleCount + 1,
                        bundleNames: [getBundleRuleName(rule), ...nextPricing.bundleNames]
                    });
                }
            });

            memo.set(stateKey, best);
            return best;
        }

        const bestBundlePricing = solve(0, 0);
        const hasBundleSavings = bestBundlePricing.costCents < regularEligibleSubtotalCents;
        const bundleSubtotalCents = hasBundleSavings ? bestBundlePricing.costCents : regularEligibleSubtotalCents;

        return {
            bundleSubtotalCents,
            regularEligibleSubtotalCents,
            savingsCents: Math.max(regularEligibleSubtotalCents - bundleSubtotalCents, 0),
            bundleCount: hasBundleSavings ? bestBundlePricing.bundleCount : 0,
            bundleNames: hasBundleSavings ? bestBundlePricing.bundleNames : []
        };
    }

    function getBundledSubtotalCents(items) {
        const regularSubtotalCents = getCartSubtotalCents(items);
        const bundlePricing = getBestEverydayBundleCents(items);

        return {
            regularSubtotalCents,
            subtotalCents: regularSubtotalCents - bundlePricing.savingsCents,
            bundleSavingsCents: bundlePricing.savingsCents,
            bundleCount: bundlePricing.bundleCount,
            bundleNames: bundlePricing.bundleNames
        };
    }

    function getTaxAmount(subtotal, shippingCost) {
        const taxableAmount = subtotal + shippingCost;
        if (taxableAmount <= 0 || TAX_RATE <= 0) {
            return 0;
        }
        return roundCurrency(taxableAmount * TAX_RATE);
    }

    function buildPricingSummary(items) {
        const bundledSubtotal = getBundledSubtotalCents(items);
        const subtotal = centsToDollars(bundledSubtotal.subtotalCents);
        const bundleSavings = centsToDollars(bundledSubtotal.bundleSavingsCents);
        const regularSubtotal = centsToDollars(bundledSubtotal.regularSubtotalCents);
        const totalWeightOz = getTotalWeightOz(items);
        const roundedShippingWeightOz = getRoundedShippingWeightOz(totalWeightOz);
        const shippingCost = getShippingCost(roundedShippingWeightOz);
        const taxAmount = getTaxAmount(subtotal, shippingCost);
        const total = roundCurrency(subtotal + shippingCost + taxAmount);

        return {
            regularSubtotal,
            subtotal,
            bundleSavings,
            bundleCount: bundledSubtotal.bundleCount,
            bundleNames: bundledSubtotal.bundleNames,
            shippingCost,
            taxAmount,
            total
        };
    }

    function buildItemsSummary(items) {
        if (!Array.isArray(items) || items.length === 0) {
            return '';
        }

        const lines = items
            .map((item) => {
                const quantity = Number.parseInt(String(item?.quantity ?? 0), 10);
                const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
                const name = typeof item?.name === 'string' && item.name.trim() !== ''
                    ? item.name.trim()
                    : 'Untitled Product';
                const promoRule = typeof item?.promoRule === 'string' ? item.promoRule.trim() : '';
                const modelName = promoRule === 'spend_12' ? getSelectedModelName(item) : '';
                const displayName = modelName ? `${name} (Model: ${modelName})` : name;
                return `${safeQuantity} x ${displayName}`;
            })
            .filter(Boolean);

        return `\n${lines.join('\n')}`;
    }

    function generateOrderId() {
        const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
        const uuid = globalScope.crypto && typeof globalScope.crypto.randomUUID === 'function'
            ? globalScope.crypto.randomUUID().replace(/-/g, '')
            : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`.toLowerCase();
        return `SQ-${timestamp}-${uuid.slice(0, 12).toUpperCase()}`;
    }

    function buildTallyCheckoutUrl(items) {
        const pricing = buildPricingSummary(items);
        const totalFormatted = cart.formatPrice(pricing.total);
        // Ensure total_raw is a plain number string, rounded to 2 decimals, no $ or commas
        const totalRaw = pricing.total.toFixed(2);
        const params = new URLSearchParams({
            order_id: generateOrderId(),
            items_summary: buildItemsSummary(items),
            subtotal: cart.formatPrice(pricing.subtotal),
            bundle_savings: cart.formatPrice(pricing.bundleSavings),
            shipping: cart.formatPrice(pricing.shippingCost),
            tax: cart.formatPrice(pricing.taxAmount),
            total: totalFormatted,
            total_raw: totalRaw
        });

        return `${TALLY_CHECKOUT_URL}?${params.toString()}`;
    }

    function getUniqueCheckoutProductIds(items) {
        if (!Array.isArray(items)) {
            return [];
        }

        return [...new Set(
            items
                .map((item) => (typeof item?.productId === 'string' ? item.productId.trim() : ''))
                .filter(Boolean)
        )];
    }

    async function trackCheckoutForCartItems(items) {
        if (!analytics || typeof analytics.trackCheckout !== 'function') {
            return;
        }

        const productIds = getUniqueCheckoutProductIds(items);
        if (productIds.length === 0) {
            return;
        }

        const trackingRequests = Promise.allSettled(
            productIds.map((productId) => analytics.trackCheckout(productId))
        );

        await Promise.race([
            trackingRequests,
            new Promise((resolve) => {
                setTimeout(resolve, 450);
            })
        ]);
    }

    function createQuantityControl(item) {
        const control = document.createElement('div');
        control.className = 'quantity-pill cart-quantity-pill';

        const minusButton = document.createElement('button');
        minusButton.type = 'button';
        minusButton.className = 'qty-button';
        minusButton.setAttribute('aria-label', `Decrease quantity for ${item.name || 'item'}`);
        minusButton.textContent = '-';

        const value = document.createElement('span');
        value.className = 'qty-value';
        value.textContent = String(item.quantity);

        const plusButton = document.createElement('button');
        plusButton.type = 'button';
        plusButton.className = 'qty-button';
        plusButton.setAttribute('aria-label', `Increase quantity for ${item.name || 'item'}`);
        plusButton.textContent = '+';

        minusButton.addEventListener('click', () => {
            cart.updateQuantity(item.key, item.quantity - 1);
        });

        plusButton.addEventListener('click', () => {
            cart.updateQuantity(item.key, item.quantity + 1);
        });

        control.appendChild(minusButton);
        control.appendChild(value);
        control.appendChild(plusButton);

        return control;
    }

    function getThumbnailImagePath(imagePath) {
        if (typeof imagePath !== 'string') {
            return '';
        }

        const trimmedPath = imagePath.trim();
        if (!trimmedPath) {
            return '';
        }

        const extensionMatch = trimmedPath.match(/(\.[^./?#]+)([?#].*)?$/);
        if (!extensionMatch) {
            return `${trimmedPath}-thumb`;
        }

        const extensionStart = extensionMatch.index;
        const extension = extensionMatch[1];
        const suffix = extensionMatch[2] || '';
        return `${trimmedPath.slice(0, extensionStart)}-thumb${extension}${suffix}`;
    }

    function createItemMedia(item) {
        if (item.image) {
            const image = document.createElement('img');
            image.className = 'cart-item-thumb';
            const fallbackImagePath = item.image;
            image.src = getThumbnailImagePath(item.image) || item.image;
            image.alt = item.name || 'Cart item';
            image.loading = 'lazy';
            let fallbackAttempted = false;
            image.addEventListener('error', () => {
                if (!fallbackAttempted && fallbackImagePath) {
                    fallbackAttempted = true;
                    image.src = fallbackImagePath;
                    return;
                }
                image.replaceWith(createItemMedia({ ...item, image: '' }));
            });
            return image;
        }

        const placeholder = document.createElement('div');
        placeholder.className = 'cart-item-thumb cart-item-thumb-placeholder';
        placeholder.textContent = 'Image';
        return placeholder;
    }

    function renderEmptyState() {
        drawerBody.innerHTML = '';

        const emptyState = document.createElement('div');
        emptyState.className = 'cart-empty-state';

        const headline = document.createElement('p');
        headline.className = 'cart-empty-headline';
        headline.textContent = 'Your cart is empty.';

        const subline = document.createElement('p');
        subline.className = 'cart-empty-subline';
        subline.textContent = 'Add something to get started.';

        emptyState.appendChild(headline);
        emptyState.appendChild(subline);
        drawerBody.appendChild(emptyState);
    }

    function renderCartItems(items) {
        drawerBody.innerHTML = '';

        items.forEach((item) => {
            const row = document.createElement('article');
            row.className = 'cart-item';

            const mediaWrap = document.createElement('div');
            mediaWrap.className = 'cart-item-media';
            mediaWrap.appendChild(createItemMedia(item));

            const info = document.createElement('div');
            info.className = 'cart-item-info';

            const name = document.createElement('p');
            name.className = 'cart-item-name';
            name.textContent = item.name || 'Untitled Product';

            info.appendChild(name);

            const promoRule = typeof item?.promoRule === 'string' ? item.promoRule.trim() : '';
            const modelName = promoRule === 'spend_12' ? getSelectedModelName(item) : '';

            if (modelName) {
                const model = document.createElement('p');
                model.className = 'cart-item-color';
                model.textContent = `Model: ${modelName}`;
                info.appendChild(model);
            } else if (item.color) {
                const color = document.createElement('p');
                color.className = 'cart-item-color';
                color.textContent = `Color: ${item.color}`;
                info.appendChild(color);
            } else if (item.style) {
                const style = document.createElement('p');
                style.className = 'cart-item-color';
                style.textContent = `Style: ${item.style}`;
                info.appendChild(style);
            }

            if (typeof item.price === 'number' && Number.isFinite(item.price)) {
                const price = document.createElement('p');
                price.className = 'cart-item-price';
                price.textContent = cart.formatPrice(item.price);
                info.appendChild(price);
            }

            const controls = document.createElement('div');
            controls.className = 'cart-item-controls';

            const quantityControl = createQuantityControl(item);

            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'cart-item-remove';
            removeButton.textContent = 'Remove';
            removeButton.addEventListener('click', () => {
                cart.removeItem(item.key);
            });

            controls.appendChild(quantityControl);
            controls.appendChild(removeButton);
            info.appendChild(controls);

            row.appendChild(mediaWrap);
            row.appendChild(info);
            drawerBody.appendChild(row);
        });
    }

    function renderSubtotal(pricing) {
        subtotalElement.replaceChildren();

        const label = document.createElement('span');
        label.className = 'cart-subtotal-label';
        label.textContent = 'Subtotal:';
        subtotalElement.appendChild(label);

        if (pricing.bundleSavings > 0 && pricing.regularSubtotal > pricing.subtotal) {
            const original = document.createElement('span');
            original.className = 'cart-subtotal-original';
            original.textContent = cart.formatPrice(pricing.regularSubtotal);

            const current = document.createElement('span');
            current.className = 'cart-subtotal-current';
            current.textContent = cart.formatPrice(pricing.subtotal);

            subtotalElement.append(original, current);
            return;
        }

        const current = document.createElement('span');
        current.className = 'cart-subtotal-current';
        current.textContent = cart.formatPrice(pricing.subtotal);
        subtotalElement.appendChild(current);
    }

    function renderBundleMessage(pricing) {
        if (!bundleMessageElement) {
            return;
        }

        const bundleCount = Number.isFinite(pricing.bundleCount) ? pricing.bundleCount : 0;
        const hasBundleSavings = pricing.bundleSavings > 0 && bundleCount > 0;
        bundleMessageElement.hidden = !hasBundleSavings;
        bundleMessageElement.replaceChildren();

        if (!hasBundleSavings) {
            return;
        }

        const bundleNames = Array.isArray(pricing.bundleNames) ? pricing.bundleNames : [];
        const bundleMessageLines = getBundleMessageLines(bundleNames);
        const linesToRender = bundleMessageLines.length > 0 ? bundleMessageLines : [`${bundleCount} bundle`];

        linesToRender.forEach((bundleName) => {
            const line = document.createElement('span');
            line.className = 'cart-bundle-message-line';
            line.textContent = `${bundleName} applied successfully`;
            bundleMessageElement.appendChild(line);
        });
    }

    function renderCart() {
        const items = cart.getItems();
        const totalCount = cart.getTotalCount(items);
        const pricing = buildPricingSummary(items);

        countElement.textContent = `(${totalCount})`;
        renderBundleMessage(pricing);
        renderSubtotal(pricing);
        shippingElement.textContent = `Shipping: ${cart.formatPrice(pricing.shippingCost)}`;
        taxElement.textContent = `Tax: ${cart.formatPrice(pricing.taxAmount)}`;
        totalElement.textContent = `Total: ${cart.formatPrice(pricing.total)}`;
        checkoutButton.disabled = totalCount === 0;

        if (items.length === 0) {
            renderEmptyState();
            return;
        }

        renderCartItems(items);
    }

    function openDrawer() {
        renderCart();
        document.body.classList.add('cart-drawer-open');
        drawer.setAttribute('aria-hidden', 'false');
        overlay.hidden = false;
    }

    function closeDrawer() {
        document.body.classList.remove('cart-drawer-open');
        drawer.setAttribute('aria-hidden', 'true');
        overlay.hidden = true;
    }

    headerCartButtons.forEach((button) => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            openDrawer();
        });
    });

    overlay.addEventListener('click', closeDrawer);
    closeButton.addEventListener('click', closeDrawer);
    continueButton.addEventListener('click', closeDrawer);
    checkoutButton.addEventListener('click', async () => {
        const items = typeof cart.ensureValidPromos === 'function'
            ? await cart.ensureValidPromos()
            : cart.getItems();
        if (items.length === 0) {
            renderCart();
            return;
        }

        try {
            await trackCheckoutForCartItems(items);
        } catch (error) {
            // Continue to checkout even if tracking fails.
        }

        const checkoutUrl = buildTallyCheckoutUrl(items);
        globalScope.location.href = checkoutUrl;
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && document.body.classList.contains('cart-drawer-open')) {
            closeDrawer();
        }
    });

    globalScope.addEventListener('sidequest:cart-updated', () => {
        if (document.body.classList.contains('cart-drawer-open')) {
            renderCart();
        }
    });
    globalScope.addEventListener('sidequest:open-cart-drawer', () => {
        openDrawer();
    });

    loadProductMetadata().then(() => {
        if (document.body.classList.contains('cart-drawer-open')) {
            renderCart();
        }
    });
})(window);
