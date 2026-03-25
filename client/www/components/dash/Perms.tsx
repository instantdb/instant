import JsonParser from 'json5';
import { useContext, useMemo, useState } from 'react';
import { formatDistance } from 'date-fns';

import {
  BaseSelect,
  Button,
  Content,
  Dialog,
  JSONDiffEditor,
  JSONEditor,
  SectionHeading,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  useDialog,
} from '@/components/ui';
import config from '@/lib/config';
import { TokenContext } from '@/lib/contexts';
import { useTokenFetch } from '@/lib/auth';
import { jsonFetch } from '@/lib/fetch';
import { errorToast, successToast } from '@/lib/toast';
import { InstantApp, SchemaNamespace } from '@/lib/types';
import { HomeButton } from '@/pages/dash';
import { InstantReactWebDatabase } from '@instantdb/react';
import { FetchedDash, useFetchedDash } from './MainDashLayout';
import permsJsonSchema from '@/lib/permsJsonSchema';
import { useDarkMode } from './DarkModeToggle';
import { apply, type Edit } from '@/lib/editscript';

type RuleVersion = {
  version: number;
  edits: Edit[];
  created_at: string;
};

export function Perms({
  app,
  db,
  namespaces,
}: {
  app: InstantApp;
  db: InstantReactWebDatabase<any>;
  namespaces: SchemaNamespace[] | null;
}) {
  const [errorRes, setErrorRes] = useState<{
    message: string;
    in: string[];
  } | null>(null);
  const token = useContext(TokenContext);
  const value = useMemo(() => {
    return app.rules ? JSON.stringify(app.rules, null, 2) : '';
  }, [app]);

  const schema = permsJsonSchema(namespaces);
  const dashResponse = useFetchedDash();
  const { darkMode } = useDarkMode();

  const [selectedVersion, setSelectedVersion] = useState<string>('current');

  const versionsResponse = useTokenFetch<{ versions: RuleVersion[] }>(
    `${config.apiURI}/dash/apps/${app.id}/rule-versions`,
    token,
  );
  const versions = versionsResponse.data?.versions ?? null;

  // Check that the version list is in sync with the current rules
  const latestVersion =
    versions && versions.length > 0
      ? Math.max(...versions.map((v) => v.version))
      : null;
  const versionsInSync =
    latestVersion != null && latestVersion === app.rules_version;

  const selectedVersionNum =
    selectedVersion === 'current' ? null : Number(selectedVersion);

  // Reconstruct the rules at the selected version and the one before it.
  // Each version's edits transform version N → version N-1.
  const { reconstructedRules, previousRules } = useMemo(() => {
    if (
      selectedVersionNum == null ||
      !versionsInSync ||
      !versions ||
      !app.rules
    ) {
      return { reconstructedRules: null, previousRules: null };
    }

    const sortedDesc = [...versions].sort((a, b) => b.version - a.version);

    // Check for gaps — versions must be consecutive
    for (let i = 0; i < sortedDesc.length - 1; i++) {
      if (sortedDesc[i].version - sortedDesc[i + 1].version !== 1) {
        return { reconstructedRules: null, previousRules: null };
      }
    }

    try {
      let rules: any = app.rules;

      for (const v of sortedDesc) {
        if (v.version <= selectedVersionNum) break;
        rules = apply(rules, v.edits);
      }

      const reconstructed = rules;

      const selectedV = versions.find((v) => v.version === selectedVersionNum);
      const prior = selectedV ? apply(reconstructed, selectedV.edits) : null;

      return { reconstructedRules: reconstructed, previousRules: prior };
    } catch (e) {
      console.error('Failed to reconstruct rules from version history', e);
      return { reconstructedRules: null, previousRules: null };
    }
  }, [selectedVersionNum, versionsInSync, versions, app.rules]);

  const [diffBase, setDiffBase] = useState<'current' | 'previous'>('previous');

  const restoreDialog = useDialog();
  const [restoring, setRestoring] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<any>(null);

  const handleRestoreClick = async (target: any) => {
    setRestoreTarget(target);
    // Refetch to make sure we have the latest rules before showing the modal
    await dashResponse.refetch();
    restoreDialog.onOpen();
  };

  const handleRestoreConfirm = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await onEditRules(
        dashResponse,
        app.id,
        JSON.stringify(restoreTarget),
        token,
      );
      setErrorRes(null);
      restoreDialog.onClose();
      setSelectedVersion('current');
      versionsResponse.mutate();
    } catch (error: any) {
      if (error?.message && error?.in) {
        setErrorRes(error);
      }
    } finally {
      setRestoring(false);
    }
  };

  const showingDiff = selectedVersionNum != null && reconstructedRules != null;
  const historyUnavailable =
    selectedVersionNum != null && reconstructedRules == null;

  const sortedVersions = useMemo(() => {
    if (!versions || versions.length === 0) return [];
    return [...versions].sort((a, b) => b.version - a.version);
  }, [versions]);

  const isCurrentVersion =
    sortedVersions.length > 0 &&
    selectedVersionNum === sortedVersions[0].version;

  const selectedTriggerLabel =
    selectedVersion === 'current'
      ? 'current'
      : `v${selectedVersion}${isCurrentVersion ? ' (current)' : ''}`;

  const versionSelect = sortedVersions.length > 0 && (
    <BaseSelect
      value={selectedVersion}
      onValueChange={setSelectedVersion}
    >
      <SelectTrigger className="text-xs">
        <SelectValue>{selectedTriggerLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="current">current</SelectItem>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel className="text-xs text-gray-400">Changes</SelectLabel>
          {sortedVersions.map((v, i) => (
            <SelectItem key={v.version} value={String(v.version)}>
              v{v.version}
              {i === 0 ? ' (current)' : ''} —{' '}
              {formatDistance(new Date(v.created_at), new Date(), {
                addSuffix: true,
              })}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </BaseSelect>
  );

  const diffBaseSelect = showingDiff && !isCurrentVersion && (
    <BaseSelect
      value={diffBase}
      onValueChange={(v) => setDiffBase(v as 'current' | 'previous')}
    >
      <SelectTrigger className="text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="previous">vs previous</SelectItem>
        <SelectItem value="current">vs current</SelectItem>
      </SelectContent>
    </BaseSelect>
  );

  const editorLabel = (
    <span className="flex items-center gap-2 text-sm">
      <span>
        <span
          className="text-sm font-bold text-yellow-600"
          style={{ letterSpacing: '4px' }}
        >
          {'{}'}
        </span>{' '}
        rules.json
      </span>
      {versionSelect}
      {diffBaseSelect}
    </span>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="flex min-h-0 min-w-[260px] flex-col gap-4 border-r p-4 text-sm md:basis-96 md:text-base dark:border-r-neutral-700">
        <SectionHeading>Permissions</SectionHeading>
        <Content className="dark:text-neutral-300">
          <p>
            Ready to share your app with the world? You likely need to add some
            permissions. You can define them here
          </p>
          <p>
            Under the hood, Instant uses the CEL Expression Language. Check out
            the docs to learn more about permission rules and how you can write
            them.
          </p>
        </Content>
        <HomeButton href="/docs/permissions" title="Using Permissions">
          Learn how to use CEL expressions to secure your app
        </HomeButton>
      </div>
      <div className="flex w-full flex-1 flex-col justify-start dark:bg-neutral-800">
        {errorRes && (
          <div className="bg-red-100 p-4 text-sm">
            <div className="max-w-sm">
              <h4 className="font-bold text-red-700">
                There was an error in {errorRes.in.join('->')}
              </h4>
              <pre className="whitespace-pre-wrap">{errorRes.message}</pre>
            </div>
          </div>
        )}
        {showingDiff ? (
          <>
            <JSONDiffEditor
              darkMode={darkMode}
              {...(isCurrentVersion || diffBase === 'previous'
                ? stringifyForDiff(previousRules, reconstructedRules)
                : stringifyForDiff(app.rules, reconstructedRules))}
              label={editorLabel}
              action={
                <Button
                  variant="secondary"
                  size="mini"
                  onClick={() => setSelectedVersion('current')}
                >
                  Close
                </Button>
              }
            />
            <div className="flex items-center gap-3 border-t bg-gray-50 px-4 py-2 dark:border-t-neutral-700 dark:bg-[#252525]">
              {isCurrentVersion ? (
                previousRules && (
                  <Button
                    size="mini"
                    onClick={() => handleRestoreClick(previousRules)}
                  >
                    Restore previous version
                  </Button>
                )
              ) : (
                <Button
                  size="mini"
                  onClick={() => handleRestoreClick(reconstructedRules)}
                >
                  Restore this version
                </Button>
              )}
            </div>
          </>
        ) : historyUnavailable ? (
          <div className="flex h-full min-h-0 flex-col bg-gray-50 dark:bg-[#252525]">
            <div className="flex items-center justify-between gap-4 border-b px-4 py-2 dark:border-b-neutral-700">
              <div className="font-mono">{editorLabel}</div>
              <Button
                variant="secondary"
                size="mini"
                onClick={() => setSelectedVersion('current')}
              >
                Close
              </Button>
            </div>
            <div className="flex flex-1 items-center justify-center text-sm text-gray-500 dark:text-neutral-400">
              Version history unavailable for this selection.
            </div>
          </div>
        ) : (
          <JSONEditor
            darkMode={darkMode}
            label={editorLabel}
            value={value}
            schema={schema}
            onSave={async (r) => {
              const er = await onEditRules(
                dashResponse,
                app.id,
                r,
                token,
              ).catch((error) => error);
              setErrorRes(er);
              if (!er) versionsResponse.mutate();
            }}
          />
        )}
      </div>
      <Dialog
        title="Restore permissions"
        className="sm:max-w-3xl"
        open={restoreDialog.open}
        onClose={restoreDialog.onClose}
      >
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold dark:text-neutral-100">
            Restore permissions
          </h3>
          <p className="text-sm text-gray-600 dark:text-neutral-300">
            This will replace your current permissions with the selected
            version. Review the changes below.
          </p>
          <div className="h-[70vh] rounded border dark:border-neutral-700">
            <JSONDiffEditor
              darkMode={darkMode}
              {...stringifyForDiff(app.rules, restoreTarget)}
              label={
                <span className="text-xs text-gray-500 dark:text-neutral-400">
                  current → restored
                </span>
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="mini"
              disabled={restoring}
              onClick={handleRestoreConfirm}
            >
              {restoring ? 'Restoring...' : 'Restore'}
            </Button>
            <Button
              variant="secondary"
              size="mini"
              onClick={restoreDialog.onClose}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

// --- Helpers ---

/**
 * Serialize two objects to JSON with changed keys sorted first,
 * so diffs appear at the top of the diff viewer.
 */
function stringifyForDiff(
  a: any,
  b: any,
): { original: string; modified: string } {
  const isObj = (v: any): v is Record<string, any> =>
    v != null && typeof v === 'object' && !Array.isArray(v);

  const sortKeys = (obj: any, other: any): any => {
    if (!isObj(obj)) return obj;
    const otherIsObj = isObj(other);
    const changed: string[] = [];
    const unchanged: string[] = [];
    for (const key of Object.keys(obj)) {
      if (
        !otherIsObj ||
        !(key in other) ||
        JSON.stringify(obj[key]) !== JSON.stringify(other[key])
      ) {
        changed.push(key);
      } else {
        unchanged.push(key);
      }
    }
    const sorted: any = {};
    for (const key of [...changed, ...unchanged]) {
      sorted[key] = sortKeys(obj[key], otherIsObj ? other[key] : undefined);
    }
    return sorted;
  };
  return {
    original: JSON.stringify(sortKeys(a, b), null, 2),
    modified: JSON.stringify(sortKeys(b, a), null, 2),
  };
}

async function onEditRules(
  dashResponse: FetchedDash,
  appId: string,
  newRules: string,
  token: string,
): Promise<void> {
  const prevApps = dashResponse.data.apps;
  const currentApp = prevApps.find((x: any) => x.id === appId);
  if (!currentApp) {
    return Promise.reject({ message: null });
  }
  let newRulesObj: any = null;
  try {
    newRulesObj = JsonParser.parse(newRules, (key, value) => {
      // rules.json permissions require that "true" and "false" be strings
      if (value === true) {
        return 'true';
      } else if (value === false) {
        return 'false';
      } else {
        return value;
      }
    });
  } catch (e) {
    errorToast('Beep boop. Please use valid JSON', { autoClose: 3000 });
    return Promise.reject(null);
  }
  const updatedApp = { ...currentApp, rules: newRulesObj };

  const updatedApps = prevApps.map((x: any) => {
    if (x.id === appId) {
      return updatedApp;
    }
    return x;
  });

  return updateRules(token, appId, newRulesObj)
    .then(() => {
      dashResponse.mutate({ ...dashResponse.data, apps: updatedApps });
      successToast('Huzzah. Your rules have been updated!');
    })
    .catch((e: any) => {
      const validationErr = e.body?.hint?.errors?.[0];
      if (validationErr) {
        return Promise.reject(validationErr);
      }
      errorToast(
        "Oh no, we weren't able to save these rules. Please try again or ping us on Discord if you're stuck!",
        { autoClose: 3000 },
      );
      return Promise.reject();
    });
}

function updateRules(token: string, appId: string, newRulesObj: object) {
  return jsonFetch(`${config.apiURI}/dash/apps/${appId}/rules`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ code: newRulesObj }),
  });
}
