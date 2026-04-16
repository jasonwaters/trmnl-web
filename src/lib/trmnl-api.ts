// TRMNL API Service
// Handles communication with the TRMNL API

import { debugLog } from "./debug";

const HOSTS = {
  development: "http://localhost:3000",
  production: "https://usetrmnl.com",
};

const DEFAULT_REFRESH_RATE = 30; // seconds
const FALLBACK_ENVIRONMENT: Environment = "production";

export type Environment = "development" | "production";

export interface Device {
  id: string;
  name: string;
  api_key: string;
  friendly_id?: string;
  [key: string]: unknown;
}

export interface CurrentImage {
  url: string; // data URL used for rendering
  originalUrl: string; // CDN URL from API
  filename: string;
  timestamp: number;
}

export interface TrmnlState {
  environment: Environment;
  baseUrl: string;
  macAddress: string | null;
  devices: Device[];
  selectedDevice: Device | null;
  currentImage: CurrentImage | null;
  lastFetch: number | null;
  nextFetch: number | null;
  refreshRate: number;
  retryCount: number;
  retryAfter: number | null;
  lastError: string | null;
}

// Storage keys
const STORAGE_KEYS = {
  environment: "trmnl_environment",
  baseUrl: "trmnl_baseUrl",
  macAddress: "trmnl_macAddress",
  devices: "trmnl_devices",
  selectedDevice: "trmnl_selectedDevice",
  currentImage: "trmnl_currentImage",
  lastFetch: "trmnl_lastFetch",
  nextFetch: "trmnl_nextFetch",
  refreshRate: "trmnl_refreshRate",
  retryCount: "trmnl_retryCount",
  retryAfter: "trmnl_retryAfter",
  lastError: "trmnl_lastError",
  firstSetupComplete: "trmnl_firstSetupComplete",
};

function normalizeBaseUrl(input: string): string | null {
  const trimmedInput = input.trim().replace(/\/+$/, "");
  if (!trimmedInput) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(trimmedInput)
    ? trimmedInput
    : `https://${trimmedInput}`;

  try {
    const parsedUrl = new URL(withProtocol);
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return null;
    }
    return parsedUrl.origin;
  } catch {
    return null;
  }
}

function resolveBaseUrl(
  configuredBaseUrl: string | null | undefined,
  environment: Environment
): string {
  const envBaseUrl = normalizeBaseUrl(
    String(import.meta.env.VITE_TRMNL_BASE_URL ?? "")
  );

  return (
    normalizeBaseUrl(configuredBaseUrl ?? "") ??
    envBaseUrl ??
    HOSTS[environment] ??
    HOSTS.production
  );
}

function normalizeMacAddress(input: string): string | null {
  const normalized = input.trim().toUpperCase().replace(/[^0-9A-F]/g, "");
  if (normalized.length !== 12) {
    return null;
  }

  const pairs = normalized.match(/.{1,2}/g);
  if (!pairs || pairs.length !== 6) {
    return null;
  }

  return pairs.join(":");
}

function resolveDeviceMacAddress(
  selectedDevice: Device | null,
  stateMacAddress: string | null
): string | null {
  if (stateMacAddress) {
    return stateMacAddress;
  }

  if (typeof selectedDevice?.mac_address === "string") {
    return normalizeMacAddress(selectedDevice.mac_address);
  }

  return null;
}

function buildDeviceHeaders(
  apiKey: string,
  macAddress: string | null,
  additionalHeaders: Record<string, string> = {}
): HeadersInit {
  const headers: Record<string, string> = {
    "Access-Token": apiKey,
    "Cache-Control": "no-cache",
    ...additionalHeaders,
  };

  if (macAddress) {
    headers.ID = macAddress;
  }

  return headers;
}

function getCurrentScreenApiUrls(environment: Environment): string[] {
  const baseUrl = getBaseUrl(environment);
  return [`${baseUrl}/api/display/current`, `${baseUrl}/api/current_screen`];
}

