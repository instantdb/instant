import {
  createElement,
  type ReactNode,
  type MouseEvent,
  type TouchEvent,
  type CSSProperties,
} from 'react';
import { type InstantReactRoom } from '@instantdb/react-common';
import type { RoomSchemaShape } from '@instantdb/core';

export function Cursors<
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
>({
  as = 'div',
  spaceId: _spaceId,
  room,
  className,
  style,
  userCursorColor,
  children,
  renderCursor,
  propagate,
  zIndex,
}: {
  spaceId?: string;
  room: InstantReactRoom<any, RoomSchema, RoomType>;
  style?: React.CSSProperties;
  userCursorColor?: string;
  as?: any;
  className?: string;
  children?: ReactNode;
  renderCursor?: (props: {
    color: string;
    presence: RoomSchema[RoomType]['presence'];
  }) => ReactNode;
  propagate?: boolean;
  zIndex?: number;
}) {
  const spaceId =
    _spaceId || `cursors-space-default--${String(room.type)}-${room.id}`;

  const cursorsPresence = room.usePresence({
    keys: [spaceId] as (keyof RoomSchema[RoomType]['presence'])[],
  });

  const fullPresence = room._core._reactor.getPresence(room.type, room.id);

  function publishCursor(
    rect: DOMRect,
    touch: { clientX: number; clientY: number },
  ) {
    const x = touch.clientX;
    const y = touch.clientY;
    const xPercent = ((x - rect.left) / rect.width) * 100;
    const yPercent = ((y - rect.top) / rect.height) * 100;
    cursorsPresence.publishPresence({
      [spaceId]: {
        x,
        y,
        xPercent,
        yPercent,
        color: userCursorColor,
      },
    } as RoomSchema[RoomType]['presence']);
  }

  function onMouseMove(e: MouseEvent) {
    if (!propagate) {
      e.stopPropagation();
    }

    const rect = e.currentTarget.getBoundingClientRect();
    publishCursor(rect, e);
  }

  function onMouseOut(e: MouseEvent) {
    cursorsPresence.publishPresence({
      [spaceId]: undefined,
    } as RoomSchema[RoomType]['presence']);
  }

  function onTouchMove(e: TouchEvent) {
    if (e.touches.length !== 1) {
      return;
    }

    const touch = e.touches[0];

    if (touch.target instanceof Element) {
      if (!propagate) {
        e.stopPropagation();
      }
      const rect = touch.target.getBoundingClientRect();
      publishCursor(rect, touch);
    }
  }

  function onTouchEnd(e: TouchEvent) {
    cursorsPresence.publishPresence({
      [spaceId]: undefined,
    } as RoomSchema[RoomType]['presence']);
  }

  return createElement(
    as,
    {
      onMouseMove,
      onMouseOut,
      onTouchMove,
      onTouchEnd,
      className,
      style: {
        position: 'relative',
        ...style,
      },
    },
    [
      children,
      <div
        key={spaceId}
        style={{
          ...absStyles,
          ...inertStyles,
          zIndex: zIndex !== undefined ? zIndex : defaultZ,
        }}
      >
        {Object.entries(cursorsPresence.peers).map(([id, presence]) => {
          const cursor = presence[spaceId];
          if (!cursor) return null;

          return (
            <div
              key={id}
              style={{
                ...absStyles,
                transform: `translate(${cursor.xPercent}%, ${cursor.yPercent}%)`,
                transformOrigin: '0 0',
                transition: 'transform 100ms',
              }}
            >
              {renderCursor ? (
                renderCursor({
                  color: cursor.color,
                  presence: fullPresence?.peers[id],
                })
              ) : (
                <Cursor {...cursor} />
              )}
            </div>
          );
        })}
      </div>,
    ],
  );
}

function Cursor({ color }: { color: string }) {
  const size = 35;
  const fill = color || 'black';

  return (
    <svg
      style={{ height: size, width: size }}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g
        fill="rgba(0,0,0,.2)"
        transform="matrix(1, 0, 0, 1, -11.999999046325684, -8.406899452209473)"
      >
        <path d="m12 24.4219v-16.015l11.591 11.619h-6.781l-.411.124z" />
        <path d="m21.0845 25.0962-3.605 1.535-4.682-11.089 3.686-1.553z" />
      </g>
      <g
        fill="white"
        transform="matrix(1, 0, 0, 1, -11.999999046325684, -8.406899452209473)"
      >
        <path d="m12 24.4219v-16.015l11.591 11.619h-6.781l-.411.124z" />
        <path d="m21.0845 25.0962-3.605 1.535-4.682-11.089 3.686-1.553z" />
      </g>
      <g
        fill={fill}
        transform="matrix(1, 0, 0, 1, -11.999999046325684, -8.406899452209473)"
      >
        <path d="m19.751 24.4155-1.844.774-3.1-7.374 1.841-.775z" />
        <path d="m13 10.814v11.188l2.969-2.866.428-.139h4.768z" />
      </g>
    </svg>
  );
}

const absStyles: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  bottom: 0,
  right: 0,
};

const inertStyles: CSSProperties = {
  overflow: 'hidden',
  pointerEvents: 'none',
  userSelect: 'none',
};

const defaultZ = 99999;
