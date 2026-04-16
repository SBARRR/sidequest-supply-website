const PRODUCTS_JSON_PATH = 'product%20json/products.json';

const productNotFound = document.querySelector('#product-not-found');
const productView = document.querySelector('#product-view');
const breadcrumbLabel = document.querySelector('#product-breadcrumb-label');
const productTitle = document.querySelector('#product-title');
const productPrice = document.querySelector('#product-price');
const productDescription = document.querySelector('#product-description');
const productMainMedia = document.querySelector('#product-main-media');
const productThumbGallery = document.querySelector('#product-thumb-gallery');
const variantPicker = document.querySelector('#variant-picker');
const colorsSection = document.querySelector('#product-colors-section');
const variantSection = colorsSection || (variantPicker ? variantPicker.closest('.product-block') : null);
const variantSectionTitle = variantSection ? variantSection.querySelector('.product-block-title') : null;
const relatedProductsGrid = document.querySelector('#related-products-grid');
const quantitySection = document.querySelector('#product-quantity-section');
const qtyMinusButton = document.querySelector('#qty-minus');
const qtyPlusButton = document.querySelector('#qty-plus');
const qtyValue = document.querySelector('#qty-value');
const addToCartButton = document.querySelector('#add-to-cart-button');
const checkoutButton = document.querySelector('#checkout-button');
const customContactSection = document.querySelector('#custom-contact-section');

const COLOR_SWATCH_MAP = [
    { token: 'lightblue', color: '#68C8FF' },
    { token: 'darkblue', color: '#2349B5' },
    { token: 'blue', color: '#2F6BFF' },
    { token: 'red', color: '#D83C3C' },
    { token: 'orange', color: '#FF8A2A' },
    { token: 'yellow', color: '#FFD33D' },
    { token: 'green', color: '#2BC264' },
    { token: 'purple', color: '#8A56FF' },
    { token: 'pink', color: '#FF5CA8' },
    { token: 'teal', color: '#2AC1B7' },
    { token: 'brown', color: '#8B5A3C' },
    { token: 'black', color: '#1D1D1D' },
    { token: 'white', color: '#EFEFEF' },
    { token: 'gray', color: '#7C7C7C' },
    { token: 'grey', color: '#7C7C7C' },
    { token: 'gold', color: '#D6AF36' },
    { token: 'silver', color: '#B9BCC3' }
];

const analytics = window.SidequestAnalytics || null;
const cart = window.SidequestCart || null;
const cartFeedback = window.SidequestCartFeedback || null;
let currentQuantity = 0;
let activeProductId = '';
let activeProduct = null;
let activeVariantForCart = null;
let activeProductHasVariants = false;
let selectedBaseProductIdForPromo = '';

function getProductIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const rawId = params.get('id');
    return rawId ? rawId.trim() : '';
}

