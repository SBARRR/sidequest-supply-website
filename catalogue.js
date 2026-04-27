const filterToggle = document.querySelector('.filter-tab');
const drawer = document.querySelector('#filter-drawer');
const drawerClose = document.querySelector('.drawer-close');
const overlay = document.querySelector('.drawer-overlay');
const catalogueGrid = document.querySelector('#catalogue-grid');
const catalogueEmptyState = document.querySelector('#catalogue-empty-state');
const loadMoreProductsButton = document.querySelector('#load-more-products');
const sortRadioButtons = document.querySelectorAll('input[name="sort"]');
const filterCheckboxes = document.querySelectorAll('input[name="filter"]');
const priceRadioButtons = document.querySelectorAll('input[name="price-range"]');
const priceSlider = document.querySelector('#price-slider');
const priceSliderValue = document.querySelector('#price-slider-value');
const filterTabCount = document.querySelector('.filter-tab-count');
const applyFiltersButton = document.querySelector('.apply-button');
const clearFiltersButton = document.querySelector('.clear-button');
const filterSearchInput = document.querySelector('#filter-search');
const catalogueClearFiltersButton = document.querySelector('#catalogue-clear-filters');
let hasCommittedCatalogueFilters = false;

function refreshPriceSliderDisplay() {
    if (priceSlider && priceSliderValue) {
        priceSliderValue.textContent = `($0 - $${priceSlider.value})`;
    }
}

function isBrowseChipFiltered() {
    const activeBrowseChip = document.querySelector('.shop-by-chips .category-chip.active');
    if (!activeBrowseChip) {
        return false;
    }

    const browseLabel = (activeBrowseChip.dataset.category || activeBrowseChip.textContent || '')
        .trim()
        .toLowerCase();

    return browseLabel !== '' && browseLabel !== 'all';
}

function updateCatalogueClearFiltersVisibility() {
    if (!catalogueClearFiltersButton) {
        return;
    }

    const shouldShow = isBrowseChipFiltered() || hasCommittedCatalogueFilters;
    catalogueClearFiltersButton.hidden = !shouldShow;
}

function setCommittedCatalogueFiltersState(nextState) {
    hasCommittedCatalogueFilters = Boolean(nextState);
    updateCatalogueClearFiltersVisibility();
}

function countCheckedInputs(inputElements) {
    return Array.from(inputElements).filter((input) => input.checked).length;
}

function getAppliedFilterCount() {
    const sortCount = countCheckedInputs(sortRadioButtons);
    const filterCount = countCheckedInputs(filterCheckboxes);
    const priceRadioCount = countCheckedInputs(priceRadioButtons);
    const priceSliderCount = priceSlider && Number(priceSlider.value) > 0 ? 1 : 0;
    const searchCount = filterSearchInput && filterSearchInput.value.trim() !== '' ? 1 : 0;
    return sortCount + filterCount + priceRadioCount + priceSliderCount + searchCount;
}

function syncFilterTabIndicator() {
    if (!filterToggle || !filterTabCount) {
        return;
    }

    const appliedFilterCount = getAppliedFilterCount();
    filterTabCount.hidden = appliedFilterCount === 0;
    if (appliedFilterCount > 0) {
        filterTabCount.textContent = `(${appliedFilterCount})`;
    }
    filterToggle.classList.toggle('has-active-filters', appliedFilterCount > 0);
}

function openFilterDrawer() {
    if (!filterToggle || !drawer || !overlay) {
        return;
    }

    document.body.classList.add('drawer-open');
    drawer.setAttribute('aria-hidden', 'false');
    filterToggle.setAttribute('aria-expanded', 'true');
    overlay.hidden = false;
}

function closeFilterDrawer() {
    if (!filterToggle || !drawer || !overlay) {
        return;
    }

    document.body.classList.remove('drawer-open');
    drawer.setAttribute('aria-hidden', 'true');
    filterToggle.setAttribute('aria-expanded', 'false');
    overlay.hidden = true;
}

if (filterToggle && drawer && drawerClose && overlay) {
    let hasPeeked = false;

    function runTabPeek(force = false) {
        if (hasPeeked && !force) {
            return;
        }
        filterToggle.classList.remove('tab-peek');
        void filterToggle.offsetWidth;
        filterToggle.classList.add('tab-peek');
        hasPeeked = true;
    }

    filterToggle.addEventListener('click', openFilterDrawer);
    drawerClose.addEventListener('click', closeFilterDrawer);
    overlay.addEventListener('click', closeFilterDrawer);

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && document.body.classList.contains('drawer-open')) {
            closeFilterDrawer();
        }
    });

    window.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => runTabPeek(), 220);
    });

    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            runTabPeek(true);
        }
    });
}

