---
title: Storage
description: How to upload and serve files with Instant.
---

Instant Storage makes it simple to upload and serve files for your app.
You can store images, videos, documents, and any other file type.

## Storage quick start

Let's build a full example of how to upload and display a grid of images

```shell {% showCopy=true %}
npx create-next-app instant-storage --tailwind --yes
cd instant-storage
npm i @instantdb/react
```

Initialize your schema and permissions via the [cli tool](/docs/cli)

```
npx instant-cli@latest init
```

Now open `instant.schema.ts` and replace the contents with the following code.

```javascript {% showCopy=true %}
import { i } from "@instantdb/react";

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
  },
  links: {},
  rooms: {},
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
```

Similarly open `instant.perms.ts` and replace the contents with the following

```javascript {% showCopy=true %}
import type { InstantRules } from "@instantdb/react";

// Not recommended for production since this allows anyone to
// upload/delete, but good for getting started
const rules = {
  "$files": {
    "allow": {
      "view": "true",
      "create": "true",
      "delete": "true"
    }
  }
} satisfies InstantRules;

export default rules;
```

Push up both the schema and permissions to your Instant app with the following command

```shell {% showCopy=true %}
npx instant-cli@latest push
```

And then replace the contents of `app/page.tsx` with the following code.

```javascript {% showCopy=true %}
'use client';

import { init, InstaQLEntity } from '@instantdb/react';
import schema, { AppSchema } from '../instant.schema';
import React from 'react';

type InstantFile = InstaQLEntity<AppSchema, '$files'>

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID;

const db = init({ appId: APP_ID, schema });

// `uploadFile` is what we use to do the actual upload!
// the `$files` will automatically update once the upload is complete
async function uploadImage(file: File) {
  try {
    // Optional metadata you can set for uploads
    const opts = {
      // See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Type
      // Default: 'application/octet-stream'
      contentType: file.type,
      // See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Disposition
      // Default: 'inline'
      contentDisposition: 'attachment',
    };
    await db.storage.uploadFile(file.name, file, opts);
  } catch (error) {
    console.error('Error uploading image:', error);
  }
}

// `delete` is what we use to delete a file from storage
// `$files` will automatically update once the delete is complete
async function deleteImage(image: InstantFile) {
  await db.storage.delete(image.path);
}

function App() {
  // $files is the special namespace for querying storage data
  const { isLoading, error, data } = db.useQuery({
    $files: {
      $: {
        order: { serverCreatedAt: 'asc' },
      },
    },
  });

  if (isLoading) {
    return null;
  }

  if (error) {
    return <div>Error fetching data: {error.message}</div>;
  }

  // The result of a $files query will contain objects with
  // metadata and a download URL you can use for serving files!
  const { $files: images } = data
  return (
    <div className="box-border bg-gray-50 font-mono min-h-screen p-5 flex items-center flex-col">
      <div className="tracking-wider text-5xl text-gray-300 mb-8">
        Image Feed
      </div>
      <ImageUpload />
      <div className="text-xs text-center py-4">
        Upload some images and they will appear below! Open another tab and see
        the changes in real-time!
      </div>
      <ImageGrid images={images} />
    </div>
  );
}

interface SelectedFile {
  file: File;
  previewURL: string;
}

function ImageUpload() {
  const [selectedFile, setSelectedFile] = React.useState<SelectedFile | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { previewURL } = selectedFile || {};

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const previewURL = URL.createObjectURL(file);
      setSelectedFile({ file, previewURL });
    }
  };

  const handleUpload = async () => {
    if (selectedFile) {
      setIsUploading(true);

      await uploadImage(selectedFile.file);

      URL.revokeObjectURL(selectedFile.previewURL);
      setSelectedFile(null);
      fileInputRef.current?.value && (fileInputRef.current.value = '');
      setIsUploading(false);
    }
  };

  return (
    <div className="mb-8 p-5 border-2 border-dashed border-gray-300 rounded-lg">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="font-mono"
      />
      {isUploading ? (
        <div className="mt-5 flex flex-col items-center">
          <div className="w-8 h-8 border-2 border-t-2 border-gray-200 border-t-green-500 rounded-full animate-spin"></div>
          <p className="mt-2 text-sm text-gray-600">Uploading...</p>
        </div>
      ) : previewURL && (
        <div className="mt-5 flex flex-col items-center gap-3">
          <img src={previewURL} alt="Preview" className="max-w-xs max-h-xs object-contain" />
          <button onClick={handleUpload} className="py-2 px-4 bg-green-500 text-white border-none rounded cursor-pointer font-mono">
            Upload Image
          </button>
        </div>
      )}
    </div>
  );
}

function ImageGrid({ images }: { images: InstantFile[] }) {
  const [deletingIds, setDeletingIds] = React.useState<Set<string>>(new Set());

  const handleDelete = async (image: InstantFile) => {
    setDeletingIds((prev) => new Set([...prev, image.id]));

    await deleteImage(image);

    setDeletingIds((prev) => {
      prev.delete(image.id);
      return prev;
    });
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 w-full max-w-6xl">
      {images.map((image) => {
        const isDeleting = deletingIds.has(image.id);
        return (
          <div key={image.id} className="border border-gray-300 rounded-lg overflow-hidden">
            <div className="relative">
              {/* $files entities come with a `url` property */}
              <img src={image.url} alt={image.path} className="w-full h-64 object-cover" />
              {isDeleting && (
                <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-t-2 border-gray-200 border-t-white rounded-full animate-spin"></div>
                </div>
              )}
            </div>

            <div className="p-3 flex justify-between items-center bg-white">
              <span>{image.path}</span>
              <span onClick={() => handleDelete(image)} className="cursor-pointer text-gray-300 px-1">
                𝘟
              </span>
            </div>
          </div>
        )
      })}
    </div>
  );
}

export default App;
```

