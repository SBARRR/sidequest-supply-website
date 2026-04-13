(function initializeCartDrawer(globalScope) {
    const cart = globalScope.SidequestCart;
    const analytics = globalScope.SidequestAnalytics || null;
    if (!cart) {
        return;
    }
    const PRODUCTS_JSON_PATH = 'product%20json/products.json';
    const TALLY_CHECKOUT_URL = 'https://tally.so/r/GxJkoQ';
    const MAILER_WEIGHT_OZ = 0.2;
    const TAX_RATE = 0.07;
    const SHIPPING_TIERS = [
        { maxWeightOz: 8, cost: 7.95 },
        { maxWeightOz: 16, cost: 10.95 },
        { maxWeightOz: 32, cost: 14.95 }
    ];
    const HEAVY_SHIPPING_COST = 20.95;

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
    const subtotalElement = drawer.querySelector('.cart-subtotal');
    const shippingElement = drawer.querySelector('.cart-shipping');
    const taxElement = drawer.querySelector('.cart-tax');
    const totalElement = drawer.querySelector('.cart-total');
    const closeButton = drawer.querySelector('.cart-drawer-close');
    const continueButton = drawer.querySelector('.cart-continue-button');
    const checkoutButton = drawer.querySelector('.cart-checkout-button');
    const productWeightById = new Map();

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

    async function loadProductWeights() {
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
                const productId = typeof entry?.id === 'string' ? entry.id.trim() : '';
                if (!productId) {
                    return;
                }

                const weightOz = toValidNumber(entry?.weight_oz);
                if (typeof weightOz === 'number' && weightOz >= 0) {
                    productWeightById.set(productId, weightOz);
                }
            });
        } catch (error) {
            // Keep cart usable even if weights fail to load.
        }
    }

    function getItemWeightOz(item) {
        const productId = typeof item?.productId === 'string' ? item.productId.trim() : '';
        if (!productId) {
            return 0;
        }
        return productWeightById.get(productId) || 0;
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

    function roundCurrency(value) {
        return Math.round((value + Number.EPSILON) * 100) / 100;
    }

    function getTaxAmount(subtotal, shippingCost) {
        const taxableAmount = subtotal + shippingCost;
        if (taxableAmount <= 0 || TAX_RATE <= 0) {
            return 0;
        }
        return roundCurrency(taxableAmount * TAX_RATE);
    }

    function buildPricingSummary(items) {
        const subtotal = cart.getSubtotal(items);
        const totalWeightOz = getTotalWeightOz(items);
        const shippingCost = getShippingCost(totalWeightOz);
        const taxAmount = getTaxAmount(subtotal, shippingCost);
        const total = roundCurrency(subtotal + shippingCost + taxAmount);

        return {
            subtotal,
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
                return `${safeQuantity} x ${name}`;
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
        const params = new URLSearchParams({
            order_id: generateOrderId(),
            items_summary: buildItemsSummary(items),
            subtotal: cart.formatPrice(pricing.subtotal),
            shipping: cart.formatPrice(pricing.shippingCost),
            tax: cart.formatPrice(pricing.taxAmount),
            total: cart.formatPrice(pricing.total)
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

    function createItemMedia(item) {
        if (item.image) {
            const image = document.createElement('img');
            image.className = 'cart-item-thumb';
            image.src = item.image;
            image.alt = item.name || 'Cart item';
            image.loading = 'lazy';
            image.addEventListener('error', () => {
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

            if (item.color) {
                const color = document.createElement('p');
                color.className = 'cart-item-color';
                color.textContent = `Color: ${item.color}`;
                info.appendChild(color);
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

    function renderCart() {
        const items = cart.getItems();
        const totalCount = cart.getTotalCount(items);
        const pricing = buildPricingSummary(items);

        countElement.textContent = `(${totalCount})`;
        subtotalElement.textContent = `Subtotal: ${cart.formatPrice(pricing.subtotal)}`;
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
        const items = cart.getItems();
        if (items.length === 0) {
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

    loadProductWeights().then(() => {
        if (document.body.classList.contains('cart-drawer-open')) {
            renderCart();
        }
    });
})(window);
