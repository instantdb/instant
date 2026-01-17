const UPTIMEROBOT_API_KEY = process.env.UPTIMEROBOT_API_KEY;
const DAY_SECONDS = 24 * 60 * 60;

export async function fetchUptime(): Promise<UptimeResponse> {
  if (!UPTIMEROBOT_API_KEY) {
    throw new Error(
      '[status] No API key provided. Update your .env with UPTIME_ROBOT_API_KEY',
    );
  }
  const response = await fetch('https://api.uptimerobot.com/v2/getMonitors', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: UPTIMEROBOT_API_KEY,
      format: 'json',
      monitors: '796952052-797830425',
      response_times: 1,
      response_times_limit: 90,
      custom_uptime_ratios: '1-7-30-90',
      custom_uptime_ranges: Array.from({ length: 90 }, (_, dayOffset) => {
        const nowInSecs = Math.floor(Date.now() / 1000);
        const windowStart = dayOffset + 1; // older boundary (e.g., 1d ago)
        const windowEnd = dayOffset; // newer boundary (e.g., now)

        const startInSecs = nowInSecs - windowStart * DAY_SECONDS;
        const endInSecs = nowInSecs - windowEnd * DAY_SECONDS;

        return `${startInSecs}_${endInSecs}`;
      })
        .reverse()
        .join('-'),
    }),
  });
  if (!response.ok) {
    throw new Error(`UptimeRobot API error: ${response.status}`);
  }
  const data: ProviderResponse = await response.json();

  return toUptimeResponse(data);
}

export type Monitor = {
  id: string;
  friendly_name: string;
  status: number;
  uptime_ratio: {
    '24h': number;
    '7d': number;
    '30d': number;
    '90d': number;
  };
  daily_uptime: number[];
  average_response_time: number;
};

export type UptimeResponse = {
  monitors: Monitor[];
  overall_uptime: {
    '24h': number;
    '7d': number;
    '30d': number;
    '90d': number;
  };
  last_updated: string;
};

type ProviderResponse = {
  monitors: Array<{
    id: string;
    friendly_name: string;
    url: string;
    status: number;
    custom_uptime_ratio?: string;
    custom_uptime_ranges?: string;
    average_response_time: number;
  }>;
};

function toUptimeResponse(apiRes: ProviderResponse): UptimeResponse {
  const monitors =
    apiRes.monitors?.map((monitor): Monitor => {
      const customRatios = monitor.custom_uptime_ratio?.split('-') || [];
      const customRanges = monitor.custom_uptime_ranges?.split('-') || [];

      const dailyUptime = customRanges.map((range: string) => {
        const uptime = parseFloat(range);
        return isNaN(uptime) ? 100 : uptime;
      });

      while (dailyUptime.length < 90) {
        dailyUptime.push(100);
      }

      return {
        id: monitor.id,
        friendly_name: monitor.friendly_name,
        status: monitor.status,
        uptime_ratio: {
          '24h': parseFloat(customRatios[0]) || 100,
          '7d': parseFloat(customRatios[1]) || 100,
          '30d': parseFloat(customRatios[2]) || 100,
          '90d': parseFloat(customRatios[3]) || 100,
        },
        daily_uptime: dailyUptime,
        average_response_time: monitor.average_response_time,
      };
    }) || [];

  const overallUptime = {
    '24h':
      monitors.reduce(
        (acc: number, m: Monitor) => acc + m.uptime_ratio['24h'],
        0,
      ) / (monitors.length || 1),
    '7d':
      monitors.reduce(
        (acc: number, m: Monitor) => acc + m.uptime_ratio['7d'],
        0,
      ) / (monitors.length || 1),
    '30d':
      monitors.reduce(
        (acc: number, m: Monitor) => acc + m.uptime_ratio['30d'],
        0,
      ) / (monitors.length || 1),
    '90d':
      monitors.reduce(
        (acc: number, m: Monitor) => acc + m.uptime_ratio['90d'],
        0,
      ) / (monitors.length || 1),
  };

  return {
    monitors,
    overall_uptime: overallUptime,
    last_updated: new Date().toISOString(),
  };
}
