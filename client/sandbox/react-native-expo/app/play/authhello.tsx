import React, { useState } from 'react';
import { View, Text, TextInput, Button, Alert, ScrollView } from 'react-native';
import { i, tx, id, InstantReactNativeDatabase, User } from '@instantdb/react-native';
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

interface LoginState {
  sentEmail: string;
  email: string;
  code: string;
}

interface DemoDataProps {
  user: User;
  db: InstantReactNativeDatabase<Schema>;
}

interface AuthHelloAppProps {
  db: InstantReactNativeDatabase<Schema>;
  appId: string;
  onReset?: () => void;
}

function AuthHelloApp({ db }: AuthHelloAppProps) {
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
  const [state, setState] = useState<LoginState>({
    sentEmail: '',
    email: '',
    code: '',
  });
  const { sentEmail, email, code } = state;

  return (
    <View className="h-full justify-center items-center m-1">
      {!sentEmail ? (
        <View key="em">
          <Text>Let's log you in!</Text>
          <TextInput
            placeholder="Enter your email"
            value={email}
            onChangeText={(text) => setState({ ...state, email: text })}
          />
          <Button
            title="Send Code"
            onPress={() => {
              setState({ ...state, sentEmail: email });
              db.auth.sendMagicCode({ email }).catch((err) => {
                Alert.alert('Uh oh: ' + err.body?.message);
                setState({ ...state, sentEmail: '' });
              });
            }}
          />
        </View>
      ) : (
        <View key="cd">
          <Text>Okay we sent you an email! What was the code?</Text>
          <TextInput
            placeholder="Code plz"
            value={code}
            onChangeText={(text) => setState({ ...state, code: text })}
          />
          <Button
            title="Verify"
            onPress={() => {
              db.auth
                .signInWithMagicCode({ email: sentEmail, code })
                .catch((err) => {
                  Alert.alert('Uh oh: ' + err.body?.message);
                  setState({ ...state, code: '' });
                });
            }}
          />
        </View>
      )}
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
  return <EphemeralAppPage schema={schema} Component={AuthHelloApp} />;
}
