export const storageExamples = [
  {
    label: 'Upload & Link',
    code: `// Upload a file
const { data } = await db.storage.uploadFile(
  \`\${user.id}/avatar.png\`,
  file
);

// Link it to a profile
await db.transact(
  db.tx.profiles[profileId].link({
    avatar: data.id,
  })
);`,
  },
  {
    label: 'Query & Render',
    code: `function Gallery({ albumId }) {
  // Query files for this album
  const { data } = db.useQuery({
    $files: {
      $: { where: { albumId } },
    },
  });

  // Render them
  return (
    <div className="grid grid-cols-3 gap-2">
      {data?.$files.map((img) => (
        <img key={img.id} src={img.url} />
      ))}
    </div>
  );
}`,
  },
  {
    label: 'Delete',
    code: `// Delete by id
db.transact(db.tx.$files[fileId].delete());

// Delete by path
db.transact(
  db.tx.$files[lookup('path', 'photos/demo.png')].delete()
);

// Delete multiple files
db.transact(
  fileIds.map((fileId) => db.tx.$files[fileId].delete())
);`,
  },
];

export const permissionExamples = [
  {
    label: 'User avatars',
    code: `// Users can only upload to their own folder
const rules = {
  $files: {
    allow: {
      view: "true",
      create: "isOwner",
      delete: "isOwner",
    },
    bind: {
      isOwner: "data.path.startsWith(auth.id + '/')",
    },
  },
};`,
  },
  {
    label: 'Public reads',
    code: `// Anyone can view, only authenticated users upload
const rules = {
  $files: {
    allow: {
      view: "true",
      create: "auth.id != null",
    },
  },
};`,
  },
  {
    label: 'Scoped paths',
    code: `// Public assets are readable, uploads scoped by path
const rules = {
  $files: {
    allow: {
      view: "isPublic",
      create: "auth.id != null",
      delete: "isOwner",
    },
    bind: {
      isPublic: "data.path.startsWith('public/')",
      isOwner: "data.path.startsWith(auth.id + '/')",
    },
  },
};`,
  },
  {
    label: 'Admin override',
    code: `// Owners manage their files, admins can manage any file
const rules = {
  $files: {
    allow: {
      view: "true",
      create: "auth.id != null",
      update: "isOwner || isAdmin",
      delete: "isOwner || isAdmin",
    },
    bind: {
      isOwner: "data.path.startsWith(auth.id + '/')",
      isAdmin: "'admin' in auth.ref('$user.roles.type')",
    },
  },
};`,
  },
];
