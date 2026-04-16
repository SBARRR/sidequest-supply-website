const PRODUCTS_JSON_PATH = 'product%20json/products.json';
const FEATURED_JSON_PATH = 'product%20json/featured.json';

const carousel = document.querySelector('.carousel');
const carouselContainer = document.querySelector('#featured-carousel-container');
const dotsContainer = document.querySelector('#featured-carousel-dots');
const FAVORITES_STORAGE_KEY = 'sidequest-favorites';
const analytics = window.SidequestAnalytics || null;
const cart = window.SidequestCart || null;
const cartFeedback = window.SidequestCartFeedback || null;

let currentIndex = 0;
let totalItems = 0;

let touchStartX = 0;
let touchEndX = 0;
const favoriteProductIds = new Set(loadFavoriteProductIds());

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
        // Ignore storage write errors so UI remains usable.
    }
}

function createHeartOutlineIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('featured-action-icon');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
        'd',
        'M12 21.35L10.55 20.03C5.4 15.36 2 12.28 2 8.5C2 5.42 4.42 3 7.5 3C9.24 3 10.91 3.81 12 5.09C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.42 22 8.5C22 12.28 18.6 15.36 13.45 20.03L12 21.35Z'
    );
    svg.appendChild(path);

    return svg;
}

function setFeaturedFavoriteVisualState(button, isFavorited, animatePop = false) {
    button.classList.toggle('is-favorited', isFavorited);
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

function createFeaturedCardActions(product) {
    const actions = document.createElement('div');
    actions.className = 'featured-card-actions';

    const cartButton = document.createElement('button');
    cartButton.type = 'button';
    cartButton.className = 'featured-action-button featured-cart-button';
    cartButton.setAttribute('aria-label', 'Add to cart');

    const cartIcon = document.createElement('img');
    cartIcon.className = 'featured-action-icon featured-cart-icon';
    cartIcon.src = 'icons/cart/cart.svg';
    cartIcon.alt = '';
    cartButton.appendChild(cartIcon);
    cartButton.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        let didAddToCart = false;
        if (cart && typeof cart.addItem === 'function') {
            const addResult = await cart.addItem({
                productId: product.id,
                name: product.name,
                category: product.category,
                promoRule: product.promoRule,
                price: product.priceValue,
                image: product.imagePath
            }, 1);
            didAddToCart = addResult?.added === true;
        }
        if (didAddToCart && analytics && typeof analytics.trackAddToCart === 'function') {
            analytics.trackAddToCart(product.id);
        }
        if (didAddToCart && cartFeedback && typeof cartFeedback.announceAdded === 'function') {
            cartFeedback.announceAdded(cartButton);
        }
    });

    const favoriteButton = document.createElement('button');
    favoriteButton.type = 'button';
    favoriteButton.className = 'featured-action-button featured-favorite-button';
    favoriteButton.appendChild(createHeartOutlineIcon());
    setFeaturedFavoriteVisualState(
        favoriteButton,
        favoriteProductIds.has(product.id)
    );

    favoriteButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const isCurrentlyFavorited = favoriteProductIds.has(product.id);
        if (isCurrentlyFavorited) {
            favoriteProductIds.delete(product.id);
            setFeaturedFavoriteVisualState(favoriteButton, false);
        } else {
            favoriteProductIds.add(product.id);
            setFeaturedFavoriteVisualState(favoriteButton, true, true);
        }
        saveFavoriteProductIds();
    });

    actions.appendChild(cartButton);
    actions.appendChild(favoriteButton);
    return actions;
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

function createFeaturedPriceElement(itemData) {
    if (!itemData.priceText) {
        return null;
    }

    const priceElement = document.createElement('p');
    priceElement.className = 'catalogue-product-price';

    if (itemData.isOnSale) {
        priceElement.classList.add('is-sale');

        const compareAt = document.createElement('span');
        compareAt.className = 'price-compare';
        compareAt.textContent = itemData.compareAtText;

        const currentPrice = document.createElement('span');
        currentPrice.className = 'price-current';
        currentPrice.textContent = itemData.priceText;

        priceElement.appendChild(compareAt);
        priceElement.appendChild(currentPrice);
        return priceElement;
    }

    priceElement.textContent = itemData.priceText;
    return priceElement;
}

function navigateToProduct(productId) {
    if (!productId) {
        return;
    }
    window.location.href = `product.html?id=${encodeURIComponent(productId)}`;
}

function createPlaceholderImage() {
    const placeholder = document.createElement('div');
    placeholder.className = 'catalogue-image';
    placeholder.textContent = 'Placeholder Image';
    return placeholder;
}

function createProductImage(productName, imagePath) {
    if (!imagePath) {
        return createPlaceholderImage();
    }

    const image = document.createElement('img');
    image.className = 'catalogue-image catalogue-image-media';
    image.src = imagePath;
    image.alt = productName || 'Featured product';
    image.loading = 'lazy';
    image.decoding = 'async';

    image.addEventListener('error', () => {
        image.replaceWith(createPlaceholderImage());
    });

    return image;
}

function updateCarousel() {
    if (!carouselContainer || totalItems === 0) {
        return;
    }

    carouselContainer.style.transform = `translateX(-${currentIndex * 100}%)`;

    const dots = dotsContainer ? dotsContainer.querySelectorAll('.dot') : [];
    dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === currentIndex);
    });
}

function currentSlide(index) {
    if (totalItems === 0) {
        return;
    }

    currentIndex = index;
    updateCarousel();
}

function nextSlide() {
    if (totalItems === 0) {
        return;
    }

    currentIndex = (currentIndex + 1) % totalItems;
    updateCarousel();
}

