import React from 'react';
import Head from 'next/head';
import { init, Cursors } from '@instantdb/react';
import config from '../../config';

const db = init(config);
const room = db.room('main', '123');

function App() {
  return (
    <div>
      <Cursors room={room}>
        <Main />
      </Cursors>
    </div>
  );
}

function Main() {
  return (
    <div className="flex flex-col h-screen">
      <div className="flex flex-col flex-1 justify-center">
        <div className="flex flex-col items-center justify-center max-w-2xl mx-auto p-5 sm:p-10">
          <h1 className="text-black text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter text-center leading-none">
            Cursor Together
          </h1>
          <p className="text-black text-lg leading-relaxed text-center mt-6 max-w-md">
            Open this page in multiple tabs to see your cursor move in
            real-time!
          </p>
        </div>
      </div>
      <img
        className="w-full h-full absolute inset-0 -z-10"
        alt=""
        src="data:image/svg+xml,%3C%3Fxml%20version%3D%221.0%22%20encoding%3D%22UTF-8%22%3F%3E%0A%3Csvg%20width%3D%221000px%22%20height%3D%221000px%22%20viewBox%3D%220%200%201000%201000%22%20preserveAspectRatio%3D%22xMidYMid%20slice%22%20version%3D%221.1%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%20%20%3Cdefs%3E%0A%20%20%20%20%3CradialGradient%20id%3D%22rg0%22%20cx%3D%220.149%22%20cy%3D%220.124%22%20r%3D%221%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%23ede9fe%22%20stop-opacity%3D%221%22%20%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%2250%25%22%20stop-color%3D%22%23ede9fe%22%20stop-opacity%3D%220%22%20%2F%3E%0A%20%20%20%20%3C%2FradialGradient%3E%0A%20%20%20%20%3Cfilter%20id%3D%22f0%22%3E%0A%20%20%20%20%20%20%3CfeColorMatrix%20type%3D%22hueRotate%22%20values%3D%2260%22%20%2F%3E%0A%20%20%20%20%3C%2Ffilter%3E%0A%20%20%20%20%3CradialGradient%20id%3D%22rg1%22%20cx%3D%220.543%22%20cy%3D%220.31%22%20r%3D%221%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%23ede9fe%22%20stop-opacity%3D%221%22%20%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%2250%25%22%20stop-color%3D%22%23ede9fe%22%20stop-opacity%3D%220%22%20%2F%3E%0A%20%20%20%20%3C%2FradialGradient%3E%0A%20%20%20%20%3Cfilter%20id%3D%22f1%22%3E%0A%20%20%20%20%20%20%3CfeColorMatrix%20type%3D%22hueRotate%22%20values%3D%22-12%22%20%2F%3E%0A%20%20%20%20%3C%2Ffilter%3E%0A%20%20%20%20%3CradialGradient%20id%3D%22rg2%22%20cx%3D%220.787%22%20cy%3D%220.259%22%20r%3D%221%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%23ede9fe%22%20stop-opacity%3D%221%22%20%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%2250%25%22%20stop-color%3D%22%23ede9fe%22%20stop-opacity%3D%220%22%20%2F%3E%0A%20%20%20%20%3C%2FradialGradient%3E%0A%20%20%20%20%3Cfilter%20id%3D%22f2%22%3E%0A%20%20%20%20%20%20%3CfeColorMatrix%20type%3D%22hueRotate%22%20values%3D%2224%22%20%2F%3E%0A%20%20%20%20%3C%2Ffilter%3E%0A%20%20%20%20%3CradialGradient%20id%3D%22rg3%22%20cx%3D%220.171%22%20cy%3D%220.841%22%20r%3D%221%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%23ede9fe%22%20stop-opacity%3D%221%22%20%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%2250%25%22%20stop-color%3D%22%23ede9fe%22%20stop-opacity%3D%220%22%20%2F%3E%0A%20%20%20%20%3C%2FradialGradient%3E%0A%20%20%20%20%3Cfilter%20id%3D%22f3%22%3E%0A%20%20%20%20%20%20%3CfeColorMatrix%20type%3D%22hueRotate%22%20values%3D%2214%22%20%2F%3E%0A%20%20%20%20%3C%2Ffilter%3E%0A%20%20%20%20%3CradialGradient%20id%3D%22rg4%22%20cx%3D%220.551%22%20cy%3D%220.791%22%20r%3D%221%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22transparent%22%20stop-opacity%3D%221%22%20%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%2250%25%22%20stop-color%3D%22transparent%22%20stop-opacity%3D%220%22%20%2F%3E%0A%20%20%20%20%3C%2FradialGradient%3E%0A%20%20%20%20%3Cfilter%20id%3D%22f4%22%3E%0A%20%20%20%20%20%20%3CfeColorMatrix%20type%3D%22hueRotate%22%20values%3D%2218%22%20%2F%3E%0A%20%20%20%20%3C%2Ffilter%3E%0A%20%20%20%20%3CradialGradient%20id%3D%22rg5%22%20cx%3D%220.846%22%20cy%3D%220.796%22%20r%3D%221%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%23ede9fe%22%20stop-opacity%3D%221%22%20%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%2250%25%22%20stop-color%3D%22%23ede9fe%22%20stop-opacity%3D%220%22%20%2F%3E%0A%20%20%20%20%3C%2FradialGradient%3E%0A%20%20%20%20%3Cfilter%20id%3D%22f5%22%3E%0A%20%20%20%20%20%20%3CfeColorMatrix%20type%3D%22hueRotate%22%20values%3D%22-60%22%20%2F%3E%0A%20%20%20%20%3C%2Ffilter%3E%0A%20%20%20%20%3Cmask%20id%3D%22mask%22%3E%0A%20%20%20%20%20%20%3CradialGradient%20id%3D%22mask-gradient%22%20cx%3D%220.5%22%20cy%3D%220.5%22%20r%3D%220.5%22%3E%0A%20%20%20%20%20%20%20%20%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%23fff%22%20stop-opacity%3D%221%22%20%2F%3E%0A%20%20%20%20%20%20%20%20%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22%23fff%22%20stop-opacity%3D%220%22%20%2F%3E%0A%20%20%20%20%20%20%3C%2FradialGradient%3E%0A%20%20%20%20%20%20%3Cfilter%20id%3D%22zzbf0%22%20x%3D%22-0.4%22%20y%3D%22-0.4%22%20width%3D%221.8%22%20height%3D%221.8%22%20filterUnits%3D%22objectBoundingBox%22%3E%0A%20%20%20%20%20%20%20%20%3CfeGaussianBlur%20stdDeviation%3D%2240%22%20%2F%3E%0A%20%20%20%20%20%20%3C%2Ffilter%3E%0A%20%20%20%20%20%20%3Cpolygon%20fill%3D%22%23fff%22%20filter%3D%22url(%23zzbf0)%22%20points%3D%22500%2C-100%20329.13%2C130.331%20247.219%2C424.204%20-11.156%2C592.032%200%2C600%20106.374%2C323.601%20412.215%2C189.677%20445.652%2C-138.82%22%20%2F%3E%0A%20%20%20%20%20%20%3Crect%20fill%3D%22url(%23mask-gradient)%22%20x%3D%2240%25%22%20y%3D%2230%25%22%20width%3D%22100%25%22%20height%3D%22100%25%22%20%2F%3E%0A%20%20%20%20%3C%2Fmask%3E%0A%20%20%3C%2Fdefs%3E%0A%20%20%3Crect%20fill%3D%22transparent%22%20x%3D%220%25%22%20y%3D%220%25%22%20width%3D%22100%25%22%20height%3D%22100%25%22%20%2F%3E%0A%20%20%3Crect%20fill%3D%22url(%23rg0)%22%20filter%3D%22url(%23f0)%22%20mask%3D%22url(%23mask)%22%20x%3D%220%25%22%20y%3D%220%25%22%20width%3D%22100%25%22%20height%3D%22100%25%22%20%2F%3E%0A%20%20%3Crect%20fill%3D%22url(%23rg1)%22%20filter%3D%22url(%23f1)%22%20mask%3D%22url(%23mask)%22%20x%3D%220%25%22%20y%3D%220%25%22%20width%3D%22100%25%22%20height%3D%22100%25%22%20%2F%3E%0A%20%20%3Crect%20fill%3D%22url(%23rg2)%22%20filter%3D%22url(%23f2)%22%20mask%3D%22url(%23mask)%22%20x%3D%220%25%22%20y%3D%220%25%22%20width%3D%22100%25%22%20height%3D%22100%25%22%20%2F%3E%0A%20%20%3Crect%20fill%3D%22url(%23rg3)%22%20filter%3D%22url(%23f3)%22%20mask%3D%22url(%23mask)%22%20x%3D%220%25%22%20y%3D%220%25%22%20width%3D%22100%25%22%20height%3D%22100%25%22%20%2F%3E%0A%20%20%3Crect%20fill%3D%22url(%23rg4)%22%20filter%3D%22url(%23f4)%22%20mask%3D%22url(%23mask)%22%20x%3D%220%25%22%20y%3D%220%25%22%20width%3D%22100%25%22%20height%3D%22100%25%22%20%2F%3E%0A%20%20%3Crect%20fill%3D%22url(%23rg5)%22%20filter%3D%22url(%23f5)%22%20mask%3D%22url(%23mask)%22%20x%3D%220%25%22%20y%3D%220%25%22%20width%3D%22100%25%22%20height%3D%22100%25%22%20%2F%3E%0A%3C%2Fsvg%3E"
      />
    </div>
  );
}

function Page() {
  return (
    <div>
      <Head>
        <title>Instant Example App: Cursors</title>
        <meta
          name="description"
          content="Relational Database, on the client."
        />
      </Head>
      <App />
    </div>
  );
}

export default Page;
