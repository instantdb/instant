# InstantDB Storage Guide

This guide explains how to use InstantDB Storage to easily upload, manage, and serve files in your applications.

## Core Concepts

InstantDB Storage allows you to:

- Upload files (images, videos, documents, etc.)
- Retrieve file metadata and download URLs
- Delete files
- Link files to other entities in your data model
- Secure files with permissions

Files are stored in a special `$files` namespace that automatically updates when files are added, modified, or removed.

## Getting Started

### Setting Up Schema

First, ensure your schema includes the `$files` namespace:

```typescript
// instant.schema.ts
import { i } from "@instantdb/react";

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    // Your other entities...
  },
  links: {
    // Your links...
  },
});

// TypeScript helpers
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
```

### Setting Up Permissions

Configure permissions to control who can upload, view, and delete files:

```typescript
// instant.perms.ts
import type { InstantRules } from "@instantdb/react";

const rules = {
  "$files": {
    "allow": {
      "view": "auth.id != null",  // Only authenticated users can view
      "create": "auth.id != null", // Only authenticated users can upload
      "delete": "auth.id != null"  // Only authenticated users can delete
    }
  }
} satisfies InstantRules;

export default rules;
```

Note `update` is currently not supported for `$files` so there is no need to
define an `update` rule for `$files`

> **Note:** For development, you can set all permissions to `"true"`, but for production applications, you should implement proper access controls.

## Uploading Files

### Basic File Upload

```typescript
// ✅ Good: Simple file upload
async function uploadFile(file: File) {
  try {
    await db.storage.uploadFile(file.name, file);
    console.log('File uploaded successfully!');
  } catch (error) {
    console.error('Error uploading file:', error);
  }
}
```

### Custom Path and Options

```typescript
// ✅ Good: Upload with custom path and content type
async function uploadProfileImage(userId: string, file: File) {
  try {
    const path = `users/${userId}/profile.jpg`;
    await db.storage.uploadFile(path, file, {
      contentType: 'image/jpeg',
      contentDisposition: 'inline'
    });
    console.log('Profile image uploaded!');
  } catch (error) {
    console.error('Error uploading profile image:', error);
  }
}
```

### React Component for Image Upload

```tsx
// ✅ Good: Image upload component
function ImageUploader() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      setPreview(previewUrl);
    }
  };
  
  // Upload the file
  const handleUpload = async () => {
    if (!selectedFile) return;
    
    setIsUploading(true);
    try {
      await db.storage.uploadFile(selectedFile.name, selectedFile);
      // Clean up
      setSelectedFile(null);
      if (preview) {
        URL.revokeObjectURL(preview);
        setPreview(null);
      }
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };
  
  return (
    <div className="uploader">
      <input 
        type="file" 
        accept="image/*" 
        onChange={handleFileChange}
        disabled={isUploading} 
      />
      
      {preview && (
        <div className="preview">
          <img src={preview} alt="Preview" />
        </div>
      )}
      
      <button 
        onClick={handleUpload} 
        disabled={!selectedFile || isUploading}
      >
        {isUploading ? 'Uploading...' : 'Upload'}
      </button>
    </div>
  );
}
```

❌ Common mistake: Not handling errors or loading states
```tsx
// ❌ Bad: Missing error handling and loading state
function BadUploader() {
  const handleUpload = async (file) => {
    // No try/catch, no loading state
    await db.storage.uploadFile(file.name, file);
  };
}
```

## Retrieving Files

Files are accessed by querying the `$files` namespace:

### Basic Query

