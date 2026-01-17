import { i, id, InstantReactNativeDatabase } from '@instantdb/react-native';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import EphemeralAppPage, {
  ResetButton,
} from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {
    docs: i.entity({
      title: i.string(),
    }),
  },
});

type Schema = typeof schema;

const perms = {
  docs: {
    allow: {
      view: 'true',
      create: 'true',
      update: 'true',
      delete: 'true',
    },
  },
};

interface AppProps {
  db: InstantReactNativeDatabase<Schema>;
  appId: string;
  onReset?: () => void;
}

function App({ db, onReset }: AppProps) {
  const { isLoading, error, data } = db.useQuery({ docs: {} });

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <Text>Loading</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text>Error: {error.message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ResetButton style={styles.resetButton} onReset={onReset} />
      <ScrollView style={styles.scrollView}>
        <Text style={styles.json}>{JSON.stringify(data, null, 2)}</Text>
      </ScrollView>
      <Pressable
        style={styles.addButton}
        onPress={() =>
          db.transact(db.tx.docs[id()].update({ title: 'New doc' }))
        }
      >
        <Text style={styles.buttonText}>Add doc</Text>
      </Pressable>
    </View>
  );
}

export default function Page() {
  return (
    <View style={styles.pageContainer}>
      <Text style={styles.title}>Ephemeral App Demo</Text>
      <Text style={styles.description}>
        This is a demo of how to create a play page with an ephemeral app. Look
        at `ephemeral-demo.tsx` to create your own.
      </Text>
      <EphemeralAppPage schema={schema} perms={perms} Component={App} />
    </View>
  );
}

const styles = StyleSheet.create({
  pageContainer: {
    flex: 1,
    marginTop: 50,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  description: {
    textAlign: 'center',
    marginBottom: 30,
    color: '#666',
  },
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resetButton: {
    backgroundColor: '#000',
    marginBottom: 20,
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 10,
    marginBottom: 20,
    borderRadius: 5,
  },
  json: {
    fontFamily: 'monospace',
    fontSize: 14,
  },
  addButton: {
    backgroundColor: '#000',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});
