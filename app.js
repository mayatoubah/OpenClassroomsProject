"use strict";

/**
 * Weather Vue – vanilla JavaScript helper that consumes the OpenWeatherMap API
 * and renders both current conditions and a five day forecast. The script only
 * uses DOM manipulation (querying, creating and updating nodes) so that it
 * stays framework free and easy to understand.
 */

/**
 * Replace the placeholder with your personal OpenWeatherMap API key. You can
 * obtain one for free at https://openweathermap.org/api.
 */
const API_KEY = "INSERT_YOUR_OPENWEATHERMAP_KEY_HERE";

/** Default location that keeps the interface populated on first load. */
const DEFAULT_CITY = "Paris";

/** Grab the main controls that power the search workflow. */
const searchForm = document.querySelector(".search");
const cityInput = document.querySelector("#city-input");
const statusMessage = document.querySelector("[data-status]");

/**
 * Cache the DOM nodes we repeatedly update so we avoid unnecessary lookups.
 * All selectors match the "data-*" attributes declared in index.html.
 */
const elements = Object.freeze({
    city: document.querySelector("[data-city]"),
    updated: document.querySelector("[data-updated]"),
    icon: document.querySelector("[data-current-icon]"),
    temperature: document.querySelector("[data-temperature]"),
    summary: document.querySelector("[data-summary]"),
    feelsLike: document.querySelector("[data-feels-like]"),
    wind: document.querySelector("[data-wind]"),
    humidity: document.querySelector("[data-humidity]"),
    pressure: document.querySelector("[data-pressure]"),
    forecastGrid: document.querySelector("[data-forecast]")
});

/**
 * Small helper map that builds the API URLs we need. Keeping this logic in a
 * single place simplifies testing and future endpoint additions.
 */
const ENDPOINTS = Object.freeze({
    current: (query) => buildUrl("weather", query),
    forecast: (query) => buildUrl("forecast", query)
});

/**
 * Builds the OpenWeatherMap URL for the desired resource using a consistent
 * configuration (metric units and English language).
 *
 * @param {"weather"|"forecast"} resource - API resource to request.
 * @param {string} query - City name, postal code or "city,country" pair.
 * @returns {string} A fully qualified request URL.
 */
function buildUrl(resource, query) {
    const params = new URLSearchParams({
        q: query,
        units: "metric",
        lang: "en",
        appid: API_KEY
    });

    return `https://api.openweathermap.org/data/2.5/${resource}?${params.toString()}`;
}

/**
 * Provides feedback to users by updating the polite live region.
 *
 * @param {string} message - Text to display.
 * @param {boolean} [isError=false] - Whether to style the message as an error.
 */
function setStatus(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.classList.toggle("error", isError);
}

/** Clears the live region without removing it from the DOM. */
function clearStatus() {
    statusMessage.textContent = "";
    statusMessage.classList.remove("error");
}

/**
 * Loads current and forecast weather for the requested city. The function is
 * deliberately linear to stay beginner friendly: validate input, fetch data and
 * finally render it in the UI using DOM manipulation.
 *
 * @param {string} city - Value typed by the user.
 */
async function loadWeather(city) {
    const trimmed = city.trim();
    if (!trimmed) {
        setStatus("Please enter a valid city name before searching.", true);
        return;
    }

    if (!API_KEY || API_KEY === "INSERT_YOUR_OPENWEATHERMAP_KEY_HERE") {
        setStatus("Add your OpenWeatherMap API key in app.js to run a search.", true);
        return;
    }

    try {
        setStatus(`Loading weather for ${trimmed}…`);

        // Fetch current conditions and the 5-day / 3-hour forecast concurrently.
        const [current, forecast] = await Promise.all([
            fetchJson(ENDPOINTS.current(trimmed)),
            fetchJson(ENDPOINTS.forecast(trimmed))
        ]);

        renderCurrentWeather(current);
        renderForecast(forecast.list, current.timezone);
        setStatus(`Weather updated for ${current.name}, ${current.sys.country}.`);
    } catch (error) {
        console.error(error);
        setStatus(error.message, true);
    }
}

