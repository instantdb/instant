---
title: Storage
---

Instant Storage makes it simple to upload and serve files for your app.
You can use Storage to store images, videos, documents, and any other file type.

## Storage quick start

Here's a quick example of how to upload and display a grid of images using
Storage. You can start a brand new project

```shell {% showCopy=true %}
npx create-next-app instant-storage --tailwind --yes
cd instant-storage
npm i @instantdb/react
npm run dev
```

And then replace the contents of `app/src/page.tsx` with the following code:

```javascript {% showCopy=true %}
'use client';

import { init } from '@instantdb/react';
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

// Optional: Declare your schema for intellisense!
type Schema = {
  images: Image;
};

const db = init({ appId: APP_ID });

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
      {/* Helper component to upload images */}
      <ImageUpload />
      {/* Helper component to display images */}
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

Go to `localhost:3000`, and you should see a simple image feed where you can
upload and delete images! 📸

## Storage API

Below you'll find a more detailed guide on how to use the Storage API.

### db.storage.uploadFile

Use `db.storage.uploadFile(path, file, opts?)` to upload a file.

The `path` determines where the file will be stored, and can be used with permissions to restrict access to certain files.

The `file` should be a [`File`](https://developer.mozilla.org/en-US/docs/Web/API/File) type, which will likely come from a [file-type input](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/file).

The `opts` object is optional and can be used to set the `contentType` and
`contentDisposition` headers for the file.

```javascript
// use the file's current name as the path
await db.storage.uploadFile(file.name, file);

// or, give the file a custom name
await db.storage.uploadFile('demo.png', file);

// or, set the content type and content disposition
await db.storage.uploadFile('images/demo.png', file, {
  contentType: 'image/png',
  contentDisposition: 'attachment; filename="demo.png"',
});
```

{% callout type="note" %}

If the `path` already exists in your storage directory, it will be overwritten!

```javascript
// This will upload a file to the path 'demo.png'
await db.storage.uploadFile('demo.png', file);

// Calling this again will overwrite the file at 'demo.png'
await db.storage.uploadFile('demo.png', file);
```

If you don't want to overwrite files, you'll need to ensure that each file has a unique path.

{% /callout %}

### Retrieving files

To retrieve a file you can get it's download url by querying the `$files`
namespace.

```javascript
// This will fetch all files in storage from earliest to latest upload
const query = {
  $files: {
    $: {
      order: { serverCreatedAt: 'asc' },
    },
  },
});
const { isLoading, error, data } = query;
```

```javascript
console.log(data)
{
  "$files": [
    {
      "id": fileId,
      "path": "demo.png"
      "url": "https://instant-storage.s3.amazonaws.com/...",
      "contentType": "image/png",
      "contentDisposition": "attachment; filename=\"demo.png\"",
    },
    // ...
  ]
}
```

You can use query filters and associations as you would with any other namespace
to filter and sort your files.

```javascript
const { isLoading, user, error } = db.useAuth();
const query = {
  profiles: {
    $: {
      where: {"$user.id": user.id}
    },
    $files: {},
  },
});
const { isLoading, error, data } = query;
```

To retrieve a file URL, we use the `db.storage.getDownloadUrl(pathname: string)` function.

{% callout type="warning" %}

This function returns a signed URL that will be valid for **7 days**.

This is important to keep in mind in cases where you want to save this URL somewhere, as demonstrated below in **Caching the URL**.

{% /callout %}

```tsx
const [imageUrl, setImageUrl] = React.useState<string | null>(null);

React.useEffect(() => {
  db.storage
    .getDownloadUrl('images/demo.png')
    .then((signedUrl) => setImageUrl(signedUrl))
    .catch((err) => console.error('Failed to get file URL', err));
}, []);

return <img src={imageUrl} />;
```

### Caching the URL

You might also want to cache the URL after retrieving it, in order to avoid calling `getDownloadUrl` every time you refresh the page.

Let's imagine you have an `images` namespace you use to store the file metadata of your images. You can use this to keep track of the expiration time of all your file URLs, and then refresh them accordingly.

```tsx
// Simple component to upload and display image files
function App() {
  const { data } = db.useQuery({ images: {} });

  const upload = async (files: FileList) => {
    const file = files[0];
    const pathname = file.name; // or whatever custom file path you'd like
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days from now
    const isSuccess = await db.storage.upload(pathname, file);
    const cachedUrl = await db.storage.getDownloadUrl(pathname);

    db.transact(tx.images[id()].update({ cachedUrl, pathname, expiresAt }));
  };

  return (
    <div>
      <input type="file" onChange={(e) => upload(e.target.files)} />
      {data.images.map((image) => (
        <ImageViewer key={image.id} image={image} />
      ))}
    </div>
  );
}
```

Then, in your `ImageViewer` component, you can use the `cachedUrl` by default, and handle the expiration when necessary:

```tsx
// Component to handle displaying the image URL and refreshing when necessary
function ImageViewer({ image }: { image: Schema.Image }) {
  const [imageUrl, setImageUrl] = React.useState(image.cachedUrl);

  React.useEffect(() => {
    // If the image URL has expired, refresh the signed url
    if (image.expiresAt < Date.now()) {
      const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

      db.storage.getDownloadUrl(image.pathname).then((url) => {
        // update the cached url
        db.transact(
          tx.images[image.id].update({
            cachedUrl: url,
            // reset expiration to 7 days from now
            expiresAt: expiresAt,
          }),
        );

        setImageUrl(url);
      });
    }
  }, [image.expiresAt]);

  return <img src={imageUrl} />;
}
```

## Permissions

At the moment, Storage permissions are handled in the same JSON settings as [data permissions](/docs/permissions), using the special `$files` keyword.

To handle permissions for **uploading** files, we use the `create` action.

For **downloading** or **viewing** files, we use the `view` action.

{% callout %}

By default, Storage permissions are disabled. This means that until you explicitly set permissions, no uploads or downloads will be possible.

{% /callout %}

In your permissions rules, you can use `auth` to access the currently authenticated user, and `data` to access the file metadata.

At the moment, the only available file metadata is `data.path`, which represents the file's path in Storage. (In the future we will likely include metadata such as `size` and `type`.)

### Examples

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
    "bind": ["isOwner", "data.path.startsWith(auth.id + '/')"]
  }
}
```

Allow all authenticated users to view files, but users may only upload `png`/`jpeg` image files:

```json
{
  "$files": {
    "allow": {
      "view": "auth.id != null",
      "create": "isImage"
    },
    "bind": [
      "isImage",
      "data.path.endsWith('.png') || data.path.endsWith('.jpeg')"
    ]
  }
}
```

---

# Admin SDK

The Admin SDK offers the same API for managing storage on the server, plus a few extra convenience methods for scripting.

## Uploading files

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