```typescript
// ✅ Good: Query all files
function FileList() {
  const { isLoading, error, data } = db.useQuery({
    $files: {}
  });
  
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  const { $files } = data;
  
  return (
    <div>
      <h2>Files ({$files.length})</h2>
      <ul>
        {$files.map(file => (
          <li key={file.id}>
            <a href={file.url} target="_blank" rel="noopener noreferrer">
              {file.path}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Filtered Query

```typescript
// ✅ Good: Query files with filtering and ordering
function UserImages({ userId }: { userId: string }) {
  const { isLoading, error, data } = db.useQuery({
    $files: {
      $: {
        where: {
          path: { $like: `users/${userId}/%` },
        },
        order: { serverCreatedAt: 'desc' }
      }
    }
  });
  
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  const { $files } = data;
  
  return (
    <div className="image-grid">
      {$files.map(file => (
        <div key={file.id} className="image-item">
          <img src={file.url} alt={file.path} />
        </div>
      ))}
    </div>
  );
}
```

## Displaying Images

```tsx
// ✅ Good: Image gallery component
function ImageGallery() {
  const { isLoading, error, data } = db.useQuery({
    $files: {
      $: {
        where: {
          path: { $like: '%.jpg' },
        }
      }
    }
  });
  
  if (isLoading) return <div className="loading">Loading...</div>;
  if (error) return <div className="error">Error: {error.message}</div>;
  
  const { $files: images } = data;
  
  if (images.length === 0) {
    return <div className="empty">No images found</div>;
  }
  
  return (
    <div className="gallery">
      {images.map(image => (
        <div key={image.id} className="gallery-item">
          <img 
            src={image.url} 
            alt={image.path} 
            loading="lazy" 
          />
          <div className="image-info">
            <span>{image.path.split('/').pop()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

## Deleting Files

```typescript
// ✅ Good: Delete a file
async function deleteFile(filePath: string) {
  try {
    await db.storage.delete(filePath);
    console.log(`File ${filePath} deleted successfully`);
  } catch (error) {
    console.error(`Failed to delete ${filePath}:`, error);
  }
}

// ✅ Good: Delete file component
function FileItem({ file }) {
  const [isDeleting, setIsDeleting] = useState(false);
  
  const handleDelete = async () => {
    if (confirm(`Are you sure you want to delete ${file.path}?`)) {
      setIsDeleting(true);
      try {
        await db.storage.delete(file.path);
      } catch (error) {
        console.error('Delete failed:', error);
        alert(`Failed to delete: ${error.message}`);
      } finally {
        setIsDeleting(false);
      }
    }
  };
  
  return (
    <div className="file-item">
      <span>{file.path}</span>
      <button 
        onClick={handleDelete} 
        disabled={isDeleting}
        className="delete-btn"
      >
        {isDeleting ? 'Deleting...' : 'Delete'}
      </button>
    </div>
  );
}
```

## Linking Files to Other Entities

Files can be associated with other entities in your data model. This is useful for features like profile pictures, post attachments, etc.

### Schema Setup

First, define the relationship in your schema:

```typescript
// ✅ Good: Schema with file relationships
import { i } from "@instantdb/react";

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    profiles: i.entity({
      name: i.string(),
      bio: i.string(),
    }),
    posts: i.entity({
      title: i.string(),
      content: i.string(),
    }),
  },
  links: {
    // Profile avatar - one-to-one relationship
    profileAvatar: {
      forward: { on: 'profiles', has: 'one', label: 'avatar' },
      reverse: { on: '$files', has: 'one', label: 'profile' },
    },
    // Post attachments - one-to-many relationship
    postAttachments: {
      forward: { on: 'posts', has: 'many', label: 'attachments' },
      reverse: { on: '$files', has: 'one', label: 'post' },
    },
  },
});
```

> **Important:** Links to `$files` must be defined with `$files` in the **reverse** direction, similar to `$users`.

### Upload and Link

```typescript
// ✅ Good: Upload and link a profile avatar
async function uploadAvatar(profileId: string, file: File) {
  try {
    // 1. Upload the file
    const path = `profiles/${profileId}/avatar.jpg`;
    const { data } = await db.storage.uploadFile(path, file, {
      contentType: 'image/jpeg'
    });
    
    // 2. Link the file to the profile
    await db.transact(
      db.tx.profiles[profileId].link({ avatar: data.id })
    );
    
    console.log('Avatar uploaded and linked successfully');
  } catch (error) {
    console.error('Failed to upload avatar:', error);
  }
}

// ✅ Good: Upload multiple attachments to a post
async function addPostAttachments(postId: string, files: File[]) {
  try {
    // Process each file
    const fileIds = await Promise.all(
      files.map(async (file, index) => {
        const path = `posts/${postId}/attachment-${index}.${file.name.split('.').pop()}`;
        const { data } = await db.storage.uploadFile(path, file);
        return data.id;
      })
    );
    
    // Link all files to the post
    await db.transact(
      db.tx.posts[postId].link({ attachments: fileIds })
    );
    
    console.log(`${fileIds.length} attachments added to post`);
  } catch (error) {
    console.error('Failed to add attachments:', error);
  }
}
```

### Query Linked Files

```typescript
// ✅ Good: Query profiles with their avatars
function ProfileList() {
  const { isLoading, error, data } = db.useQuery({
    profiles: {
      avatar: {},
    }
  });
  
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  const { profiles } = data;
  
  return (
    <div className="profiles">
      {profiles.map(profile => (
        <div key={profile.id} className="profile-card">
          {profile.avatar ? (
            <img 
              src={profile.avatar.url} 
              alt={`${profile.name}'s avatar`} 
              className="avatar"
            />
          ) : (
            <div className="avatar-placeholder">No Avatar</div>
          )}
          <h3>{profile.name}</h3>
          <p>{profile.bio}</p>
        </div>
      ))}
    </div>
  );
}

