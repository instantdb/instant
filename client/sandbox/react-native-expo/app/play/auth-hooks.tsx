import { init, i } from '@instantdb/react-native';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useState } from 'react';
import config from '../config';

const schema = i.schema({
  entities: {
    todos: i.entity({
      title: i.string().unique().indexed(),
      completed: i.boolean(),
      createdAt: i.number(),
    }),
  },
  //...
});

const db = init({ ...config, schema });

function AuthedView() {
  const user = db.useUser();
  return (
    <View>
      <View style={styles.spaceY4}>
        <Text>Signed In as {user.email}</Text>
        <Text>This view requires auth</Text>
      </View>
    </View>
  );
}

function Main() {
  const [codeInput, setCodeInput] = useState('');
  const [emailInput, setEmailInput] = useState('');

  const loginWithCode = () => {
    db.auth.signInWithMagicCode({
      email: emailInput,
      code: codeInput,
    });
  };

  const sendEmail = () => {
    db.auth.sendMagicCode({
      email: emailInput,
    });
  };

  const signOut = () => {
    db.auth.signOut();
  };

  const auth = db.useAuth();

  return (
    <View style={[styles.container]}>
      <View style={styles.spaceY4}>
        <db.SignedIn>
          <AuthedView />
        </db.SignedIn>
        <db.SignedOut>
          <Text>User Is signed out</Text>
        </db.SignedOut>
        <TextInput
          style={styles.input}
          value={codeInput}
          onChangeText={setCodeInput}
          placeholder="Code"
        />

        <TextInput
          style={styles.input}
          value={emailInput}
          onChangeText={setEmailInput}
          placeholder="Email"
        />

        <TouchableOpacity style={styles.button} onPress={loginWithCode}>
          <Text style={styles.buttonText}>Login with Code</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={sendEmail}>
          <Text style={styles.buttonText}>Send Email</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={signOut}>
          <Text style={styles.buttonText}>Sign Out</Text>
        </TouchableOpacity>

        <Text>{JSON.stringify(auth, null, 2)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  spaceY4: {
    marginVertical: 16,
    width: '100%',
    maxWidth: 300,
  },
  spaceX4: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default Main;