function resolveImageUrl(imageUrl: unknown, baseUrl: string): string | null {
  if (typeof imageUrl !== "string" || !imageUrl.trim()) {
    return null;
  }

  try {
    return new URL(imageUrl, baseUrl).toString();
  } catch {
    return null;
  }
}

async function createHttpError(
  response: Response,
  contextLabel: string
): Promise<Error> {
  let responseBody = "";
  try {
    responseBody = (await response.text()).trim();
  } catch {
    responseBody = "";
  }

  const details = responseBody ? ` - ${responseBody.slice(0, 300)}` : "";
  return new Error(
    `${contextLabel} failed (${response.status} ${response.statusText})${details}`
  );
}

// Helper functions for localStorage
function getStorageItem<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setStorageItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Failed to save ${key} to localStorage:`, error);
  }
}

// Get the current state from localStorage
export function getState(): TrmnlState {
  const environment = getStorageItem<Environment>(
    STORAGE_KEYS.environment,
    FALLBACK_ENVIRONMENT
  );
  const configuredBaseUrl = getStorageItem<string | null>(
    STORAGE_KEYS.baseUrl,
    null
  );

  return {
    environment,
    baseUrl: resolveBaseUrl(configuredBaseUrl, environment),
    macAddress: getStorageItem<string | null>(STORAGE_KEYS.macAddress, null),
    devices: getStorageItem<Device[]>(STORAGE_KEYS.devices, []),
    selectedDevice: getStorageItem<Device | null>(
      STORAGE_KEYS.selectedDevice,
      null
    ),
    currentImage: getStorageItem<CurrentImage | null>(
      STORAGE_KEYS.currentImage,
      null
    ),
    lastFetch: getStorageItem<number | null>(STORAGE_KEYS.lastFetch, null),
    nextFetch: getStorageItem<number | null>(STORAGE_KEYS.nextFetch, null),
    refreshRate: getStorageItem<number>(
      STORAGE_KEYS.refreshRate,
      DEFAULT_REFRESH_RATE
    ),
    retryCount: getStorageItem<number>(STORAGE_KEYS.retryCount, 0),
    retryAfter: getStorageItem<number | null>(STORAGE_KEYS.retryAfter, null),
    lastError: getStorageItem<string | null>(STORAGE_KEYS.lastError, null),
  };
}

// Update state in localStorage
export function updateState(updates: Partial<TrmnlState>): TrmnlState {
  if (updates.environment !== undefined) {
    setStorageItem(STORAGE_KEYS.environment, updates.environment);
  }
  if (updates.baseUrl !== undefined) {
    setStorageItem(STORAGE_KEYS.baseUrl, updates.baseUrl);
  }
  if (updates.macAddress !== undefined) {
    setStorageItem(STORAGE_KEYS.macAddress, updates.macAddress);
  }
  if (updates.devices !== undefined) {
    setStorageItem(STORAGE_KEYS.devices, updates.devices);
  }
  if (updates.selectedDevice !== undefined) {
    setStorageItem(STORAGE_KEYS.selectedDevice, updates.selectedDevice);
  }
  if (updates.currentImage !== undefined) {
    setStorageItem(STORAGE_KEYS.currentImage, updates.currentImage);
  }
  if (updates.lastFetch !== undefined) {
    setStorageItem(STORAGE_KEYS.lastFetch, updates.lastFetch);
  }
  if (updates.nextFetch !== undefined) {
    setStorageItem(STORAGE_KEYS.nextFetch, updates.nextFetch);
  }
  if (updates.refreshRate !== undefined) {
    setStorageItem(STORAGE_KEYS.refreshRate, updates.refreshRate);
  }
  if (updates.retryCount !== undefined) {
    setStorageItem(STORAGE_KEYS.retryCount, updates.retryCount);
  }
  if (updates.retryAfter !== undefined) {
    setStorageItem(STORAGE_KEYS.retryAfter, updates.retryAfter);
  }
  if (updates.lastError !== undefined) {
    setStorageItem(STORAGE_KEYS.lastError, updates.lastError);
  }
  return getState();
}

// Clear all stored data
export function clearState(): void {
  Object.values(STORAGE_KEYS).forEach((key) => {
    localStorage.removeItem(key);
  });
}

// URL construction
function getBaseUrl(environment: Environment): string {
  return resolveBaseUrl(getState().baseUrl, environment);
}

export function getDevicesUrl(environment: Environment): string {
  return `${getBaseUrl(environment)}/devices.json`;
}

export function getApiUrl(environment: Environment): string {
  return `${getBaseUrl(environment)}/api/current_screen`;
}

export function getLoginUrl(environment: Environment): string {
  return `${getBaseUrl(environment)}/login`;
}

export function setBaseUrl(baseUrl: string): string | null {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    return "Enter a valid server URL (for example: https://paper.example.com).";
  }

  updateState({
    baseUrl: normalizedBaseUrl,
    retryAfter: null,
    retryCount: 0,
    lastError: null,
  });

  return null;
}

export function setMacAddress(macAddress: string): string | null {
  if (!macAddress.trim()) {
    updateState({ macAddress: null, lastError: null });
    return null;
  }

  const normalizedMacAddress = normalizeMacAddress(macAddress);
  if (!normalizedMacAddress) {
    return "Enter a valid MAC address (for example: 41:B4:10:39:A1:24).";
  }

  updateState({ macAddress: normalizedMacAddress, lastError: null });
  return null;
}

// Fetch devices from server API
// Note: This requires the user to be logged in to the configured server in the same browser
// for cookie-based authentication to work
export async function fetchDevices(
  environment: Environment
): Promise<Device[] | null> {
  const url = getDevicesUrl(environment);
  const storedDevices = getStorageItem<Device[]>(STORAGE_KEYS.devices, []);
  debugLog("Fetching device list", { url, environment });

  try {
    const response = await fetch(url, {
      credentials: "include", // Include cookies for authentication
    });
    debugLog("Device list response received", {
      url,
      status: response.status,
      statusText: response.statusText,
    });

    if (response.status === 401 || response.status === 403) {
      console.log("Unauthorized - user needs to log in");
      updateState({
        lastError:
          "Device list unauthorized. Log in to your configured server and try again.",
      });
      if (storedDevices.length > 0) {
        console.log("Using cached devices");
        return storedDevices;
      }
      return null;
    }

    if (!response.ok) {
      if (storedDevices.length > 0) {
        console.log("Fetch error, using cached devices");
        updateState({
          lastError: `Device list failed (${response.status}); using cached devices.`,
        });
        return storedDevices;
      }
      throw await createHttpError(response, "Device list request");
    }

    const devices: Device[] = await response.json();

    // Store the devices
    updateState({ devices, lastError: null });

    // Auto-select first device if none selected
    const state = getState();
    if (!state.selectedDevice && devices.length > 0) {
      updateState({ selectedDevice: devices[0] });
    }

    return devices;
  } catch (error) {
    console.error("Error fetching devices:", error);
    updateState({
      lastError:
        error instanceof Error
          ? error.message
          : "Failed to fetch devices from configured server.",
    });
    if (storedDevices.length > 0) {
      return storedDevices;
    }
    return null;
  }
}

// Convert blob to data URL
async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function buildImageDownloadRequest(imageUrl: string): {
  requestUrl: string;
  requestInit?: RequestInit;
} {
  if (!import.meta.env.DEV) {
    return { requestUrl: imageUrl };
  }

  return {
    requestUrl: "/__trmnl_proxy",
    requestInit: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: imageUrl }),
    },
  };
}

async function resolveDisplayImageUrl(imageUrl: string): Promise<string> {
  try {
    const { requestUrl, requestInit } = buildImageDownloadRequest(imageUrl);
    const imageResponse = await fetch(requestUrl, requestInit);
    debugLog("Image download response received", {
      imageUrl,
      requestUrl,
      status: imageResponse.status,
      statusText: imageResponse.statusText,
    });

    if (!imageResponse.ok) {
      throw await createHttpError(imageResponse, "Image download request");
    }

    const imageBlob = await imageResponse.blob();
    return await blobToDataUrl(imageBlob);
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Unknown image download error";
    debugLog("Unable to encode image as data URL", {
      imageUrl,
      reason,
    });
    throw new Error(
      `Failed to encode image as data URL: ${reason}. Ensure image endpoint allows browser fetch/CORS or return Base64 from API.`
    );
  }
}

// Fetch the next screen image (triggers screen update on device)
export async function fetchNextScreen(): Promise<string | null> {
  const state = getState();
  const {
    environment,
    baseUrl,
    selectedDevice,
    macAddress: stateMacAddress,
    retryAfter,
    retryCount,
  } = state;

  // Check if we're in a retry backoff period
  if (retryAfter && Date.now() < retryAfter) {
    console.log("In retry backoff period, skipping fetch");
    return null;
  }

  // Get API key from selected device
  const apiKey = selectedDevice?.api_key;
  if (!apiKey) {
    console.log("No API key available");
    updateState({ lastError: "No API key available for the selected device." });
    return null;
  }

  const macAddress = resolveDeviceMacAddress(selectedDevice, stateMacAddress);
  const API_URL = `${baseUrl || getBaseUrl(environment)}/api/display`;
  const requestHeaders = buildDeviceHeaders(apiKey, macAddress);
  debugLog("Fetching next screen", {
    url: API_URL,
    hasApiKey: Boolean(apiKey),
    macAddress,
  });

  try {
    // Fetch the next screen
    const response = await fetch(API_URL, {
      headers: requestHeaders,
    });
    debugLog("Next screen response received", {
      url: API_URL,
      status: response.status,
      statusText: response.statusText,
    });

    if (response.status === 401 || response.status === 403) {
      console.log("API key unauthorized");
      updateState({
        retryCount: 0,
        retryAfter: null,
        lastError:
          "API key unauthorized for this server. Verify the key belongs to this instance.",
      });
      return null;
    }

    if (response.status === 429) {
      const newRetryCount = retryCount + 1;
      const backoffMs = Math.min(1000 * Math.pow(2, newRetryCount), 300000);
      const retryAfterTime = Date.now() + backoffMs;

      console.log(`Rate limited, backing off for ${backoffMs}ms`);
      updateState({
        retryCount: newRetryCount,
        retryAfter: retryAfterTime,
        lastError: `Rate limited by server. Retry in ${Math.ceil(backoffMs / 1000)}s.`,
      });
      return null;
    }

    if (!response.ok) {
      throw await createHttpError(response, "Next screen request");
    }

    const data = await response.json();
    const imageUrl = resolveImageUrl(data.image_url, baseUrl || getBaseUrl(environment));
    const filename = data.filename || "display.jpg";
    const refreshRate = data.refresh_rate || DEFAULT_REFRESH_RATE;
    const currentTime = Date.now();
    debugLog("Next screen metadata parsed", {
      imageUrl,
      filename,
      refreshRate,
      rawImageUrl: data.image_url ?? null,
    });

    if (!imageUrl) {
      if (
        typeof data.image_url === "string" &&
        data.image_url.startsWith("data:image/")
      ) {
        const nextFetchFromInline = currentTime + refreshRate * 1000;
        updateState({
          currentImage: {
            url: data.image_url,
            originalUrl: "inline-base64",
            filename,
            timestamp: currentTime,
          },
          lastFetch: currentTime,
          nextFetch: nextFetchFromInline,
          refreshRate,
          retryCount: 0,
          retryAfter: null,
          lastError: null,
        });
        return data.image_url;
      }

      const metadataError =
        "Server returned next-screen metadata without a valid image_url.";
      debugLog(metadataError, { payload: data });
      updateState({ lastError: metadataError });
      return null;
    }

    const imageDataUrl = await resolveDisplayImageUrl(imageUrl);

    // Calculate next fetch time
    const nextFetch = currentTime + refreshRate * 1000;

    // Store the image and metadata
    updateState({
      currentImage: {
        url: imageDataUrl,
        originalUrl: imageUrl,
        filename,
        timestamp: currentTime,
      },
      lastFetch: currentTime,
      nextFetch,
      refreshRate,
      retryCount: 0,
      retryAfter: null,
      lastError: null,
    });

    return imageDataUrl;
  } catch (error) {
    console.error("Error fetching next screen:", error);

    const newRetryCount = retryCount + 1;
    const backoffMs = Math.min(1000 * Math.pow(2, newRetryCount), 300000);
    const retryAfterTime = Date.now() + backoffMs;

    updateState({
      retryCount: newRetryCount,
      retryAfter: retryAfterTime,
      lastError:
        error instanceof Error
          ? error.message
          : "Failed to fetch the next screen.",
    });
    return null;
  }
}

// Trigger special function (e.g., previous screen)
export async function triggerSpecialFunction(): Promise<boolean> {
  const state = getState();
  const { environment, baseUrl, selectedDevice, macAddress: stateMacAddress } =
    state;

  // Get API key from selected device
  const apiKey = selectedDevice?.api_key;
  if (!apiKey) {
    console.log("No API key available");
    updateState({ lastError: "No API key available for the selected device." });
    return false;
  }

  const macAddress = resolveDeviceMacAddress(selectedDevice, stateMacAddress);
  const API_URL = `${baseUrl || getBaseUrl(environment)}/api/display`;
  const requestHeaders = buildDeviceHeaders(
    apiKey,
    macAddress,
    {
      "Special-Function": "true",
    }
  );
  debugLog("Triggering special function", {
    url: API_URL,
    hasApiKey: Boolean(apiKey),
    macAddress,
  });

  try {
    const response = await fetch(API_URL, {
      headers: requestHeaders,
    });
    debugLog("Special function response received", {
      url: API_URL,
      status: response.status,
      statusText: response.statusText,
    });

    if (response.status === 401 || response.status === 403) {
      console.log("API key unauthorized");
      updateState({
        lastError:
          "API key unauthorized for this server. Verify the key belongs to this instance.",
      });
      return false;
    }

    if (!response.ok) {
      throw await createHttpError(response, "Special function request");
    }

    console.log("Special function triggered successfully");
    updateState({ lastError: null });
    return true;
  } catch (error) {
    console.error("Error triggering special function:", error);
    updateState({
      lastError:
        error instanceof Error
          ? error.message
          : "Failed to trigger special function.",
    });
    return false;
  }
}

// Fetch the current screen image
export async function fetchImage(forceRefresh = false): Promise<string | null> {
  const state = getState();
  const {
    environment,
    baseUrl,
    selectedDevice,
    macAddress: stateMacAddress,
    currentImage,
    retryAfter,
    retryCount,
  } = state;

  // Check if we're in a retry backoff period
  if (retryAfter && Date.now() < retryAfter && !forceRefresh) {
    console.log("In retry backoff period, skipping fetch");
    return currentImage?.url || null;
  }

  // Get API key from selected device
  const apiKey = selectedDevice?.api_key;
  if (!apiKey) {
    console.log("No API key available");
    updateState({ lastError: "No API key available for the selected device." });
    return null;
  }

  const macAddress = resolveDeviceMacAddress(selectedDevice, stateMacAddress);
  const deviceId = selectedDevice?.id || "unknown";
  const isFirstSetup = !hasCompletedFirstSetup(deviceId);

  // Use /api/display when we explicitly want a fresh render (first setup or force refresh).
  // Otherwise prefer read-only current screen endpoints.
  const shouldUseDisplayEndpoint = isFirstSetup || forceRefresh;
  const apiUrls = shouldUseDisplayEndpoint
    ? [`${baseUrl || getBaseUrl(environment)}/api/display`]
    : getCurrentScreenApiUrls(environment);
  const requestHeaders = buildDeviceHeaders(apiKey, macAddress);

  console.log(
    `Fetching image for device ${deviceId} (first setup: ${isFirstSetup})`
  );
  debugLog("Fetching display image", {
    deviceId,
    isFirstSetup,
    forceRefresh,
    shouldUseDisplayEndpoint,
    apiUrls,
    macAddress,
  });

  try {
    let response: Response | null = null;
    let apiUrlUsed = apiUrls[0];

    // Fetch metadata with endpoint fallback for BYOS compatibility
    for (const candidateUrl of apiUrls) {
      apiUrlUsed = candidateUrl;
      response = await fetch(candidateUrl, {
        headers: requestHeaders,
      });

      debugLog("Display metadata response received", {
        url: candidateUrl,
        status: response.status,
        statusText: response.statusText,
      });

      if (response.status === 404 && apiUrls.length > 1) {
        debugLog("Display metadata endpoint returned 404, trying fallback", {
          failedUrl: candidateUrl,
        });
        continue;
      }

      break;
    }

    if (!response) {
      throw new Error("No display endpoint was attempted.");
    }

    if (response.status === 401 || response.status === 403) {
      console.log("API key unauthorized");
      // Reset retry state
      updateState({
        retryCount: 0,
        retryAfter: null,
        lastError:
          "API key unauthorized for this server. Verify the key belongs to this instance.",
      });
      return null;
    }

    if (response.status === 429) {
      // Rate limited - implement exponential backoff
      const newRetryCount = retryCount + 1;
      const backoffMs = Math.min(1000 * Math.pow(2, newRetryCount), 300000); // Max 5 minutes
      const retryAfterTime = Date.now() + backoffMs;

      console.log(`Rate limited, backing off for ${backoffMs}ms`);
      updateState({
        retryCount: newRetryCount,
        retryAfter: retryAfterTime,
        lastError: `Rate limited by server. Retry in ${Math.ceil(backoffMs / 1000)}s.`,
      });

      return currentImage?.url || null;
    }

    if (!response.ok) {
      throw await createHttpError(
        response,
        `Display metadata request (${apiUrlUsed})`
      );
    }

    const data = await response.json();
    const effectiveBaseUrl = baseUrl || getBaseUrl(environment);
    const imageUrl = resolveImageUrl(data.image_url, effectiveBaseUrl);
    const filename = data.filename || "display.jpg";
    const refreshRate = data.refresh_rate || DEFAULT_REFRESH_RATE;
    const currentTime = Date.now();
    debugLog("Display metadata parsed", {
      imageUrl,
      filename,
      refreshRate,
      rawImageUrl: data.image_url ?? null,
      renderedAt: data.rendered_at ?? null,
    });

    if (!imageUrl) {
      if (
        typeof data.image_url === "string" &&
        data.image_url.startsWith("data:image/")
      ) {
        const nextFetchFromInline = currentTime + refreshRate * 1000;
        updateState({
          currentImage: {
            url: data.image_url,
            originalUrl: "inline-base64",
            filename,
            timestamp: currentTime,
          },
          lastFetch: currentTime,
          nextFetch: nextFetchFromInline,
          refreshRate,
          retryCount: 0,
          retryAfter: null,
          lastError: null,
        });

        if (isFirstSetup) {
          markFirstSetupComplete(deviceId);
          console.log(`First setup completed for device ${deviceId}`);
        }

        return data.image_url;
      }

      const metadataError =
        "Server returned display metadata without a valid image_url.";
      debugLog(metadataError, { payload: data });
      updateState({ lastError: metadataError });
      return currentImage?.url || null;
    }

    const hasDataUrlCachedImage =
      typeof currentImage?.url === "string" &&
      currentImage.url.startsWith("data:image/");

    // Check if image URL has changed (optimization to skip re-download).
    // Only reuse cached image when it is already an encoded data URL.
    if (
      !forceRefresh &&
      currentImage &&
      currentImage.originalUrl === imageUrl &&
      hasDataUrlCachedImage
    ) {
      console.log("Image unchanged, updating timestamps only");
      debugLog("Image URL unchanged; skipping download", { imageUrl });
      const nextFetch = currentTime + refreshRate * 1000;
      updateState({
        refreshRate,
        lastFetch: currentTime,
        nextFetch,
        retryCount: 0,
        retryAfter: null,
      });
      return currentImage.url;
    }

    if (!forceRefresh && currentImage && currentImage.originalUrl === imageUrl) {
      debugLog(
        "Image URL unchanged but cached src is not data URL; re-encoding image",
        {
          imageUrl,
          cachedSourcePrefix: currentImage.url.slice(0, 40),
        }
      );
    }

    const imageDataUrl = await resolveDisplayImageUrl(imageUrl);

    // Calculate next fetch time
    const nextFetch = currentTime + refreshRate * 1000;

    // Store the image and metadata
    updateState({
      currentImage: {
        url: imageDataUrl,
        originalUrl: imageUrl,
        filename,
        timestamp: currentTime,
      },
      lastFetch: currentTime,
      nextFetch,
      refreshRate,
      retryCount: 0,
      retryAfter: null,
      lastError: null,
    });

    // Mark first setup as complete after successful fetch
    if (isFirstSetup) {
      markFirstSetupComplete(deviceId);
      console.log(`First setup completed for device ${deviceId}`);
    }

    return imageDataUrl;
  } catch (error) {
    console.error("Error fetching image:", error);

    // Increment retry count on error
    const newRetryCount = retryCount + 1;
    const backoffMs = Math.min(1000 * Math.pow(2, newRetryCount), 300000);
    const retryAfterTime = Date.now() + backoffMs;

    updateState({
      retryCount: newRetryCount,
      retryAfter: retryAfterTime,
      lastError:
        error instanceof Error
          ? error.message
          : "Failed to fetch image from configured server.",
    });

    return currentImage?.url || null;
  }
}

// Select a device
export function selectDevice(device: Device): void {
  updateState({
    selectedDevice: device,
    retryCount: 0,
    retryAfter: null,
    lastError: null,
  });
}

// Set the environment
export function setEnvironment(environment: Environment): void {
  updateState({
    environment,
    baseUrl: resolveBaseUrl(getStorageItem(STORAGE_KEYS.baseUrl, null), environment),
    lastError: null,
  });
}

// Check if device has completed first setup
function hasCompletedFirstSetup(deviceId: string): boolean {
  const firstSetupMap = getStorageItem<Record<string, boolean>>(
    STORAGE_KEYS.firstSetupComplete,
    {}
  );
  return firstSetupMap[deviceId] === true;
}

// Mark device as having completed first setup
function markFirstSetupComplete(deviceId: string): void {
  const firstSetupMap = getStorageItem<Record<string, boolean>>(
    STORAGE_KEYS.firstSetupComplete,
    {}
  );
  firstSetupMap[deviceId] = true;
  setStorageItem(STORAGE_KEYS.firstSetupComplete, firstSetupMap);
}

// Format time remaining for countdown display
export function formatTimeRemaining(nextFetch: number | null): string {
  if (!nextFetch) return "Unknown";

  const remaining = Math.max(0, nextFetch - Date.now());
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}
