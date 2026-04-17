import { useState, useEffect, useCallback, useRef } from "react";
import {
  getState,
  fetchDevices,
  fetchImage,
  fetchNextScreen,
  triggerSpecialFunction,
  selectDevice,
  setEnvironment,
  setBaseUrl,
  setMacAddress,
  setRefreshIntervalOverride,
  formatTimeRemaining,
  getLoginUrl,
  updateState,
  type TrmnlState,
  type Device,
  type Environment,
} from "../lib/trmnl-api";

// Event system for state updates
const stateListeners = new Set<() => void>();

function notifyStateChange() {
  stateListeners.forEach((listener) => {
    listener();
  });
}

// Wrap update functions to notify listeners
function wrappedSelectDevice(device: Device) {
  selectDevice(device);
  notifyStateChange();
}

function wrappedSetEnvironment(environment: Environment) {
  setEnvironment(environment);
  notifyStateChange();
}

function wrappedSetBaseUrl(baseUrl: string) {
  const validationError = setBaseUrl(baseUrl);
  if (validationError) {
    return validationError;
  }
  notifyStateChange();
  return null;
}

function wrappedSetMacAddress(macAddress: string) {
  const validationError = setMacAddress(macAddress);
  if (validationError) {
    return validationError;
  }
  notifyStateChange();
  return null;
}

function wrappedSetRefreshInterval(refreshInterval: string) {
  const validationError = setRefreshIntervalOverride(refreshInterval);
  if (validationError) {
    return validationError;
  }
  notifyStateChange();
  return null;
}

