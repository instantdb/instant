import { init } from '@instantdb/react';
import React, { useCallback, useEffect, useRef, useState, FC } from 'react';
import config from '../../config';

const db = init({ ...config });

type Point = { x: number; y: number };
type Dimension = Point & { width: number; height: number };

const pointsToDimension = (p1: Point, p2: Point): Dimension => {
  const left = Math.min(p1.x, p2.x);
  const right = Math.max(p1.x, p2.x);
  const top = Math.min(p1.y, p2.y);
  const bottom = Math.max(p1.y, p2.y);
  return { x: left, y: top, width: right - left, height: bottom - top };
};

const isIntersecting = (rectA: Dimension, rectB: Dimension): boolean => {
  return !(
    rectB.x > rectA.x + rectA.width ||
    rectB.x + rectB.width < rectA.x ||
    rectB.y > rectA.y + rectA.height ||
    rectB.y + rectB.height < rectA.y
  );
};

const stringToHslColor = (
  str: string | undefined,
  saturation: number = 85,
  lightness: number = 68,
): string => {
  if (!str) return `hsl(0, ${saturation}%, ${lightness}%)`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

const SelectionArea: FC<{ area: Dimension | null; color?: string }> = ({
  area,
  color = '#2972f6',
}) => {
  if (!area) return null;
  return (
    <div
      data-testid="selectionArea"
      className="absolute rounded z-[1000]"
      style={{
        transform: `matrix(1, 0, 0, 1, ${area.x}, ${area.y})`,
        width: area.width,
        height: area.height,
        backgroundColor: color,
        opacity: 0.2,
      }}
    />
  );
};

const useSelectionArea = (
  canvasRef: React.RefObject<HTMLDivElement>,
): Dimension | null => {
  const [selectionArea, setSelectionArea] = useState<Dimension | null>(null);
  const selectionStateStart = useRef<Point | null>(null);

  const handlePointerDown = useCallback(
    (event: PointerEvent) => {
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      const point = {
        x: event.clientX - (canvasRect?.x ?? 0),
        y: event.clientY - (canvasRect?.y ?? 0),
      };
      selectionStateStart.current = point;
    },
    [canvasRef],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const startPoint = selectionStateStart.current;
      if (!startPoint) return;
      event.stopPropagation();
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      const point = {
        x: event.clientX - (canvasRect?.x ?? 0),
        y: event.clientY - (canvasRect?.y ?? 0),
      };
      setSelectionArea(pointsToDimension(startPoint, point));
    },
    [canvasRef],
  );

  const handlePointerUp = useCallback(() => {
    selectionStateStart.current = null;
    setSelectionArea(null);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const opt = { passive: true };
    canvas.addEventListener('pointerdown', handlePointerDown, opt);
    canvas.addEventListener('pointermove', handlePointerMove, opt);
    canvas.addEventListener('pointerup', handlePointerUp, opt);
    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
    };
  }, [canvasRef, handlePointerDown, handlePointerMove, handlePointerUp]);

  return selectionArea;
};

const stickers: (Dimension & { id: string })[] = Array(36)
  .fill(0)
  .map((_, index) => ({
    id: `sticker-${index}`,
    x: 10 + 87 * (index % 6),
    y: 10 + 87 * Math.floor(index / 6),
    width: 50,
    height: 50,
  }));

const Canvas: FC = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const selectionArea = useSelectionArea(canvasRef);

  const [selectedStickerIds, setSelectedStickerIds] = useState<Set<string>>(
    new Set(),
  );
  const [remoteSelectedStickerIds, setRemoteSelectedStickerIds] = useState<
    Set<string>
  >(new Set());

  // Set up InstantDB room and presence (using the "canvas" room with a fake id)
  const room = db.room('canvas', 'fake-id');
  const { isLoading, publishPresence, user, peers } =
    db.rooms.usePresence(room);

  // Update local sticker selection based on the drawn selection area
  useEffect(() => {
    if (selectionArea) {
      const newSelectedStickerIds = new Set<string>();
      stickers.forEach((sticker) => {
        if (isIntersecting(selectionArea, sticker)) {
          newSelectedStickerIds.add(sticker.id);
        }
      });
      setSelectedStickerIds((prev) => {
        const hasAdded = Array.from(newSelectedStickerIds).some(
          (id) => !prev.has(id),
        );
        const hasRemoved = Array.from(prev).some(
          (id) => !newSelectedStickerIds.has(id),
        );
        return hasAdded || hasRemoved ? newSelectedStickerIds : prev;
      });
    }
  }, [selectionArea]);

  // Publish presence with current selection state
  useEffect(() => {
    if (!isLoading) {
      publishPresence({
        selectionArea: selectionArea || undefined,
        selectedIds: Array.from(selectedStickerIds),
      });
    }
  }, [isLoading, publishPresence, selectionArea, selectedStickerIds]);

  // Merge remote selected sticker ids from peers
  useEffect(() => {
    const merged = new Set<string>(
      Object.values(peers).flatMap((peer: any) => peer.selectedIds || []),
    );
    setRemoteSelectedStickerIds((prev) => {
      const hasAdded = Array.from(merged).some((id) => !prev.has(id));
      const hasRemoved = Array.from(prev).some((id) => !merged.has(id));
      return hasAdded || hasRemoved ? merged : prev;
    });
  }, [peers]);

  const hasPeers = Object.keys(peers).length > 0;

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Canvas with Instant Presence</h2>
      <div
        ref={canvasRef}
        className="overflow-hidden w-full h-[50vh] bg-[#333] relative select-none"
      >
        {stickers.map((sticker) => {
          const isSelected = selectedStickerIds.has(sticker.id);
          const isRemoteSelected = remoteSelectedStickerIds.has(sticker.id);
          return (
            <div
              key={sticker.id}
              className={`absolute bg-[#663399] ${
                isSelected
                  ? 'outline outline-4 outline-[#2972f6]'
                  : isRemoteSelected
                    ? 'outline outline-4 outline-white'
                    : ''
              }`}
              style={{
                width: sticker.width,
                height: sticker.height,
                transform: `translate(${sticker.x}px, ${sticker.y}px)`,
              }}
            />
          );
        })}
        {selectionArea && <SelectionArea area={selectionArea} />}
        {hasPeers &&
          Object.values(peers).map((peer: any) => (
            <SelectionArea
              key={peer.peerId}
              area={peer.selectionArea}
              color={stringToHslColor(peer.peerId)}
            />
          ))}
      </div>
      <div className="flex">
        <div className="flex-1">
          <p>
            <strong>Me</strong>
          </p>
          <pre>{JSON.stringify(user?.selectedIds, null, 2)}</pre>
        </div>
        <div className="flex-1">
          {hasPeers ? (
            Object.values(peers).map((peer) => {
              return (
                <div key={peer.peerId}>
                  <p>
                    <strong>Peer</strong>
                  </p>
                  <pre>{JSON.stringify(peer?.selectedIds, null, 2)}</pre>
                </div>
              );
            })
          ) : (
            <pre className="text-center mb-4">
              No peers connected, open a second window
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------
// Main App Component
// ---------------------------------------------------------------------
const App: FC = () => {
  return (
    <div>
      <Canvas />
    </div>
  );
};

export default App;
