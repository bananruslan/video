declare global {
  interface Window {
    umami: {
      track: (eventName: string, eventData?: Record<string, unknown>) => void;
      identify: (data: Record<string, unknown>) => void;
    };
  }

  const umami: Window["umami"];
}

export {};
