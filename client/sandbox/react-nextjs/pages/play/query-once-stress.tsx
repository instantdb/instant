import { useEffect, useRef, useState } from "react";
import { init } from "@instantdb/react";
import { instantDebugger } from "../../lib/instantDebugger";

const rate = 80;

const db = init({ appId: "16982b82-9572-4906-9034-734cb02316a2" });

instantDebugger(db);

type QueryOnceCallRecord = {
  id: string;
  doneAt: number | null;
  status: string;
  reactorStateAtCallTime: any;
  sent?: boolean;
  confirmed?: boolean;
};

export default function QueryOnceStress() {
  const elRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef(() => {});
  const recordsRef = useRef<QueryOnceCallRecord[]>([]);

  function main() {
    function update() {
      // s = s.filter((o) => o.doneAt == null || Date.now() - o.doneAt < 1000);
      if (!elRef.current) return;
      elRef.current.innerHTML = recordsRef.current
        .map((o) => {
          const m =
            o.status === "problem"
              ? "🚨"
              : o.status === "timeout"
                ? "⏰"
                : o.status === "pending"
                  ? "⏳"
                  : o.status === "offline"
                    ? "🔌"
                    : o.status === "resolved"
                      ? "🆗"
                      : "?";

          return (
            `<pre>` +
            `${o.id} ${m} ${o.status.padEnd(8)} ` +
            ` • ` +
            `${o.sent ? "✅" : "❌"} sent` +
            ` • ` +
            `${o.confirmed ? "✅" : "❌"} confirmed` +
            `</pre>`
          );
        })
        .join("");
    }

    const t = setInterval(() => {
      const id = Date.now().toString();

      const o: QueryOnceCallRecord = {
        id,
        doneAt: null,
        reactorStateAtCallTime: reactorState(),
        status: "pending",
      };
      recordsRef.current.push(o);
      update();

      const p = db.queryOnce({
        s: {
          $: {
            where: {
              x: id,
            },
          },
        },
      });

      p.then(
        (r) => {
          // @ts-expect-error
          Object.assign(o, r.__debug);

          o.status = "resolved";
          o.doneAt = Date.now();
          update();
        },
        (e) => {
          Object.assign(o, e?.__debug ?? {});

          // const isLive =
          //   db._core._reactor._isOnline &&
          //   db._core._reactor.status === "authenticated";

          if (e.message.startsWith("Offline")) {
            o.status = "offline";
            o.doneAt = Date.now();
            update();
          } else if (e.message.startsWith("Query timed out")) {
            o.status = "timeout";
            o.doneAt = Date.now();
            update();
          }
        },
      );
    }, rate);

    function stop() {
      stopRef.current = () => {};
      clearInterval(t);
    }

    stopRef.current = stop;

    return stop;
  }

  useEffect(() => {
    return main();
  }, []);

  return (
    <div className="flex flex-col text-xs p-4 gap-2">
      <div className="flex gap-2">
        <button
          className="bg-blue-500 p-2 text-white"
          onClick={() => {
            stopRef.current();
            main();
          }}
        >
          Start
        </button>
        <button
          className="bg-red-500 p-2 text-white"
          onClick={() => {
            stopRef.current();
          }}
        >
          Stop
        </button>
        <button
          className="bg-gray-500 p-2 text-white"
          onClick={() => {
            db._core._reactor.__simulateOnline(false);
          }}
        >
          Offline
        </button>
        <button
          className="bg-green-500 p-2 text-white"
          onClick={() => {
            db._core._reactor.__simulateOnline(true);
          }}
        >
          Online
        </button>
      </div>
      <div
        className="font-mono gap-2 flex justify-end flex-col-reverse"
        ref={elRef}
      />
    </div>
  );
}

function reactorState() {
  const {
    //
    _isManualClose,
    _isOnline,
    status,
    _isShutdown,
    _errorMessage,
  } = db._core._reactor;

  return {
    //
    _isManualClose,
    _isOnline,
    status,
    _isShutdown,
    _errorMessage,
  };
}
