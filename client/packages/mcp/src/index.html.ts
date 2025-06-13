const html = (serverOrigin: string): string => {
  const dev = !serverOrigin.startsWith('https');
  const mcpUrl = `${serverOrigin}/mcp`;
  const cursorConfig = Buffer.from(
    JSON.stringify({ url: mcpUrl }),
    'utf-8',
  ).toString('base64');

  const cursorUrl = `https://cursor.com/install-mcp?name=InstantDB${dev ? '%20Dev' : ''}&config=${cursorConfig}`;
  return /* HTML */ `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>InstantDB Remote MCP Server</title>
        <style>
          body {
            font-family: sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            margin: 64px;
            color: #1c1e21;
          }
          .container {
            text-align: center;
            padding: 2rem;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .copy-container {
            display: flex;
            margin: 1rem;
            width: 384px;
          }
          #mcpUrl {
            flex-grow: 1; /* Allows input to fill available space */
            padding: 0.5rem;
            font-size: 1rem;
            border: 1px solid #ccc;
            border-right: none;
            border-radius: 4px 0 0 4px;
            background-color: #f9f9f9;
          }
          #copyButton {
            padding: 0.5rem 1rem;
            border: 1px solid #007bff;
            background-color: #007bff;
            color: white;
            cursor: pointer;
            border-radius: 0 4px 4px 0;
            font-size: 1rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Welcome to InstantDB's remote MCP Server!</h1>

          <p>
            <a href="${cursorUrl}">
              <img
                src="https://cursor.com/deeplink/mcp-install-dark.svg"
                alt="Add InstantDB's MCP server to Cursor"
                height="32"
              />
            </a>
          </p>

          <div class="copy-container">
            <input type="text" value="${mcpUrl}" id="mcpUrl" readonly />
            <button id="copyButton">Copy</button>
          </div>

          <p>
            <a href="https://www.instantdb.com/docs/using-llms"
              >Learn more in the docs.</a
            >
          </p>

          <p>
            <a
              href="https://github.com/instantdb/instant/tree/main/client/packages/mcp"
              >View the code on GitHub.</a
            >
          </p>
        </div>

        <script>
          const copyButton = document.getElementById('copyButton');
          const mcpUrlInput = document.getElementById('mcpUrl');

          copyButton.addEventListener('click', () => {
            // Use the modern Navigator Clipboard API
            navigator.clipboard
              .writeText(mcpUrlInput.value)
              .then(() => {
                // Provide visual feedback to the user
                copyButton.textContent = 'Copied!';
                // Reset the button text after 2 seconds
                setTimeout(() => {
                  copyButton.textContent = 'Copy';
                }, 2000);
              })
              .catch((err) => {
                console.error('Failed to copy text: ', err);
              });
          });
        </script>
      </body>
    </html>`;
};

export default html;
