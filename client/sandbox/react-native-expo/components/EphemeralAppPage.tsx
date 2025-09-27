import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import {
  init,
  InstantReactNativeDatabase,
  InstantSchemaDef,
  Config,
  InstantUnknownSchema,
} from '@instantdb/react-native';
import config from '../lib/config';

interface ProvisionEphemeralAppParams<
  Schema extends InstantSchemaDef<any, any, any>,
> {
  perms?: any;
  schema?: Schema;
  onCreateApp?: (db: InstantReactNativeDatabase<Schema>) => Promise<void>;
}

// (TODO): This is identical to what we have in the react sandbox epehemeral
// app page. Might be nice to share this code between the two packages.
async function provisionEphemeralApp<
  Schema extends InstantSchemaDef<any, any, any>,
>({ perms, schema, onCreateApp }: ProvisionEphemeralAppParams<Schema>) {
  const body: any = { title: 'Example app' };
  if (perms) {
    body.rules = { code: perms };
  }
  if (schema) {
    body.schema = schema;
  }

  const r = await fetch(`${config.apiURI}/dash/apps/ephemeral`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const res = await r.json();

  if (res.app && onCreateApp) {
    const db = init({ ...config, appId: res.app.id, schema });
    await onCreateApp(db);
  }

  return res;
}

interface EphemeralAppPageProps<
  Schema extends InstantSchemaDef<any, any, any> = InstantUnknownSchema,
> {
  schema?: Schema;
  perms?: any;
  onCreateApp?: (db: InstantReactNativeDatabase<Schema>) => Promise<void>;
  Component: React.ComponentType<{
    db: InstantReactNativeDatabase<Schema>;
    appId: string;
    onReset?: () => void;
  }>;
  extraConfig?: Partial<Omit<Config, 'appId' | 'schema'>>;
}

function EphemeralAppPage<
  Schema extends InstantSchemaDef<any, any, any> = InstantUnknownSchema,
>({
  schema,
  perms,
  onCreateApp,
  Component,
  extraConfig,
}: EphemeralAppPageProps<Schema>) {
  const [appId, setAppId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const provisionApp = async () => {
    try {
      setIsLoading(true);
      const res = await provisionEphemeralApp({ schema, perms, onCreateApp });

      if (res.app) {
        setAppId(res.app.id);
      } else {
        console.log(res);
        setError('Could not create app.');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    provisionApp();
  }, []);

  const handleReset = () => {
    setAppId(null);
    setError(null);
    provisionApp();
  };

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>There was an error</Text>
        <Text style={styles.errorMessage}>{error}</Text>
      </View>
    );
  }

  if (isLoading || !appId) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading...</Text>
      </View>
    );
  }

  const finalConfig = { ...config, ...extraConfig, schema, appId };
  const db = init(finalConfig);

  return <Component key={appId} db={db} appId={appId} onReset={handleReset} />;
}

export default EphemeralAppPage;

interface ResetButtonProps {
  style?: StyleProp<ViewStyle>;
  label?: string;
  onReset?: () => void;
}

export function ResetButton({ style, label, onReset }: ResetButtonProps) {
  return (
    <Pressable style={[styles.resetButton, style]} onPress={onReset}>
      <Text style={styles.resetButtonText}>{label || 'Start Over'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  errorMessage: {
    fontSize: 16,
    color: 'red',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resetButton: {
    backgroundColor: 'black',
    padding: 10,
    margin: 8,
    borderRadius: 5,
  },
  resetButtonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