function parsePriceNumber(priceValue) {
    if (typeof priceValue === 'number' && Number.isFinite(priceValue)) {
        return priceValue;
    }

    if (typeof priceValue === 'string' && priceValue.trim() !== '') {
        const cleaned = priceValue.replace(/[$,\s]/g, '');
        const parsed = Number.parseFloat(cleaned);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function normalizeCategoryKey(categoryValue) {
    if (typeof categoryValue !== 'string') {
        return '';
    }

    return categoryValue.trim().toLowerCase();
}

function isCustomOrderProduct(product) {
    return normalizeCategoryKey(product?.category) === 'custom orders';
}

function isSpend12PromoProduct(product) {
    return normalizeCategoryKey(product?.category).includes('promo')
        && product?.promoRule === 'spend_12';
}

function getSpend12ModelCategory(product) {
    const categoryKey = normalizeCategoryKey(product?.category);
    if (categoryKey.includes('sleeve')) {
        return 'lighter sleeve';
    }

    return 'keychain';
}

function getSpend12ModelPrompt(product) {
    return getSpend12ModelCategory(product) === 'lighter sleeve'
        ? 'Select your sleeve'
        : 'Select your keychain';
}

function buildSpend12SelectionId(productId, variantId = '') {
    return variantId ? `${productId}::${variantId}` : productId;
}

function getSpend12ModelOptions(product, allProducts) {
    const modelCategory = getSpend12ModelCategory(product);
    if (!Array.isArray(allProducts)) {
        return [];
    }

    const options = [];

    allProducts.forEach((candidate) => {
        if (candidate?.available === false || normalizeCategoryKey(candidate?.category) !== modelCategory) {
            return;
        }

        const baseColorLabel = detectColorLabelFromId(candidate.id);
        const baseLabel = baseColorLabel
            ? `${candidate.name} - ${baseColorLabel}`
            : candidate.name;

        options.push({
            selectionId: buildSpend12SelectionId(candidate.id),
            label: baseLabel
        });

        const variants = Array.isArray(candidate.variants) ? candidate.variants : [];
        variants.forEach((variant, index) => {
            const safeVariant = typeof variant === 'object' && variant !== null ? variant : {};
            const variantId = typeof safeVariant.id === 'string' && safeVariant.id.trim() !== ''
                ? safeVariant.id.trim()
                : `${candidate.id}-variant-${index + 1}`;
            const colorLabel = detectColorLabelFromId(variantId);
            const variantLabel = colorLabel
                ? `${candidate.name} - ${colorLabel}`
                : `${candidate.name} ${index + 2}`;

            options.push({
                selectionId: buildSpend12SelectionId(candidate.id, variantId),
                label: variantLabel
            });
        });
    });

    return options.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}

function normalizeTagList(tagsValue) {
    if (!Array.isArray(tagsValue)) {
        return [];
    }

    return [...new Set(
        tagsValue
            .filter((tag) => typeof tag === 'string' && tag.trim() !== '')
            .map((tag) => tag.trim().toLowerCase())
    )];
}

function parseProductCreatedAt(createdAtValue) {
    if (typeof createdAtValue !== 'string' || createdAtValue.trim() === '') {
        return 0;
    }

    const trimmed = createdAtValue.trim();
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
        ? `${trimmed}T00:00:00`
        : trimmed;
    const parsedDate = new Date(normalized);
    return Number.isNaN(parsedDate.getTime()) ? 0 : parsedDate.getTime();
}

function isProductAvailable(rawProduct) {
    const safeProduct = typeof rawProduct === 'object' && rawProduct !== null ? rawProduct : {};
    const hasOwn = (key) => Object.prototype.hasOwnProperty.call(safeProduct, key);

    if ((hasOwn('available') && safeProduct.available === false)
        || (hasOwn('is_available') && safeProduct.is_available === false)
        || (hasOwn('in_stock') && safeProduct.in_stock === false)
        || (hasOwn('is_in_stock') && safeProduct.is_in_stock === false)
        || (hasOwn('out_of_stock') && safeProduct.out_of_stock === true)
        || (hasOwn('sold_out') && safeProduct.sold_out === true)
        || (hasOwn('is_sold_out') && safeProduct.is_sold_out === true)
        || (hasOwn('unavailable') && safeProduct.unavailable === true)) {
        return false;
    }

    const inventoryKeys = ['stock', 'inventory', 'inventory_quantity', 'quantity', 'qty'];
    for (const key of inventoryKeys) {
        if (!hasOwn(key)) {
            continue;
        }
        const quantity = parsePriceNumber(safeProduct[key]);
        if (typeof quantity === 'number' && Number.isFinite(quantity) && quantity <= 0) {
            return false;
        }
    }

    return true;
}

function formatPriceValue(priceValue) {
    const parsedValue = parsePriceNumber(priceValue);
    return parsedValue === null ? '' : `$${parsedValue.toFixed(2)}`;
}

function isSaleProduct(priceValue, compareAtValue) {
    return (
        typeof priceValue === 'number' &&
        Number.isFinite(priceValue) &&
        typeof compareAtValue === 'number' &&
        Number.isFinite(compareAtValue) &&
        compareAtValue > priceValue
    );
}

function populatePriceElement(priceElement, priceValue, compareAtValue) {
    if (!priceElement) {
        return false;
    }

    const priceText = formatPriceValue(priceValue);
    priceElement.innerHTML = '';
    priceElement.classList.remove('is-sale');

    if (!priceText) {
        return false;
    }

    if (isSaleProduct(priceValue, compareAtValue)) {
        priceElement.classList.add('is-sale');

        const compareAt = document.createElement('span');
        compareAt.className = 'price-compare';
        compareAt.textContent = formatPriceValue(compareAtValue);

        const currentPrice = document.createElement('span');
        currentPrice.className = 'price-current';
        currentPrice.textContent = priceText;

        priceElement.appendChild(compareAt);
        priceElement.appendChild(currentPrice);
        return true;
    }

    priceElement.textContent = priceText;
    return true;
}

function normalizeImagePath(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim();
}

function normalizeImageList(values) {
    if (!Array.isArray(values)) {
        return [];
    }
    return values
        .map((value) => normalizeImagePath(value))
        .filter((value) => value !== '');
}

function dedupeImageList(imageList) {
    return [...new Set(imageList)];
}

function detectColorEntryFromId(idValue) {
    const normalizedId = String(idValue || '').toLowerCase();
    return COLOR_SWATCH_MAP.find((entry) => normalizedId.includes(entry.token)) || null;
}

function detectColorFromId(idValue) {
    const match = detectColorEntryFromId(idValue);
    return match ? match.color : '';
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

function buildMediaList(mainImage, galleryImages) {
    return dedupeImageList([normalizeImagePath(mainImage), ...normalizeImageList(galleryImages)]);
}

function createPlaceholderMedia(className) {
    const placeholder = document.createElement('div');
    placeholder.className = className;
    placeholder.textContent = 'Placeholder Image';
    return placeholder;
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

function getCardImagePath(imagePath) {
    if (typeof imagePath !== 'string') {
        return '';
    }

    const trimmedPath = imagePath.trim();
    if (!trimmedPath) {
        return '';
    }

    const extensionMatch = trimmedPath.match(/(\.[^./?#]+)([?#].*)?$/);
    if (!extensionMatch) {
        return `${trimmedPath}-card`;
    }

    const extensionStart = extensionMatch.index;
    const extension = extensionMatch[1];
    const suffix = extensionMatch[2] || '';
    return `${trimmedPath.slice(0, extensionStart)}-card${extension}${suffix}`;
}

function createMediaElement(imagePath, className, altText, fallbackImagePath = '') {
    if (!imagePath) {
        return createPlaceholderMedia(`${className} ${className}-placeholder`);
    }

    const image = document.createElement('img');
    image.className = className;
    image.src = imagePath;
    image.alt = altText;
    image.loading = 'lazy';
    let fallbackAttempted = false;
    image.addEventListener('error', () => {
        if (!fallbackAttempted && fallbackImagePath) {
            fallbackAttempted = true;
            image.src = fallbackImagePath;
            return;
        }
        image.replaceWith(createPlaceholderMedia(`${className} ${className}-placeholder`));
    });
    return image;
}

function normalizeProducts(rawProducts) {
    if (!Array.isArray(rawProducts)) {
        return [];
    }

    return rawProducts.map((product, index) => {
        const safeProduct = typeof product === 'object' && product !== null ? product : {};
        const id = typeof safeProduct.id === 'string' && safeProduct.id.trim() !== ''
            ? safeProduct.id.trim()
            : `product-${index + 1}`;
        const name = typeof safeProduct.name === 'string' && safeProduct.name.trim() !== ''
            ? safeProduct.name.trim()
            : `Placeholder Product ${String(index + 1).padStart(2, '0')}`;
        const description = typeof safeProduct.description === 'string'
            ? safeProduct.description.trim()
            : '';
        const category = typeof safeProduct.category === 'string'
            ? safeProduct.category.trim()
            : '';
        const promoRule = typeof safeProduct.promo_rule === 'string'
            ? safeProduct.promo_rule.trim()
            : '';
        const tags = normalizeTagList(safeProduct.tags);
        const categoryKey = normalizeCategoryKey(category);
        const createdAtTimestamp = parseProductCreatedAt(safeProduct.created_at_yyyy_mm_dd);
        const isManuallyPopular = safeProduct.popular === true;
        const available = isProductAvailable(safeProduct);

        return {
            id,
            name,
            priceValue: parsePriceNumber(safeProduct.price),
            compareAtValue: parsePriceNumber(safeProduct.compare_at),
            description,
            category,
            categoryKey,
            promoRule,
            tags,
            createdAtTimestamp,
            isManuallyPopular,
            available,
            mainImage: normalizeImagePath(safeProduct.main_image),
            galleryImages: normalizeImageList(safeProduct.gallery_images),
            variants: Array.isArray(safeProduct.variants) ? safeProduct.variants : []
        };
    });
}

function buildVariantOptions(product) {
    const baseVariant = {
        id: product.id,
        label: `${product.name} 1`,
        color: detectColorFromId(product.id),
        colorLabel: detectColorLabelFromId(product.id),
        priceValue: product.priceValue,
        compareAtValue: product.compareAtValue,
        mediaList: buildMediaList(product.mainImage, product.galleryImages)
    };

    const additionalVariants = product.variants.map((variant, index) => {
        const safeVariant = typeof variant === 'object' && variant !== null ? variant : {};
        const variantId = typeof safeVariant.id === 'string' && safeVariant.id.trim() !== ''
            ? safeVariant.id.trim()
            : `${product.id}-variant-${index + 1}`;
        const variantPriceValue = parsePriceNumber(safeVariant.price);
        const variantCompareAtValue = parsePriceNumber(safeVariant.compare_at);
        const resolvedPriceValue = variantPriceValue === null ? product.priceValue : variantPriceValue;
        const resolvedCompareAtValue = variantCompareAtValue === null ? product.compareAtValue : variantCompareAtValue;
        const variantMediaList = buildMediaList(
            normalizeImagePath(safeVariant.main_image),
            normalizeImageList(safeVariant.gallery_images)
        );
        const fallbackMediaList = buildMediaList(product.mainImage, product.galleryImages);

        return {
            id: variantId,
            label: `${product.name} ${index + 2}`,
            color: detectColorFromId(variantId),
            colorLabel: detectColorLabelFromId(variantId),
            priceValue: resolvedPriceValue,
            compareAtValue: resolvedCompareAtValue,
            mediaList: variantMediaList.length > 0 ? variantMediaList : fallbackMediaList
        };
    });

    return [baseVariant, ...additionalVariants];
}

function shouldRenderColorVariantPicker(variantOptions) {
    return variantOptions.length > 0 && variantOptions.every((variant) => variant.color !== '');
}

function renderMainMedia(imagePath, productName) {
    if (!productMainMedia) {
        return;
    }

    productMainMedia.innerHTML = '';
    const mediaElement = createMediaElement(
        imagePath,
        'product-main-image',
        productName || 'Product image'
    );
    productMainMedia.appendChild(mediaElement);
}

function renderMediaGallery(mediaList, productName) {
    if (!productThumbGallery) {
        return;
    }

    const safeMediaList = mediaList.length > 0 ? mediaList : [''];
    let activeMedia = safeMediaList[0];
    const hasAdditionalGalleryMedia = safeMediaList.length > 1;

    renderMainMedia(activeMedia, productName);
    productThumbGallery.innerHTML = '';
    productThumbGallery.hidden = !hasAdditionalGalleryMedia;

    if (!hasAdditionalGalleryMedia) {
        return;
    }

    safeMediaList.forEach((imagePath, index) => {
        const thumbButton = document.createElement('button');
        thumbButton.type = 'button';
        thumbButton.className = `product-thumb${index === 0 ? ' active' : ''}`;
        thumbButton.setAttribute('aria-label', `Select image ${index + 1}`);
        const thumbImagePath = getThumbnailImagePath(imagePath);

        const thumbMedia = createMediaElement(
            thumbImagePath || imagePath,
            'product-thumb-image',
            `${productName || 'Product'} thumbnail ${index + 1}`,
            imagePath
        );
        thumbButton.appendChild(thumbMedia);

        thumbButton.addEventListener('click', () => {
            activeMedia = imagePath;
            renderMainMedia(activeMedia, productName);
            productThumbGallery.querySelectorAll('.product-thumb').forEach((thumb) => {
                thumb.classList.remove('active');
            });
            thumbButton.classList.add('active');
        });

        productThumbGallery.appendChild(thumbButton);
    });
}

function renderVariantPicker(variantOptions, productName, pickerType, onVariantChange) {
    if (!variantPicker) {
        return;
    }

    variantPicker.innerHTML = '';
    variantPicker.classList.toggle('variant-picker-styles', pickerType === 'style');

    function setSelectedVariant(selectedVariantId) {
        const selectedVariant = variantOptions.find((variant) => variant.id === selectedVariantId) || variantOptions[0];
        populatePriceElement(productPrice, selectedVariant.priceValue, selectedVariant.compareAtValue);
        renderMediaGallery(selectedVariant.mediaList, productName);
        if (typeof onVariantChange === 'function') {
            onVariantChange(selectedVariant);
        }

        variantPicker.querySelectorAll('.variant-choice').forEach((choice) => {
            const isSelected = choice.dataset.variantId === selectedVariant.id;
            choice.classList.toggle('selected', isSelected);
            choice.setAttribute('aria-pressed', String(isSelected));
        });
    }

    variantOptions.forEach((variant) => {
        const variantButton = document.createElement('button');
        variantButton.type = 'button';
        variantButton.className = pickerType === 'color'
            ? 'variant-choice variant-swatch'
            : 'variant-choice variant-style-pill';
        variantButton.dataset.variantId = variant.id;
        variantButton.setAttribute('aria-pressed', 'false');
        variantButton.setAttribute('title', pickerType === 'color' ? variant.colorLabel : variant.label);

        if (pickerType === 'color') {
            const swatchColor = document.createElement('span');
            swatchColor.className = 'variant-swatch-color';
            swatchColor.style.backgroundColor = variant.color;
            variantButton.appendChild(swatchColor);
        } else {
            variantButton.textContent = variant.label;
        }

        variantButton.addEventListener('click', () => {
            setSelectedVariant(variant.id);
        });

        variantPicker.appendChild(variantButton);
    });

    setSelectedVariant(variantOptions[0].id);
}

function updateQuantityDisplay() {
    if (qtyValue) {
        qtyValue.textContent = String(currentQuantity);
    }
}

function setupQuantitySelector() {
    currentQuantity = 1;
    updateQuantityDisplay();

    if (qtyMinusButton) {
        qtyMinusButton.addEventListener('click', () => {
            currentQuantity = Math.max(0, currentQuantity - 1);
            updateQuantityDisplay();
        });
    }

    if (qtyPlusButton) {
        qtyPlusButton.addEventListener('click', () => {
            currentQuantity += 1;
            updateQuantityDisplay();
        });
    }
}

function renderSpend12ModelSelector(product, allProducts) {
    if (!quantitySection) {
        return;
    }

    const options = getSpend12ModelOptions(product, allProducts);
    const promptText = getSpend12ModelPrompt(product);
    selectedBaseProductIdForPromo = '';

    quantitySection.hidden = false;
    quantitySection.innerHTML = '';

    const title = document.createElement('h3');
    title.className = 'product-block-title';
    title.textContent = 'Model';

    const selectWrap = document.createElement('div');
    selectWrap.className = 'promo-model-select-wrap';

    const modelSelect = document.createElement('select');
    modelSelect.className = 'promo-model-select';
    modelSelect.setAttribute('aria-label', promptText);

    const promptOption = document.createElement('option');
    promptOption.value = '';
    promptOption.textContent = promptText;
    promptOption.selected = true;
    modelSelect.appendChild(promptOption);

    options.forEach((optionProduct) => {
        const option = document.createElement('option');
        option.value = optionProduct.selectionId;
        option.textContent = optionProduct.label;
        modelSelect.appendChild(option);
    });

    modelSelect.addEventListener('change', () => {
        selectedBaseProductIdForPromo = modelSelect.value.trim();
        if (addToCartButton) {
            addToCartButton.disabled = selectedBaseProductIdForPromo === '';
        }
    });

    const hasModelOptions = options.length > 0;
    if (!hasModelOptions) {
        modelSelect.disabled = true;
        promptOption.textContent = 'No models available';
    }

    if (addToCartButton) {
        addToCartButton.disabled = !hasModelOptions;
    }

    selectWrap.appendChild(modelSelect);
    quantitySection.appendChild(title);
    quantitySection.appendChild(selectWrap);
}

function setupProductActionButtons() {
    if (addToCartButton) {
        addToCartButton.addEventListener('click', async () => {
            let didAddToCart = false;

            if (activeProduct && activeVariantForCart && cart && typeof cart.addItem === 'function' && currentQuantity > 0) {
                const isSpend12Promo = isSpend12PromoProduct(activeProduct);
                if (isSpend12Promo && !selectedBaseProductIdForPromo) {
                    if (cartFeedback && typeof cartFeedback.showToast === 'function') {
                        cartFeedback.showToast(getSpend12ModelPrompt(activeProduct));
                    }
                    return;
                }

                const variantId = activeVariantForCart.id !== activeProduct.id
                    ? activeVariantForCart.id
                    : '';
                const pickerType = shouldRenderColorVariantPicker(buildVariantOptions(activeProduct))
                    ? 'color'
                    : 'style';
                const colorLabel = activeProductHasVariants
                    && pickerType === 'color'
                    ? detectColorLabelFromId(activeVariantForCart.id)
                    : '';
                const styleLabel = activeProductHasVariants
                    && pickerType === 'style'
                    ? activeVariantForCart.label
                    : '';
                const primaryImage = Array.isArray(activeVariantForCart.mediaList) && activeVariantForCart.mediaList.length > 0
                    ? activeVariantForCart.mediaList[0]
                    : activeProduct.mainImage;

                const addResult = await cart.addItem({
                    productId: activeProduct.id,
                    variantId,
                    name: activeProduct.name,
                    color: colorLabel,
                    style: styleLabel,
                    selectedBaseProductId: isSpend12Promo ? selectedBaseProductIdForPromo : '',
                    category: activeProduct.category,
                    promoRule: activeProduct.promoRule,
                    price: activeVariantForCart.priceValue,
                    image: primaryImage || ''
                }, currentQuantity);
                didAddToCart = addResult?.added === true;
            }

            if (didAddToCart && activeProductId && analytics && typeof analytics.trackAddToCart === 'function') {
                analytics.trackAddToCart(activeProductId);
            }
            if (didAddToCart && cartFeedback && typeof cartFeedback.announceAdded === 'function') {
                cartFeedback.announceAdded(addToCartButton);
            }
        });
    }

    if (checkoutButton) {
        checkoutButton.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('sidequest:open-cart-drawer'));
        });
    }
}

function createRelatedCard(product) {
    const card = document.createElement('a');
    card.className = 'related-product-card';
    card.href = `product.html?id=${encodeURIComponent(product.id)}`;

    const media = createMediaElement(
        getCardImagePath(product.mainImage) || product.mainImage,
        'related-product-image',
        product.name,
        product.mainImage
    );

    const title = document.createElement('h4');
    title.className = 'related-product-name';
    title.textContent = product.name;

    const price = document.createElement('p');
    price.className = 'related-product-price';

    card.appendChild(media);
    card.appendChild(title);
    if (populatePriceElement(price, product.priceValue, product.compareAtValue)) {
        card.appendChild(price);
    }

    return card;
}

function countSharedTags(tagsA, tagsB) {
    if (!Array.isArray(tagsA) || !Array.isArray(tagsB) || tagsA.length === 0 || tagsB.length === 0) {
        return 0;
    }

    const tagSetA = new Set(tagsA);
    let count = 0;
    tagsB.forEach((tag) => {
        if (tagSetA.has(tag)) {
            count += 1;
        }
    });
    return count;
}

function getPriceDelta(priceA, priceB) {
    if (typeof priceA !== 'number' || !Number.isFinite(priceA)
        || typeof priceB !== 'number' || !Number.isFinite(priceB)) {
        return Number.POSITIVE_INFINITY;
    }
    return Math.abs(priceA - priceB);
}

function hasSimilarPrice(priceA, priceB) {
    const priceDelta = getPriceDelta(priceA, priceB);
    return Number.isFinite(priceDelta) && priceDelta <= 3;
}

function scoreRelatedCandidate(candidate, currentProduct) {
    const sameCategory = candidate.categoryKey !== ''
        && currentProduct.categoryKey !== ''
        && candidate.categoryKey === currentProduct.categoryKey;
    const sharedTagCount = countSharedTags(currentProduct.tags, candidate.tags);
    const similarPrice = hasSimilarPrice(currentProduct.priceValue, candidate.priceValue);
    const score = (sameCategory ? 3 : 0) + (sharedTagCount * 2) + (similarPrice ? 1 : 0);

    return {
        product: candidate,
        score,
        sameCategory,
        sharedTagCount,
        similarPrice,
        priceDelta: getPriceDelta(currentProduct.priceValue, candidate.priceValue)
    };
}

function compareScoredCandidates(a, b) {
    if (b.score !== a.score) {
        return b.score - a.score;
    }

    if (b.sharedTagCount !== a.sharedTagCount) {
        return b.sharedTagCount - a.sharedTagCount;
    }

    if (Number(b.sameCategory) !== Number(a.sameCategory)) {
        return Number(b.sameCategory) - Number(a.sameCategory);
    }

    if (Number(b.similarPrice) !== Number(a.similarPrice)) {
        return Number(b.similarPrice) - Number(a.similarPrice);
    }

    const aFiniteDelta = Number.isFinite(a.priceDelta) ? a.priceDelta : Number.POSITIVE_INFINITY;
    const bFiniteDelta = Number.isFinite(b.priceDelta) ? b.priceDelta : Number.POSITIVE_INFINITY;
    if (aFiniteDelta !== bFiniteDelta) {
        return aFiniteDelta - bFiniteDelta;
    }

    const aCreated = typeof a.product.createdAtTimestamp === 'number' ? a.product.createdAtTimestamp : 0;
    const bCreated = typeof b.product.createdAtTimestamp === 'number' ? b.product.createdAtTimestamp : 0;
    if (bCreated !== aCreated) {
        return bCreated - aCreated;
    }

    return a.product.name.localeCompare(b.product.name, undefined, { sensitivity: 'base' });
}

function getPopularProductIdSet(products) {
    const knownProductIds = new Set(products.map((product) => product.id));
    const popularIds = new Set(
        products
            .filter((product) => product.isManuallyPopular)
            .map((product) => product.id)
    );

    if (!analytics || typeof analytics.getTopProductIdsByScore !== 'function') {
        return popularIds;
    }

    analytics.getTopProductIdsByScore(3)
        .filter((productId) => knownProductIds.has(productId))
        .forEach((productId) => {
            popularIds.add(productId);
        });

    return popularIds;
}

function renderRelatedProducts(allProducts, currentProduct) {
    if (!relatedProductsGrid) {
        return;
    }

    const candidates = allProducts.filter((product) => (
        product.id !== currentProduct.id && product.available !== false
    ));
    const scoredCandidates = candidates.map((candidate) => scoreRelatedCandidate(candidate, currentProduct));
    const relatedProducts = [];
    const selectedIds = new Set();

    function addTierCandidates(predicate) {
        scoredCandidates
            .filter((entry) => !selectedIds.has(entry.product.id) && predicate(entry))
            .sort(compareScoredCandidates)
            .forEach((entry) => {
                if (relatedProducts.length >= 4) {
                    return;
                }
                selectedIds.add(entry.product.id);
                relatedProducts.push(entry.product);
            });
    }

    // Primary: same category + shared tags.
    addTierCandidates((entry) => entry.sameCategory && entry.sharedTagCount > 0);
    // Fallback 1: same category only.
    addTierCandidates((entry) => entry.sameCategory);
    // Fallback 2: shared tags across other categories.
    addTierCandidates((entry) => !entry.sameCategory && entry.sharedTagCount > 0);

    // Fallback 3: popular/newest so section does not end up empty.
    if (relatedProducts.length < 4) {
        const popularIds = getPopularProductIdSet(candidates);
        scoredCandidates
            .filter((entry) => !selectedIds.has(entry.product.id))
            .sort((a, b) => {
                const aPopular = popularIds.has(a.product.id) ? 1 : 0;
                const bPopular = popularIds.has(b.product.id) ? 1 : 0;

                if (bPopular !== aPopular) {
                    return bPopular - aPopular;
                }

                const aCreated = typeof a.product.createdAtTimestamp === 'number' ? a.product.createdAtTimestamp : 0;
                const bCreated = typeof b.product.createdAtTimestamp === 'number' ? b.product.createdAtTimestamp : 0;
                if (bCreated !== aCreated) {
                    return bCreated - aCreated;
                }

                return compareScoredCandidates(a, b);
            })
            .forEach((entry) => {
                if (relatedProducts.length >= 4) {
                    return;
                }
                selectedIds.add(entry.product.id);
                relatedProducts.push(entry.product);
            });
    }

    relatedProductsGrid.innerHTML = '';

    relatedProducts.forEach((product) => {
        relatedProductsGrid.appendChild(createRelatedCard(product));
    });
}

function renderProduct(product, allProducts) {
    if (!productView || !productNotFound) {
        return;
    }

    const variantOptions = buildVariantOptions(product);
    const hasAdditionalVariants = Array.isArray(product.variants) && product.variants.length > 0;
    const isCustomOrder = isCustomOrderProduct(product);
    const isSpend12Promo = isSpend12PromoProduct(product);
    selectedBaseProductIdForPromo = '';
    activeProductId = product.id;
    activeProduct = product;
    activeProductHasVariants = hasAdditionalVariants;
    activeVariantForCart = variantOptions[0] || null;

    if (breadcrumbLabel) {
        breadcrumbLabel.textContent = product.name;
    }

    if (productTitle) {
        productTitle.textContent = product.name;
    }

    populatePriceElement(productPrice, variantOptions[0].priceValue, variantOptions[0].compareAtValue);

    if (productDescription) {
        productDescription.textContent = product.description || '';
    }

    if (variantSection) {
        variantSection.hidden = !hasAdditionalVariants;
    }

    if (quantitySection) {
        quantitySection.hidden = isCustomOrder;
    }

    if (isSpend12Promo) {
        currentQuantity = 1;
        updateQuantityDisplay();
        renderSpend12ModelSelector(product, allProducts);
    }

    if (addToCartButton) {
        addToCartButton.hidden = isCustomOrder;
        if (!isSpend12Promo) {
            addToCartButton.disabled = false;
        }
    }

    if (customContactSection) {
        customContactSection.hidden = !isCustomOrder;
    }

    if (hasAdditionalVariants) {
        const pickerType = shouldRenderColorVariantPicker(variantOptions) ? 'color' : 'style';
        if (variantSectionTitle) {
            variantSectionTitle.textContent = pickerType === 'color' ? 'Colors' : 'Styles';
        }
        renderVariantPicker(variantOptions, product.name, pickerType, (selectedVariant) => {
            activeVariantForCart = selectedVariant;
        });
    } else {
        if (variantSectionTitle) {
            variantSectionTitle.textContent = 'Colors';
        }
        if (variantPicker) {
            variantPicker.innerHTML = '';
            variantPicker.classList.remove('variant-picker-styles');
        }
        renderMediaGallery(variantOptions[0].mediaList, product.name);
    }

    renderRelatedProducts(allProducts, product);
    if (analytics && typeof analytics.trackProductView === 'function') {
        analytics.trackProductView(product.id);
    }

    productNotFound.hidden = true;
    productView.hidden = false;
}

function renderNotFoundState() {
    if (productView) {
        productView.hidden = true;
    }
    if (productNotFound) {
        productNotFound.hidden = false;
    }
}

async function initializeProductPage() {
    setupQuantitySelector();
    setupProductActionButtons();

    try {
        const response = await fetch(PRODUCTS_JSON_PATH);
        if (!response.ok) {
            throw new Error(`Failed to load products.json (${response.status})`);
        }

        const rawProducts = await response.json();
        const allProducts = normalizeProducts(rawProducts);

        if (allProducts.length === 0) {
            renderNotFoundState();
            return;
        }

        const requestedId = getProductIdFromUrl();
        const product = requestedId
            ? allProducts.find((item) => item.id === requestedId)
            : allProducts[0];

        if (!product) {
            renderNotFoundState();
            return;
        }

        renderProduct(product, allProducts);
    } catch (error) {
        console.error('Unable to initialize product page:', error);
        renderNotFoundState();
    }
}

initializeProductPage();
