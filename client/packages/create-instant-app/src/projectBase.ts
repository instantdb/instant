export type BackendConfigFile =
  | {
      type: 'typescript';
      path: string;
      initializer: string;
      websocket: boolean;
    }
  | {
      type: 'python';
      path: string;
    };

type ProjectBaseConfig = {
  appIdEnvName: string;
  backendConfigFiles: BackendConfigFile[];
  bundled: boolean;
};

const clientDb = (path = 'src/lib/db.ts'): BackendConfigFile => ({
  type: 'typescript',
  path,
  initializer: 'init',
  websocket: true,
});

const adminDb = (initializer = 'init'): BackendConfigFile => ({
  type: 'typescript',
  path: 'src/lib/adminDb.ts',
  initializer,
  websocket: false,
});

export const projectBaseConfig = {
  'next-js-app-dir': {
    appIdEnvName: 'NEXT_PUBLIC_INSTANT_APP_ID',
    backendConfigFiles: [clientDb()],
    bundled: true,
  },
  'vite-react': {
    appIdEnvName: 'VITE_INSTANT_APP_ID',
    backendConfigFiles: [clientDb()],
    bundled: true,
  },
  'vite-vanilla': {
    appIdEnvName: 'VITE_INSTANT_APP_ID',
    backendConfigFiles: [clientDb()],
    bundled: true,
  },
  expo: {
    appIdEnvName: 'EXPO_PUBLIC_INSTANT_APP_ID',
    backendConfigFiles: [clientDb('lib/db.ts')],
    bundled: true,
  },
  'tanstack-start': {
    appIdEnvName: 'VITE_INSTANT_APP_ID',
    backendConfigFiles: [clientDb(), adminDb()],
    bundled: true,
  },
  'tanstack-start-with-tanstack-query': {
    appIdEnvName: 'VITE_INSTANT_APP_ID',
    backendConfigFiles: [clientDb(), adminDb()],
    bundled: false,
  },
  'bun-react': {
    appIdEnvName: 'BUN_PUBLIC_INSTANT_APP_ID',
    backendConfigFiles: [clientDb()],
    bundled: false,
  },
  'solidjs-vite': {
    appIdEnvName: 'VITE_INSTANT_APP_ID',
    backendConfigFiles: [clientDb()],
    bundled: false,
  },
  sveltekit: {
    appIdEnvName: 'VITE_INSTANT_APP_ID',
    backendConfigFiles: [clientDb()],
    bundled: true,
  },
  'vue-vite': {
    appIdEnvName: 'VITE_INSTANT_APP_ID',
    backendConfigFiles: [clientDb()],
    bundled: true,
  },
  'vercel-ai-sdk': {
    appIdEnvName: 'NEXT_PUBLIC_INSTANT_APP_ID',
    backendConfigFiles: [clientDb(), adminDb('initAdmin')],
    bundled: false,
  },
  'ai-chat': {
    appIdEnvName: 'NEXT_PUBLIC_INSTANT_APP_ID',
    backendConfigFiles: [clientDb(), adminDb()],
    bundled: false,
  },
  'python-script': {
    appIdEnvName: 'INSTANT_APP_ID',
    backendConfigFiles: [{ type: 'python', path: 'main.py' }],
    bundled: true,
  },
} satisfies Record<string, ProjectBaseConfig>;

export type ProjectBase = keyof typeof projectBaseConfig;

export const projectBases = Object.keys(projectBaseConfig) as ProjectBase[];

export const bundledProjectBases = projectBases.filter(
  (base) => projectBaseConfig[base].bundled,
);
