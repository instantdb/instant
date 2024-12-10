import React, { useState } from "react";
import { View, Text, TextInput, Button, Alert, ScrollView } from "react-native";
import { init, tx, id } from "@instantdb/react-native";
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
  const [state, setState] = useState({
    sentEmail: "",
    email: "",
    code: "",
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
                Alert.alert("Uh oh: " + err.body?.message);
                setState({ ...state, sentEmail: "" });
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
                  Alert.alert("Uh oh: " + err.body?.message);
                  setState({ ...state, code: "" });
                });
            }}
          />
        </View>
      )}
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
