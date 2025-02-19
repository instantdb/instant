---
title: Storage
---

Instant Storage makes it simple to upload and serve files for your app.
You can use Storage to store images, videos, documents, and any other file type.

## Storage quick start

Here's a full example of how to upload and display a grid of images

```shell {% showCopy=true %}
npx create-next-app instant-storage --tailwind --yes
cd instant-storage
npm i @instantdb/react
```

Initialize your schema and permissions via the [cli tool](/docs/cli)

```
npx instant-cli@latest init
```

Now open `instant.perms.ts` and add the following permissions

```javascript {% showCopy=true %}
// Note:
// For production apps you should use more restrictive permissions
// But for this quick start example we'll allow anyone to view, upload,
// and delete files
{
  "$files": {
    "allow": {
      "view": "true",
      "create": "true",
      "delete": "true"
    }
  }
}
```

And then replace the contents of `app/src/page.tsx` with the following code

```javascript {% showCopy=true %}
'use client';

import { init } from '@instantdb/react';
import schema from '../instant.schema';
import React from 'react';

// Types
// ----------
export type Image = {
  id: string;
  path: string;
  url: string;
};

// Instant app
const APP_ID = '__APP_ID__';

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
      contentDisposition: 'attachment; filename="moop.jpg"',
    };
    await db.storage.uploadFile(file.name, file, opts);
  } catch (error) {
    console.error('Error uploading image:', error);
  }
}

// `delete` is what we use to delete a file from storage
// `$files` will automatically update once the delete is complete
async function deleteImage(image: Image) {
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
    return <div>Fetching data...</div>;
  }

  if (error) {
    return <div>Error fetching data: {error.message}</div>;
  }

  // The result of a $files query will contain objects with
  // metadata and a download URL you can use for serving files!
  const { $files: images } = data as { $files: Image[] };
  return (
    <div className="box-border bg-gray-50 font-mono min-h-screen p-5 flex items-center flex-col">
      <div className="tracking-wider text-5xl text-gray-300 mb-8">
        Image Feed
      </div>
      <ImageUpload />
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
  const { previewURL } = selectedFile || {};

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const previewURL = URL.createObjectURL(file);
      setSelectedFile({ file, previewURL });
    }
  };

  const handleUpload = () => {
    if (selectedFile) {
      uploadImage(selectedFile.file);
      URL.revokeObjectURL(selectedFile.previewURL);
      setSelectedFile(null);
    }
  };

  return (
    <div className="mb-8 p-5 border-2 border-dashed border-gray-300 rounded-lg">
      <input
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="font-mono"
      />
      {previewURL && (
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

function ImageGrid({ images }: { images: Image[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 w-full max-w-6xl">
      {images.map((image, idx) => (
        <div key={image.id} className="border border-gray-300 rounded-lg overflow-hidden">
          {/* $files entities come with a `url` property */}
          <img src={image.url} alt={image.path} className="w-full h-64 object-cover" />
          <div className="p-3 flex justify-between items-center bg-white">
            <span>{image.path}</span>
            <span onClick={() => deleteImage(image)} className="cursor-pointer text-gray-300 px-1">
              𝘟
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default App;
```

With your permissions set and your code in place, you can now run your app

```shell {% showCopy=true %}
npm run dev
```

Go to `localhost:3000`, and you should see a simple image feed where you can
upload and delete images!

## Storage Client SDK

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
  contentDisposition: 'attachment; filename="confirmation.pdf"',
});
```

### Overwriting files

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

```javascript
// instant.schema.ts
// ---------------
import { i } from "@instantdb/core";
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


// app/src/page.tsx
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
    await db.transact(tx.profiles[profileId].link({ avatar: data.id }));
  } catch (error) {
    console.error('Error uploading image:', error);
  }
}
```

Here's a more detailed example showing how you may implement an avatar upload feature:

```javascript
// instant.schema.ts
// ---------------
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
        on: "profiles",
        has: "one",
        label: "$user",
      },
      reverse: {
        on: "$users",
        has: "one",
        label: "profile",
      },
    },
    profilesAvatar: {
      forward: {
        on: "profiles",
        has: "one",
        label: "avatar",
      },
      reverse: {
        on: "$files",
        has: "one",
        label: "profile",
      },
    },
    },
  },
  rooms: {},
});

// instant.perms.ts
// ---------------
{
  "$files": {
    "allow": {
      "view": "true",
      "create": "isLoggedIn && isOwner",
      "delete": "isLoggedIn && isOwner"
    },
    "bind": [
      "isLoggedIn", "auth.id != null",
      "isOwner", "data.path.startsWith(auth.id + '/')"
    ]
  }
}

// app/src/page.tsx
// ---------------
'use client';

import { init, tx } from '@instantdb/react';
import schema from '../instant.schema';
import React, { useState, useEffect } from 'react';
import Login from '../../components/Login';
import config from '../../config';

// Instant app
const APP_ID = '__APP_ID__';

const db = init({ appId: APP_ID, schema });

