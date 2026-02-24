import { ProductPage } from '@/components/productPageUi';

export default function Storage() {
  return (
    <ProductPage
      slug="storage"
      name="Storage"
      description="Instant comes with built-in file storage. Upload files and link them to your data in the database. No separate storage service needed. Because storage is integrated with the database, you can create relations between uploads and data. Use the same permissions system to control access to files. Build features like profile pictures or photo-sharing apps with ease."
      headline="File storage, connected to your data"
      codeExample={`// Upload a file
const url = await db.storage.uploadFile(
  "photos/avatar.png",
  file
);

// Link it to your data
db.transact(
  db.tx.profiles[id()].update({
    avatarUrl: url,
    userId: user.id,
  })
);

// Query files alongside your data
const { data } = db.useQuery({
  profiles: { $: { where: { userId: user.id } } },
});`}
      sectionHeading="Upload, link, and query files"
      tabs={[
        {
          heading: 'Upload files in one line',
          description:
            'Upload files to Instant storage with a single API call. No S3 buckets to configure, no signed URLs to manage. Files are stored securely and served from a CDN.',
          code: `// Upload a file
const url = await db.storage.uploadFile(
  "photos/avatar.png",
  file
);

// Upload from a file input
function AvatarUpload() {
  const handleChange = async (e) => {
    const file = e.target.files[0];
    const url = await db.storage.uploadFile(
      \`avatars/\${user.id}.png\`,
      file
    );
  };

  return <input type="file" onChange={handleChange} />;
}`,
        },
        {
          heading: 'Connect files to your entities',
          description:
            'Because storage is part of your database, you can link uploads directly to your data. Create relations between files and entities just like any other data.',
          code: `// Upload and link to a profile
const url = await db.storage.uploadFile(
  "photos/avatar.png",
  file
);

db.transact(
  db.tx.profiles[id()].update({
    avatarUrl: url,
    userId: user.id,
  })
);

// Query files alongside your data
const { data } = db.useQuery({
  profiles: {
    $: { where: { userId: user.id } },
  },
});`,
        },
        {
          heading: 'Control access with the same rules',
          description:
            'Files use the same CEL-based permission system as your data. Control who can upload, read, and delete files using rules you already know.',
          code: `// Same permissions system as your data
const rules = {
  "storage.photos": {
    allow: {
      // Only authenticated users can upload
      create: "auth.id != null",
      // Only the uploader can delete
      delete: "auth.id == data.uploaderId",
      // Anyone can view
      view: "true",
    },
  },
};`,
        },
      ]}
    />
  );
}
