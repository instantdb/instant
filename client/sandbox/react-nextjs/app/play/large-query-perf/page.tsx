'use client';

import { init, tx } from '@instantdb/react';
import { useState, useEffect, useRef } from 'react';
import config from '../../../config';

const APP_ID = process.env.NEXT_PUBLIC_LARGE_QUERY_APP_ID!;
const db = init({
  ...config,
  appId: APP_ID,
});

export default function Home() {
  const result0 = db.useQuery({
    project: {
      profile: {
        $: {
          where: {
            trashed: false,
          },
        },
      },
      ticket__invite: {
        $: {
          where: {
            trashed: false,
          },
        },
      },
      workspace: {
        profile: {
          $: {
            where: {
              trashed: false,
            },
          },
        },
        ticket__invite: {
          $: {
            where: {
              trashed: false,
            },
          },
        },
        project: {
          $: {
            where: {
              trashed: false,
            },
          },
        },
        role__workspace__admin: {
          profile: {
            $: {
              where: {
                trashed: false,
              },
            },
          },
          $: {
            where: {
              trashed: false,
            },
          },
        },
        $: {
          where: {
            trashed: false,
          },
        },
      },
      category: {
        $: {
          where: {
            trashed: false,
          },
        },
      },
      group__category: {
        $: {
          where: {
            trashed: false,
          },
        },
      },
      role__project__admin: {
        profile: {
          $: {
            where: {
              trashed: false,
            },
          },
        },
        $: {
          where: {
            trashed: false,
          },
        },
      },
      role__project__editor: {
        profile: {
          $: {
            where: {
              trashed: false,
            },
          },
        },
        $: {
          where: {
            trashed: false,
          },
        },
      },
      list_item__category__in__project: {
        category: {
          $: {
            where: {
              trashed: false,
            },
          },
        },
        $: {
          where: {
            trashed: false,
          },
        },
      },
      list_item__group__category__in__project: {
        group__category: {
          $: {
            where: {
              trashed: false,
            },
          },
        },
        $: {
          where: {
            trashed: false,
          },
        },
      },
      $: {
        where: {
          id: '0a9d191a-6ad3-4356-9277-3da13e40ffab',
          trashed: false,
        },
      },
    },
  });

  const result1 = db.useQuery({
    category: {
      $: {
        where: {
          'project.id': '0a9d191a-6ad3-4356-9277-3da13e40ffab',
          trashed: false,
        },
      },
      asset: {
        task: {
          role__task__assignee: {
            profile: {
              $: {
                where: {
                  trashed: false,
                },
              },
            },
            $: {
              where: {
                trashed: false,
              },
            },
          },
          $: {
            where: {
              trashed: false,
            },
          },
        },
        phase: {
          $: {
            where: {
              trashed: false,
            },
          },
        },
        $: {
          where: {
            trashed: false,
          },
        },
      },
    },
  });

  const result2 = db.useQuery({
    phase: {
      $: {
        where: {
          'project.id': '0a9d191a-6ad3-4356-9277-3da13e40ffab',
          trashed: false,
        },
      },
      profile: {
        $: {
          where: {
            trashed: false,
          },
        },
      },
      task: {
        role__task__assignee: {
          profile: {
            $: {
              where: {
                trashed: false,
              },
            },
          },
          $: {
            where: {
              trashed: false,
            },
          },
        },
        $: {
          where: {
            trashed: false,
          },
        },
      },
    },
  });

  const firstTask = result2.data?.phase[0].task[0];

  const [howLong, setHowLong] = useState<number>(0);
  const [isAnimating, setIsAnimating] = useState<boolean>(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const mutateFirstTask: () => Promise<void> = async () => {
    const id = firstTask?.id;
    if (!id) {
      return;
    }
    const before = performance.now();
    db.transact(tx['task'][id].update({ updated_at: new Date().getTime() }));
    const after = performance.now();
    setHowLong(after - before);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particles: {
      x: number;
      y: number;
      size: number;
      speed: number;
      color: string;
    }[] = [];

    // Initialize particles
    for (let i = 0; i < 100; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 5 + 1,
        speed: Math.random() * 3 + 1,
        color: `hsl(${Math.random() * 360}, 50%, 50%)`,
      });
    }

    const animate = () => {
      if (!isAnimating) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((particle) => {
        particle.y += particle.speed;
        if (particle.y > canvas.height) {
          particle.y = 0;
        }

        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = particle.color;
        ctx.fill();
      });

      // Expensive operation (simulating complex calculations)
      for (let i = 0; i < 10000; i++) {
        Math.sqrt(i);
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isAnimating]);

  return (
    <div>
      <button
        onClick={mutateFirstTask}
        className="bg-blue-500 text-white p-2 rounded-md"
      >
        Update task {firstTask?.id}
      </button>
      <p>transact() took: {howLong}ms</p>

      <div className="mt-4">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={isAnimating}
            onChange={(e) => setIsAnimating(e.target.checked)}
            className="mr-2"
          />
          Enable Animation
        </label>
      </div>

      <canvas
        ref={canvasRef}
        width={800}
        height={400}
        className="border border-gray-300 mt-4"
      />

      <pre>{JSON.stringify(result0, null, 2)}</pre>
      <pre>{JSON.stringify(result1, null, 2)}</pre>
      <pre>{JSON.stringify(result2, null, 2)}</pre>
    </div>
  );
}