// ✅ Good: Query a post with its attachments
function PostDetails({ postId }: { postId: string }) {
  const { isLoading, error, data } = db.useQuery({
    posts: {
      $: { where: { id: postId } },
      attachments: {},
    }
  });
  
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  const post = data.posts[0];
  if (!post) return <div>Post not found</div>;
  
  return (
    <div className="post">
      <h1>{post.title}</h1>
      <div className="content">{post.content}</div>
      
      {post.attachments && post.attachments.length > 0 && (
        <div className="attachments">
          <h2>Attachments ({post.attachments.length})</h2>
          <div className="attachment-list">
            {post.attachments.map(file => (
              <a 
                key={file.id} 
                href={file.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="attachment-item"
              >
                {file.path.split('/').pop()}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

## Permissions for File Storage

`data.path.startsWith` is a useful pattern for writing permissions for `$files`

```typescript
// ✅ Good: Users can only access their own files
const rules = {
  "$files": {
    "allow": {
      "view": "isOwner || isAdmin",
      "create": "isOwner",
      "delete": "isOwner || isAdmin"
    },
    "bind": [
      "isOwner", "data.path.startsWith('users/' + auth.id + '/')",
      "isAdmin", "auth.ref('$user.role') == 'admin'"
    ]
  }
} satisfies InstantRules;
```

## Using Storage with React Native

For React Native applications, you'll need to convert files to a format compatible with InstantDB's storage:

```typescript
// ✅ Good: Upload from React Native
import * as FileSystem from 'expo-file-system';
import { init } from '@instantdb/react-native';
import schema from '../instant.schema';

const db = init({ appId: process.env.EXPO_PUBLIC_INSTANT_APP_ID, schema });

async function uploadFromReactNative(localFilePath: string, uploadPath: string) {
  try {
    // Check if file exists
    const fileInfo = await FileSystem.getInfoAsync(localFilePath);
    if (!fileInfo.exists) {
      throw new Error(`File does not exist at: ${localFilePath}`);
    }
    
    // Convert to a File object
    const response = await fetch(fileInfo.uri);
    const blob = await response.blob();
    
    // Determine file type from extension or use a default
    const extension = localFilePath.split('.').pop()?.toLowerCase();
    let contentType = 'application/octet-stream';
    
    // Set appropriate content type based on extension
    if (extension === 'jpg' || extension === 'jpeg') contentType = 'image/jpeg';
    else if (extension === 'png') contentType = 'image/png';
    else if (extension === 'pdf') contentType = 'application/pdf';
    // Add more types as needed
    
    const file = new File([blob], uploadPath.split('/').pop() || 'file', { 
      type: contentType 
    });
    
    // Upload the file
    await db.storage.uploadFile(uploadPath, file, { contentType });
    console.log('File uploaded successfully!');
    return true;
  } catch (error) {
    console.error('Error uploading file:', error);
    return false;
  }
}
```

## Server-Side Storage Operations

For server-side operations, use the Admin SDK:

### Uploading from the Server

```typescript
// ✅ Good: Server-side file upload
import { init } from '@instantdb/admin';
import fs from 'fs';
import path from 'path';
import schema from '../instant.schema';

const db = init({
  appId: process.env.INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN!,
  schema,
});

async function uploadFromServer(localFilePath: string, uploadPath: string) {
  try {
    // Read file as buffer
    const buffer = fs.readFileSync(localFilePath);
    
    // Determine content type based on file extension
    const extension = path.extname(localFilePath).toLowerCase();
    let contentType = 'application/octet-stream';
    
    if (extension === '.jpg' || extension === '.jpeg') contentType = 'image/jpeg';
    else if (extension === '.png') contentType = 'image/png';
    else if (extension === '.pdf') contentType = 'application/pdf';
    // Add more types as needed
    
    // Upload the file
    await db.storage.uploadFile(uploadPath, buffer, {
      contentType,
    });
    
    console.log(`File uploaded to ${uploadPath}`);
    return true;
  } catch (error) {
    console.error('Server upload failed:', error);
    return false;
  }
}
```

### Bulk Deleting Files

```typescript
// ✅ Good: Bulk delete server-side
async function bulkDeleteFiles(pathPattern: string) {
  try {
    // Query files matching the pattern
    const { $files } = await db.query({
      $files: {
        $: {
          where: {
            path: { $like: pathPattern + '%' }
          }
        }
      }
    });
    
    // Extract paths
    const pathsToDelete = $files.map(file => file.path);
    
    if (pathsToDelete.length === 0) {
      console.log('No files found matching pattern');
      return 0;
    }
    
    // Delete in bulk
    await db.storage.deleteMany(pathsToDelete);
    console.log(`Deleted ${pathsToDelete.length} files`);
    return pathsToDelete.length;
  } catch (error) {
    console.error('Bulk delete failed:', error);
    throw error;
  }
}
```

## Best Practices

### File Organization

Uploading to the same path will overwrite files. Use organized file patterns to
correctly update user, project, and application-wide assets

```typescript
// ✅ Good: Organized file paths
// For user-specific files
const userFilePath = `users/${userId}/profile-picture.jpg`;

// For project-based files
const projectFilePath = `projects/${projectId}/documents/${documentId}.pdf`;

// For application-wide files
const publicFilePath = `public/logos/company-logo.png`;
```

## Common Errors and Solutions

1. **"Permission denied" when uploading**: Check your permissions rules for the `$files` namespace
2. **File not appearing after upload**: Ensure your query is correct and you're handling the asynchronous nature of uploads

## Complete Example: Image Gallery

Here's a complete example of an image gallery with upload, display, and delete functionality:

```tsx
import React, { useState, useRef } from 'react';
import { init, InstaQLEntity } from '@instantdb/react';
import schema, { AppSchema } from './instant.schema';

// Initialize InstantDB
const db = init({ 
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  schema 
});

type InstantFile = InstaQLEntity<AppSchema, '$files'>;

function ImageGallery() {
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Query all image files
  const { isLoading, error, data } = db.useQuery({
    $files: {
      $: {
        where: {
          path: { 
            $like: '%.jpg' 
          }
        },
        order: { 
          serverCreatedAt: 'desc' 
        }
      }
    }
  });
  
  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
    }
  };
  
  // Upload the selected file
  const handleUpload = async () => {
    if (!selectedFile) return;
    
    setUploading(true);
    try {
      await db.storage.uploadFile(selectedFile.name, selectedFile, {
        contentType: selectedFile.type
      });
      
      // Reset state
      setSelectedFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload image. Please try again.');
    } finally {
      setUploading(false);
    }
  };
  
  // Delete an image
  const handleDelete = async (file: InstantFile) => {
    if (!confirm(`Are you sure you want to delete ${file.path}?`)) {
      return;
    }
    
    try {
      await db.storage.delete(file.path);
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete image. Please try again.');
    }
  };
  
  if (isLoading) {
    return <div className="loading">Loading gallery...</div>;
  }
  
  if (error) {
    return <div className="error">Error: {error.message}</div>;
  }
  
  const { $files: images } = data;
  
  return (
    <div className="image-gallery-container">
      <h1>Image Gallery</h1>
      
      {/* Upload Section */}
      <div className="upload-section">
        <input
          type="file"
          ref={fileInputRef}
          accept="image/jpeg,image/png,image/gif"
          onChange={handleFileSelect}
          disabled={uploading}
        />
        
        {previewUrl && (
          <div className="preview">
            <img src={previewUrl} alt="Preview" />
          </div>
        )}
        
        <button
          onClick={handleUpload}
          disabled={!selectedFile || uploading}
          className="upload-button"
        >
          {uploading ? 'Uploading...' : 'Upload Image'}
        </button>
      </div>
      
      {/* Gallery Section */}
      <div className="gallery">
        {images.length === 0 ? (
          <p>No images yet. Upload some!</p>
        ) : (
          <div className="image-grid">
            {images.map(image => (
              <div key={image.id} className="image-item">
                <img src={image.url} alt={image.path} />
                <div className="image-overlay">
                  <span className="image-name">{image.path.split('/').pop()}</span>
                  <button
                    onClick={() => handleDelete(image)}
                    className="delete-button"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ImageGallery;
```

## Best Practices

- Make sure permissions are set for uploads to succeed
- Use organized path based permissions
- Validate image sizes and use compression for performance
- Use proper error handling to debug upload errors
- Links to `$files` must be defined with `$files` in the **reverse** direction, similar to `$users`

