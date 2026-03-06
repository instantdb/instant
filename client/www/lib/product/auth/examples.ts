export const permissionExamples = [
  {
    label: 'Owner only',
    code: `// Only the creator can see their own todos
const rules = {
  todos: {
    allow: {
      view: "auth.id == data.creatorId",
      update: "auth.id == data.creatorId",
      delete: "auth.id == data.creatorId",
    },
  },
};`,
  },
  {
    label: 'Logged in',
    code: `// Any authenticated user can create posts
const rules = {
  posts: {
    allow: {
      create: "auth.id != null",
    },
  },
};`,
  },
  {
    label: 'Public read',
    code: `// Anyone can view posts, even unauthenticated users
const rules = {
  posts: {
    allow: {
      view: "true",
      create: "auth.id != null",
      update: "auth.id == data.authorId",
    },
  },
};`,
  },
  {
    label: 'Team member',
    code: `// Only team members can view projects
const rules = {
  projects: {
    allow: {
      view: "isTeamMember",
      update: "isTeamMember",
    },
    bind: {
      isTeamMember: "auth.id in data.ref('team.members.id')",
    },
  },
};`,
  },
  {
    label: 'Owner or admin',
    code: `// Owners can edit their posts, admins can edit any post
const rules = {
  posts: {
    allow: {
      update: "isOwner || isAdmin",
      delete: "isOwner || isAdmin",
    },
    bind: {
      isOwner: "auth.id == data.authorId",
      isAdmin: "'admin' in auth.ref('$user.roles.type')",
    },
  },
};`,
  },
  {
    label: 'Prevent transfer',
    code: `// Prevent ownership transfer on update
const rules = {
  todos: {
    allow: {
      create: "isOwner",
      update: "isOwner && isStillOwner",
      delete: "isOwner",
    },
    bind: {
      isOwner: "auth.id == data.creatorId",
      isStillOwner: "auth.id == newData.creatorId",
    },
  },
};`,
  },
  {
    label: 'Hide fields',
    code: `// Only show email to the user themselves
const rules = {
  $users: {
    allow: {
      view: "true",
    },
    fields: {
      email: "auth.id == data.id",
      phone: "auth.id == data.id",
    },
  },
};`,
  },
  {
    label: 'Lock down',
    code: `// Deny everything by default, then allow specific actions
const rules = {
  $default: {
    allow: {
      $default: "false",
    },
  },
  posts: {
    allow: {
      view: "true",
      create: "auth.id != null",
    },
  },
};`,
  },
  {
    label: 'Share links',
    code: `// Grant access via secret share link tokens
const rules = {
  docs: {
    allow: {
      view: "hasViewerSecret || hasEditorSecret",
      update: "hasEditorSecret",
    },
    bind: {
      hasViewerSecret:
        "ruleParams.secret in data.ref('viewLinks.secret')",
      hasEditorSecret:
        "ruleParams.secret in data.ref('editLinks.secret')",
    },
  },
};`,
  },
  {
    label: 'Restrict fields',
    code: `// Non-owners can only modify 'likes' and 'viewCount'
const rules = {
  posts: {
    allow: {
      update: "isOwner || onlyPublicFields",
    },
    bind: {
      isOwner: "auth.id == data.authorId",
      onlyPublicFields:
        "request.modifiedFields.all(f, f in ['likes', 'viewCount'])",
    },
  },
};`,
  },
  {
    label: 'Time-limited',
    code: `// Can only edit within 5 minutes of creation
const rules = {
  comments: {
    allow: {
      update: "isAuthor && withinEditWindow",
    },
    bind: {
      isAuthor: "auth.id == data.authorId",
      withinEditWindow:
        "(request.time - timestamp(data.createdAt)).getMinutes() <= 5",
    },
  },
};`,
  },
  {
    label: 'Published only',
    code: `// Public users see published posts, authors see all their own
const rules = {
  posts: {
    allow: {
      view: "data.published == true || auth.id == data.authorId",
    },
  },
};`,
  },
  {
    label: 'Origin check',
    code: `// Only allow requests from your own domain
const rules = {
  orders: {
    allow: {
      create: "auth.id != null && fromMyApp",
    },
    bind: {
      fromMyApp: "request.origin == 'https://myapp.com'",
    },
  },
};`,
  },
];
