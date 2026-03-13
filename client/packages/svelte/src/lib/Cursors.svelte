<script lang="ts" generics="RoomSchema extends RoomSchemaShape, RoomType extends string & keyof RoomSchema">
  import type { RoomSchemaShape } from '@instantdb/core';
  import type { InstantSvelteRoom } from './InstantSvelteRoom.svelte.js';
  import { usePresence } from './InstantSvelteRoom.svelte.js';
  import type { Snippet } from 'svelte';

  let {
    room,
    spaceId: _spaceId,
    as = 'div',
    className,
    style,
    userCursorColor,
    children,
    renderCursor,
    propagate,
    zIndex,
  }: {
    room: InstantSvelteRoom<any, RoomSchema, RoomType>;
    spaceId?: string;
    as?: string;
    className?: string;
    style?: string;
    userCursorColor?: string;
    children?: Snippet;
    renderCursor?: Snippet<[{ color: string; presence: RoomSchema[RoomType]['presence'] }]>;
    propagate?: boolean;
    zIndex?: number;
  } = $props();

  // svelte-ignore state_referenced_locally
  const spaceId = _spaceId || `cursors-space-default--${String(room.type)}-${room.id}`;

  // svelte-ignore state_referenced_locally
  const cursorsPresence = usePresence(room, {
    keys: [spaceId] as (keyof RoomSchema[RoomType]['presence'])[],
  });

  function publishCursor(rect: DOMRect, touch: { clientX: number; clientY: number }) {
    const x = touch.clientX;
    const y = touch.clientY;
    const xPercent = ((x - rect.left) / rect.width) * 100;
    const yPercent = ((y - rect.top) / rect.height) * 100;
    cursorsPresence.publishPresence({
      [spaceId]: { x, y, xPercent, yPercent, color: userCursorColor },
    } as RoomSchema[RoomType]['presence']);
  }

  function onMouseMove(e: MouseEvent) {
    if (!propagate) {
      e.stopPropagation();
    }
    const rect = (e.currentTarget as Element).getBoundingClientRect();
    publishCursor(rect, e);
  }

  function onMouseOut() {
    cursorsPresence.publishPresence({
      [spaceId]: undefined,
    } as RoomSchema[RoomType]['presence']);
  }

  function onTouchMove(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    if (touch.target instanceof Element) {
      if (!propagate) {
        e.stopPropagation();
      }
      const rect = touch.target.getBoundingClientRect();
      publishCursor(rect, touch);
    }
  }

  function onTouchEnd() {
    cursorsPresence.publishPresence({
      [spaceId]: undefined,
    } as RoomSchema[RoomType]['presence']);
  }

  const defaultZ = 99999;

  const peers = $derived(Object.entries(cursorsPresence.peers));
  const fullPresence = $derived(
    room.core._reactor.getPresence(room.type, room.id),
  );
</script>

<!-- svelte-ignore a11y_no_static_element_interactions a11y_mouse_events_have_key_events -->
<svelte:element
  this={as}
  class={className}
  style="position: relative; {style ?? ''}"
  onmousemove={onMouseMove}
  onmouseout={onMouseOut}
  ontouchmove={onTouchMove}
  ontouchend={onTouchEnd}
>
  {#if children}
    {@render children()}
  {/if}
  <div
    style="position: absolute; top: 0; left: 0; bottom: 0; right: 0; overflow: hidden; pointer-events: none; user-select: none; z-index: {zIndex ?? defaultZ};"
  >
    {#each peers as [peerId, presence] (peerId)}
      {@const cursor = presence[spaceId]}
      {#if cursor}
        <div
          style="position: absolute; top: 0; left: 0; bottom: 0; right: 0; transform: translate({cursor.xPercent}%, {cursor.yPercent}%); transform-origin: 0 0; transition: transform 100ms;"
        >
          {#if renderCursor}
            {@render renderCursor({
              color: cursor.color,
              presence: fullPresence?.peers[peerId],
            })}
          {:else}
            {@const fill = cursor.color || 'black'}
            <svg
              style="height: 35px; width: 35px;"
              viewBox="0 0 35 35"
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
          {/if}
        </div>
      {/if}
    {/each}
  </div>
</svelte:element>
