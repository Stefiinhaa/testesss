import React from 'react';
import { Navigate } from 'react-router-dom';
import { getSessionProfile, isAdminSessionProfile } from '../utils/sessionStore';

export default function RequireAdmin({ children, session = null }) {
  const perfil = session?.perfil || getSessionProfile();
  if (!isAdminSessionProfile(perfil)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
