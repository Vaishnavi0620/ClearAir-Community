# ClearAir Civic

A full-stack GenAI-powered assistant that helps families and communities navigate severe winter smog and urban air pollution. ClearAir Civic combines live atmospheric and particulate telemetry with household-tailored guidance, indoor air quality interventions, transparent impact modeling, and real-time fluctuation alerts.

## Features

- **Live Localized Air Telemetry & 24-Hour Dispersion Chart**
  - Real-time US AQI, EU AQI, PM2.5, PM10, NO₂, Ozone (O₃), wind speed, temperature, humidity, and winter thermal inversion risk via Open-Meteo APIs.
  - Interactive 24-hour SVG forecast chart with hover inspection, AQI/PM2.5 mode switching, and automatic detection of optimal **Clean-Air Ventilation Windows**.
  - City search, browser geolocation lookup, and quick-switch presets for winter smog hotspots (Salt Lake City, New Delhi, Lahore, Krakow, Milan, Beijing).
- **Real-Time Air Quality Fluctuation Alerts**
  - Detects active threshold crossings, upcoming 3-hour PM2.5 surges, and boundary-layer inversion traps.
  - Configurable polling intervals (Manual, 5 min, 15 min), customizable US AQI alert threshold (`75`, `100`, `150`, `200`), optional browser notifications, and an interactive **Test Spike Alert** toggle.
- **Tailored Low-Emission Routines, Indoor Air Hacks & Sustainable Alternatives**
  - Server-side Gemini integration (`gemini-4-hydrogen` with automatic `gemini-3.1-flash-lite` fallback and exponential backoff) generates structured, location- and profile-specific recommendations across:
    - **Low-Emission Daily Routines**
    - **Indoor Air Quality Hacks**
    - **Sustainable Alternatives**
  - Each recommendation explains both **Direct Health Impact** (estimated indoor PM2.5/NO₂ exposure avoided) and **Community Airshed Impact** (emissions prevented during stagnant winter inversions), along with the underlying physical mechanism.
- **Direct Choice & Community Impact Ledger**
  - Track committed household choices (`localStorage`-persisted) to view cumulative daily PM2.5 exposure avoided (`µg/m³` and `%`), weekly household carbon reductions (`kg CO₂e/wk`), and a neighborhood adoption simulator (`1` to `150` households).
- **Family & Community Smog Advisor**
  - Conversational assistant grounded in live local telemetry and your household profile, with optional **Google Search Grounding** for local burn bans, transit advisories, and cited web sources.

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons
- **Backend**: Express, Node.js, `tsx`
- **AI**: Google GenAI SDK (`@google/genai`) using `gemini-4-hydrogen` (with `gemini-3.1-flash-lite` fallback)
- **Live Data Feeds**: Open-Meteo Air Quality API, Open-Meteo Weather Forecast API, Open-Meteo Geocoding API, OpenStreetMap Nominatim (reverse geocoding)

## Project Structure

```text
├── server.ts                          # Express server, Open-Meteo telemetry, & server-side Gemini routes
├── index.html                         # HTML entry point & Google Fonts
├── package.json
├── .env.example                       # Required environment variable template
└── src/
    ├── App.tsx                        # Main application state, polling, & plan caching
    ├── index.css                      # Tailwind CSS v4 & typography tokens
    ├── types/
    │   └── air.ts                     # Shared TypeScript domain interfaces
    ├── utils/
    │   └── aqi.ts                     # Severity styles, presets, & default profile
    └── components/
        ├── TopNav.tsx                 # Three-zone top navigation header
        ├── LocationAndProfileBar.tsx  # City search, geolocation, & household profile setup
        ├── AirTelemetryPanel.tsx      # Live AQI/PM2.5 readout & interactive 24h SVG chart
        ├── FluctuationAlertsFeed.tsx  # Real-time spike/inversion alerts & notification controls
        ├── TailoredPlanSection.tsx    # GenAI routines, indoor hacks, & direct impact cards
        ├── ImpactSimulator.tsx        # Household & community impact ledger
        └── SmogAdvisorChat.tsx        # Grounded conversational smog advisor
```

## Getting Started

### Prerequisites

- Node.js 20+ (Node 22 recommended)
- A Google Gemini API key

### Installation

1. Clone the repository and install dependencies:

   ```bash
   npm install
   ```

2. Configure environment variables by copying `.env.example` to `.env` and adding your Gemini API key:

   ```bash
   cp .env.example .env
   ```

   ```env
   GEMINI_API_KEY="your_gemini_api_key"
   APP_URL="http://localhost:3000"
   ```

3. Start the development server (Express + Vite middleware on port `3000`):

   ```bash
   npm run dev
   ```

4. Open `http://localhost:3000` in your browser.

## Available Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Starts the Express + Vite development server via `tsx server.ts` on port `3000` |
| `npm run build` | Builds the production frontend bundle into `dist/` |
| `npm run start` | Runs the production server (`node server.ts`) serving `dist/` |
| `npm run lint` | Runs TypeScript type checking (`tsc --noEmit`) |

## Backend API Endpoints

- `GET /api/locations/search?q=<city>` — Search global cities and coordinates.
- `GET /api/locations/reverse?lat=<lat>&lon=<lon>` — Reverse-geocode coordinates to a city/locality.
- `GET /api/air-quality?lat=<lat>&lon=<lon>&name=<name>&country=<country>&timezone=<tz>&threshold=<aqi>` — Fetch live air quality, 24-hour forecast, inversion risk, clean-air ventilation window, and fluctuation alerts.
- `POST /api/assistant/plan` — Generate a structured JSON plan of tailored routines, indoor air hacks, sustainable alternatives, and direct impact metrics.
- `POST /api/assistant/chat` — Conversational advisor endpoint with live telemetry context and optional Google Search grounding.

## License

Apache-2.0
