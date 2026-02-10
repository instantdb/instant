import {
  ErrorComponent,
  HeadContent,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";

import Header from "../components/Header";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
  beforeLoad: () => {
    if (!import.meta.env.VITE_INSTANT_APP_ID) {
      throw new Error(
        "VITE_INSTANT_APP_ID is not defined. Make sure to include it in your environment variables. In dev, `instant-cli init` can do this for you.",
      );
    }
  },
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Instant DB TanStack Start Starter",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  errorComponent: (err) => <ErrorComponent error={err.error} />,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Header />
        {children}
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
