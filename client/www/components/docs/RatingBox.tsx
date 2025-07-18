import { useEffect, useRef, useState } from 'react';
import { id } from '@instantdb/react';
import db from '@/lib/intern/docs-feedback/db';
import { BlockHeading, Button, ToggleGroup } from '@/components/ui';
import { Rating } from '@/lib/intern/docs-feedback/analytics';

/**
 * A handy component to collect feedback for a particular page.
 *
 * Asks "Was this page helpful?", and lets the user
 * provide more details if they want too.
 *
 * No login required!
 */
export default function RatingBoxContainer({ pageId }: { pageId: string }) {
  const localId = db.useLocalId('feedback');

  const { isLoading, error, data } = db.useQuery(
    localId
      ? {
          ratings: {
            $: {
              where: { pageId, localId },
            },
          },
        }
      : null,
    { ruleParams: { localId } },
  );

  if (!localId || isLoading || error) return null;

  return (
    <RatingBox
      localId={localId}
      pageId={pageId}
      previousRating={data.ratings[0]}
    />
  );
}

function RatingBox({
  pageId,
  localId,
  previousRating,
}: {
  pageId: string;
  localId: string;
  previousRating?: Rating;
}) {
  // The first time you rate, let's auto-focus the 'details' textarea
  // so you can quickly add more details if you want to.
  const [shouldAutoFocus, setShouldAutoFocus] = useState(false);

  const selectedId = previousRating
    ? previousRating.wasHelpful
      ? 'yes'
      : 'no'
    : undefined;
  return (
    <div className="space-y-2">
      <div className="inline-flex space-x-4 items-center">
        <BlockHeading>Was this page helpful?</BlockHeading>
        <div className="w-20">
          <ToggleGroup
            selectedId={selectedId}
            onChange={(item) => {
              if (!previousRating) {
                setShouldAutoFocus(true);
              }
              db.transact(
                db.tx.ratings[previousRating?.id ?? id()]
                  .ruleParams({ localId })
                  .update({
                    pageId,
                    localId,
                    key: `${localId}_${pageId}`,
                    wasHelpful: 'yes' === item.id,
                    createdAt: Date.now(),
                  }),
              );
            }}
            items={[
              { id: 'yes', label: 'Yes' },
              { id: 'no', label: 'No' },
            ]}
          />
        </div>
      </div>
      {previousRating && selectedId && (
        <div className="space-y-2">
          <p>Thank you for your feedback! More details to share?</p>
          <SavingTextArea
            savedValue={previousRating.extraComment || ''}
            onSave={(extraComment) => {
              db.transact(
                db.tx.ratings[previousRating.id]
                  .ruleParams({ localId })
                  .update({ extraComment }),
              );
            }}
            placeholder="Tell us more about your experience..."
            autoFocus={shouldAutoFocus}
          />
        </div>
      )}
    </div>
  );
}

// ----------
// Components

type SavingTextAreaProps = {
  savedValue: string;
  onSave: (value: string) => void;
} & Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange' | 'onKeyDown'
>;

/**
 * A handy textarea that lets you save a value.
 * If the incoming `savedValue` changes, we'll update the textarea.
 * We'll _skip_ the update if you are focused on the input
 * and in the middle of making a change though! :)
 */
function SavingTextArea({ savedValue, onSave, ...props }: SavingTextAreaProps) {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(savedValue);
  useEffect(() => {
    const ref = textAreaRef.current!;
    const isEditing = ref === document.activeElement;
    if (isEditing) return;
    setValue(savedValue);
  }, [savedValue]);
  return (
    <div className="space-y-1">
      <textarea
        {...props}
        value={value}
        className="flex w-full flex-1 rounded-sm border-gray-200 bg-white px-3 py-1 placeholder:text-gray-400 disabled:text-gray-400"
        onChange={(e) => {
          setValue(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.metaKey) {
            onSave(value);
          }
        }}
      />
      <div className="text-right">
        <Button
          disabled={value === savedValue}
          onClick={() => {
            onSave(value);
          }}
          size="mini"
          type="submit"
        >
          {value && value === savedValue ? 'Saved!' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
