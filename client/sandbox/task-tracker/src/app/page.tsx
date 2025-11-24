'use client';

import { db } from '@/lib/db';
import { type AppSchema } from '@/instant.schema';
import { id, InstaQLEntity } from '@instantdb/react';
import React, { useState } from 'react';

type BaseProject = InstaQLEntity<AppSchema, 'projects', {}>;
type Task = InstaQLEntity<AppSchema, 'tasks', { assignee: {}; reporter: {} }>;
type User = InstaQLEntity<AppSchema, '$users', {}>;
type Project = BaseProject & { tasks: Task[]; members: User[]; admins: User[] };

function App() {
  return (
    <>
      <db.SignedIn>
        <TaskTrackerApp />
      </db.SignedIn>
      <db.SignedOut>
        <AuthForm />
      </db.SignedOut>
    </>
  );
}

function TaskTrackerApp() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const user = db.useUser();

  // Initialize selectedProjectId from URL on component mount
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const projectFromUrl = urlParams.get('project');

    // Don't override if we already have invite parameters being processed
    const hasInviteParams = urlParams.get('secret');

    if (projectFromUrl && !hasInviteParams) {
      setSelectedProjectId(projectFromUrl);
    }
  }, []);

  // Update URL when selectedProjectId changes
  const updateSelectedProject = (projectId: string | null) => {
    setSelectedProjectId(projectId);

    const url = new URL(window.location.href);
    if (projectId) {
      url.searchParams.set('project', projectId);
    } else {
      url.searchParams.delete('project');
    }
    window.history.replaceState({}, '', url.toString());
  };

  // Filter states (lifted up from LeftPanel)
  const [selectedIssueTypes, setSelectedIssueTypes] = useState<string[]>([
    'issue',
    'bug',
    'improvement',
  ]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([
    'open',
    'in_progress',
    'review',
    'done',
  ]);
  const [selectedCreator, setSelectedCreator] = useState<string>('');
  const [selectedAssignee, setSelectedAssignee] = useState<string>('');

  // Resizable panel state
  const [leftPanelWidth, setLeftPanelWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);

  // Get invite parameters from URL
  const [inviteParams, setInviteParams] = useState<{
    projectId: string;
    secret: string;
  } | null>(null);

  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('project');
    const secret = urlParams.get('secret');

    if (projectId && secret) {
      setInviteParams({ projectId, secret });
    }
  }, []);

  // Process invite when user is available and invite is validated
  React.useEffect(() => {
    if (!user || !inviteParams?.projectId || !inviteParams?.secret) return;

    // Valid invite found, add user to project
    processInvite(inviteParams.projectId, inviteParams.secret, user.id);

    // Remove invite parameters from URL and set project parameter
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.delete('secret');
    newUrl.searchParams.set('project', inviteParams.projectId);
    window.history.replaceState({}, '', newUrl.toString());

    // Set the project as selected
    setSelectedProjectId(inviteParams.projectId);

    // Clear invite parameters
    setInviteParams(null);
  }, [user, inviteParams]);

  // Resize handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing) return;
    const newWidth = Math.max(250, Math.min(600, e.clientX));
    setLeftPanelWidth(newWidth);
  };

  const handleMouseUp = () => {
    setIsResizing(false);
  };

  // Add/remove event listeners for mouse events
  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // Query 1: Fetch all projects (lightweight)
  const {
    isLoading: projectsLoading,
    error: projectsError,
    data: projectsData,
  } = db.useQuery({
    projects: {},
  });

  // Query 2: Fetch tasks for selected project only
  const { isLoading: tasksLoading, data: tasksData } = db.useQuery(
    selectedProjectId
      ? {
          tasks: {
            $: {
              where: {
                'project.id': selectedProjectId,
              },
            },
            assignee: {},
            reporter: {},
          },
        }
      : null,
  );

  if (projectsLoading) return <div className="p-4">Loading...</div>;
  if (projectsError)
    return (
      <div className="p-4 text-red-500">Error: {projectsError.message}</div>
    );

  const projects = projectsData?.projects || [];
  const baseProject = projects.find((p) => p.id === selectedProjectId);

  // Construct selectedProject with tasks from separate query
  const selectedProject = baseProject
    ? {
        ...baseProject,
        tasks: tasksData?.tasks || [],
        members: [], // Members will be fetched separately when needed
        admins: [], // Admins will be fetched separately when needed
      }
    : undefined;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <div className="relative" style={{ width: leftPanelWidth }}>
        <LeftPanel
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={updateSelectedProject}
          selectedProject={selectedProject}
          user={user}
          selectedIssueTypes={selectedIssueTypes}
          setSelectedIssueTypes={setSelectedIssueTypes}
          selectedStatuses={selectedStatuses}
          setSelectedStatuses={setSelectedStatuses}
          selectedCreator={selectedCreator}
          setSelectedCreator={setSelectedCreator}
          selectedAssignee={selectedAssignee}
          setSelectedAssignee={setSelectedAssignee}
        />
        {/* Resize handle */}
        <div
          className="absolute top-0 right-0 h-full w-1 cursor-ew-resize bg-gray-200 transition-colors hover:bg-gray-400"
          onMouseDown={handleMouseDown}
        />
      </div>
      <div className="flex flex-1 flex-col">
        <header className="border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">
              {selectedProject ? selectedProject.name : 'Instant Task Tracker'}
            </h1>
          </div>
        </header>

        <main className="flex-1">
          {selectedProject ? (
            <ProjectView
              project={selectedProject}
              selectedIssueTypes={selectedIssueTypes}
              selectedStatuses={selectedStatuses}
              selectedCreator={selectedCreator}
              selectedAssignee={selectedAssignee}
            />
          ) : (
            <div className="p-6">
              <h2 className="mb-4 text-xl font-semibold text-gray-900">
                Welcome to Instant Task Tracker
              </h2>
              <p className="mb-6 text-gray-600">
                Select a project from the panel or create a new one to get
                started.
              </p>
              <CreateProjectForm onProjectCreated={updateSelectedProject} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// Data manipulation functions
function createProject(name: string, userId: string): string {
  const now = Date.now();
  const projectId = id();

  db.transact(
    db.tx.projects[projectId]
      .update({
        name,
        createdAt: now,
        updatedAt: now,
      })
      .link({ members: userId, admins: userId }),
  );

  return projectId;
}

function createTask(
  title: string,
  description: string,
  category: 'issue' | 'bug' | 'improvement',
  projectId: string,
  reporterId: string,
  assigneeId?: string,
) {
  const now = Date.now();
  const taskId = id();

  let taskUpdate = db.tx.tasks[taskId]
    .update({
      title,
      description,
      category,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    })
    .link({ project: projectId, reporter: reporterId });

  if (assigneeId && assigneeId.trim() !== '') {
    taskUpdate = taskUpdate.link({ assignee: assigneeId });
  }

  db.transact(taskUpdate);
}

function updateTaskStatus(
  taskId: string,
  status: 'open' | 'in_progress' | 'review' | 'done',
) {
  db.transact(
    db.tx.tasks[taskId].update({
      status,
      updatedAt: Date.now(),
    }),
  );
}

function assignTask(taskId: string, assigneeId: string) {
  db.transact(
    db.tx.tasks[taskId]
      .update({ updatedAt: Date.now() })
      .link({ assignee: assigneeId }),
  );
}

function unassignTask(taskId: string, assigneeId: string) {
  db.transact(
    db.tx.tasks[taskId]
      .update({ updatedAt: Date.now() })
      .unlink({ assignee: assigneeId }),
  );
}

function deleteTask(taskId: string) {
  db.transact(db.tx.tasks[taskId].delete());
}

function addProjectMember(
  projectId: string,
  userId: string,
  role: 'admin' | 'member' = 'member',
) {
  if (role === 'admin') {
    db.transact(
      db.tx.projects[projectId].link({ members: userId, admins: userId }),
    );
  } else {
    db.transact(db.tx.projects[projectId].link({ members: userId }));
  }
}

function removeProjectMember(projectId: string, userId: string) {
  db.transact(
    db.tx.projects[projectId].unlink({ members: userId, admins: userId }),
  );
}

function updateProjectMemberRole(
  projectId: string,
  userId: string,
  newRole: 'admin' | 'member',
) {
  if (newRole === 'admin') {
    db.transact(db.tx.projects[projectId].link({ admins: userId }));
  } else {
    db.transact(db.tx.projects[projectId].unlink({ admins: userId }));
  }
}

function createInvite(projectId: string) {
  const inviteId = id();
  const secret = generateInviteSecret();
  const now = Date.now();

  db.transact(
    db.tx.invites[inviteId]
      .update({
        secret,
        createdAt: now,
      })
      .link({ project: projectId }),
  );
}

function regenerateInvite(inviteId: string) {
  const secret = generateInviteSecret();
  const now = Date.now();

  db.transact(
    db.tx.invites[inviteId].update({
      secret,
      createdAt: now,
    }),
  );
}

function generateInviteSecret(): string {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

function processInvite(projectId: string, secret: string, userId: string) {
  db.transact(
    db.tx.projects[projectId]
      // .update({ id: projectId })
      .link({ members: userId })
      .ruleParams({ secret }),
  ).catch((e) => {
    console.log('!!!!', projectId, secret, userId, e);
    throw e;
  });
}

function AuthForm() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentEmail, setSentEmail] = useState<string | null>(null);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await db.auth.sendMagicCode({ email });
      setSentEmail(email);
    } catch (err: any) {
      alert('Error: ' + err.body?.message);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await db.auth.signInWithMagicCode({ email: sentEmail!, code });
    } catch (err: any) {
      alert('Error: ' + err.body?.message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Task Tracker
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {sentEmail ? 'Enter verification code' : 'Sign in to your account'}
          </p>
        </div>
        <form
          className="mt-8 space-y-6"
          onSubmit={sentEmail ? handleVerifyCode : handleSendCode}
        >
          <div>
            {!sentEmail ? (
              <input
                type="email"
                required
                className="relative block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Code sent to {sentEmail}
                </p>
                <input
                  type="text"
                  required
                  className="relative block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
                  placeholder="Verification code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
            )}
          </div>
          <div>
            <button
              type="submit"
              className="group relative flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
            >
              {sentEmail ? 'Verify Code' : 'Send Code'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LeftPanel({
  projects,
  selectedProjectId,
  onSelectProject,
  selectedProject,
  user,
  selectedIssueTypes,
  setSelectedIssueTypes,
  selectedStatuses,
  setSelectedStatuses,
  selectedCreator,
  setSelectedCreator,
  selectedAssignee,
  setSelectedAssignee,
}: {
  projects: BaseProject[];
  selectedProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  selectedProject: Project | undefined;
  user: any;
  selectedIssueTypes: string[];
  setSelectedIssueTypes: (types: string[]) => void;
  selectedStatuses: string[];
  setSelectedStatuses: (statuses: string[]) => void;
  selectedCreator: string;
  setSelectedCreator: (creator: string) => void;
  selectedAssignee: string;
  setSelectedAssignee: (assignee: string) => void;
}) {
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showManageMembers, setShowManageMembers] = useState(false);

  // Query for current user's admin status
  const { data: userProjectData } = db.useQuery(
    selectedProject
      ? {
          projects: {
            $: {
              where: {
                id: selectedProject.id,
              },
            },
            admins: {},
            members: {},
          },
        }
      : null,
  );

  const projectData = userProjectData?.projects?.[0];
  const isAdmin =
    projectData?.admins?.some((admin) => admin.id === user.id) || false;

  // Get unique users from project members for dropdowns
  const projectUsers = projectData?.members || [];

  return (
    <>
      <aside className="flex h-full w-full flex-col border-r border-gray-200 bg-white">
        <div className="flex-1 p-4">
          {/* Project Select Dropdown */}
          <div className="mb-6">
            <div className="flex items-center space-x-2">
              <select
                value={selectedProjectId || ''}
                onChange={(e) => onSelectProject(e.target.value || null)}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">Select Project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              {selectedProject && (
                <button
                  onClick={() => setShowManageMembers(true)}
                  className="p-2 text-gray-400 hover:text-gray-600"
                  title="Manage Members"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          {selectedProject && (
            <div className="mb-6 space-y-3">
              <button
                onClick={() => setShowCreateTask(true)}
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
              >
                New Task
              </button>
            </div>
          )}

          {/* Filters */}
          {selectedProject && (
            <div className="space-y-4">
              {/* Issue Type Filter */}
              <div>
                <label className="mb-2 block text-xs font-medium text-gray-600">
                  Issue Type
                </label>
                <div className="space-y-1">
                  {/* Group checkbox for Issue Types */}
                  <label className="flex items-center text-sm font-medium select-none">
                    <input
                      type="checkbox"
                      checked={selectedIssueTypes.length === 3}
                      onChange={() => {
                        if (selectedIssueTypes.length === 3) {
                          setSelectedIssueTypes([]);
                        } else {
                          setSelectedIssueTypes([
                            'issue',
                            'bug',
                            'improvement',
                          ]);
                        }
                      }}
                      className="mr-2 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>All Types</span>
                  </label>
                  {['issue', 'bug', 'improvement'].map((type) => (
                    <label
                      key={type}
                      className="ml-4 flex items-center text-sm select-none"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIssueTypes.includes(type)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIssueTypes([
                              ...selectedIssueTypes,
                              type,
                            ]);
                          } else {
                            setSelectedIssueTypes(
                              selectedIssueTypes.filter((t) => t !== type),
                            );
                          }
                        }}
                        className="mr-2 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="capitalize">{type}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Status Filter */}
              <div>
                <label className="mb-2 block text-xs font-medium text-gray-600">
                  Status
                </label>
                <div className="space-y-1">
                  {/* Group checkbox for Statuses */}
                  <label className="flex items-center text-sm font-medium select-none">
                    <input
                      type="checkbox"
                      checked={selectedStatuses.length === 4}
                      onChange={() => {
                        if (selectedStatuses.length === 4) {
                          setSelectedStatuses([]);
                        } else {
                          setSelectedStatuses([
                            'open',
                            'in_progress',
                            'review',
                            'done',
                          ]);
                        }
                      }}
                      className="mr-2 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>All Statuses</span>
                  </label>
                  {['open', 'in_progress', 'review', 'done'].map((status) => (
                    <label
                      key={status}
                      className="ml-4 flex items-center text-sm select-none"
                    >
                      <input
                        type="checkbox"
                        checked={selectedStatuses.includes(status)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedStatuses([...selectedStatuses, status]);
                          } else {
                            setSelectedStatuses(
                              selectedStatuses.filter((s) => s !== status),
                            );
                          }
                        }}
                        className="mr-2 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="capitalize">
                        {status.replace('_', ' ')}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Creator Filter */}
              <div>
                <label className="mb-2 block text-xs font-medium text-gray-600">
                  Creator
                </label>
                <select
                  value={selectedCreator}
                  onChange={(e) => setSelectedCreator(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">All creators</option>
                  {projectUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.email}
                    </option>
                  ))}
                </select>
              </div>

              {/* Assigned To Filter */}
              <div>
                <label className="mb-2 block text-xs font-medium text-gray-600">
                  Assigned To
                </label>
                <select
                  value={selectedAssignee}
                  onChange={(e) => setSelectedAssignee(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">All assigned</option>
                  <option value="unassigned">Unassigned</option>
                  {projectUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* User info at bottom */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <span className="truncate text-sm text-gray-600">{user.email}</span>
            <button
              onClick={() => db.auth.signOut()}
              className="ml-2 text-gray-400 hover:text-gray-600"
              title="Sign out"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Modals */}
      {showCreateTask && selectedProject && (
        <CreateTaskModal
          project={selectedProject}
          onClose={() => setShowCreateTask(false)}
        />
      )}

      {showManageMembers && selectedProject && (
        <ManageMembersModal
          project={selectedProject}
          onClose={() => setShowManageMembers(false)}
        />
      )}
    </>
  );
}

function CreateProjectForm({
  onProjectCreated,
}: {
  onProjectCreated: (projectId: string) => void;
}) {
  const [name, setName] = useState('');
  const user = db.useUser();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      const projectId = createProject(name.trim(), user.id);
      setName('');
      onProjectCreated(projectId);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md">
      <div className="mb-4">
        <label
          htmlFor="projectName"
          className="mb-2 block text-sm font-medium text-gray-700"
        >
          Project Name
        </label>
        <input
          type="text"
          id="projectName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
          placeholder="Enter project name"
          required
        />
      </div>
      <button
        type="submit"
        className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
      >
        Create Project
      </button>
    </form>
  );
}

function ProjectView({
  project,
  selectedIssueTypes,
  selectedStatuses,
  selectedCreator,
  selectedAssignee,
}: {
  project: Project;
  selectedIssueTypes: string[];
  selectedStatuses: string[];
  selectedCreator: string;
  selectedAssignee: string;
}) {
  // Query for project members for task assignee dropdowns
  const { data: membersData } = db.useQuery(
    {
      projects: {
        $: {
          where: {
            id: project.id,
          },
        },
        members: {},
      },
    },
    { ruleParams: { project: project.id } },
  );

  const projectMembers = membersData?.projects?.[0]?.members || [];
  const allTasks = project.tasks || [];

  // Apply filters
  const filteredTasks = allTasks.filter((task) => {
    // Issue type filter - if no types selected, show nothing
    if (selectedIssueTypes.length === 0) {
      return false;
    }
    if (!selectedIssueTypes.includes(task.category)) {
      return false;
    }

    // Status filter - if no statuses selected, show nothing
    if (selectedStatuses.length === 0) {
      return false;
    }
    if (!selectedStatuses.includes(task.status)) {
      return false;
    }

    // Creator filter
    if (selectedCreator && task.reporter?.id !== selectedCreator) {
      return false;
    }

    // Assignee filter
    if (selectedAssignee) {
      if (selectedAssignee === 'unassigned') {
        // Show only tasks that have no assignee
        if (task.assignee) {
          return false;
        }
      } else {
        // Show only tasks assigned to the selected user
        if (!task.assignee || task.assignee.id !== selectedAssignee) {
          return false;
        }
      }
    }

    return true;
  });

  return (
    <div>
      <div className="overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="w-1/6 px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                  Title
                </th>
                <th className="w-1/6 px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                  Issue Type
                </th>
                <th className="w-1/6 px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                  Status
                </th>
                <th className="w-1/6 px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                  Creator
                </th>
                <th className="w-1/6 px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                  Assignee
                </th>
                <th className="w-1/6 px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  projectMembers={projectMembers}
                />
              ))}
            </tbody>
          </table>
          {filteredTasks.length === 0 && (
            <div className="py-12 text-center text-gray-500">
              No tasks match the current filters
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();

  // Check if it's today
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  // Check if it's current year
  const isCurrentYear = date.getFullYear() === now.getFullYear();
  if (isCurrentYear) {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  // Different year - include year
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function TaskRow({
  task,
  projectMembers,
}: {
  task: Task;
  projectMembers: User[];
}) {
  const categoryColors = {
    issue: 'bg-red-100 text-red-800',
    bug: 'bg-orange-100 text-orange-800',
    improvement: 'bg-purple-100 text-purple-800',
  };

  const statusColors = {
    open: 'bg-gray-100 text-gray-800',
    in_progress: 'bg-blue-100 text-blue-800',
    review: 'bg-yellow-100 text-yellow-800',
    done: 'bg-green-100 text-green-800',
  };

  const handleStatusChange = (newStatus: string) => {
    updateTaskStatus(task.id, newStatus as any);
  };

  const handleAssigneeChange = (newAssigneeId: string) => {
    if (newAssigneeId === 'unassigned') {
      if (task.assignee?.id) {
        unassignTask(task.id, task.assignee.id);
      }
    } else {
      assignTask(task.id, newAssigneeId);
    }
  };

  const handleCategoryChange = (newCategory: string) => {
    db.transact(
      db.tx.tasks[task.id].update({
        category: newCategory,
        updatedAt: Date.now(),
      }),
    );
  };

  // Get project users for assignee dropdown from passed projectMembers
  const projectUsers = projectMembers;

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm font-medium text-gray-900">
        {task.title}
        {task.description && (
          <div className="mt-1 max-w-xs truncate text-xs text-gray-500">
            {task.description}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        <select
          value={task.category}
          onChange={(e) => handleCategoryChange(e.target.value)}
          className={`cursor-pointer rounded-full border-0 px-2 py-1 text-xs ${categoryColors[task.category as keyof typeof categoryColors]}`}
        >
          <option value="issue">Issue</option>
          <option value="bug">Bug</option>
          <option value="improvement">Improvement</option>
        </select>
      </td>
      <td className="px-4 py-3 text-sm">
        <select
          value={task.status}
          onChange={(e) => handleStatusChange(e.target.value)}
          className={`rounded-full border-0 px-2 py-1 text-xs ${statusColors[task.status as keyof typeof statusColors]} cursor-pointer`}
        >
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="review">Review</option>
          <option value="done">Done</option>
        </select>
      </td>
      <td className="px-4 py-3 text-sm text-gray-900">
        {task.reporter?.email || 'Unknown'}
      </td>
      <td className="px-4 py-3 text-sm">
        <select
          value={task.assignee?.id || 'unassigned'}
          onChange={(e) => handleAssigneeChange(e.target.value)}
          className="rounded border-0 bg-transparent px-1 py-0.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        >
          <option value="unassigned">Unassigned</option>
          {projectUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.email}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {formatTime(task.createdAt)}
      </td>
    </tr>
  );
}

function CreateTaskModal({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'issue' | 'bug' | 'improvement'>(
    'issue',
  );
  const [assigneeId, setAssigneeId] = useState('');
  const user = db.useUser();

  // Query for project members
  const { data: membersData } = db.useQuery({
    projects: {
      $: {
        where: {
          id: project.id,
        },
      },
      members: {},
    },
  });

  const projectMembers = membersData?.projects?.[0]?.members || [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      createTask(
        title.trim(),
        description.trim(),
        category,
        project.id,
        user.id,
        assigneeId || undefined,
      );
      onClose();
    }
  };

  return (
    <div className="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black">
      <div className="w-full max-w-md rounded-lg bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Create New Task</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
              rows={3}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
            >
              <option value="issue">Issue</option>
              <option value="bug">Bug</option>
              <option value="improvement">Improvement</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Assignee (Optional)
            </label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">Unassigned</option>
              {projectMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.email}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ManageMembersModal({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const user = db.useUser();

  // Handle Esc key to close modal
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Query for project members and admins
  const { isLoading: membersLoading, data: membersData } = db.useQuery(
    {
      projects: {
        $: {
          where: {
            id: project.id,
          },
        },
        members: {},
        admins: {},
      },
    },
    { ruleParams: { project: project.id } },
  );

  const projectData = membersData?.projects?.[0];
  const members = projectData?.members || [];
  const admins = projectData?.admins || [];

  // Check if current user is admin
  const isCurrentUserAdmin = admins.some((admin) => admin.id === user.id);

  // Query for existing invite
  const { isLoading: inviteLoading, data: inviteData } = db.useQuery({
    invites: {
      $: {
        where: {
          'project.id': project.id,
        },
      },
      project: {},
    },
  });

  const existingInvite = inviteData?.invites?.[0];

  const handleCreateInvite = () => {
    createInvite(project.id);
  };

  const handleRegenerateInvite = () => {
    if (existingInvite) {
      regenerateInvite(existingInvite.id);
    }
  };

  const getInviteLink = () => {
    if (existingInvite) {
      return `${window.location.origin}/?project=${project.id}&secret=${existingInvite.secret}`;
    }
    return '';
  };

  const handleCopyInviteLink = async () => {
    const link = getInviteLink();
    if (link) {
      try {
        await navigator.clipboard.writeText(link);
        // You could add a toast notification here
      } catch (err) {
        console.error('Failed to copy link:', err);
      }
    }
  };

  return (
    <div className="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black">
      <div className="w-full max-w-lg rounded-lg bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Manage Project Members</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">Current Members</h4>
          <div className="space-y-2">
            {members.map((member) => {
              const isAdmin = admins.some((admin) => admin.id === member.id);
              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded bg-gray-50 px-3 py-2"
                >
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">{member.email}</span>
                    {isCurrentUserAdmin && member.id !== user.id ? (
                      <select
                        value={isAdmin ? 'admin' : 'member'}
                        onChange={(e) =>
                          updateProjectMemberRole(
                            project.id,
                            member.id,
                            e.target.value as 'admin' | 'member',
                          )
                        }
                        className={`rounded border-0 px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none ${
                          isAdmin
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        <option value="admin">admin</option>
                        <option value="member">member</option>
                      </select>
                    ) : (
                      <span
                        className={`rounded px-2 py-1 text-xs ${
                          isAdmin
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {isAdmin ? 'admin' : 'member'}
                      </span>
                    )}
                    {member.id === user.id && (
                      <span className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                        you
                      </span>
                    )}
                  </div>
                  {((member.id !== user.id && isCurrentUserAdmin) ||
                    member.id === user.id) && (
                    <button
                      onClick={() => removeProjectMember(project.id, member.id)}
                      className="text-sm text-red-600 hover:text-red-800"
                    >
                      {member.id === user.id ? 'Leave' : 'Remove'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {isCurrentUserAdmin && (
            <div className="border-t pt-4">
              <h4 className="mb-4 font-medium text-gray-900">Project Invite</h4>
              {!inviteLoading && (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Invite Link
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={getInviteLink()}
                      readOnly
                      className="flex-1 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:outline-none"
                      placeholder={
                        existingInvite ? '' : 'No invite created yet'
                      }
                    />
                    {existingInvite ? (
                      <>
                        <button
                          onClick={handleCopyInviteLink}
                          className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
                          title="Copy invite link"
                        >
                          Copy
                        </button>
                        <button
                          onClick={handleRegenerateInvite}
                          className="rounded-md bg-gray-600 px-3 py-2 text-sm text-white hover:bg-gray-700"
                        >
                          Regenerate
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={handleCreateInvite}
                        className="rounded-md bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700"
                      >
                        Create Invite
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    Share this link with people you want to invite to the
                    project. They can use it to join once they sign up.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
