import { AnimateIn } from '../AnimateIn';

const employees = [
  {
    role: 'Sales',
    avatar: 'S',
    avatarBg: 'bg-blue-100',
    avatarText: 'text-blue-600',
    assistant: 'AI Assistant',
    tool: 'Deal Pipeline',
    toolIcon: (
      <svg
        className="h-5 w-5 text-blue-500"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
        />
      </svg>
    ),
    shared: 'Sales team (8)',
  },
  {
    role: 'Ops',
    avatar: 'O',
    avatarBg: 'bg-emerald-100',
    avatarText: 'text-emerald-600',
    assistant: 'AI Assistant',
    tool: 'Inventory Tracker',
    toolIcon: (
      <svg
        className="h-5 w-5 text-emerald-500"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
        />
      </svg>
    ),
    shared: 'Ops team (5)',
  },
  {
    role: 'Marketing',
    avatar: 'M',
    avatarBg: 'bg-purple-100',
    avatarText: 'text-purple-600',
    assistant: 'AI Assistant',
    tool: 'Campaign Dashboard',
    toolIcon: (
      <svg
        className="h-5 w-5 text-purple-500"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z"
        />
      </svg>
    ),
    shared: 'Marketing team (6)',
  },
];

export function InternalTools() {
  return (
    <div className="space-y-12">
      <AnimateIn>
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Let every employee build what they need
        </h2>
        <p className="mt-4 text-lg text-gray-500">
          Does your team already use LLMs? Pair them with Instant and every
          employee can build the internal tools they actually need. Empower the
          person who understands the problem to build the solution.
        </p>
      </AnimateIn>

      {/* 3-column layout: Employee → AI → Tool */}
      <AnimateIn delay={100}>
        {' '}
        <div className="grid gap-6 sm:grid-cols-3">
          {employees.map((emp) => (
            <div key={emp.role} className="space-y-4">
              {/* Employee + AI assistant */}
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div
                    className={`h-8 w-8 rounded-full ${emp.avatarBg} flex items-center justify-center`}
                  >
                    <span className={`text-sm font-bold ${emp.avatarText}`}>
                      {emp.avatar}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {emp.role}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {emp.assistant}
                    </div>
                  </div>
                </div>

                {/* Chat snippet */}
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <div className="text-[11px] text-gray-500">
                    &quot;Build me a {emp.tool.toLowerCase()}&quot;
                  </div>
                </div>
              </div>

              {/* Arrow down */}
              <div className="flex justify-center">
                <svg
                  className="h-5 w-5 text-gray-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3"
                  />
                </svg>
              </div>

              {/* Built tool */}
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-3">
                  {emp.toolIcon}
                  <span className="text-sm font-medium text-gray-900">
                    {emp.tool}
                  </span>
                </div>

                {/* Placeholder data rows */}
                <div className="space-y-1.5">
                  <div className="h-2 w-full rounded bg-gray-100" />
                  <div className="h-2 w-4/5 rounded bg-gray-100" />
                  <div className="h-2 w-3/5 rounded bg-gray-100" />
                </div>

                {/* Shared indicator */}
                <div className="mt-3 flex items-center gap-1.5 text-[10px] text-gray-400">
                  <svg
                    className="h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"
                    />
                  </svg>
                  <span>Shared with {emp.shared}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </AnimateIn>

      {/* Supporting detail */}
      <AnimateIn delay={200}>
        <p className="max-w-3xl text-lg text-gray-500">
          Every tool gets auth built in — employees can log in with their
          existing SSO. Permissions ensure people only see what they should. And
          because everything syncs in real-time, teams always see the latest
          data.
        </p>
      </AnimateIn>
    </div>
  );
}
