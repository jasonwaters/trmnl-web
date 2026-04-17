import { RotateCcw, Settings, SkipForward } from "lucide-react";
import { useEffect, useState } from "react";
import "./App.css";
import { useTrmnl } from "./hooks/useTrmnl";

function App() {
  const {
    state,
    isLoading,
    error,
    countdown,
    forceRefresh,
    nextScreen,
    changeDevice,
    changeBaseUrl,
    changeMacAddress,
    changeRefreshInterval,
    changeApiKey,
  } = useTrmnl();

  const {
    currentImage,
    selectedDevice,
    devices,
    baseUrl,
    macAddress,
    refreshIntervalOverride,
  } = state;
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(selectedDevice?.api_key ?? "");
  const [serverUrlInput, setServerUrlInput] = useState(baseUrl);
  const [macAddressInput, setMacAddressInput] = useState(macAddress ?? "");
  const [refreshIntervalInput, setRefreshIntervalInput] = useState(
    refreshIntervalOverride ? String(refreshIntervalOverride) : ""
  );
  const dashboardUrl = `${baseUrl}/dashboard`;

  useEffect(() => {
    setServerUrlInput(baseUrl);
  }, [baseUrl]);

  useEffect(() => {
    setMacAddressInput(macAddress ?? "");
  }, [macAddress]);

  useEffect(() => {
    setApiKeyInput(selectedDevice?.api_key ?? "");
  }, [selectedDevice?.api_key]);

  useEffect(() => {
    setRefreshIntervalInput(
      refreshIntervalOverride ? String(refreshIntervalOverride) : ""
    );
  }, [refreshIntervalOverride]);

  const saveConnectionConfig = async (
    options: { requireApiKey: boolean; refreshAfterSave: boolean }
  ) => {
    const normalizedServerUrl = serverUrlInput.trim();
    const normalizedMacAddress = macAddressInput.trim();
    const normalizedRefreshInterval = refreshIntervalInput.trim();
    const normalizedApiKey = apiKeyInput.trim();

    if (options.requireApiKey && !normalizedApiKey) {
      return false;
    }

    if (normalizedServerUrl && normalizedServerUrl !== baseUrl) {
      const serverSaved = await changeBaseUrl(normalizedServerUrl);
      if (!serverSaved) {
        return false;
      }
    }

    if (normalizedMacAddress !== (macAddress ?? "")) {
      const macSaved = await changeMacAddress(normalizedMacAddress);
      if (!macSaved) {
        return false;
      }
    }

    const currentRefreshInterval = refreshIntervalOverride
      ? String(refreshIntervalOverride)
      : "";
    if (normalizedRefreshInterval !== currentRefreshInterval) {
      const refreshIntervalSaved = await changeRefreshInterval(
        normalizedRefreshInterval
      );
      if (!refreshIntervalSaved) {
        return false;
      }
    }

    const currentApiKey = selectedDevice?.api_key ?? "";
    if (normalizedApiKey !== currentApiKey) {
      const apiSaved = await changeApiKey(normalizedApiKey);
      if (!apiSaved) {
        return false;
      }
    }

    if (options.refreshAfterSave) {
      await forceRefresh();
    }

    return true;
  };

  const handleConnect = async () => {
    const saved = await saveConnectionConfig({
      requireApiKey: true,
      refreshAfterSave: false,
    });
    if (!saved) {
      return;
    }

    setApiKeyInput("");
    setShowSettings(false);
  };

  const handleSaveSettings = async () => {
    const saved = await saveConnectionConfig({
      requireApiKey: false,
      refreshAfterSave: true,
    });
    if (!saved) {
      return;
    }

    setShowSettings(false);
  };

  // Render login prompt if no devices and no selected device with API key
  if (devices.length === 0 && !selectedDevice && !isLoading) {
    return (
      <div className="trmnl-container">
        <div className="trmnl-error-container">
          <div className="trmnl-error-content">
            <h2>Welcome to TRMNL Web</h2>
            <p>View your TRMNL device display right in your browser.</p>

            <div className="trmnl-setup-section">
              <h3>Server URL</h3>
              <p className="trmnl-note">
                Point this app to your TRMNL-compatible instance (for example,
                Larapaper).
              </p>
              <div className="trmnl-input-group">
                <input
                  type="text"
                  value={serverUrlInput}
                  onChange={(e) => setServerUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleConnect()}
                  placeholder="https://paper.example.com"
                  className="trmnl-input"
                />
              </div>
            </div>

            <div className="trmnl-setup-section">
              <h3>MAC Address (Optional)</h3>
              <p className="trmnl-note">
                Some servers map requests using API key + MAC address.
              </p>
              <div className="trmnl-input-group">
                <input
                  type="text"
                  value={macAddressInput}
                  onChange={(e) => setMacAddressInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleConnect()}
                  placeholder="41:B4:10:39:A1:24"
                  className="trmnl-input"
                />
              </div>
            </div>

            <div className="trmnl-setup-section">
              <h3>Enter Your API Key</h3>
              <p className="trmnl-note">
                You can find your device API key in your{" "}
                <a
                  href={dashboardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Dashboard
                </a>{" "}
                under Device Settings.
              </p>
              <div className="trmnl-input-group">
                <input
                  type="text"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleConnect()}
                  placeholder="Paste your device API key"
                  className="trmnl-input"
                />
                <button
                  onClick={() => void handleConnect()}
                  type="button"
                  className="trmnl-button"
                  disabled={!apiKeyInput.trim()}
                >
                  Connect
                </button>
              </div>
            </div>

            {/* <div className="trmnl-divider">
              <span>or</span>
            </div>

            <div className="trmnl-setup-section">
              <p className="trmnl-note">
                If you're logged into usetrmnl.com, try loading your devices
                automatically:
              </p>
              <div className="trmnl-button-group">
                <button onClick={openLogin} className="trmnl-button">
                  Log in to TRMNL
                </button>
                <button onClick={loadDevices} className="trmnl-button">
                  Load Devices
                </button>
              </div>
            </div> */}

            {error && <p className="trmnl-error-message">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="trmnl-container">
      {/* Main Display Area */}
      <div className="trmnl-display">
        <div className="trmnl-image-container">
          {isLoading && !currentImage && (
            <div className="trmnl-loading">
              <div className="trmnl-loading-spinner"></div>
              <p>Loading TRMNL display...</p>
            </div>
          )}

          {currentImage && (
            <img
              src={currentImage.url}
              alt="TRMNL Display"
              className="trmnl-image"
            />
          )}

          {!isLoading && !currentImage && selectedDevice && (
            <div className="trmnl-no-image">
              <p>No image available</p>
              <button onClick={forceRefresh} type="button" className="trmnl-button">
                Refresh
              </button>
            </div>
          )}
        </div>

        {/* Info Overlay */}
        <div className="trmnl-info-overlay">
          <div className="trmnl-info-left">
            {devices.length > 1 ? (
              <select
                value={selectedDevice?.id || ""}
                onChange={(e) => {
                  const device = devices.find((d) => d.id === e.target.value);
                  if (device) {
                    changeDevice(device);
                    forceRefresh();
                  }
                }}
                className="trmnl-device-select"
              >
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name || device.friendly_id || device.id}
                  </option>
                ))}
              </select>
            ) : (
              <span className="trmnl-device-name">
                {selectedDevice?.name ||
                  selectedDevice?.friendly_id ||
                  "TRMNL Device"}
              </span>
            )}
          </div>

          <div className="trmnl-info-center">
            <span className="trmnl-countdown">
              Next refresh: <strong>{countdown}</strong>
            </span>
          </div>

          <div className="trmnl-info-right">
            <button
              onClick={nextScreen}
              type="button"
              disabled={isLoading}
              className="trmnl-button trmnl-button-small"
              title="Next screen"
            >
              <SkipForward size={18} />
            </button>
            <button
              onClick={forceRefresh}
              type="button"
              disabled={isLoading}
              className="trmnl-button trmnl-button-small"
              title="Refresh now"
            >
              <RotateCcw
                size={18}
                className={isLoading ? "trmnl-icon-spin" : ""}
              />
            </button>
            {/* <div className="trmnl-tooltip-container">
              <button
                onClick={previousScreen}
                disabled={isLoading}
                className="trmnl-button trmnl-button-small"
              >
                <Zap size={18} />
              </button>
              <div className="trmnl-tooltip">
                <strong>Special Function</strong>
                <p>Triggers your device's configured special function (e.g., Previous Screen, Identify, etc.).</p>
                <div className="trmnl-tooltip-divider"></div>
                <p className="trmnl-tooltip-label">Setup Required:</p>
                <ol>
                  <li>Go to <a href="https://usetrmnl.com/dashboard" target="_blank" rel="noopener noreferrer">Dashboard</a></li>
                  <li>Open device settings</li>
                  <li>Configure your desired Special Function</li>
                  <li>Save settings</li>
                </ol>
                <a href="https://help.usetrmnl.com/en/articles/9672080-special-functions" target="_blank" rel="noopener noreferrer" className="trmnl-tooltip-link">
                  Learn more →
                </a>
              </div>
            </div> */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              type="button"
              className="trmnl-button trmnl-button-small"
              title="Settings"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="trmnl-settings-panel">
            <h3>Settings</h3>

            <div className="trmnl-settings-section">
              <label htmlFor="server-url-input">Server URL</label>
              <div className="trmnl-input-group">
                <input
                  id="server-url-input"
                  type="text"
                  value={serverUrlInput}
                  onChange={(e) => setServerUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleSaveSettings()}
                  placeholder="https://paper.example.com"
                  className="trmnl-input"
                />
              </div>
            </div>

            <div className="trmnl-settings-section">
              <label htmlFor="mac-address-input">MAC Address (Optional)</label>
              <div className="trmnl-input-group">
                <input
                  id="mac-address-input"
                  type="text"
                  value={macAddressInput}
                  onChange={(e) => setMacAddressInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleSaveSettings()}
                  placeholder="41:B4:10:39:A1:24"
                  className="trmnl-input"
                />
              </div>
            </div>

            <div className="trmnl-settings-section">
              <label htmlFor="api-key-input">API Key</label>
              <div className="trmnl-input-group">
                <input
                  id="api-key-input"
                  type="text"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleSaveSettings()}
                  placeholder="Paste your device API key"
                  className="trmnl-input"
                />
              </div>
            </div>

            <div className="trmnl-settings-section">
              <label htmlFor="refresh-interval-input">
                Refresh Interval (seconds)
              </label>
              <div className="trmnl-input-group">
                <input
                  id="refresh-interval-input"
                  type="number"
                  min="0"
                  step="1"
                  value={refreshIntervalInput}
                  onChange={(e) => setRefreshIntervalInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleSaveSettings()}
                  placeholder="Defaults to device refresh rate"
                  className="trmnl-input"
                />
              </div>
            </div>

            <div className="trmnl-settings-actions">
              <button
                onClick={() => void handleSaveSettings()}
                type="button"
                className="trmnl-button trmnl-button-primary"
              >
                Save
              </button>
              <button
                onClick={() => {
                  localStorage.clear();
                  window.location.reload();
                }}
                type="button"
                className="trmnl-button"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error Toast */}
      {error && <div className="trmnl-toast trmnl-toast-error">{error}</div>}
    </div>
  );
}

export default App;
