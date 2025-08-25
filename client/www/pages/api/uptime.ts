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
        custom_uptime_ranges: Array.from({ length: 90 }, (_, dayIndex) => {
          const currentUnixTimestamp = Math.floor(Date.now() / 1000);
          const secondsPerDay = 24 * 60 * 60;
          
          const daysAgoStart = dayIndex + 1;
          const daysAgoEnd = dayIndex;
          
          const rangeStartTimestamp = currentUnixTimestamp - (daysAgoStart * secondsPerDay);
          const rangeEndTimestamp = currentUnixTimestamp - (daysAgoEnd * secondsPerDay);
          
          return `${rangeStartTimestamp}_${rangeEndTimestamp}`;
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
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching uptime data:', error);
    res.status(500).json({ error: 'Failed to fetch uptime data' });
  }
}
