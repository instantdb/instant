import { init, InstantError } from '@instantdb/admin';

const API_URI =
  process.env.INSTANT_WEBHOOKS_API_URI || 'https://api.instantdb.com';

const getDb = () => {
  if (!process.env.INSTANT_CONFIG_APP_ID) {
    throw new Error('INSTANT_CONFIG_APP_ID is not set');
  }
  return init({
    appId: process.env.INSTANT_CONFIG_APP_ID,
    apiURI: API_URI,
  });
};

type Action = 'create' | 'update' | 'delete';

type Record_ = {
  etype: string;
  action: Action;
  id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

type Embed = {
  title?: string;
  description?: string;
  footer?: { text: string };
  timestamp?: string;
};

// Discord limits
const DESCRIPTION_MAX = 4096;
const CODE_BLOCK_MAX = 3800; // leave room for description framing

const truncate = (s: string, max: number) =>
  s.length <= max ? s : s.slice(0, max - 1) + '…';

const formatValue = (v: unknown): string => {
  if (v === undefined) return 'undefined';
  try {
    return truncate(JSON.stringify(v), 200);
  } catch {
    return truncate(String(v), 200);
  }
};

const fullDiffLines = (
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] => {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const lines: string[] = [];
  for (const k of keys) {
    const inBefore = k in before;
    const inAfter = k in after;
    const b = before[k];
    const a = after[k];
    if (!inBefore && inAfter) {
      lines.push(`+ ${k}: ${formatValue(a)}`);
    } else if (inBefore && !inAfter) {
      lines.push(`- ${k}: ${formatValue(b)}`);
    } else if (JSON.stringify(b) === JSON.stringify(a)) {
      lines.push(`  ${k}: ${formatValue(a)}`);
    } else {
      lines.push(`- ${k}: ${formatValue(b)}`);
      lines.push(`+ ${k}: ${formatValue(a)}`);
    }
  }
  return lines;
};

const codeBlock = (lang: string, body: string) =>
  '```' + lang + '\n' + truncate(body, CODE_BLOCK_MAX) + '\n```';

const baseEmbed = (record: Record_): Embed => ({
  title: 'instant-config changed',
  footer: { text: `${record.etype} • ${record.action}` },
  timestamp: new Date().toISOString(),
});

const toggleEmbed = (record: Record_): Embed | null => {
  if (record.action === 'delete') {
    const setting = record.before?.setting;
    if (!setting) return null;
    return {
      ...baseEmbed(record),
      description: `Toggle \`${String(setting)}\` removed`,
    };
  }
  const setting = record.after?.setting;
  if (!setting) return null;
  const toggled = record.after?.toggled;
  const verb = record.action === 'create' ? 'set' : 'updated';
  return {
    ...baseEmbed(record),
    description: `Toggle \`${String(setting)}\` ${verb} to \`${String(toggled)}\``,
  };
};

const flagEmbed = (record: Record_): Embed | null => {
  if (record.action === 'delete') {
    const setting = record.before?.setting;
    if (!setting) return null;
    return {
      ...baseEmbed(record),
      description: `Flag \`${String(setting)}\` removed`,
    };
  }
  const setting = record.after?.setting;
  if (!setting) return null;
  const value = record.after?.value;
  if (record.action === 'update' && record.before) {
    const oldValue = record.before.value;
    return {
      ...baseEmbed(record),
      description: `Flag \`${String(setting)}\` changed from \`${formatValue(oldValue)}\` to \`${formatValue(value)}\``,
    };
  }
  return {
    ...baseEmbed(record),
    description: `Flag \`${String(setting)}\` set to \`${formatValue(value)}\``,
  };
};

const defaultEmbed = (record: Record_): Embed => {
  const header = `\`${record.etype}\` ${record.action}`;
  let codeBody = '';
  if (record.action === 'create' && record.after) {
    codeBody = Object.entries(record.after)
      .map(([k, v]) => `+ ${k}: ${formatValue(v)}`)
      .join('\n');
  } else if (record.action === 'update' && record.before && record.after) {
    codeBody = fullDiffLines(record.before, record.after).join('\n');
  } else if (record.action === 'delete' && record.before) {
    codeBody = Object.entries(record.before)
      .map(([k, v]) => `- ${k}: ${formatValue(v)}`)
      .join('\n');
  }
  const description = codeBody
    ? `${header}\n${codeBlock('diff', codeBody)}`
    : header;
  return {
    ...baseEmbed(record),
    description: truncate(description, DESCRIPTION_MAX),
  };
};

const postEmbed = async (embed: Embed) => {
  const url = process.env.DISCORD_CONFIG_WEBHOOK_URL;
  if (!url) {
    throw new Error('DISCORD_CONFIG_WEBHOOK_URL is not set');
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'Instant Config Webhook',
      embeds: [embed],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord webhook failed: ${res.status} ${text}`);
  }
};

export const POST = async (req: Request) => {
  try {
    const db = getDb();
    const { typedHandlers, combineHandlers } = db.webhooks.helpers();
    const handlers = combineHandlers(
      typedHandlers('toggles', '$default', async (record) => {
        const embed = toggleEmbed(record as any);
        if (embed) await postEmbed(embed);
      }),
      typedHandlers('flags', '$default', async (record) => {
        const embed = flagEmbed(record as any);
        if (embed) await postEmbed(embed);
      }),
      typedHandlers('$default', async (record) => {
        await postEmbed(defaultEmbed(record as any));
      }),
    );
    await db.webhooks.processRequest(handlers, req);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof InstantError) {
      console.warn('[webhooks/config] rejected', err.message, err.hint);
      return Response.json(
        { ok: false, error: err.message, details: err.hint },
        { status: 400 },
      );
    }
    console.error('[webhooks/config] error', err);
    return Response.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
};