// The meat and potatoes
function AvatarUpload() {
  const { user } = db.useAuth();
  const {
    isLoading: isLoadingAvatar,
    data,
    error: avatarError,
  } = db.useQuery(
    user
      ? {
          profiles: {
            $: {
              where: { '$user.id': user.id },
            },
            avatar: {},
          },
        }
      : null,
  );
  const [isUploading, setIsUploading] = useState(false);

  if (isLoadingAvatar) return <div>Loading...</div>;
  if (avatarError) return <div>Error: {avatarError.message}</div>;

  const profile = data.profiles[0];
  const { avatar } = profile;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      // Set an explicit path to make sure that when users change
      // their avatar we upload to the same path.
      //
      // Setting user id in the path is useful for enabling permission checks
      // to ensure that only the user can upload to their own profile.
      const path = `${user.id}/avatar`;

      const { data } = await db.storage.uploadFile(path, file);

      await db.transact(tx.profiles[profileId].link({ avatar: data.id }));
    } catch (error) {
      console.error('Error uploading avatar:', error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <div style={{ width: 96, height: 96 }}>
          {avatar ? (
            <img src={avatar.url} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gray-400" />
          )}
        </div>

        {isUploading && (
          <div className="absolute inset-0 bg-black bg-opacity-40 rounded-full flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      <label className="cursor-pointer">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        <span className="py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm transition-colors">
          {avatar ? 'Change Avatar' : 'Upload Avatar'}
        </span>
      </label>
    </div>
  );
}

function ProfilePage() {
  return (
    <div className="box-border bg-gray-50 font-mono min-h-screen p-5 flex items-center flex-col">
      <div className="tracking-wider text-3xl text-gray-700 mb-8">
        Profile Settings
      </div>

      <div className="bg-white rounded-lg shadow-md p-8 max-w-2xl w-full">
        <h2 className="text-xl mb-6 pb-2 border-b border-gray-200">
          Profile Picture
        </h2>

        <div className="flex justify-center">
          <AvatarUpload defaultSize={120} />
        </div>
      </div>
      <button
        className="text-sm text-gray-500 mt-2"
        onClick={() => db.auth.signOut()}
      >
        {' '}
        Sign out
      </button>
    </div>
  );
}

function Wrapper() {
  const { isLoading, user, error } = db.useAuth();
  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return <div>Uh oh! {error.message}</div>;
  }
  if (user) {
    return <ProfilePage />;
  }
  return <Login auth={db.auth} />;
}

export default Wrapper;
```

## Permissions

At the moment, Storage permissions are handled in the same JSON settings as [data permissions](/docs/permissions), using the special `$files` keyword.

To handle permissions for **uploading** files, we use the `create` action.

For **downloading** or **viewing** files, we use the `view` action.

{% callout %}

By default, Storage permissions are disabled. This means that until you explicitly set permissions, no uploads or downloads will be possible.

{% /callout %}

In your permissions rules, you can use `auth` to access the currently authenticated user, and `data` to access the file metadata.

At the moment, the only available file metadata is `data.path`, which represents the file's path in Storage. Here are some example permissions

Allow anyone to upload and retrieve files (not recommended):

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

Authenticated users may only upload and view files from their own subdirectory:

```json
{
  "$files": {
    "allow": {
      "view": "isOwner",
      "create": "isOwner"
    },
    "bind": ["isOwner", "data.path.startsWith('uploads/' + auth.id + '/')"]
  }
}
```

---

## Admin SDK

The Admin SDK offers the same API for managing storage on the server, plus a few extra convenience methods for scripting.

### Uploading

Once again, we use the `db.storage.upload(pathname: string, file: Buffer)` function to upload a file on the backend.

Note that unlike our browser SDK, the `file` argument must be a `Buffer`:

```tsx
import fs from 'fs';

async function upload(filepath: string) {
  const buffer = fs.readFileSync(filepath);
  await db.storage.upload('images/demo.png', buffer);
  // you can also optionally specify the Content-Type header in the metadata
  await db.storage.upload('images/demo.png', buffer, {
    contentType: 'image/png',
  });
}
```

The `pathname` determines where the file will be stored, and can be used with permissions to restrict access to certain files.

The `file` should be a [`Buffer`](https://nodejs.org/api/buffer.html) type.

{% callout type="warning" %}

Note that if the `pathname` already exists in your storage directory, it will be overwritten!

You may want to include some kind of unique identifier or timestamp in your `pathname` to ensure this doesn't happen.

{% /callout %}

## Retrieving a file URL

To retrieve a file URL, we use the `db.storage.getDownloadUrl(pathname: string)` function.

This works exactly the same as our browser SDK.

```ts
const url = await db.storage.getDownloadUrl('images/demo.png');
```

## Listing all your files

We also offer the `db.storage.list()` function to retrieve a list of all your files in storage.

This can be useful for scripting, if you'd like to manage your files programmatically.

```ts
const files = await db.storage.list();
```

## Deleting files

There are two ways to delete files:

- `db.storage.delete(pathname: string)`
- `db.storage.deleteMany(pathnames: string[])`

These allow you to either delete a single file, or bulk delete multiple files at a time.

{% callout type="warning" %}

These functions will **permanently delete** files from storage, so use with extreme caution!

{% /callout %}

```ts
const filename = 'demo.txt';
await db.storage.delete(filename);

const images = ['images/1.png', 'images/2.png', 'images/3.png'];
await db.storage.deleteMany(images);
```