if (catalogueGrid && loadMoreProductsButton) {
    const INITIAL_RENDER = 8;
    const PRODUCTS_PER_LOAD = 4;
    const FAVORITES_STORAGE_KEY = 'sidequest-favorites';
    const PRODUCTS_JSON_PATH = 'product%20json/products.json';
    const CATALOGUE_SETTINGS_PATH = 'product%20json/catalogue-settings.json';
    const NEW_BADGE_MAX_AGE_DAYS = 30;
    const BADGE_ICON_PATHS = {
        new: 'icons/badges/new.webp',
        sale: 'icons/badges/sale.webp',
        popular: 'icons/badges/popular.webp'
    };
    const analytics = window.SidequestAnalytics || null;
    const cart = window.SidequestCart || null;
    const cartFeedback = window.SidequestCartFeedback || null;
    const browseChips = Array.from(document.querySelectorAll('.shop-by-chips .category-chip'));
    let renderedProducts = 0;
    let catalogueProducts = [];
    let filteredCatalogueProducts = [];
    let appliedSortValue = '';
    let appliedFilterValues = new Set();
    let appliedPriceRangeValue = '';
    let appliedPriceSliderValue = 0;
    let appliedSearchQuery = '';
    let popularProductIds = new Set();
    let productLookupById = new Map();
    let promosEnabled = false;
    let enabledPromoRuleIds = null;
    const favoriteProductIds = new Set(loadFavoriteProductIds());

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

    function loadFavoriteProductIds() {
        try {
            const storedValue = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
            if (!storedValue) {
                return [];
            }
            const parsedValue = JSON.parse(storedValue);
            return Array.isArray(parsedValue) ? parsedValue : [];
        } catch (error) {
            return [];
        }
    }

    function saveFavoriteProductIds() {
        try {
            window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...favoriteProductIds]));
        } catch (error) {
            // Ignore storage write errors so UI still works.
        }
    }

    function createHeartIcon() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.classList.add('favorite-icon');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute(
            'd',
            'M12 21.35L10.55 20.03C5.4 15.36 2 12.28 2 8.5C2 5.42 4.42 3 7.5 3C9.24 3 10.91 3.81 12 5.09C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.42 22 8.5C22 12.28 18.6 15.36 13.45 20.03L12 21.35Z'
        );

        svg.appendChild(path);
        return svg;
    }

    function createCartButton() {
        const cartButton = document.createElement('button');
        cartButton.type = 'button';
        cartButton.className = 'catalogue-cart-button';
        cartButton.setAttribute('aria-label', 'Add to cart');

        const cartIcon = document.createElement('img');
        cartIcon.className = 'catalogue-cart-icon';
        cartIcon.src = 'icons/cart/cart.svg';
        cartIcon.alt = '';

        cartButton.appendChild(cartIcon);
        return cartButton;
    }

    function setFavoriteVisualState(button, isFavorited, animatePop = false) {
        button.classList.toggle('is-favorited', isFavorited);
        button.setAttribute('aria-pressed', String(isFavorited));
        button.setAttribute(
            'aria-label',
            isFavorited ? 'Remove from favorites' : 'Add to favorites'
        );

        if (animatePop) {
            button.classList.remove('favorite-pop');
            void button.offsetWidth;
            button.classList.add('favorite-pop');
        }
    }

    function createPlaceholderImageElement() {
        const placeholder = document.createElement('div');
        placeholder.className = 'catalogue-image';
        placeholder.textContent = 'Placeholder Image';
        return placeholder;
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

    function createProductImageElement(productName, imagePath) {
        if (!imagePath) {
            return createPlaceholderImageElement();
        }

        const image = document.createElement('img');
        image.className = 'catalogue-image catalogue-image-media';
        const fallbackImagePath = imagePath;
        image.src = getCardImagePath(imagePath) || imagePath;
        image.alt = productName || 'Product image';
        image.loading = 'lazy';
        let fallbackAttempted = false;

        image.addEventListener('error', () => {
            if (!fallbackAttempted && fallbackImagePath) {
                fallbackAttempted = true;
                image.src = fallbackImagePath;
                return;
            }
            image.replaceWith(createPlaceholderImageElement());
        });

        return image;
    }

    function formatPriceValue(priceValue) {
        const parsedValue = parsePriceNumber(priceValue);
        return parsedValue === null ? '' : `$${parsedValue.toFixed(2)}`;
    }

    function normalizeCategoryValue(value) {
        if (typeof value !== 'string') {
            return '';
        }

        const normalized = value
            .trim()
            .toLowerCase()
            .replace(/[-_]+/g, ' ')
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        if (!normalized) {
            return '';
        }

        return normalized
            .split(' ')
            .map((word) => (
                word.length > 3 && word.endsWith('s')
                    ? word.slice(0, -1)
                    : word
            ))
            .join(' ');
    }

    function isPromoProduct(product) {
        return normalizeCategoryValue(product?.category).includes('promo');
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

    function isPromoRuleVisible(ruleId) {
        if (!promosEnabled) {
            return false;
        }

        if (enabledPromoRuleIds === null) {
            return true;
        }

        return enabledPromoRuleIds.has(ruleId);
    }

    function isPromoProductVisible(product) {
        if (!isPromoProduct(product)) {
            return true;
        }

        const promoRule = typeof product?.promoRule === 'string' ? product.promoRule.trim() : '';
        return promoRule !== '' && isPromoRuleVisible(promoRule);
    }

    function getBrowseCategoryFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const browseParam = params.get('browse');
        const fallbackCategoryParam = params.get('category');
        const candidates = [browseParam, fallbackCategoryParam];

        for (const candidate of candidates) {
            const normalized = normalizeCategoryValue(candidate || '');
            if (!normalized) {
                continue;
            }

            const matchingChip = browseChips.find((chip) => (
                !chip.hidden
                && normalizeCategoryValue(chip.dataset.category || chip.textContent || '') === normalized
            ));

            if (matchingChip) {
                return normalized;
            }
        }

        return 'all';
    }

    function normalizeFilterValue(value) {
        if (typeof value !== 'string') {
            return '';
        }

        const normalized = value.trim().toLowerCase();
        if (!normalized) {
            return '';
        }

        if (normalized === 'new' || normalized === 'new-arrivals') {
            return 'new';
        }

        if (normalized === 'sale' || normalized === 'on-sale') {
            return 'sale';
        }

        if (normalized === 'popular' || normalized === 'trending') {
            return 'popular';
        }

        if (normalized === 'favorites' || normalized === 'favourites') {
            return 'favorites';
        }

        return '';
    }

    function getFilterValuesFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const values = [];

        params.getAll('filter').forEach((rawValue) => {
            String(rawValue)
                .split(',')
                .map((part) => part.trim())
                .filter(Boolean)
                .forEach((part) => values.push(part));
        });

        const categoryValue = params.get('category');
        if (categoryValue) {
            values.push(categoryValue);
        }

        const normalizedValues = values
            .map((value) => normalizeFilterValue(value))
            .filter(Boolean);

        return new Set(normalizedValues);
    }

    function syncFilterCheckboxesWithAppliedValues() {
        filterCheckboxes.forEach((checkbox) => {
            checkbox.checked = appliedFilterValues.has(checkbox.value);
        });
    }

    function getActiveBrowseChip() {
        return browseChips.find((chip) => chip.classList.contains('active')) || null;
    }

    function getSelectedBrowseCategoryKey() {
        const activeChip = getActiveBrowseChip();
        if (!activeChip) {
            return 'all';
        }

        const label = (activeChip.dataset.category || activeChip.textContent || '').trim();
        const normalized = normalizeCategoryValue(label);
        return normalized === 'all' ? 'all' : normalized;
    }

    function matchesBrowseCategory(product, selectedCategory) {
        if (selectedCategory === 'all') {
            return true;
        }

        const productCategory = normalizeCategoryValue(product.category);
        if (selectedCategory === 'promo') {
            return productCategory.includes('promo') && isPromoProductVisible(product);
        }

        return productCategory === selectedCategory;
    }

    function getFilteredCatalogueProducts() {
        const selectedCategory = getSelectedBrowseCategoryKey();
        const promoVisibilityMatched = catalogueProducts.filter((product) => (
            !isPromoProduct(product) || isPromoProductVisible(product)
        ));
        const categoryFiltered = promoVisibilityMatched.filter((product) => (
            matchesBrowseCategory(product, selectedCategory)
        ));

        const filterMatched = categoryFiltered.filter((product) => matchesAppliedFilter(product));
        const priceMatched = filterMatched.filter((product) => matchesAppliedPrice(product));
        const searchMatched = priceMatched.filter((product) => matchesAppliedSearch(product));
        return prioritizePromoProducts(applySelectedSort(searchMatched));
    }

    function getSelectedSortValue() {
        const selected = Array.from(sortRadioButtons).find((radio) => radio.checked);
        return selected ? selected.value : '';
    }

    function getSelectedFilterValues() {
        return new Set(
            Array.from(filterCheckboxes)
                .filter((checkbox) => checkbox.checked)
                .map((checkbox) => checkbox.value)
        );
    }

    function getSelectedPriceRangeValue() {
        const selected = Array.from(priceRadioButtons).find((radio) => radio.checked);
        return selected ? selected.value : '';
    }

    function getSelectedPriceSliderValue() {
        if (!priceSlider) {
            return 0;
        }

        const sliderValue = Number(priceSlider.value);
        return Number.isFinite(sliderValue) && sliderValue > 0 ? sliderValue : 0;
    }

    function getSelectedSearchQuery() {
        if (!filterSearchInput) {
            return '';
        }

        return filterSearchInput.value.trim().toLowerCase();
    }

    function hasAppliedCriteria() {
        return appliedSortValue !== ''
            || appliedFilterValues.size > 0
            || appliedPriceRangeValue !== ''
            || appliedPriceSliderValue > 0
            || appliedSearchQuery !== '';
    }

    function syncCommittedFiltersState() {
        setCommittedCatalogueFiltersState(hasAppliedCriteria());
    }

    function compareProductsByName(a, b) {
        const nameA = typeof a.name === 'string' ? a.name : '';
        const nameB = typeof b.name === 'string' ? b.name : '';
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    }

    function applySelectedSort(products) {
        const sortValue = appliedSortValue;
        if (!sortValue) {
            return products;
        }

        const sorted = [...products];
        const hasPrice = (product) => typeof product.priceValue === 'number' && Number.isFinite(product.priceValue);

        sorted.sort((a, b) => {
            const aHasPrice = hasPrice(a);
            const bHasPrice = hasPrice(b);

            // Keep products without a numeric price at the end for both sort directions.
            if (aHasPrice !== bHasPrice) {
                return aHasPrice ? -1 : 1;
            }

            if (!aHasPrice && !bHasPrice) {
                return compareProductsByName(a, b);
            }

            const aPrice = a.priceValue;
            const bPrice = b.priceValue;

            if (sortValue === 'price-low-to-high') {
                if (aPrice !== bPrice) {
                    return aPrice - bPrice;
                }
                return compareProductsByName(a, b);
            }

            if (sortValue === 'price-high-to-low') {
                if (aPrice !== bPrice) {
                    return bPrice - aPrice;
                }
                return compareProductsByName(a, b);
            }

            return 0;
        });

        return sorted;
    }

    function prioritizePromoProducts(products) {
        if (!promosEnabled) {
            return products;
        }

        return [...products].sort((a, b) => {
            const aIsPromo = isPromoProduct(a);
            const bIsPromo = isPromoProduct(b);
            if (aIsPromo === bIsPromo) {
                return 0;
            }
            return aIsPromo ? -1 : 1;
        });
    }

    function matchesAppliedFilter(product) {
        if (appliedFilterValues.size === 0) {
            return true;
        }

        if (appliedFilterValues.has('new') && isNewProduct(product.createdAt)) {
            return true;
        }

        if (appliedFilterValues.has('sale') && product.isOnSale) {
            return true;
        }

        if (appliedFilterValues.has('popular') && popularProductIds.has(product.id)) {
            return true;
        }

        if (appliedFilterValues.has('favorites') && favoriteProductIds.has(product.id)) {
            return true;
        }

        return false;
    }

    function matchesAppliedPrice(product) {
        const hasAppliedPriceFilter = appliedPriceRangeValue !== '' || appliedPriceSliderValue > 0;
        if (!hasAppliedPriceFilter) {
            return true;
        }

        if (typeof product.priceValue !== 'number' || !Number.isFinite(product.priceValue)) {
            return false;
        }

        const price = product.priceValue;

        if (appliedPriceRangeValue === '5-under' && price > 5) {
            return false;
        }

        if (appliedPriceRangeValue === '10-under' && price > 10) {
            return false;
        }

        if (appliedPriceRangeValue === '10-plus' && price < 10) {
            return false;
        }

        if (appliedPriceSliderValue > 0 && price > appliedPriceSliderValue) {
            return false;
        }

        return true;
    }

    function matchesAppliedSearch(product) {
        if (!appliedSearchQuery) {
            return true;
        }

        const queryTerms = appliedSearchQuery
            .split(/\s+/)
            .map((term) => term.trim())
            .filter(Boolean);

        if (queryTerms.length === 0) {
            return true;
        }

        const searchIndex = typeof product.searchIndex === 'string'
            ? product.searchIndex
            : '';

        return queryTerms.every((term) => searchIndex.includes(term));
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

    function createProductPriceElement(product) {
        if (product.priceText === '') {
            return null;
        }

        const priceElement = document.createElement('p');
        priceElement.className = 'catalogue-product-price';

        if (product.isOnSale) {
            priceElement.classList.add('is-sale');

            const compareAt = document.createElement('span');
            compareAt.className = 'price-compare';
            compareAt.textContent = product.compareAtText;

            const currentPrice = document.createElement('span');
            currentPrice.className = 'price-current';
            currentPrice.textContent = product.priceText;

            priceElement.appendChild(compareAt);
            priceElement.appendChild(currentPrice);
            return priceElement;
        }

        priceElement.textContent = product.priceText;
        return priceElement;
    }

    function buildProductSearchIndex({
        name,
        description,
        category,
        tags,
        priceValue,
        compareAtValue
    }) {
        const textParts = [
            name,
            description,
            category,
            ...(Array.isArray(tags) ? tags : [])
        ]
            .filter((value) => typeof value === 'string' && value.trim() !== '')
            .map((value) => value.trim().toLowerCase());

        const numericParts = [];
        [priceValue, compareAtValue].forEach((value) => {
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                return;
            }
            numericParts.push(String(value));
            numericParts.push(value.toFixed(2));
            numericParts.push(`$${value}`);
            numericParts.push(`$${value.toFixed(2)}`);
        });

        return [...textParts, ...numericParts].join(' ');
    }

    function normalizeProducts(rawProducts) {
        if (!Array.isArray(rawProducts)) {
            return [];
        }

        return rawProducts.map((product, index) => {
            const safeProduct = typeof product === 'object' && product !== null ? product : {};
            const name = typeof safeProduct.name === 'string' && safeProduct.name.trim() !== ''
                ? safeProduct.name.trim()
                : `Placeholder Product ${String(index + 1).padStart(2, '0')}`;
            const id = typeof safeProduct.id === 'string' && safeProduct.id.trim() !== ''
                ? safeProduct.id.trim()
                : `product-${index + 1}`;
            const priceValue = parsePriceNumber(safeProduct.price);
            const compareAtValue = parsePriceNumber(safeProduct.compare_at);
            const priceText = formatPriceValue(priceValue);
            const compareAtText = formatPriceValue(compareAtValue);
            const mainImage = typeof safeProduct.main_image === 'string'
                ? safeProduct.main_image.trim()
                : '';
            const createdAt = typeof safeProduct.created_at_yyyy_mm_dd === 'string'
                ? safeProduct.created_at_yyyy_mm_dd.trim()
                : '';
            const isManuallyPopular = safeProduct.popular === true;
            const description = typeof safeProduct.description === 'string'
                ? safeProduct.description.trim()
                : '';
            const tags = Array.isArray(safeProduct.tags)
                ? safeProduct.tags
                    .filter((tag) => typeof tag === 'string' && tag.trim() !== '')
                    .map((tag) => tag.trim())
                : [];
            const category = typeof safeProduct.category === 'string'
                ? safeProduct.category.trim()
                : '';
            const promoRule = typeof safeProduct.promo_rule === 'string'
                ? safeProduct.promo_rule.trim()
                : '';
            const searchIndex = buildProductSearchIndex({
                name,
                description,
                category,
                tags,
                priceValue,
                compareAtValue
            });

            return {
                id,
                name,
                priceValue,
                compareAtValue,
                priceText,
                compareAtText,
                isOnSale: isSaleProduct(priceValue, compareAtValue),
                mainImage,
                createdAt,
                isManuallyPopular,
                description,
                tags,
                searchIndex,
                category,
                promoRule
            };
        });
    }

    function parseProductCreatedAt(createdAtValue) {
        if (typeof createdAtValue !== 'string' || createdAtValue.trim() === '') {
            return null;
        }

        const trimmed = createdAtValue.trim();
        const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
            ? `${trimmed}T00:00:00`
            : trimmed;
        const parsedDate = new Date(normalized);
        return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
    }

    function isNewProduct(createdAtValue) {
        const createdAtDate = parseProductCreatedAt(createdAtValue);
        if (!createdAtDate) {
            return false;
        }

        const ageMs = Date.now() - createdAtDate.getTime();
        if (ageMs < 0) {
            return false;
        }

        const ageDays = ageMs / (24 * 60 * 60 * 1000);
        return ageDays <= NEW_BADGE_MAX_AGE_DAYS;
    }

    function refreshPopularProductIds() {
        const manualPopularIds = new Set(
            catalogueProducts
                .filter((product) => product.isManuallyPopular)
                .map((product) => product.id)
        );

        if (!analytics || typeof analytics.getTopProductIdsByScore !== 'function') {
            popularProductIds = manualPopularIds;
            return;
        }

        const knownProductIds = new Set(catalogueProducts.map((product) => product.id));
        const topProductIds = analytics.getTopProductIdsByScore(3)
            .filter((productId) => knownProductIds.has(productId));
        popularProductIds = new Set([...manualPopularIds, ...topProductIds]);
    }

    function getProductBadges(product) {
        const badges = [];

        if (product.isOnSale) {
            badges.push({
                key: 'sale',
                label: 'Sale',
                iconPath: BADGE_ICON_PATHS.sale
            });
        }

        if (isNewProduct(product.createdAt)) {
            badges.push({
                key: 'new',
                label: 'New',
                iconPath: BADGE_ICON_PATHS.new
            });
        }

        if (popularProductIds.has(product.id)) {
            badges.push({
                key: 'popular',
                label: 'Popular',
                iconPath: BADGE_ICON_PATHS.popular
            });
        }

        return badges;
    }

    function createBadgeElement(badge) {
        const badgeElement = document.createElement('span');
        badgeElement.className = 'catalogue-card-badge';

        const icon = document.createElement('img');
        icon.className = 'catalogue-card-badge-image';
        icon.src = badge.iconPath;
        icon.alt = `${badge.label} badge`;
        icon.loading = 'lazy';
        icon.decoding = 'async';

        icon.addEventListener('error', () => {
            badgeElement.classList.add('catalogue-card-badge-fallback');
            badgeElement.textContent = badge.label;
        });

        badgeElement.appendChild(icon);
        return badgeElement;
    }

    function createBadgeRow(product) {
        const badges = getProductBadges(product);
        if (badges.length === 0) {
            return null;
        }

        const badgeRow = document.createElement('div');
        badgeRow.className = 'catalogue-card-badges';

        badges.forEach((badge) => {
            badgeRow.appendChild(createBadgeElement(badge));
        });

        return badgeRow;
    }

    function refreshVisibleCardBadges() {
        refreshPopularProductIds();

        const visibleCards = catalogueGrid.querySelectorAll('.catalogue-card');
        visibleCards.forEach((card) => {
            const productId = card.dataset.productId;
            const product = productLookupById.get(productId);
            if (!product) {
                return;
            }

            const existingBadgeRow = card.querySelector('.catalogue-card-badges');
            if (existingBadgeRow) {
                existingBadgeRow.remove();
            }

            const nextBadgeRow = createBadgeRow(product);
            if (!nextBadgeRow) {
                return;
            }

            const body = card.querySelector('.catalogue-card-body');
            if (body) {
                card.insertBefore(nextBadgeRow, body);
            } else {
                card.appendChild(nextBadgeRow);
            }
        });
    }

    async function loadProductsFromJson() {
        try {
            const response = await fetch(PRODUCTS_JSON_PATH, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Failed to load products.json (${response.status})`);
            }

            const data = await response.json();
            return normalizeProducts(data);
        } catch (error) {
            console.error('Unable to load product data:', error);
            return [];
        }
    }

    async function loadCatalogueSettings() {
        try {
            const response = await fetch(CATALOGUE_SETTINGS_PATH, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Failed to load catalogue-settings.json (${response.status})`);
            }

            const settings = await response.json();
            return {
                promosEnabled: settings?.promos_enabled === true,
                enabledPromoRuleIds: normalizePromoRuleIds(settings?.enabled_promo_rules)
            };
        } catch (error) {
            return {
                promosEnabled: false,
                enabledPromoRuleIds: new Set()
            };
        }
    }

    function syncPromoBrowseChipVisibility() {
        const hasVisiblePromos = catalogueProducts.some((product) => isPromoProduct(product) && isPromoProductVisible(product));
        browseChips.forEach((chip) => {
            const chipCategory = normalizeCategoryValue(chip.dataset.category || chip.textContent || '');
            if (chipCategory === 'promo') {
                chip.hidden = !hasVisiblePromos;
            }
        });
    }

    function buildProductCard(product) {
        const productId = product.id;
        const card = document.createElement('article');
        card.className = 'catalogue-card';
        card.dataset.productId = productId;
        card.tabIndex = 0;
        card.setAttribute('role', 'link');
        card.setAttribute('aria-label', `View ${product.name}`);
        const image = createProductImageElement(product.name, product.mainImage);
        const badgeRow = createBadgeRow(product);

        const body = document.createElement('div');
        body.className = 'catalogue-card-body';

        const name = document.createElement('h3');
        name.className = 'catalogue-product-name';
        name.textContent = product.name;
        const price = createProductPriceElement(product);

        const favoriteButton = document.createElement('button');
        favoriteButton.type = 'button';
        favoriteButton.className = 'favorite-button';
        favoriteButton.appendChild(createHeartIcon());
        const isPromo = isPromoProduct(product);

        const cartButton = isPromo ? null : createCartButton();
        if (cartButton) {
            cartButton.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                let didAddToCart = false;
                if (cart && typeof cart.addItem === 'function') {
                    const addResult = await cart.addItem({
                        productId,
                        name: product.name,
                        category: product.category,
                        promoRule: product.promoRule,
                        price: product.priceValue,
                        image: product.mainImage
                    }, 1);
                    didAddToCart = addResult?.added === true;
                }
                if (didAddToCart && analytics && typeof analytics.trackAddToCart === 'function') {
                    analytics.trackAddToCart(productId);
                }
                if (didAddToCart && cartFeedback && typeof cartFeedback.announceAdded === 'function') {
                    cartFeedback.announceAdded(cartButton);
                }
                refreshVisibleCardBadges();
            });
        }

        const initiallyFavorited = favoriteProductIds.has(productId);
        setFavoriteVisualState(favoriteButton, initiallyFavorited);

        favoriteButton.addEventListener('click', () => {
            const isCurrentlyFavorited = favoriteProductIds.has(productId);

            if (isCurrentlyFavorited) {
                favoriteProductIds.delete(productId);
                setFavoriteVisualState(favoriteButton, false);
            } else {
                favoriteProductIds.add(productId);
                setFavoriteVisualState(favoriteButton, true, true);
            }

            saveFavoriteProductIds();
            if (appliedFilterValues.has('favorites')) {
                renderFilteredProducts();
            }
        });

        body.appendChild(name);
        if (price) {
            body.appendChild(price);
        }
        card.appendChild(image);
        if (badgeRow) {
            card.appendChild(badgeRow);
        }
        card.appendChild(body);
        const actionRow = document.createElement('div');
        actionRow.className = 'catalogue-card-actions';
        if (cartButton) {
            actionRow.appendChild(cartButton);
        }
        actionRow.appendChild(favoriteButton);
        card.appendChild(actionRow);

        function navigateToProductPage() {
            window.location.href = `product.html?id=${encodeURIComponent(productId)}`;
        }

        card.addEventListener('click', (event) => {
            if (event.target.closest('.favorite-button, .catalogue-cart-button')) {
                return;
            }
            navigateToProductPage();
        });

        card.addEventListener('keydown', (event) => {
            if (event.target.closest('button')) {
                return;
            }
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                navigateToProductPage();
            }
        });

        return card;
    }

    function updateLoadMoreVisibility() {
        loadMoreProductsButton.hidden = renderedProducts >= filteredCatalogueProducts.length;
    }

    function renderMoreProducts(count) {
        refreshPopularProductIds();
        const renderUntil = Math.min(renderedProducts + count, filteredCatalogueProducts.length);
        for (let i = renderedProducts; i < renderUntil; i += 1) {
            const card = buildProductCard(filteredCatalogueProducts[i]);
            catalogueGrid.appendChild(card);
        }
        renderedProducts = renderUntil;
        updateLoadMoreVisibility();
    }

    function renderFilteredProducts() {
        filteredCatalogueProducts = getFilteredCatalogueProducts();
        renderedProducts = 0;
        catalogueGrid.innerHTML = '';
        if (catalogueEmptyState) {
            catalogueEmptyState.hidden = filteredCatalogueProducts.length > 0;
        }
        renderMoreProducts(INITIAL_RENDER);
    }

    function flashFooterButton(button, label) {
        if (!button) {
            return;
        }

        const originalLabel = button.dataset.originalLabel || button.textContent || '';
        if (!button.dataset.originalLabel) {
            button.dataset.originalLabel = originalLabel;
        }

        button.classList.remove('is-feedback');
        void button.offsetWidth;
        button.classList.add('is-feedback');
        button.textContent = label;

        setTimeout(() => {
            button.textContent = button.dataset.originalLabel || originalLabel;
            button.classList.remove('is-feedback');
        }, 700);
    }

    function applyBrowseChipState(selectedChip) {
        browseChips.forEach((chip) => {
            chip.classList.toggle('active', chip === selectedChip);
        });
        updateCatalogueClearFiltersVisibility();
    }

    function initializeBrowseChips() {
        if (browseChips.length === 0) {
            return;
        }

        const allChip = browseChips.find((chip) => normalizeCategoryValue(chip.textContent || '') === 'all') || browseChips[0];
        const urlBrowseCategory = getBrowseCategoryFromUrl();
        const initialChip = browseChips.find((chip) => (
            !chip.hidden
            && normalizeCategoryValue(chip.dataset.category || chip.textContent || '') === urlBrowseCategory
        )) || allChip;

        browseChips.forEach((chip) => {
            chip.addEventListener('click', () => {
                if (chip.classList.contains('active')) {
                    return;
                }
                applyBrowseChipState(chip);
                renderFilteredProducts();
            });
        });

        applyBrowseChipState(initialChip);
    }

    function resetBrowseToAll() {
        if (browseChips.length === 0) {
            return;
        }

        const allChip = browseChips.find((chip) => (
            normalizeCategoryValue(chip.dataset.category || chip.textContent || '') === 'all'
        )) || browseChips[0];

        applyBrowseChipState(allChip);
    }

    async function initializeCatalogueGrid() {
        const [products, settings] = await Promise.all([
            loadProductsFromJson(),
            loadCatalogueSettings()
        ]);
        promosEnabled = settings.promosEnabled;
        enabledPromoRuleIds = settings.enabledPromoRuleIds;
        catalogueProducts = products;
        productLookupById = new Map(catalogueProducts.map((product) => [product.id, product]));
        syncPromoBrowseChipVisibility();
        refreshPopularProductIds();
        appliedSortValue = getSelectedSortValue();
        appliedPriceRangeValue = getSelectedPriceRangeValue();
        appliedPriceSliderValue = getSelectedPriceSliderValue();
        appliedSearchQuery = getSelectedSearchQuery();
        const filterValuesFromUrl = getFilterValuesFromUrl();
        appliedFilterValues = filterValuesFromUrl.size > 0
            ? filterValuesFromUrl
            : getSelectedFilterValues();
        syncFilterCheckboxesWithAppliedValues();
        initializeBrowseChips();
        syncCommittedFiltersState();
        syncFilterTabIndicator();
        updateCatalogueClearFiltersVisibility();
        renderFilteredProducts();
    }

    loadMoreProductsButton.addEventListener('click', () => {
        renderMoreProducts(PRODUCTS_PER_LOAD);
    });

    if (applyFiltersButton) {
        applyFiltersButton.addEventListener('click', () => {
            appliedSortValue = getSelectedSortValue();
            appliedFilterValues = getSelectedFilterValues();
            appliedPriceRangeValue = getSelectedPriceRangeValue();
            appliedPriceSliderValue = getSelectedPriceSliderValue();
            appliedSearchQuery = getSelectedSearchQuery();
            syncCommittedFiltersState();
            renderFilteredProducts();
            flashFooterButton(applyFiltersButton, 'Applied!');
            closeFilterDrawer();
        });
    }

    if (clearFiltersButton) {
        clearFiltersButton.addEventListener('click', () => {
            setTimeout(() => {
                appliedSortValue = getSelectedSortValue();
                appliedFilterValues = getSelectedFilterValues();
                appliedPriceRangeValue = getSelectedPriceRangeValue();
                appliedPriceSliderValue = getSelectedPriceSliderValue();
                appliedSearchQuery = getSelectedSearchQuery();
                syncCommittedFiltersState();
                renderFilteredProducts();
                flashFooterButton(clearFiltersButton, 'Cleared!');
            }, 0);
        });
    }

    if (catalogueClearFiltersButton) {
        catalogueClearFiltersButton.addEventListener('click', () => {
            resetBrowseToAll();

            if (clearFiltersButton) {
                clearFiltersButton.click();
                return;
            }

            appliedSortValue = '';
            appliedFilterValues = new Set();
            appliedPriceRangeValue = '';
            appliedPriceSliderValue = 0;
            appliedSearchQuery = '';
            syncCommittedFiltersState();
            renderFilteredProducts();
            updateCatalogueClearFiltersVisibility();
        });
    }

    window.addEventListener('sidequest:scores-updated', () => {
        refreshVisibleCardBadges();
        if (appliedFilterValues.has('popular')) {
            renderFilteredProducts();
        }
    });

    initializeCatalogueGrid();
}

