import { useState } from 'react';
import Head from 'next/head';
import { getAllSlugs, getHTML, getText } from '../../../lib/emails';

const TextView = ({ textBody }: { textBody: string }) => {
  return (
    <>
      <Head>
        <title>Instant Email Previewer</title>
        <meta
          name="description"
          content="Relational Database, on the client."
        />
      </Head>
      <div className="email-container">
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {textBody}
        </pre>
      </div>
      <style>
        {`
    .email-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 80px 10px;
    }
    `}
      </style>
    </>
  );
};

function isPreview() {
  if (typeof window !== 'undefined') {
    const host = window.location.host;
    return !host.startsWith('localhost');
  }
}

function isProd() {
  if (typeof window !== 'undefined') {
    const host = window.location.host;
    return host === 'www.instantdb.com';
  }
}

function getImgReplaceUrl() {
  let replaceUrl = 'http://localhost:3000/img/emails';
  if (typeof window !== 'undefined') {
    const host = window.location.host;
    if (!host.startsWith('localhost')) {
      replaceUrl = `https://${host}/img/emails`;
    }
  }
  return replaceUrl;
}

const HTMLView = ({
  htmlBody,
  useLocalImages,
}: {
  htmlBody: String;
  useLocalImages: Boolean;
}) => {
  const replaceUrl = getImgReplaceUrl();
  const body = useLocalImages
    ? htmlBody.replaceAll('https://www.instantdb.com/img/emails', replaceUrl)
    : htmlBody;
  return (
    <>
      <Head>
        <title>Instant Email Previewer</title>
        <meta
          name="description"
          content="Relational Database, on the client."
        />
      </Head>
      <div className="email-container">
        {useLocalImages ? (
          <div className="warning">
            WARNING: Using {isPreview() ? 'preview' : 'local'} images, push
            images to production before sending.
          </div>
        ) : null}
        <div
          className="content desktop-padding"
          dangerouslySetInnerHTML={{ __html: body }}
        ></div>
      </div>
      <style>{`
    body, html {
      margin: 0;
      padding: 0;
      height: 100%;
      font: 16px/1.5 sans-serif;
      word-wrap: break-word;
    }

    .warning {
      margin-top: 70px;
      margin-bottom: -70px;
      width: 100%;
      text-align: center;
      color: red;
    }

    .email-container {
      width: 100%;
      max-width: 800px;
      margin: 0 auto;
    }

    .content {
      padding: 80px 30px;
    }

    img {
      max-width: 100%;
      display: block;
      margin: 0 auto;
    }

    p {
      margin: 1em 0;
      line-height: 1.5;
    }

    p code {
      background-color: #eee;
      padding: 0.05em 0.2em;
      border: 1px solid #ccc;
    }

    a {
      color: #ff6000;
      text-decoration: none;
    }

    a:hover, a:focus, a:active {
      text-decoration: underline;
    }
      `}</style>
    </>
  );
};

const Email = ({
  htmlBody,
  textBody,
}: {
  htmlBody: string;
  textBody: string;
}) => {
  const [viewMode, setViewMode] = useState('html');
  const [useLocalImages, setUseLocalImages] = useState(!isProd());

  const toggleViewMode = () => {
    setViewMode(viewMode === 'text' ? 'html' : 'text');
  };

  const toggleLocalImages = () => {
    setUseLocalImages(!useLocalImages);
  };

  return (
    <>
      <Head>
        <title>Instant Email Previewer</title>
        <meta
          name="description"
          content="Relational Database, on the client."
        />
      </Head>

      {!htmlBody && (
        <h1>Could not find html for this page, check the `_emails` folder!</h1>
      )}
      {htmlBody && (
        <div className="email-wrapper">
          <div className="actions">
            <div>
              {isProd() ? null : (
                <button className="button" onClick={toggleLocalImages}>
                  Switch to{' '}
                  {useLocalImages
                    ? 'prod'
                    : isPreview()
                      ? 'preview'
                      : 'localhost'}{' '}
                  images
                </button>
              )}
              {textBody && (
                <button className="button" onClick={toggleViewMode}>
                  Switch to {viewMode === 'text' ? 'HTML' : 'Text'} View
                </button>
              )}
            </div>
          </div>

          {viewMode === 'text' && textBody ? (
            <TextView textBody={textBody} />
          ) : (
            <HTMLView htmlBody={htmlBody} useLocalImages={useLocalImages} />
          )}

          <style jsx global>{`
            .email-wrapper {
              position: relative;
              width: 100%;
              max-width: 800px;
              margin: 0 auto;
            }
            .actions {
              position: fixed;
              top: 20px;
              right: 20px;
              z-index: 1000;
            }
            .button {
              padding: 5px 10px;
              margin: 5px;
              background-color: #ff6000;
              color: white;
              border: none;
              border-radius: 5px;
              cursor: pointer;
              font-size: 16px;
              transition: background-color 0.3s;
            }
            .button:hover {
              background-color: #e55a2b;
            }
            /* Ensure bullet points render properly */
            ul {
              padding-left: 20px; /* Add left padding for indentation */
              list-style-type: disc; /* Ensure bullets are shown */
            }
            ol {
              padding-left: 20px; /* Add left padding for ordered lists */
              list-style-type: decimal; /* Ensure numbers are shown */
            }
          `}</style>
        </div>
      )}
    </>
  );
};

export async function getStaticPaths() {
  return {
    paths: getAllSlugs().map((slug) => `/intern/emails/${slug}`),
    fallback: false,
  };
}

export async function getStaticProps({
  params: { slug },
}: {
  params: { slug: string };
}) {
  return {
    props: {
      htmlBody: getHTML(slug),
      textBody: getText(slug),
    },
  };
}

export default Email;
