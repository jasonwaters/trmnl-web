# TRMNL Web

A web application that displays a TRMNL-compatible device screen in your browser. It started as a web alternative to the [TRMNL Chrome Extension](https://github.com/usetrmnl/trmnl-chrome) and now supports BYOS servers such as Larapaper.

## Features

- **BYOS Server Support**: Configure a custom TRMNL-compatible server URL
- **Device Mapping Support**: Optional MAC address support for servers that require API key + MAC routing
- **Single-Step Setup**: `Connect` saves server URL, optional MAC, and API key together
- **Display TRMNL Screen**: View your device display directly in your browser
- **Auto Refresh**: Automatically fetches new images at the interval set by your device (default: 30 seconds)
- **Countdown Timer**: Shows time until next refresh
- **Manual Refresh**: Force refresh the display at any time
- **Multi-Device Support**: Switch between multiple TRMNL devices (if you have more than one)
- **Privacy-Oriented Rendering**: Images are rendered as encoded data URLs in the browser
- **Persistent Storage**: Connection settings and cached image metadata are stored in localStorage
- **Dark/Light Mode**: E-ink display filters adapt to your system preference

## Getting Started

### Prerequisites

- A TRMNL-compatible server account (official TRMNL or a BYOS server such as Larapaper)
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

4. Open http://localhost:5173 in your browser

### Setup

1. **Server URL**
   - Enter your TRMNL-compatible server URL (for example `https://paper.example.com`)
2. **MAC Address (Optional)**
   - If your server maps requests by API key + MAC, enter MAC in `AA:BB:CC:DD:EE:FF` format
3. **API Key + Connect**
   - Paste your device API key and click `Connect` to save all setup fields in one action
4. **View Your Display**
   - The display loads and auto-refreshes using your configured server/device settings

## How It Works

1. **Metadata Fetching**
   - Uses `/api/display` for first setup and explicit forced refreshes
   - Uses `/api/display/current` and falls back to `/api/current_screen` for current-screen polling
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
| `/api/display/current` | Preferred current-screen endpoint |
| `/api/current_screen` | Legacy fallback current-screen endpoint |
| `/devices.json` | Optional device list endpoint (cookie auth, same-origin/CORS dependent) |
| `/login` | Login page link for configured server |

Set a default server host via `VITE_TRMNL_BASE_URL`:

```bash
VITE_TRMNL_BASE_URL="https://paper.example.com" bun run dev
```

### Local Debug Logging

When running `bun run dev` or `npm run dev`:

- API diagnostics are mirrored into local dev logs with a `[TRMNL DEV ...]` prefix
- In development, image downloads are proxied through Vite (`/__trmnl_proxy`) to avoid browser CORS issues during data URL encoding

If `vite.config.ts` changes, restart the dev server.

## Development

### Available Scripts

- `bun run dev` - Start development server
- `bun run build` - Build for production
- `bun run preview` - Preview production build
- `bun run lint` - Run ESLint

### Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **localStorage** - State persistence
