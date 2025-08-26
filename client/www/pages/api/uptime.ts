import { NextApiRequest, NextApiResponse } from 'next';

const UPTIMEROBOT_API_KEY = process.env.UPTIMEROBOT_API_KEY;
const UPTIMEROBOT_API_URL = 'https://api.uptimerobot.com/v2/getMonitors';

const secondsPerDay = 24 * 60 * 60;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!UPTIMEROBOT_API_KEY) {
    throw new Error(
      '[status] No API key provided. Update your .env with UPTIME_ROBOT_API_KEY',
    );
  }

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
      custom_uptime_ranges: Array.from({ length: 90 }, (_, dayOffset) => {
        const nowInSecs = Math.floor(Date.now() / 1000);
        const windowStart = dayOffset + 1; // older boundary (e.g., 1d ago)
        const windowEnd = dayOffset; // newer boundary (e.g., now)

        const startInSecs = nowInSecs - windowStart * secondsPerDay;
        const endInSecs = nowInSecs - windowEnd * secondsPerDay;

        return `${startInSecs}_${endInSecs}`;
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
}
