# TRMNL Web

A web application that displays a Larapaper device screen in your browser.

## Features

- **Larapaper Server Support**: Configure your Larapaper server URL
- **Device Mapping Support**: Optional MAC address support for servers that require API key + MAC routing
- **Single-Step Setup**: `Connect` saves server URL, optional MAC, and API key together
- **Display Device Screen**: View your device display directly in your browser
- **Auto Refresh**: Automatically fetches new images at the interval set by your device (default: 30 seconds)
- **Countdown Timer**: Shows time until next refresh
- **Manual Refresh**: Force refresh the display at any time
- **Refresh Interval Override**: Optionally override device `refresh_rate` in settings
- **Multi-Device Support**: Switch between multiple Larapaper devices (if you have more than one)
- **Privacy-Oriented Rendering**: Images are rendered as encoded data URLs in the browser
- **Persistent Storage**: Connection settings and cached image metadata are stored in localStorage
- **Dark/Light Mode**: E-ink display filters adapt to your system preference

## Getting Started

### Prerequisites

- A Larapaper server account
- Bun installed

### Installation

1. Clone this repository:

   ```bash
   git clone <your-repo-url>
   cd trmnl-web
   ```

2. Install dependencies:

   ```bash
   bun install
   ```

3. Start the development server:

   ```bash
   bun run dev
   ```

4. Open `http://localhost:5173` in your browser

### Run with Docker

Build and run locally:

```bash
docker build -t trmnl-web:local .
docker run --rm -p 8080:80 \
  -e TRMNL_BASE_URL="https://paper.example.com" \
  -e TRMNL_MAC_ADDRESS="AA:BB:CC:DD:EE:FF" \
  -e TRMNL_API_KEY="your-device-api-key" \
  trmnl-web:local
```

Then open `http://localhost:8080`.

Runtime container environment variables:

- `TRMNL_BASE_URL` - default server URL used by the app
- `TRMNL_MAC_ADDRESS` - optional default MAC address
- `TRMNL_API_KEY` - optional default API key (manual device mode)

These values are served at runtime via `/runtime-config.js` and can be overridden later in the UI.

### Docker Compose Example

Sample compose config is provided at `docker-compose.example.yml`.

```bash
cp docker-compose.example.yml docker-compose.yml
docker compose up --build -d
```

### Setup

1. **Server URL**
   - Enter your Larapaper server URL (for example `https://paper.example.com`)
2. **MAC Address (Optional)**
   - If your server maps requests by API key + MAC, enter MAC in `AA:BB:CC:DD:EE:FF` format
3. **API Key + Connect**
   - Paste your device API key and click `Connect` to save all setup fields in one action
4. **View Your Display**
   - The display loads and auto-refreshes using your configured server/device settings

## How It Works

1. **Metadata Fetching**
   - Uses `/api/display` for first setup and explicit forced refreshes
   - Uses `/api/current_screen` for current-screen polling
2. **Device Headers**
   - Sends `Access-Token` for device authentication
   - Sends optional `ID` header when MAC address is configured
3. **Image Handling**
   - Resolves metadata `image_url`
   - Downloads image bytes and converts them into encoded data URLs for rendering
4. **Reliability**
   - Exponential backoff on rate-limits and network failures
   - localStorage state persistence for reload resilience

### API Endpoints Used

| Endpoint (base URL configurable) | Purpose |
| --- | --- |
| `/api/display` | Fetch/generate next display image metadata |
| `/api/current_screen` | Read the currently displayed screen |
| `/api/devices` | Optional device list endpoint (cookie auth via Sanctum session) |

Set a default server host via `VITE_TRMNL_BASE_URL`:

```bash
VITE_TRMNL_BASE_URL="https://paper.example.com" bun run dev
```

For Docker runtime configuration, prefer:

- `TRMNL_BASE_URL`
- `TRMNL_MAC_ADDRESS`
- `TRMNL_API_KEY`

### Local Debug Logging

When running `bun run dev` or `npm run dev`:

- API diagnostics are mirrored into local dev logs with a `[TRMNL DEV ...]` prefix
- In development, image downloads are proxied through Vite (`/__trmnl_proxy/image`) to avoid browser CORS issues during data URL encoding
- In Docker/runtime builds, image downloads are proxied through the built-in Bun endpoint (`/__trmnl_proxy/image`) so host changes in the UI still support data URL rendering

If `vite.config.ts` changes, restart the dev server.

## Development

### Available Scripts

- `bun run dev` - Start development server
- `bun run build` - Build for production
- `bun run preview` - Preview production build
- `bun run lint` - Run ESLint

## Container Publishing (GitHub Actions)

A workflow is included at `.github/workflows/docker-publish.yml`.

- Publishes images to GitHub Container Registry (`ghcr.io`)
- Runs on pushes to `main`, version tags (`v*`), and manual dispatch
- Publishes multi-architecture images (`linux/amd64`, `linux/arm64`)

Image naming follows:

- `ghcr.io/<owner>/<repo>:latest` (default branch)
- `ghcr.io/<owner>/<repo>:<branch|tag|sha>`

### Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **localStorage** - State persistence
