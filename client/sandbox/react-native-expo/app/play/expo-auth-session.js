import React from "react";
import { View, Text, Button, ScrollView } from "react-native";
import { init, tx, id } from "@instantdb/react-native";
import {
  makeRedirectUri,
  useAuthRequest,
  useAutoDiscovery,
} from "expo-auth-session";

import config from "../config";

const db = init(config);

function App() {
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
  return <Login />;
}

function Login() {
  const discovery = useAutoDiscovery(db.auth.issuerURI());
  const [request, _response, promptAsync] = useAuthRequest(
    {
      clientId: "google-web",
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
            if (res.type === "dismiss") {
              alert("Auth request was dismissed");
              return;
            }
            if (res.type === "cancel") {
              alert("Auth request was canceled");
              return;
            }
            if (res.type === "error") {
              alert(res.error || "Something went wrong");
            }
            if (res.type === "success") {
              await db.auth
                .exchangeOAuthCode({
                  code: res.params.code,
                  codeVerifier: request.codeVerifier,
                })
                .catch((e) => alert(e.body?.message || "Something went wrong"));
            } else {
            }
          } catch (e) {
            console.error(e);
          }
        }}
      ></Button>
    </View>
  );
}

function DemoData({ user, db }) {
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
              title: "Go on a run",
              creatorId: user.id,
            }),
            tx.todos[todoBId].update({
              title: "Drink a protein shake",
              creatorId: user.id,
            }),
            tx.goals[id()]
              .update({ title: "Get six pack abs", creatorId: user.id })
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

export default App;
