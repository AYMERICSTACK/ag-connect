"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type AutoRefreshProps = {
  interval?: number;
  enabled?: boolean;
};

export function AutoRefresh({ interval = 2500, enabled = true }: AutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    const timer = window.setInterval(() => {
      router.refresh();
    }, interval);

    return () => window.clearInterval(timer);
  }, [enabled, interval, router]);

  return null;
}
