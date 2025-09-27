import { View } from 'react-native';
import { Link } from 'expo-router';

export default function Page() {
  return (
    <View className="h-full m-4 mt-8">
      <Link className="text-lg" href="/play/ephemeral-demo">
        Ephemeral Demo
      </Link>
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
      <Link className="text-lg" href="/play/auth-hooks">
        useUser and {'<SignedIn>'}
      </Link>
    </View>
  );
}