With your schema, permissions, and application code set, you can now run your app!

```shell {% showCopy=true %}
npm run dev
```

Go to `localhost:3000`, and you should see a simple image feed where you can
upload and delete images!

## Storage client SDK

Below you'll find a more detailed guide on how to use the Storage API from
react.

### Upload files

Use `db.storage.uploadFile(path, file, opts?)` to upload a file.

- `path` determines where the file will be stored, and can be used with permissions to restrict access to certain files.
- `file` should be a [`File`](https://developer.mozilla.org/en-US/docs/Web/API/File) type, which will likely come from a [file-type input](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/file).
- `opts` is optional and can be used to set the `contentType` and
  `contentDisposition` headers for the file.

```javascript
// use the file's current name as the path
await db.storage.uploadFile(file.name, file);

// or, give the file a custom name
const path = `${user.id}/avatar.png`;
await db.storage.uploadFile(path, file);

// or, set the content type and content disposition
const path = `${user.id}/orders/${orderId}.pdf`;
await db.storage.uploadFile(path, file, {
  contentType: 'application/pdf',
  contentDisporition: `attachment; filename="${orderId}-confirmation.pdf"`,
});
```

### Overwrite files

If the `path` already exists in your storage directory, it will be overwritten!

```javascript
// Uploads a file to 'demo.png'
await db.storage.uploadFile('demo.png', file);

// Overwrites the file at 'demo.png'
await db.storage.uploadFile('demo.png', file);
```

If you don't want to overwrite files, you'll need to ensure that each file has a unique path.

### View files

You can retrieve files by querying the `$files` namespace.

```javascript
// Fetch all files from earliest to latest upload
const query = {
  $files: {
    $: {
      order: { serverCreatedAt: 'asc' },
    },
  },
});
const { isLoading, error, data } = db.useQuery(query);
```

```javascript
console.log(data)
{
  "$files": [
    {
      "id": fileId,
      "path": "demo.png"
      // You can use this URL to serve the file
      "url": "https://instant-storage.s3.amazonaws.com/...",
      "content-type": "image/png",
      "content-disposition": "attachment; filename=\"demo.png\"",
    },
    // ...
  ]
}
```

You can use query filters and associations as you would with any other namespace
to filter and sort your files.

```javascript {% showCopy=true %}
// instant.schema.ts
// ---------------
import { i } from '@instantdb/core';
const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
    profiles: i.entity({
      nickname: i.string(),
      createdAt: i.date(),
    }),
  },
  links: {
    profileUser: {
      forward: { on: 'profiles', has: 'one', label: '$user' },
      reverse: { on: '$users', has: 'one', label: 'profile' },
    },
    profileUploads: {
      forward: { on: 'profiles', has: 'many', label: '$files' },
      reverse: { on: '$files', has: 'one', label: 'profile' },
    },
  },
});
```

```javascript {% showCopy=true %}
// app/page.tsx
// ---------------
// Find files associated with a profile
const { user } = db.useAuth();
const query = {
  profiles: {
    $: {
      where: {"$user.id": user.id}
    },
    $files: {},
  },
});
// Defer until we've fetched the user and then query associated files
const { isLoading, error, data } = db.useQuery(user ? query : null);
```

### Delete files

Use `db.storage.delete(path)` to delete a file.

```javascript
// This will delete the file at 'demo.png'
await db.storage.delete('demo.png');
```

### Update file paths

You can use `db.transact` to update file paths.

```javascript
// Move all files under 'documents/my-video-project/' to 'videos/my-video-project/'

const { data } = await db.query({
  $files: { $: { where: { path: { $like: 'documents/my-video-project/%' } } } },
});

await db.transact(
  data.$files.map((file) =>
    db.tx.$files[file.id].update({
      path: file.path.replace(
        'documents/my-video-project/',
        'videos/my-video-project/',
      ),
    }),
  ),
);
```

`path` is a unique attribute so if another file exists with that path, then the transaction
will fail.

At the moment we only allow updating the `path` attribute of `$files`. If you
try to update another attribute like `content-type` the transaction will fail.

### Link files

Use links to associate files with other entities in your schema.

```javascript
async function uploadImage(file: File) {
  try {
    // Create an explicit upload path
    const path = `${user.id}/avatar`;
    // Upload the file
    const { data } = await db.storage.uploadFile(path, file);
    // Link it to a profile
    await db.transact(db.tx.profiles[profileId].link({ avatar: data.id }));
  } catch (error) {
    console.error('Error uploading image:', error);
  }
}
```

Similar to `$users`, links on `$files` can only be created in the **reverse
direction.**

```javascript
// instant.schema.ts
// simplfied version
const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
    profiles: i.entity({
      createdAt: i.date().indexed(),
      nickname: i.string().unique().indexed(),
    }),
  },
  links: {
    profiles$user: {
      forward: {
        on: 'profiles',
        has: 'one',
        label: '$user',
      },
      reverse: {
        on: '$users',
        has: 'one',
        label: 'profile',
      },
    },
    profilesAvatar: {
      forward: {
        on: 'profiles',
        has: 'one',
        label: 'avatar',
      },
      // Notice that $files is on the reverse side
      reverse: {
        on: '$files',
        has: 'one',
        label: 'profile',
      },
    },
  },
  rooms: {},
});
```

[Check out this repo](https://github.com/jsventures/instant-storage-avatar-example)
for a more detailed example showing how you may leverage links to implement an avatar upload feature

## Using Storage with React Native

The SDK expects a `File` object. In React Native the built-in `fetch` function can be used to construct a `File`, then you can pass that to the `uploadFile` metod.

Example:

```typescript
import { init, InstaQLEntity } from '@instantdb/react-native';
import schema, { AppSchema } from '../instant.schema';
import * as FileSystem from 'expo-file-system';

const APP_ID = process.env.EXPO_PUBLIC_INSTANT_APP_ID;

const db = init({ appId: APP_ID, schema });

const localFilePath = 'file:///var/mobile/Containers/Data/my_file.m4a';

const fileInfo = await FileSystem.getInfoAsync(localFilePath);

if (!fileInfo.exists) {
  throw new Error(`File does not exist at path: ${localFilePath}`);
}

// Convert the local file to a File object
const res = await fetch(fileInfo.uri);
const blob = await res.blob();
const file = new File([blob], payload.recordingId, { type: 'audio/x-m4a' });

await db.storage.uploadFile('my_file.m4a', file);
```

## Storage admin SDK

The Admin SDK offers a similar API for managing storage on the server. Permission
checks are not enforced when using the Admin SDK, so you can use it to manage
files without worrying about authentication.

### Uploading files

Once again, we use the `db.storage.uploadFile(path, file, opts?)` function to upload a file on the backend.

Note that unlike our browser SDK, the `file` argument must be a `Buffer`. In
this case you'll likely want to at least specify the `contentType` in the
options otherwise the default content-type will be `application/octet-stream`.

```tsx
import fs from 'fs';

async function upload(filepath: string) {
  const buffer = fs.readFileSync(filepath);
  await db.storage.upload('images/demo.png', buffer, {
    contentType: 'image/png',
  }
}
```

### View Files

Retrieving files is similar to the client SDK, but we use `db.query()` instead
of `db.useQuery()`.

```ts
const query = {
  $files: {
    $: {
      order: { serverCreatedAt: 'asc' },
    },
  },
});
const data = db.query(query);
```

### Delete files

There are two ways to delete files with the admin SDK:

- `db.storage.delete(pathname: string)`
- `db.storage.deleteMany(pathnames: string[])`

These allow you to either delete a single file, or bulk delete multiple files at a time.

```ts
const filename = 'demo.txt';
await db.storage.delete(filename);

const images = ['images/1.png', 'images/2.png', 'images/3.png'];
await db.storage.deleteMany(images);
```

## Permissions

By default, Storage permissions are disabled. This means that until you explicitly set permissions, no uploads or downloads will be possible.

- _create_ permissions enable uploading `$files`
- _view_ permissions enable viewing `$files`
- _update_ permissions enable updating `$files`
- _delete_ permissions enable deleting `$files`
- _view_ permissions on `$files` and _update_ permisssions on the forward entity enabling linking and unlinking `$files`

In your permissions rules, you can use `auth` to access the currently authenticated user, and `data` to access the file metadata.

At the moment, the only available file metadata is `data.path`, which represents the file's path in Storage. Here are some example permissions

Allow anyone to upload and retrieve files (easy to play with but not recommended for production):

```json
{
  "$files": {
    "allow": {
      "view": "true",
      "create": "true"
    }
  }
}
```

Allow all authenticated users to view and upload files:

```json
{
  "$files": {
    "allow": {
      "view": "isLoggedIn",
      "create": "isLoggedIn"
    },
    "bind": ["isLoggedIn", "auth.id != null"]
  }
}
```

Authenticated users may only upload, view, update files from their own subdirectory:

```json
{
  "$files": {
    "allow": {
      "view": "isOwner",
      "update": "isOwner"
      "create": "isOwner"
    },
    "bind": ["isOwner", "data.path.startsWith(auth.id + '/')"]
  }
}
```