if (priceSlider && priceRadioButtons.length > 0) {
    function clearPriceRadios() {
        priceRadioButtons.forEach((radio) => {
            radio.checked = false;
        });
    }

    priceRadioButtons.forEach((radio) => {
        radio.addEventListener('change', () => {
            if (radio.checked) {
                priceSlider.value = '0';
                refreshPriceSliderDisplay();
            }
        });
    });

    priceSlider.addEventListener('input', () => {
        refreshPriceSliderDisplay();
        const sliderValue = Number(priceSlider.value);
        if (sliderValue > 0) {
            clearPriceRadios();
        }
    });

    refreshPriceSliderDisplay();
}

if (filterToggle && filterTabCount) {
    function updateFilterTabState() {
        syncFilterTabIndicator();
        updateCatalogueClearFiltersVisibility();
    }

    const filterInputs = [
        ...sortRadioButtons,
        ...filterCheckboxes,
        ...priceRadioButtons
    ];

    filterInputs.forEach((input) => {
        input.addEventListener('change', updateFilterTabState);
    });

    if (priceSlider) {
        priceSlider.addEventListener('input', updateFilterTabState);
    }

    if (filterSearchInput) {
        filterSearchInput.addEventListener('input', updateFilterTabState);
    }

    if (clearFiltersButton) {
        clearFiltersButton.addEventListener('click', () => {
            sortRadioButtons.forEach((input) => {
                input.checked = false;
            });
            filterCheckboxes.forEach((input) => {
                input.checked = false;
            });
            priceRadioButtons.forEach((input) => {
                input.checked = false;
            });

            if (priceSlider) {
                priceSlider.value = '0';
                refreshPriceSliderDisplay();
            }

            if (filterSearchInput) {
                filterSearchInput.value = '';
            }

            updateFilterTabState();
        });
    }

    updateFilterTabState();
}
