import { useEffect, useState } from 'react';

export default function useCurrentDate({
  refreshSeconds,
}: {
  refreshSeconds: number;
}): Date {
  const [date, setDate] = useState(new Date());
  const refreshMs = refreshSeconds * 1000;
  useEffect(() => {
    const interval = setInterval(() => {
      setDate(new Date());
    }, refreshMs);
    return () => clearInterval(interval);
  }, [refreshMs]);
  return date;
}
