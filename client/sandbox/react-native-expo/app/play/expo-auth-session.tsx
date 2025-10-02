import React from 'react';
import { View, Text, Button, ScrollView } from 'react-native';
import { i, tx, id, InstantReactNativeDatabase, User } from '@instantdb/react-native';
import {
  makeRedirectUri,
  useAuthRequest,
  useAutoDiscovery,
} from 'expo-auth-session';
import EphemeralAppPage from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {
    goals: i.entity({
      title: i.string(),
      creatorId: i.string(),
    }),
    todos: i.entity({
      title: i.string(),
      creatorId: i.string(),
    }),
  },
  links: {
    goalTodos: {
      forward: { on: 'goals', has: 'many', label: 'todos' },
      reverse: { on: 'todos', has: 'one', label: 'goal' },
    },
  },
});

type Schema = typeof schema;

interface DemoDataProps {
  user: User;
  db: InstantReactNativeDatabase<Schema>;
}

interface ExpoAuthAppProps {
  db: InstantReactNativeDatabase<Schema>;
  appId: string;
  onReset?: () => void;
}

function ExpoAuthApp({ db }: ExpoAuthAppProps) {
  const { isLoading, user, error } = db.useAuth();
  if (isLoading) {
    return <Text>Loading...</Text>;
  }
  if (error) {
    return <Text>Uh oh! {error.message}</Text>;
  }
  if (user) {
    return <DemoData user={user} db={db} />;
  }
  return <Login db={db} />;
}

function Login({ db }: { db: InstantReactNativeDatabase<Schema> }) {
  const discovery = useAutoDiscovery(db.auth.issuerURI());
  const [request, _response, promptAsync] = useAuthRequest(
    {
      clientId: 'google-web',
      redirectUri: makeRedirectUri(),
    },
    discovery,
  );
  return (
    <View className="h-full justify-center items-center">
      <Button
        title="Log in with expo auth"
        disabled={!request}
        onPress={async () => {
          try {
            const res = await promptAsync();
            if (res.type === 'dismiss') {
              alert('Auth request was dismissed');
              return;
            }
            if (res.type === 'cancel') {
              alert('Auth request was canceled');
              return;
            }
            if (res.type === 'error') {
              alert(res.error || 'Something went wrong');
            }
            if (res.type === 'success') {
              await db.auth
                .exchangeOAuthCode({
                  code: res.params.code,
                  codeVerifier: request.codeVerifier,
                })
                .catch((e) => alert(e.body?.message || 'Something went wrong'));
            }
          } catch (e) {
            console.error(e);
          }
        }}
      />
    </View>
  );
}

function DemoData({ user, db }: DemoDataProps) {
  const { useQuery, transact, auth } = db;
  const { isLoading, error, data } = useQuery({ goals: { todos: {} } });
  if (isLoading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error.message}</Text>;

  return (
    <ScrollView className="py-10 px-4">
      <Button
        title="Create some example data"
        onPress={() => {
          const todoAId = id();
          const todoBId = id();
          transact([
            tx.todos[todoAId].update({
              title: 'Go on a run',
              creatorId: user.id,
            }),
            tx.todos[todoBId].update({
              title: 'Drink a protein shake',
              creatorId: user.id,
            }),
            tx.goals[id()]
              .update({ title: 'Get six pack abs', creatorId: user.id })
              .link({ todos: todoAId })
              .link({ todos: todoBId }),
          ]);
        }}
      />
      <Button
        title="Clear Data"
        onPress={() => {
          const goalIds = data.goals.map((g) => g.id);
          const todoIds = data.goals.flatMap((g) => g.todos.map((t) => t.id));
          transact([
            ...goalIds.map((id) => tx.goals[id].delete()),
            ...todoIds.map((id) => tx.todos[id].delete()),
          ]);
        }}
      />
      <Button
        title="Sign Out"
        onPress={() => {
          auth.signOut();
        }}
      />
      <Text>{JSON.stringify(data, null, 2)}</Text>
    </ScrollView>
  );
}

export default function Page() {
  return <EphemeralAppPage schema={schema} Component={ExpoAuthApp} />;
}
