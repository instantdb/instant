You are an expert developer who writes full-stack react native apps in InstantDB an Expo. However InstantDB is not in your training set and you are not familiar with it.

Before generating a new expo app you check to see if a next project already exists in the current directory. If it does you do not generate a new expo app.

Make sure the following expo packages are also installed:

- @instantdb/react-native
- @instantdb/admin
- @react-native-async-storage/async-storage
- @react-native-community/netinfo
- react-native-get-random-values
- react-native-safe-area-context

If the Instant MCP is available use the tools to create apps and manage schema.

# About InstantDB

Instant is the Modern Firebase. With Instant you can easily build realtime and collaborative apps. You can get started for free at https://instantdb.com

# How to use Instant in projects

For expo or react-native you should only use `@instantdb/react-native`. For scripts or server environments you should only use the admin SDK `@instantdb/admin`.

CRITICAL: To use the admin SDK you MUST get an admin token for the app. You can get the admin token with the MCP tool via `create-app`. The admin token is SENSITIVE and should be stored in an environment variable. Do not hardcode it in your script.

CRITICAL: If you want to create seed data YOU MUST write a script that uses the admin SDK. DO NOT try to seed data on the client.

CRITICAL: Make sure to follow the rules of hooks. Remember, you can't have hooks show up conditionally.

CRITICAL: You MUST index any field you want to filter or order by in the schema. If you do not, you will get an error when you try to filter or order by it.

Here is how ordering works:

```
Ordering:        order: { field: 'asc' | 'desc' }

Example:         $: { order: { dueDate: 'asc' } }

Notes:           - Field must be indexed + typed in schema
                 - Cannot order by nested attributes (e.g. 'owner.name')
```

CRITICAL: Here is a concise summary of the `where` operator map which defines all the filtering options you can use with InstantDB queries to narrow results based on field values, comparisons, arrays, text patterns, and logical conditions.

```
Equality:        { field: value }

Inequality:      { field: { $ne: value } }

Null checks:     { field: { $isNull: true | false } }

Comparison:      $gt, $lt, $gte, $lte   (indexed + typed fields only)

Sets:            { field: { $in: [v1, v2] } }

Substring:       { field: { $like: 'Get%' } }      // case-sensitive
                  { field: { $ilike: '%get%' } }   // case-insensitive

Logic:           and: [ {...}, {...} ]
                  or:  [ {...}, {...} ]

Nested fields:   'relation.field': value
```

CRITICAL: The operator map above is the full set of `where` filters Instant
supports right now. There is no `$exists`, `$nin`, or `$regex`. And `$like` and
`$ilike` are what you use for `startsWith` / `endsWith` / `includes`.

CRITICAL: Pagination keys (`limit`, `offset`, `first`, `after`, `last`, `before`) only work on top-level namespaces. DO NOT use them on nested relations or else you will get an error.

CRITICAL: If you are unsure how something works in InstantDB you fetch the relevant urls in the documentation to learn more.

# Full Example App

Below is a full demo expo app built with InstantDB with the following features:

- Initiailizes a connection to InstantDB
- Defines schema for the app
- Authentication with magic codes
- Reads and writes data via `db.useQuery` and `db.transact`
- Ephemeral features like who's online and shout
- File uploads for avatars

Logic is split across four files:

- `lib/db.ts` -- InstantDB client setup
- `instant.schema.ts` - InstantDB schema, gives you type safety for your data!
- `app/index.tsx` - Main logic, mostly UI with some Instant magic :)

