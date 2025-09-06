import React, { useState, useEffect } from 'react';
import { i, id, InstantReactAbstractDatabase } from '@instantdb/react';
import { provisionEphemeralApp } from '../../components/EphemeralAppPage';
import config from '../../config';
import { init } from '@instantdb/react';

// Schema definition with cascade delete
const schema = i.schema({
  entities: {
    posts: i.entity({
      title: i.string(),
    }),
    comments: i.entity({
      text: i.string(),
    }),
  },
  links: {
    postComments: {
      forward: { on: 'posts', has: 'many', label: 'comments' },
      reverse: {
        on: 'comments',
        has: 'one',
        label: 'post',
        onDelete: 'cascade',
      },
    },
  },
});

type Schema = typeof schema;

const perms = {
  posts: {
    allow: {
      create: 'true',
      delete: 'true',
    },
  },
  comments: {
    allow: {
      create: 'true',
      view: 'true',
      update: 'false',
      delete: 'false', // Comments cannot be deleted directly
    },
  },
};

function CascadePermissionDemo() {
  const [appWithSkip, setAppWithSkip] = useState<{
    db: InstantReactAbstractDatabase<Schema>;
    appId: string;
  } | null>(null);
  const [appNoSkip, setAppNoSkip] = useState<{
    db: InstantReactAbstractDatabase<Schema>;
    appId: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function setupApps() {
      try {
        // Create first ephemeral app with skipCascadePermissionCheck enabled
        const res1 = await provisionEphemeralApp({ schema, perms });
        if (res1.app) {
          const db1 = init<Schema>({
            ...config,
            appId: res1.app.id,
            schema,
            skipCascadePermissionCheck: true,
          });
          setAppWithSkip({ db: db1, appId: res1.app.id });
        }

        // Create second ephemeral app without skipCascadePermissionCheck
        const res2 = await provisionEphemeralApp({ schema, perms });
        if (res2.app) {
          const db2 = init<Schema>({
            ...config,
            appId: res2.app.id,
            schema,
            skipCascadePermissionCheck: false,
          });
          setAppNoSkip({ db: db2, appId: res2.app.id });
        }
      } catch (error) {
        console.error('Failed to provision apps:', error);
      } finally {
        setLoading(false);
      }
    }

    setupApps();
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">
          Loading Cascade Permission Check Demo...
        </h1>
      </div>
    );
  }

  if (!appWithSkip || !appNoSkip) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Failed to load demo apps</h1>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Cascade Permission Check Demo</h1>

      <div className="mb-6 bg-blue-50 p-4 rounded">
        <h2 className="text-lg font-semibold mb-2">How this demo works:</h2>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>
            Posts have a cascade delete relationship with comments (deleting a
            post deletes its comments)
          </li>
          <li>Permission rules: Posts can be deleted</li>
          <li>
            Permission rules: Comments cannot be deleted directly (delete:
            false)
          </li>
          <li>
            Left app: skipCascadePermissionCheck = true (cascade deletes bypass
            comment permissions)
          </li>
          <li>
            Right app: skipCascadePermissionCheck = false (cascade deletes check
            comment permissions)
          </li>
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <AppInstance
          title="With Skip Cascade Permission Check"
          subtitle="Deleting posts will succeed even though comments have restrictive permissions"
          db={appWithSkip.db}
          highlightColor="green"
        />
        <AppInstance
          title="Without Skip Cascade Permission Check"
          subtitle="Deleting posts will fail because comments cannot be deleted"
          db={appNoSkip.db}
          highlightColor="red"
        />
      </div>
    </div>
  );
}

interface AppInstanceProps {
  title: string;
  subtitle: string;
  db: InstantReactAbstractDatabase<Schema>;
  highlightColor: 'green' | 'red';
}

function AppInstance({
  title,
  subtitle,
  db,
  highlightColor,
}: AppInstanceProps) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Query posts and comments
  const { data, isLoading } = db.useQuery({
    posts: {
      comments: {},
    },
  });

  const createPostWithComments = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const postId = id();
      const comment1Id = id();
      const comment2Id = id();

      // Create a post with comments
      await db.transact([
        db.tx.posts[postId].update({
          title: `Post ${Date.now()}`,
        }),
        db.tx.comments[comment1Id].update({
          text: 'First comment',
        }),
        db.tx.comments[comment2Id].update({
          text: 'Second comment',
        }),
        db.tx.posts[postId].link({ comments: comment1Id }),
        db.tx.posts[postId].link({ comments: comment2Id }),
      ]);

      setSuccess('Created post with 2 comments');
    } catch (err) {
      setError(
        `Failed to create: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const deletePost = async (postId: string) => {
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      // Try to delete the post (which should cascade to comments)
      await db.transact(db.tx.posts[postId].delete());
      setSuccess('Successfully deleted post and its comments!');
    } catch (err) {
      setError(
        `Failed to delete: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      // Try to delete a comment directly (should always fail due to permissions)
      await db.transact(db.tx.comments[commentId].delete());
      setSuccess('Successfully deleted comment!');
    } catch (err) {
      setError(
        `Failed to delete comment: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const borderColor =
    highlightColor === 'green' ? 'border-green-500' : 'border-red-500';
  const bgColor = highlightColor === 'green' ? 'bg-green-50' : 'bg-red-50';

  return (
    <div className={`border-2 ${borderColor} rounded-lg p-6 ${bgColor}`}>
      <h2 className="text-xl font-bold mb-2">{title}</h2>
      <p className="text-sm text-gray-600 mb-4">{subtitle}</p>

      <div className="mb-4">
        <button
          onClick={createPostWithComments}
          disabled={loading}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          Create Post with Comments
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded text-sm">
          {success}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <h3 className="font-semibold mb-2">
            Posts ({data?.posts?.length || 0})
          </h3>
          {isLoading ? (
            <p className="text-gray-500">Loading...</p>
          ) : (
            <div className="space-y-2">
              {data?.posts?.map((post) => (
                <div key={post.id} className="bg-white p-3 rounded shadow">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{post.title}</p>
                    </div>
                    <button
                      onClick={() => deletePost(post.id)}
                      disabled={loading}
                      className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600 disabled:opacity-50"
                    >
                      Delete Post
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-gray-600">
                    {post.comments?.length || 0} comments
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="font-semibold mb-2">Comments</h3>
          {isLoading ? (
            <p className="text-gray-500">Loading...</p>
          ) : (
            <div className="space-y-2">
              {data?.posts?.flatMap((post) =>
                post.comments?.map((comment) => (
                  <div key={comment.id} className="bg-white p-3 rounded shadow">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm">{comment.text}</p>
                        <p className="text-xs text-gray-500">
                          Post: {post.title}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteComment(comment.id)}
                        disabled={loading}
                        className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600 disabled:opacity-50"
                        title="Direct comment deletion should fail due to permissions"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )),
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 p-3 bg-gray-100 rounded text-xs">
        <p className="font-semibold">Expected behavior:</p>
        <ul className="list-disc list-inside mt-1 space-y-1">
          {highlightColor === 'green' ? (
            <>
              <li>
                ✅ Deleting posts succeeds (cascaded comment deletes bypass
                permission check)
              </li>
              <li>❌ Deleting comments directly fails (permission denied)</li>
            </>
          ) : (
            <>
              <li>
                ❌ Deleting posts fails (cascaded comment deletes are permission
                checked)
              </li>
              <li>❌ Deleting comments directly fails (permission denied)</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}

export default CascadePermissionDemo;
