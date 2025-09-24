"use strict";

/**
 * Weather Vue – vanilla JavaScript helper that consumes the Open-Meteo API and
 * renders both current conditions and a five day forecast. The script only uses
 * DOM manipulation (querying, creating and updating nodes) so that it stays
 * framework free and easy to understand.
 */

/** Default location that keeps the interface populated on first load. */
const DEFAULT_CITY = "Paris";

/** Base endpoints for the free Open-Meteo API services we rely on. */
const GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";

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

    try {
        setStatus(`Loading weather for ${trimmed}…`);

        const location = await fetchLocation(trimmed);
        const forecast = await fetchForecast(location);

        renderCurrentWeather(location, forecast);
        renderForecast(forecast);
        setStatus(`Weather updated for ${location.name}, ${location.country}.`);
    } catch (error) {
        console.error(error);
        setStatus(error.message, true);
    }
}

/**
 * Queries the geocoding API to turn a city name into coordinates.
 *
 * @param {string} query - City, postal code or "city,country" pair.
 * @returns {Promise<object>} Location record with coordinates.
 */
async function fetchLocation(query) {
    const params = new URLSearchParams({
        name: query,
        count: "1",
        language: "en",
        format: "json"
    });

    const payload = await fetchJson(`${GEOCODING_ENDPOINT}?${params.toString()}`);

    if (!payload?.results?.length) {
        throw new Error("City not found. Check the spelling or try another location.");
    }

    const [result] = payload.results;
    return {
        name: result.name,
        country: result.country ?? result.country_code ?? "",
        latitude: result.latitude,
        longitude: result.longitude,
        timezone: result.timezone ?? "auto"
    };
}

/**
 * Fetches the weather forecast for a location previously resolved via geocoding.
 *
 * @param {object} location - Location record returned by {@link fetchLocation}.
 * @returns {Promise<object>} Forecast payload with current, hourly and daily data.
 */
async function fetchForecast(location) {
    const params = new URLSearchParams({
        latitude: location.latitude,
        longitude: location.longitude,
        timezone: location.timezone,
        current_weather: "true",
        hourly: ["apparent_temperature", "relativehumidity_2m", "pressure_msl"].join(","),
        daily: ["weathercode", "temperature_2m_max", "temperature_2m_min"].join(",")
    });

    return fetchJson(`${FORECAST_ENDPOINT}?${params.toString()}`);
}

/**
 * Fetches an endpoint and converts the response to JSON while surfacing
 * user-friendly error messages for the most common failure scenarios.
 *
 * @param {string} url - Endpoint to call.
 * @returns {Promise<object>} Parsed JSON payload.
 */
async function fetchJson(url) {
    const response = await fetch(url);

    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message = body.error ?? body.reason ?? body.message;
        throw new Error(message ? capitalizeFirstLetter(message) : "Something went wrong while loading the weather data.");
    }

    return response.json();
}

/**
 * Renders the current weather card by updating existing nodes only.
 *
 * @param {object} location - Location metadata (name, country, timezone).
 * @param {object} forecast - Forecast payload from Open-Meteo.
 */
function renderCurrentWeather(location, forecast) {
    const current = forecast.current_weather;
    const hourly = forecast.hourly ?? {};
    const hourlyIndex = Array.isArray(hourly.time)
        ? hourly.time.indexOf(current.time)
        : -1;

    elements.city.textContent = `${location.name}, ${location.country}`;
    elements.updated.textContent = `Updated ${formatRelativeTime(new Date(current.time))}`;

    const weatherDescription = getWeatherDescription(current.weathercode);
    elements.icon.textContent = getWeatherEmoji(current.weathercode);
    elements.icon.setAttribute("aria-label", weatherDescription);

    elements.temperature.textContent = `${Math.round(current.temperature)}°C`;
    elements.summary.textContent = weatherDescription;

    const feelsLike = getHourlyValue(hourly.apparent_temperature, hourlyIndex);
    const humidity = getHourlyValue(hourly.relativehumidity_2m, hourlyIndex);
    const pressure = getHourlyValue(hourly.pressure_msl, hourlyIndex);

    elements.feelsLike.textContent = typeof feelsLike === "number" ? `${Math.round(feelsLike)}°C` : "—";
    elements.wind.textContent = `${Math.round(current.windspeed)} km/h`;
    elements.humidity.textContent = typeof humidity === "number" ? `${Math.round(humidity)}%` : "—";
    elements.pressure.textContent = typeof pressure === "number" ? `${Math.round(pressure)} hPa` : "—";
}