/**
 * Fetches an endpoint and converts the response to JSON while surfacing
 * user-friendly error messages for the most common failure scenarios.
 *
 * @param {string} url - OpenWeatherMap endpoint to call.
 * @returns {Promise<object>} Parsed JSON payload.
 */
async function fetchJson(url) {
    const response = await fetch(url);

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error("City not found. Check the spelling or try another location.");
        }

        const body = await response.json().catch(() => ({}));
        throw new Error(body.message ? capitalizeFirstLetter(body.message) : "Something went wrong while loading the weather data.");
    }

    return response.json();
}

/**
 * Renders the current weather card by updating existing nodes only.
 *
 * @param {object} current - Current weather payload from OpenWeatherMap.
 */
function renderCurrentWeather(current) {
    elements.city.textContent = `${current.name}, ${current.sys.country}`;
    elements.updated.textContent = `Updated ${formatRelativeTime(new Date(current.dt * 1000))}`;

    const description = current.weather?.[0]?.description ?? "";
    elements.icon.textContent = getWeatherEmoji(current.weather?.[0]);
    elements.icon.setAttribute("aria-label", description);

    elements.temperature.textContent = `${Math.round(current.main.temp)}°C`;
    elements.summary.textContent = capitalizeFirstLetter(description);
    elements.feelsLike.textContent = `${Math.round(current.main.feels_like)}°C`;
    elements.wind.textContent = `${Math.round(current.wind.speed * 3.6)} km/h`;
    elements.humidity.textContent = `${current.main.humidity}%`;
    elements.pressure.textContent = `${current.main.pressure} hPa`;
}

/**
 * Converts the forecast list into daily summaries and renders up to five cards.
 *
 * @param {Array<object>} list - 3-hour forecast entries from the API.
 * @param {number} timezoneOffset - Offset in seconds from UTC for the city.
 */
function renderForecast(list, timezoneOffset) {
    const safeList = Array.isArray(list) ? list : [];
    const days = summariseForecast(safeList, timezoneOffset).slice(0, 5);
    elements.forecastGrid.innerHTML = "";

    if (!days.length) {
        elements.forecastGrid.innerHTML = '<p class="placeholder">No forecast data is currently available.</p>';
        return;
    }

    days.forEach((day, index) => {
        const article = document.createElement("article");
        article.className = "forecast-card";

        const heading = document.createElement("h4");
        heading.textContent = index === 0 ? "Today" : capitalizeFirstLetter(formatWeekday(day.date));

        const representativeWeather = day.representative.weather?.[0] ?? {};
        const icon = document.createElement("div");
        icon.className = "forecast-icon";
        icon.textContent = getWeatherEmoji(representativeWeather);
        icon.setAttribute("aria-label", representativeWeather.description ?? "");

        const temps = document.createElement("p");
        temps.className = "forecast-temp";
        temps.textContent = `High ${Math.round(day.max)}°C • Low ${Math.round(day.min)}°C`;

        const desc = document.createElement("p");
        desc.className = "forecast-desc";
        desc.textContent = capitalizeFirstLetter(representativeWeather.description);

        article.append(heading, icon, temps, desc);
        elements.forecastGrid.append(article);
    });
}

/**
 * Groups the 3-hour forecast entries by local day and keeps handy statistics for
 * rendering. The representative entry is the one closest to midday, which tends
 * to summarise the day nicely.
 *
 * @param {Array<object>} list - 3-hour forecast entries from the API.
 * @param {number} [timezoneOffset=0] - Offset from UTC in seconds.
 * @returns {Array<object>} Sorted list of daily summaries.
 */
