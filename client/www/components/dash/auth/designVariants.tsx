// TEMPORARY design-review tool. Lets us flip between Auth design variants live
// in the dashboard while we decide on a direction. The choices live in the URL
// so they persist across the landing -> create -> detail flow. Delete this file
// (and its usages) once we settle on a design.
import { encode } from 'querystring';
import clsx from 'clsx';
import { useReadyRouter } from '../../clientOnlyPage';

export type TypeVariant = 'select' | 'segments' | 'tiles';
export type AfterCreateVariant = 'detail' | 'list';

const TYPE_VARIANTS: TypeVariant[] = ['select', 'segments', 'tiles'];
const AFTER_VARIANTS: AfterCreateVariant[] = ['detail', 'list'];

export function useTypeVariant(): TypeVariant {
  const router = useReadyRouter();
  const v = router.query.dvType;
  return TYPE_VARIANTS.includes(v as TypeVariant) ? (v as TypeVariant) : 'select';
}

export function useAfterCreateVariant(): AfterCreateVariant {
  const router = useReadyRouter();
  return router.query.dvAfter === 'list' ? 'list' : 'detail';
}

function SwitcherRow({
  label,
  options,
  current,
  onPick,
}: {
  label: string;
  options: string[];
  current: string;
  onPick: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-gray-400 dark:text-neutral-500">{label}</div>
      <div className="flex gap-1">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onPick(o)}
            className={clsx(
              'rounded px-2 py-1 capitalize',
              current === o
                ? 'bg-gray-900 text-white dark:bg-white dark:text-neutral-900'
                : 'bg-gray-100 text-gray-600 dark:bg-neutral-700 dark:text-neutral-300',
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DesignVariantSwitcher() {
  const router = useReadyRouter();
  const typeVariant = useTypeVariant();
  const afterVariant = useAfterCreateVariant();

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(encode(router.query));
    params.set(key, value);
    router.replace(`${router.pathname}?${params.toString()}`);
  };

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col gap-2 rounded-md border bg-white p-3 text-xs shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
      <div className="font-bold dark:text-white">Design variants</div>
      <SwitcherRow
        label="Type control"
        options={TYPE_VARIANTS}
        current={typeVariant}
        onPick={(v) => setParam('dvType', v)}
      />
      <SwitcherRow
        label="After create"
        options={AFTER_VARIANTS}
        current={afterVariant}
        onPick={(v) => setParam('dvAfter', v)}
      />
    </div>
  );
}
