import { useState, useEffect } from 'react';

/**
 * Detects whether the app is running on a mobile device (phone/small screen)
 * or a desktop/laptop based on screen width.
 * Breakpoint: < 768px = mobile, >= 768px = desktop
 */
export default function useDeviceType() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e) => {
      setIsMobile(e.matches);
      document.documentElement.dataset.device = e.matches ? 'mobile' : 'desktop';
    };
    mq.addEventListener('change', handler);
    // Set initial data attribute
    document.documentElement.dataset.device = mq.matches ? 'mobile' : 'desktop';
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
