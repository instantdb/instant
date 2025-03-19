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
    <div className="box-border bg-gray-50 font-mono min-h-screen p-5 flex items-center flex-col">
      <div className="tracking-wider text-5xl text-gray-300 mb-8">
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
    <div className="mb-8 p-5 border-2 border-dashed border-gray-300 rounded-lg">
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
            className="max-w-xs max-h-xs object-contain"
          />
          <button
            onClick={handleUpload}
            className="py-2 px-4 bg-green-500 text-white border-none rounded cursor-pointer font-mono"
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
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 w-full max-w-6xl">
      {images.map((image, idx) => (
        <div
          key={image.id}
          className="border border-gray-300 rounded-lg overflow-hidden"
        >
          <img
            src={image.url}
            alt={image.path}
            className="w-full h-64 object-cover"
          />
          <div className="p-3 flex justify-between items-center bg-white">
            <span>{image.path}</span>
            <span
              onClick={() => deleteImage(image)}
              className="cursor-pointer text-gray-300 px-1"
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