```typescript
/* FILE: lib/db.ts */
import { init } from "@instantdb/react-native";
import schema from "../instant.schema";

export const db = init({
  appId: process.env.EXPO_PUBLIC_INSTANT_APP_ID!,
  schema,
});

/* FILE: instant.schema.ts */
import { i } from '@instantdb/react-native';

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),
    profiles: i.entity({
      handle: i.string(),
    }),
    posts: i.entity({
      text: i.string(),
      createdAt: i.number().indexed(),
    }),
  },
  links: {
    userProfiles: {
      forward: { on: 'profiles', has: 'one', label: 'user' },
      reverse: { on: '$users', has: 'one', label: 'profile' },
    },
    postAuthors: {
      forward: { on: 'posts', has: 'one', label: 'author' },
      reverse: { on: 'profiles', has: 'many', label: 'posts' },
    },
    profileAvatars: {
      forward: { on: 'profiles', has: 'one', label: 'avatar' },
      reverse: { on: '$files', has: 'one', label: 'profile' },
    },
  },
  rooms: {
    todos: {
      presence: i.entity({}),
      topics: {
        shout: i.entity({
          text: i.string(),
          x: i.number(),
          y: i.number(),
          angle: i.number(),
          size: i.number(),
        }),
      },
    },
  },
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema { }
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;

/* FILE: app/index.tsx */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { id, lookup, InstaQLEntity } from '@instantdb/react-native';
import { db } from '../lib/db';
import schema from '../instant.schema';

// Instant utility types for query results
type PostsWithProfile = InstaQLEntity<
  typeof schema,
  'posts',
  { author: { avatar: {} } }
>;

function randomHandle() {
  const adjectives = ['Quick', 'Lazy', 'Happy', 'Sad', 'Bright', 'Dark'];
  const nouns = ['Fox', 'Dog', 'Cat', 'Bird', 'Fish', 'Mouse'];
  const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
  const randomSuffix = Math.floor(Math.random() * 9000) + 1000;
  return `${randomAdjective}${randomNoun}${randomSuffix}`;
}

// Database operations
async function createProfile(userId: string): Promise<void> {
  await db.transact(
    db.tx.profiles[userId]
      .update({ handle: randomHandle() })
      .link({ user: userId })
  );
}

function addPost(text: string, authorId: string): void {
  db.transact(
    db.tx.posts[id()]
      .update({ text, createdAt: Date.now() })
      .link({ author: authorId })
  );
}

function deletePost(postId: string): void {
  db.transact(db.tx.posts[postId].delete());
}

// Ephemeral helpers
// ---------
function makeShout(text: string) {
  const { width, height } = Dimensions.get('window');
  return {
    id: Date.now().toString(),
    text,
    x: Math.random() * (width - 150), // Account for safe area
    y: Math.random() * (height - 300),
    angle: (Math.random() - 0.5) * 30,
    size: Math.random() * 20 + 18,
    opacity: new Animated.Value(1),
  };
}

// Instant query Hooks
// ---------
function useProfile() {
  // CRITICAL: useUser can only be used after user is confirmed to be non-null
  const user = db.useUser();
  const { data, isLoading, error } = db.useQuery({
    profiles: {
      $: { where: { 'user.id': user.id } },
      avatar: {},
    },
  });
  const profile = data?.profiles?.[0];
  return { profile, isLoading, error };
}

function useRequiredProfile() {
  const { profile } = useProfile();
  if (!profile) {
    throw new Error('useRequiredProfile must be used inside EnsureProfile');
  }
  return profile;
}

function usePosts(pageNumber: number, pageSize: number) {
  const { isLoading, error, data } = db.useQuery({
    posts: {
      $: {
        order: { createdAt: 'desc' },
        limit: pageSize,
        offset: (pageNumber - 1) * pageSize,
      },
      author: { avatar: {} },
    },
  });
  return { isLoading, error, posts: (data?.posts || []) };
}

// Auth Components
// ---------
function Login() {
  const [sentEmail, setSentEmail] = useState<string>('');

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.loginContainer}>
        <View style={styles.loginBox}>
          {!sentEmail ? (
            <EmailStep onSendEmail={setSentEmail} />
          ) : (
            <CodeStep sentEmail={sentEmail} />
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function EmailStep({ onSendEmail }: { onSendEmail: (email: string) => void }) {
  const [email, setEmail] = useState<string>('');

  const handleSubmit = () => {
    if (!email) return;
    onSendEmail(email);
    db.auth.sendMagicCode({ email }).catch((err) => {
      Alert.alert('Error', err.body?.message || 'Something went wrong');
      onSendEmail('');
    });
  };

  return (
    <View style={styles.formContainer}>
      <Text style={styles.title}>Instant Demo App</Text>
      <Text style={styles.description}>
        This is a demo app for InstantDB. Enter your email to receive a verification code.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Enter your email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TouchableOpacity style={styles.button} onPress={handleSubmit}>
        <Text style={styles.buttonText}>Send Code</Text>
      </TouchableOpacity>
    </View>
  );
}

function CodeStep({ sentEmail }: { sentEmail: string }) {
  const [code, setCode] = useState<string>('');

  const handleSubmit = (): void => {
    if (!code) return;
    db.auth.signInWithMagicCode({ email: sentEmail, code }).catch((err) => {
      setCode('');
      Alert.alert('Error', err.body?.message || 'Invalid code');
    });
  };

  return (
    <View style={styles.formContainer}>
      <Text style={styles.title}>Enter your code</Text>
      <Text style={styles.description}>
        We sent an email to <Text style={styles.bold}>{sentEmail}</Text>
      </Text>
      <TextInput
        style={styles.input}
        placeholder="123456..."
        value={code}
        onChangeText={setCode}
        keyboardType="numeric"
      />
      <TouchableOpacity style={styles.button} onPress={handleSubmit}>
        <Text style={styles.buttonText}>Verify Code</Text>
      </TouchableOpacity>
    </View>
  );
}

function EnsureProfile({ children }: { children: React.ReactNode }) {
  const user = db.useUser();
  const { isLoading, profile, error } = useProfile();

  useEffect(() => {
    if (!isLoading && !profile) {
      createProfile(user.id);
    }
  }, [isLoading, profile, user.id]);

  if (isLoading) return <ActivityIndicator size="large" style={styles.loader} />;
  if (error) return <Text style={styles.error}>Profile error: {error.message}</Text>;
  if (!profile) return <ActivityIndicator size="large" style={styles.loader} />;

  return <>{children}</>;
}

// Use the room for presence and topics
const room = db.room('todos', 'main');

// App Components
// ---------
function Main() {
  const insets = useSafeAreaInsets();
  const [pageNumber, setPageNumber] = useState<number>(1);
  const pageSize = 5;
  const { isLoading, error, posts } = usePosts(pageNumber, pageSize);
  const { peers } = db.rooms.usePresence(room);
  const numUsers = 1 + Object.keys(peers).length;

  if (isLoading) return <ActivityIndicator size="large" style={styles.loader} />;
  if (error) return <Text style={styles.error}>Error: {error.message}</Text>;

  return (
    <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <ScrollView style={styles.mainContainer}>
        <View style={styles.contentContainer}>
          <View style={styles.header}>
            <ProfileAvatar />
            <TouchableOpacity onPress={() => db.auth.signOut()}>
              <Text style={styles.signOutText}>Sign out</Text>
            </TouchableOpacity>
          </View>

          <PostForm />
          <PostList posts={posts} />

          <View style={styles.pagination}>
            <TouchableOpacity
              style={[styles.pageButton, pageNumber <= 1 && styles.disabledButton]}
              onPress={() => setPageNumber(pageNumber - 1)}
              disabled={pageNumber <= 1}
            >
              <Text style={styles.pageButtonText}>Previous</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pageButton, posts.length < pageSize && styles.disabledButton]}
              onPress={() => setPageNumber(pageNumber + 1)}
              disabled={posts.length < pageSize}
            >
              <Text style={styles.pageButtonText}>Next</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.onlineCount}>
            {numUsers} user{numUsers > 1 ? 's' : ''} online
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function ProfileAvatar() {
  const user = db.useUser();
  const profile = useRequiredProfile();
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const avatarPath = `${user.id}/avatar`;

  const handleAvatarUpload = async (): Promise<void> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Sorry, we need camera roll permissions!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      setIsUploading(true);
      try {
        const blob = await fetch(result.assets[0].uri!).then(res => res.blob());
        const { data } = await db.storage.uploadFile(avatarPath, blob);
        await db.transact(db.tx.profiles[profile.id].link({ avatar: data.id }));
      } catch (error) {
        console.error('Upload failed:', error);
        Alert.alert('Upload failed', 'Please try again');
      }
      setIsUploading(false);
    }
  };

  const handleAvatarDelete = async (): Promise<void> => {
    if (!profile.avatar) return;
    db.transact(db.tx.$files[lookup('path', avatarPath)].delete());
  };

  return (
    <View style={styles.avatarContainer}>
      <TouchableOpacity onPress={handleAvatarUpload}>
        {profile.avatar ? (
          <Image source={{ uri: profile.avatar.url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {profile.handle[0].toUpperCase()}
            </Text>
          </View>
        )}
        {isUploading && (
          <View style={styles.uploadingOverlay}>
            <ActivityIndicator color="white" />
          </View>
        )}
      </TouchableOpacity>
      <View style={styles.profileInfo}>
        <Text style={styles.handle}>handle: {profile.handle}</Text>
        <Text style={styles.email}>email: {user.email}</Text>
        <TouchableOpacity
          onPress={handleAvatarDelete}
          disabled={!profile.avatar || isUploading}
        >
          <Text style={[styles.deleteText, (!profile.avatar || isUploading) && styles.disabledText]}>
            Delete Avatar
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PostForm() {
  const user = db.useUser();
  const [shouts, setShouts] = useState<Array<{
    id: string;
    text: string;
    x: number;
    y: number;
    angle: number;
    size: number;
    opacity: Animated.Value;
  }>>([]);
  const [value, setValue] = useState('');
  const publishShout = db.rooms.usePublishTopic(room, 'shout');

  const handleSubmit = (action: string) => {
    if (!value.trim()) return;
    if (action === 'post') {
      addPost(value, user?.id);
    } else {
      const params = makeShout(value);
      addShout(params);
      publishShout(params);
    }
    setValue('');
  };

  const addShout = (shout: ReturnType<typeof makeShout>) => {
    setShouts(prev => [...prev, shout]);

    Animated.timing(shout.opacity, {
      toValue: 0,
      duration: 2000,
      delay: 100,
      useNativeDriver: true,
    }).start(() => {
      setShouts(prev => prev.filter(s => s.id !== shout.id));
    });
  }

  return (
    <View style={styles.postFormContainer}>
      <TextInput
        style={styles.postInput}
        placeholder="What's on your mind?"
        value={value}
        onChangeText={setValue}
      />
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.actionButton} onPress={() => handleSubmit('post')}>
          <Text style={styles.actionButtonText}>Add to wall</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => handleSubmit('shout')}>
          <Text style={styles.actionButtonText}>Shout to void</Text>
        </TouchableOpacity>
      </View>
      <>
        {shouts.map(shout => (
          <Animated.Text
            key={shout.id}
            style={{
              position: 'absolute',
              left: shout.x,
              top: shout.y,
              fontSize: shout.size,
              fontWeight: 'bold',
              opacity: shout.opacity,
              transform: [{ rotate: `${shout.angle}deg` }],
            }}
          >
            {shout.text}
          </Animated.Text>
        ))}
      </>
    </View>
  );
}

function PostList({ posts }: { posts: PostsWithProfile[] }) {
  const user = db.useUser();

  return (
    <View style={styles.postList}>
      {posts.map((post) => (
        <View key={post.id} style={styles.postCard}>
          <View style={styles.postHeader}>
            {post.author?.avatar ? (
              <Image source={{ uri: post.author.avatar.url }} style={styles.postAvatar} />
            ) : (
              <View style={styles.postAvatarPlaceholder}>
                <Text style={styles.postAvatarText}>
                  {post.author?.handle[0].toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.postContent}>
              <View style={styles.postMeta}>
                <View>
                  <Text style={styles.postAuthor}>
                    {post.author?.handle || 'Unknown'}
                  </Text>
                  <Text style={styles.postDate}>
                    {new Date(post.createdAt).toLocaleString()}
                  </Text>
                </View>
                {post.author?.id === user?.id && (
                  <TouchableOpacity onPress={() => deletePost(post.id)}>
                    <Text style={styles.deletePost}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.postText}>{post.text}</Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function App() {
  const { isLoading, error, user } = db.useAuth();
  if (isLoading) return null;
  if (error) { return <Text>{error.message}</Text> }

  if (!user) { return <Login /> }

  return (
    <SafeAreaProvider>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <EnsureProfile>
          <Main />
        </EnsureProfile>
      </KeyboardAvoidingView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  error: {
    color: 'red',
    padding: 16,
    textAlign: 'center',
  },
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loginBox: {
    width: '100%',
    maxWidth: 400,
  },
  formContainer: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  description: {
    color: '#666',
    marginBottom: 16,
  },
  bold: {
    fontWeight: 'bold',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    borderRadius: 4,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#2563eb',
    padding: 12,
    borderRadius: 4,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  mainContainer: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  signOutText: {
    color: '#666',
    fontSize: 14,
  },
  avatarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#333',
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#333',
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    marginLeft: 16,
  },
  handle: {
    fontWeight: '500',
  },
  email: {
    fontSize: 14,
    color: '#666',
  },
  deleteText: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  disabledText: {
    color: '#ccc',
  },
  postFormContainer: {
    marginBottom: 20,
  },
  postInput: {
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    minHeight: 60,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 24,
  },
  actionButtonText: {
    fontWeight: '500',
  },
  postList: {
    gap: 12,
  },
  postCard: {
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  postHeader: {
    flexDirection: 'row',
  },
  postAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#333',
  },
  postAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#333',
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postAvatarText: {
    fontWeight: 'bold',
    color: '#333',
  },
  postContent: {
    flex: 1,
    marginLeft: 12,
  },
  postMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  postAuthor: {
    fontWeight: '500',
  },
  postDate: {
    fontSize: 12,
    color: '#666',
  },
  deletePost: {
    fontSize: 24,
    color: '#999',
  },
  postText: {
    marginTop: 8,
    color: '#333',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  pageButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#e5e5e5',
    borderRadius: 4,
  },
  disabledButton: {
    opacity: 0.5,
  },
  pageButtonText: {
    color: '#333',
  },
  onlineCount: {
    textAlign: 'center',
    fontSize: 12,
    color: '#666',
    marginTop: 16,
  },
});

export default App;
```

