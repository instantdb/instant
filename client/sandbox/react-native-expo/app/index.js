import { Linking, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import config from './config';

export default function Page() {
  if (!config.appId) {
    return (
      <View className="space-y-2 py-20 px-10">
        <Text className="text-xl font-bold">
          Welcome to the react-native-expo playground!
        </Text>
        <Text>
          In order to use the playground, you need to set up a you `.env` file
        </Text>
        <Text>Take a look at:</Text>
        <Text className="font-bold">sandbox/react-native-expo/README.md</Text>
      </View>
    );
  }
  return (
    <View className="h-full m-4 mt-8">
      <Link className="text-lg" href="/play/authhello">
        Auth Hello
      </Link>
      <Link className="text-lg" href="/play/expo-auth-session">
        Expo Auth Session
      </Link>
      <Link className="text-lg" href="/play/colors">
        Colors
      </Link>
      <Link className="text-lg" href="/play/colors-schema">
        Colors (with schema)
      </Link>
      <Link className="text-lg" href="/play/litoe">
        Litoe
      </Link>
    </View>
  );
}
