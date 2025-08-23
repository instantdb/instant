import { NextApiRequest, NextApiResponse } from 'next';

const UPTIMEROBOT_API_KEY = process.env.UPTIMEROBOT_API_KEY!;
const UPTIMEROBOT_API_URL = 'https://api.uptimerobot.com/v2/getMonitors';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch(UPTIMEROBOT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: UPTIMEROBOT_API_KEY,
        format: 'json',
        logs: 1,
        logs_limit: 200,
        response_times: 1,
        response_times_limit: 90,
        custom_uptime_ratios: '1-7-30-90',
        custom_uptime_ranges: Array.from({ length: 90 }, (_, i) => {
          const start = Math.floor(Date.now() / 1000) - (i + 1) * 24 * 60 * 60;
          const end = Math.floor(Date.now() / 1000) - i * 24 * 60 * 60;
          return `${start}_${end}`;
        })
          .reverse()
          .join('-'),
        all_time_uptime_ratio: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`UptimeRobot API error: ${response.status}`);
    }

    const data = await response.json();

    const monitors =
      data.monitors?.map((monitor: any) => {
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
          url: monitor.url,
          status: monitor.status,
          uptime_ratio: {
            '24h': parseFloat(customRatios[0]) || 100,
            '7d': parseFloat(customRatios[1]) || 100,
            '30d': parseFloat(customRatios[2]) || 100,
            '90d': parseFloat(customRatios[3]) || 100,
            all_time: parseFloat(monitor.all_time_uptime_ratio) || 100,
          },
          daily_uptime: dailyUptime,
          average_response_time: monitor.average_response_time,
          logs: monitor.logs?.slice(0, 10) || [],
        };
      }) || [];

    const overallUptime = {
      '24h':
        monitors.reduce(
          (acc: number, m: any) => acc + m.uptime_ratio['24h'],
          0,
        ) / (monitors.length || 1),
      '7d':
        monitors.reduce(
          (acc: number, m: any) => acc + m.uptime_ratio['7d'],
          0,
        ) / (monitors.length || 1),
      '30d':
        monitors.reduce(
          (acc: number, m: any) => acc + m.uptime_ratio['30d'],
          0,
        ) / (monitors.length || 1),
      '90d':
        monitors.reduce(
          (acc: number, m: any) => acc + m.uptime_ratio['90d'],
          0,
        ) / (monitors.length || 1),
    };

    res.status(200).json({
      monitors,
      overall_uptime: overallUptime,
      last_updated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching uptime data:', error);
    res.status(500).json({ error: 'Failed to fetch uptime data' });
  }
}
