<script
  setup
  lang="ts"
  generic="RoomSchema extends RoomSchemaShape, RoomType extends string & keyof RoomSchema"
>
import { computed, toValue } from 'vue';
import type { RoomSchemaShape } from '@instantdb/core';
import { usePresence } from '../InstantVueRoom.js';
import type { InstantVueRoom } from '../InstantVueRoom.js';
import Cursor from './Cursor.vue';

type CursorPresence = {
  x: number;
  y: number;
  xPercent: number;
  yPercent: number;
  color?: string;
};

const props = withDefaults(
  defineProps<{
    room: InstantVueRoom<any, RoomSchema, RoomType>;
    spaceId?: string;
    as?: string;
    userCursorColor?: string;
    propagate?: boolean;
    zIndex?: number;
  }>(),
  {
    as: 'div',
    propagate: false,
    zIndex: 99999,
  },
);

const spaceId = computed(
  () =>
    props.spaceId ||
    `cursors-space-default--${String(toValue(props.room.type))}-${toValue(props.room.id)}`,
);

const { peers, publishPresence } = usePresence(props.room, {
  keys: [spaceId.value] as (keyof RoomSchema[RoomType]['presence'])[],
});

const fullPresence = computed(() => {
  // Track peers so the snapshot refreshes when presence changes.
  peers.value;
  return props.room.core._reactor.getPresence(
    toValue(props.room.type),
    toValue(props.room.id),
  );
});

const cursorPeers = computed(() => {
  const sid = spaceId.value;
  return Object.entries(peers.value || {}).flatMap(([peerId, p]) => {
    const cursor = (p as any)?.[sid] as CursorPresence | undefined;
    return cursor ? [{ peerId, cursor }] : [];
  });
});

function publishCursor(
  rect: DOMRect,
  touch: { clientX: number; clientY: number },
) {
  const x = touch.clientX;
  const y = touch.clientY;
  const xPercent = ((x - rect.left) / rect.width) * 100;
  const yPercent = ((y - rect.top) / rect.height) * 100;
  publishPresence({
    [spaceId.value]: {
      x,
      y,
      xPercent,
      yPercent,
      color: props.userCursorColor,
    },
  } as RoomSchema[RoomType]['presence']);
}

function onMouseMove(e: MouseEvent) {
  if (!props.propagate) e.stopPropagation();
  const rect = (e.currentTarget as Element).getBoundingClientRect();
  publishCursor(rect, e);
}

function clearCursor() {
  publishPresence({
    [spaceId.value]: undefined,
  } as RoomSchema[RoomType]['presence']);
}

function onTouchMove(e: TouchEvent) {
  if (e.touches.length !== 1) return;
  const touch = e.touches[0];
  if (!touch || !(touch.target instanceof Element)) return;
  if (!props.propagate) e.stopPropagation();
  const rect = touch.target.getBoundingClientRect();
  publishCursor(rect, touch);
}
</script>

<template>
  <component
    :is="as"
    :style="{ position: 'relative' }"
    @mousemove="onMouseMove"
    @mouseout="clearCursor"
    @blur="clearCursor"
    @touchmove="onTouchMove"
    @touchend="clearCursor"
  >
    <slot />
    <div
      :style="{
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex,
      }"
    >
      <div
        v-for="{ peerId, cursor } in cursorPeers"
        :key="peerId"
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          transform: `translate(${cursor.xPercent}%, ${cursor.yPercent}%)`,
          transformOrigin: '0 0',
          transition: 'transform 100ms',
        }"
      >
        <slot
          name="cursor"
          :color="cursor.color"
          :presence="fullPresence?.peers[peerId]"
        >
          <Cursor :color="cursor.color ?? ''" />
        </slot>
      </div>
    </div>
  </component>
</template>