function prevSlide() {
    if (totalItems === 0) {
        return;
    }

    currentIndex = (currentIndex - 1 + totalItems) % totalItems;
    updateCarousel();
}

function handleSwipe() {
    if (touchStartX - touchEndX > 50) {
        nextSlide();
    } else if (touchEndX - touchStartX > 50) {
        prevSlide();
    }
}

function getFeaturedConfigEntries(configData) {
    if (Array.isArray(configData)) {
        return configData;
    }

    if (configData && Array.isArray(configData.featured)) {
        return configData.featured;
    }

    return [];
}

function normalizeFeaturedEntries(entries, productsById) {
    return entries
        .map((entry) => {
            if (typeof entry === 'string') {
                return {
                    product_id: entry
                };
            }
            if (typeof entry === 'object' && entry !== null) {
                return entry;
            }
            return null;
        })
        .filter((entry) => entry && typeof entry.product_id === 'string')
        .map((entry) => {
            const product = productsById.get(entry.product_id.trim());
            if (!product) {
                return null;
            }

            const productName = typeof product.name === 'string' ? product.name.trim() : '';
            const name = productName || 'Untitled Product';
            const priceValue = parsePriceNumber(product.price);
            const compareAtValue = parsePriceNumber(product.compare_at);
            const priceText = formatPriceValue(priceValue);
            const compareAtText = formatPriceValue(compareAtValue);
            const imageFromProduct = typeof product.main_image === 'string' ? product.main_image.trim() : '';
            const imageOverride = typeof entry.main_image === 'string' ? entry.main_image.trim() : '';
            const imagePath = imageOverride || imageFromProduct;
            const category = typeof product.category === 'string' ? product.category.trim() : '';
            const promoRule = typeof product.promo_rule === 'string' ? product.promo_rule.trim() : '';

            return {
                id: product.id || entry.product_id,
                name,
                category,
                promoRule,
                priceValue,
                priceText,
                compareAtText,
                isOnSale: isSaleProduct(priceValue, compareAtValue),
                imagePath
            };
        })
        .filter(Boolean);
}

async function loadJson(path) {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to load ${path} (${response.status})`);
    }
    return response.json();
}

function renderFeaturedCarousel(featuredItems) {
    if (!carouselContainer || !dotsContainer) {
        return;
    }

    carouselContainer.innerHTML = '';
    dotsContainer.innerHTML = '';
    currentIndex = 0;
    totalItems = featuredItems.length;

    if (totalItems === 0) {
        const item = document.createElement('div');
        item.className = 'carousel-item';

        const card = document.createElement('article');
        card.className = 'catalogue-card featured-catalogue-card';

        const body = document.createElement('div');
        body.className = 'catalogue-card-body featured-catalogue-card-body';
        const info = document.createElement('p');
        info.className = 'catalogue-product-name';
        info.textContent = 'No featured products yet';

        body.appendChild(info);
        card.appendChild(body);
        item.appendChild(card);
        carouselContainer.appendChild(item);
        return;
    }

    featuredItems.forEach((itemData, index) => {
        const item = document.createElement('div');
        item.className = 'carousel-item';

        const card = document.createElement('article');
        card.className = 'catalogue-card featured-catalogue-card';
        card.setAttribute('role', 'link');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `View ${itemData.name}`);

        const image = createProductImage(itemData.name, itemData.imagePath);
        const body = document.createElement('div');
        body.className = 'catalogue-card-body featured-catalogue-card-body';
        const name = document.createElement('h3');
        name.className = 'catalogue-product-name';
        name.textContent = itemData.name;
        const price = createFeaturedPriceElement(itemData);
        const actions = createFeaturedCardActions(itemData);

        body.appendChild(name);
        if (price) {
            body.appendChild(price);
        }
        card.appendChild(image);
        card.appendChild(body);
        card.appendChild(actions);
        card.addEventListener('click', () => {
            navigateToProduct(itemData.id);
        });
        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                navigateToProduct(itemData.id);
            }
        });
        item.appendChild(card);
        carouselContainer.appendChild(item);

        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = `dot${index === 0 ? ' active' : ''}`;
        dot.setAttribute('aria-label', `Go to featured item ${index + 1}`);
        dot.addEventListener('click', () => {
            currentSlide(index);
        });
        dotsContainer.appendChild(dot);
    });

    updateCarousel();
}

async function initializeFeaturedCarousel() {
    if (!carouselContainer || !dotsContainer) {
        return;
    }

    try {
        const [productsData, featuredConfigData] = await Promise.all([
            loadJson(PRODUCTS_JSON_PATH),
            loadJson(FEATURED_JSON_PATH)
        ]);

        const products = Array.isArray(productsData) ? productsData : [];
        const productsById = new Map();
        products.forEach((product) => {
            if (product && typeof product.id === 'string' && product.id.trim() !== '') {
                productsById.set(product.id.trim(), product);
            }
        });

        const featuredEntries = getFeaturedConfigEntries(featuredConfigData);
        const featuredItems = normalizeFeaturedEntries(featuredEntries, productsById);
        renderFeaturedCarousel(featuredItems);
    } catch (error) {
        console.error('Unable to initialize featured carousel:', error);
        renderFeaturedCarousel([]);
    }
}

if (carousel) {
    carousel.addEventListener('touchstart', (event) => {
        touchStartX = event.changedTouches[0].screenX;
    });

    carousel.addEventListener('touchend', (event) => {
        touchEndX = event.changedTouches[0].screenX;
        handleSwipe();
    });
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
        prevSlide();
    } else if (event.key === 'ArrowRight') {
        nextSlide();
    }
});

initializeFeaturedCarousel();