export function useTrmnl() {
  const [state, setState] = useState<TrmnlState>(getState);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshTimeoutRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const [countdown, setCountdown] = useState<string>("--:--");
  const fetchInProgressRef = useRef(false);

  // Subscribe to state changes
  useEffect(() => {
    const handleStateChange = () => {
      setState(getState());
    };
    stateListeners.add(handleStateChange);
    return () => {
      stateListeners.delete(handleStateChange);
    };
  }, []);

  // Refresh state from localStorage
  const refreshState = useCallback(() => {
    setState(getState());
  }, []);

  // Load devices
  const loadDevices = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const devices = await fetchDevices(state.environment);
      if (!devices || devices.length === 0) {
        const currentState = getState();
        setError(
          currentState.lastError ??
            "No devices found. Please enter your API key manually."
        );
      }
      refreshState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load devices");
    } finally {
      setIsLoading(false);
    }
  }, [state.environment, refreshState]);

  // Load image
  const loadImage = useCallback(
    async (forceRefresh = false) => {
      if (fetchInProgressRef.current) {
        console.log("Fetch already in progress, skipping");
        return;
      }

      // Don't fetch if we're still within the wait period (unless force refresh)
      if (!forceRefresh) {
        const currentState = getState();
        const now = Date.now();

        // If retryAfter is set and we're still in backoff period, skip
        if (currentState.retryAfter && now < currentState.retryAfter) {
          console.log("In retry backoff period, skipping fetch");
          return;
        }

        // If nextFetch is in the future, skip (already scheduled)
        if (currentState.nextFetch && now < currentState.nextFetch) {
          console.log("Next fetch scheduled, skipping premature fetch");
          return;
        }
      }

      fetchInProgressRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const imageUrl = await fetchImage(forceRefresh);
        if (!imageUrl) {
          const currentState = getState();
          setError(
            currentState.lastError ??
              "Failed to load image. Please check your API key."
          );
        }
        refreshState();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load image");
      } finally {
        setIsLoading(false);
        // Add small delay before allowing next fetch
        setTimeout(() => {
          fetchInProgressRef.current = false;
        }, 1000);
      }
    },
    [refreshState]
  );

  // Force refresh
  const forceRefresh = useCallback(async () => {
    await loadImage(true);
  }, [loadImage]);

  // Go to next screen
  const nextScreen = useCallback(async () => {
    if (fetchInProgressRef.current) {
      console.log("Fetch already in progress, skipping");
      return;
    }

    fetchInProgressRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const imageUrl = await fetchNextScreen();
      if (!imageUrl) {
        const currentState = getState();
        setError(
          currentState.lastError ??
            "Failed to load next screen. Please check your API key."
        );
      }
      refreshState();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load next screen"
      );
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        fetchInProgressRef.current = false;
      }, 1000);
    }
  }, [refreshState]);

  // Go to previous screen (special function)
  const previousScreen = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const success = await triggerSpecialFunction();
      if (!success) {
        const currentState = getState();
        setError(
          currentState.lastError ??
            "Failed to trigger previous screen. Ensure special function is configured."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to trigger previous screen"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Update countdown display
  const updateCountdown = useCallback(() => {
    const currentState = getState();
    setCountdown(formatTimeRemaining(currentState.nextFetch));
  }, []);

  // Setup refresh timer
  const setupRefreshTimer = useCallback(() => {
    // Clear existing timers
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    const currentState = getState();
    if (!currentState.nextFetch) {
      setCountdown("Unknown");
      return;
    }

    const timeToRefresh = currentState.nextFetch - Date.now();

    if (timeToRefresh <= 0) {
      // Time to refresh now
      loadImage();
      return;
    }

    // Start countdown interval
    updateCountdown();
    countdownIntervalRef.current = window.setInterval(updateCountdown, 1000);

    // Set timeout for next refresh
    refreshTimeoutRef.current = window.setTimeout(() => {
      loadImage();
    }, timeToRefresh);
  }, [loadImage, updateCountdown]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  // Setup refresh timer when state changes
  useEffect(() => {
    if (state.nextFetch) {
      setupRefreshTimer();
    }
  }, [state.nextFetch, setupRefreshTimer]);

  // When the tab becomes visible again, fetch immediately if scheduled refresh is overdue.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      const currentState = getState();
      if (!currentState.nextFetch) {
        return;
      }

      if (Date.now() >= currentState.nextFetch) {
        void loadImage();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadImage]);

  // Change selected device
  const changeDevice = useCallback((device: Device) => {
    wrappedSelectDevice(device);
  }, []);

  // Change environment
  const changeEnvironment = useCallback((environment: Environment) => {
    wrappedSetEnvironment(environment);
  }, []);

  // Save manual API key
  const saveManualApiKey = useCallback(
    async (apiKey: string) => {
      // Create a manual device entry with the API key
      const manualDevice: Device = {
        id: "manual",
        name: "Manual Device",
        api_key: apiKey,
      };

      updateState({
        devices: [manualDevice],
        selectedDevice: manualDevice,
        retryCount: 0,
        retryAfter: null,
      });

      notifyStateChange();

      // Immediately try to fetch the image
      setIsLoading(true);
      setError(null);

      try {
        const imageUrl = await fetchImage(true);
        if (!imageUrl) {
          const currentState = getState();
          setError(
            currentState.lastError ??
              "Failed to load image. Please check your API key."
          );
        }
        refreshState();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load image");
      } finally {
        setIsLoading(false);
        fetchInProgressRef.current = false;
      }
    },
    [refreshState]
  );

  // Open login page
  const openLogin = useCallback(() => {
    const loginUrl = getLoginUrl(state.environment);
    window.open(loginUrl, "_blank");
  }, [state.environment]);

  const changeBaseUrl = useCallback(
    async (baseUrl: string) => {
      const validationError = wrappedSetBaseUrl(baseUrl);
      if (validationError) {
        setError(validationError);
        return false;
      }

      setError(null);
      refreshState();
      return true;
    },
    [refreshState]
  );

  const changeMacAddress = useCallback(
    async (macAddress: string) => {
      const validationError = wrappedSetMacAddress(macAddress);
      if (validationError) {
        setError(validationError);
        return false;
      }

      setError(null);
      refreshState();
      return true;
    },
    [refreshState]
  );

  const changeRefreshInterval = useCallback(
    async (refreshInterval: string) => {
      const validationError = wrappedSetRefreshInterval(refreshInterval);
      if (validationError) {
        setError(validationError);
        return false;
      }

      setError(null);
      refreshState();
      return true;
    },
    [refreshState]
  );

  const changeApiKey = useCallback(
    async (apiKey: string) => {
      const trimmedApiKey = apiKey.trim();
      if (!trimmedApiKey) {
        setError("API key cannot be empty.");
        return false;
      }

      const currentState = getState();
      const selectedDevice = currentState.selectedDevice;

      if (!selectedDevice) {
        await saveManualApiKey(trimmedApiKey);
        return true;
      }

      const updatedSelectedDevice: Device = {
        ...selectedDevice,
        api_key: trimmedApiKey,
      };
      const updatedDevices = currentState.devices.map((device) =>
        device.id === selectedDevice.id ? updatedSelectedDevice : device
      );

      updateState({
        devices: updatedDevices,
        selectedDevice: updatedSelectedDevice,
        retryCount: 0,
        retryAfter: null,
        lastError: null,
      });

      notifyStateChange();
      setError(null);
      refreshState();
      return true;
    },
    [refreshState, saveManualApiKey]
  );

  // Initialize - load devices and image on first mount
  useEffect(() => {
    const init = async () => {
      // If we already have a selected device, load the image
      const currentState = getState();
      if (currentState.selectedDevice) {
        await loadImage();
      }
    };

    void init();
  }, [loadImage]);

  return {
    // State
    state,
    isLoading,
    error,
    countdown,

    // Actions
    loadDevices,
    loadImage,
    forceRefresh,
    nextScreen,
    previousScreen,
    changeDevice,
    changeEnvironment,
    changeBaseUrl,
    changeMacAddress,
    changeRefreshInterval,
    changeApiKey,
    saveManualApiKey,
    openLogin,
    refreshState,
  };
}
