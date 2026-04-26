import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { apiFetch } from '../api';

const DeviceStatus = forwardRef(({ deviceType, label }, ref) => {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef(null);

  const checkDeviceStatus = async () => {
    try {
      const response = await apiFetch('/api/devices/status/');
      if (response.ok) {
        const data = await response.json();
        setConnected(data[deviceType] || false);
      }
    } catch (e) {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    refresh: checkDeviceStatus,
  }));

  useEffect(() => {
    checkDeviceStatus();
    intervalRef.current = setInterval(checkDeviceStatus, 15000);
    return () => clearInterval(intervalRef.current);
  }, [deviceType]);

  const icon = deviceType === 'scanner' ? (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M2 4h2v16H2V4zm4 0h1v16H6V4zm3 0h2v16H9V4zm4 0h1v16h-1V4zm3 0h1v16h-1V4zm3 0h2v16h-2V4z"/>
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/>
    </svg>
  );

  if (loading) {
    return (
      <div className="device-status device-status-loading">
        <span className="device-icon">{icon}</span>
        <span className="device-label">{label}</span>
        <span className="device-dot loading"></span>
      </div>
    );
  }

  return (
    <div className={`device-status ${connected ? 'device-connected' : 'device-disconnected'}`}>
      <span className="device-icon">{icon}</span>
      <span className="device-label">{label}</span>
      <span className={`device-dot ${connected ? 'connected' : 'disconnected'}`}></span>
      <span className="device-status-text">
        {connected ? 'Verbunden' : 'Nicht verbunden'}
      </span>
    </div>
  );
});

export default DeviceStatus;
