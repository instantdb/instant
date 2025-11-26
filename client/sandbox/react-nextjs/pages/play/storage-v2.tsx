'use client';

import { init, i, InstaQLEntity } from '@instantdb/react';
import React from 'react';
import Login from '../../components/Login';
import config from '../../config';

const schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique(),
      url: i.string(),
    }),
  },
});

export const db = init({ ...config, schema });

function Wrapper() {
  const { isLoading, user, error } = db.useAuth();
  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return <div>Uh oh! {error.message}</div>;
  }
  if (user) {
    return <App />;
  }
  return <Login auth={db.auth} />;
}

function App() {
  const { isLoading, error, data } = db.useQuery({
    $files: {
      $: {
        order: { serverCreatedAt: 'asc' },
        fields: ['url', 'path'],
      },
    },
  });
  if (isLoading) {
    return <div>Fetching data...</div>;
  }
  if (error) {
    return <div>Error fetching data: {error.message}</div>;
  }
  const { $files: images } = data;
  return (
    <div className="box-border flex min-h-screen flex-col items-center bg-gray-50 p-5 font-mono">
      <div className="mb-8 text-5xl tracking-wider text-gray-300">
        Image Feed
      </div>
      <ImageUpload />
      <ImageGrid images={images} />
    </div>
  );
}

async function uploadImage(file: File) {
  try {
    const opts = {
      contentType: file.type,
      contentDisposition: 'attachment; filename="moop.jpg"',
    };
    const res = await db.storage.uploadFile(file.name, file, opts);
    console.log('Upload response:', res);
  } catch (error) {
    console.error('Error uploading image:', error);
  }
}

async function deleteImage(image: Image) {
  const val = await db.storage.delete(image.path);
  console.log(val);
}

interface SelectedFile {
  file: File;
  previewURL: string;
}

function ImageUpload() {
  const [selectedFile, setSelectedFile] = React.useState<SelectedFile | null>(
    null,
  );
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
    <div className="mb-8 rounded-lg border-2 border-dashed border-gray-300 p-5">
      <input
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="font-mono"
      />
      {previewURL && (
        <div className="mt-5 flex flex-col items-center gap-3">
          <img
            src={previewURL}
            alt="Preview"
            className="max-h-xs max-w-xs object-contain"
          />
          <button
            onClick={handleUpload}
            className="cursor-pointer rounded border-none bg-green-500 px-4 py-2 font-mono text-white"
          >
            Upload Image
          </button>
        </div>
      )}
    </div>
  );
}

type Image = InstaQLEntity<typeof schema, '$files'>;

function ImageGrid({ images }: { images: Image[] }) {
  return (
    <div className="grid w-full max-w-6xl grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {images.map((image, idx) => (
        <div
          key={image.id}
          className="overflow-hidden rounded-lg border border-gray-300"
        >
          <img
            src={image.url}
            alt={image.path}
            className="h-64 w-full object-cover"
          />
          <div className="flex items-center justify-between bg-white p-3">
            <span>{image.path}</span>
            <span
              onClick={() => deleteImage(image)}
              className="cursor-pointer px-1 text-gray-300"
            >
              𝘟
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default Wrapper;