function summariseForecast(list, timezoneOffset = 0) {
    const byDate = new Map();

    list.forEach((entry) => {
        const localDate = toLocalDate(entry.dt, timezoneOffset);
        const key = localDate.toISOString().split("T")[0];

        if (!byDate.has(key)) {
            byDate.set(key, {
                date: localDate,
                min: entry.main.temp_min,
                max: entry.main.temp_max,
                representative: entry,
                refHourDiff: Math.abs(localDate.getHours() - 12)
            });
            return;
        }

        const day = byDate.get(key);
        day.min = Math.min(day.min, entry.main.temp_min);
        day.max = Math.max(day.max, entry.main.temp_max);

        const hourDiff = Math.abs(localDate.getHours() - 12);
        if (hourDiff < day.refHourDiff) {
            day.representative = entry;
            day.refHourDiff = hourDiff;
        }
    });

    return Array.from(byDate.values()).sort((a, b) => a.date - b.date);
}

/**
 * Converts a UTC timestamp and timezone offset to a Date representing local
 * time at the queried location.
 *
 * @param {number} utcSeconds - Timestamp in seconds since epoch.
 * @param {number} timezoneOffset - Offset from UTC in seconds.
 * @returns {Date} Local date/time object.
 */
function toLocalDate(utcSeconds, timezoneOffset) {
    const utcMillis = utcSeconds * 1000;
    return new Date(utcMillis + timezoneOffset * 1000);
}

/**
 * Human friendly relative time helper (e.g. "3 minutes ago").
 *
 * @param {Date} date - Date to compare against now.
 * @returns {string} English relative timestamp.
 */
function formatRelativeTime(date) {
    const diffInMs = date.getTime() - Date.now();
    const minutes = Math.round(diffInMs / (1000 * 60));
    const hours = Math.round(diffInMs / (1000 * 60 * 60));
    const days = Math.round(diffInMs / (1000 * 60 * 60 * 24));
    const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

    if (Math.abs(diffInMs) < 45 * 1000) {
        return "just now";
    }

    if (Math.abs(minutes) < 60) {
        return rtf.format(minutes, "minute");
    }

    if (Math.abs(hours) < 24) {
        return rtf.format(hours, "hour");
    }

    return rtf.format(days, "day");
}

/**
 * Formats the weekday (e.g. Monday) for a given date in English.
 *
 * @param {Date} date - Date to format.
 * @returns {string} Localised weekday label.
 */
function formatWeekday(date) {
    return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date);
}

/**
 * Makes sure strings coming from the API start with a capital letter.
 *
 * @param {string} [text=""] - Weather description.
 * @returns {string} Normalised text.
 */
function capitalizeFirstLetter(text = "") {
    if (!text) {
        return "";
    }
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Maps OpenWeatherMap condition codes to a simple emoji. The fallback is a
 * cloudy icon so that the UI never appears empty.
 *
 * @param {object} [weather={}] - Weather condition object containing an `id`.
 * @returns {string} Emoji representing the condition.
 */
function getWeatherEmoji(weather = {}) {
    const id = weather.id ?? 800;

    if (id >= 200 && id < 300) return "⛈️"; // Thunderstorm
    if (id >= 300 && id < 400) return "🌦️"; // Drizzle
    if (id >= 500 && id < 600) return "🌧️"; // Rain
    if (id >= 600 && id < 700) return "❄️"; // Snow
    if (id >= 700 && id < 800) return "🌫️"; // Atmosphere (mist, smoke…)
    if (id === 800) return "☀️"; // Clear sky
    if (id === 801) return "🌤️"; // Few clouds
    if (id === 802) return "⛅"; // Scattered clouds
    return "☁️"; // Broken/overcast clouds
}

// Wire up the search form so it never reloads the page and instead calls our loader.
searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    clearStatus();
    loadWeather(cityInput.value);
});

// Trigger an initial search when a default city is provided.
if (DEFAULT_CITY) {
    cityInput.value = DEFAULT_CITY;
    loadWeather(DEFAULT_CITY);
}