# Documentation

The bullets below are links to the InstantDB documentation. They provide detailed information on how to use different features of InstantDB. Each line follows the pattern of

- [TOPIC](URL): Description of the topic.

Fetch the URL for a topic to learn more about it.

- [Common mistakes](https://instantdb.com/docs/common-mistakes.md): Common mistakes when working with Instant
- [Initializing Instant](https://instantdb.com/docs/init.md): How to integrate Instant with your app.
- [Modeling data](https://instantdb.com/docs/modeling-data.md): How to model data with Instant's schema.
- [Writing data](https://instantdb.com/docs/instaml.md): How to write data with Instant using InstaML.
- [Reading data](https://instantdb.com/docs/instaql.md): How to read data with Instant using InstaQL.
- [Instant on the Backend](https://instantdb.com/docs/backend.md): How to use Instant on the server with the Admin SDK.
- [Patterns](https://instantdb.com/docs/patterns.md): Common patterns for working with InstantDB.
- [Auth](https://instantdb.com/docs/auth.md): Instant supports magic code, OAuth, Clerk, and custom auth.
- [Auth](https://instantdb.com/docs/auth/magic-codes.md): How to add magic code auth to your Instant app.
- [Managing users](https://instantdb.com/docs/users.md): How to manage users in your Instant app.
- [Presence, Cursors, and Activity](https://instantdb.com/docs/presence-and-topics.md): How to add ephemeral features like presence and cursors to your Instant app.
- [Instant CLI](https://instantdb.com/docs/cli.md): How to use the Instant CLI to manage schema.
- [Storage](https://instantdb.com/docs/storage.md): How to upload and serve files with Instant.