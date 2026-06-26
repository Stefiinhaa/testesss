import React, { useEffect, useState } from 'react';
import api from '../api/apiConfig';

const capabilityCache = new Map();
const capabilityRequestCache = new Map();

function getCapabilityCacheKey(resourcePath, entityId) {
  return `${resourcePath}:${entityId}`;
}

function loadCapability(resourcePath, entityId) {
  const cacheKey = getCapabilityCacheKey(resourcePath, entityId);
  if (capabilityCache.has(cacheKey)) {
    return Promise.resolve(capabilityCache.get(cacheKey));
  }
  if (capabilityRequestCache.has(cacheKey)) {
    return capabilityRequestCache.get(cacheKey);
  }

  const request = api.get(`${resourcePath}/${encodeURIComponent(entityId)}/delete-capability`)
    .then((response) => {
      const value = response.data || null;
      capabilityCache.set(cacheKey, value);
      capabilityRequestCache.delete(cacheKey);
      return value;
    })
    .catch(() => {
      capabilityCache.set(cacheKey, null);
      capabilityRequestCache.delete(cacheKey);
      return null;
    });

  capabilityRequestCache.set(cacheKey, request);
  return request;
}

export default function DeleteBehaviorField({
  resourcePath,
  entityId,
  active,
  onActiveChange,
  onDelete,
  disabled = false,
  activeLabel = 'Ativo',
  deleteLabel = 'Apagar',
  placement = 'field',
}) {
  const [capability, setCapability] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!entityId) {
      setCapability(null);
      return undefined;
    }

    let cancelled = false;
    const cacheKey = getCapabilityCacheKey(resourcePath, entityId);
    if (capabilityCache.has(cacheKey)) {
      setCapability(capabilityCache.get(cacheKey));
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    loadCapability(resourcePath, entityId).then((value) => {
      if (!cancelled) {
        setCapability(value);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [entityId, resourcePath]);

  if (!entityId) return null;

  if (placement === 'toolbar') {
    if (capability?.action === 'delete') {
      return (
        <button
          type="button"
          className="btn ghost delete-action-btn"
          disabled={disabled}
          onClick={() => onDelete(capability)}
        >
          {deleteLabel}
        </button>
      );
    }
    return null;
  }

  return (
    <label className="field checkbox delete-behavior-field">
      <span>{activeLabel}</span>
      <input
        type="checkbox"
        checked={!!active}
        disabled={disabled || loading}
        onChange={(event) => onActiveChange(event.target.checked)}
      />
    </label>
  );
}
