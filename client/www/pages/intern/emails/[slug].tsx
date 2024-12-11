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
      <style>{`
    .email-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 80px 10px;
    }
    `}
      </style>
    </>
  );
}


const HTMLView = ({ htmlBody }: { htmlBody: String }) => {
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
        <div className="content desktop-padding" dangerouslySetInnerHTML={{ __html: htmlBody }}></div>
      </div>
      <style>{`
   body, html {
      margin: 0;
      padding: 0;
      height: 100%;
      font: 16px/1.5 sans-serif;
      word-wrap: break-word;
    }

    .email-container {
      width: 100%;
      max-width: 800px;
      margin: 0 auto;
    }

    .content {
      padding: 40px 30px;
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

const Email = ({ htmlBody, textBody }: { htmlBody: string, textBody: string }) => {
  const [viewMode, setViewMode] = useState('html');

  const toggleViewMode = () => {
    setViewMode(viewMode === 'text' ? 'html' : 'text');
  };

  return (
    <>
      <Head>
        <title>Instant Email Previewer</title>
        <meta name="description" content="Relational Database, on the client." />
      </Head>

      {!htmlBody && <h1>Could not find html for this page, check the `_emails` folder!</h1>}
      {htmlBody && (
        <div className="email-wrapper">
          {textBody && (
            <button
              className="view-toggle-button"
              onClick={toggleViewMode}
            >
              Switch to {viewMode === 'text' ? 'HTML' : 'Text'} View
            </button>
          )}

          {viewMode === 'text' && textBody ? (
            <TextView textBody={textBody} />
          ) : (
            <HTMLView htmlBody={htmlBody} />
          )}

          <style jsx global>{`
            .email-wrapper {
              position: relative;
              width: 100%;
              max-width: 800px;
              margin: 0 auto;
            }
            .view-toggle-button {
              position: fixed;
              top: 20px;
              right: 20px;
              z-index: 1000;
              padding: 5px 10px;
              background-color: #ff6000;
              color: white;
              border: none;
              border-radius: 5px;
              cursor: pointer;
              font-size: 16px;
              transition: background-color 0.3s;
            }
            .view-toggle-button:hover {
              background-color: #e55a2b;
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