/**
 * Converts the forecast list into daily summaries and renders up to five cards.
 *
 * @param {object} forecast - Forecast payload from Open-Meteo.
 */
function renderForecast(forecast) {
    const daily = forecast.daily ?? {};
    const days = summariseForecast(daily).slice(0, 5);
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

        const icon = document.createElement("div");
        icon.className = "forecast-icon";
        icon.textContent = getWeatherEmoji(day.weathercode);
        icon.setAttribute("aria-label", getWeatherDescription(day.weathercode));

        const temps = document.createElement("p");
        temps.className = "forecast-temp";
        temps.textContent = `High ${Math.round(day.max)}°C • Low ${Math.round(day.min)}°C`;

        const desc = document.createElement("p");
        desc.className = "forecast-desc";
        desc.textContent = getWeatherDescription(day.weathercode);

        article.append(heading, icon, temps, desc);
        elements.forecastGrid.append(article);
    });
}

/**
 * Turns the daily arrays returned by the Open-Meteo API into a friendlier
 * structure that mirrors the format used by the previous renderer.
 *
 * @param {object} daily - Daily section of the forecast payload.
 * @returns {Array<object>} Sorted list of daily summaries.
 */
function summariseForecast(daily) {
    const times = Array.isArray(daily.time) ? daily.time : [];
    const weatherCodes = Array.isArray(daily.weathercode) ? daily.weathercode : [];
    const maxTemps = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max : [];
    const minTemps = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min : [];

    return times.map((time, index) => ({
        date: new Date(time),
        weathercode: weatherCodes[index],
        max: maxTemps[index],
        min: minTemps[index]
    })).sort((a, b) => a.date - b.date);
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
function getWeatherEmoji(code = 0) {
    if ([0].includes(code)) return "☀️"; // Clear sky
    if ([1, 2, 3].includes(code)) return "⛅"; // Mainly clear to overcast
    if ([45, 48].includes(code)) return "🌫️"; // Fog
    if ([51, 53, 55, 56, 57].includes(code)) return "🌦️"; // Drizzle / freezing drizzle
    if ([61, 63, 65].includes(code)) return "🌧️"; // Rain
    if ([66, 67].includes(code)) return "🌧️"; // Freezing rain
    if ([71, 73, 75, 77].includes(code)) return "❄️"; // Snow fall / grains
    if ([80, 81, 82].includes(code)) return "🌧️"; // Rain showers
    if ([85, 86].includes(code)) return "❄️"; // Snow showers
    if ([95, 96, 99].includes(code)) return "⛈️"; // Thunderstorm variants
    return "☁️"; // Fallback cloud cover
}

/**
 * Maps the Open-Meteo weather code to a human-readable description.
 *
 * @param {number} code - Weather code provided by Open-Meteo.
 * @returns {string} English description ready for UI use.
 */
function getWeatherDescription(code = 0) {
    const descriptions = new Map([
        [[0], "Clear sky"],
        [[1], "Mainly clear"],
        [[2], "Partly cloudy"],
        [[3], "Overcast"],
        [[45], "Fog"],
        [[48], "Depositing rime fog"],
        [[51], "Light drizzle"],
        [[53], "Moderate drizzle"],
        [[55], "Dense drizzle"],
        [[56], "Light freezing drizzle"],
        [[57], "Dense freezing drizzle"],
        [[61], "Slight rain"],
        [[63], "Moderate rain"],
        [[65], "Heavy rain"],
        [[66], "Light freezing rain"],
        [[67], "Heavy freezing rain"],
        [[71], "Slight snowfall"],
        [[73], "Moderate snowfall"],
        [[75], "Heavy snowfall"],
        [[77], "Snow grains"],
        [[80], "Slight rain showers"],
        [[81], "Moderate rain showers"],
        [[82], "Violent rain showers"],
        [[85], "Slight snow showers"],
        [[86], "Heavy snow showers"],
        [[95], "Thunderstorm"],
        [[96], "Thunderstorm with light hail"],
        [[99], "Thunderstorm with heavy hail"]
    ]);

    for (const [codes, description] of descriptions.entries()) {
        if (codes.includes(code)) {
            return description;
        }
    }

    return "Unknown conditions";
}

/**
 * Safely extracts a value from an hourly array based on the provided index.
 *
 * @param {Array<number>} values - Hourly values from the API.
 * @param {number} index - Index that matches the current weather timestamp.
 * @returns {number|undefined} Extracted value or undefined when missing.
 */
function getHourlyValue(values, index) {
    if (!Array.isArray(values) || index < 0 || index >= values.length) {
        return undefined;
    }
    return values[index];
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
