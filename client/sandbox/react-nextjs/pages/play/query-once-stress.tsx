import { useEffect, useRef, useState } from "react";
import { init } from "@instantdb/react";

const rate = 80;

const db = init({ appId: "16982b82-9572-4906-9034-734cb02316a2" });

type QueryOnceCallRecord = {
  id: string;
  doneAt: number | null;
  status: string;
  reactorStateAtCallTime: any;
};

export default function QueryOnceStress() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let s: QueryOnceCallRecord[] = [];

    function update() {
      // s = s.filter((o) => o.doneAt == null || Date.now() - o.doneAt < 1000);
      if (!ref.current) return;
      ref.current.innerHTML = s
        .map((o) => {
          const m =
            o.status === "boom!"
              ? "🚨"
              : o.status === "timeout"
                ? "⏰"
                : o.status === "pending"
                  ? "⏳"
                  : o.status === "offline"
                    ? "🔌"
                    : o.status === "resolved"
                      ? "✅"
                      : "?";

          return `<div>${m} ${o.id}: ${o.status}</div>`;
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
      s.push(o);
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
          o.status = "resolved";
          o.doneAt = Date.now();
          update();
        },
        (e) => {
          const isLive =
            db._core._reactor._isOnline &&
            db._core._reactor.status === "authenticated";

          if (e.message.startsWith("Offline")) {
            o.status = "offline";
            o.doneAt = Date.now();
            update();
          } else if (!isLive && e.message.startsWith("Query timed out")) {
            o.status = "timeout";
            o.doneAt = Date.now();
          } else {
            o.status = "boom!";
            update();
            console.error(e, o.reactorStateAtCallTime, reactorState());

            debugger;
            clearInterval(t);
          }
        },
      );
    }, rate);

    return () => {
      clearInterval(t);
    };
  });

  return (
    <div
      className="text-xs font-mono p-4 gap-2 flex flex-col-reverse"
      ref={ref}
    ></div>
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
