'use client'

import { init } from '@instantdb/react'
import React from 'react'
import Login from '../../components/Login'
import config from "../../config";

// Types
// ----------
export type Image = {
  id: string
  path: string
  url: string
}

// Optional: Declare your schema for intellisense!
type Schema = {
  images: Image
}

export const db = init(config)

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
        order: { serverCreatedAt: "asc" }
      }
    }
  })
  if (isLoading) {
    return <div>Fetching data...</div>
  }
  if (error) {
    return <div>Error fetching data: {error.message}</div>
  }
  const { $files: images } = data as { $files: Image[] }
  return (
    <div style={styles.container}>
      <div style={styles.header}>Image Feed</div>
      <ImageUpload />
      <ImageGrid images={images} />
    </div>
  )
}

async function uploadImage(file: File) {
  try {
    const opts = {
      "contentType": file.type,
      "contentDisposition": 'attachment; filename="moop.jpg"',
    }
    const res = await db.storage.uploadFile(file.name, file, opts)
    console.log('Upload response:', res)
  } catch (error) {
    console.error('Error uploading image:', error)
  }
}

async function deleteImage(image: Image) {
  const val = await db.storage.delete(image.path)
  console.log(val)
}

interface SelectedFile {
  file: File, previewURL: string
}

function ImageUpload() {
  const [selectedFile, setSelectedFile] = React.useState<SelectedFile | null>(null)
  const { previewURL } = selectedFile || {}

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const previewURL = URL.createObjectURL(file)
      setSelectedFile({ file, previewURL })
    }
  }

  const handleUpload = () => {
    if (selectedFile) {
      uploadImage(selectedFile.file)
      URL.revokeObjectURL(selectedFile.previewURL)
      setSelectedFile(null)
    }
  }

  return (
    <div style={styles.uploadContainer}>
      <input
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        style={styles.fileInput}
      />
      {previewURL && (
        <div style={styles.previewContainer}>
          <img src={previewURL} alt="Preview" style={styles.previewImage} />
          <button onClick={handleUpload} style={styles.uploadButton}>
            Upload Image
          </button>
        </div>
      )}
    </div>
  )
}

function ImageGrid({ images }: { images: Image[] }) {
  return (
    <div style={styles.imageGrid}>
      {images.map((image, idx) => (
        <div key={image.id} style={styles.imageContainer}>
          <img src={image.url} alt={image.path} style={styles.image} />
          <div style={styles.imageCaption}>
            <span>{image.path}</span>
            <span onClick={() => deleteImage(image)} style={styles.delete}>
              𝘟
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// Styles
// ----------
const styles: Record<string, React.CSSProperties> = {
  previewContainer: {
    marginTop: '20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
  },
  previewImage: {
    maxWidth: '200px',
    maxHeight: '200px',
    objectFit: 'contain',
  },
  uploadButton: {
    padding: '8px 16px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontFamily: 'code, monospace',
  },
  container: {
    boxSizing: 'border-box',
    backgroundColor: '#fafafa',
    fontFamily: 'code, monospace',
    minHeight: '100vh',
    padding: '20px',
    display: 'flex',
    alignItems: 'center',
    flexDirection: 'column',
  },
  header: {
    letterSpacing: '2px',
    fontSize: '50px',
    color: 'lightgray',
    marginBottom: '30px',
  },
  uploadContainer: {
    marginBottom: '30px',
    padding: '20px',
    border: '2px dashed lightgray',
    borderRadius: '8px',
  },
  fileInput: {
    fontFamily: 'code, monospace',
  },
  imageGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '20px',
    width: '100%',
    maxWidth: '1200px',
  },
  imageContainer: {
    border: '1px solid lightgray',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '300px',
    objectFit: 'cover',
  },
  imageCaption: {
    padding: '10px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
  },
  delete: {
    cursor: 'pointer',
    color: 'lightgray',
    padding: '0 5px',
  },
}

export default Wrapper
