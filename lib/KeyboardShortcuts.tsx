'use client';

import React from 'react';
import { tinykeys } from 'tinykeys';

interface KeyboardShortcutsProps {
  room?: any;
  onMicToggle?: () => void;
  onCameraToggle?: () => void;
  onScreenShareToggle?: () => void;
}

export function KeyboardShortcuts({
  room,
  onMicToggle,
  onCameraToggle,
  onScreenShareToggle
}: KeyboardShortcutsProps) {
  React.useEffect(() => {
    const shortcuts = {
      'm': (event: KeyboardEvent) => {
        event.preventDefault();
        onMicToggle?.();
      },
      'v': (event: KeyboardEvent) => {
        event.preventDefault();
        onCameraToggle?.();
      },
      's': (event: KeyboardEvent) => {
        event.preventDefault();
        onScreenShareToggle?.();
      },
    };

    const unsubscribe = tinykeys(window, shortcuts);

    return () => {
      unsubscribe();
    };
  }, [onMicToggle, onCameraToggle, onScreenShareToggle]);

  return null;
}