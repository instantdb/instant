import React, { useEffect } from "react";
import Head from "next/head";
import { Cursors, init } from "@instantdb/react";
import config from "../../config";

const DemoFlags = {
  cursor: false,
  autoBroadcast: false,
  autoActive: false,
};

const roomId = "demo-8";

const name = `user ${Date.now()}`;

const db = init<
  {},
  {
    "demo-room": {
      presence: {
        test: number;
        name: string;
        cursor?: { x: number; y: number };
      };
      topics: {
        testTopic: { test: number };
      };
    };
    "demo-room-2": {
      presence: {
        test: number;
      };
    };
  }
>(config);

const room = db.room("demo-room", roomId);
const {
  usePresence,
  useSyncPresence,
  useTopicEffect,
  usePublishTopic,
  useTypingIndicator,
} = room;

function Demo() {
  useSyncPresence({
    name,
  });

  useTopicEffect("testTopic", (event, peer) => {
    console.log("useTopicEffect", event, peer);
  });

  const publishTopic = usePublishTopic("testTopic");

  const presence = usePresence({
    keys: DemoFlags.cursor ? ["test", "cursor"] : ["test"],
  });

  const inputIndicator = useTypingIndicator("input");
  const textareaIndicator = useTypingIndicator("textarea");

  useEffect(() => {
    presence.publishPresence({ test: Date.now() });
  }, []);

  useInterval(() => {
    if (DemoFlags.autoBroadcast) {
      publishTopic({ test: Math.random() });
    }

    if (DemoFlags.autoActive) {
      inputIndicator.setActive(Math.random() > 0.5);
    }
  }, 3_000);

  const renderCount = useRenderCounter();

  const [showNested, setShowNested] = React.useState(false);

  // START TYPE TESTS
  presence.user?.test;
  // @ts-expect-error
  presence.user?.__notInSchema;

  inputIndicator.active[0]?.test;
  // @ts-expect-error
  inputIndicator.active[0]?.input;
  // @ts-expect-error
  inputIndicator.active[0]?.__notInSchema;

  useEffect(() => {
    const user = db._core._reactor.getPresence("demo-room", roomId, {
      keys: ["test"],
    }).user;

    user?.test;
    // @ts-expect-error
    user?.__notInSchema;

    const coreRoom = db._core.joinRoom("demo-room", roomId);

    coreRoom.subscribePresence({ keys: ["test"] }, (data) => {
      data.user?.test;
      // @ts-expect-error
      data.user?.__notInSchema;
    });

    return coreRoom.leaveRoom;
  }, []);
  // END TYPE TESTS

  return (
    <div className="flex items-center">
      <Cursors
        room={room}
        className="h-32 w-32 border overflow-hidden inline-block"
      />
      <Cursors
        room={room}
        spaceId="space-2"
        userCursorColor="purple"
        className="h-32 w-32 border overflow-hidden inline-block"
      />
      <Cursors
        room={room}
        spaceId="space-3"
        userCursorColor="dodgerblue"
        className="h-64 w-64 pt-16 pl-16 border overflow-hidden"
      >
        <Cursors
          room={room}
          spaceId="space-4"
          userCursorColor="orange"
          className="h-32 w-32 border overflow-hidden inline-block"
        />
      </Cursors>
      <div
        className="flex flex-col gap-2 p-4"
        onMouseMove={(e) => {
          if (!DemoFlags.cursor) return;
          const x = e.clientX;
          const y = e.clientY;
          presence.publishPresence({ cursor: { x, y } });
        }}
      >
        <Data
          value={{
            renderCount,
            presence,
            "inputIndicator.active": inputIndicator.active,
            "textareaIndicator.active": textareaIndicator.active,
          }}
        />
        <input className="p-0.5 text-sm" {...inputIndicator.inputProps} />
        <textarea className="p-0.5 text-sm" {...textareaIndicator.inputProps} />
        <button
          className="bg-blue-500 p-1 text-white rounded"
          onClick={() => {
            setShowNested((_) => !_);
          }}
        >
          Toggle nested
        </button>
        {showNested && <Nested />}
      </div>
    </div>
  );
}

function Nested() {
  const presence = db.room("demo-room-2", "demo-room-2").usePresence({
    keys: ["test"],
  });

  presence.user?.test;
  // @ts-expect-error
  presence.user?.other;

  return (
    <div>
      <Data value={presence} />
    </div>
  );
}

function Data({ value }: { value: any }) {
  return (
    <pre className="overflow-scroll p-3 text-xs flex-1">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Page() {
  return (
    <div>
      <Head>
        <title>Instant Example App: TS</title>
        <meta
          name="description"
          content="Relational Database, on the client."
        />
      </Head>
      <Demo />
    </div>
  );
}

function useInterval(callback: () => void, delay: number) {
  useEffect(() => {
    const id = setInterval(callback, delay);
    return () => clearInterval(id);
  }, []);
}

function useRenderCounter() {
  const renderCounterRef = React.useRef(0);

  useEffect(() => {
    renderCounterRef.current++;
  });

  return renderCounterRef.current;
}

export default Page;
