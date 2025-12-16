import React from 'react';
import { id, InstantReactWebDatabase } from '@instantdb/react';
import { useState } from 'react';
import { DBAttr } from '@lib/types';
import { ActionButton, ActionForm, TextInput } from '../ui';

export function NewNamespaceDialog({
  db,
  onClose,
}: {
  db: InstantReactWebDatabase<any>;
  onClose: (p?: { id: string; name: string }) => void;
}) {
  const [name, setName] = useState('');

  async function onSubmit() {
    const idAttr: DBAttr = {
      id: id(),
      'forward-identity': [id(), name, 'id'],
      'value-type': 'blob',
      cardinality: 'one',
      'unique?': true,
      'index?': false,
    };

    const ops = [['add-attr', idAttr]];
    await db.core._reactor.pushOps(ops);
    onClose({ id: idAttr.id, name });
  }

  return (
    <ActionForm className="flex flex-col gap-4">
      <h5 className="flex items-center text-lg font-bold">
        Create a new namespace
      </h5>

      <TextInput
        value={name}
        placeholder="Name your namespace"
        onChange={(n) => setName(n)}
        autoFocus
      />

      <ActionButton
        type="submit"
        label="Create"
        submitLabel="Creating..."
        errorMessage="Failed to create namespace"
        disabled={!name}
        onClick={onSubmit}
      />
    </ActionForm>
  );
}
