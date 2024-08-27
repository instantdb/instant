---
title: Storage
---

Instant Storage makes it simple to upload and serve files for your app.
You can use Storage to store images, videos, documents, and any other file type.

{% callout %}

Storage is still in **beta**, but you can request access [here](https://docs.google.com/forms/d/e/1FAIpQLSdzInffrNrsYaamtH_BUe917EOpcOq2k8RWcGM19XepJR6ivQ/viewform?usp=sf_link)!

{% /callout %}

## Uploading files

We use the `db.storage.put(pathname: string, file: File)` function to upload a file.

```tsx
async function upload(files: FileList) {
  const file = files[0];
  // use the file's current name as the path
  await db.storage.put(file.name, file);
  // or, give the file a custom name
  await db.storage.put('demo.png', file);
  // or, put it in the `images` subdirectory
  await db.storage.put('images/demo.png', file);
  // or, put it in a subdirectory for the current user,
  // and restrict access to this file via Storage permissions
  await db.storage.put(`${currentUser.id}/demo.png`, file);
}

return <input type="file" onChange={(e) => upload(e.target.files)} />;
```

The `pathname` determines where the file will be stored, and can be used with permissions to restrict access to certain files.

The `file` should be a [`File`](https://developer.mozilla.org/en-US/docs/Web/API/File) type, which will likely come from a [file-type input](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/file).

{% callout type="warning" %}

Note that if the `pathname` already exists in your storage directory, it will be overwritten!

You may want to include some kind of unique identifier or timestamp in your `pathname` to ensure this doesn't happen.

{% /callout %}

## Retrieving files

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
    const isSuccess = await db.storage.put(pathname, file);
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
          })
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
    "bind": ["isOwner", "data.path.startsWith(auth.id)"]
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
