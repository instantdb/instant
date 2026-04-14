'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';

const SLIDE_W = 1200;
const SLIDE_H = 675;
const THUMB_W = 380;
const THUMB_SCALE = THUMB_W / SLIDE_W;

function SlidePreview({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-8">
      <div style={{ width: SLIDE_W, height: SLIDE_H }} className="shrink-0">
        {children}
      </div>
      <div
        className="shrink-0 overflow-hidden"
        style={{
          width: THUMB_W,
          height: SLIDE_H * THUMB_SCALE,
        }}
      >
        <div
          style={{
            width: SLIDE_W,
            height: SLIDE_H,
            transform: `scale(${THUMB_SCALE})`,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function InstantLogo() {
  return (
    <div className="flex items-center gap-3">
      <img src="/img/icon/logo-512.svg" alt="" className="h-[32px] w-[32px]" />
      <span className="font-mono text-[38px] leading-none font-semibold tracking-tight text-black lowercase">
        instant
      </span>
    </div>
  );
}

// -------------------------------------------------------------------
// Visually distinct app cards
// -------------------------------------------------------------------

function MusicPlayerCard() {
  const tracks = [
    { title: 'Hungarian Dance No. 5', artist: 'Johannes Brahms' },
    { title: 'Por Una Cabeza', artist: 'Carlos Gardel' },
    { title: 'Habanera', artist: 'Georges Bizet' },
    { title: 'La lisonjera, Op. 50', artist: 'Cécile Chaminade' },
  ];

  return (
    <div className="w-[230px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b px-3 py-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F64900] text-white">
          <svg
            className="ml-0.5 h-4 w-4"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-gray-900">
            Favorite classical
          </p>
          <div className="mt-0.5 flex items-center gap-1">
            <img
              src="/img/landing/stopa.jpg"
              className="h-4 w-4 rounded-full object-cover"
            />
            <span className="text-[10px] text-gray-500">Stopa</span>
          </div>
        </div>
      </div>
      <div className="divide-y divide-gray-50">
        {tracks.map((t, i) => (
          <div key={t.title} className="flex items-center gap-3 px-3 py-2">
            <span className="w-3 text-center text-[10px] text-gray-400">
              {i === 0 ? (
                <span className="flex items-end gap-[2px]">
                  <span className="inline-block h-[10px] w-[2.5px] rounded-sm bg-gray-900" />
                  <span className="inline-block h-[6px] w-[2.5px] rounded-sm bg-gray-900" />
                  <span className="inline-block h-[13px] w-[2.5px] rounded-sm bg-gray-900" />
                </span>
              ) : (
                i + 1
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-xs font-medium ${i === 0 ? 'text-gray-900' : 'text-gray-600'}`}
              >
                {t.title}
              </p>
              <p className="truncate text-[10px] text-gray-400">{t.artist}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BookLibraryCard() {
  return (
    <div className="w-[260px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <svg
          className="h-4 w-4 text-orange-600"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
          />
        </svg>
        <span className="text-xs font-medium text-gray-700">greatreads</span>
      </div>
      <div className="grid grid-cols-3 gap-x-2 gap-y-3 px-3 py-3">
        {[
          '/img/product-pages/storage/book-1.webp',
          '/img/product-pages/storage/book-5.webp',
          '/img/product-pages/storage/book-3.webp',
          '/img/product-pages/storage/book-4.webp',
          '/img/product-pages/storage/book-2.webp',
          '/img/product-pages/storage/book-6.webp',
        ].map((src) => (
          <img
            key={src}
            src={src}
            alt=""
            className="aspect-[2/3] w-full rounded object-cover"
          />
        ))}
      </div>
    </div>
  );
}

function CSCard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || renderedRef.current) return;
    renderedRef.current = true;

    const W = 220 * 2;
    const H = 180 * 2;

    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(W, H);
    renderer.setClearColor(0x87ceeb);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.imageRendering = 'pixelated';
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x87ceeb, 20, 60);

    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 100);
    camera.position.set(0, 1.6, 0);
    camera.lookAt(0, 1.4, -10);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.2);
    sun.position.set(5, 10, 3);
    scene.add(sun);

    const box = (w: number, h: number, d: number, color: number) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mat = new THREE.MeshLambertMaterial({ color });
      return new THREE.Mesh(geo, mat);
    };

    // Ground — patchy sandy terrain
    const ground = box(80, 0.2, 80, 0xc2a060);
    ground.position.y = -0.1;
    scene.add(ground);
    // Dirt patches on ground
    const patch1 = box(3, 0.05, 4, 0xb09050);
    patch1.position.set(-2, 0.01, -4);
    scene.add(patch1);
    const patch2 = box(5, 0.05, 3, 0xd4b878);
    patch2.position.set(2, 0.01, -7);
    scene.add(patch2);
    const patch3 = box(2, 0.05, 2, 0xa88840);
    patch3.position.set(4, 0.01, -3);
    scene.add(patch3);

    // Buildings — blocky dust2-style
    const addBuilding = (
      x: number,
      z: number,
      w: number,
      h: number,
      d: number,
      color: number,
    ) => {
      const b = box(w, h, d, color);
      b.position.set(x, h / 2, z);
      scene.add(b);
    };

    // Back row
    addBuilding(-4, -14, 3, 4.5, 3, 0xb09060);
    addBuilding(-4, -14, 2.8, 4.3, 2.8, 0xc4a870);
    addBuilding(3, -16, 2, 5.5, 2.5, 0xa08050);
    addBuilding(6, -12, 4, 3, 3, 0xb89868);
    addBuilding(-7, -18, 5, 3.5, 4, 0xb09060);
    addBuilding(0, -20, 3, 6, 2, 0xa08050);
    // Mid-distance structures
    addBuilding(-6, -8, 2, 2.5, 2, 0xc4a870);
    addBuilding(5, -9, 1.5, 3, 4, 0xb09060);

    // Archway / doorframe
    const doorL = box(0.5, 3, 0.5, 0xa08050);
    doorL.position.set(1.5, 1.5, -8);
    scene.add(doorL);
    const doorR = box(0.5, 3, 0.5, 0xa08050);
    doorR.position.set(3.5, 1.5, -8);
    scene.add(doorR);
    const lintel = box(2.5, 0.4, 0.5, 0xb89868);
    lintel.position.set(2.5, 3.1, -8);
    scene.add(lintel);

    // Crates — scattered
    const crate1 = box(0.8, 0.8, 0.8, 0x8b6914);
    crate1.position.set(-2, 0.4, -3.5);
    crate1.rotation.y = 0.3;
    scene.add(crate1);
    const crate2 = box(0.6, 0.6, 0.6, 0xa07d1a);
    crate2.position.set(-1.6, 0.3, -3);
    crate2.rotation.y = -0.5;
    scene.add(crate2);
    const crate3 = box(0.7, 0.7, 0.7, 0x8b6914);
    crate3.position.set(4, 0.35, -6);
    scene.add(crate3);
    // Stacked crates
    const crate4 = box(0.8, 0.8, 0.8, 0xa07d1a);
    crate4.position.set(-2, 1.2, -3.5);
    crate4.rotation.y = 0.1;
    scene.add(crate4);

    // Wall segments
    const wall = box(6, 2, 0.4, 0xb09060);
    wall.position.set(-5, 1, -8);
    wall.rotation.y = 0.4;
    scene.add(wall);
    const wall2 = box(3, 1.5, 0.3, 0xc4a870);
    wall2.position.set(6, 0.75, -7);
    wall2.rotation.y = -0.2;
    scene.add(wall2);

    // Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 8);
    const barrelMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.set(1, 0.45, -3);
    scene.add(barrel);

    // Small rubble blocks
    const rubble1 = box(0.3, 0.2, 0.3, 0x999080);
    rubble1.position.set(-3, 0.1, -6);
    rubble1.rotation.y = 0.8;
    scene.add(rubble1);
    const rubble2 = box(0.2, 0.15, 0.4, 0x8a8070);
    rubble2.position.set(2, 0.08, -4);
    rubble2.rotation.y = -0.3;
    scene.add(rubble2);

    // Enemy figure — blocky voxel person
    const enemy = new THREE.Group();
    const head = box(0.45, 0.45, 0.45, 0xd4a574);
    head.position.y = 1.85;
    enemy.add(head);
    const body = box(0.5, 0.7, 0.35, 0x8b0000);
    body.position.y = 1.35;
    enemy.add(body);
    const legL = box(0.2, 0.6, 0.25, 0x2c2c2c);
    legL.position.set(-0.12, 0.7, 0);
    enemy.add(legL);
    const legR = box(0.2, 0.6, 0.25, 0x2c2c2c);
    legR.position.set(0.12, 0.7, 0);
    enemy.add(legR);
    const gun = box(0.5, 0.1, 0.1, 0x444444);
    gun.position.set(0.45, 1.3, -0.1);
    enemy.add(gun);
    enemy.position.set(0.5, 0, -5);
    scene.add(enemy);

    // First-person gun (attached to camera space)
    const fpGun = new THREE.Group();
    const gunBody = box(0.15, 0.12, 0.6, 0x3c3c3c);
    gunBody.position.set(0, 0, -0.2);
    fpGun.add(gunBody);
    const gunBarrel = box(0.08, 0.08, 0.4, 0x333333);
    gunBarrel.position.set(0, 0.03, -0.55);
    fpGun.add(gunBarrel);
    const gunHandle = box(0.1, 0.18, 0.12, 0x3c3c3c);
    gunHandle.position.set(0, -0.1, -0.05);
    fpGun.add(gunHandle);
    const hand = box(0.14, 0.16, 0.16, 0xd4a574);
    hand.position.set(0, -0.06, 0.05);
    fpGun.add(hand);
    fpGun.position.set(0.35, -0.3, -0.5);
    fpGun.rotation.set(0, 0, 0);
    camera.add(fpGun);
    scene.add(camera);

    renderer.render(scene, camera);

    return () => {
      renderer.dispose();
      if (el.contains(renderer.domElement)) {
        el.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="w-[220px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b bg-gray-900 px-3 py-2">
        <span className="text-xs font-semibold text-white">de_block_2</span>
      </div>

      {/* Three.js viewport */}
      <div className="relative" style={{ height: 180 }}>
        <div ref={containerRef} className="h-full w-full" />

        {/* Crosshair overlay */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="absolute -top-[8px] left-1/2 h-[6px] w-[2px] -translate-x-1/2 bg-green-400"
            style={{ top: 'calc(50% - 8px)' }}
          />
          <div
            className="absolute left-1/2 h-[6px] w-[2px] -translate-x-1/2 bg-green-400"
            style={{ top: 'calc(50% + 3px)' }}
          />
          <div
            className="absolute top-1/2 h-[2px] w-[6px] -translate-y-1/2 bg-green-400"
            style={{ left: 'calc(50% - 9px)' }}
          />
          <div
            className="absolute top-1/2 h-[2px] w-[6px] -translate-y-1/2 bg-green-400"
            style={{ left: 'calc(50% + 4px)' }}
          />
        </div>
      </div>
    </div>
  );
}

function ChatCard() {
  const messages = [
    {
      name: 'Alice',
      avatar: '/img/landing/drew.jpg',
      text: 'Hey, did you see the new deploy?',
      time: '2m',
    },
    {
      name: 'Bob',
      avatar: '/img/landing/joe.jpg',
      text: 'Yeah it looks great!',
      time: '1m',
    },
    {
      name: 'Alice',
      avatar: '/img/landing/drew.jpg',
      text: 'Ship it 🚀',
      time: 'now',
    },
  ];

  return (
    <div className="w-[230px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <span className="text-sm font-bold text-orange-500">#</span>
        <span className="text-xs font-semibold text-gray-900">general</span>
        <span className="ml-auto text-[10px] text-gray-400">3 online</span>
      </div>
      <div className="space-y-2.5 p-3">
        {messages.map((m, i) => (
          <div key={i} className="flex gap-2">
            <img
              src={m.avatar}
              alt={m.name}
              className="h-5 w-5 shrink-0 rounded-full object-cover"
            />
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] font-semibold text-gray-900">
                  {m.name}
                </span>
                <span className="text-[9px] text-gray-400">{m.time}</span>
              </div>
              <p className="text-[11px] leading-snug text-gray-600">{m.text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t px-3 py-2">
        <div className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[10px] text-gray-400">
          Message #general
        </div>
      </div>
    </div>
  );
}

function TodoCard() {
  const tasks = [
    { text: 'Review PR #42', done: true },
    { text: 'Deploy to staging', done: false },
    { text: 'Update docs', done: false },
    { text: 'Ship v2', done: false },
  ];

  return (
    <div className="w-[200px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <span className="text-xs font-semibold text-gray-900">Team Todos</span>
        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[9px] font-medium text-orange-700">
          4 tasks
        </span>
      </div>
      <div className="divide-y divide-gray-50 px-3">
        {tasks.map((t) => (
          <div key={t.text} className="flex items-center gap-2.5 py-2">
            <div
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 ${
                t.done ? 'border-orange-600 bg-orange-600' : 'border-gray-300'
              }`}
            >
              {t.done && (
                <svg
                  className="h-2.5 w-2.5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={3}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m4.5 12.75 6 6 9-13.5"
                  />
                </svg>
              )}
            </div>
            <span
              className={`text-xs ${t.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}
            >
              {t.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Variation A: Centered — scattered real app demos
// -------------------------------------------------------------------

function SlideA() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          top: '40%',
          left: '50%',
          width: 1100,
          height: 500,
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(ellipse at center, rgba(242,150,80,0.2) 0%, rgba(242,150,80,0.06) 50%, transparent 80%)',
        }}
      />

      <div className="relative z-10 flex h-full w-full flex-col items-center px-12 pt-10">
        <h2 className="text-center text-[72px] leading-[1.2] font-normal tracking-tight">
          Create <span className="text-orange-600">unlimited</span> apps
        </h2>
        <p className="mt-3 max-w-2xl text-center text-2xl text-gray-500">
          Spin up as many backends as you have ideas. We never freeze them, and
          creating one takes milliseconds.
        </p>

        {/* Scattered app demos */}
        <div className="relative mt-6 flex items-start gap-5">
          <div style={{ transform: 'rotate(-3deg) translateY(12px)' }}>
            <MusicPlayerCard />
          </div>
          <div style={{ transform: 'rotate(1.5deg) translateY(-6px)' }}>
            <BookLibraryCard />
          </div>
          <div style={{ transform: 'rotate(-1deg) translateY(18px)' }}>
            <CSCard />
          </div>
          <div style={{ transform: 'rotate(2deg) translateY(4px)' }}>
            <ChatCard />
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Variation B: Split — headline left, overlapping cards right
// -------------------------------------------------------------------

function SlideB() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          top: '45%',
          left: '35%',
          width: 800,
          height: 500,
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(ellipse at center, rgba(242,150,80,0.18) 0%, rgba(242,150,80,0.05) 50%, transparent 80%)',
        }}
      />

      <div className="relative z-10 flex h-full w-full">
        {/* Left — text */}
        <div className="flex w-[45%] flex-col justify-center pr-8 pl-16">
          <h2 className="text-[72px] leading-[1.15] font-normal tracking-tight">
            <span className="text-orange-600">Unlimited</span>
            <br />
            apps
          </h2>
          <p className="mt-6 max-w-md text-xl text-gray-500">
            No VMs, no cold starts, no freezing. Each app is just a few rows in
            a multi-tenant database. Create one in milliseconds.
          </p>
        </div>

        {/* Right — overlapping cards */}
        <div className="relative flex w-[55%] items-center justify-center">
          <div
            className="absolute"
            style={{ top: 40, left: 20, transform: 'rotate(-2deg)' }}
          >
            <MusicPlayerCard />
          </div>
          <div
            className="absolute"
            style={{ top: 30, right: 30, transform: 'rotate(2deg)' }}
          >
            <BookLibraryCard />
          </div>
          <div
            className="absolute"
            style={{ bottom: 60, left: 60, transform: 'rotate(1deg)' }}
          >
            <TodoCard />
          </div>
          <div
            className="absolute"
            style={{ bottom: 40, right: 60, transform: 'rotate(-1.5deg)' }}
          >
            <CSCard />
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Variation C: Centered — five cards fanned out like a hand of cards
// -------------------------------------------------------------------

function SlideCContent() {
  return (
    <div className="relative z-10 flex h-full w-full flex-col items-center px-12 pt-10">
      <h2 className="text-center text-[72px] leading-[1.2] font-normal tracking-tight">
        Create <span className="text-orange-600">unlimited</span> apps
      </h2>
      <p className="mt-3 max-w-2xl text-center text-2xl text-gray-500">
        Spin up as many backends as you have ideas. We never freeze them, and
        creating one takes milliseconds.
      </p>

      {/* Five cards fanned out with trailing mini cards */}
      <div
        className="relative mt-6 flex items-end justify-center"
        style={{ width: 1100, height: 340, perspective: '800px' }}
      >
        {/* Left trailing mini cards — tightly stacked behind TodoCard */}
        {leftMiniApps.map((MiniComponent, i) => (
          <div
            key={`left-${i}`}
            className="absolute"
            style={{
              left: 50 - (i + 1) * 30,
              bottom: -(i + 1) * 6,
              transform: `rotate(${-6 - (i + 1) * 1.5}deg) scale(${0.85 - (i + 1) * 0.06}) rotateX(${25 + (i + 1) * 8}deg)`,
              transformOrigin: 'bottom center',
              zIndex: -(i + 1),
            }}
          >
            <MiniComponent />
          </div>
        ))}

        {/* Real app cards */}
        <div
          className="absolute"
          style={{
            left: 50,
            bottom: 0,
            transform: 'rotate(-6deg) rotateX(25deg)',
            transformOrigin: 'bottom center',
          }}
        >
          <TodoCard />
        </div>
        <div
          className="absolute"
          style={{
            left: 220,
            bottom: 10,
            transform: 'rotate(-2.5deg) rotateX(15deg)',
            transformOrigin: 'bottom center',
          }}
        >
          <MusicPlayerCard />
        </div>
        <div
          className="absolute"
          style={{
            left: '50%',
            bottom: 16,
            transform: 'translateX(-50%) rotateX(15deg)',
            transformOrigin: 'bottom center',
            zIndex: 2,
          }}
        >
          <BookLibraryCard />
        </div>
        <div
          className="absolute"
          style={{
            right: 220,
            bottom: 10,
            transform: 'rotate(2.5deg) rotateX(15deg)',
            transformOrigin: 'bottom center',
            zIndex: 1,
          }}
        >
          <ChatCard />
        </div>
        <div
          className="absolute"
          style={{
            right: 50,
            bottom: 0,
            transform: 'rotate(6deg) rotateX(25deg)',
            transformOrigin: 'bottom center',
            zIndex: 0,
          }}
        >
          <CSCard />
        </div>

        {/* Right trailing mini cards — tightly stacked behind CSCard */}
        {rightMiniApps.map((MiniComponent, i) => (
          <div
            key={`right-${i}`}
            className="absolute"
            style={{
              right: 50 - (i + 1) * 30,
              bottom: -(i + 1) * 6,
              transform: `rotate(${6 + (i + 1) * 1.5}deg) scale(${0.85 - (i + 1) * 0.06}) rotateX(${25 + (i + 1) * 8}deg)`,
              transformOrigin: 'bottom center',
              zIndex: -(i + 1),
            }}
          >
            <MiniComponent />
          </div>
        ))}
      </div>
    </div>
  );
}

function SlideC() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          top: '40%',
          left: '50%',
          width: 1100,
          height: 500,
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(ellipse at center, rgba(242,150,80,0.2) 0%, rgba(242,150,80,0.06) 50%, transparent 80%)',
        }}
      />
      <SlideCContent />
    </div>
  );
}

{
  /* C1: Perspective grid floor — like the cards are sitting on an infinite
    tiled surface that vanishes to a horizon point */
}
function SlideC1() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#F5F3EF]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      {/* Perspective grid floor */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{
          height: '55%',
          perspective: '600px',
          perspectiveOrigin: '50% 0%',
        }}
      >
        <div
          className="h-full w-full"
          style={{
            transform: 'rotateX(55deg)',
            transformOrigin: 'top center',
            backgroundImage:
              'linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)',
            backgroundSize: '50px 50px',
          }}
        />
      </div>
      {/* Warm top glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[50%]"
        style={{
          background:
            'linear-gradient(to bottom, rgba(242,150,80,0.1) 0%, transparent 100%)',
        }}
      />
      {/* Horizon fade */}
      <div
        className="pointer-events-none absolute inset-x-0"
        style={{
          top: '45%',
          height: '15%',
          background: 'linear-gradient(to bottom, #F5F3EF, transparent)',
        }}
      />
      <SlideCContent />
    </div>
  );
}

{
  /* C2: Depth fog — darker at the edges/back, bright center spotlight
    creating a stage/showroom feel */
}
function SlideC2() {
  return (
    <div
      className="relative flex overflow-hidden"
      style={{
        width: SLIDE_W,
        height: SLIDE_H,
        background:
          'linear-gradient(to bottom, #F8F6F2 0%, #EDE8E0 60%, #DDD5C8 100%)',
      }}
    >
      {/* Center spotlight */}
      <div
        className="pointer-events-none absolute"
        style={{
          top: '30%',
          left: '50%',
          width: 800,
          height: 600,
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(ellipse at center, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.3) 40%, transparent 70%)',
        }}
      />
      {/* Vignette — darkens edges for depth */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.06) 100%)',
        }}
      />
      {/* Bottom shadow/floor gradient */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%]"
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.05) 0%, transparent 100%)',
        }}
      />
      <SlideCContent />
    </div>
  );
}

// -------------------------------------------------------------------
// Visually distinct mini apps — each looks like a different app type
// -------------------------------------------------------------------

const MINI_W = 190;
const MINI_H = 220;

function MiniShell({ children, bg }: { children: ReactNode; bg?: string }) {
  return (
    <div
      className="flex shrink-0 flex-col overflow-hidden rounded-lg border border-gray-200 shadow-md"
      style={{
        width: MINI_W,
        height: MINI_H,
        backgroundColor: bg || '#f9fafb',
      }}
    >
      {children}
    </div>
  );
}

// Drawing canvas app
function MiniDrawing() {
  return (
    <MiniShell bg="#fff">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 border-b border-gray-100 px-2 py-1.5">
        <div className="h-3 w-3 rounded-sm bg-red-300" />
        <div className="h-3 w-3 rounded-sm bg-blue-300" />
        <div className="h-3 w-3 rounded-sm bg-yellow-300" />
        <div className="h-3 w-3 rounded-sm bg-green-300" />
        <div className="ml-auto h-3 w-3 rounded-full border border-gray-300" />
      </div>
      <div className="flex-1 p-2">
        <svg viewBox="0 0 140 170" className="h-full w-full">
          <circle cx="35" cy="30" r="18" fill="#FECACA" />
          <rect x="70" y="10" width="45" height="35" rx="4" fill="#BFDBFE" />
          <path
            d="M8 85 L45 55 L75 75 L120 45"
            stroke="#86EFAC"
            strokeWidth="3"
            fill="none"
          />
          <polygon points="15,125 42,88 70,125" fill="#FDE68A" />
          <rect x="78" y="92" width="40" height="28" rx="3" fill="#DDD6FE" />
          <circle cx="28" cy="150" r="12" fill="#FBCFE8" />
          <rect x="55" y="135" width="55" height="20" rx="3" fill="#FED7AA" />
          <ellipse cx="105" cy="160" rx="20" ry="10" fill="#A5F3FC" />
        </svg>
      </div>
    </MiniShell>
  );
}

// Calendar grid
function MiniCalendar() {
  return (
    <MiniShell>
      <div className="bg-blue-500 px-3 py-1.5 text-[10px] font-semibold text-white">
        April 2026
      </div>
      <div className="grid grid-cols-7 gap-px p-2">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} className="text-center text-[7px] text-gray-400">
            {d}
          </div>
        ))}
        {Array.from({ length: 35 }, (_, i) => {
          const day = i - 2; // offset so month starts on a Wednesday
          const valid = day >= 0 && day < 30;
          return (
            <div
              key={i}
              className={`flex h-[16px] items-center justify-center rounded-sm text-[8px] ${
                !valid
                  ? ''
                  : day === 13
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-500'
              } ${valid && [3, 8, 17, 22, 27].includes(day) ? 'bg-blue-50' : ''}`}
            >
              {valid ? day + 1 : ''}
            </div>
          );
        })}
      </div>
      {/* Events below */}
      <div className="space-y-1.5 border-t border-gray-100 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-blue-500" />
          <div className="h-[4px] w-16 rounded-full bg-gray-300" />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <div className="h-[4px] w-12 rounded-full bg-gray-200" />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-amber-500" />
          <div className="h-[4px] w-20 rounded-full bg-gray-200" />
        </div>
      </div>
    </MiniShell>
  );
}

// Dashboard with bar chart
function MiniDashboard() {
  const bars = [40, 65, 30, 80, 55, 45, 70];
  return (
    <MiniShell>
      <div className="bg-indigo-500 px-3 py-1.5 text-[10px] font-semibold text-white">
        Analytics
      </div>
      <div className="flex flex-1 items-end justify-center gap-2 px-4 pt-3 pb-2">
        {bars.map((h, i) => (
          <div
            key={i}
            className="w-3 rounded-t-sm bg-indigo-400"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between border-t border-gray-100 px-4 py-2">
        <div className="h-[5px] w-10 rounded-full bg-gray-200" />
        <div className="h-[5px] w-8 rounded-full bg-gray-100" />
      </div>
    </MiniShell>
  );
}

// Map app
function MiniMap() {
  return (
    <MiniShell>
      <div className="relative h-full" style={{ background: '#E8F5E9' }}>
        {/* Roads */}
        <div className="absolute top-0 bottom-0 left-[40%] w-[8px] bg-white/80" />
        <div className="absolute top-[35%] right-0 left-0 h-[6px] bg-white/80" />
        <div
          className="absolute top-[65%] right-0 left-0 h-[5px] bg-white/70"
          style={{ transform: 'rotate(-8deg)' }}
        />
        {/* Buildings */}
        <div className="absolute top-[15%] left-[10%] h-5 w-7 rounded-sm bg-gray-300" />
        <div className="absolute top-[45%] left-[55%] h-6 w-8 rounded-sm bg-gray-300" />
        <div className="absolute top-[20%] left-[60%] h-4 w-5 rounded-sm bg-gray-300" />
        <div className="absolute top-[70%] left-[15%] h-5 w-9 rounded-sm bg-gray-300" />
        {/* Pin */}
        <div className="absolute top-[28%] left-[52%]">
          <div className="h-3 w-3 rounded-full border-2 border-white bg-red-500 shadow" />
        </div>
      </div>
    </MiniShell>
  );
}

// Email inbox
function MiniEmail() {
  return (
    <MiniShell>
      <div className="bg-rose-500 px-3 py-1.5 text-[10px] font-semibold text-white">
        Inbox
      </div>
      <div className="flex-1 divide-y divide-gray-100">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-2">
            <div className="h-4 w-4 shrink-0 rounded-full bg-gray-200" />
            <div className="flex-1 space-y-1">
              <div
                className="h-[5px] rounded-full bg-gray-300"
                style={{ width: `${50 + i * 8}%` }}
              />
              <div
                className="h-[4px] rounded-full bg-gray-100"
                style={{ width: `${70 - i * 5}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </MiniShell>
  );
}

// Kanban board
function MiniKanban() {
  return (
    <MiniShell>
      <div className="bg-amber-500 px-3 py-1.5 text-[10px] font-semibold text-white">
        Board
      </div>
      <div className="flex flex-1 gap-1.5 p-2">
        {[4, 3, 5].map((n, col) => (
          <div key={col} className="flex-1 space-y-1">
            <div className="h-[4px] w-full rounded-full bg-gray-300" />
            {Array.from({ length: n }, (_, i) => (
              <div
                key={i}
                className="rounded border border-gray-200 bg-white p-1"
              >
                <div className="h-[4px] w-[80%] rounded-full bg-gray-200" />
                <div className="mt-0.5 h-[3px] w-[50%] rounded-full bg-gray-100" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </MiniShell>
  );
}

// Photo grid
function MiniPhotoGrid() {
  const colors = [
    '#FECACA',
    '#BFDBFE',
    '#FDE68A',
    '#BBF7D0',
    '#DDD6FE',
    '#FBCFE8',
    '#FED7AA',
    '#A5F3FC',
    '#E9D5FF',
  ];
  return (
    <MiniShell>
      <div className="grid grid-cols-3 gap-px bg-gray-100 p-0">
        {colors.map((c, i) => (
          <div
            key={i}
            className="aspect-square"
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1.5 px-3 py-2">
        <div className="h-3 w-3 rounded-full bg-gray-200" />
        <div className="h-[4px] w-12 rounded-full bg-gray-200" />
      </div>
    </MiniShell>
  );
}

// Spreadsheet
function MiniSpreadsheet() {
  return (
    <MiniShell>
      <div className="bg-green-600 px-3 py-1.5 text-[10px] font-semibold text-white">
        Sheet
      </div>
      <div className="flex-1 p-0">
        {Array.from({ length: 10 }, (_, row) => (
          <div key={row} className="flex border-b border-gray-100">
            {Array.from({ length: 4 }, (_, col) => (
              <div
                key={col}
                className={`flex-1 border-r border-gray-100 px-1.5 py-1 ${
                  row === 0
                    ? 'bg-gray-50 text-[7px] font-medium text-gray-400'
                    : ''
                }`}
              >
                {row === 0 ? (
                  ['A', 'B', 'C', 'D'][col]
                ) : (
                  <div
                    className="h-[4px] rounded-full bg-gray-200"
                    style={{ width: `${40 + (((row + col) * 13) % 50)}%` }}
                  />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </MiniShell>
  );
}

// Video player
function MiniVideo() {
  return (
    <MiniShell>
      <div className="relative flex flex-1 items-center justify-center bg-gray-900">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
          <svg
            className="ml-0.5 h-4 w-4 text-white"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        <div className="absolute right-0 bottom-2 left-0 px-3">
          <div className="h-1 rounded-full bg-white/20">
            <div className="h-1 w-[35%] rounded-full bg-red-500" />
          </div>
        </div>
      </div>
      <div className="space-y-1 px-3 py-2">
        <div className="h-[5px] w-[80%] rounded-full bg-gray-300" />
        <div className="h-[4px] w-[50%] rounded-full bg-gray-200" />
      </div>
    </MiniShell>
  );
}

// Weather app
function MiniWeather() {
  return (
    <MiniShell>
      <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-sky-400 to-sky-200 px-3 py-4 text-white">
        <svg className="h-10 w-10" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="5" fill="#FDE68A" />
          <path
            d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
            stroke="#FDE68A"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <div className="mt-2 text-2xl font-bold">72°</div>
        <div className="mt-1 text-[9px] opacity-80">San Francisco</div>
        <div className="mt-3 flex w-full justify-between text-[8px] opacity-70">
          <span>Mon 68°</span>
          <span>Tue 71°</span>
          <span>Wed 74°</span>
        </div>
      </div>
    </MiniShell>
  );
}

// Fitness tracker
function MiniFitness() {
  return (
    <MiniShell>
      <div className="bg-orange-500 px-3 py-1.5 text-[10px] font-semibold text-white">
        Activity
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4">
        <svg viewBox="0 0 60 60" className="h-16 w-16">
          <circle
            cx="30"
            cy="30"
            r="26"
            fill="none"
            stroke="#FED7AA"
            strokeWidth="5"
          />
          <circle
            cx="30"
            cy="30"
            r="26"
            fill="none"
            stroke="#F97316"
            strokeWidth="5"
            strokeDasharray="163"
            strokeDashoffset="45"
            strokeLinecap="round"
            transform="rotate(-90 30 30)"
          />
          <circle
            cx="30"
            cy="30"
            r="18"
            fill="none"
            stroke="#D1FAE5"
            strokeWidth="4"
          />
          <circle
            cx="30"
            cy="30"
            r="18"
            fill="none"
            stroke="#10B981"
            strokeWidth="4"
            strokeDasharray="113"
            strokeDashoffset="40"
            strokeLinecap="round"
            transform="rotate(-90 30 30)"
          />
        </svg>
        <div className="flex w-full justify-between text-[8px] text-gray-400">
          <span>6,240 steps</span>
          <span>320 cal</span>
        </div>
      </div>
    </MiniShell>
  );
}

// Notes app
function MiniNotes() {
  return (
    <MiniShell>
      <div className="bg-yellow-500 px-3 py-1.5 text-[10px] font-semibold text-white">
        Notes
      </div>
      <div
        className="p-3"
        style={{
          background:
            'repeating-linear-gradient(transparent, transparent 16px, #E5E7EB 16px, #E5E7EB 17px)',
        }}
      >
        <div className="space-y-[13px] pt-1">
          <div className="h-[4px] w-[90%] rounded-full bg-gray-300" />
          <div className="h-[4px] w-[75%] rounded-full bg-gray-300" />
          <div className="h-[4px] w-[85%] rounded-full bg-gray-300" />
          <div className="h-[4px] w-[60%] rounded-full bg-gray-300" />
          <div className="h-[4px] w-[70%] rounded-full bg-gray-300" />
          <div className="h-[4px] w-[40%] rounded-full bg-gray-300" />
        </div>
      </div>
    </MiniShell>
  );
}

const leftMiniApps = [
  MiniDrawing,
  MiniCalendar,
  MiniDashboard,
  MiniMap,
  MiniEmail,
  MiniKanban,
];
const rightMiniApps = [
  MiniPhotoGrid,
  MiniSpreadsheet,
  MiniVideo,
  MiniWeather,
  MiniFitness,
  MiniNotes,
];

// -------------------------------------------------------------------
// Variation D: Infinite perspective — rows of apps vanishing into distance
// -------------------------------------------------------------------

export function SlideD() {
  const rows = [
    { scale: 1, opacity: 1, y: 0 },
    { scale: 0.72, opacity: 0.7, y: 0 },
    { scale: 0.52, opacity: 0.45, y: 0 },
    { scale: 0.38, opacity: 0.25, y: 0 },
    { scale: 0.28, opacity: 0.12, y: 0 },
  ];

  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          top: '40%',
          left: '50%',
          width: 1100,
          height: 500,
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(ellipse at center, rgba(242,150,80,0.2) 0%, rgba(242,150,80,0.06) 50%, transparent 80%)',
        }}
      />

      <div className="relative z-10 flex h-full w-full flex-col items-center px-12 pt-10">
        <h2 className="text-center text-[72px] leading-[1.2] font-normal tracking-tight">
          Create <span className="text-orange-600">unlimited</span> apps
        </h2>
        <p className="mt-3 max-w-2xl text-center text-2xl text-gray-500">
          Spin up as many backends as you have ideas. We never freeze them, and
          creating one takes milliseconds.
        </p>

        {/* 5 stacked pairs on a perspective plane, staggered vertically */}
        {(() => {
          const cards = [
            MusicPlayerCard,
            BookLibraryCard,
            CSCard,
            ChatCard,
            TodoCard,
          ] as const;
          const allMinis = [...leftMiniApps, ...rightMiniApps];
          // Vertical offsets: outer cards float higher, center sits lower
          const yOffsets = [30, -10, -30, -10, 30];
          // Slight scale variation for depth
          const scales = [0.7, 0.73, 0.78, 0.73, 0.7];
          // Slight rotation variation
          const rotations = [22, 18, 15, 18, 22];

          return (
            <div
              className="mt-6 flex items-start justify-center gap-5"
              style={{ perspective: '800px' }}
            >
              {cards.map((Card, ci) => {
                const M = allMinis[ci];
                return (
                  <div
                    key={ci}
                    className="relative"
                    style={{
                      transform: `scale(${scales[ci]}) rotateX(${rotations[ci]}deg) translateY(${yOffsets[ci]}px)`,
                      transformOrigin: 'bottom center',
                    }}
                  >
                    <div
                      className="absolute left-1/2 -translate-x-1/2"
                      style={{ bottom: -50, zIndex: -1 }}
                    >
                      <M />
                    </div>
                    <Card />
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Page
// -------------------------------------------------------------------

export default function Slide5Page() {
  return (
    <div className="flex min-h-screen flex-col items-start gap-16 bg-gray-100 p-12">
      <h1 className="text-2xl font-medium text-gray-500">
        Slide 5 — 4 Variations
      </h1>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">
          A — Scattered app demos
        </p>
        <SlidePreview>
          <SlideA />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">
          B — Split layout, overlapping cards
        </p>
        <SlidePreview>
          <SlideB />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">
          C — Fanned out cards
        </p>
        <SlidePreview>
          <SlideC />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">
          C1 — Perspective grid floor
        </p>
        <SlidePreview>
          <SlideC1 />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">
          C2 — Showroom spotlight
        </p>
        <SlidePreview>
          <SlideC2 />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">
          D — Infinite perspective
        </p>
        <SlidePreview>
          <SlideD />
        </SlidePreview>
      </div>
    </div>
  );
}
